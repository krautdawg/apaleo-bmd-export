import { encodeCp1252 } from '../core/cp1252.js';
import type { Finding } from '../core/findings.js';
import { BmdValidationError } from './errors.js';
import { DEFAULT_DIALECT, DIALECTS, formatAmount, formatBelegnr, formatRate, formatYyyymmdd, LINE_END, SEPARATOR, type DialectSpec } from './format.js';
import { sanitiseExtbelegnr, sanitiseText } from './sanitise.js';
import type { BmdBooking, BmdRenderOptions } from './types.js';
import { validateBookings, validatePeriod } from './validate.js';

export interface RenderedBuchungsimport {
  /** The whole file with CRLF line ends, only characters Windows-1252 can encode. */
  text: string;
  /** `text` in Windows-1252, without byte-order mark. */
  bytes: Uint8Array;
  /** Every change the writer made to a value (`N-BMD-CHARSET`, `N-BMD-TRUNCATED`), with booking index, field and original value. */
  notes: Finding[];
}

/** Satzart 0 is a FIBU booking; `E` and `A` let BMD create the Gegenbuchung and the tax posting (design decision 3). */
const SATZART = '0';
export const GEGENBUCHKZ = 'E';
export const VERBUCHKZ = 'A';

/**
 * Renders a BMD Buchungsimport: the header line of the dialect and one line per
 * booking, numbered in file order. Throws one `BmdValidationError` with every
 * problem found, and returns nothing then.
 */
export function renderBuchungsimport(bookings: readonly BmdBooking[], options: BmdRenderOptions): RenderedBuchungsimport {
  const errors = validateBookings(bookings, options);
  if (errors.length > 0) throw new BmdValidationError(errors);

  const dialect = DIALECTS[options.dialect ?? DEFAULT_DIALECT];
  const rows = bookings.map((booking, index) => renderBookingLine(booking, index, options, dialect));
  const text = [dialect.header.join(SEPARATOR), ...rows.map((row) => row.line)].map((line) => line + LINE_END).join('');
  // The sanitisers already replaced every character outside Windows-1252.
  return { text, bytes: encodeCp1252(text).bytes, notes: rows.flatMap((row) => row.notes) };
}

function renderBookingLine(b: BmdBooking, index: number, options: BmdRenderOptions, dialect: DialectSpec): { line: string; notes: Finding[] } {
  const notes: Finding[] = [];
  const clean = (value: string | undefined, sanitise: typeof sanitiseText) => {
    if (value === undefined || value === '') return '';
    const result = sanitise(value, index);
    notes.push(...result.notes);
    return result.value;
  };
  const date = dialect.formatDate(b.businessDate);
  const fields = [
    SATZART,
    b.konto,
    b.gkonto,
    formatBelegnr(options.from, index),
    date,
    date,
    b.buchsymbol,
    b.betragCents > 0 ? '1' : '2',
    b.tax ? formatRate(b.tax.prozent) : '',
    b.tax ? String(b.tax.steuercode) : '',
    formatAmount(b.betragCents),
    b.tax ? formatAmount(b.tax.steuerCents) : '',
    clean(b.text, sanitiseText),
    b.kost ?? '',
    clean(b.extbelegnr, sanitiseExtbelegnr),
    GEGENBUCHKZ,
    VERBUCHKZ,
  ];
  return { line: fields.join(SEPARATOR), notes };
}

const TAG = /^[A-Za-z0-9_-]+$/;

/**
 * `BMD_Buchungsimport_<YYYYMMDD>-<YYYYMMDD>_<tag>.csv` for the first and last day
 * of the period. `tag` is the property id, or `<id>_DEMO` for a demo file; a tag
 * with other characters than `A-Z a-z 0-9 _ -` would not match the target's file
 * pattern, so it is refused (`E-BMD-FILE-NAME`), and so is an invalid period (`E-BMD-PERIOD`).
 */
export function buchungsimportFileName(options: Pick<BmdRenderOptions, 'from' | 'to' | 'propertyId'>, tag = options.propertyId): string {
  if (!TAG.test(tag)) {
    throw new BmdValidationError([
      { code: 'E-BMD-FILE-NAME', field: 'propertyId', value: tag, message: `The property id may only contain A-Z a-z 0-9 _ - in a file name, got "${tag}"` },
    ]);
  }
  const period = validatePeriod(options);
  if (period.length > 0) throw new BmdValidationError(period);
  return `BMD_Buchungsimport_${formatYyyymmdd(options.from)}-${formatYyyymmdd(options.to)}_${tag}.csv`;
}
