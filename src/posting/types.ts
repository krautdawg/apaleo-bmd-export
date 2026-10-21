import type { BmdBooking, BmdDialect } from '../bmd/types.js';
import type { PostingConfig } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import type { LedgerLine } from '../core/source.js';

/** One BMD booking, with the source entries it came from for traceability. */
export interface PostedBooking extends BmdBooking {
  sourceEntryNumbers: string[];
}

/**
 * Why a ledger line produced no booking although nothing is wrong with it:
 * - `VAT_ACCOUNT_LINE`: a side is an apaleo Vat or VatOnLiabilities account;
 *   BMD books the tax from the `steuer` field of the revenue or deposit line.
 * - `ZERO_AMOUNT`: the gross amount is 0.
 * - `SAME_ACCOUNT`: both sides map to the same BMD account (for example a
 *   move between two guest folios, or the `/Offset` line of a payment).
 */
export const SKIP_REASONS = ['VAT_ACCOUNT_LINE', 'ZERO_AMOUNT', 'SAME_ACCOUNT'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface SkippedLine {
  reason: SkipReason;
  line: LedgerLine;
}

export interface PostingOptions extends PostingConfig {
  /** The Steuercode in the fix hints of `E-UNMAPPED`. */
  dialect: BmdDialect;
  /** Scales the template's example accounts in the fix hints of `E-UNMAPPED`. */
  sachkontenlaenge: number;
  /** Scales the template's Personenkonto in the fix hints of `E-UNMAPPED`. Default 6. */
  personenkontenlaenge?: number | undefined;
  /** The property's Buchungssymbol. */
  buchsymbol: string;
  /** The Buchungssymbol of lines without VAT side that have a Payments side. */
  buchsymbolZahlung: string;
}

/** Soll and Haben of one BMD account over all bookings (movement model). Balance is Soll minus Haben. */
export interface BmdAccountTotal {
  account: string;
  sollCents: number;
  habenCents: number;
  balanceCents: number;
}

/**
 * Revenue, deposits or write-offs booked at one rate, signed as owed (allowances and
 * releases reduce it): net, tax and gross as passed to BMD, and the precise VAT
 * apaleo charged on the same lines.
 */
export interface VatTotal {
  ratePercent: number;
  netCents: number;
  /** Sum of `steuer` of the bookings. */
  vatCents: number;
  grossCents: number;
  /** Sum of apaleo's precise taxes, as decimal text. */
  apaleoVat: string;
}

export type RevenueTotal = VatTotal;

/** Payments received on one BMD clearing account, signed (refunds reduce it). */
export interface PaymentTotal {
  account: string;
  cents: number;
}

export interface SkippedTotal {
  reason: SkipReason;
  lines: number;
  /** Sum of the absolute gross amounts (the basis of `E-CONSERVATION`). */
  grossCents: number;
}

export interface FindingCount {
  code: string;
  count: number;
}

/** Totals of one posting run, all in cents. */
export interface PostingSummary {
  accounts: BmdAccountTotal[];
  revenueByRate: VatTotal[];
  /** Deposits (Liabilities) per VAT rate: received minus released. */
  depositVatByRate: VatTotal[];
  /**
   * Written-off guest receivables (LossOfAccountsReceivable) per VAT rate, signed
   * as written off (a reversed write-off reduces it): net, the USt-Berichtigung as
   * tax, gross, and apaleo's precise VAT on the same lines.
   */
  writeOffsByRate: VatTotal[];
  /** City tax, second city tax and guest levies, signed. */
  cityTaxCents: number;
  payments: PaymentTotal[];
  /** Classified by side and sign (`depositMovement`), unsigned; refunds (paid back via a payment) are part of the released amount. */
  deposits: { receivedCents: number; releasedCents: number; refundedCents: number };
  /** Net movement on accounts receivable (Sammeldebitor): debits positive. */
  accountsReceivableCents: number;
  skipped: SkippedTotal[];
  /** Sum of the one-cent differences (BMD's check value minus `steuer`) reported as `W-VAT-ROUNDING`. */
  roundingCents: number;
  findings: FindingCount[];
}

export interface PostingResult {
  bookings: PostedBooking[];
  skipped: SkippedLine[];
  /** `E-` findings block the export. */
  findings: Finding[];
  summary: PostingSummary;
  /**
   * Per VAT rate, how many one-cent differences between the booked tax and
   * apaleo's tax the run reported (`W-VAT-ROUNDING` on a deposit line whose
   * tax was computed). The plausibility check allows that many cents at that
   * rate only.
   */
  vatRoundingByRate: ReadonlyMap<number, number>;
}
