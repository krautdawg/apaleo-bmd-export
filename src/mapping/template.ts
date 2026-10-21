import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DIALECTS } from '../bmd/format.js';
import type { BmdDialect } from '../bmd/types.js';
import { ChartIndex } from '../core/chart.js';
import type { Finding } from '../core/findings.js';
import { ACCOUNT_TYPES, type SourceAccount } from '../core/source.js';
import type { AccountLengths } from './account-length.js';
import { commentLines, detectSeparator, parseCsv } from './csv.js';
import { WILDCARD, parsePercent, rowKey, type MappingRowValues } from './types.js';

/**
 * The EKR hotel template: a rule file in `templates/` that `init-mapping`
 * applies to the apaleo chart of accounts (design decision 9).
 */

const RULE_COLUMNS = ['apaleo_type', 'name_pattern', 'apaleo_vat_percent', 'bmd_account', 'steuercode', 'bmd_vat_percent', 'comment'];
const TEMPLATE_ID = /\bekr-hotel@\d+\b/;
const TEMPLATE_URL = new URL('../../templates/ekr-hotel.rules.csv', import.meta.url);
/** `name_pattern` of a rule that matches any name and also yields a wildcard row. */
const WILDCARD_PATTERN = '*';
/** `steuercode` of a rule that stands for the output-tax code of the dialect (1 in NTCS, 3 in BMD 5.5). */
export const OUTPUT_TAX_MARKER = 'USt';
/** Every template row carries this mark until the Kanzlei has checked it. */
export const SUGGESTION_MARK = 'Vorschlag (ungeprüft)';
const NO_RULE_COMMENT = `${SUGGESTION_MARK}: keine Vorlage-Regel passt, bitte mit der Steuerberatung zuordnen.`;
const ARCHIVED = 'archiviert';
/** Length of the template's Sachkonto base numbers. */
const BASE_LENGTH = 4;
/** Length of the template's Personenkonto base number (the Sammeldebitor 200000), scaled to the Personenkontenlänge. */
const PERSONAL_BASE_LENGTH = 6;
/** The template's Sammeldebitor, named in its comments and in the scaling note. */
const TEMPLATE_PERSONENKONTO = '200000';

export interface TemplateRule {
  line: number;
  apaleoType: string;
  /** Undefined matches any name. */
  namePattern: RegExp | undefined;
  /** Also write a wildcard row (`*`) for the type and rate. */
  wildcard: boolean;
  /** Undefined matches any rate. */
  apaleoVatPercent: number | undefined;
  /** 4-digit base number (6 digits for the Personenkonto), scaled by `scaleAccount`; empty leaves the account unmapped. */
  bmdAccount: string;
  /** A Steuercode, `USt` for the dialect's output-tax code, or empty. */
  steuercode: string;
  bmdVatPercent: string;
  comment: string;
}

export interface Template {
  /** For example `ekr-hotel@1`. */
  id: string;
  rules: TemplateRule[];
}

/** What the rows depend on: the Kanzlei's account lengths and the BMD dialect. */
export interface TemplateSettings extends AccountLengths {
  dialect: BmdDialect;
}

/** Reads the template shipped in `templates/`. */
export async function loadTemplate(): Promise<Template> {
  return parseTemplate(await readFile(TEMPLATE_URL, 'utf8'));
}

let shipped: Template | undefined;

/** The template shipped in `templates/`, read once and synchronously (for fix hints in findings). */
export function shippedTemplate(): Template {
  shipped ??= parseTemplate(readFileSync(TEMPLATE_URL, 'utf8'));
  return shipped;
}

/** The account the template's wildcard rule gives a type at a rate (any rate for types without one), scaled; undefined when none. */
export function templateWildcardAccount(
  template: Template,
  type: string,
  rate: number | undefined,
  { sachkontenlaenge, personenkontenlaenge }: AccountLengths,
): string | undefined {
  const rule = template.rules.find(
    (r) => r.wildcard && r.apaleoType === type && r.bmdAccount !== '' && (r.apaleoVatPercent === undefined || r.apaleoVatPercent === rate),
  );
  const account = rule ? scaleAccount(rule.bmdAccount, sachkontenlaenge, personenkontenlaenge) : '';
  return account === '' ? undefined : account;
}

