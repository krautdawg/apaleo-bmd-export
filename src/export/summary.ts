import { formatFinding, type Finding } from '../core/findings.js';
import { decimalToCents, formatCents } from '../core/money.js';
import type { PostingSummary, SkipReason, VatTotal } from '../posting/index.js';
import { formatTable } from '../cli/table.js';
import type { PeriodPart } from './period.js';

const SKIP_LABELS: Readonly<Record<SkipReason, string>> = {
  VAT_ACCOUNT_LINE: 'apaleo VAT account line (BMD books the tax from Steuer)',
  ZERO_AMOUNT: 'amount 0.00',
  SAME_ACCOUNT: 'both sides on the same BMD account',
};

export interface SummaryInput {
  propertyId: string;
  part: PeriodPart;
  ledgerLines: number;
  bookings: number;
  /** Absent when posting did not run (for example a day that is not closed). */
  summary?: PostingSummary;
  /** The target's import block (`TargetWriter.importBlock`), once the file is rendered. */
  importBlock?: readonly string[];
  findings: readonly Finding[];
}

/** Why the tax of the bookings and apaleo's VAT differ by a few cents, for the Kanzlei. */
export const VAT_ROUNDING_NOTE =
  "Each booking carries apaleo's tax of its line, rounded to the cent, while apaleo rounds only the precise total of its lines, " +
  "so a difference (apaleo VAT minus tax) of a few cents is this rounding, not an error.";

/**
 * The posting summary as aligned text, for the dry run and the protocol file:
 * the import block, totals per BMD account, revenue, deposit and write-off VAT
 * per rate (bookings against apaleo), Ortstaxe and other levies, payments per
 * clearing account, deposits, accounts receivable, skipped lines and every finding.
 */
export function renderSummary({ propertyId, part, ledgerLines, bookings, summary, importBlock, findings }: SummaryInput): string {
  const out: string[] = [`Property ${propertyId}, ${part.from} to ${part.to}: ${ledgerLines} apaleo lines, ${bookings} BMD bookings`, ''];
  if (importBlock) out.push(...importBlock, '');
  if (summary) out.push(...postingSection(summary));
  out.push('Findings:');
  out.push(...(findings.length === 0 ? ['  none'] : findings.map((finding) => `  ${formatFinding(finding)}`)), '');
  return out.join('\n');
}

function postingSection(summary: PostingSummary): string[] {
  const out: string[] = [];
  const section = (title: string, body: string) => out.push(title, body.trimEnd() || '  none', '');

  const accounts = summary.accounts.map((a) => [a.account, formatCents(a.sollCents), formatCents(a.habenCents), formatCents(a.balanceCents)]);
  section('Totals per BMD account (Konto with Betrag, Gegenkonto with Betrag plus Steuer):', formatTable([['account', 'Soll', 'Haben', 'balance'], ...accounts], [1, 2, 3], '  '));

  section('Revenue and VAT per rate:', vatLines(summary.revenueByRate));
  section('Deposits and their VAT per rate (received minus released):', vatLines(summary.depositVatByRate));
  section('Written-off receivables (Forderungsverluste) and the VAT correction per rate:', vatLines(summary.writeOffsByRate));
  out.push(VAT_ROUNDING_NOTE, '', `Ortstaxe and other guest levies (apaleo city tax): ${formatCents(summary.cityTaxCents)}`, '');

  const payments = summary.payments.map((p) => [p.account, formatCents(p.cents)]);
  section('Payments per clearing account:', payments.length === 0 ? '' : formatTable([['account', 'amount'], ...payments], [1], '  '));
  const { receivedCents, releasedCents, refundedCents } = summary.deposits;
  out.push(
    `Deposits: received ${formatCents(receivedCents)}, released ${formatCents(releasedCents)}, of it refunded ${formatCents(refundedCents)}`,
    `Accounts receivable (Sammeldebitor, Soll positive): ${formatCents(summary.accountsReceivableCents)}`,
    `VAT rounding differences: ${formatCents(summary.roundingCents)}`,
    '',
  );

  const skipped = summary.skipped.map((s) => [SKIP_LABELS[s.reason], String(s.lines), formatCents(s.grossCents)]);
  section('Skipped lines:', skipped.length === 0 ? '' : formatTable([['reason', 'lines', 'gross (unsigned)'], ...skipped], [1, 2], '  '));
  return out;
}

/** `10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)`, one line per rate. */
function vatLines(totals: readonly VatTotal[]): string {
  return totals
    .map((t) => {
      const apaleo = decimalToCents(t.apaleoVat);
      return (
        `  ${t.ratePercent} %: net ${formatCents(t.netCents)}, tax ${formatCents(t.vatCents)}, gross ${formatCents(t.grossCents)}, ` +
        `apaleo VAT ${formatCents(apaleo)}, difference ${formatCents(apaleo - t.vatCents)} (apaleo precise ${t.apaleoVat})`
      );
    })
    .join('\n');
}
