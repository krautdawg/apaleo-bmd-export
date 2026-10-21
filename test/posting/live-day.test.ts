import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { sumDecimals } from '../../src/core/money.js';
import { parseMapping } from '../../src/mapping/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { LIVE_DAY, loadLiveData } from '../helpers/apaleo.js';
import { VIE_NO_SHOW, VIE_TEMPLATE_MAPPING, vieMapping } from '../helpers/live-mapping.js';

/**
 * The recorded VIE business day 2026-10-21 (test/fixtures/apaleo/live/README.md)
 * posted with the committed live EKR mapping (init-mapping --template ekr), after
 * the Kanzlei filled in the one row the template leaves empty: the no-show at 13 %
 * on 4040 with Steuercode 1 (b05 design decision 7).
 * Hand-checked totals (BMD gets net Betrag and apaleo's tax as Steuer):
 *
 * Revenue 10 % (4010): 38.40 + 46.80 = 85.20; Steuer 3.49 + 4.25 = 7.74, apaleo
 *   precise 7.74545454 (7.75 rounded once).
 * Revenue 13 % (4040): 65 + 95.02 + 60 (no-show) + 105 − 10 + 95 = 410.02; Steuer
 *   7.48 + 10.93 + 6.90 + 12.08 − 1.15 + 10.93 = 47.17 (precise 47.17044248).
 * Revenue 20 % (4020): 12.50 + 19.98 + 14.90 = 47.38; Steuer 2.08 + 3.33 + 2.48 =
 *   7.89 (precise 7.89666666, 7.90 rounded once). Revenue 0 % (4091, the cancellation fee): 45.00.
 * Deposits at 13 % (3202): 83 + 65 + 188.04 + 105 − 65 − 95.02 − 105 = 176.02,
 *   Steuer 20.25; at 20 % (3201): 39.96 − 19.98 = 19.98, Steuer 3.33.
 * Deposits received 83 + 65 + 39.96 + 188.04 + 105 + 10 (parked at 0 %) = 491.00;
 *   released 65 + 19.98 + 95.02 + 105 + 10 (refund to Maestro) = 295.00, of it
 *   refunded 10.00.
 * Payments: Kassa 2700 = 50 + 61.70 = 111.70; 2890 = 83 + 45 + 65 + 39.96 + 188.04
 *   + 60 + 0.90 + 105 − 10 = 576.90.
 * Accounts receivable: 95.00 Soll on the Sammeldebitor 200000.
 * Skipped: the six /Offset second lines, 45 + 50 + 60 + 0.90 + 95 + 61.70 =
 *   312.60 unsigned. 35 − 6 = 29 bookings.
 * One W-VAT-ROUNDING: 000000031, gross 46.80, Steuer 4.25, BMD's check 42.55 × 10 % = 4.26.
 */
const data = await loadLiveData();
const lines = (data.ledger.VIE ?? []).filter((line) => line.businessDate === LIVE_DAY);
const chart = new ChartIndex(data.charts.VIE ?? []);
const options = { extbelegnr: 'receipt', dialect: 'ntcs', sachkontenlaenge: 4, buchsymbol: 'HO', buchsymbolZahlung: 'HO' } as const;
const result = buildBookings(lines, vieMapping(), chart, options);

describe('the template mapping of VIE before the Kanzlei review', () => {
  it('stops with E-UNMAPPED for the no-show at 13 %, which the template leaves empty', () => {
    const template = parseMapping(new TextEncoder().encode(VIE_TEMPLATE_MAPPING), { path: 'mapping-VIE.live.csv', sachkontenlaenge: 4 });
    const unmapped = buildBookings(lines, template, chart, options).findings.filter((f) => f.code.startsWith('E-'));
    expect(unmapped.map((f) => [f.code, f.value])).toEqual([['E-UNMAPPED', VIE_NO_SHOW]]);
    expect(unmapped[0]?.message).toContain('(1 line, gross 60.00): fill in bmd_account on line');
  });
});

