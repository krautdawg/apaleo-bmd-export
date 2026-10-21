import type { ChartIndex } from '../core/chart.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import type { AccountRef, LedgerLine } from '../core/source.js';
import { KOST_TYPES, NO_TAX_TYPES, VAT_ACCOUNT_TYPES, checkCoverage, parseSteuercode, resolve, rowRate, type Mapping, type MappingRow } from '../mapping/index.js';
import { apaleoVatOf, type ApaleoVat } from './apaleo-vat.js';
import { accountText, lineFinding, percentText, rowText } from './describe.js';
import { buchungstext, extbelegnr, kostOf } from './fields.js';
import { guardVat, type PostedSide } from './guard.js';
import { inferReleaseRates, isUntaxedRelease, resolutionRate, type ReleaseRate } from './release.js';
import { SummaryBuilder } from './summary.js';
import { normaliseTaxes, taxPercents } from './taxes.js';
import type { PostedBooking, PostingOptions, PostingResult, SkipReason, SkippedLine } from './types.js';

type LineOutcome =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'unmapped' }
  | { kind: 'failed'; findings: Finding[] }
  | {
      kind: 'booked';
      booking: PostedBooking;
      debit: PostedSide;
      credit: PostedSide;
      findings: Finding[];
      roundingCents: number;
      /** The booked tax differs by one cent from the VAT apaleo moved for the line. */
      apaleoRounding: boolean;
      /** The VAT rate of the booking (0 without tax). */
      rate: number;
      apaleoVat: ApaleoVat[];
    };

interface PostingContext {
  mapping: Mapping;
  chart: ChartIndex;
  options: PostingOptions;
  releases: ReadonlyMap<LedgerLine, ReleaseRate>;
}

/**
 * Turns ledger lines into BMD bookings, one booking per line (no aggregation).
 * Pure and deterministic: the same lines and mapping always give the same result.
 * Every line is either booked, listed in `skipped` with its reason, or named in
 * an `E-` finding that blocks the export. Unmapped accounts are reported once
 * per account (`E-UNMAPPED`, as in `mapping check --from --to`).
 */
export function buildBookings(lines: readonly LedgerLine[], mapping: Mapping, chart: ChartIndex, options: PostingOptions): PostingResult {
  const releases = inferReleaseRates(lines, chart);
  const context: PostingContext = { mapping, chart, options, releases };
  const rateOf = (line: LedgerLine) => resolutionRate(line, releases);
  const findings: Finding[] = checkCoverage(mapping, lines, chart, {
    rateOf,
    sachkontenlaenge: options.sachkontenlaenge,
    personenkontenlaenge: options.personenkontenlaenge,
    dialect: options.dialect,
  }).filter(
    (finding) => finding.code === 'E-UNMAPPED',
  );
  const bookings: PostedBooking[] = [];
  const skipped: SkippedLine[] = [];
  const summary = new SummaryBuilder();
  const vatRoundingByRate = new Map<number, number>();

  for (const line of lines) {
    const outcome = postLine(line, context);
    if (outcome.kind === 'skip') {
      skipped.push({ reason: outcome.reason, line });
      summary.addSkipped(outcome.reason, line);
    } else if (outcome.kind === 'failed') {
      findings.push(...outcome.findings);
    } else if (outcome.kind === 'booked') {
      bookings.push(outcome.booking);
      findings.push(...outcome.findings);
      summary.addBooking(line, outcome.booking, outcome.debit, outcome.credit, outcome.roundingCents, outcome.apaleoVat);
      if (outcome.apaleoRounding) vatRoundingByRate.set(outcome.rate, (vatRoundingByRate.get(outcome.rate) ?? 0) + 1);
    }
  }
  return { bookings, skipped, findings, summary: summary.build(findings), vatRoundingByRate };
}

