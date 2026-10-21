import { compareAggregates } from '../core/aggregates.js';
import type { ChartIndex } from '../core/chart.js';
import { eachDay, nextDay, type LocalDate } from '../core/date.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents, negateDecimal, sumDecimals } from '../core/money.js';
import type { LedgerLine, SourceAdapter } from '../core/source.js';
import { parseSteuercode, resolve, type Mapping, type MappingRow } from '../mapping/index.js';
import {
  apaleoVatOf,
  bookingMovements,
  inferReleaseRates,
  inferredTaxCents,
  normaliseTaxes,
  resolutionRate,
  type PostingResult,
  type ReleaseRate,
} from '../posting/index.js';
import type { DateRange } from './period.js';

/**
 * Plausibility checks on a posting result before its file is written (design
 * decision 10). They re-derive what the bookings must add up to from the apaleo
 * lines, so a defect in the posting rules cannot reach BMD unnoticed.
 */

export interface CheckOptions {
  mapping: Mapping;
  chart: ChartIndex;
}

/** Adds `cents` to the entry for `key`. */
function add<K>(map: Map<K, number>, key: K, cents: number): void {
  map.set(key, (map.get(key) ?? 0) + cents);
}

const absoluteGross = (lines: readonly LedgerLine[]) => lines.reduce((sum, line) => sum + Math.abs(line.grossCents), 0);

/** Every ledger line is booked or skipped, by count and by absolute gross amount (`E-CONSERVATION`). */
export function checkConservation(lines: readonly LedgerLine[], result: PostingResult): Finding[] {
  const ledger = absoluteGross(lines);
  // A booking moves apaleo's gross: Betrag plus Steuer.
  const booked = result.bookings.reduce((sum, booking) => sum + Math.abs(booking.betragCents + (booking.tax?.steuerCents ?? 0)), 0);
  const skipped = absoluteGross(result.skipped.map((entry) => entry.line));
  const count = result.bookings.length + result.skipped.length;
  if (ledger === booked + skipped && lines.length === count) return [];
  return [
    {
      code: 'E-CONSERVATION',
      message:
        `the ${lines.length} apaleo lines move ${formatCents(ledger)} (absolute gross), but the ${result.bookings.length} bookings ` +
        `move ${formatCents(booked)} and the ${result.skipped.length} skipped lines ${formatCents(skipped)}, ` +
        `so ${formatCents(ledger - booked - skipped)} would be lost or doubled. ${REPORT_PROBLEM_HINT}`,
    },
  ];
}

const dayKey = (day: LocalDate, account: string) => `${day} ${account}`;

/**
 * Per business day and BMD account, the signed movement in the bookings (the
 * movement model: `konto` by `betrag`, `gkonto` by minus `betrag` plus
 * `steuer`) equals the signed movement of the booked apaleo lines mapped to
 * that account: debit positive, credit negative, and on the side whose row has
 * a Steuercode the gross minus apaleo's tax (BMD books the tax on its own tax
 * account). Catches side, sign and account bugs (`E-ACCOUNT-BALANCE`).
 */
export function checkAccountMovements(lines: readonly LedgerLine[], result: PostingResult, { mapping, chart }: CheckOptions): Finding[] {
  const skipped = new Set(result.skipped.map((entry) => entry.line));
  const releases = inferReleaseRates(lines, chart);
  const expected = new Map<string, number>();
  for (const line of lines) {
    if (skipped.has(line)) continue;
    const rate = resolutionRate(line, releases);
    const debit = resolve(mapping, line.debit, { rate, chart });
    const credit = resolve(mapping, line.credit, { rate, chart });
    // An unmapped side is reported by the coverage check.
    if (!debit?.bmdAccount || !credit?.bmdAccount) continue;
    const tax = Math.sign(line.grossCents) * lineTaxCents(line, releases.get(line));
    const taxOn = (row: MappingRow) => (parseSteuercode(row.steuercode) === undefined ? 0 : tax);
    add(expected, dayKey(line.businessDate, debit.bmdAccount), line.grossCents - taxOn(debit));
    add(expected, dayKey(line.businessDate, credit.bmdAccount), -(line.grossCents - taxOn(credit)));
  }
  const actual = new Map<string, number>();
  for (const booking of result.bookings) {
    for (const [account, cents] of bookingMovements(booking)) add(actual, dayKey(booking.businessDate, account), cents);
  }
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  return keys.flatMap((key) => {
    const [day = '', account = ''] = key.split(' ');
    const want = expected.get(key) ?? 0;
    const got = actual.get(key) ?? 0;
    if (want === got) return [];
    return [
      {
        code: 'E-ACCOUNT-BALANCE',
        message:
          `on ${day} BMD account ${account} moves ${formatCents(got)} in the bookings, but the apaleo lines mapped to it ` +
          `move ${formatCents(want)} (Soll positive, Haben negative). ${REPORT_PROBLEM_HINT}`,
        value: account,
      },
    ];
  });
}

/** apaleo's tax of a line in cents, unsigned: its taxes rounded per line, or the inferred tax of an untaxed deposit line. */
function lineTaxCents(line: LedgerLine, release: ReleaseRate | undefined): number {
  const taxes = normaliseTaxes(line.taxes);
  if (taxes.length > 0) return Math.abs(taxes.reduce((sum, tax) => sum + tax.amountCents, 0));
  return release && release.kind !== 'unknown' ? inferredTaxCents(line, release) : 0;
}

