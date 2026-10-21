import { describe, expect, it } from 'vitest';
import type { AccountTotals } from '../../src/core/source.js';
import { checkAccountMovements, checkAggregates, checkConservation, checkVatByRate, plausibilityFindings, type CheckOptions } from '../../src/export/index.js';
import { buildBookings, type PostingResult } from '../../src/posting/index.js';
import { ChartIndex } from '../../src/core/chart.js';
import { BSP, LIVE_DAY, LIVE_PROPERTIES, loadLiveData } from '../helpers/apaleo.js';
import { vieMapping } from '../helpers/live-mapping.js';
import { FakeSource } from '../helpers/fake-source.js';
import { BEISPIEL, CHART, EKR_MAPPING, LEDGER, OPTIONS as POSTING_OPTIONS, post } from '../helpers/posting.js';

const OPTIONS: CheckOptions = { mapping: EKR_MAPPING, chart: CHART };
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('fixture value missing');
  return value;
}

/** The fixture month's posting result with a defect applied to copies of its bookings and findings. */
function withDefect(defect: (result: PostingResult) => void): PostingResult {
  const correct = post(LEDGER);
  // The skipped lines stay the ledger's own objects: the checks match them by identity.
  const result = { ...correct, bookings: structuredClone(correct.bookings), findings: [...correct.findings] };
  defect(result);
  return result;
}

describe('plausibility checks on the fixture month', () => {
  it('find nothing in a correct posting run', () => {
    expect(plausibilityFindings(LEDGER, post(LEDGER), OPTIONS)).toEqual([]);
  });
});

describe('conservation (E-CONSERVATION)', () => {
  it('is raised when a ledger line is neither booked nor skipped', () => {
    const result = withDefect((r) => void r.bookings.splice(0, 1));
    const [finding, ...rest] = checkConservation(LEDGER, result);
    expect(rest).toEqual([]);
    expect(finding?.code).toBe('E-CONSERVATION');
    expect(finding?.message).toContain('the 29 apaleo lines move 2154.10 (absolute gross), but the 23 bookings move 1608.40 and the 5 skipped lines 325.70');
    expect(finding?.message).toContain('so 220.00 would be lost or doubled');
  });

  it('is raised when a line is booked twice', () => {
    const result = withDefect((r) => void r.bookings.push(structuredClone(must(r.bookings[0]))));
    expect(checkConservation(LEDGER, result).map((f) => f.code)).toEqual(['E-CONSERVATION']);
  });
});

/** The 98.00 logis charge of 2026-09-14: Konto 4000, Betrag -89.09, Steuer -8.91, Gegenkonto 2390. */
const logis = (r: PostingResult) => must(r.bookings.find((b) => b.businessDate === '2026-09-14' && b.konto === '4000'));

describe('account movement per day (E-ACCOUNT-BALANCE)', () => {
  it('catches a booking with a positive Betrag where the apaleo line credits the Konto account', () => {
    // The 98.00 logis charge of 2026-09-14: 4000 is credited in apaleo, so Betrag must be -89.09.
    const result = withDefect((r) => {
      const booking = logis(r);
      booking.betragCents = -booking.betragCents;
      if (booking.tax) booking.tax.steuerCents = -booking.tax.steuerCents;
    });
    const findings = checkAccountMovements(LEDGER, result, OPTIONS);
    expect(findings.map((f) => [f.code, f.value])).toEqual([
      ['E-ACCOUNT-BALANCE', '2390'],
      ['E-ACCOUNT-BALANCE', '4000'],
    ]);
    expect(findings[0]?.message).toContain('on 2026-09-14 BMD account 2390 moves -54.00 in the bookings, but the apaleo lines mapped to it move 142.00');
    expect(findings[1]?.message).toContain('on 2026-09-14 BMD account 4000 moves 89.09 in the bookings, but the apaleo lines mapped to it move -89.09 (Soll positive, Haben negative)');
  });

  it('catches swapped accounts, a lost tax and a booking on the wrong day', () => {
    const swapped = withDefect((r) => {
      const booking = logis(r);
      [booking.konto, booking.gkonto] = [booking.gkonto, booking.konto];
    });
    expect(checkAccountMovements(LEDGER, swapped, OPTIONS).map((f) => f.value)).toEqual(['2390', '4000']);
    const untaxed = withDefect((r) => void delete logis(r).tax);
    expect(checkAccountMovements(LEDGER, untaxed, OPTIONS).map((f) => f.value)).toEqual(['2390']);
    const moved = withDefect((r) => void (must(r.bookings[0]).businessDate = '2026-09-15'));
    expect(checkAccountMovements(LEDGER, moved, OPTIONS).map((f) => f.message.slice(0, 13))).toContain('on 2026-09-14');
  });
});

