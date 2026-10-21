import { describe, expect, it } from 'vitest';
import { renderBuchungsimport } from '../../src/bmd/index.js';
import { ChartIndex } from '../../src/core/chart.js';
import { parseMapping } from '../../src/mapping/index.js';
import { buildBookings, journalTotals, taxByRate } from '../../src/posting/index.js';
import { AT_MONTH, loadAtMonthData } from '../helpers/apaleo.js';
import { readMappingFixture } from '../helpers/mapping.js';

/**
 * The Austrian fixture month (test/fixtures/apaleo/at-month/README.md): Hotel
 * Beispiel Tirol (TIR), August 2026, 27 apaleo lines, posted with its EKR
 * fixture mapping (`test/fixtures/mapping/ekr-at-month.csv`, init-mapping plus
 * the Ortstaxe on 3580). Totals computed by hand; BMD gets the net Betrag and
 * apaleo's tax rounded per line as Steuer:
 *
 * Revenue 10 %: logis 98 + 110 + 110 + 55 + 132 + 89 = 594.00, breakfast 16.50 +
 *   21.00 = 37.50, gross 631.50. Tax per line: logis 8.91 (8.90909091) + 10 + 10 +
 *   5 + 12 + 8.09 (8.09090909) = 54.00, breakfast 1.50 + 1.91 (1.90909091) = 3.41;
 *   57.41 in all, apaleo precise 57.40909091. Net 574.09: 4000 594 − 54 = 540.00,
 *   4010 37.50 − 3.41 = 34.09.
 * Revenue 20 % (4020): drinks 7.90 + 4.80 = 12.70; tax 1.32 (1.31666667) + 0.80 =
 *   2.12 (precise 2.11666667); net 10.58.
 * Revenue 0 % (4091, cancellation fee): 45.00, no tax fields.
 * Ortstaxe (3580): 3.00 + 6.00 = 9.00.
 * Deposit of TIR-ALPHA-1 at 10 % (3200): received 330.00 (net 300, tax 30), released
 *   at check-out −220.00 (tax −20) and the rest refunded to the Visa card −110.00
 *   (tax −10): received 330.00, released 220 + 110 = 330.00, of it refunded 110.00;
 *   deposit VAT 30 − 20 − 10 = 0, 3200 Soll 200 + 100 = Haben 300.
 * Payments: Kassa 2700 = 125.40 (TIR-BRAVO-1); 2890 = deposit 330 − refund 110 +
 *   Mastercard 6 + 45 + bank transfer 93.80 = 364.80 (Soll 474.80, Haben 110).
 * Sammeldebitor 200000: the invoice TIR-2026-0815, 153.00.
 * Write-off of TIR-FOXTROT-1 at 10 % (7800): Betrag 50.00 and Steuer 5.00, both
 *   positive (the USt-Berichtigung), gross 55.00.
 * 2390 Soll (charges): 125.40 + 226.00 + 45 + 55 + 153 + 93.80 = 698.20; Haben:
 *   payments 125.40 + 6 + 45 + 93.80, invoice 153, release 220, write-off 55 = 698.20.
 * Skipped SAME_ACCOUNT (unsigned): the /Offset second lines of four payments and of
 *   the invoice, 125.40 + 6 + 45 + 93.80 + 153 = 423.20. 27 − 5 = 22 bookings.
 * The balances add up to the tax BMD books: 57.41 + 2.12 − 5.00 = 54.53.
 */
const data = await loadAtMonthData();
const lines = data.ledger[AT_MONTH] ?? [];
const chart = new ChartIndex(data.charts[AT_MONTH] ?? []);
const mapping = parseMapping(readMappingFixture('ekr-at-month.csv'), { path: 'ekr-at-month.csv', sachkontenlaenge: 4 });
const result = buildBookings(lines, mapping, chart, { extbelegnr: 'receipt', dialect: 'ntcs', sachkontenlaenge: 4, buchsymbol: 'AR', buchsymbolZahlung: 'AR' });

