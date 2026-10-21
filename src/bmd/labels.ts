/**
 * The names the Kanzlei knows from BMD for each field, so findings never show
 * internal property names such as `betragCents`.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  konto: 'Konto',
  gkonto: 'Gegenkonto',
  businessDate: 'Belegdatum',
  buchsymbol: 'Buchungssymbol',
  betragCents: 'Betrag',
  steuercode: 'Steuercode',
  prozent: 'Prozent',
  steuerCents: 'Steuer',
  text: 'Buchungstext',
  kost: 'Kostenstelle',
  extbelegnr: 'Externe Belegnummer',
  belegnr: 'Belegnummer',
  from: 'Beginn des Zeitraums',
  to: 'Ende des Zeitraums',
};

/** The BMD name of a field, or the field name itself if none is known. */
export function labelOf(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