/** apaleo's VAT per rate: the per-line taxes rounded to cents (for the check) and their precise sum (for the message). */
interface ApaleoVatTotal {
  cents: number;
  precise: string[];
}

/** VAT owed per rate in apaleo: the taxes of the booked lines, and for untaxed deposit lines the VAT apaleo moved for them. */
function apaleoVatByRate(lines: readonly LedgerLine[], result: PostingResult, chart: ChartIndex): Map<number, ApaleoVatTotal> {
  const skipped = new Set(result.skipped.map((entry) => entry.line));
  const releases = inferReleaseRates(lines, chart);
  const vat = new Map<number, ApaleoVatTotal>();
  for (const line of lines) {
    if (skipped.has(line)) continue;
    for (const { rate, cents, precise } of apaleoVatOf(line, releases.get(line))) {
      const entry = vat.get(rate) ?? { cents: 0, precise: [] };
      entry.cents += cents;
      entry.precise.push(precise);
      vat.set(rate, entry);
    }
  }
  return vat;
}

/** Tax owed per rate in the bookings: `steuer` on a credited `konto` (negative) is owed (+). */
function bookedVatByRate(result: PostingResult): Map<number, number> {
  const vat = new Map<number, number>();
  for (const { tax } of result.bookings) if (tax && tax.steuerCents !== 0) add(vat, tax.prozent, -tax.steuerCents);
  return vat;
}

/**
 * Per VAT rate, the tax the bookings carry (Σ `steuer`) equals the sum of
 * apaleo's per-line tax rounded to cents of the booked lines of that rate,
 * within one cent per `W-VAT-ROUNDING` the posting run reported on a computed
 * deposit tax at that rate (`E-VAT-TOTAL` above it). The difference to apaleo's
 * precise total is line rounding and never an error by itself.
 */
export function checkVatByRate(lines: readonly LedgerLine[], result: PostingResult, options: CheckOptions): Finding[] {
  const apaleo = apaleoVatByRate(lines, result, options.chart);
  const booked = bookedVatByRate(result);
  const rates = [...new Set([...apaleo.keys(), ...booked.keys()])].sort((a, b) => a - b);
  return rates.flatMap((rate) => {
    const allowance = result.vatRoundingByRate.get(rate) ?? 0;
    const charged = apaleo.get(rate)?.cents ?? 0;
    const precise = sumDecimals(apaleo.get(rate)?.precise ?? []);
    const carried = booked.get(rate) ?? 0;
    if (Math.abs(carried - charged) <= allowance) return [];
    const lineRounding = sumDecimals([formatCents(charged), negateDecimal(precise)]);
    return [
      {
        code: 'E-VAT-TOTAL',
        message:
          `at ${rate} % the bookings carry ${formatCents(carried)} tax, but apaleo charged ${formatCents(charged)} ` +
          `as the sum of its per-line tax rounded to cents (difference apaleo minus bookings ${formatCents(charged - carried)}, the rounding total allows ` +
          `${formatCents(allowance)}). apaleo's precise total is ${precise}; its per-line rounding (${lineRounding}) is no error, ` +
          `so the difference of ${formatCents(charged - carried)} is the problem. ` +
          REPORT_PROBLEM_HINT,
        value: String(rate),
      },
    ];
  });
}

/** The three blocking checks, in order. */
export function plausibilityFindings(lines: readonly LedgerLine[], result: PostingResult, options: CheckOptions): Finding[] {
  return [...checkConservation(lines, result), ...checkAccountMovements(lines, result, options), ...checkVatByRate(lines, result, options)];
}

/** How the ledger side of an aggregate comparison was added up, for messages. */
const BASIS_TEXT = { gross: 'gross amounts', net: 'precise net amounts', tax: 'precise taxes' } as const;

/**
 * The opt-in completeness check (`checks.aggregates`): apaleo's daily aggregates,
 * one request per business day, against that day's ledger lines by balance (see
 * `compareAggregates`). An account whose balances differ is a
 * `W-AGGREGATE-DIFF` warning.
 */
export async function checkAggregates(
  source: SourceAdapter,
  propertyId: string,
  period: DateRange,
  lines: readonly LedgerLine[],
  chart: ChartIndex,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  // One day at a time: these requests are not throttled by the adapter.
  for (const day of eachDay(period.from, nextDay(period.to))) {
    const totals = await source.getAccountTotals(propertyId, day);
    const dayLines = lines.filter((line) => line.businessDate === day);
    for (const comparison of compareAggregates(totals, dayLines, chart)) {
      if (comparison.match) continue;
      const { account } = comparison;
      findings.push({
        code: 'W-AGGREGATE-DIFF',
        message:
          `on ${day} apaleo's daily aggregate for account ${account.number} (${account.type}) has the balance ` +
          `${formatCents(comparison.sourceBalanceCents)}, but the ledger lines of that day add up to ${formatCents(comparison.ledgerBalanceCents)} ` +
          `(balance debit minus credit, from the ${BASIS_TEXT[comparison.basis]}). Compare the day in apaleo; the file is written anyway`,
        value: account.number,
      });
    }
  }
  return findings;
}
