import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef } from '../../src/core/source.js';
import { lineRate, resolve } from '../../src/mapping/index.js';
import { loadBeispielData, BSP } from '../helpers/apaleo.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingOf, mappingRow } from '../helpers/mapping.js';

const ref = (number: string, type: string, parentNumber?: string): AccountRef => ({
  number,
  name: number,
  type,
  ...(parentNumber ? { parentNumber } : {}),
});

const ACC10 = 'RevenueAccommodation_VeryReduced:10.00';
const mapping = mappingOf([
  mappingRow({ apaleoAccount: ACC10, apaleoType: 'Revenues', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10' }),
  mappingRow({ apaleoAccount: 'RevenueAccommodation', apaleoType: 'Revenues', bmdAccount: '4001', steuercode: '1', bmdVatPercent: '20' }),
  mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', bmdAccount: '2390' }),
  mappingRow({ apaleoAccount: '1102', apaleoType: '*any*', bmdAccount: '2891' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', bmdAccount: '2391' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', bmdAccount: '2890' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '20', bmdAccount: '3201', steuercode: '1', bmdVatPercent: '20' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209' }),
  mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' }),
]);

const bmd = (account: AccountRef, rate: number | undefined = 0, chart?: ChartIndex) =>
  resolve(mapping, account, { rate, ...(chart ? { chart } : {}) })?.bmdAccount;

describe('resolution order', () => {
  it('(1) takes the exact number and type first', () => {
    expect(bmd(ref(ACC10, 'Revenues', '5000'))).toBe('4000');
  });

  it('(2) then the number with any type', () => {
    expect(bmd(ref('1102', 'Payments'))).toBe('2891');
  });

  it('(3) then the parent chain from the chart, with the same type', async () => {
    const chart = new ChartIndex((await loadBeispielData()).charts[BSP] ?? []);
    const acc20 = 'RevenueAccommodation_Normal:20.00';
    expect(bmd(ref(acc20, 'Revenues'), 20, chart)).toBe('4001');
    // The chart wins over the line: the line names 5000, the chart RevenueAccommodation.
    expect(bmd(ref(acc20, 'Revenues', '5000'), 20, chart)).toBe('4001');
    expect(bmd(ref(acc20, 'Payments', 'RevenueAccommodation'))).toBe('2890');
  });

  it('resolves a per-reservation account with a parent to the parent row', () => {
    expect(bmd(ref('BSP-EXT-1_Receivables', 'Receivables', '1200'))).toBe('2390');
  });

  it('(4) uses the rate wildcard for VAT-relevant types', () => {
    expect(bmd(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 10)).toBe('3200');
    expect(bmd(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 20)).toBe('3201');
    expect(bmd(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 0)).toBe('3209');
    expect(bmd(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 13)).toBeUndefined();
    expect(resolve(mapping, ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), { rate: undefined })).toBeUndefined();
  });

  it('(5) uses the plain wildcard for other types: a new payment method account', () => {
    expect(bmd(ref('1106', 'Payments', '1000'))).toBe('2890');
  });

  it('never wildcards a revenue account', () => {
    expect(bmd(ref('RevenueOther_Normal:20.00', 'Revenues'), 20)).toBeUndefined();
  });

  it('returns a row with an empty BMD account as it is (unmapped)', () => {
    expect(resolve(mapping, ref('3501', 'CityTaxes'), { rate: 0 })).toMatchObject({ bmdAccount: '', line: 11 });
  });

  it('stops on a parent cycle', () => {
    const chart = new ChartIndex([
      { number: 'A', name: 'A', type: 'House', parentNumber: 'B', ledger: 'global', isArchived: false, hasChildren: true },
      { number: 'B', name: 'B', type: 'House', parentNumber: 'A', ledger: 'global', isArchived: false, hasChildren: true },
    ]);
    expect(bmd(ref('A', 'House'), 0, chart)).toBeUndefined();
  });
});

describe('empty parent rows', () => {
  /** A file with the empty `3000;Liabilities` row a Kanzlei might keep, and the EKR deposit wildcards. */
  const v1 = mappingOf([
    mappingRow({ apaleoAccount: 'RevenueNoShow_Reduced:13.00', apaleoType: 'Revenues', apaleoVatPercent: '13' }),
    mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '20', bmdAccount: '3201', steuercode: '1', bmdVatPercent: '20' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', bmdAccount: '3209', bmdVatPercent: '0' }),
    mappingRow({ apaleoAccount: '9999', apaleoType: 'AccountsReceivable' }),
  ]);
  const at = (account: AccountRef, rate: number) => resolve(v1, account, { rate });

  it.each([
    ['EPEBVUIU-1_Liabilities/VeryReduced:10.00', 10, '3200'],
    ['MXETGHPM-1_Liabilities/Normal:20.00', 20, '3201'],
    ['EPEBVUIU-1_Liabilities/Null:0.00', 0, '3209'],
  ])('passes over the empty 3000 row: %s at %d %% resolves to %s', (number, rate, account) => {
    expect(at(ref(number, 'Liabilities', '3000'), rate)?.bmdAccount).toBe(account);
  });

  it('resolves the Austrian deposits of the recorded VIE day through the 13 % and 20 % wildcards', () => {
    const austrian = mappingOf([
      ...v1.rows,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '13', bmdAccount: '3202', steuercode: '1', bmdVatPercent: '13' }),
    ]);
    const deposit = (number: string, rate: number) => resolve(austrian, ref(number, 'Liabilities', '3000'), { rate })?.bmdAccount;
    expect(deposit('DHNEKKIT-1_Liabilities/Reduced:13.00', 13)).toBe('3202');
    expect(deposit('DHNEKKIT-1_Liabilities/Normal:20.00', 20)).toBe('3201');
  });

  it('returns the empty parent row when no wildcard gives an account, so findings can name it', () => {
    expect(at(ref('X-1_Liabilities/Reduced:13.00', 'Liabilities', '3000'), 13)).toMatchObject({ apaleoAccount: '3000', bmdAccount: '', line: 3 });
    expect(at(ref('ZAQSEFYC-1_AccountsReceivable', 'AccountsReceivable', '9999'), 0)).toMatchObject({ apaleoAccount: '9999', line: 7 });
  });

  it('keeps an exact row with an empty BMD account unmapped', () => {
    expect(at(ref('RevenueNoShow_Reduced:13.00', 'Revenues', 'RevenueNoShow'), 13)).toMatchObject({ bmdAccount: '', line: 2 });
  });

  it('resolves per-reservation debtor accounts and their /Offset through the AccountsReceivable wildcard', () => {
    const withWildcard = mappingOf([...v1.rows.filter((row) => row.apaleoAccount !== '9999'), mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '200000' })]);
    for (const number of ['AHTJTGFK-1_AccountsReceivable', 'AHTJTGFK-1_AccountsReceivable/Offset']) {
      expect(resolve(withWildcard, ref(number, 'AccountsReceivable', '9999'), { rate: 0 })?.bmdAccount).toBe('200000');
    }
  });
});

