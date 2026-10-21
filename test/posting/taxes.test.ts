import { describe, expect, it } from 'vitest';
import { bmdCheckTax, normaliseTaxes, taxFromGross } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { ACCOUNTS, post } from '../helpers/posting.js';

describe('normaliseTaxes', () => {
  it('drops entries with percent 0 and amount 0 and keeps every other entry', () => {
    const without = tax('Without', 0, 0);
    const reduced = tax('VeryReduced', 10, 1_000);
    const oddZero = tax('Without', 0, 12);
    expect(normaliseTaxes([without])).toEqual([]);
    expect(normaliseTaxes([without, reduced, oddZero])).toEqual([reduced, oddZero]);
    expect(normaliseTaxes([tax('VeryReduced', 10, 0)])).toHaveLength(1);
  });
});

describe('taxFromGross', () => {
  it.each([
    // gross × rate / (100 + rate), rounded half away from zero
    [11_000, 10, 1_000], // 110000 / 110 = 1000 exactly
    [9_800, 10, 891], // 98000 / 110 = 890.90… → 8.91
    [4_680, 10, 425], // 46800 / 110 = 425.45… → 4.25
    [2_400, 20, 400], // 48000 / 120 = 400 exactly
    [1_480, 20, 247], // 29600 / 120 = 246.66… → 2.47
    [10_500, 13, 1_208], // 136500 / 113 = 1207.96… → 12.08
    [-1_100, 10, -100], // sign of the gross amount
    [500, 0, 0],
    [1_049, 4.9, 49], // 5140.1 / 104.9 = 49.0 → 0.49
  ])('the tax in %i cents at %d %% is %i cents', (gross, rate, vat) => {
    expect(taxFromGross(gross, rate)).toBe(vat);
  });

  it('rounds an exact half cent away from zero, without floating-point noise', () => {
    expect(taxFromGross(1, 100)).toBe(1);
    expect(taxFromGross(3, 100)).toBe(2);
    expect(taxFromGross(-1, 100)).toBe(-1);
    expect(taxFromGross(-3, 100)).toBe(-2);
    expect(taxFromGross(1, 50)).toBe(0);
    expect(taxFromGross(235, 17.5)).toBe(35);
  });
});

describe('bmdCheckTax', () => {
  it.each([
    [4_255, 10, 426], // VIE 000000031: 42.55 × 10 % = 4.255 → 4.26
    [8_407, 13, 1_093], // VIE 000000029: 84.07 × 13 % = 10.9291 → 10.93
    [9_292, 13, 1_208], // VIE 000000025: 92.92 × 13 % = 12.0796 → 12.08
    [-1_000, 10, 100], // unsigned
    [1_233, 20, 247], // 12.33 × 20 % = 2.466 → 2.47
    [1_000, 4.9, 49],
  ])('checks %i cents at %d %% as %i cents', (betrag, rate, check) => {
    expect(bmdCheckTax(betrag, rate)).toBe(check);
  });
});

describe('VAT guard on apaleo precise tax', () => {
  it.each([
    // 98.00 at 10 %: apaleo 8.90909091 → 8.91, Betrag 89.09, BMD checks 8.909 → 8.91.
    ['accommodation 98.00 at 10 %', ACCOUNTS.accommodation10, 9_800, tax('VeryReduced', 10, 891, '8.90909091')],
    // 14.80 at 20 %: apaleo 2.46666667 → 2.47, Betrag 12.33, BMD checks 2.466 → 2.47.
    ['drinks 14.80 at 20 %', ACCOUNTS.beverages20, 1_480, tax('Normal', 20, 247, '2.46666667')],
    // A negative allowance: −98.00, apaleo −8.90909091 → −8.91.
    ['a negative allowance of 98.00 at 10 %', ACCOUNTS.accommodation10, -9_800, tax('VeryReduced', 10, -891, '-8.90909091')],
  ])('raises no finding for %s: sub-cent digits never count', (_name, credit, grossCents, entry) => {
    const result = post([ledgerLine({ credit, grossCents, taxes: [entry] })]);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(1);
    expect(result.summary.roundingCents).toBe(0);
  });
});
