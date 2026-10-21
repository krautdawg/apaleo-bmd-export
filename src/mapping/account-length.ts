import type { Finding } from '../core/findings.js';
import { PERSONAL_ACCOUNT_TYPE, type MappingRow } from './types.js';

/**
 * BMD account numbers have an exact length: a Sachkonto has exactly the
 * Sachkontenlänge, a Personenkonto (Debitor) exactly the Personenkontenlänge.
 * Only AccountsReceivable rows may name a Personenkonto.
 */

export interface AccountLengths {
  sachkontenlaenge: number;
  personenkontenlaenge: number;
}

/** The allowed lengths for a row's BMD account: AccountsReceivable rows take a Sachkonto or a Personenkonto. */
export function allowedLengths(apaleoType: string, { sachkontenlaenge, personenkontenlaenge }: AccountLengths): number[] {
  if (apaleoType === PERSONAL_ACCOUNT_TYPE) return [...new Set([sachkontenlaenge, personenkontenlaenge])];
  return [sachkontenlaenge];
}

/**
 * Restores leading zeros that Excel removed, only where that is unambiguous: at
 * Sachkontenlänge 4 a Sachkonto with 1 to 3 digits can only be a class-0 account
 * such as `0650`. Every other number is returned unchanged (a wrong length is
 * reported by `checkMapping`, never padded).
 */
export function restoreLeadingZeros(
  account: string,
  apaleoType: string,
  sachkontenlaenge: number,
): { account: string; padded: boolean } {
  const sachkonto = apaleoType !== PERSONAL_ACCOUNT_TYPE;
  if (sachkontenlaenge === 4 && sachkonto && /^\d{1,3}$/.test(account)) {
    return { account: account.padStart(4, '0'), padded: true };
  }
  return { account, padded: false };
}

export function paddedFinding(row: MappingRow, original: string): Finding {
  return {
    code: 'W-PADDED',
    message:
      `line ${row.line}: BMD account "${original}" was read as ${row.bmdAccount} (leading zeros restored; ` +
      'Excel removes them unless the column is formatted as Text)',
    field: 'bmd_account',
    value: original,
  };
}

/** `E-ACCOUNT-LENGTH` for a row whose BMD account is not digits only or has the wrong number of digits, else undefined. */
export function accountLengthFinding(row: MappingRow, lengths: AccountLengths): Finding | undefined {
  const allowed = allowedLengths(row.apaleoType, lengths);
  const account = row.bmdAccount;
  const digits = /^\d+$/.test(account);
  if (digits && allowed.includes(account.length)) return undefined;
  const { sachkontenlaenge, personenkontenlaenge } = lengths;
  const needs =
    allowed.length > 1
      ? `${sachkontenlaenge} digits as a Sachkonto or ${personenkontenlaenge} digits as a Personenkonto`
      : `exactly ${sachkontenlaenge} digits as a Sachkonto (Sachkontenlänge ${sachkontenlaenge})`;
  const example = digits && account.length < sachkontenlaenge ? ` (for example ${account.padEnd(sachkontenlaenge, '0')})` : '';
  const what = digits ? `has ${account.length} digits, but needs ${needs}${example}` : `must contain digits only and have ${needs}`;
  return {
    code: 'E-ACCOUNT-LENGTH',
    message:
      `line ${row.line}: BMD account ${account} ${what}. Account numbers are never padded: a template number needs its ` +
      `trailing zeros (2890 becomes 28900 at Sachkontenlänge 5), and Excel may have removed leading zeros (format the column as Text).`,
    field: 'bmd_account',
    value: account,
  };
}
