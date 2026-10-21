import { describe, expect, it } from 'vitest';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine } from '../../src/core/source.js';
import { bmdCheckTax, taxFromGross } from '../../src/posting/index.js';
import { ledgerLine, tax as taxEntry } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, mappingWith, post } from '../helpers/posting.js';

/**
 * Hand-computed examples at the Austrian rates (UStG 1994 § 10: Beherbergung and
 * food 10 %, drinks 20 %), posted with the EKR fixture mapping of Hotel Beispiel:
 * receivables 2390, cards 2890, cash 2700, logis 4000 (10 %), food 4010 (10 %),
 * drinks 4020 (20 %, Kostenstelle 20), deposits 3200 (10 %) and 3209 (0 %),
 * Ortstaxe 3580, Sammeldebitor 200000, all with Steuercode 1 where taxed.
 * BMD receives net amount and tax: `betrag` = gross − tax and `steuer` = apaleo's
 * tax, both signed from `konto`, the side with the Steuercode.
 */

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);
const TYPES: Readonly<Record<number, string>> = { 10: 'VeryReduced', 13: 'Reduced', 20: 'Normal' };
const tax = (percent: number, amountCents: number, precise?: string) => [taxEntry(TYPES[percent] ?? 'Special', percent, amountCents, precise)];

function single(line: LedgerLine, mapping = mappingWith(), options = {}) {
  const result = post([line], mapping, options);
  return { ...result, booking: result.bookings[0] };
}

const payment = (overrides: Partial<LedgerLine> = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_000, netCents: 12_000, taxes: [], ...overrides });

describe('one booking per ledger line', () => {
  it('books a card payment 120.00 as Konto 2890, Gegenkonto 2390, Soll, without tax fields, under HO', () => {
    const { booking, findings } = single(payment({ businessDate: '2026-09-16', sourceEntryNumber: 'BSPE0014' }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '2890', gkonto: '2390', betragCents: 12_000, buchsymbol: 'HO', businessDate: '2026-09-16', sourceEntryNumbers: ['BSPE0014'] });
    expect(booking?.tax).toBeUndefined();
  });

  it('books a cash payment 24.00 to the Kassa 2700', () => {
    const { booking } = single(payment({ debit: ACCOUNTS.cash, grossCents: 2_400 }));
    expect(booking).toMatchObject({ konto: '2700', gkonto: '2390', betragCents: 2_400 });
  });

  it('puts payments under bmd.buchsymbolZahlung and revenue under bmd.buchsymbol', () => {
    const { bookings } = post([payment(), ledgerLine()], mappingWith(), { buchsymbol: 'HO', buchsymbolZahlung: 'HZ' });
    expect(bookings.map((b) => [b.konto, b.buchsymbol])).toEqual([
      ['2890', 'HZ'],
      ['4000', 'HO'],
    ]);
  });

  it('is deterministic: the same lines and mapping give the same result', () => {
    const lines = [ledgerLine(), payment()];
    expect(post(lines)).toEqual(post(structuredClone(lines)));
  });
});

