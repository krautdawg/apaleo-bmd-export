import { UserError } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { paddedFinding, restoreLeadingZeros } from './account-length.js';
import { decodeCsv, detectSeparator, parseCsv, type CsvRecord } from './csv.js';
import {
  ANY_TYPE,
  DATEV_COLUMNS,
  GRMAN_COLUMNS,
  MAPPING_COLUMNS,
  ROW_FIELDS,
  VAT_RELEVANT_TYPES,
  WILDCARD,
  parsePercent,
  rowKey,
  type Mapping,
  type MappingColumn,
  type MappingRow,
  type MappingRowValues,
} from './types.js';

/** A mapping file that cannot be used at all. Lists every problem at once. */
export class MappingError extends UserError {
  override readonly name: string = 'MappingError';

  constructor(
    readonly path: string,
    readonly problems: readonly string[],
  ) {
    super(`Cannot use the mapping file ${path}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

export interface ParseMappingOptions {
  /** Shown in messages. */
  path: string;
  /** Leading zeros are restored only at Sachkontenlänge 4 (see `restoreLeadingZeros`). */
  sachkontenlaenge: number;
}

export interface LoadMappingOptions {
  sachkontenlaenge: number;
  readFile: (path: string) => Promise<Uint8Array>;
}

const REQUIRED_COLUMNS: readonly MappingColumn[] = ['apaleo_account', 'apaleo_type', 'bmd_account'];
/** How to make a mapping file, named in every error about a missing or foreign one. */
export const INIT_MAPPING_HINT = 'apaleo-bmd init-mapping --property <id> --template ekr';

export async function loadMapping(path: string, options: LoadMappingOptions): Promise<Mapping> {
  let bytes: Uint8Array;
  try {
    bytes = await options.readFile(path);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new UserError(
      missing
        ? `No mapping file at ${path}. Create one with "${INIT_MAPPING_HINT}".`
        : `Cannot read the mapping file ${path}: ${(error as Error).message}`,
    );
  }
  return parseMapping(bytes, { path, sachkontenlaenge: options.sachkontenlaenge });
}

/**
 * Reads a mapping CSV (UTF-8 or CP1252, `;` or `,`). Fails with `MappingError` on
 * a bad header (DATEV and Grman mappings included), duplicate keys and wildcard
 * rows the resolution rules do not allow; restored leading zeros are returned as
 * `W-PADDED` findings.
 */
export function parseMapping(bytes: Uint8Array, options: ParseMappingOptions): Mapping {
  const { text } = decodeCsv(bytes);
  const [header, ...records] = parseCsv(text, detectSeparator(text), `the mapping file ${options.path}`);
  if (!header) throw new MappingError(options.path, ['the file is empty; it needs a header line']);

  const { columns, findings } = readHeader(header, options.path);
  const rows: MappingRow[] = [];
  for (const record of records) {
    const row = toRow(record, columns);
    const restored = restoreLeadingZeros(row.bmdAccount, row.apaleoType, options.sachkontenlaenge);
    if (restored.padded) {
      const padded = { ...row, bmdAccount: restored.account };
      findings.push(paddedFinding(padded, row.bmdAccount));
      rows.push(padded);
    } else {
      rows.push(row);
    }
  }

  const problems = structuralProblems(rows);
  if (problems.length > 0) throw new MappingError(options.path, problems);
  return { path: options.path, rows, findings };
}

interface Header {
  /** Column name per field position; undefined for ignored columns. */
  columns: (MappingColumn | undefined)[];
  findings: Finding[];
}

function readHeader(header: CsvRecord, path: string): Header {
  const names = header.fields.map((field) => field.trim().toLowerCase());
  const findings: Finding[] = [];
  const foreign = foreignLayout(names);
  if (foreign) {
    throw new MappingError(path, [
      `this is ${foreign}, not a BMD mapping: apaleo-bmd reads the columns ${MAPPING_COLUMNS.join(';')}. ` +
        `Create a BMD mapping with "${INIT_MAPPING_HINT}" and copy the account numbers over (docs/mapping-guide.md)`,
    ]);
  }
  const known = new Set<string>(MAPPING_COLUMNS);
  const columns = names.map((name) => (known.has(name) ? (name as MappingColumn) : undefined));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    throw new MappingError(path, [
      `the header line lacks the column(s) ${missing.join(', ')}. Expected: ${MAPPING_COLUMNS.join(';')}. ` +
        `"${INIT_MAPPING_HINT}" writes such a file`,
    ]);
  }
  const duplicate = columns.find((column, i) => column !== undefined && columns.indexOf(column) !== i);
  if (duplicate) throw new MappingError(path, [`the header line names the column ${duplicate} twice`]);
  for (const name of names.filter((n) => n !== '' && !known.has(n))) {
    findings.push({ code: 'W-UNKNOWN-COLUMN', message: `the column "${name}" is not used and is ignored`, value: name });
  }
  return { columns, findings };
}

/** `a DATEV mapping` or `a Grman connector export` when the header has their columns, else undefined. */
function foreignLayout(names: readonly string[]): string | undefined {
  if (names.some((name) => DATEV_COLUMNS.includes(name))) return 'a DATEV mapping (apaleo-datev-export)';
  if (names.some((name) => GRMAN_COLUMNS.includes(name))) return 'a Grman DATEV connector export';
  return undefined;
}

function toRow(record: CsvRecord, columns: Header['columns']): MappingRow {
  const values: Record<keyof MappingRowValues, string> = {
    apaleoAccount: '',
    apaleoType: '',
    apaleoName: '',
    apaleoVatPercent: '',
    bmdAccount: '',
    steuercode: '',
    bmdVatPercent: '',
    kost: '',
    comment: '',
  };
  record.fields.forEach((field, i) => {
    const column = columns[i];
    if (column) values[ROW_FIELDS[column]] = column === 'comment' || column === 'apaleo_name' ? field : field.trim();
  });
  return { line: record.line, ...values };
}

/** Problems that make the file unusable: incomplete keys, duplicate keys and forbidden wildcards. */
export function structuralProblems(rows: readonly MappingRow[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, MappingRow>();
  for (const row of rows) {
    const where = `line ${row.line}`;
    if (row.apaleoAccount === '' || row.apaleoType === '') {
      problems.push(`${where}: apaleo_account and apaleo_type must both be filled in`);
      continue;
    }
    const wildcard = wildcardProblem(row);
    if (wildcard) problems.push(`${where}: ${wildcard}`);
    const key = rowKey(row);
    const first = seen.get(key);
    if (first) {
      const rated = row.apaleoAccount === WILDCARD && VAT_RELEVANT_TYPES.has(row.apaleoType);
      const rate = rated ? ` at ${row.apaleoVatPercent} %` : '';
      problems.push(
        `lines ${first.line} and ${row.line} both map apaleo account ${row.apaleoAccount} of type ${row.apaleoType}${rate}; keep one of them`,
      );
    } else {
      seen.set(key, row);
    }
  }
  return problems;
}

function wildcardProblem(row: MappingRow): string | undefined {
  if (row.apaleoAccount !== WILDCARD) return undefined;
  if (row.apaleoType === ANY_TYPE) return 'a wildcard row (*) needs a concrete apaleo_type';
  if (row.apaleoType === 'Revenues') {
    return (
      'revenue accounts must be mapped one by one because of VAT: a wildcard row (*) for Revenues is not allowed. ' +
      'Add a row per apaleo revenue account instead'
    );
  }
  if (!VAT_RELEVANT_TYPES.has(row.apaleoType)) return undefined;
  const rate = parsePercent(row.apaleoVatPercent);
  if (rate === undefined || Number.isNaN(rate)) {
    return (
      `VAT-relevant wildcards must name a VAT rate: the wildcard row (*) for ${row.apaleoType} needs ` +
      'apaleo_vat_percent (one row per rate, for example 10, 13, 20 and 0)'
    );
  }
  return undefined;
}
