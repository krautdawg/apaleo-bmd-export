import { describe, expect, it } from 'vitest';
import {
  DIALECTS,
  formatAmount,
  formatBelegnr,
  formatDdMmYyyy,
  formatRate,
  formatYyyymmdd,
  MAX_AMOUNT_CENTS,
  MAX_BOOKINGS_PER_FILE,
} from '../../src/bmd/format.js';

describe('dialect table', () => {
  it('has 17 NTCS column names', () => {
    expect(DIALECTS.ntcs.header.join(';')).toBe(
      'satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz',
    );
  });

  it('has 17 BMD 5.5 column names', () => {
    expect(DIALECTS.bmd55.header.join(';')).toBe(
      'satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz',
    );
  });

  it('writes NTCS dates as TT.MM.JJJJ and BMD 5.5 dates as JJJJMMTT', () => {
    expect(DIALECTS.ntcs.formatDate('2026-10-14')).toBe('14.10.2026');
    expect(DIALECTS.bmd55.formatDate('2026-10-14')).toBe('20261014');
  });

  it('treats 1 as output tax in NTCS, 1 and 3 in BMD 5.5', () => {
    expect(DIALECTS.ntcs.outputTaxCodes).toEqual([1]);
    expect(DIALECTS.bmd55.outputTaxCodes).toEqual([1, 3]);
  });

  it('allows symbols of 4 characters in NTCS and 2 in BMD 5.5', () => {
    expect(DIALECTS.ntcs.maxSymbolLength).toBe(4);
    expect(DIALECTS.bmd55.maxSymbolLength).toBe(2);
  });
});

describe('formatAmount', () => {
  it.each([
    [-100_000, '-1000,00'],
    [12_000, '120,00'],
    [5, '0,05'],
    [-5, '-0,05'],
    [0, '0,00'],
    [123_456_789, '1234567,89'],
    [MAX_AMOUNT_CENTS, '9999999999999,99'],
  ])('%d → %s', (cents, text) => {
    expect(formatAmount(cents)).toBe(text);
  });
});

describe('formatRate', () => {
  it.each([
    [10, '10'],
    [20, '20'],
    [0, '0'],
    [4.9, '4,9'],
    [20.5, '20,5'],
    [12.25, '12,25'],
    [12.05, '12,05'],
  ])('%d → %s', (rate, text) => {
    expect(formatRate(rate)).toBe(text);
  });
});

describe('formatBelegnr', () => {
  it('starts with MMDD of the first day and counts from 00001', () => {
    expect(formatBelegnr('2026-10-01', 0)).toBe('100100001');
    expect(formatBelegnr('2026-10-14', 39)).toBe('101400040');
    expect(formatBelegnr('2027-01-01', 2)).toBe('010100003');
  });

  it('has 9 digits up to the last booking a file may hold', () => {
    expect(formatBelegnr('2026-12-31', MAX_BOOKINGS_PER_FILE - 1)).toBe('123199999');
  });
});

describe('dates', () => {
  it('pads day and month', () => {
    expect(formatDdMmYyyy('2027-01-05')).toBe('05.01.2027');
    expect(formatYyyymmdd('2027-01-05')).toBe('20270105');
  });

  it('refuses an invalid date', () => {
    expect(() => formatDdMmYyyy('2026-02-30')).toThrow(TypeError);
  });
});