describe('per-reservation accounts without a parent (Swagger shape)', () => {
  it('resolves the debit to the Receivables wildcard and the credit to the 10 % Liabilities wildcard', () => {
    const line = ledgerLine({
      debit: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables', type: 'Receivables' },
      credit: { number: 'BSP-ABCDEF-1_Liabilities', name: 'Liabilities', type: 'Liabilities' },
      taxes: [tax('VeryReduced', 10, 2000)],
    });
    const rate = lineRate(line);
    expect(rate).toBe(10);
    expect(resolve(mapping, line.debit, { rate })?.bmdAccount).toBe('2391');
    expect(resolve(mapping, line.credit, { rate })?.bmdAccount).toBe('3200');
  });

  it('leaves a line with two different rates unmapped on the rate wildcard', () => {
    const line = ledgerLine({
      credit: { number: 'BSP-ABCDEF-1_Liabilities', name: 'Liabilities', type: 'Liabilities' },
      taxes: [
        tax('VeryReduced', 10, 100),
        tax('Normal', 20, 50),
      ],
    });
    expect(lineRate(line)).toBeUndefined();
    expect(resolve(mapping, line.credit, { rate: lineRate(line) })).toBeUndefined();
  });
});

describe('lineRate', () => {
  it('drops tax entries with percent 0 and amount 0 and gives 0 for a line without taxes', () => {
    expect(lineRate({ taxes: [tax('Without', 0, 0)] })).toBe(0);
    expect(lineRate({ taxes: [] })).toBe(0);
    expect(lineRate({ taxes: [tax('Without', 0, 0), tax('Normal', 20, 400)] })).toBe(20);
    expect(lineRate({ taxes: [tax('VeryReduced', 10, -100), tax('VeryReduced', 10, 10)] })).toBe(10);
  });
});
