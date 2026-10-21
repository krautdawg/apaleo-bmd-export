import { describe, expect, it } from 'vitest';
import { renderBuchungsimport, type BmdBooking } from '../../src/bmd/index.js';
import type { LocalDate } from '../../src/core/date.js';
import { bmdPayment, dataLines, octoberOptions } from '../helpers/bmd.js';

/** The Belegnummern of a file for `from` to `to` with `count` bookings on its first day. */
function numbers(from: LocalDate, to: LocalDate, count: number): string[] {
  const bookings: BmdBooking[] = Array.from({ length: count }, (_, i) => bmdPayment({ businessDate: from, betragCents: 100 + i }));
  return dataLines(renderBuchungsimport(bookings, octoberOptions({ from, to })).text).map((line) => line.split(';')[3] ?? '');
}

const shared = (a: string[], b: string[]) => a.filter((n) => b.includes(n));

describe('Belegnummern across the files of one property', () => {
  it('gives two daily files of one month disjoint ranges', () => {
    const first = numbers('2026-10-14', '2026-10-14', 40);
    const second = numbers('2026-10-15', '2026-10-15', 35);
    expect([first[0], first.at(-1)]).toEqual(['101400001', '101400040']);
    expect([second[0], second.at(-1)]).toEqual(['101500001', '101500035']);
    expect(shared(first, second)).toEqual([]);
  });

  it('gives two partial files of one month disjoint ranges', () => {
    const first = numbers('2026-10-01', '2026-10-07', 30);
    const second = numbers('2026-10-08', '2026-10-14', 30);
    expect(first.every((n) => n.startsWith('1001'))).toBe(true);
    expect(second.every((n) => n.startsWith('1008'))).toBe(true);
    expect(shared(first, second)).toEqual([]);
  });

  it('never repeats a number inside a file and always has 9 digits', () => {
    const all = numbers('2026-10-01', '2026-10-31', 500);
    expect(new Set(all).size).toBe(500);
    expect(all.every((n) => /^\d{9}$/.test(n))).toBe(true);
  });

  it('gives the same bookings the same numbers on every run', () => {
    expect(numbers('2026-10-01', '2026-10-31', 5)).toEqual(numbers('2026-10-01', '2026-10-31', 5));
  });
});