function postLine(line: LedgerLine, context: PostingContext): LineOutcome {
  const fail = (code: string, message: string): LineOutcome => ({ kind: 'failed', findings: [lineFinding(code, line, message)] });
  if (VAT_ACCOUNT_TYPES.has(line.debit.type) || VAT_ACCOUNT_TYPES.has(line.credit.type)) {
    return { kind: 'skip', reason: 'VAT_ACCOUNT_LINE' };
  }
  if (line.grossCents === 0) return { kind: 'skip', reason: 'ZERO_AMOUNT' };

  const taxes = normaliseTaxes(line.taxes);
  const percents = taxPercents(taxes);
  if (percents.length > 1) {
    return fail(
      'E-VAT-MIXED',
      `it carries more than one VAT rate (${percents.map(percentText).join(', ')}), but a BMD booking has one. ${REPORT_PROBLEM_HINT}`,
    );
  }
  const release = context.releases.get(line);
  if (release?.kind === 'unknown') {
    return fail(
      'E-VAT-RATE-UNKNOWN',
      `it ${isUntaxedRelease(line) ? 'settles' : 'books'} a guest's deposit without a VAT amount, and its VAT rate cannot be found: ${release.reason}. ` +
        `The export stops rather than book the deposit without VAT. ${REPORT_PROBLEM_HINT}`,
    );
  }

  const rate = resolutionRate(line, context.releases);
  const debitRow = mappedRow(line.debit, rate, context);
  const creditRow = mappedRow(line.credit, rate, context);
  // checkCoverage resolves with the same rate and reports the account once as E-UNMAPPED.
  if (!debitRow || !creditRow) return { kind: 'unmapped' };
  if (debitRow.bmdAccount === creditRow.bmdAccount) return { kind: 'skip', reason: 'SAME_ACCOUNT' };

  const d = postedSide(line.debit, debitRow);
  const c = postedSide(line.credit, creditRow);
  for (const side of [d, c]) {
    if (side.kind === 'no-rate') {
      return fail(
        'E-VAT-RATE-MISSING',
        `${rowText(side.row)} has the Steuercode "${side.row.steuercode}" but no valid bmd_vat_percent ("${side.row.bmdVatPercent}"), so the rate BMD books is unknown. ` +
          'Fill in bmd_vat_percent on that line, and run "apaleo-bmd mapping check"',
      );
    }
    if (side.kind === 'no-tax-type') {
      return fail(
        'E-STEUERCODE-NOT-ALLOWED',
        `${accountText(side.ref)} uses ${rowText(side.row)}, which has the Steuercode ${side.row.steuercode}, but a ${side.ref.type} account books no tax: ` +
          'BMD would book the tax on it instead of the revenue or deposit account. Leave steuercode and bmd_vat_percent empty on that line, ' +
          'put the Steuercode on the revenue or deposit row, and run "apaleo-bmd mapping check"',
      );
    }
  }
  if (d.kind !== 'ok' || c.kind !== 'ok') return { kind: 'failed', findings: [] };
  if (d.vat && c.vat) {
    return fail(
      'E-TWO-VAT-SIDES',
      `both accounts have a Steuercode (debit ${d.ref.number} on ${rowText(d.row)}, credit ${c.ref.number} on ${rowText(c.row)}), ` +
        'but BMD computes the tax on the leading account only. Ask your Steuerberatung how to book such moves, for example through a transit account',
    );
  }
  const vatSide = d.vat ? d : c.vat ? c : undefined;
  const guard = guardVat({ line, taxes, release, debit: d, credit: c, vatSide });
  if (guard.failed) return { kind: 'failed', findings: guard.findings };
  return {
    kind: 'booked',
    booking: toBooking(line, d, c, vatSide, guard.steuerCents, context),
    debit: d,
    credit: c,
    findings: guard.findings,
    roundingCents: guard.roundingCents,
    apaleoRounding: guard.apaleoRounding,
    rate: vatSide?.rate ?? 0,
    apaleoVat: apaleoVatOf(line, release),
  };
}

