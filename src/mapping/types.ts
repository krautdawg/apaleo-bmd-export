import type { Finding } from '../core/findings.js';

/** The columns of a mapping CSV, in the order the tool writes them. */
export const MAPPING_COLUMNS = [
  'apaleo_account',
  'apaleo_type',
  'apaleo_name',
  'apaleo_vat_percent',
  'bmd_account',
  'steuercode',
  'bmd_vat_percent',
  'kost',
  'comment',
] as const;

export type MappingColumn = (typeof MAPPING_COLUMNS)[number];

/** Header columns of the DATEV mapping of apaleo-datev-export, and of the Grman "Datev Connector" export: such files are refused. */
export const DATEV_COLUMNS: readonly string[] = ['datev_account', 'bu_key', 'datev_vat_percent'];
export const GRMAN_COLUMNS: readonly string[] = ['apaleoaccountnumber', 'datevaccountnumber'];

/** `apaleo_account` of a row that matches every account of its type. */
export const WILDCARD = '*';

/** `apaleo_type` of a row that matches its account number regardless of type. */
export const ANY_TYPE = '*any*';

/**
 * Types whose lines carry VAT. A wildcard row for one of them must name the VAT
 * rate it stands for, so an account with an unknown rate never slips through.
 */
export const VAT_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  'Liabilities',
  'CityTaxes',
  'SecondCityTax',
  'GuestLevies',
  'LossOfAccountsReceivable',
  'Vat',
  'VatOnLiabilities',
  'Revenues',
]);

/** apaleo's own VAT accounts. Their lines are always skipped (BMD books the tax from `steuer`), so they need no row. */
export const VAT_ACCOUNT_TYPES: ReadonlySet<string> = new Set(['Vat', 'VatOnLiabilities']);

/** The type whose rows may name a Personenkonto (Debitor) instead of a Sachkonto. */
export const PERSONAL_ACCOUNT_TYPE = 'AccountsReceivable';

/** Types whose bookings are sales, deposits, levies or bad debt: they owe output tax, never input tax. */
export const OUTPUT_TAX_TYPES: ReadonlySet<string> = new Set(['Revenues', 'Liabilities', 'CityTaxes', 'SecondCityTax', 'GuestLevies', 'LossOfAccountsReceivable']);

/**
 * Types that are money or a claim on a guest or Debitor (Zahlungsmittel, Verrechnung, Personenkonto): a Steuercode on their
 * row would put the tax on the wrong side of a sale, so their rows must never carry one.
 */
export const NO_TAX_TYPES: ReadonlySet<string> = new Set(['Payments', 'Receivables', 'AccountsReceivable']);

/** Types whose `kost` BMD reads as Kostenstelle (profit and loss); on any other booking `kost` would be a Belegnummer. */
export const KOST_TYPES: ReadonlySet<string> = new Set(['Revenues', 'LossOfAccountsReceivable']);

/** One row of a mapping file. Every value is kept as the text in the file. */
export interface MappingRow {
  /** Line of the file the row ends on, 1-based. */
  readonly line: number;
  readonly apaleoAccount: string;
  readonly apaleoType: string;
  readonly apaleoName: string;
  readonly apaleoVatPercent: string;
  /** Sachkonto or Personenkonto in BMD; empty means unmapped. */
  readonly bmdAccount: string;
  /** BMD Steuercode; empty means no tax on this row. */
  readonly steuercode: string;
  /** The VAT rate BMD books with the Steuercode (0 allowed); empty without one. */
  readonly bmdVatPercent: string;
  /** Kostenstelle, written only on revenue and bad-debt bookings. */
  readonly kost: string;
  readonly comment: string;
}

export type MappingRowValues = Omit<MappingRow, 'line'>;

export const ROW_FIELDS: Readonly<Record<MappingColumn, keyof MappingRowValues>> = {
  apaleo_account: 'apaleoAccount',
  apaleo_type: 'apaleoType',
  apaleo_name: 'apaleoName',
  apaleo_vat_percent: 'apaleoVatPercent',
  bmd_account: 'bmdAccount',
  steuercode: 'steuercode',
  bmd_vat_percent: 'bmdVatPercent',
  kost: 'kost',
  comment: 'comment',
};

export interface Mapping {
  readonly path: string;
  readonly rows: readonly MappingRow[];
  /** Notes and warnings from reading the file, for example restored leading zeros (`W-PADDED`). */
  readonly findings: readonly Finding[];
}

/**
 * A VAT percent as written in the file: `10`, `4,9`, `4.90` or `10 %`. Undefined
 * for an empty cell, NaN for anything else.
 */
export function parsePercent(text: string): number | undefined {
  const value = text.trim().replace(/\s*%$/, '').replace(',', '.');
  if (value === '') return undefined;
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
}

/** The key two rows must not share: account and type, plus the rate for wildcard rows of VAT-relevant types. */
export function rowKey(row: Pick<MappingRow, 'apaleoAccount' | 'apaleoType' | 'apaleoVatPercent'>): string {
  const base = `${row.apaleoAccount}\u0000${row.apaleoType}`;
  const rated = row.apaleoAccount === WILDCARD && VAT_RELEVANT_TYPES.has(row.apaleoType);
  return rated ? `${base}\u0000${parsePercent(row.apaleoVatPercent) ?? ''}` : base;
}

/** "line 7", for messages. */
export function lineLabel(row: Pick<MappingRow, 'line'>): string {
  return `line ${row.line}`;
}

/** The Steuercode of a row: undefined when empty, NaN when it is not a whole number from 0 to 99. */
export function parseSteuercode(text: string): number | undefined {
  const value = text.trim();
  if (value === '') return undefined;
  return /^\d{1,2}$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * The VAT rate BMD books on a row: `bmd_vat_percent` with a Steuercode, 0 without
 * one. Undefined when it cannot be known (a Steuercode without rate, or a rate that
 * is not a number).
 */
export function rowRate(row: Pick<MappingRow, 'steuercode' | 'bmdVatPercent'>): number | undefined {
  if (row.steuercode.trim() === '') return 0;
  const rate = parsePercent(row.bmdVatPercent);
  return rate === undefined || Number.isNaN(rate) ? undefined : rate;
}