describe('VAT side in Konto', () => {
  it('books an accommodation charge 110.00 at 10 % as Konto 4000 with Betrag -100.00 and Steuer -10.00, Gegenkonto 2390', () => {
    const { booking, findings } = single(ledgerLine());
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4000', gkonto: '2390', betragCents: -10_000, tax: { steuercode: 1, prozent: 10, steuerCents: -1_000 } });
  });

  it('books an allowance that debits revenue 11.00 as Konto 4000 with Betrag 10.00 and Steuer 1.00', () => {
    const { booking, findings } = single(ledgerLine({ debit: ACCOUNTS.accommodation10, credit: ACCOUNTS.receivables, grossCents: 1_100, netCents: 1_000, taxes: tax(10, 100) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4000', gkonto: '2390', betragCents: 1_000, tax: { steuercode: 1, prozent: 10, steuerCents: 100 } });
  });

  it('books a payment with a negative gross (a refund) as Konto 2390 against 2890 with the absolute amount', () => {
    const { booking, findings } = single(payment({ grossCents: -2_000, netCents: -2_000 }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '2390', gkonto: '2890', betragCents: 2_000 });
    expect(booking?.tax).toBeUndefined();
  });

  it('books untaxed revenue on a row with the non-taxable Steuercode 81 at 0 % with tax 0.00', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', bmdAccount: '4090', steuercode: '81', bmdVatPercent: '0' }));
    const { booking, findings } = single(ledgerLine({ credit: ACCOUNTS.accommodation0, grossCents: 8_000, netCents: 8_000, taxes: [] }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4090', gkonto: '2390', betragCents: -8_000, tax: { steuercode: 81, prozent: 0, steuerCents: 0 } });
  });

  it('books untaxed revenue on a row without Steuercode with the revenue account leading and the signed gross', () => {
    const { booking, findings } = single(ledgerLine({ credit: ACCOUNTS.accommodation0, grossCents: 4_500, netCents: 4_500, taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4090', gkonto: '2390', betragCents: -4_500 });
    expect(booking?.tax).toBeUndefined();
  });

  it('reports E-TWO-VAT-SIDES for a move between two revenue accounts and books nothing', () => {
    const { bookings, findings } = single(
      ledgerLine({ debit: ACCOUNTS.accommodation10, credit: ACCOUNTS.food10, command: 'MoveLineItem', sourceEntryNumber: 'BSPE0099' }),
    );
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-TWO-VAT-SIDES']);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0099');
    expect(findings[0]?.message).toContain('debit RevenueAccommodation_VeryReduced:10.00 on mapping line');
    expect(findings[0]?.message).toContain('credit RevenueFoodAndBeverages_VeryReduced:10.00 on mapping line');
    expect(findings[0]?.message).toMatch(/\(BMD 4000\).*\(BMD 4010\)/);
  });
});

describe('VAT consistency guard', () => {
  it('passes drinks 24.00 at 20 % (net 20.00, tax 4.00) and counts them as revenue at 20 %', () => {
    const { booking, findings, summary } = single(ledgerLine({ credit: ACCOUNTS.beverages20, grossCents: 2_400, netCents: 2_000, taxes: tax(20, 400) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4020', betragCents: -2_000, tax: { prozent: 20, steuerCents: -400 } });
    expect(summary.revenueByRate).toEqual([{ ratePercent: 20, netCents: 2_000, vatCents: 400, grossCents: 2_400, apaleoVat: '4' }]);
  });

  it('passes breakfast food 16.50 at 10 % (net 15.00, tax 1.50)', () => {
    const { booking, findings } = single(ledgerLine({ credit: ACCOUNTS.food10, grossCents: 1_650, netCents: 1_500, taxes: tax(10, 150) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4010', betragCents: -1_500, tax: { steuerCents: -150 } });
  });

  it('drops a Without entry of 0 % and 0.00 on the Ortstaxe instead of raising E-VAT-MISSING', () => {
    const { booking, findings } = single(ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 320, netCents: 320, taxes: [taxEntry('Without', 0, 0)] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '2390', gkonto: '3580', betragCents: 320 });
  });

  it('books a negative allowance -11.00 with negative tax as Betrag 10.00 and Steuer 1.00 on the revenue account, signs agreeing', () => {
    const { booking, findings, summary } = single(ledgerLine({ grossCents: -1_100, netCents: -1_000, taxes: tax(10, -100) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4000', gkonto: '2390', betragCents: 1_000, tax: { steuerCents: 100 } });
    expect(summary.revenueByRate).toEqual([{ ratePercent: 10, netCents: -1_000, vatCents: -100, grossCents: -1_100, apaleoVat: '-1' }]);
  });

  it('blocks a line taxed at 10 % on an account mapped to 20 % with E-VAT-RATE', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation10.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4030', steuercode: '1', bmdVatPercent: '20' }));
    const { bookings, findings } = single(ledgerLine(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo taxed it at 10 %, but RevenueAccommodation_VeryReduced:10.00 (Revenues) on mapping line 2 (BMD 4030) books 20 %');
  });

  it('blocks a taxed line on an account mapped without Steuercode with E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation10.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4090' }));
    const { bookings, findings } = single(ledgerLine(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('carries 10.00 VAT at 10 %');
    expect(findings[0]?.message).toContain('Change the row for RevenueAccommodation_VeryReduced:10.00 (Revenues) on mapping line 2 (BMD 4090)');
  });

  it('blocks an untaxed line on a row with a Steuercode above 0 % with E-VAT-UNEXPECTED', () => {
    const { bookings, findings } = single(ledgerLine({ taxes: [] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-UNEXPECTED']);
  });

  it('warns W-VAT-ROUNDING when BMD\'s check value differs by one cent, keeps apaleo\'s tax and adds the cent to the rounding total', () => {
    // Gross 46.80, apaleo tax 4.25: Betrag 42.55, BMD checks 42.55 × 10 % = 4.255 → 4.26.
    expect(bmdCheckTax(4_255, 10)).toBe(426);
    const { booking, findings, summary, vatRoundingByRate } = single(ledgerLine({ credit: ACCOUNTS.food10, grossCents: 4_680, netCents: 4_255, taxes: tax(10, 425) }));
    expect(booking).toMatchObject({ betragCents: -4_255, tax: { steuerCents: -425 } });
    expect(codes(findings)).toEqual(['W-VAT-ROUNDING']);
    expect(findings[0]?.message).toContain('BMD checks the tax as 10 % of the Betrag 42.55, which is 4.26, but the booking carries apaleo\'s tax 4.25');
    expect(summary.roundingCents).toBe(1);
    expect(summary.findings).toEqual([{ code: 'W-VAT-ROUNDING', count: 1 }]);
    // The booking carries apaleo's own tax, so the VAT total per rate needs no allowance.
    expect([...vatRoundingByRate]).toEqual([]);
  });

  it('blocks a larger difference with E-VAT-AMOUNT', () => {
    const { bookings, findings } = single(ledgerLine({ taxes: tax(10, 1_100) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('10 % of the Betrag 99.00, which is 9.90, but the booking carries apaleo\'s tax 11.00');
  });

  it('blocks a line with two tax rates with E-VAT-MIXED', () => {
    const { bookings, findings } = single(ledgerLine({ taxes: [...tax(10, 1_000), ...tax(20, 100)] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MIXED']);
  });

  it('blocks a tax with the opposite sign of the gross amount with E-VAT-SIGN', () => {
    const { bookings, findings } = single(ledgerLine({ taxes: tax(10, -1_000) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-SIGN']);
  });

  it.each([
    ['Receivables', '1200', ACCOUNTS.receivables, '2390'],
    ['AccountsReceivable', '*', ACCOUNTS.accountsReceivable, '200000'],
  ])('blocks a Steuercode on the %s side with E-STEUERCODE-NOT-ALLOWED naming the row, never USt in Soll', (apaleoType, apaleoAccount, debit, bmdAccount) => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount, apaleoType, bmdAccount, steuercode: '1', bmdVatPercent: '10' }),
      mappingRow({ apaleoAccount: ACCOUNTS.accommodation10.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4000' }),
    );
    const { bookings, findings } = single(ledgerLine({ debit }), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-STEUERCODE-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain(`${debit.number} (${apaleoType}) uses mapping line 2 (BMD ${bmdAccount}), which has the Steuercode 1`);
  });

  it('blocks a Steuercode on a payment row with E-STEUERCODE-NOT-ALLOWED', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', bmdAccount: '2890', steuercode: '1', bmdVatPercent: '0' }));
    const { bookings, findings } = single(payment(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-STEUERCODE-NOT-ALLOWED']);
  });

  it('blocks a row with a Steuercode but no rate with E-VAT-RATE-MISSING; E-DATEV-RATE-UNKNOWN is gone', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation10.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4000', steuercode: '1' }));
    const { bookings, findings } = single(ledgerLine(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-MISSING']);
    expect(findings[0]?.message).toContain('Fill in bmd_vat_percent');
  });

  it('books apaleo\'s precise tax rounded half away from zero: VIE 000000029, 95.00 at 13 %', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: 'RevenueAccommodation_Reduced:13.00', apaleoType: 'Revenues', apaleoVatPercent: '13', bmdAccount: '4040', steuercode: '1', bmdVatPercent: '13' }));
    const credit = { number: 'RevenueAccommodation_Reduced:13.00', name: 'Revenues Accommodation (13%)', type: 'Revenues', parentNumber: '5000' };
    const line = ledgerLine({ credit, grossCents: 9_500, netCents: 8_407, netPrecise: '84.07079646', taxes: tax(13, 1_093, '10.92920354'), sourceEntryNumber: '000000029' });
    const { booking, findings, summary } = single(line, mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4040', betragCents: -8_407, tax: { steuercode: 1, prozent: 13, steuerCents: -1_093 } });
    expect(summary.revenueByRate).toEqual([{ ratePercent: 13, netCents: 8_407, vatCents: 1_093, grossCents: 9_500, apaleoVat: '10.92920354' }]);
  });

  it('reports an unmapped account once with E-UNMAPPED and books none of its lines', () => {
    const spa = { number: '5050', name: 'Spa', type: 'Revenues' };
    const { bookings, findings } = post([ledgerLine({ credit: spa }), ledgerLine({ credit: spa, sourceEntryNumber: 'BSPE0002' })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-UNMAPPED']);
    expect(findings[0]?.message).toContain('apaleo account 5050 (Revenues, "Spa") is not mapped (2 lines, gross 220.00)');
  });

  it('computes the tax contained in a gross amount half away from zero', () => {
    expect(taxFromGross(22_000, 10)).toBe(2_000);
    expect(taxFromGross(-10_500, 13)).toBe(-1_208);
    expect(taxFromGross(4_680, 10)).toBe(425);
  });
});

describe('Ortstaxe and guest levies', () => {
  it('books the guest-owed Ortstaxe 5.20 as Konto 2390 against the Gemeinde liability 3580, without tax fields', () => {
    const { booking, findings, summary } = single(ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 520, netCents: 520, taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '2390', gkonto: '3580', betragCents: 520 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.cityTaxCents).toBe(520);
    expect(summary.revenueByRate).toEqual([]);
  });

  it('books a levy that apaleo taxes at 10 % on a revenue account with the Steuercode, under the guard', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '10', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10' }));
    const line = ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 550, netCents: 500, taxes: tax(10, 50) });
    const { booking, findings, summary } = single(line, mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4000', gkonto: '2390', betragCents: -500, tax: { steuerCents: -50 } });
    expect(summary.cityTaxCents).toBe(550);
    expect(codes(post([{ ...line, taxes: tax(10, 80) }], mapping).findings)).toEqual(['E-VAT-AMOUNT']);
  });
});

describe('deposits and accounts receivable', () => {
  it('books a prepayment 220.00 at 10 % as Konto 3200 against 2890 with Steuercode 1, under the main symbol', () => {
    const { booking, findings, summary } = single(
      ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment', grossCents: 22_000, netCents: 20_000, taxes: tax(10, 2_000) }),
      mappingWith(),
      { buchsymbolZahlung: 'HZ' },
    );
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '3200', gkonto: '2890', betragCents: -20_000, buchsymbol: 'HO', tax: { steuercode: 1, prozent: 10, steuerCents: -2_000 } });
    expect(summary.deposits).toEqual({ receivedCents: 22_000, releasedCents: 0, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ ratePercent: 10, netCents: 20_000, vatCents: 2_000, grossCents: 22_000, apaleoVat: '20' }]);
  });

  it('books a check-out on accounts receivable 300.00 to the Sammeldebitor 200000 with the invoice number', () => {
    const { booking, findings } = single(
      ledgerLine({
        debit: ACCOUNTS.accountsReceivable,
        credit: ACCOUNTS.receivables,
        command: 'PostToAccountsReceivables',
        grossCents: 30_000,
        taxes: [],
        receipt: { type: 'Invoice', number: 'BSP-2026-0042' },
      }),
    );
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '200000', gkonto: '2390', betragCents: 30_000, extbelegnr: 'BSP-2026-0042' });
  });

  it('books a release as a negative charge credited to Liabilities: VIE 000000025, -105.00 at 13 %, as Betrag 92.92 and Steuer 12.08 on 3202', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '13', bmdAccount: '3202', steuercode: '1', bmdVatPercent: '13' }));
    const deposit = { number: 'WXPBFNSN-1_Liabilities/Reduced:13.00', name: 'Liabilities for Reservation WXPBFNSN-1 (13%)', type: 'Liabilities', parentNumber: '3000' };
    const folio = { number: 'WXPBFNSN-1_Receivables', name: 'Receivables for Reservation WXPBFNSN-1', type: 'Receivables', parentNumber: '1200' };
    const line = ledgerLine({ debit: folio, credit: deposit, grossCents: -10_500, netCents: -9_292, netPrecise: '-92.92035398', taxes: tax(13, -1_208, '-12.07964602'), sourceEntryNumber: '000000025' });
    const { booking, findings, summary } = single(line, mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '3202', gkonto: '2390', betragCents: 9_292, tax: { steuercode: 1, prozent: 13, steuerCents: 1_208 } });
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 10_500, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ ratePercent: 13, netCents: -9_292, vatCents: -1_208, grossCents: -10_500, apaleoVat: '-12.07964602' }]);
  });

  it('books a refund as a negative prepayment on the 0 % deposit 3209 without tax fields, counted as released and refunded', () => {
    const line = ledgerLine({ debit: ACCOUNTS.maestro, credit: ACCOUNTS.liabilities0, command: 'PostPrepayment', grossCents: -1_000, netCents: -1_000, taxes: [], sourceEntryNumber: '000000028' });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '3209', gkonto: '2890', betragCents: 1_000 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 1_000, refundedCents: 1_000 });
    expect(summary.payments).toEqual([{ account: '2890', cents: -1_000 }]);
  });

  it('counts an overpayment parked on the 0 % deposit as received', () => {
    const { booking, summary } = single(ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilities0, grossCents: 1_000, netCents: 1_000, taxes: [] }));
    expect(booking).toMatchObject({ konto: '2390', gkonto: '3209', betragCents: 1_000 });
    expect(summary.deposits).toEqual({ receivedCents: 1_000, releasedCents: 0, refundedCents: 0 });
  });

  it('sums the accounts-receivable movement and lists the /Offset lines as skipped, unsigned', () => {
    const offset = { ...ACCOUNTS.accountsReceivable, number: `${ACCOUNTS.accountsReceivable.number}/Offset` };
    const transfer = { command: 'PostToAccountsReceivables', taxes: [] };
    const { bookings, skipped, summary } = post([
      ledgerLine({ ...transfer, debit: ACCOUNTS.receivables, credit: offset, grossCents: -9_500, sourceEntryNumber: '000000030' }),
      ledgerLine({ ...transfer, debit: ACCOUNTS.accountsReceivable, credit: offset, grossCents: 9_500, sourceEntryNumber: '000000030' }),
      payment({ credit: ACCOUNTS.offset, grossCents: 90 }),
      payment({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.offset, grossCents: -90 }),
    ]);
    expect(bookings.map((b) => [b.konto, b.gkonto, b.betragCents])).toEqual([
      ['200000', '2390', 9_500],
      ['2890', '2390', 90],
    ]);
    expect(summary.accountsReceivableCents).toBe(9_500);
    expect(skipped).toHaveLength(2);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 2, grossCents: 9_590 }]);
  });
});

describe('skipped lines', () => {
  it('skips a 50.00 move between two guest folios that both map to 2390 as SAME_ACCOUNT', () => {
    const { bookings, skipped, summary, findings } = single(
      ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.folio, command: 'MoveLineItem', grossCents: 5_000, taxes: [] }),
    );
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['SAME_ACCOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 1, grossCents: 5_000 }]);
  });

  it('always skips lines on Vat and VatOnLiabilities accounts, without needing a mapping row', () => {
    const unmappedVat = { number: 'Vat_Special:5.00', name: 'VAT Special (5%)', type: 'Vat' };
    const lines = [
      ledgerLine({ debit: ACCOUNTS.receivables, credit: unmappedVat, grossCents: 160, taxes: [] }),
      ledgerLine({ debit: ACCOUNTS.liabilities, credit: ACCOUNTS.vatOnLiabilities10, command: 'PostPrepaymentVat', grossCents: 1_500, taxes: tax(10, 1_500) }),
    ];
    const { bookings, skipped, summary, findings } = post(lines);
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE', 'VAT_ACCOUNT_LINE']);
    expect(summary.skipped).toEqual([{ reason: 'VAT_ACCOUNT_LINE', lines: 2, grossCents: 1_660 }]);
  });

  it('skips lines with a zero gross amount as ZERO_AMOUNT', () => {
    const { bookings, skipped, summary } = single(ledgerLine({ grossCents: 0, netCents: 0, taxes: [] }));
    expect(bookings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['ZERO_AMOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'ZERO_AMOUNT', lines: 1, grossCents: 0 }]);
  });
});

describe('bad debt and cancellation fees (b05)', () => {
  /** The EKR template's bad-debt wildcards and a 4091 row for the cancellation fee, as init-mapping writes them. */
  const lossRows = [
    mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '10', bmdAccount: '7800', steuercode: '1', bmdVatPercent: '10' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '20', bmdAccount: '7801', steuercode: '1', bmdVatPercent: '20' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '0', bmdAccount: '7809', bmdVatPercent: '0' }),
  ];
  const cancellation = { number: 'RevenueCancellationFees_Without:0.00', name: 'Stornogebühr', type: 'Revenues', parentNumber: '5000' };
  const mapping = mappingWith(
    ...lossRows,
    mappingRow({ apaleoAccount: cancellation.number, apaleoType: 'Revenues', apaleoVatPercent: '0', bmdAccount: '4091', bmdVatPercent: '0' }),
  );
  /**
   * A per-reservation bad-debt account. No write-off is recorded: the shape is
   * assumed by analogy with AR's `AHTJTGFK-1_AccountsReceivable` under `9999`.
   */
  const lossAccount = (parentNumber: string) => ({
    number: 'BSP-ABCDEF-1_LossOfAccountsReceivable',
    name: 'LossOfAccountsReceivable for Reservation BSP-ABCDEF-1',
    type: 'LossOfAccountsReceivable',
    parentNumber,
  });
  const writeOff = (parentNumber: string, overrides: Partial<LedgerLine> = {}) =>
    ledgerLine({
      debit: lossAccount(parentNumber),
      credit: ACCOUNTS.receivables,
      command: 'PostToLossOfAccountsReceivables',
      grossCents: 5_500,
      netCents: 5_000,
      taxes: tax(10, 500),
      ...overrides,
    });

  it.each(['6900', 'CollectiveDebitor_LossOfAccountsReceivable'])(
    'books a write-off of 55.00 at the 10 percent rate under parent %s as Konto 7800, Betrag 50.00 and Steuer 5.00 positive (USt-Berichtigung), Gegenkonto 2390',
    (parent) => {
      const { booking, findings, summary } = single(writeOff(parent), mapping);
      expect(findings).toEqual([]);
      expect(booking).toMatchObject({ konto: '7800', gkonto: '2390', betragCents: 5_000, tax: { steuercode: 1, prozent: 10, steuerCents: 500 }, text: 'Forderungsverlust 10 %' });
      expect(summary.writeOffsByRate).toEqual([{ ratePercent: 10, netCents: 5_000, vatCents: 500, grossCents: 5_500, apaleoVat: '5' }]);
      expect(summary.revenueByRate).toEqual([]);
      expect(summary.depositVatByRate).toEqual([]);
    },
  );

  it('books a write-off at 20 % on 7801', () => {
    const { booking, findings } = single(writeOff('6900', { grossCents: 2_400, netCents: 2_000, taxes: tax(20, 400) }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '7801', gkonto: '2390', betragCents: 2_000, tax: { steuercode: 1, prozent: 20, steuerCents: 400 } });
  });

  it('books a write-off at 13 % on 7802', () => {
    const { booking, findings, summary } = single(writeOff('6900', { grossCents: 1_130, netCents: 1_000, taxes: tax(13, 130) }), mappingWith(...lossRows.slice(0, 1), mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '13', bmdAccount: '7802', steuercode: '1', bmdVatPercent: '13' })));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '7802', gkonto: '2390', betragCents: 1_000, tax: { steuercode: 1, prozent: 13, steuerCents: 130 }, text: 'Forderungsverlust 13 %' });
    expect(summary.writeOffsByRate).toEqual([{ ratePercent: 13, netCents: 1_000, vatCents: 130, grossCents: 1_130, apaleoVat: '1.3' }]);
  });

  /** The reversal of a write-off: the bad-debt account is credited and the receivable debited. */
  const reversal = (line: LedgerLine): LedgerLine => ({ ...line, debit: line.credit, credit: line.debit });

  it('books the reversal of a 10 % write-off on 7800 with negative Betrag and Steuer, and nets writeOffsByRate to 0', () => {
    const original = writeOff('6900');
    const { bookings, findings, summary } = post([original, reversal(original)], mapping);
    expect(findings).toEqual([]);
    expect(bookings[1]).toMatchObject({ konto: '7800', gkonto: '2390', betragCents: -5_000, tax: { steuercode: 1, prozent: 10, steuerCents: -500 } });
    expect(summary.writeOffsByRate).toEqual([{ ratePercent: 10, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }]);
    expect(summary.accounts.find((a) => a.account === '7800')?.balanceCents).toBe(0);
  });

  it('books the reversal of an untaxed write-off on 7809 with negative Betrag and no tax fields, and nets writeOffsByRate to 0', () => {
    const original = writeOff('6900', { grossCents: 3_000, netCents: 3_000, taxes: [] });
    const { bookings, findings, summary } = post([original, reversal(original)], mapping);
    expect(findings).toEqual([]);
    expect(bookings[1]).toMatchObject({ konto: '7809', gkonto: '2390', betragCents: -3_000 });
    expect(bookings[1]?.tax).toBeUndefined();
    expect(summary.writeOffsByRate).toEqual([{ ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }]);
    expect(summary.accounts.find((a) => a.account === '7809')?.balanceCents).toBe(0);
  });

  it('books a write-off 30.00 without tax entries on 7809 without tax fields, and sums write-offs per rate', () => {
    const { bookings, findings, summary } = post([writeOff('6900', { grossCents: 3_000, netCents: 3_000, taxes: [] }), writeOff('6900')], mapping);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ konto: '7809', gkonto: '2390', betragCents: 3_000, text: 'Forderungsverlust 0 %' });
    expect(bookings[0]?.tax).toBeUndefined();
    expect(summary.writeOffsByRate).toEqual([
      { ratePercent: 0, netCents: 3_000, vatCents: 0, grossCents: 3_000, apaleoVat: '0' },
      { ratePercent: 10, netCents: 5_000, vatCents: 500, grossCents: 5_500, apaleoVat: '5' },
    ]);
  });

  it('blocks a taxed write-off on a bad-debt row without Steuercode with E-VAT-MISSING', () => {
    const untaxed = mappingWith(mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '10', bmdAccount: '7800', bmdVatPercent: '' }));
    const { bookings, findings } = single(writeOff('6900'), untaxed);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('Change the row for BSP-ABCDEF-1_LossOfAccountsReceivable (LossOfAccountsReceivable) on mapping line 2 (BMD 7800)');
  });

  it('books an untaxed cancellation fee 80.00 on 4091 without tax fields, with the revenue account leading', () => {
    const { booking, findings, summary } = single(ledgerLine({ credit: cancellation, grossCents: 8_000, netCents: 8_000, taxes: [] }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ konto: '4091', gkonto: '2390', betragCents: -8_000, text: 'Erlös Stornogebühr 0 %' });
    expect(booking?.tax).toBeUndefined();
    expect(summary.revenueByRate).toEqual([{ ratePercent: 0, netCents: 8_000, vatCents: 0, grossCents: 8_000, apaleoVat: '0' }]);
  });

  it('blocks a no-show taxed at 10 % on an account mapped without Steuercode with E-VAT-MISSING naming the row, and never changes its tax', () => {
    const noShow = { number: 'RevenueNoShow_VeryReduced:10.00', name: 'Revenues No-show (10%)', type: 'Revenues', parentNumber: '5000' };
    const untaxed = mappingWith(mappingRow({ apaleoAccount: noShow.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4091', bmdVatPercent: '0' }));
    const { bookings, findings } = single(ledgerLine({ credit: noShow, grossCents: 8_800, netCents: 8_000, taxes: tax(10, 800) }), untaxed);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('carries 8.00 VAT at 10 %');
    expect(findings[0]?.message).toContain('Change the row for RevenueNoShow_VeryReduced:10.00 (Revenues) on mapping line 2 (BMD 4091)');
  });
});

describe('movement model in the summary', () => {
  it('gives Konto the Betrag and Gegenkonto the Betrag plus Steuer', () => {
    const { summary } = post([ledgerLine(), payment({ grossCents: 11_000 })]);
    expect(summary.accounts).toEqual([
      { account: '2390', sollCents: 11_000, habenCents: 11_000, balanceCents: 0 },
      { account: '2890', sollCents: 11_000, habenCents: 0, balanceCents: 11_000 },
      { account: '4000', sollCents: 0, habenCents: 10_000, balanceCents: -10_000 },
    ]);
  });
});
