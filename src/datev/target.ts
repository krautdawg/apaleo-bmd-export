import { fileTag, type TargetFileMeta, type TargetWriter } from '../export/target.js';
import type { PostedBooking } from '../posting/index.js';
import { encodeCp1252 } from './cp1252.js';
import type { ExtfHeader } from './types.js';
import { buchungsstapelFileName, renderBuchungsstapel } from './writer.js';

/** `EXTF_Buchungsstapel_<B>_<M>_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.csv`; replaced files have a dot in the suffix and do not match. */
const EXTF_FILE = /^EXTF_Buchungsstapel_\d+_\d+_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$/;

/** The DATEV-Format (EXTF) Buchungsstapel as the export's target. */
export const datevTarget: TargetWriter<PostedBooking> = {
  id: 'datev',
  protocolTitle: 'apaleo-bmd export protocol',
  filePattern: EXTF_FILE,
  fileName: (meta) => buchungsstapelFileName(extfHeader(meta), fileTag(meta)),
  render(bookings, meta) {
    const rendered = renderBuchungsstapel({ header: extfHeader(meta), bookings });
    // The writer already replaced every character outside CP1252 and reported it.
    return { bytes: encodeCp1252(rendered.text).bytes, findings: rendered.warnings };
  },
  sameContent: (existing, next) => sameBytes(withoutCreationTime(existing), withoutCreationTime(next)),
};

function extfHeader({ config, propertyId, part, skr, demo, createdAt }: TargetFileMeta): ExtfHeader {
  const { datev } = config;
  return {
    beraternummer: datev.beraternummer,
    mandantennummer: config.properties.find((p) => p.id === propertyId)?.mandantennummer ?? datev.mandantennummer,
    wjBeginn: part.wjBeginn,
    sachkontenlaenge: datev.sachkontenlaenge,
    datumVom: part.from,
    datumBis: part.to,
    sachkontenrahmen: skr,
    festschreibung: datev.festschreibung,
    bezeichnung: `${demo ? 'DEMO ' : ''}apaleo ${propertyId} ${part.month}`.slice(0, 30),
    erzeugtAm: createdAt,
  };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The file without the value of header field 6 (Erzeugt am), the only part that
 * differs between two runs over the same data. Every other header field (WJ-Beginn,
 * Datum vom/bis, Bezeichnung, Festschreibung, Sachkontenrahmen and so on) stays,
 * so a changed config counts as a change. Fields 1 to 5 are fixed values without
 * a separator, so field 6 lies between the fifth and the sixth semicolon.
 */
export function withoutCreationTime(bytes: Uint8Array): Uint8Array {
  const end = bytes.indexOf(0x0a);
  const headerEnd = end < 0 ? bytes.length : end;
  let start = -1;
  for (let field = 0; field < 5; field++) {
    start = bytes.indexOf(0x3b, start + 1);
    if (start < 0 || start >= headerEnd) return bytes;
  }
  const stop = bytes.indexOf(0x3b, start + 1);
  if (stop < 0 || stop >= headerEnd) return bytes;
  const result = new Uint8Array(bytes.length - (stop - start - 1));
  result.set(bytes.subarray(0, start + 1));
  result.set(bytes.subarray(stop), start + 1);
  return result;
}
