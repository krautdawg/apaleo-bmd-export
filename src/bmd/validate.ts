import { isLocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import { DEFAULT_DIALECT, DIALECTS, formatAmount, MAX_AMOUNT_CENTS, MAX_BOOKINGS_PER_FILE, MAX_INTEGER_DIGITS, type DialectSpec } from './format.js';
import { labelOf } from './labels.js';
import type { BmdBooking, BmdRenderOptions } from './types.js';

const DIGITS = /^\d+$/;
const KOST = /^\d{1,9}$/;
const MAX_RATE = 99.99;

/**
 * Every error in the bookings at once (codes `E-BMD-ACCOUNT` to `E-BMD-BELEGNR`), each with the booking index
 * and the field, and `E-BMD-PERIOD` (no booking index) for an invalid or reversed file period. Messages name
 * fields as BMD does (Konto, Betrag, Steuercode).
 */
export function validateBookings(bookings: readonly BmdBooking[], options: BmdRenderOptions): Finding[] {
  const dialect = DIALECTS[options.dialect ?? DEFAULT_DIALECT];
  const period = validatePeriod(options);
  const findings = [...period, ...bookings.flatMap((booking, index) => validateBooking(booking, index, options, dialect, period.length === 0))];
  if (bookings.length > MAX_BOOKINGS_PER_FILE) {
    findings.push({
      code: 'E-BMD-BELEGNR',
      field: 'belegnr',
      label: labelOf('belegnr'),
      value: String(bookings.length),
      message: `A file holds at most ${MAX_BOOKINGS_PER_FILE} bookings (5-digit counter in the Belegnummer), got ${bookings.length}; export a shorter period`,
    });
  }
  return findings;
}

/**
 * `E-BMD-PERIOD` for a `from` or `to` that is not a valid date, or a `from` after `to`. Without a valid period
 * the bookings' dates cannot be checked against it and no Belegnummer can be formed.
 */
export function validatePeriod({ from, to }: Pick<BmdRenderOptions, 'from' | 'to'>): Finding[] {
  const findings: Finding[] = [];
  for (const [field, value] of [['from', from], ['to', to]] as const) {
    if (!isLocalDate(value)) {
      findings.push({ code: 'E-BMD-PERIOD', field, label: labelOf(field), value: String(value), message: `${labelOf(field)} must be a valid date written YYYY-MM-DD, got "${value}"` });
    }
  }
  if (findings.length === 0 && from > to) {
    findings.push({ code: 'E-BMD-PERIOD', field: 'from', label: labelOf('from'), value: from, message: `The file period starts on ${from}, after its last day ${to}` });
  }
  return findings;
}

function validateBooking(b: BmdBooking, index: number, options: BmdRenderOptions, dialect: DialectSpec, periodValid: boolean): Finding[] {
  const findings: Finding[] = [];
  const error = (code: string, field: string, value: unknown, message: string) =>
    findings.push({ code, index, field, label: labelOf(field), value: String(value), message });

  for (const field of ['konto', 'gkonto'] as const) {
    const problem = accountProblem(b[field], options);
    if (problem) error('E-BMD-ACCOUNT', field, b[field], `${labelOf(field)} "${b[field]}" ${problem}`);
  }
  if (b.tax && isPersonenkonto(b.konto, options)) {
    error(
      'E-BMD-TAX-PERSONENKONTO',
      'konto',
      b.konto,
      `Konto "${b.konto}" is a Personenkonto: with a leading Personenkonto BMD reads Betrag as gross and does not import Steuer, ` +
        'so a booking with a Steuercode must lead with the Sachkonto (for example the revenue account) and have the Personenkonto as Gegenkonto',
    );
  }
  if (!isAmount(b.betragCents) || b.betragCents === 0) {
    error('E-BMD-AMOUNT', 'betragCents', b.betragCents, `Betrag must not be 0 and have at most ${MAX_INTEGER_DIGITS} digits before the comma, got ${describeAmount(b.betragCents)}`);
  }
  if (!isLocalDate(b.businessDate)) {
    error('E-BMD-DATE', 'businessDate', b.businessDate, `Belegdatum must be a valid date written YYYY-MM-DD, got "${b.businessDate}"`);
  } else if (periodValid && (b.businessDate < options.from || b.businessDate > options.to)) {
    error('E-BMD-DATE', 'businessDate', b.businessDate, `Belegdatum ${b.businessDate} is outside the file period ${options.from} to ${options.to}`);
  }
  const symbol = new RegExp(`^[A-Z0-9]{1,${dialect.maxSymbolLength}}$`);
  if (!symbol.test(b.buchsymbol)) {
    error('E-BMD-SYMBOL', 'buchsymbol', b.buchsymbol, `Buchungssymbol must be 1 to ${dialect.maxSymbolLength} characters of A-Z and 0-9, got "${b.buchsymbol}"`);
  }
  if (b.kost !== undefined && b.kost !== '' && !KOST.test(b.kost)) {
    error('E-BMD-KOST', 'kost', b.kost, `Kostenstelle must be 1 to 9 digits, got "${b.kost}"`);
  }
  if (b.tax) {
    const { steuercode, prozent, steuerCents } = b.tax;
    if (!Number.isInteger(steuercode) || steuercode < 0 || steuercode > 99) {
      error('E-BMD-STEUERCODE', 'steuercode', steuercode, `Steuercode must be a whole number from 0 to 99, got ${steuercode}`);
    }
    if (!Number.isFinite(prozent) || prozent < 0 || prozent > MAX_RATE || !hasAtMostTwoDecimals(prozent)) {
      error('E-BMD-RATE', 'prozent', prozent, `Prozent must be from 0 to 99,99 with at most two decimals, got ${prozent}`);
    }
    if (!isAmount(steuerCents)) {
      error('E-BMD-AMOUNT', 'steuerCents', steuerCents, `Steuer must have at most ${MAX_INTEGER_DIGITS} digits before the comma, got ${describeAmount(steuerCents)}`);
    } else if (dialect.outputTaxCodes.includes(steuercode) && steuerCents !== 0 && Math.sign(steuerCents) !== Math.sign(b.betragCents)) {
      error(
        'E-BMD-STEUER-SIGN',
        'steuerCents',
        steuerCents,
        `Steuer ${describeAmount(steuerCents)} must have the sign of Betrag ${describeAmount(b.betragCents)} for the Umsatzsteuer code ${steuercode}`,
      );
    }
  }
  return findings;
}

/** Why an account number is invalid, or undefined if it is fine. Account numbers are never padded. */
function accountProblem(account: string, { sachkontenlaenge, personenkontenlaenge }: BmdRenderOptions): string | undefined {
  const lengths = `must have ${sachkontenlaenge} digits (Sachkonto) or ${personenkontenlaenge} digits (Personenkonto)`;
  if (!DIGITS.test(account)) return `must contain digits only and ${lengths}`;
  if (account.length !== sachkontenlaenge && account.length !== personenkontenlaenge) return `${lengths}; account numbers are never padded`;
  return undefined;
}

/** A Personenkonto by its length, when that length tells it apart from a Sachkonto. */
function isPersonenkonto(account: string, { sachkontenlaenge, personenkontenlaenge }: BmdRenderOptions): boolean {
  return personenkontenlaenge !== sachkontenlaenge && DIGITS.test(account) && account.length === personenkontenlaenge;
}

function isAmount(cents: number): boolean {
  return Number.isInteger(cents) && Math.abs(cents) <= MAX_AMOUNT_CENTS;
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

/** Whole cents as euros (`-500` → `-5,00 EUR`); anything else as given. */
function describeAmount(cents: number): string {
  return Number.isInteger(cents) ? `${formatAmount(cents)} EUR` : String(cents);
}