export function parseTemplate(text: string): Template {
  const id = TEMPLATE_ID.exec(commentLines(text).join('\n'))?.[0];
  if (!id) throw new Error('The EKR template does not name its version (ekr-hotel@N)');
  const [header, ...records] = parseCsv(text, detectSeparator(text), 'the EKR template');
  if (header?.fields.join(';') !== RULE_COLUMNS.join(';')) {
    throw new Error(`The EKR template header must be ${RULE_COLUMNS.join(';')}`);
  }
  const rules = records.map(({ line, fields }): TemplateRule => {
    const [type = '', pattern = '', vat = '', bmdAccount = '', steuercode = '', bmdVatPercent = '', comment = ''] = fields;
    return {
      line,
      apaleoType: type,
      namePattern: pattern === '' || pattern === WILDCARD_PATTERN ? undefined : new RegExp(pattern, 'iu'),
      wildcard: pattern === WILDCARD_PATTERN,
      apaleoVatPercent: parsePercent(vat),
      bmdAccount,
      steuercode,
      bmdVatPercent,
      comment,
    };
  });
  return { id, rules };
}

/**
 * The first rule for the account's type and rate whose pattern matches one of
 * `names`: the account's number and name and those of its parents, so that a
 * rule can name apaleo's groups (`RevenueNoShow`) as well as their names.
 */
export function matchRule(template: Template, account: SourceAccount, names: readonly string[]): TemplateRule | undefined {
  return template.rules.find(
    (rule) =>
      rule.apaleoType === account.type &&
      (rule.apaleoVatPercent === undefined || rule.apaleoVatPercent === account.vat?.percent) &&
      (rule.namePattern === undefined || names.some((name) => rule.namePattern?.test(name))),
  );
}

/**
 * Scales a 4-digit template number to the Sachkontenlänge by appending zeros
 * (2890 → 28900 at Sachkontenlänge 5), and the 6-digit Personenkonto to the
 * Personenkontenlänge by appending or dropping trailing zeros (200000 → 20000
 * at 5, 2000000 at 7). The Personenkonto is left empty when it cannot be told
 * apart from a Sachkonto (both lengths equal) or has no zeros to drop.
 */
export function scaleAccount(account: string, sachkontenlaenge: number, personenkontenlaenge = PERSONAL_BASE_LENGTH): string {
  if (account.length === BASE_LENGTH) return account + '0'.repeat(Math.max(sachkontenlaenge - BASE_LENGTH, 0));
  if (account.length !== PERSONAL_BASE_LENGTH) return account;
  if (personenkontenlaenge === sachkontenlaenge) return '';
  if (personenkontenlaenge >= PERSONAL_BASE_LENGTH) return account + '0'.repeat(personenkontenlaenge - PERSONAL_BASE_LENGTH);
  return account.endsWith('0'.repeat(PERSONAL_BASE_LENGTH - personenkontenlaenge)) ? account.slice(0, personenkontenlaenge) : '';
}

/**
 * The rule's comment for the Kanzlei's lengths: the template's Personenkonto
 * 200000 is named by its scaled number, or the comment says why it was left empty.
 */
function ruleComment(rule: TemplateRule, { sachkontenlaenge, personenkontenlaenge }: TemplateSettings): string {
  if (rule.bmdAccount.length !== PERSONAL_BASE_LENGTH) return rule.comment;
  const scaled = scaleAccount(rule.bmdAccount, sachkontenlaenge, personenkontenlaenge);
  if (scaled !== '') return rule.comment.replaceAll(rule.bmdAccount, scaled);
  return (
    `${SUGGESTION_MARK}: bmd_account leer gelassen, weil die Personenkontenlänge ${personenkontenlaenge} gleich der Sachkontenlänge ist ` +
    `oder die Vorlage-Nummer ${rule.bmdAccount} nicht darauf passt. Lege den Sammeldebitor mit deiner Kanzlei als Personenkonto an und trag ihn hier ein. ` +
    rule.comment.replace(/^Vorschlag \(ungeprüft\):\s*/u, '')
  );
}

export interface Suggestion {
  rows: MappingRowValues[];
  /** `N-TEMPLATE-SCALED` when the template numbers were scaled. */
  findings: Finding[];
}

/**
 * One row per leaf account of the chart (an account without children of the
 * same type), pre-filled from the first matching rule, plus the wildcard rows of
 * the template. Accounts no rule matches stay unmapped. Rows are grouped by type.
 *
 * A container account outside the global ledger (`hasChildren`, such as `3000`
 * Liabilities) gets no row when its type has wildcard rules and no rule gives it
 * a BMD account: the wildcard rows cover its per-reservation children, and one
 * BMD account cannot serve every rate (upstream template version 2).
 */
