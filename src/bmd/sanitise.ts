import { cp1252Byte, describe } from '../core/cp1252.js';
import type { Finding } from '../core/findings.js';
import { EXTBELEGNR_MAX_LENGTH, TEXT_MAX_LENGTH } from './format.js';
import { labelOf } from './labels.js';

export interface Sanitised {
  value: string;
  /** `N-BMD-CHARSET` and `N-BMD-TRUNCATED`, with booking index, field and original value. */
  notes: Finding[];
}

type TextField = 'text' | 'extbelegnr';

/** The separator, quotes and every control character (tab, CR, LF and the rest) would break a line. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const BREAKS_LINE = /[;"\u0000-\u001f\u007f-\u009f]/g;
const EXTBELEGNR_DISALLOWED = /[^A-Za-z0-9\-/._]/g;
const REPLACEMENT = '?';

/**
 * `text`: separator, quotes and control characters become spaces, repeated
 * spaces collapse, the ends are trimmed, characters Windows-1252 cannot encode
 * become `?` (`N-BMD-CHARSET`), then the value is cut to 40 characters
 * (`N-BMD-TRUNCATED`). The text is composed (NFC) first, so a decomposed `ü` stays `ü`.
 */
export function sanitiseText(original: string, index: number): Sanitised {
  return clean(original, index, 'text', TEXT_MAX_LENGTH);
}

/**
 * `extbelegnr`: separator, quotes and control characters become spaces as in
 * `text`, then every character outside `A-Z a-z 0-9 - / . _` (spaces included)
 * is removed (`N-BMD-CHARSET`) and the value is cut to 35 characters.
 */
export function sanitiseExtbelegnr(original: string, index: number): Sanitised {
  return clean(original, index, 'extbelegnr', EXTBELEGNR_MAX_LENGTH);
}

function clean(original: string, index: number, field: TextField, maxLength: number): Sanitised {
  const notes: Finding[] = [];
  const note = (code: string, message: string) =>
    notes.push({ code, index, field, label: labelOf(field), value: original, message: `${labelOf(field)} ${message}` });

  const spaced = original.normalize('NFC').replace(BREAKS_LINE, ' ').replace(/ {2,}/g, ' ').trim();
  let value: string;
  if (field === 'extbelegnr') {
    value = spaced.replace(EXTBELEGNR_DISALLOWED, '');
    if (value !== spaced) note('N-BMD-CHARSET', `may only contain A-Z a-z 0-9 - / . _, written as "${value}"`);
  } else {
    // One pass; a Set keeps first-seen order for the note without a linear search per character.
    const unencodable = new Set<string>();
    value = '';
    for (const char of spaced) {
      if (cp1252Byte(char.codePointAt(0) ?? -1) === undefined) {
        unencodable.add(char);
        value += REPLACEMENT;
      } else {
        value += char;
      }
    }
    if (unencodable.size > 0) {
      note('N-BMD-CHARSET', `${[...unencodable].map(describe).join(', ')} not in Windows-1252, written as "${value}"`);
    }
  }
  const chars = [...value];
  if (chars.length > maxLength) {
    value = chars.slice(0, maxLength).join('').trimEnd();
    note('N-BMD-TRUNCATED', `longer than ${maxLength} characters, cut to "${value}"`);
  }
  return { value, notes };
}
