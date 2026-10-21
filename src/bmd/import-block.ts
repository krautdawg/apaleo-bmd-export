import { formatBelegnr, formatRate } from './format.js';
import type { BmdBooking, BmdDialect, BmdRenderOptions } from './types.js';
import { GEGENBUCHKZ, VERBUCHKZ } from './writer.js';

const DIALECT_NAMES: Readonly<Record<BmdDialect, string>> = { ntcs: 'BMD NTCS', bmd55: 'BMD 5.5' };

/**
 * The import block of the protocol: what the Kanzlei compares with its BMD
 * Mandant before the import (the checklist in docs/bmd-import.md). Steuercodes
 * are listed with every rate they carry in the file.
 */
export function importBlock(bookings: readonly Pick<BmdBooking, 'buchsymbol' | 'tax'>[], options: Required<BmdRenderOptions>, fileName: string): string[] {
  const symbols = [...new Set(bookings.map((b) => b.buchsymbol))].sort();
  const rates = new Map<number, Set<number>>();
  for (const { tax } of bookings) {
    if (tax) rates.set(tax.steuercode, (rates.get(tax.steuercode) ?? new Set()).add(tax.prozent));
  }
  const steuercodes = [...rates]
    .sort(([a], [b]) => a - b)
    .map(([code, percents]) => `${code} (${[...percents].sort((a, b) => a - b).map((p) => `${formatRate(p)} %`).join(', ')})`);
  const last = bookings.length - 1;
  return [
    'Import into BMD (compare with the Mandant before importing, see docs/bmd-import.md):',
    `  File: ${fileName}`,
    `  Lines: ${bookings.length} bookings (Satzart 0) after the header line`,
    `  Dialect: ${options.dialect} (${DIALECT_NAMES[options.dialect]})`,
    `  Buchungssymbole: ${symbols.join(', ') || 'none'}`,
    `  Belegnummern: ${last < 0 ? 'none' : `${formatBelegnr(options.from, 0)} to ${formatBelegnr(options.from, last)}`}`,
    `  verbuchkz ${VERBUCHKZ}, gegenbuchkz ${GEGENBUCHKZ}: BMD creates the Gegenbuchung and the tax posting itself`,
    `  Steuercodes: ${steuercodes.join(', ') || 'none'}`,
    `  Account lengths: Sachkonten ${options.sachkontenlaenge}, Personenkonten ${options.personenkontenlaenge}`,
  ];
}
