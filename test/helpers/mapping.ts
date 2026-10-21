import { readFileSync } from 'node:fs';
import { parseMapping, renderMappingFile, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';

/** A mapping row with every column empty except the given ones. */
export function mappingRow(values: Partial<MappingRowValues> & Pick<MappingRowValues, 'apaleoAccount' | 'apaleoType'>): MappingRowValues {
  return {
    apaleoName: '',
    apaleoVatPercent: '',
    bmdAccount: '',
    steuercode: '',
    bmdVatPercent: '',
    kost: '',
    comment: '',
    ...values,
  };
}

/** A mapping as `loadMapping` returns it for a file written from these rows. */
export function mappingOf(rows: readonly MappingRowValues[], sachkontenlaenge = 4, comments: string[] = []): Mapping {
  return parseMapping(renderMappingFile(comments, rows), { path: 'mapping.csv', sachkontenlaenge });
}

/** Mapping CSV text with `;` and CRLF, as UTF-8 bytes. */
export function csvBytes(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.map((line) => `${line}\r\n`).join(''));
}

export function readMappingFixture(name: string): Uint8Array {
  return readFileSync(new URL(`../fixtures/mapping/${name}`, import.meta.url));
}

/**
 * The rows written by `renderMappingFile` that `test/fixtures/mapping/excel-at-saved.csv`
 * holds after an Excel (AT) save: umlauts, an en dash, a separator and quotes inside
 * comments, a Kostenstelle, the rate 4.9, a rate wildcard and a class-0 account with a leading zero.
 */
export const EXCEL_ORIGINAL_ROWS: readonly MappingRowValues[] = [
  mappingRow({ apaleoAccount: 'RevenueAccommodation_VeryReduced:10.00', apaleoType: 'Revenues', apaleoName: 'Revenues Accommodation (10%)', apaleoVatPercent: '10', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10', comment: 'Vorschlag (ungeprüft): Erlöse Beherbergung 10 %' }),
  mappingRow({ apaleoAccount: 'RevenueFoodAndBeverages_VeryReduced:10.00', apaleoType: 'Revenues', apaleoName: 'Frühstück Speisen (10%)', apaleoVatPercent: '10', bmdAccount: '4010', steuercode: '1', bmdVatPercent: '10', comment: 'Speisen; eigenes Konto mit Kanzlei klären' }),
  mappingRow({ apaleoAccount: 'RevenueFoodAndBeverages_Normal:20.00', apaleoType: 'Revenues', apaleoName: 'Getränke (20%)', apaleoVatPercent: '20', bmdAccount: '4020', steuercode: '1', bmdVatPercent: '20', kost: '20' }),
  mappingRow({ apaleoAccount: 'RevenueOther_Special:4.90', apaleoType: 'Revenues', apaleoName: 'Revenues Other (4.9%)', apaleoVatPercent: '4.9', bmdAccount: '4050', steuercode: '1', bmdVatPercent: '4.9', comment: 'Grundnahrungsmittel 4,9 %' }),
  mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', apaleoName: 'Visa Credit Card Payment', bmdAccount: '2890', comment: 'Karte "Visa" über Schwebende Geldbewegungen' }),
  mappingRow({ apaleoAccount: '9000', apaleoType: 'House', apaleoName: 'House Account', bmdAccount: '0650', comment: 'Testwert – Klasse-0-Konto mit führender Null' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', bmdAccount: '3200', steuercode: '1', bmdVatPercent: '10', comment: 'Anzahlungen 10 %' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', bmdAccount: '200000', comment: 'Sammeldebitor' }),
  mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoName: 'City Tax (no VAT)', apaleoVatPercent: '0', comment: 'Gast schuldet: Gemeinde 3580 ohne Steuercode – mit Steuerberatung entscheiden.' }),
];
