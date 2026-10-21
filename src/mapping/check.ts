import { DIALECTS, DEFAULT_DIALECT } from '../bmd/format.js';
import type { BmdDialect } from '../bmd/types.js';
import type { ChartIndex } from '../core/chart.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents } from '../core/money.js';
import { ACCOUNT_TYPES, type AccountRef, type LedgerLine } from '../core/source.js';
import { accountLengthFinding, type AccountLengths } from './account-length.js';
import { resolve } from './resolve.js';
import { shippedTemplate, templateWildcardAccount } from './template.js';
import {
  ANY_TYPE,
  KOST_TYPES,
  NO_TAX_TYPES,
  OUTPUT_TAX_TYPES,
  PERSONAL_ACCOUNT_TYPE,
  VAT_ACCOUNT_TYPES,
  VAT_RELEVANT_TYPES,
  WILDCARD,
  parsePercent,
  parseSteuercode,
  rowRate,
  type Mapping,
  type MappingRow,
} from './types.js';

export interface CheckMappingOptions extends AccountLengths {
  /** Which Steuercodes mean output and input tax. Default `ntcs`. */
  dialect?: BmdDialect | undefined;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set([...ACCOUNT_TYPES, ANY_TYPE]);

/** The VAT rates Austrian law knows today (UStG 1994 § 10, since 2026-07-01). */
export const AUSTRIAN_VAT_RATES: readonly number[] = [0, 4.9, 10, 13, 20];

const KOST = /^\d{1,9}$/;

/** `bmd.personenkontenlaenge` when a caller does not pass it. */
const DEFAULT_PERSONENKONTENLAENGE = 6;

/**
 * Offline validation of a loaded mapping (design decision 6): digits only and
 * the exact account length, Steuercode and rate together, no Steuercode on a
 * payment, guest claim or Debitor, no input-tax code on a sale, deposit, levy or bad debt, Austrian rates, `kost`, untaxed revenue and
 * the row's rate against the apaleo rate. Structural problems (duplicates,
 * forbidden wildcards) already fail `loadMapping`.
 */
export function checkMapping(mapping: Mapping, options: CheckMappingOptions): Finding[] {
  const findings: Finding[] = [];
  const ignored = mapping.rows.filter((row) => VAT_ACCOUNT_TYPES.has(row.apaleoType));
  if (ignored.length > 0) {
    findings.push({
      code: 'N-VAT-ROW-IGNORED',
      message:
        `${ignored.length} row(s) for Vat or VatOnLiabilities accounts (${ignored.map((r) => `line ${r.line}`).join(', ')}) ` +
        'are ignored: those lines are always skipped because BMD books the tax from the steuer field of the revenue or deposit line',
    });
  }
  for (const row of mapping.rows) {
    if (!VAT_ACCOUNT_TYPES.has(row.apaleoType)) findings.push(...checkRow(row, options));
  }
  return findings;
}

function checkRow(row: MappingRow, options: CheckMappingOptions): Finding[] {
  const where = `line ${row.line}`;
  const dialectName = options.dialect ?? DEFAULT_DIALECT;
  const dialect = DIALECTS[dialectName];
  const findings: Finding[] = [];
  const add = (code: string, field: string, value: string, message: string) => findings.push({ code, message: `${where}: ${message}`, field, value });
  if (!KNOWN_TYPES.has(row.apaleoType)) {
    add('W-UNKNOWN-TYPE', 'apaleo_type', row.apaleoType, `apaleo_type "${row.apaleoType}" is not an apaleo account type (${ACCOUNT_TYPES.join(', ')})`);
  }
  for (const [field, text] of [['apaleo_vat_percent', row.apaleoVatPercent], ['bmd_vat_percent', row.bmdVatPercent]] as const) {
    if (Number.isNaN(parsePercent(text) ?? 0)) add('E-VAT-PERCENT', field, text, `${field} "${text}" is not a percentage`);
  }
  if (row.kost !== '' && !KOST.test(row.kost)) {
    add('E-KOST-FORMAT', 'kost', row.kost, `kost "${row.kost}" must be a Kostenstelle of 1 to 9 digits`);
  } else if (row.kost !== '' && !KOST_TYPES.has(row.apaleoType)) {
    add(
      'W-KOST-IGNORED',
      'kost',
      row.kost,
      `kost ${row.kost} is never written for apaleo type ${row.apaleoType}: BMD reads kost as Kostenstelle only on revenue and ` +
        'bad-debt bookings, and on a payment as the Belegnummer of the invoice it clears. Leave kost empty on this row',
    );
  }
  const code = parseSteuercode(row.steuercode);
  const rate = parsePercent(row.bmdVatPercent);
  if (Number.isNaN(code ?? 0)) {
    add('E-STEUERCODE-FORMAT', 'steuercode', row.steuercode, `Steuercode "${row.steuercode}" must be a whole number from 0 to 99`);
  } else if (code !== undefined && NO_TAX_TYPES.has(row.apaleoType)) {
    add(
      'E-STEUERCODE-NOT-ALLOWED',
      'steuercode',
      row.steuercode,
      `apaleo type ${row.apaleoType} is a payment, guest claim or Debitor and books no tax, but the row has Steuercode ${code}: ` +
        'BMD would book the tax on this account instead of the revenue or deposit account. Leave steuercode and bmd_vat_percent empty ' +
        'on this row, and put the Steuercode on the revenue or deposit row',
    );
  } else if (code !== undefined) {
    if (rate === undefined) {
      add('E-VAT-RATE-MISSING', 'bmd_vat_percent', '', `Steuercode ${code} needs the VAT rate BMD books with it in bmd_vat_percent (0 for untaxed revenue)`);
    }
    const inputTax = dialect.inputTaxCodes.get(code);
    if (inputTax !== undefined && OUTPUT_TAX_TYPES.has(row.apaleoType)) {
      add(
        'E-STEUERCODE-INPUT-TAX',
        'steuercode',
        row.steuercode,
        `Steuercode ${code} means ${inputTax} in ${dialectName === 'ntcs' ? 'BMD NTCS' : 'BMD 5.5'}, but apaleo type ${row.apaleoType} is a sale, ` +
          `deposit, levy or bad debt and owes Umsatzsteuer. Use the Umsatzsteuer code ${dialect.normalOutputTaxCode} and have your Steuerberatung confirm it`,
      );
    } else if (!dialect.outputTaxCodes.includes(code)) {
      add(
        'W-STEUERCODE-UNCHECKED',
        'steuercode',
        row.steuercode,
        `the tool does not know Steuercode ${code} (it checks only the Umsatzsteuer code${dialect.outputTaxCodes.length > 1 ? 's' : ''} ` +
          `${dialect.outputTaxCodes.join(' and ')} of bmd.dialect ${dialectName}); have your Steuerberatung confirm what BMD books with it`,
      );
    }
  } else if (rate !== undefined && !Number.isNaN(rate) && rate > 0) {
    add('E-STEUERCODE-MISSING', 'steuercode', '', `bmd_vat_percent is ${rate} %, but the Steuercode is empty: BMD books no tax without one. Fill in the Steuercode`);
  }
  if (rate !== undefined && !Number.isNaN(rate) && !AUSTRIAN_VAT_RATES.includes(rate)) {
    add(
      'W-VAT-RATE-UNUSUAL',
      'bmd_vat_percent',
      row.bmdVatPercent,
      `bmd_vat_percent ${rate} % is not an Austrian VAT rate (${AUSTRIAN_VAT_RATES.map((r) => `${r} %`).join(', ')}). ` +
        'Was this row copied from a German mapping?',
    );
  }
  if (row.bmdAccount === '') return findings;

  const length = accountLengthFinding(row, options);
  if (length) findings.push(length);
  if (row.apaleoType === 'Revenues' && code === undefined) {
    add(
      'W-UNTAXED-REVENUE',
      'steuercode',
      '',
      `revenue on BMD account ${row.bmdAccount} is booked without a Steuercode. The BMD account must not carry a fixed Steuercode, ` +
        "or BMD fills it in on import; check the account in BMD, or enter the Kanzlei's Steuercode for non-taxable revenue",
    );
  }
  const bmdRate = rowRate(row);
  const apaleoRate = parsePercent(row.apaleoVatPercent);
  if (bmdRate !== undefined && apaleoRate !== undefined && !Number.isNaN(apaleoRate) && bmdRate !== apaleoRate) {
    add(
      'E-VAT-MISMATCH',
      'bmd_vat_percent',
      String(bmdRate),
      `apaleo account ${row.apaleoAccount} (${row.apaleoType}) has VAT ${apaleoRate} %, but the row books ${bmdRate} % on BMD account ` +
        `${row.bmdAccount}. Map it to an account for ${apaleoRate} % with the matching Steuercode and bmd_vat_percent`,
    );
  }
  return findings;
}

export interface CoverageOptions {
  /**
   * The rate each line's rows are resolved with. The posting rules' `releaseRateOf`
   * gives the inferred rate of an untaxed deposit release (undefined when none can
   * be inferred) and the line's own rate (`lineRate`) otherwise.
   */
  rateOf: (line: LedgerLine) => number | undefined;
  /** Scales the template's example accounts in the fix hints. */
  sachkontenlaenge: number;
  /** Scales the template's Personenkonto in the fix hints. Default 6. */
  personenkontenlaenge?: number | undefined;
  /** The Steuercode in the fix hints. Default `ntcs`. */
  dialect?: BmdDialect | undefined;
}

/** A line without a tax entry left after normalising. */
function isUntaxed(line: LedgerLine): boolean {
  return !line.taxes.some((tax) => tax.percent !== 0 || tax.amountCents !== 0);
}

interface Booked {
  account: AccountRef;
  lines: number;
  grossCents: number;
}

interface Unmapped extends Booked {
  rate: number | undefined;
  row: MappingRow | undefined;
  /**
   * Set for accounts outside the chart with a parent (per-reservation and folio
   * accounts): they are reported once per parent, type and rate.
   */
  group?: { parent: string; accounts: Set<string> };
}

interface Mismatch extends Booked {
  rate: number;
  row: MappingRow;
  bmdRate: number;
}

/** Untaxed deposit releases whose VAT rate cannot be inferred. */
interface UnknownRates {
  accounts: Set<string>;
  lines: number;
  grossCents: number;
}

function add<T extends Booked>(map: Map<string, T>, key: string, line: LedgerLine, create: () => T): void {
  const entry = map.get(key) ?? create();
  entry.lines += 1;
  entry.grossCents += line.grossCents;
  map.set(key, entry);
}

const byAccount = (a: Booked, b: Booked) => a.account.type.localeCompare(b.account.type) || a.account.number.localeCompare(b.account.number);

const MAX_EXAMPLES = 3;

/**
 * Checks every account booked in `lines` against the mapping:
 * - `E-UNMAPPED` for an account that does not resolve to a row with a BMD
 *   account, with its type, name, line count and gross total;
 * - `E-VAT-MISMATCH` for a VAT-relevant account whose row books another rate
 *   than the line carries, for example a revenue account at 10 % that resolves
 *   through a parent row to a 20 % account;
 * - `E-VAT-RATE-UNKNOWN` once for all untaxed deposit releases whose rate
 *   `rateOf` cannot infer (the export stops on them).
 * Lines with a Vat or VatOnLiabilities side are skipped by the posting rules,
 * so they need no mapping.
 */
export function checkCoverage(
  mapping: Mapping,
  lines: readonly LedgerLine[],
  chart: ChartIndex | undefined,
  options: CoverageOptions,
): Finding[] {
  const { rateOf } = options;
  const resolveAt = (account: AccountRef, rate: number | undefined) => resolve(mapping, account, { rate, ...(chart ? { chart } : {}) });
  const unmapped = new Map<string, Unmapped>();
  const mismatches = new Map<string, Mismatch>();
  const unknownRate: UnknownRates = { accounts: new Set(), lines: 0, grossCents: 0 };
  for (const line of lines) {
    if (VAT_ACCOUNT_TYPES.has(line.debit.type) || VAT_ACCOUNT_TYPES.has(line.credit.type)) continue;
    const rate = rateOf(line);
    for (const account of [line.debit, line.credit]) {
      if (rate === undefined && account.type === 'Liabilities' && isUntaxed(line)) {
        unknownRate.accounts.add(account.number);
        unknownRate.lines += 1;
        unknownRate.grossCents += line.grossCents;
        continue;
      }
      const row = resolveAt(account, rate);
      if (row && row.bmdAccount !== '') {
        // A row whose own apaleo_vat_percent equals the line's rate is checked by checkMapping.
        if (rate === undefined || !OUTPUT_TAX_TYPES.has(account.type) || parsePercent(row.apaleoVatPercent) === rate) continue;
        const bmdRate = rowRate(row);
        if (bmdRate === undefined || bmdRate === rate) continue;
        add(mismatches, `${row.line}\u0000${account.number}\u0000${account.type}\u0000${rate}`, line, () => ({
          account, rate, row, bmdRate, lines: 0, grossCents: 0,
        }));
        continue;
      }
      const rated = VAT_RELEVANT_TYPES.has(account.type) && (!row || row.apaleoAccount !== account.number);
      const parent = !chart?.has(account.number) ? account.parentNumber : undefined;
      const key = `${parent === undefined ? account.number : `parent ${parent}`}\u0000${account.type}${rated ? `\u0000${rate}` : ''}`;
      add(unmapped, key, line, () => ({
        account: parent === undefined ? account : { number: parent, name: chart?.find(parent, account.type)?.name ?? parent, type: account.type },
        rate,
        row,
        lines: 0,
        grossCents: 0,
        ...(parent === undefined ? {} : { group: { parent, accounts: new Set<string>() } }),
      }));
      unmapped.get(key)?.group?.accounts.add(account.number);
    }
  }
  const hint: Hint = {
    lengths: { sachkontenlaenge: options.sachkontenlaenge, personenkontenlaenge: options.personenkontenlaenge ?? DEFAULT_PERSONENKONTENLAENGE },
    outputTaxCode: DIALECTS[options.dialect ?? DEFAULT_DIALECT].normalOutputTaxCode,
    wildcardRow: (type, rate) =>
      mapping.rows.find((row) => row.apaleoAccount === WILDCARD && row.apaleoType === type && parsePercent(row.apaleoVatPercent) === rate),
  };
  return [
    ...[...unmapped.values()].sort(byAccount).map((entry) => unmappedFinding(entry, hint)),
    ...(unknownRate.lines > 0 ? [unknownRateFinding(unknownRate)] : []),
    ...[...mismatches.values()].sort(byAccount).map(mismatchFinding),
  ];
}

function bookedText({ lines, grossCents }: Pick<Booked, 'lines' | 'grossCents'>): string {
  return `${lines} line${lines === 1 ? '' : 's'}, gross ${formatCents(grossCents)}`;
}

interface Hint {
  lengths: AccountLengths;
  /** The Steuercode a wildcard row for a taxed rate needs. */
  outputTaxCode: number;
  /** The mapping's wildcard row for a VAT-relevant type at a rate, if it has one. */
  wildcardRow: (type: string, rate: number) => MappingRow | undefined;
}

/**
 * The fix when an empty parent row wins over an empty wildcard row that already
 * exists (resolve prefers the parent): name that row instead of asking to add it.
 */
function emptyWildcardFix(wildcard: MappingRow, type: string, rate: number): string {
  return `fill in bmd_account on the wildcard row for ${type} at ${rate} % on line ${wildcard.line}`;
}

/** The wildcard row to add for a type, as it is written in the file, with the template's account as example. */
function wildcardHint(type: string, rate: number | undefined, { lengths, outputTaxCode }: Hint): string {
  const rated = VAT_RELEVANT_TYPES.has(type);
  const template = templateWildcardAccount(shippedTemplate(), type, rated ? rate : undefined, lengths);
  if (!rated) {
    const debtor = type === PERSONAL_ACCOUNT_TYPE ? ' (Sammeldebitor)' : '';
    return `the wildcard row \`*;${type};;;${template ?? '<BMD account>'}\`${debtor}`;
  }
  const tax = rate === 0 ? `;;${rate}` : `;${outputTaxCode};${rate}`;
  return `a wildcard row \`*;${type};;${rate};<BMD account>${tax}\`${template === undefined ? '' : ` (template: ${template})`}`;
}

/**
 * `E-UNMAPPED` with the row to change: an exact empty row by its line; an empty
 * parent row with the wildcard row to add instead (for VAT-relevant types never
 * "fill in the parent row": one BMD account cannot serve every rate); no row
 * at all with the row or wildcard row to add.
 */
function unmappedFinding(entry: Unmapped, hint: Hint): Finding {
  const { account, rate, row, group } = entry;
  const vatRelevant = VAT_RELEVANT_TYPES.has(account.type);
  const at = vatRelevant && rate !== undefined ? ` at ${rate} %` : '';
  let what = `apaleo account ${account.number} (${account.type}, "${account.name}") is`;
  if (group) {
    const accounts = [...group.accounts].sort();
    const more = accounts.length > MAX_EXAMPLES ? ` and ${accounts.length - MAX_EXAMPLES} more` : '';
    const count = accounts.length === 1 ? `1 ${account.type} account` : `${accounts.length} ${account.type} accounts`;
    what = `${count} of reservations or folios under parent ${group.parent}${at} (${accounts.slice(0, MAX_EXAMPLES).join(', ')}${more}) ${accounts.length === 1 ? 'is' : 'are'}`;
  }
  const emptyParent = row && row.apaleoAccount !== WILDCARD && row.apaleoAccount !== (group ? undefined : account.number);
  const wildcard = wildcardHint(account.type, rate, hint);
  let fix: string;
  if (row && !emptyParent) {
    fix = `fill in bmd_account on line ${row.line} of the mapping file`;
  } else if (vatRelevant && rate === undefined) {
    fix = `the lines carry more than one VAT rate, so no wildcard applies; add a row for ${account.number} ${account.type}`;
  } else if (account.type === 'Revenues' && row) {
    fix = `the parent row for ${row.apaleoAccount} on line ${row.line} has no BMD account; add a row for ${account.number} Revenues with a BMD account for${at}`;
  } else if (account.type === 'Revenues') {
    fix = `add a row with apaleo_account ${account.number}, apaleo_type Revenues and a BMD account`;
  } else if (row && vatRelevant) {
    const existing = rate === undefined ? undefined : hint.wildcardRow(account.type, rate);
    const add = existing && rate !== undefined ? emptyWildcardFix(existing, account.type, rate) : `add ${wildcard}`;
    fix = `the parent row for ${row.apaleoAccount} on line ${row.line} has no BMD account and does not apply to ${account.type} at different VAT rates; ${add}`;
  } else if (row) {
    fix = `fill in bmd_account for the parent row ${row.apaleoAccount} on line ${row.line}, or add ${wildcard}`;
  } else if (group && vatRelevant) {
    fix = `add ${wildcard}`;
  } else if (group) {
    fix = `add a row for ${group.parent} ${account.type} or ${wildcard}`;
  } else if (vatRelevant) {
    fix = `add a row for ${account.number} ${account.type}, or a wildcard row (*) for ${account.type}${at}: ${wildcard.replace(/^a wildcard row /, '')}`;
  } else {
    fix = `add a row with apaleo_account ${account.number}, apaleo_type ${account.type} and a BMD account`;
  }
  return {
    code: 'E-UNMAPPED',
    message: `${what} not mapped (${bookedText(entry)}): ${fix}`,
    field: 'apaleo_account',
    value: account.number,
  };
}

function mismatchFinding(entry: Mismatch): Finding {
  const { account, rate, row, bmdRate } = entry;
  const via = row.apaleoAccount === account.number ? `its row on line ${row.line}` : `line ${row.line} (apaleo account ${row.apaleoAccount})`;
  return {
    code: 'E-VAT-MISMATCH',
    message:
      `apaleo account ${account.number} (${account.type}, "${account.name}") is booked at ${rate} % (${bookedText(entry)}), ` +
      `but it uses ${via} of the mapping, which books ${bmdRate} % on BMD account ${row.bmdAccount}. ` +
      `Add a row for ${account.number} ${account.type} with a BMD account for ${rate} %`,
    field: 'apaleo_account',
    value: account.number,
  };
}

/** One finding for all untaxed deposit releases whose VAT rate cannot be inferred. */
function unknownRateFinding(releases: UnknownRates): Finding {
  const accounts = [...releases.accounts].sort();
  const names = accounts.slice(0, 3);
  const more = accounts.length > names.length ? ` and ${accounts.length - names.length} more` : '';
  return {
    code: 'E-VAT-RATE-UNKNOWN',
    message:
      `${releases.lines} deposit release${releases.lines === 1 ? '' : 's'} (${bookedText(releases)}, ` +
      `${accounts.length === 1 ? 'account' : 'accounts'} ${names.join(', ')}${more}): apaleo settled a guest's prepaid deposit ` +
      'against the bill without a VAT amount, and the VAT rate cannot be found: there is no PostPrepaymentVat line of the same day ' +
      'and reservation with a rate, and the chart of accounts gives the deposit account none. The export stops rather than book them ' +
      `without VAT. ${REPORT_PROBLEM_HINT}`,
    field: 'apaleo_account',
    value: names[0] ?? '',
  };
}
