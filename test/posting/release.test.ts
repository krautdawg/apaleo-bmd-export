import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine, SourceAccount } from '../../src/core/source.js';
import { buildBookings, inferReleaseRates } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, CHART, EKR_MAPPING, LEDGER, OPTIONS, mappingWith, post } from '../helpers/posting.js';

/**
 * Deposit release (design decision 4): debit the guest's _Liabilities account,
 * credit its _Receivables account. With the EKR fixture mapping the deposit side
 * (3200, Steuercode 1, 10 %) leads as Konto and is debited, so BMD books Betrag
 * and Steuer positive and reverses the Umsatzsteuer on the deposit:
 * 165.00 × 10 / 110 = 15.00.
 */

const liabilities = { number: 'BSP-MNOPQR-1_Liabilities', name: 'Liabilities for Reservation BSP-MNOPQR-1', type: 'Liabilities' };
const receivables = { number: 'BSP-MNOPQR-1_Receivables', name: 'Receivables for Reservation BSP-MNOPQR-1', type: 'Receivables' };
const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);
const tax10 = (cents: number) => [tax('VeryReduced', 10, cents)];

function release(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return ledgerLine({
    businessDate: '2026-09-22',
    debit: liabilities,
    credit: receivables,
    command: 'System',
    grossCents: 16_500,
    netCents: 16_500,
    taxes: [],
    receipt: { type: 'Reservation', number: 'BSP-MNOPQR-1-V1' },
    reference: 'BSP-MNOPQR-1',
    sourceEntryNumber: 'BSPE0021',
    ...overrides,
  });
}

/** The PostPrepaymentVat line that takes the deposit's VAT off apaleo's VAT-on-liabilities account. */
function pair(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return release({
    debit: ACCOUNTS.vatOnLiabilities10,
    credit: liabilities,
    command: 'PostPrepaymentVat',
    grossCents: 1_500,
    netCents: 0,
    taxes: tax10(1_500),
    sourceEntryNumber: 'BSPE0022',
    ...overrides,
  });
}

/** A chart with a guest Liabilities account that carries a VAT rate, as some apaleo accounts do. */
function chartWithDeposit(percent: number): ChartIndex {
  const guest = (account: Partial<SourceAccount> & Pick<SourceAccount, 'number' | 'name'>): SourceAccount => ({
    type: 'Liabilities',
    ledger: 'guest',
    isArchived: false,
    hasChildren: true,
    ...account,
  });
  return new ChartIndex([
    ...CHART.accounts,
    guest({ number: '3010', name: `Guest Liabilities ${percent}%`, parentNumber: '3000', vat: { type: percent === 0 ? 'Without' : 'VeryReduced', percent } }),
  ]);
}
const folioDeposit = { number: 'BSP-EXT-1_Liabilities', name: 'Müller, Hans', type: 'Liabilities', parentNumber: '3010' };

describe('deposit release with taxes', () => {
  it('resolves to the 10 % Liabilities row and books 3200 against 2390 with Betrag 200.00 and Steuer 20.00', () => {
    const line = release({ grossCents: 22_000, netCents: 20_000, taxes: tax10(2_000) });
    const { bookings, findings, summary } = post([line]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([expect.objectContaining({ konto: '3200', gkonto: '2390', betragCents: 20_000, tax: { steuercode: 1, prozent: 10, steuerCents: 2_000 } })]);
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 22_000, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ ratePercent: 10, netCents: -20_000, vatCents: -2_000, grossCents: -22_000, apaleoVat: '-20' }]);
  });

  it('books the Hotel Beispiel releases, negative charges with taxes[], without a finding', () => {
    const lines = LEDGER.filter((line) => line.command === 'PostCharge' && line.credit.type === 'Liabilities' && line.grossCents < 0);
    expect(lines.map((line) => line.sourceEntryNumber)).toEqual(['BSPE0019', 'BSPE0021']);
    expect(inferReleaseRates(LEDGER, CHART).size).toBe(0);
    const { bookings, findings } = post(lines);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.konto, b.gkonto, b.betragCents, b.tax?.steuerCents])).toEqual([
      ['3200', '2390', 20_000, 2_000],
      ['3200', '2390', 15_000, 1_500],
    ]);
  });
});