describe('posting the recorded VIE day 2026-10-21', () => {
  it('books 29 of the 35 lines and skips the six /Offset second lines', () => {
    expect(lines).toHaveLength(35);
    expect(result.bookings).toHaveLength(29);
    expect(result.summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 6, grossCents: 31_260 }]);
  });

  it('raises exactly one W-VAT-ROUNDING, for 000000031, and nothing else', () => {
    expect(result.findings.map((f) => [f.code, f.value])).toEqual([['W-VAT-ROUNDING', '000000031']]);
    expect(result.findings[0]?.message).toContain('10 % of the Betrag 42.55, which is 4.26, but the booking carries apaleo\'s tax 4.25');
    const booking = result.bookings.find((b) => b.sourceEntryNumbers[0] === '000000031');
    expect(booking).toMatchObject({ konto: '4010', gkonto: '2390', betragCents: -4_255, tax: { steuercode: 1, prozent: 10, steuerCents: -425 } });
  });

  it('adds up the precise 10 % taxes exactly: 7.74545454, against 7.74 rounded per line', () => {
    const taxes = lines.filter((line) => line.credit.type === 'Revenues').flatMap((line) => line.taxes.filter((tax) => tax.percent === 10));
    expect(sumDecimals(taxes.map((tax) => tax.amountPrecise))).toBe('7.74545454');
    expect(taxes.reduce((sum, tax) => sum + tax.amountCents, 0)).toBe(774);
  });

  it('matches the hand-checked summary', () => {
    const { summary } = result;
    expect(summary.revenueByRate).toEqual([
      { ratePercent: 0, netCents: 4_500, vatCents: 0, grossCents: 4_500, apaleoVat: '0' },
      { ratePercent: 10, netCents: 7_746, vatCents: 774, grossCents: 8_520, apaleoVat: '7.74545454' },
      { ratePercent: 13, netCents: 36_285, vatCents: 4_717, grossCents: 41_002, apaleoVat: '47.17044248' },
      { ratePercent: 20, netCents: 3_949, vatCents: 789, grossCents: 4_738, apaleoVat: '7.89666666' },
    ]);
    expect(summary.depositVatByRate).toEqual([
      { ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      { ratePercent: 13, netCents: 15_577, vatCents: 2_025, grossCents: 17_602, apaleoVat: '20.2500885' },
      { ratePercent: 20, netCents: 1_665, vatCents: 333, grossCents: 1_998, apaleoVat: '3.33' },
    ]);
    expect(summary.payments).toEqual([
      { account: '2700', cents: 11_170 },
      { account: '2890', cents: 57_690 },
    ]);
    expect(summary.deposits).toEqual({ receivedCents: 49_100, releasedCents: 29_500, refundedCents: 1_000 });
    expect(summary.accountsReceivableCents).toBe(9_500);
    expect(summary.accounts.find((account) => account.account === '200000')).toEqual({ account: '200000', sollCents: 9_500, habenCents: 0, balanceCents: 9_500 });
    expect(summary.roundingCents).toBe(1);
    expect(summary.accounts.find((account) => account.account === '4091')).toEqual({ account: '4091', sollCents: 0, habenCents: 4_500, balanceCents: -4_500 });
    expect(summary.accounts.find((account) => account.account === '4090')).toBeUndefined();
  });

  it('writes no text with an English apaleo name or a guest name', () => {
    const texts = result.bookings.map((b) => b.text ?? '');
    expect(texts).not.toContain('');
    for (const word of ['Revenues', 'Payment', 'Liabilities', 'Receivables', 'Credit Card']) {
      expect(texts.filter((text) => text.includes(word)), word).toEqual([]);
    }
    expect(texts).toEqual(expect.arrayContaining(['Erlös Logis 13 %', 'Auflösung Anzahlung 13 %', 'Erstattung Anzahlung 0 %', 'Zahlung Visa Debit', 'Forderung an Debitor', 'Anzahlung 20 %']));
  });

  it('books the release 000000025 as a positive Betrag and Steuer on the 13 % deposit account', () => {
    expect(result.bookings.find((b) => b.sourceEntryNumbers[0] === '000000025')).toMatchObject({
      konto: '3202',
      gkonto: '2390',
      betragCents: 9_292,
      tax: { steuercode: 1, prozent: 13, steuerCents: 1_208 },
    });
  });
});
