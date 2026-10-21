import { readFileSync } from 'node:fs';
import { parseMapping, type Mapping } from '../../src/mapping/index.js';
import { fixturePath } from './apaleo.js';

/** `live/VIE/mapping-VIE.live.csv`: what `init-mapping --template ekr` writes on the VIE chart, byte for byte. */
export const VIE_TEMPLATE_MAPPING = readFileSync(fixturePath('live/VIE/mapping-VIE.live.csv'), 'utf8');

/** The one row the template leaves to the Kanzlei on the recorded VIE day: the no-show at 13 %. */
export const VIE_NO_SHOW = 'RevenueNoShow_Reduced:13.00';

const NO_SHOW_ROW = new RegExp(`^${VIE_NO_SHOW.replaceAll('.', '\\.')};Revenues;([^;]*);13;;;;;(.*)$`, 'm');

/**
 * The VIE mapping after the Kanzlei's review (design decision 7 of b05): the
 * no-show at 13 % confirmed as taxable and filled in as apaleo charged it, on
 * the 13 % revenue account `4040` with Steuercode 1.
 */
export const VIE_MAPPING = fillNoShow(VIE_TEMPLATE_MAPPING);

function fillNoShow(text: string): string {
  if (!NO_SHOW_ROW.test(text)) throw new Error(`the live VIE mapping has no empty row for ${VIE_NO_SHOW}`);
  return text.replace(NO_SHOW_ROW, `${VIE_NO_SHOW};Revenues;$1;13;4040;1;13;;Mit der Kanzlei geklärt: No-Show steuerbar, 13 % wie in apaleo.`);
}

/** `VIE_MAPPING` loaded as the export loads a mapping file. */
export function vieMapping(): Mapping {
  return parseMapping(new TextEncoder().encode(VIE_MAPPING), { path: 'mapping-VIE.csv', sachkontenlaenge: 4 });
}
