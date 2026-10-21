import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { checkCoverage, checkMapping, rowRate, type CheckMappingOptions, type CoverageOptions, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { releaseRateOf } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from '../helpers/apaleo.js';
import { FakeSource } from '../helpers/fake-source.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingOf, mappingRow } from '../helpers/mapping.js';

const check = (rows: MappingRowValues[], options: Partial<CheckMappingOptions> = {}) => {
  const lengths = { sachkontenlaenge: 4, personenkontenlaenge: 6, ...options };
  return checkMapping(mappingOf(rows, lengths.sachkontenlaenge), lengths);
};
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);
const revenue = (values: Partial<MappingRowValues> = {}) =>
  mappingRow({ apaleoAccount: 'RevenueAccommodation_VeryReduced:10.00', apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10', ...values });

describe('checkMapping', () => {
  it('passes a valid mapping', () => {
    const findings = check([
      revenue(),
      revenue({ apaleoAccount: 'RevenueFoodAndBeverages_Normal:20.00', apaleoVatPercent: '20', bmdAccount: '4020', bmdVatPercent: '20', kost: '20' }),
      revenue({ apaleoAccount: 'RevenueOther_Special:4.90', apaleoVatPercent: '4.9', bmdAccount: '4050', bmdVatPercent: '4,9' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '200000' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', bmdAccount: '2890' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '13', bmdAccount: '3202', steuercode: '1', bmdVatPercent: '13' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209', bmdVatPercent: '0' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', bmdAccount: '3580' }),
    ]);
    expect(findings).toEqual([]);
  });

  it('reports a VAT mismatch naming the row and both rates', () => {
    const [finding, ...rest] = check([revenue({ bmdAccount: '4020', bmdVatPercent: '20' })]);
    expect(rest).toEqual([]);
    expect(finding?.code).toBe('E-VAT-MISMATCH');
    expect(finding?.message).toContain('line 2');
    expect(finding?.message).toContain('VAT 10 %');
    expect(finding?.message).toContain('books 20 % on BMD account 4020');
  });

  it('warns W-VAT-RATE-UNUSUAL for a German mapping copied at 7 %, naming the Austrian rates', () => {
    const findings = check([revenue({ apaleoVatPercent: '7', bmdVatPercent: '7' })]);
    expect(codes(findings)).toEqual(['W-VAT-RATE-UNUSUAL']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain('0 %, 4.9 %, 10 %, 13 %, 20 %');
  });

  it.each([
    ['2', 'Vorsteuer'],
    ['3', 'Vorsteuer-Berichtigung'],
  ])('reports E-STEUERCODE-INPUT-TAX for the NTCS code %s on a revenue row', (code, meaning) => {
    const findings = check([revenue({ steuercode: code })]);
    expect(codes(findings)).toEqual(['E-STEUERCODE-INPUT-TAX']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain(`Steuercode ${code} means ${meaning} in BMD NTCS`);
  });

  it('rejects input-tax codes on every revenue-side type, but not on a house row', () => {
    for (const apaleoType of ['Liabilities', 'CityTaxes', 'SecondCityTax', 'GuestLevies', 'LossOfAccountsReceivable']) {
      expect(codes(check([mappingRow({ apaleoAccount: 'X', apaleoType, bmdAccount: '3580', steuercode: '2', bmdVatPercent: '20' })])), apaleoType).toEqual([
        'E-STEUERCODE-INPUT-TAX',
      ]);
    }
    expect(codes(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', bmdAccount: '7000', steuercode: '2', bmdVatPercent: '20' })]))).toEqual([
      'W-STEUERCODE-UNCHECKED',
    ]);
  });

  it.each(['Payments', 'Receivables', 'AccountsReceivable'])('rejects a Steuercode on a %s row with E-STEUERCODE-NOT-ALLOWED', (apaleoType) => {
    const findings = check([mappingRow({ apaleoAccount: '1200', apaleoType, bmdAccount: '2390', steuercode: '1', bmdVatPercent: '10' })]);
    expect(codes(findings)).toEqual(['E-STEUERCODE-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain(`apaleo type ${apaleoType} is a payment, guest claim or Debitor`);
    expect(codes(check([mappingRow({ apaleoAccount: '1200', apaleoType, bmdAccount: '2390', steuercode: '0', bmdVatPercent: '0' })]))).toEqual([
      'E-STEUERCODE-NOT-ALLOWED',
    ]);
  });

  describe('deposit rows (Anzahlungen, b05)', () => {
    const deposit = (steuercode: string) =>
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode, bmdVatPercent: '10' });

    it('passes a deposit row at 10 % on 3200 with Steuercode 1 in NTCS', () => {
      expect(check([deposit('1')], { dialect: 'ntcs' })).toEqual([]);
    });

    it.each([
      ['2', 'Vorsteuer'],
      ['3', 'Vorsteuer-Berichtigung'],
    ])('refuses the input-tax code %s on a deposit row in NTCS with E-STEUERCODE-INPUT-TAX', (code, meaning) => {
      const findings = check([deposit(code)], { dialect: 'ntcs' });
      expect(codes(findings)).toEqual(['E-STEUERCODE-INPUT-TAX']);
      expect(findings[0]?.message).toContain('line 2');
      expect(findings[0]?.message).toContain(`Steuercode ${code} means ${meaning} in BMD NTCS`);
      expect(findings[0]?.message).toContain('Use the Umsatzsteuer code 1');
    });
  });

  it('accepts the BMD 5.5 Soll-USt code 3 with bmd.dialect bmd55, and rejects 0 there', () => {
    expect(check([revenue({ steuercode: '3' })], { dialect: 'bmd55' })).toEqual([]);
    expect(check([revenue({ steuercode: '1' })], { dialect: 'bmd55' })).toEqual([]);
    const findings = check([revenue({ steuercode: '0' })], { dialect: 'bmd55' });
    expect(codes(findings)).toEqual(['E-STEUERCODE-INPUT-TAX']);
    expect(findings[0]?.message).toContain('Steuercode 0 means Vorsteuer in BMD 5.5');
  });

  it('accepts a non-taxable code at rate 0 with W-STEUERCODE-UNCHECKED only', () => {
    const findings = check([mappingRow({ apaleoAccount: 'RevenueCancellationFees_Without:0.00', apaleoType: 'Revenues', apaleoVatPercent: '0', bmdAccount: '4090', steuercode: '81', bmdVatPercent: '0' })]);
    expect(codes(findings)).toEqual(['W-STEUERCODE-UNCHECKED']);
    expect(findings[0]?.message).toContain('Steuercode 81');
  });

  it('warns W-UNTAXED-REVENUE for revenue at 0 % without Steuercode: the BMD account must not carry a fixed Steuercode', () => {
    const findings = check([mappingRow({ apaleoAccount: 'RevenueCancellationFees_Without:0.00', apaleoType: 'Revenues', apaleoVatPercent: '0', bmdAccount: '4090' })]);
    expect(codes(findings)).toEqual(['W-UNTAXED-REVENUE']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain('must not carry a fixed Steuercode');
  });

  it('warns W-KOST-IGNORED for a Kostenstelle on a payment row, and E-KOST-FORMAT for one that is not digits', () => {
    const ignored = check([mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', bmdAccount: '2890', kost: '10' })]);
    expect(codes(ignored)).toEqual(['W-KOST-IGNORED']);
    expect(ignored[0]?.message).toContain('line 2');
    expect(codes(check([mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', bmdAccount: '2890', kost: 'K10' })]))).toEqual(['E-KOST-FORMAT']);
    expect(codes(check([revenue({ kost: '1234567890' })]))).toEqual(['E-KOST-FORMAT']);
    expect(check([revenue({ kost: '123456789' })])).toEqual([]);
  });

  it('reports E-STEUERCODE-MISSING for a rate without Steuercode, and E-VAT-RATE-MISSING for a Steuercode without rate', () => {
    expect(codes(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', bmdAccount: '7000', bmdVatPercent: '10' })]))).toEqual(['E-STEUERCODE-MISSING']);
    // Without a Steuercode BMD books no tax, so a 10 % apaleo account also mismatches.
    expect(codes(check([mappingRow({ apaleoAccount: 'X', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', bmdVatPercent: '10' })]))).toEqual([
      'E-STEUERCODE-MISSING',
      'E-VAT-MISMATCH',
    ]);
    expect(codes(check([revenue({ bmdVatPercent: '' })]))).toEqual(['E-VAT-RATE-MISSING']);
  });

  it('rejects a Steuercode that is not a whole number from 0 to 99 and a rate that is no percentage', () => {
    expect(codes(check([revenue({ steuercode: '100' })]))).toEqual(['E-STEUERCODE-FORMAT']);
    expect(codes(check([revenue({ steuercode: 'U1' })]))).toEqual(['E-STEUERCODE-FORMAT']);
    expect(codes(check([revenue({ bmdVatPercent: 'zehn' })]))).toEqual(['E-VAT-PERCENT']);
  });

  it('reports E-ACCOUNT-LENGTH for 2890 at Sachkontenlänge 5, suggesting 28900 and never padding to 02890', () => {
    const [finding, ...rest] = check([mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', bmdAccount: '2890' })], { sachkontenlaenge: 5 });
    expect(rest).toEqual([]);
    expect(finding?.code).toBe('E-ACCOUNT-LENGTH');
    expect(finding?.message).toContain('needs exactly 5 digits as a Sachkonto');
    expect(finding?.message).toContain('for example 28900');
    expect(finding?.message).toContain('format the column as Text');
    expect(finding?.message).not.toContain('02890');
  });

  it('accepts the Sammeldebitor 200000 as Personenkonto on an AccountsReceivable row, and a Sachkonto there too', () => {
    expect(check([mappingRow({ apaleoAccount: 'CollectiveDebitor_AccountsReceivable', apaleoType: 'AccountsReceivable', bmdAccount: '200000' })])).toEqual([]);
    expect(check([mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '2000' })])).toEqual([]);
    expect(codes(check([mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '200000' })], { personenkontenlaenge: 5 }))).toEqual([
      'E-ACCOUNT-LENGTH',
    ]);
    // Only AccountsReceivable rows may name a Personenkonto.
    expect(codes(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', bmdAccount: '200000' })]))).toEqual(['E-ACCOUNT-LENGTH']);
  });

  it('rejects an account that is not digits only', () => {
    const findings = check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', bmdAccount: '40O0' })]);
    expect(codes(findings)).toEqual(['E-ACCOUNT-LENGTH']);
    expect(findings[0]?.message).toContain('must contain digits only');
  });

  it('ignores rows for Vat and VatOnLiabilities accounts with a note', () => {
    const findings = check([
      mappingRow({ apaleoAccount: 'Vat_VeryReduced:10.00', apaleoType: 'Vat', bmdAccount: 'x' }),
      mappingRow({ apaleoAccount: 'LiabilitiesVat_VeryReduced:10.00', apaleoType: 'VatOnLiabilities' }),
    ]);
    expect(codes(findings)).toEqual(['N-VAT-ROW-IGNORED']);
    expect(findings[0]?.message).toContain('2 row(s)');
  });

  it('warns about unknown apaleo types', () => {
    expect(codes(check([mappingRow({ apaleoAccount: '1', apaleoType: 'Revenue', bmdAccount: '4000' })]))).toEqual(['W-UNKNOWN-TYPE']);
  });

  it('gives the rate of a row: bmd_vat_percent with a Steuercode, 0 without one', () => {
    expect(rowRate({ steuercode: '1', bmdVatPercent: '4,9' })).toBe(4.9);
    expect(rowRate({ steuercode: '', bmdVatPercent: '' })).toBe(0);
    expect(rowRate({ steuercode: '1', bmdVatPercent: '' })).toBeUndefined();
  });
});

describe('checkCoverage', () => {
  const lines = (overrides: Partial<LedgerLine>[]) => overrides.map((o) => ledgerLine(o));
  const coverage = (mapping: Mapping, ledger: LedgerLine[], chart?: ChartIndex, options: Partial<CoverageOptions> = {}) =>
    checkCoverage(mapping, ledger, chart, { sachkontenlaenge: 4, rateOf: releaseRateOf(ledger, chart), ...options });
  const RECEIVABLES = mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', bmdAccount: '2390' });

  it('reports a new revenue account with number, type, name, line count and gross total, and writes no file', () => {
    const mapping = mappingOf([RECEIVABLES]);
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const findings = coverage(mapping, lines([{ credit, grossCents: 5000 }, { credit, grossCents: 2550 }]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '5010' });
    expect(findings[0]?.message).toBe(
      'apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 75.50): add a row with apaleo_account 5010, apaleo_type Revenues and a BMD account',
    );
  });

  it('treats a row without a BMD account as unmapped and points at its line: Ortstaxe until the user fills it in', () => {
    const mapping = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' })]);
    const [finding] = coverage(mapping, lines([{ credit: { number: '3501', name: 'City Tax (no VAT)', type: 'CityTaxes' }, taxes: [] }]));
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: '3501' });
    expect(finding?.message).toContain('fill in bmd_account on line 3');
  });

  it('suggests the Sammeldebitor at the Personenkontenlänge for an unmapped AccountsReceivable account', () => {
    const debit = { number: 'BSP-X-1_AccountsReceivable', name: 'AR', type: 'AccountsReceivable', parentNumber: '9999' };
    const [six] = coverage(mappingOf([RECEIVABLES]), lines([{ debit, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' } }]));
    expect(six?.message).toContain('`*;AccountsReceivable;;;200000` (Sammeldebitor)');
    const [five] = coverage(mappingOf([RECEIVABLES]), lines([{ debit, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' } }]), undefined, {
      personenkontenlaenge: 5,
    });
    expect(five?.message).toContain('`*;AccountsReceivable;;;20000` (Sammeldebitor)');
  });

  it('suggests a rate wildcard with the Steuercode for a VAT-relevant account without a row', () => {
    const credit = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const [finding] = coverage(mappingOf([RECEIVABLES]), lines([{ credit }]));
    expect(finding?.message).toContain('or a wildcard row (*) for Liabilities at 10 %: `*;Liabilities;;10;<BMD account>;1;10` (template: 3200)');
    const [bmd55] = coverage(mappingOf([RECEIVABLES]), lines([{ credit }]), undefined, { dialect: 'bmd55' });
    expect(bmd55?.message).toContain('`*;Liabilities;;10;<BMD account>;3;10`');
  });

  it('resolves an untaxed deposit release with the inferred rate only, never through the 0 % row', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const receivables = { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' };
    const release = ledgerLine({ debit: liabilities, credit: receivables, taxes: [], reference: 'BSP-X-1' });
    const without = ledgerLine({ debit: liabilities, credit: receivables, taxes: [tax('Without', 0, 0)] });
    const taxed = ledgerLine({ debit: liabilities, credit: receivables, taxes: [tax('VeryReduced', 10, 1_000)] });
    const untaxedRevenue = ledgerLine({ credit: { number: 'R0', name: 'No VAT', type: 'Revenues' }, taxes: [] });
    const rateOf = releaseRateOf([release, without, taxed, untaxedRevenue], undefined);
    expect([release, without, taxed, untaxedRevenue].map(rateOf)).toEqual([undefined, undefined, 10, 0]);

    const pair = ledgerLine({
      debit: { number: 'LiabilitiesVat_VeryReduced:10.00', name: 'LiabilitiesVat Very Reduced (10%)', type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: 1_000,
      taxes: [tax('VeryReduced', 10, 1_000)],
      reference: 'BSP-X-1',
    });
    expect(releaseRateOf([release, pair], undefined)(release)).toBe(10);

    // An untaxed refund resolves through the same pair; without it, it stays at 0 %.
    const refund = ledgerLine({ debit: liabilities, credit: { number: '1102', name: 'Visa', type: 'Payments' }, taxes: [], reference: 'BSP-X-1' });
    expect(releaseRateOf([refund, pair], undefined)(refund)).toBe(10);
    expect(releaseRateOf([refund], undefined)(refund)).toBe(0);

    // mapping check --from --to: the release resolves through the 10 % wildcard and passes.
    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209', bmdVatPercent: '0' }),
    ]);
    expect(coverage(mapping, [release, pair])).toEqual([]);
  });

  it('skips lines with a Vat or VatOnLiabilities side and accepts rates from the caller', () => {
    const mapping = mappingOf([
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
      RECEIVABLES,
    ]);
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const vat = { number: 'LiabilitiesVat_VeryReduced:10.00', name: 'LiabilitiesVat', type: 'VatOnLiabilities' };
    const release = { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [] };
    expect(coverage(mapping, lines([{ debit: liabilities, credit: vat }]))).toEqual([]);
    expect(codes(coverage(mapping, lines([release])))).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(coverage(mapping, lines([release]), undefined, { rateOf: () => 10 })).toEqual([]);
  });

  it('finds the unmapped accounts of the Hotel Beispiel fixtures through a FakeSource', async () => {
    const fake = new FakeSource(await loadBeispielData());
    const chart = new ChartIndex(await fake.getChartOfAccounts(BSP));
    const ledger = await fake.getLedger(BSP, '2026-09-14', '2026-09-23');
    const mapping = mappingOf([
      revenue(),
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', bmdAccount: '2390' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', bmdAccount: '2890' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209', bmdVatPercent: '0' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' }),
    ]);
    expect(coverage(mapping, ledger, chart).map((f) => [f.code, f.value])).toEqual([
      ['E-UNMAPPED', '9999'],
      ['E-UNMAPPED', '3501'],
      ['E-UNMAPPED', 'RevenueFoodAndBeverages_Normal:20.00'],
      ['E-UNMAPPED', 'RevenueFoodAndBeverages_VeryReduced:10.00'],
    ]);
  });

  it('reports untaxed deposit releases without an inferable rate once, never through the 0 % row', () => {
    const release = (n: number) => ({
      debit: { number: `BSP-X-${n}_Liabilities`, name: 'Liabilities', type: 'Liabilities' },
      credit: { number: `BSP-X-${n}_Receivables`, name: 'R', type: 'Receivables' },
      taxes: [],
      grossCents: 5000,
      reference: `BSP-X-${n}`,
    });
    const ledger = lines([release(1), release(2), release(3), release(4), release(1)]);
    const zero = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209', bmdVatPercent: '0' })]);
    const findings = coverage(zero, ledger);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]).toMatchObject({ value: 'BSP-X-1_Liabilities' });
    expect(findings[0]?.message).toMatch(
      /^5 deposit releases \(5 lines, gross 250\.00, accounts BSP-X-1_Liabilities, BSP-X-2_Liabilities, BSP-X-3_Liabilities and 1 more\): apaleo settled a guest's prepaid deposit against the bill without a VAT amount, and the VAT rate cannot be found/,
    );
    expect(findings[0]?.message).not.toContain('3209');
  });

  it('asks for a deposit row at the inferred rate of 20 % when the mapping has none', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const ledger = lines([
      { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [], grossCents: 12_000, reference: 'BSP-X-1' },
      {
        debit: { number: 'LiabilitiesVat_Normal:20.00', name: 'LiabilitiesVat Normal (20%)', type: 'VatOnLiabilities' },
        credit: liabilities,
        command: 'PostPrepaymentVat',
        grossCents: 2_000,
        taxes: [tax('Normal', 20, 2_000)],
        reference: 'BSP-X-1',
      },
    ]);
    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
    ]);
    const [finding, ...rest] = coverage(mapping, ledger);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: 'BSP-X-1_Liabilities' });
    expect(finding?.message).toContain('or a wildcard row (*) for Liabilities at 20 %: `*;Liabilities;;20;<BMD account>;1;20` (template: 3201)');
  });

  describe('accounts of reservations and folios (outside the chart, with a parent)', () => {
    const chart = new ChartIndex([
      { number: '3000', name: 'Liabilities', type: 'Liabilities', ledger: 'guest', isArchived: false, hasChildren: true },
      { number: '9999', name: 'Accounts Receivable', type: 'AccountsReceivable', ledger: 'guest', isArchived: false, hasChildren: true },
    ]);
    const receivables = { number: 'R-1_Receivables', name: 'Receivables for Reservation R-1', type: 'Receivables', parentNumber: '1200' };
    const deposit = (id: string) => ({ number: `${id}_Liabilities/Reduced:13.00`, name: `Liabilities for Reservation ${id} (13%)`, type: 'Liabilities', parentNumber: '3000' });
    const base = [RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', bmdAccount: '2890' })];
    const atThirteen = (id: string) => ledgerLine({ debit: receivables, credit: deposit(id), command: 'PostCharge', grossCents: -1130, taxes: [tax('Reduced', 13, -130)] });

    it('reports three deposits at 13 % under the empty 3000 row on line 40 once, with the wildcard row to add and the template account 3202', () => {
      const filler = Array.from({ length: 36 }, (_, i) => mappingRow({ apaleoAccount: `H${i}`, apaleoType: 'House' }));
      const mapping = mappingOf([...base, ...filler, mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' })]);
      expect(mapping.rows.at(-1)?.line).toBe(40);
      const findings = coverage(mapping, ['A-1', 'B-1', 'C-1'].map(atThirteen), chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '3000' });
      expect(findings[0]?.message).toBe(
        '3 Liabilities accounts of reservations or folios under parent 3000 at 13 % (A-1_Liabilities/Reduced:13.00, B-1_Liabilities/Reduced:13.00, ' +
          'C-1_Liabilities/Reduced:13.00) are not mapped (3 lines, gross -33.90): the parent row for 3000 on line 40 has no BMD account ' +
          'and does not apply to Liabilities at different VAT rates; add a wildcard row `*;Liabilities;;13;<BMD account>;1;13` (template: 3202)',
      );
      expect(findings[0]?.message).not.toContain('fill in');
    });

    it('names an existing empty wildcard row by its line instead of asking to add it', () => {
      const mapping = mappingOf([
        ...base,
        mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' }),
        mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '13' }),
      ]);
      const [finding, ...rest] = coverage(mapping, [atThirteen('A-1')], chart);
      expect(rest).toEqual([]);
      expect(finding?.message).toContain(
        'the parent row for 3000 on line 4 has no BMD account and does not apply to Liabilities at different VAT rates; ' +
          'fill in bmd_account on the wildcard row for Liabilities at 13 % on line 5',
      );
      expect(finding?.message).not.toContain('add a wildcard row');
    });

    it('suggests the wildcard row with the template account when there is no parent row at all, scaled to the Sachkontenlänge', () => {
      expect(coverage(mappingOf(base), [atThirteen('A-1')], chart)[0]?.message).toMatch(/: add a wildcard row `\*;Liabilities;;13;<BMD account>;1;13` \(template: 3202\)$/);
      expect(coverage(mappingOf(base), [atThirteen('A-1')], chart, { sachkontenlaenge: 5 })[0]?.message).toMatch(/\(template: 32020\)$/);
    });

    it('reports a per-reservation debtor and its /Offset once and suggests a 9999 row or the Sammeldebitor wildcard', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AccountsReceivable for Reservation AHTJTGFK-1', type: 'AccountsReceivable', parentNumber: '9999' };
      const offset = { ...debtor, number: `${debtor.number}/Offset`, name: `${debtor.name} (Offset)` };
      const ledger = [
        ledgerLine({ debit: receivables, credit: offset, command: 'PostToAccountsReceivables', grossCents: -9500, taxes: [] }),
        ledgerLine({ debit: debtor, credit: offset, command: 'PostToAccountsReceivables', grossCents: 9500, taxes: [] }),
      ];
      const findings = coverage(mappingOf(base), ledger, chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(
        /^2 AccountsReceivable accounts of reservations or folios under parent 9999 \(AHTJTGFK-1_AccountsReceivable, AHTJTGFK-1_AccountsReceivable\/Offset\) are not mapped \(3 lines, gross [-\d.]+\): add a row for 9999 AccountsReceivable or the wildcard row `\*;AccountsReceivable;;;200000` \(Sammeldebitor\)$/,
      );
    });

    it('passes once the AccountsReceivable wildcard exists', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AR', type: 'AccountsReceivable', parentNumber: '9999' };
      const mapping = mappingOf([...base, mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '200000' })]);
      expect(coverage(mapping, [ledgerLine({ debit: debtor, credit: receivables, taxes: [] })], chart)).toEqual([]);
    });
  });

  it('reports E-VAT-MISMATCH when only the parent row 5000 maps revenue at 20 % and the period books 10 %', () => {
    const mapping = mappingOf([mappingRow({ apaleoAccount: '5000', apaleoType: 'Revenues', apaleoName: 'Revenues', bmdAccount: '4030', steuercode: '1', bmdVatPercent: '20' }), RECEIVABLES]);
    const accommodation = { number: 'RevenueAccommodation_VeryReduced:10.00', name: 'Revenues Accommodation (10%)', type: 'Revenues', parentNumber: '5000' };
    const food = { number: 'RevenueFoodAndBeverages_VeryReduced:10.00', name: 'Revenues Food and beverages (10%)', type: 'Revenues', parentNumber: '5000' };
    const drinks = { number: 'RevenueFoodAndBeverages_Normal:20.00', name: 'Revenues Food and beverages (20%)', type: 'Revenues', parentNumber: '5000' };
    const ledger = lines([{ credit: accommodation }, { credit: food, grossCents: 1320, taxes: [tax('VeryReduced', 10, 120)] }, { credit: food, grossCents: 1320, taxes: [tax('VeryReduced', 10, 120)] }, { credit: drinks, grossCents: 360, taxes: [tax('Normal', 20, 60)] }]);
    const findings = coverage(mapping, ledger);
    expect(codes(findings)).toEqual(['E-VAT-MISMATCH', 'E-VAT-MISMATCH']);
    expect(findings.map((f) => f.value)).toEqual([accommodation.number, food.number]);
    expect(findings[1]?.message).toBe(
      'apaleo account RevenueFoodAndBeverages_VeryReduced:10.00 (Revenues, "Revenues Food and beverages (10%)") is booked at 10 % (2 lines, gross 26.40), ' +
        'but it uses line 2 (apaleo account 5000) of the mapping, which books 20 % on BMD account 4030. ' +
        'Add a row for RevenueFoodAndBeverages_VeryReduced:10.00 Revenues with a BMD account for 10 %',
    );
  });

  it('leaves the rate of a row with its own apaleo_vat_percent to checkMapping', () => {
    const mapping = mappingOf([revenue({ bmdAccount: '4020', bmdVatPercent: '20' }), RECEIVABLES]);
    expect(coverage(mapping, lines([{}]))).toEqual([]);
    expect(codes(checkMapping(mapping, { sachkontenlaenge: 4, personenkontenlaenge: 6 }))).toEqual(['E-VAT-MISMATCH']);
  });
});