describe('deposit release without taxes', () => {
  it('takes 10 % and the tax 15.00 from the PostPrepaymentVat pair and skips the pair as VAT_ACCOUNT_LINE', () => {
    const { bookings, skipped, findings } = post([release(), pair()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ konto: '3200', gkonto: '2390', betragCents: 15_000, tax: { steuercode: 1, prozent: 10, steuerCents: 1_500 }, sourceEntryNumbers: ['BSPE0021'] }),
    ]);
    expect(skipped.map((s) => [s.reason, s.line.sourceEntryNumber])).toEqual([['VAT_ACCOUNT_LINE', 'BSPE0022']]);
  });

  it('ignores a PostPrepaymentVat line of another day, reference or direction', () => {
    // The VAT booked when the deposit was received (debit Liabilities, credit VAT) goes the other way.
    const received = pair({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities10, sourceEntryNumber: 'BSPE0006' });
    for (const other of [pair({ businessDate: '2026-09-21' }), pair({ reference: 'BSP-OTHER-1' }), received]) {
      expect(codes(post([release(), other]).findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    }
  });

  it('infers the rate from the pair amount when the pair carries no tax entry', () => {
    // 15.00 of VAT on 165.00 matches 10 % (15.00), not 13 % (18.98) or 20 % (27.50).
    const { bookings, findings } = post([release(), pair({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ konto: '3200', tax: { prozent: 10, steuerCents: 1_500 } });
  });

  it('blocks a release whose tax differs from the pair by more than a cent with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([release(), pair({ grossCents: 1_400, taxes: tax10(1_400) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit release is 15.00, but apaleo reversed 14.00 on the PostPrepaymentVat line BSPE0022');
  });

  it('warns once with W-VAT-ROUNDING when the pair is one cent off, books the pair\'s tax and allows the cent in the VAT check', () => {
    const { bookings, findings, summary, vatRoundingByRate } = post([release(), pair({ grossCents: 1_501, taxes: tax10(1_501) })]);
    expect(bookings).toEqual([expect.objectContaining({ betragCents: 14_999, tax: { steuercode: 1, prozent: 10, steuerCents: 1_501 } })]);
    expect(codes(findings)).toEqual(['W-VAT-ROUNDING']);
    expect([...vatRoundingByRate]).toEqual([[10, 1]]);
    expect(summary.roundingCents).toBe(-1);
  });

  it('checks two releases of the same day and reference against their pair together, each with its own computed tax', () => {
    // 110.00 + 55.00: 10.00 + 5.00 = 15.00, one pair of 15.00 in apaleo.
    const lines = [release({ grossCents: 11_000 }), release({ grossCents: 5_500, sourceEntryNumber: 'BSPE0023' }), pair()];
    const { bookings, findings } = post(lines);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.betragCents, b.tax?.steuerCents])).toEqual([
      [10_000, 1_000],
      [5_000, 500],
    ]);
  });

  it('falls back to the VAT rate of the Liabilities account or its parent in the chart, computes the tax and warns W-VAT-INFERRED', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit, grossCents: 22_000 })], EKR_MAPPING, chartWithDeposit(10), OPTIONS);
    expect(bookings).toEqual([expect.objectContaining({ konto: '3200', gkonto: '2390', betragCents: 20_000, tax: { steuercode: 1, prozent: 10, steuerCents: 2_000 } })]);
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('10 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('computes the tax 20.00 from the gross amount');
    expect(findings[0]?.message).not.toContain('Müller');
  });

  it('blocks a release with no rate source with E-VAT-RATE-UNKNOWN instead of booking it at 0 %', () => {
    const { bookings, findings } = post([release()]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0021');
    expect(findings[0]?.message).toContain('there is no PostPrepaymentVat line of 2026-09-22 for reference BSP-MNOPQR-1');
    expect(findings[0]?.message).not.toContain('3209');
  });

  it('blocks a release whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const twenty = pair({ debit: { number: 'LiabilitiesVat_Normal:20.00', name: 'LiabilitiesVat Normal (20%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 20, 100)], sourceEntryNumber: 'BSPE0024' });
    const { findings } = post([release(), pair(), twenty]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain('carry more than one rate (10 %, 20 %)');
  });

  it('blocks a release whose inferred rate the mapping books without Steuercode with E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3010', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3209', bmdVatPercent: '0' }));
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], mapping, chartWithDeposit(10), OPTIONS);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('settles a deposit taxed at 10 % (inferred from the chart of accounts, account 3010)');
  });
});

describe('chart rate of 0 %', () => {
  it('books the release on the 0 % deposit row without tax fields and still warns with W-VAT-INFERRED', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], EKR_MAPPING, chartWithDeposit(0), OPTIONS);
    expect(bookings).toEqual([expect.objectContaining({ konto: '3209', gkonto: '2390', betragCents: 16_500 })]);
    expect(bookings[0]?.tax).toBeUndefined();
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('0 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('so the booking carries no tax');
  });
});

