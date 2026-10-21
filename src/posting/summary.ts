import type { BmdBooking } from '../bmd/types.js';
import { depositMovement } from '../core/deposits.js';
import type { Finding } from '../core/findings.js';
import { negateDecimal, sumDecimals } from '../core/money.js';
import type { LedgerLine } from '../core/source.js';
import type { ApaleoVat } from './apaleo-vat.js';
import type { PostedSide } from './guard.js';
import { SKIP_REASONS, type PostingSummary, type SkipReason, type VatTotal } from './types.js';

/** BMD account numbers in numeric order: shorter (Sachkonten) before longer (Personenkonten) numbers. */
const byNumber = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

const CITY_TAX_TYPES: ReadonlySet<string> = new Set(['CityTaxes', 'SecondCityTax', 'GuestLevies']);

/** Signed amount for a type: positive when an account of the type is credited, negative when debited, 0 when absent. */
function creditedAmount(line: LedgerLine, types: ReadonlySet<string> | string): number {
  const has = (type: string) => (typeof types === 'string' ? type === types : types.has(type));
  return (has(line.credit.type) ? line.grossCents : 0) - (has(line.debit.type) ? line.grossCents : 0);
}

/**
 * The movement model of a booking (design decision 10): `konto` moves by `betrag`,
 * `gkonto` by minus `betrag` plus `steuer`, which is apaleo's gross. The tax leg
 * on BMD's own tax account is not part of it. Soll positive.
 */
export function bookingMovements(booking: Pick<BmdBooking, 'konto' | 'gkonto' | 'betragCents' | 'tax'>): [string, number][] {
  return [
    [booking.konto, booking.betragCents],
    [booking.gkonto, -(booking.betragCents + (booking.tax?.steuerCents ?? 0))],
  ];
}

/**
 * The Soll and Haben totals of BMD's journal after the import: BMD posts `konto`
 * with Betrag, `gkonto` with Betrag plus Steuer and its own tax account with
 * Steuer, so both totals are the same. Not sums by the sign of Betrag, which
 * would leave the tax and the Gegenbuchung out.
 */
export function journalTotals(bookings: readonly Pick<BmdBooking, 'konto' | 'gkonto' | 'betragCents' | 'tax'>[]): { sollCents: number; habenCents: number } {
  let sollCents = 0;
  let habenCents = 0;
  for (const booking of bookings) {
    const legs = [...bookingMovements(booking).map(([, cents]) => cents), booking.tax?.steuerCents ?? 0];
    for (const cents of legs) {
      if (cents > 0) sollCents += cents;
      else habenCents -= cents;
    }
  }
  return { sollCents, habenCents };
}

/** The Steuer of the bookings per VAT rate, signed as owed (Haben positive), so a Forderungsverlust or an allowance reduces it. */
export function taxByRate(bookings: readonly Pick<BmdBooking, 'tax'>[]): { ratePercent: number; taxCents: number }[] {
  const totals = new Map<number, number>();
  for (const { tax } of bookings) if (tax) totals.set(tax.prozent, (totals.get(tax.prozent) ?? 0) - tax.steuerCents);
  return [...totals].sort(([a], [b]) => a - b).map(([ratePercent, taxCents]) => ({ ratePercent, taxCents }));
}

interface VatEntry {
  net: number;
  vat: number;
  apaleo: string[];
}

/** Collects the totals of a posting run while bookings are produced. */
export class SummaryBuilder {
  private readonly accounts = new Map<string, { soll: number; haben: number }>();
  private readonly revenue = new Map<number, VatEntry>();
  private readonly depositVat = new Map<number, VatEntry>();
  private readonly writeOffs = new Map<number, VatEntry>();
  private readonly payments = new Map<string, number>();
  private readonly skipped = new Map<SkipReason, { lines: number; gross: number }>();
  private cityTax = 0;
  private readonly deposits = { receivedCents: 0, releasedCents: 0, refundedCents: 0 };
  private accountsReceivable = 0;
  private rounding = 0;

