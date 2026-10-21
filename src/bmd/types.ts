import type { LocalDate } from '../core/date.js';

/**
 * Which BMD version reads the file. The dialect sets header names, date format
 * and Steuercode meanings together, so a file never mixes them (design decision 2).
 */
export type BmdDialect = 'ntcs' | 'bmd55';

/** The tax part of a booking: BMD posts `steuerCents` on its own tax account. */
export interface BmdTax {
  /** Steuercode, 0 to 99. NTCS: 1 Umsatzsteuer, 2 Vorsteuer, 3 Vorsteuer-Berichtigung. */
  steuercode: number;
  /** VAT percent with at most two decimals, for example `10` or `4.9`; `0` for untaxed revenue with a Steuercode. */
  prozent: number;
  /**
   * Tax amount in whole cents, signed like `betragCents` for an output-tax
   * Steuercode (or 0). At most 13 integer digits.
   */
  steuerCents: number;
}

/** One line of the BMD Buchungsimport (Satzart 0). BMD creates the Gegenbuchung and the tax posting itself. */
export interface BmdBooking {
  /** Leading account, digits only, Sachkonten- or Personenkontenlänge. The revenue account leads on revenue lines. */
  konto: string;
  /** Gegenkonto, same rules as `konto`. */
  gkonto: string;
  /** The business date: written as Belegdatum and Buchungsdatum. Must lie inside the file period. */
  businessDate: LocalDate;
  /** Buchungssymbol, `A-Z 0-9`, 1 to 4 characters (`ntcs`) or 1 to 2 (`bmd55`). */
  buchsymbol: string;
  /**
   * Amount in whole cents, signed from the point of view of `konto`: positive is
   * Soll, negative is Haben. Never 0, at most 13 integer digits. Net when `tax` is set.
   */
  betragCents: number;
  /** Omitted: `prozent`, `steuercode` and `steuer` stay empty. */
  tax?: BmdTax;
  /** Buchungstext, sanitised and cut to 40 characters. */
  text?: string;
  /** Kostenstelle, 1 to 9 digits. */
  kost?: string;
  /** The source receipt or reference, sanitised to `A-Z a-z 0-9 - / . _` and cut to 35 characters. */
  extbelegnr?: string;
}

/** What the caller decides about one file. */
export interface BmdRenderOptions {
  /** Default `ntcs`. */
  dialect?: BmdDialect;
  /** First day of the file period; its month and day start every Belegnummer. */
  from: LocalDate;
  /** Last day of the file period. */
  to: LocalDate;
  /** Written into the file name. */
  propertyId: string;
  /** Length of Sachkonten in the Kanzlei's Kontenplan. */
  sachkontenlaenge: number;
  /** Length of Personenkonten (Debitoren) in the Kanzlei's Kontenplan. */
  personenkontenlaenge: number;
}