/** The row for one side, or undefined when it is missing or has no BMD account (reported as `E-UNMAPPED`). */
function mappedRow(account: AccountRef, rate: number | undefined, { mapping, chart }: PostingContext): MappingRow | undefined {
  const row = resolve(mapping, account, { rate, chart });
  return row && row.bmdAccount !== '' ? row : undefined;
}

type SideOutcome = ({ kind: 'ok' } & PostedSide) | { kind: 'no-rate' | 'no-tax-type'; ref: AccountRef; row: MappingRow };

/**
 * The side with its Steuercode and rate; `no-rate` when a Steuercode has no known
 * rate, `no-tax-type` when a payment, guest claim or Debitor row has a Steuercode.
 */
function postedSide(ref: AccountRef, row: MappingRow): SideOutcome {
  const code = parseSteuercode(row.steuercode);
  if (code !== undefined && (NO_TAX_TYPES.has(row.apaleoType) || NO_TAX_TYPES.has(ref.type))) return { kind: 'no-tax-type', ref, row };
  const rate = rowRate(row);
  if (rate === undefined) return { kind: 'no-rate', ref, row };
  return { kind: 'ok', ref, row, steuercode: code, rate, vat: code !== undefined };
}

/**
 * Direction rule (design decision 1): the VAT side leads as `konto`, because
 * BMD computes and books the tax only on the leading account; `betrag` is the
 * gross minus the tax and `steuer` the tax, both signed from `konto` (negative
 * when it is credited). Without a VAT side a revenue or bad-debt side (one
 * whose `kost` BMD reads as Kostenstelle) leads with the signed gross, so an
 * untaxed charge keeps its Kostenstelle like its reduction does. Otherwise
 * `konto` is the debited account and `betrag` the absolute gross; a negative
 * gross swaps the sides.
 */
function toBooking(
  line: LedgerLine,
  debit: PostedSide,
  credit: PostedSide,
  vatSide: PostedSide | undefined,
  steuerCents: number,
  { chart, options }: PostingContext,
): PostedBooking {
  const negative = line.grossCents < 0;
  const leading = vatSide ?? kostSide(debit, credit);
  const [konto, gkonto] = leading ? [leading, leading === debit ? credit : debit] : negative ? [credit, debit] : [debit, credit];
  // Soll (+) when konto is the debited account of a positive line, or the credited account of a negative one.
  const sign = (konto === debit) !== negative ? 1 : -1;
  const gross = Math.abs(line.grossCents);
  const betragCents = sign * (gross - (vatSide ? steuerCents : 0));
  const labelled = vatSide ?? credit;
  const kost = kostOf(konto.row);
  const text = buchungstext(line, labelled.ref, chart, vatSide?.rate ?? 0);
  return {
    konto: konto.row.bmdAccount,
    gkonto: gkonto.row.bmdAccount,
    businessDate: line.businessDate,
    buchsymbol: !vatSide && (line.debit.type === 'Payments' || line.credit.type === 'Payments') ? options.buchsymbolZahlung : options.buchsymbol,
    betragCents,
    ...(vatSide ? { tax: { steuercode: vatSide.steuercode ?? 0, prozent: vatSide.rate, steuerCents: steuerCents === 0 ? 0 : sign * steuerCents } } : {}),
    ...(text === '' ? {} : { text }),
    ...(kost === undefined ? {} : { kost }),
    extbelegnr: extbelegnr(line, options.extbelegnr),
    sourceEntryNumbers: [line.sourceEntryNumber],
  };
}

/** The one side whose row type takes a Kostenstelle (revenue, bad debt), or undefined when none or both do. */
function kostSide(debit: PostedSide, credit: PostedSide): PostedSide | undefined {
  const d = KOST_TYPES.has(debit.row.apaleoType);
  const c = KOST_TYPES.has(credit.row.apaleoType);
  return d === c ? undefined : d ? debit : credit;
}
