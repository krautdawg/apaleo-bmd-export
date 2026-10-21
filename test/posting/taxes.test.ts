import { describe, expect, it } from 'vitest';
import { datevVat, normaliseTaxes } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { ACCOUNTS, post } from '../helpers/posting.js';

describe('normaliseTaxes', () => {
  it('drops entries with percent 0 and amount 0 and keeps every other entry', () => {
    const without = tax('Without', 0, 0);
    const reduced = tax('Reduced', 7, 654);
    const oddZero = tax('Without', 0, 12);
    expect(normaliseTaxes([without])).toEqual([]);
    expect(normaliseTaxes([without, reduced, oddZero])).toEqual([reduced, oddZero]);
    expect(normaliseTaxes([tax('Reduced', 7, 0)])).toHaveLength(1);
  });
});

describe('datevVat', () => {
  it.each([
    // gross × rate / (100 + rate), rounded half away from zero
    [10_000, 7, 654], // 700000 / 107 = 6542.06… → 654.2 → 6.54
    [1_200, 7, 79], // 8400 / 107 = 78.50… → 0.79
    [300, 19, 48], // 5700 / 119 = 47.89… → 0.48
    [2_380, 19, 380], // 45220 / 119 = 380 exactly
    [20_000, 7, 1_308], // 140000 / 107 = 1308.41… → 13.08
    [15_000, 7, 981], // 105000 / 107 = 981.30… → 9.81
    [-1_000, 7, -65], // 7000 / 107 = 65.42… → −0.65, sign of the gross amount
    [500, 0, 0],
    [107, 7, 7], // exactly 7.00 cents
    [15, 7, 1], // 105 / 107 = 0.98… → 1
    [7_490, 7, 490], // 52430 / 107 = 490 exactly
    [1_605, 7, 105], // 11235 / 107 = 105 exactly
    [3_745, 7, 245], // 26215 / 107 = 245 exactly
    [-1_605, 7, -105],
  ])('VAT on %i cents at %i %% is %i cents', (gross, rate, vat) => {
    expect(datevVat(gross, rate)).toBe(vat);
  });

  it('rounds an exact half cent away from zero, without floating-point noise', () => {
    // 1 cent at 100 %: 1 × 100 / 200 = 0.5 → 1; 3 cents: 1.5 → 2; and the negative amounts away from zero.
    expect(datevVat(1, 100)).toBe(1);
    expect(datevVat(3, 100)).toBe(2);
    expect(datevVat(-1, 100)).toBe(-1);
    expect(datevVat(-3, 100)).toBe(-2);
    // Rates with decimals: 235 cents at 17.5 % = 35 exactly; 1 cent at 50 % = 0.33… → 0.
    expect(datevVat(1, 50)).toBe(0);
    expect(datevVat(235, 17.5)).toBe(35);
  });
});

describe('VAT guard on apaleo precise tax', () => {
  it.each([
    // Precise tax from apaleo: 11400 × 7 / 107 = 745.79 → 7.46; apaleo 7.45794393 → 7.46.
    ['accommodation 114.00 at 7 %', ACCOUNTS.accommodation7, 11_400, tax('Reduced', 7, 746, '7.45794393')],
    // Recorded BER line 000000032: 1490 × 19 / 119 = 237.90 → 2.38; apaleo 2.3789916 → 2.38.
    ['drinks 14.90 at 19 %', ACCOUNTS.beverages19, 1_490, tax('Normal', 19, 238, '2.3789916')],
    // A release: −8400 × 7 / 107 = −549.53 → −5.50; apaleo −5.4953271 → −5.50.
    ['a negative allowance of 84.00 at 7 %', ACCOUNTS.accommodation7, -8_400, tax('Reduced', 7, -550, '-5.4953271')],
  ])('raises no finding for %s: sub-cent digits never count', (_name, credit, grossCents, entry) => {
    const result = post([ledgerLine({ credit, grossCents, taxes: [entry] })]);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(1);
    expect(result.summary.roundingCents).toBe(0);
  });
});