describe('untaxed deposit lines other than releases', () => {
  // 110.00 at 10 %: 11000 × 10 / 110 = 10.00.
  const refund = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: liabilities, credit: ACCOUNTS.visa, command: 'Refund', grossCents: 11_000, netCents: 11_000, sourceEntryNumber: 'BSPE0031', ...overrides });
  const received = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: ACCOUNTS.visa, credit: liabilities, command: 'PostPrepayment', grossCents: 11_000, netCents: 11_000, sourceEntryNumber: 'BSPE0032', ...overrides });
  /** VAT reversed on the deposit (debit VAT on liabilities), as for a release. */
  const reversing = (overrides: Partial<LedgerLine> = {}) => pair({ grossCents: 1_000, taxes: tax10(1_000), sourceEntryNumber: 'BSPE0033', ...overrides });
  /** VAT booked on the deposit (credit VAT on liabilities), as on receipt. */
  const booking = (overrides: Partial<LedgerLine> = {}) => reversing({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities10, sourceEntryNumber: 'BSPE0034', ...overrides });

  it('books an untaxed deposit refund of 110.00 with a reversing pair on 3200 with Betrag 100.00 and Steuer 10.00', () => {
    const { bookings, skipped, findings } = post([refund(), reversing()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([expect.objectContaining({ konto: '3200', gkonto: '2890', betragCents: 10_000, tax: { steuercode: 1, prozent: 10, steuerCents: 1_000 }, sourceEntryNumbers: ['BSPE0031'] })]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE']);
  });

  it('books an untaxed prepayment of 110.00 received with a VAT-booking pair on 3200 with Betrag -100.00 and Steuer -10.00', () => {
    const { bookings, findings } = post([received(), booking()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([expect.objectContaining({ konto: '3200', gkonto: '2890', betragCents: -10_000, tax: { steuercode: 1, prozent: 10, steuerCents: -1_000 }, sourceEntryNumbers: ['BSPE0032'] })]);
  });

  it('infers the rate from the pair amount when the pair of a prepayment received carries no tax entry', () => {
    const { bookings, findings } = post([received(), booking({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ konto: '3200' });
  });

  it('blocks a refund whose tax differs from the pair with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([refund(), reversing({ grossCents: 600, taxes: tax10(600) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit line is 10.00, but apaleo reversed 6.00 on the PostPrepaymentVat line BSPE0033');
  });

  it('blocks a prepayment received whose tax differs from the pair with E-VAT-AMOUNT', () => {
    const { findings } = post([received(), booking({ grossCents: 600, taxes: tax10(600) })]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('but apaleo booked 6.00 on the PostPrepaymentVat line BSPE0034');
  });

  // Without a Steuercode, Konto is the debited account: 3209 for the refund, 2890 for the receipt.
  const refundAt0 = expect.objectContaining({ konto: '3209', gkonto: '2890', betragCents: 11_000 });
  const receivedAt0 = expect.objectContaining({ konto: '2890', gkonto: '3209', betragCents: 11_000 });

  it('ignores a PostPrepaymentVat line of the other direction and keeps the line on the 0 % deposit row', () => {
    expect(post([refund(), booking()]).bookings).toEqual([refundAt0]);
    expect(post([received(), reversing()]).bookings).toEqual([receivedAt0]);
  });

  it('keeps an untaxed refund or receipt without a PostPrepaymentVat line on the 0 % deposit row without a finding', () => {
    for (const [line, expected] of [[refund(), refundAt0], [received(), receivedAt0]] as const) {
      const { bookings, findings } = post([line]);
      expect(findings).toEqual([]);
      expect(bookings).toEqual([expected]);
    }
  });

  it('checks a release and a refund of the same day and reference against their pair together', () => {
    // 165.00 released (15.00) + 110.00 refunded (10.00) = 25.00 reversed on one pair line.
    const { bookings, findings } = post([release(), refund(), reversing({ grossCents: 2_500, taxes: tax10(2_500) })]);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.konto, b.tax?.steuerCents])).toEqual([
      ['3200', 1_500],
      ['3200', 1_000],
    ]);
  });

  it('blocks a refund whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const twenty = reversing({ debit: { number: 'LiabilitiesVat_Normal:20.00', name: 'LiabilitiesVat Normal (20%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 20, 100)], sourceEntryNumber: 'BSPE0035' });
    const { bookings, findings } = post([refund(), reversing(), twenty]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain("it books a guest's deposit without a VAT amount");
  });
});