describe('tax per rate (E-VAT-TOTAL)', () => {
  const drinks = (r: PostingResult) => must(r.bookings.find((b) => b.konto === '4020' && b.betragCents === -2_000));

  it('compares the Steuer of the bookings with apaleo\'s per-line taxes, deposits included', () => {
    expect(checkVatByRate(LEDGER, post(LEDGER), OPTIONS)).toEqual([]);
  });

  it('is raised for 20 % when the bookings carry less tax than apaleo charged, naming both amounts and apaleo\'s precise total', () => {
    const result = withDefect((r) => void (must(drinks(r).tax).steuerCents = -398));
    const findings = checkVatByRate(LEDGER, result, OPTIONS);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '20']]);
    expect(findings[0]?.message).toContain(
      'at 20 % the bookings carry 7.65 tax, but apaleo charged 7.67 as the sum of its per-line tax rounded to cents (difference apaleo minus bookings 0.02, the rounding total allows 0.00)',
    );
    expect(findings[0]?.message).toContain("apaleo's precise total is 7.66666667; its per-line rounding (0.00333333) is no error");
  });

  it('is raised per rate when a booking carries the wrong rate', () => {
    const result = withDefect((r) => void (must(logis(r).tax).prozent = 20));
    expect(checkVatByRate(LEDGER, result, OPTIONS).map((f) => [f.code, f.value])).toEqual([
      ['E-VAT-TOTAL', '10'],
      ['E-VAT-TOTAL', '20'],
    ]);
  });

  it('allows one cent per rounding difference reported at the same rate', () => {
    const offByOne = (roundings: ReadonlyMap<number, number>) =>
      withDefect((r) => {
        r.vatRoundingByRate = roundings;
        must(drinks(r).tax).steuerCents = -401;
      });
    expect(checkVatByRate(LEDGER, offByOne(new Map([[20, 1]])), OPTIONS)).toEqual([]);
    expect(checkVatByRate(LEDGER, offByOne(new Map()), OPTIONS).map((f) => f.code)).toEqual(['E-VAT-TOTAL']);
    // Roundings at 10 % do not excuse a difference at 20 %.
    const otherRate = checkVatByRate(LEDGER, offByOne(new Map([[10, 2]])), OPTIONS);
    expect(otherRate.map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '20']]);
    expect(otherRate[0]?.message).toContain('the rounding total allows 0.00');
  });

  it('Line rounding is not an error: the recorded VIE day, where the bookings carry 7.74 at 10 % and apaleo\'s precise total is 7.74545454', async () => {
    const live = await loadLiveData();
    const lines = (live.ledger.VIE ?? []).filter((line) => line.businessDate === LIVE_DAY);
    const chart = new ChartIndex(live.charts.VIE ?? []);
    const mapping = vieMapping();
    const result = buildBookings(lines, mapping, chart, POSTING_OPTIONS);
    expect(result.summary.revenueByRate.find((r) => r.ratePercent === 10)).toMatchObject({ vatCents: 774, apaleoVat: '7.74545454' });
    expect(plausibilityFindings(lines, result, { mapping, chart })).toEqual([]);
  });
});

describe('aggregate check (W-AGGREGATE-DIFF)', () => {
  it('asks for apaleo totals once per business day and finds the fixture days matching', async () => {
    const source = new FakeSource(structuredClone(BEISPIEL));
    expect(await checkAggregates(source, BSP, { from: '2026-09-14', to: '2026-09-17' }, LEDGER, CHART)).toEqual([]);
    expect(source.calls).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((day) => `getAccountTotals BSP ${day}`));
  });

  it('warns about an account whose balance differs, naming both balances and the basis', async () => {
    const data = structuredClone(BEISPIEL);
    const day = data.totals?.[BSP]?.find((t) => t.businessDate === '2026-09-14') as AccountTotals;
    must(day.accounts.find((a) => a.account.number === 'RevenueAccommodation_VeryReduced:10.00')).balance.value = '-150.00';
    must(day.accounts.find((a) => a.account.number === '1102')).balance.value = '219.00';
    const findings = await checkAggregates(new FakeSource(data), BSP, SEPTEMBER, LEDGER, CHART);
    expect(findings.map((f) => [f.code, f.value])).toEqual([
      ['W-AGGREGATE-DIFF', '1102'],
      ['W-AGGREGATE-DIFF', 'RevenueAccommodation_VeryReduced:10.00'],
    ]);
    expect(findings[0]?.message).toBe(
      "on 2026-09-14 apaleo's daily aggregate for account 1102 (Payments) has the balance 219.00, but the ledger lines of that day " +
        'add up to 220.00 (balance debit minus credit, from the gross amounts). Compare the day in apaleo; the file is written anyway',
    );
    expect(findings[1]?.message).toContain('has the balance -150.00, but the ledger lines of that day add up to -89.09 (balance debit minus credit, from the precise net amounts)');
  });

  it('finds every account of the recorded BER and VIE days matching', async () => {
    const live = await loadLiveData();
    for (const property of LIVE_PROPERTIES) {
      const chart = new ChartIndex(live.charts[property] ?? []);
      const period = { from: '2026-10-21', to: '2026-10-22' } as const;
      expect(await checkAggregates(new FakeSource(live), property, period, live.ledger[property] ?? [], chart), property).toEqual([]);
    }
  });
});
