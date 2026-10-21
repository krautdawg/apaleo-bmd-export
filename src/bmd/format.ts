import { parseLocalDate, type LocalDate } from '../core/date.js';
import type { BmdDialect } from './types.js';

/**
 * Every format choice that the first real BMD NTCS import may change lives here
 * (design decisions 2, 5 to 9 and docs/bmd-format.md).
 */

export const SEPARATOR = ';';
export const LINE_END = '\r\n';
/** `text`: dvo reads 40 characters; BMD 5.5's fixed layout had 18, NTCS more. */
export const TEXT_MAX_LENGTH = 40;
/** `extbelegnr`: 35 characters in dvo. */
export const EXTBELEGNR_MAX_LENGTH = 35;
/** `betrag` and `steuer`: at most 13 digits before the decimal comma. */
export const MAX_INTEGER_DIGITS = 13;
export const MAX_AMOUNT_CENTS = 10 ** (MAX_INTEGER_DIGITS + 2) - 1;
/** The counter after `MMDD` in a Belegnummer: 5 digits, so at most 99,999 bookings per file. */
export const BELEGNR_COUNTER_DIGITS = 5;
export const MAX_BOOKINGS_PER_FILE = 10 ** BELEGNR_COUNTER_DIGITS - 1;

export interface DialectSpec {
  /** The 17 column names of the header line, in file order. */
  readonly header: readonly string[];
  readonly formatDate: (date: LocalDate) => string;
  /** Steuercodes that mean output tax (Umsatzsteuer): their `steuer` must carry the sign of `betrag`. */
  readonly outputTaxCodes: readonly number[];
  /** The output-tax code the EKR template writes on revenue and deposit rows. */
  readonly normalOutputTaxCode: number;
  /** Input-tax codes with their BMD meaning: never on a sale, deposit, levy or bad debt. */
  readonly inputTaxCodes: ReadonlyMap<number, string>;
  readonly maxSymbolLength: number;
}

/** Fields that both dialects write the same, after the dialect's own names. */
const COMMON_TAIL = ['betrag', 'steuer', 'text', 'kost', 'extbelegnr', 'gegenbuchkz', 'verbuchkz'];

export const DIALECTS: Readonly<Record<BmdDialect, DialectSpec>> = {
  // NTCS_BUCHEN p.5, p.38, Anhang A p.107-108; dvo §9.
  ntcs: {
    header: ['satzart', 'konto', 'gkonto', 'belegnr', 'belegdatum', 'buchdatum', 'buchsymbol', 'buchcode', 'prozent', 'steuercode', ...COMMON_TAIL],
    formatDate: formatDdMmYyyy,
    outputTaxCodes: [1],
    normalOutputTaxCode: 1,
    inputTaxCodes: new Map([
      [2, 'Vorsteuer'],
      [3, 'Vorsteuer-Berichtigung'],
    ]),
    maxSymbolLength: 4,
  },
  // PR08 5.B4 p.10-11: 03 Soll-USt, 01 Ist-USt, 00 Vorsteuer.
  bmd55: {
    header: ['satzart', 'konto', 'gkto', 'belegnr', 'belegdat', 'buchdat', 'symbol', 'bucod', 'mwst', 'steucod', ...COMMON_TAIL],
    formatDate: formatYyyymmdd,
    outputTaxCodes: [1, 3],
    normalOutputTaxCode: 3,
    inputTaxCodes: new Map([[0, 'Vorsteuer']]),
    maxSymbolLength: 2,
  },
};

export const DEFAULT_DIALECT: BmdDialect = 'ntcs';

/** Signed cents with decimal comma, leading minus and no thousands separator. -100000 → `-1000,00`. */
export function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** A VAT percent with decimal comma and without trailing zeros: 10 → `10`, 4.9 → `4,9`, 12.25 → `12,25`. */
export function formatRate(percent: number): string {
  const hundredths = Math.round(percent * 100);
  const whole = String(Math.trunc(hundredths / 100));
  if (hundredths % 100 === 0) return whole;
  return `${whole},${String(hundredths % 100).padStart(2, '0').replace(/0$/, '')}`;
}

/**
 * The Belegnummer of the booking at `index` (0-based) in a file starting on
 * `from`: `MMDD` of that day and a 5-digit counter. 2026-10-01, 0 → `100100001`.
 */
export function formatBelegnr(from: LocalDate, index: number): string {
  const { month, day } = parts(from);
  return `${pad(month, 2)}${pad(day, 2)}${pad(index + 1, BELEGNR_COUNTER_DIGITS)}`;
}

/** `TT.MM.JJJJ`, the NTCS date. 2026-10-14 → `14.10.2026`. */
export function formatDdMmYyyy(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return `${pad(day, 2)}.${pad(month, 2)}.${year}`;
}

/** `JJJJMMTT`, the BMD 5.5 date and the file name date. 2026-10-14 → `20261014`. */
export function formatYyyymmdd(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return `${year}${pad(month, 2)}${pad(day, 2)}`;
}

function parts(date: LocalDate) {
  const result = parseLocalDate(date);
  if (!result) throw new TypeError(`Not a valid date: ${date}`);
  return result;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
