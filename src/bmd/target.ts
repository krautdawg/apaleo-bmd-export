import { fileTag, type TargetFileMeta, type TargetWriter } from '../export/target.js';
import { DEFAULT_DIALECT } from './format.js';
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

/** The BMD Buchungsimport as the export's target, with the settings `settingsOf` reads for each file (default: the config). */
export function createBmdTarget(settingsOf: (meta: TargetFileMeta) => BmdTargetSettings = settingsFromConfig): TargetWriter<BmdBooking> {
  const optionsOf = (meta: TargetFileMeta): BmdRenderOptions => ({
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
      const { bytes, notes } = renderBuchungsimport(bookings, optionsOf(meta));
      return { bytes, findings: notes };
    },
    // The file has no creation time: unchanged means byte-identical.
    sameContent: (existing, next) => existing.length === next.length && existing.every((byte, i) => byte === next[i]),
    advice: {
      overlap:
        'Importing both files would book those days twice in BMD NTCS. Export the same period as that file, or move it away ' +
        '(and have the Kanzlei reverse its imported bookings in BMD if it was imported) and run again',
      // The output folder logic compares the lines after the header. A dialect change rewrites the date in every
      // line too, so it only reaches `headerChange` for a file without bookings; `reimport` names it for the rest.
      headerChange: 'the BMD dialect (bmd.dialect: header names and date format) changed since it was written.',
      reimport:
        'A change of bmd.dialect also gives every line another date format, so the bookings themselves may be unchanged. ' +
        'A BMD Buchungsimport is not idempotent, so importing both files would book those days twice. ' +
        'If the Kanzlei has imported the old file, it must first delete or reverse those bookings in BMD NTCS ' +
        '(they carry the Belegnummern of the old file under its Buchungssymbol).',
    },
  };
}

export const bmdTarget: TargetWriter<BmdBooking> = createBmdTarget();
