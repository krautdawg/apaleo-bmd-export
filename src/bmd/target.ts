import { fileTag, type TargetFileMeta, type TargetWriter } from '../export/target.js';
import { DEFAULT_DIALECT } from './format.js';
import { importBlock } from './import-block.js';
import type { BmdBooking, BmdDialect, BmdRenderOptions } from './types.js';
import { buchungsimportFileName, renderBuchungsimport } from './writer.js';

/** `BMD_Buchungsimport_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.csv`; replaced files have a dot in the suffix and do not match. */
const BMD_FILE = /^BMD_Buchungsimport_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$/;

/** What the Kanzlei's BMD Mandant decides about every file: the dialect and the account lengths. */
export interface BmdTargetSettings {
  dialect: BmdDialect;
  sachkontenlaenge: number;
  personenkontenlaenge: number;
}

/** The defaults of the `bmd` config section: NTCS, 4-digit Sachkonten as in the EKR, 6-digit Personenkonten (`201001` in PR08). */
export const BMD_DEFAULT_SETTINGS: Readonly<BmdTargetSettings> = { dialect: DEFAULT_DIALECT, sachkontenlaenge: 4, personenkontenlaenge: 6 };

/** The file settings of the config's `bmd` section. */
export function settingsFromConfig({ config }: Pick<TargetFileMeta, 'config'>): BmdTargetSettings {
  const { dialect, sachkontenlaenge, personenkontenlaenge } = config.bmd;
  return { dialect, sachkontenlaenge, personenkontenlaenge };
}

/**
 * Starts every Buchungstext of a demo file (`export --demo`), so an imported demo
 * line is recognisable in BMD, which has no description per file. The
 * 40-character limit of `text` applies after it.
 */
export const DEMO_TEXT_PREFIX = 'DEMO ';

/** The bookings as a demo file writes them: every text with `DEMO_TEXT_PREFIX`. */
export function markDemo<B extends BmdBooking>(bookings: readonly B[]): B[] {
  return bookings.map((booking) => ({ ...booking, text: `${DEMO_TEXT_PREFIX}${booking.text ?? ''}` }));
}

/** The BMD Buchungsimport as the export's target, with the settings `settingsOf` reads for each file (default: the config). */
export function createBmdTarget(settingsOf: (meta: TargetFileMeta) => BmdTargetSettings = settingsFromConfig): TargetWriter<BmdBooking> {
  const optionsOf = (meta: TargetFileMeta): Required<BmdRenderOptions> => ({
    ...settingsOf(meta),
    from: meta.part.from,
    to: meta.part.to,
    propertyId: meta.propertyId,
  });
  return {
    id: 'bmd',
    protocolTitle: 'apaleo-bmd export protocol',
    filePattern: BMD_FILE,
    fileName: (meta) => buchungsimportFileName(optionsOf(meta), fileTag(meta)),
    render(bookings, meta) {
      const { bytes, notes } = renderBuchungsimport(meta.demo ? markDemo(bookings) : bookings, optionsOf(meta));
      return { bytes, findings: notes };
    },
    importBlock: (bookings, meta) => importBlock(bookings, optionsOf(meta), buchungsimportFileName(optionsOf(meta), fileTag(meta))),
    // The file has no creation time: unchanged means byte-identical.
    sameContent: (existing, next) => existing.length === next.length && existing.every((byte, i) => byte === next[i]),
    advice: {
      overlap:
        'Importing both files would book those days twice in BMD NTCS. Export the same period as that file, or move it away ' +
        '(and have the Kanzlei reverse its imported bookings in BMD if it was imported) and run again',
      reimport:
        'A change of bmd.dialect or bmd.buchsymbol also changes every line, so the bookings themselves may be unchanged. ' +
        'BMD does not recognise a file it has already imported, so importing both files would book those days twice. ' +
        'If the Kanzlei has already imported the old file, it must first delete the imported bookings of that file in BMD NTCS ' +
        "(the old file's protocol names their Buchungssymbol and the range of Belegnummern).",
    },
  };
}

export const bmdTarget: TargetWriter<BmdBooking> = createBmdTarget();