describe('posting the Austrian fixture month', () => {
  it('books 22 of the 27 lines, skips the five /Offset second lines and raises no finding', () => {
    expect(lines).toHaveLength(27);
    expect(result.bookings).toHaveLength(22);
    expect(result.skipped).toHaveLength(5);
    expect(result.findings).toEqual([]);
  });

  it('matches the hand-computed summary', () => {
    expect(result.summary).toEqual({
      accounts: [
        { account: '2390', sollCents: 69_820, habenCents: 69_820, balanceCents: 0 },
        { account: '2700', sollCents: 12_540, habenCents: 0, balanceCents: 12_540 },
        { account: '2890', sollCents: 47_480, habenCents: 11_000, balanceCents: 36_480 },
        { account: '3200', sollCents: 30_000, habenCents: 30_000, balanceCents: 0 },
        { account: '3580', sollCents: 0, habenCents: 900, balanceCents: -900 },
        { account: '4000', sollCents: 0, habenCents: 54_000, balanceCents: -54_000 },
        { account: '4010', sollCents: 0, habenCents: 3_409, balanceCents: -3_409 },
        { account: '4020', sollCents: 0, habenCents: 1_058, balanceCents: -1_058 },
        { account: '4091', sollCents: 0, habenCents: 4_500, balanceCents: -4_500 },
        { account: '7800', sollCents: 5_000, habenCents: 0, balanceCents: 5_000 },
        { account: '200000', sollCents: 15_300, habenCents: 0, balanceCents: 15_300 },
      ],
      revenueByRate: [
        { ratePercent: 0, netCents: 4_500, vatCents: 0, grossCents: 4_500, apaleoVat: '0' },
        { ratePercent: 10, netCents: 57_409, vatCents: 5_741, grossCents: 63_150, apaleoVat: '57.40909091' },
        { ratePercent: 20, netCents: 1_058, vatCents: 212, grossCents: 1_270, apaleoVat: '2.11666667' },
      ],
      depositVatByRate: [{ ratePercent: 10, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }],
      writeOffsByRate: [{ ratePercent: 10, netCents: 5_000, vatCents: 500, grossCents: 5_500, apaleoVat: '5' }],
      cityTaxCents: 900,
      payments: [
        { account: '2700', cents: 12_540 },
        { account: '2890', cents: 36_480 },
      ],
      deposits: { receivedCents: 33_000, releasedCents: 33_000, refundedCents: 11_000 },
      accountsReceivableCents: 15_300,
      skipped: [{ reason: 'SAME_ACCOUNT', lines: 5, grossCents: 42_320 }],
      roundingCents: 0,
      findings: [],
    });
    const balance = result.summary.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
    expect(balance).toBe(5_741 + 212 - 500);
  });

  it('gives every taxed booking Steuercode 1 and its rate', () => {
    const taxed = result.bookings.filter((booking) => booking.tax);
    expect(taxed).toHaveLength(14);
    for (const booking of taxed) expect(booking.tax?.steuercode, booking.sourceEntryNumbers[0]).toBe(1);
    expect(new Set(taxed.map((booking) => booking.tax?.prozent))).toEqual(new Set([10, 20]));
  });

  it('books each Austrian case as the hand-computed line', () => {
    const texts = (konto: string) => result.bookings.filter((b) => b.konto === konto).map((b) => [b.gkonto, b.betragCents, b.tax?.steuerCents, b.text]);
    expect(texts('3200')).toEqual([
      ['2890', -30_000, -3_000, 'Anzahlung 10 %'],
      ['2390', 20_000, 2_000, 'Auflösung Anzahlung 10 %'],
      ['2890', 10_000, 1_000, 'Erstattung Anzahlung 10 %'],
    ]);
    expect(texts('4091')).toEqual([['2390', -4_500, undefined, 'Erlös Stornogebühr 0 %']]);
    expect(texts('7800')).toEqual([['2390', 5_000, 500, 'Forderungsverlust 10 %']]);
    expect(texts('200000')).toEqual([['2390', 15_300, undefined, 'Forderung an Debitor']]);
    expect(texts('2390').filter(([gkonto]) => gkonto === '3580')).toEqual([
      ['3580', 300, undefined, 'Ortstaxe'],
      ['3580', 600, undefined, 'Ortstaxe'],
    ]);
  });

  it('keeps every apaleo line traceable and renders through the BMD writer without notes', () => {
    const booked = result.bookings.flatMap((b) => b.sourceEntryNumbers);
    const skipped = result.skipped.map((s) => s.line.sourceEntryNumber);
    expect([...booked, ...skipped].sort()).toEqual(lines.map((line) => line.sourceEntryNumber).sort());
    const rendered = renderBuchungsimport(result.bookings, { from: '2026-08-01', to: '2026-08-31', propertyId: AT_MONTH, sachkontenlaenge: 4, personenkontenlaenge: 6 });
    expect(rendered.text.split('\r\n')).toHaveLength(1 + 22 + 1);
    expect(rendered.notes).toEqual([]);
  });

  it('gives the manifest the tax per rate as owed, with the write-off correction deducted', () => {
    // 10 %: revenue 57.41 + deposit 30 − 20 − 10 − write-off 5.00; 20 %: 2.12. The cancellation fee has no tax fields.
    expect(taxByRate(result.bookings)).toEqual([
      { ratePercent: 10, taxCents: 5_241 },
      { ratePercent: 20, taxCents: 212 },
    ]);
  });

  it('gives the journal totals BMD shows after the import: Soll equals Haben, the gross of every booking', () => {
    const gross = result.bookings.reduce((sum, b) => sum + Math.abs(b.betragCents + (b.tax?.steuerCents ?? 0)), 0);
    expect(journalTotals(result.bookings)).toEqual({ sollCents: gross, habenCents: gross });
    // Not the sums by the sign of Betrag, which leave out the Gegenbuchung and the tax posting.
    const bySign = result.bookings.filter((b) => b.betragCents > 0).reduce((sum, b) => sum + b.betragCents, 0);
    expect(journalTotals(result.bookings).sollCents).not.toBe(bySign);
  });
});