export function suggestRows(accounts: readonly SourceAccount[], template: Template, settings: TemplateSettings): Suggestion {
  const chart = new ChartIndex(accounts);
  const parents = new Set(accounts.flatMap((a) => (a.parentNumber === undefined ? [] : [`${a.parentNumber}\u0000${a.type}`])));
  const wildcardTypes = new Set(template.rules.filter((rule) => rule.wildcard).map((rule) => rule.apaleoType));
  const rows = new Map<string, MappingRowValues>();
  const add = (row: MappingRowValues) => {
    const key = rowKey(row);
    if (!rows.has(key)) rows.set(key, row);
  };

  for (const account of chart.accounts) {
    if (parents.has(`${account.number}\u0000${account.type}`)) continue;
    const rule = matchRule(template, account, [account.number, account.name, ...parentNames(chart, account)]);
    const container = account.ledger !== 'global' && account.hasChildren && wildcardTypes.has(account.type);
    if (container && !rule?.bmdAccount) continue;
    const comment = rule ? ruleComment(rule, settings) : NO_RULE_COMMENT;
    add({
      apaleoAccount: account.number,
      apaleoType: account.type,
      apaleoName: account.name,
      apaleoVatPercent: account.vat === undefined ? '' : String(account.vat.percent),
      ...ruleValues(rule, settings),
      comment: account.isArchived ? `${ARCHIVED}. ${comment}` : comment,
    });
  }
  for (const rule of template.rules.filter((r) => r.wildcard)) {
    add({
      apaleoAccount: WILDCARD,
      apaleoType: rule.apaleoType,
      apaleoName: '',
      apaleoVatPercent: rule.apaleoVatPercent === undefined ? '' : String(rule.apaleoVatPercent),
      ...ruleValues(rule, settings),
      comment: ruleComment(rule, settings),
    });
  }

  const scaled = scaledNote(settings);
  const findings: Finding[] = scaled === undefined ? [] : [{ code: 'N-TEMPLATE-SCALED', message: scaled }];
  return { rows: [...rows.values()].sort(byType), findings };
}

/** The `N-TEMPLATE-SCALED` note when the Kanzlei's lengths differ from the template's 4 and 6 digits. */
function scaledNote({ sachkontenlaenge, personenkontenlaenge }: TemplateSettings): string | undefined {
  if (sachkontenlaenge === BASE_LENGTH && personenkontenlaenge === PERSONAL_BASE_LENGTH) return undefined;
  const personal = scaleAccount(TEMPLATE_PERSONENKONTO, sachkontenlaenge, personenkontenlaenge);
  const personalText =
    personal === ''
      ? `the Sammeldebitor rows were left empty: Personenkontenlänge ${personenkontenlaenge} equals the Sachkontenlänge, so a Personenkonto ` +
        'cannot be told apart from a Sachkonto; enter the Personenkonto your Kanzlei uses'
      : personal === TEMPLATE_PERSONENKONTO
        ? `the Personenkonto ${TEMPLATE_PERSONENKONTO} stays as it is`
        : `the Personenkonto ${TEMPLATE_PERSONENKONTO} became ${personal} (Personenkontenlänge ${personenkontenlaenge})`;
  const sachText =
    sachkontenlaenge === BASE_LENGTH
      ? 'Sachkonto numbers keep their 4 digits'
      : `template account numbers were scaled to Sachkontenlänge ${sachkontenlaenge} by appending zeros ` +
        `(for example ${scaleAccount('4000', sachkontenlaenge)} and ${scaleAccount('2890', sachkontenlaenge)})`;
  return `${sachText}; ${personalText}`;
}

function ruleValues(rule: TemplateRule | undefined, { sachkontenlaenge, personenkontenlaenge, dialect }: TemplateSettings) {
  const bmdAccount = scaleAccount(rule?.bmdAccount ?? '', sachkontenlaenge, personenkontenlaenge);
  const mapped = rule !== undefined && bmdAccount !== '';
  const steuercode = rule?.steuercode === OUTPUT_TAX_MARKER ? String(DIALECTS[dialect].normalOutputTaxCode) : (rule?.steuercode ?? '');
  return {
    bmdAccount,
    steuercode: mapped ? steuercode : '',
    bmdVatPercent: mapped ? rule.bmdVatPercent : '',
    kost: '',
  };
}

/** Number and name of every parent of the account, nearest first. */
function parentNames(chart: ChartIndex, account: SourceAccount): string[] {
  const names: string[] = [];
  const seen = new Set<string>([account.number]);
  let parent = account.parentNumber;
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent);
    const found = chart.find(parent, account.type);
    if (!found) break;
    names.push(found.number, found.name);
    parent = found.parentNumber;
  }
  return names;
}

const TYPE_ORDER: readonly string[] = ACCOUNT_TYPES;

/** Known types in apaleo's order, unknown ones after them; within a type, chart order with wildcards last. */
function byType(a: MappingRowValues, b: MappingRowValues): number {
  const rank = (row: MappingRowValues) => {
    const index = TYPE_ORDER.indexOf(row.apaleoType);
    return index === -1 ? TYPE_ORDER.length : index;
  };
  return rank(a) - rank(b) || Number(a.apaleoAccount === WILDCARD) - Number(b.apaleoAccount === WILDCARD);
}
