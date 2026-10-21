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
 * and the field. Messages name fields as BMD does (Konto, Betrag, Steuercode).
 */
export function validateBookings(bookings: readonly BmdBooking[], options: BmdRenderOptions): Finding[] {
  const dialect = DIALECTS[options.dialect ?? DEFAULT_DIALECT];
  const findings = bookings.flatMap((booking, index) => validateBooking(booking, index, options, dialect));
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

function validateBooking(b: BmdBooking, index: number, options: BmdRenderOptions, dialect: DialectSpec): Finding[] {
  const findings: Finding[] = [];
  const error = (code: string, field: string, value: unknown, message: string) =>
    findings.push({ code, index, field, label: labelOf(field), value: String(value), message });

  for (const field of ['konto', 'gkonto'] as const) {
    const problem = accountProblem(b[field], options);
    if (problem) error('E-BMD-ACCOUNT', field, b[field], `${labelOf(field)} "${b[field]}" ${problem}`);
  }
  if (!isAmount(b.betragCents) || b.betragCents === 0) {
    error('E-BMD-AMOUNT', 'betragCents', b.betragCents, `Betrag must not be 0 and have at most ${MAX_INTEGER_DIGITS} digits before the comma, got ${describeAmount(b.betragCents)}`);
  }
  if (!isLocalDate(b.businessDate)) {
    error('E-BMD-DATE', 'businessDate', b.businessDate, `Belegdatum must be a valid date written YYYY-MM-DD, got "${b.businessDate}"`);
  } else if (b.businessDate < options.from || b.businessDate > options.to) {
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