  /** `apaleoVat` is what `apaleoVatOf` gives for the line. */
  addBooking(line: LedgerLine, booking: BmdBooking, debit: PostedSide, credit: PostedSide, roundingCents: number, apaleoVat: readonly ApaleoVat[]): void {
    for (const [account, cents] of bookingMovements(booking)) {
      const entry = this.account(account);
      if (cents > 0) entry.soll += cents;
      else entry.haben -= cents;
    }
    this.rounding += roundingCents;

    const side = (type: string) => (credit.ref.type === type ? credit : debit.ref.type === type ? debit : undefined);
    const revenue = side('Revenues');
    const deposit = revenue ? undefined : side('Liabilities');
    const vatSide = revenue ?? deposit;
    if (vatSide) {
      // Owed (positive) when the revenue or deposit account is credited.
      const owed = booking.tax && vatSide.vat ? { net: -booking.betragCents, vat: -booking.tax.steuerCents } : { net: creditedAmount(line, vatSide.ref.type), vat: 0 };
      const rate = booking.tax && vatSide.vat ? booking.tax.prozent : 0;
      addVat(revenue ? this.revenue : this.depositVat, rate, owed, apaleoVat.map((vat) => vat.precise));
    }
    const loss = vatSide ? undefined : side('LossOfAccountsReceivable');
    if (loss) {
      // Written off (positive) when the bad-debt account is debited, so apaleo's VAT (signed as owed) is negated.
      // A taxed bad-debt side leads as konto: Betrag and Steuer are signed from it.
      const tax = loss.vat ? booking.tax : undefined;
      const written = tax ? { net: booking.betragCents, vat: tax.steuerCents } : { net: -creditedAmount(line, loss.ref.type), vat: 0 };
      addVat(this.writeOffs, tax?.prozent ?? 0, written, apaleoVat.map((vat) => negateDecimal(vat.precise)));
    }
    this.cityTax += creditedAmount(line, CITY_TAX_TYPES);
    for (const payment of [debit, credit]) {
      if (payment.ref.type !== 'Payments') continue;
      const signed = payment === debit ? line.grossCents : -line.grossCents;
      this.payments.set(payment.row.bmdAccount, (this.payments.get(payment.row.bmdAccount) ?? 0) + signed);
    }
    const movement = depositMovement(line);
    if (movement?.direction === 'increase') this.deposits.receivedCents += movement.cents;
    if (movement?.direction === 'decrease') this.deposits.releasedCents += movement.cents;
    if (movement?.direction === 'decrease' && movement.viaPayment) this.deposits.refundedCents += movement.cents;
    this.accountsReceivable -= creditedAmount(line, 'AccountsReceivable');
  }

  addSkipped(reason: SkipReason, line: LedgerLine): void {
    const entry = this.skipped.get(reason) ?? { lines: 0, gross: 0 };
    entry.lines += 1;
    entry.gross += Math.abs(line.grossCents);
    this.skipped.set(reason, entry);
  }

  build(findings: readonly Finding[]): PostingSummary {
    const counts = new Map<string, number>();
    for (const finding of findings) counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
    return {
      accounts: [...this.accounts]
        .sort(([a], [b]) => byNumber(a, b))
        .map(([account, { soll, haben }]) => ({ account, sollCents: soll, habenCents: haben, balanceCents: soll - haben })),
      revenueByRate: vatTotals(this.revenue),
      depositVatByRate: vatTotals(this.depositVat),
      writeOffsByRate: vatTotals(this.writeOffs),
      cityTaxCents: this.cityTax,
      payments: [...this.payments].sort(([a], [b]) => byNumber(a, b)).map(([account, cents]) => ({ account, cents })),
      deposits: { ...this.deposits },
      accountsReceivableCents: this.accountsReceivable,
      skipped: SKIP_REASONS.flatMap((reason) => {
        const entry = this.skipped.get(reason);
        return entry ? [{ reason, lines: entry.lines, grossCents: entry.gross }] : [];
      }),
      roundingCents: this.rounding,
      findings: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })),
    };
  }

  private account(number: string): { soll: number; haben: number } {
    let entry = this.accounts.get(number);
    if (!entry) {
      entry = { soll: 0, haben: 0 };
      this.accounts.set(number, entry);
    }
    return entry;
  }
}

function addVat(totals: Map<number, VatEntry>, rate: number, { net, vat }: { net: number; vat: number }, apaleoPrecise: readonly string[]): void {
  const entry = totals.get(rate) ?? { net: 0, vat: 0, apaleo: [] };
  entry.net += net;
  entry.vat += vat;
  entry.apaleo.push(...apaleoPrecise);
  totals.set(rate, entry);
}

function vatTotals(entries: ReadonlyMap<number, VatEntry>): VatTotal[] {
  return [...entries]
    .sort(([a], [b]) => a - b)
    .map(([ratePercent, { net, vat, apaleo }]) => ({ ratePercent, netCents: net, vatCents: vat, grossCents: net + vat, apaleoVat: sumDecimals(apaleo) }));
}
