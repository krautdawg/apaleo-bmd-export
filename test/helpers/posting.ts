import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, LedgerLine } from '../../src/core/source.js';
import { parseMapping, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { rowKey } from '../../src/mapping/types.js';
import { buildBookings, type PostingOptions, type PostingResult } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from './apaleo.js';
import { mappingOf, readMappingFixture } from './mapping.js';

/** The Hotel Beispiel data and its EKR mapping (`test/fixtures/mapping/ekr-beispiel.csv`). */
export const BEISPIEL = await loadBeispielData();
export const CHART = new ChartIndex(BEISPIEL.charts[BSP] ?? []);
export const LEDGER: readonly LedgerLine[] = BEISPIEL.ledger[BSP] ?? [];
export const EKR_MAPPING = parseMapping(readMappingFixture('ekr-beispiel.csv'), { path: 'ekr-beispiel.csv', sachkontenlaenge: 4 });
export const OPTIONS: PostingOptions = { extbelegnr: 'receipt', dialect: 'ntcs', sachkontenlaenge: 4, buchsymbol: 'HO', buchsymbolZahlung: 'HO' };

/** The fixture mapping with the given rows first, replacing fixture rows with the same key. The first given row is on line 2. */
export function mappingWith(...rows: MappingRowValues[]): Mapping {
  const replaced = new Set(rows.map(rowKey));
  return mappingOf([...rows, ...EKR_MAPPING.rows.filter((row) => !replaced.has(rowKey(row)))]);
}

export function post(lines: readonly LedgerLine[], mapping: Mapping = EKR_MAPPING, options: Partial<PostingOptions> = {}): PostingResult {
  return buildBookings(lines, mapping, CHART, { ...OPTIONS, ...options });
}

/** Accounts of Hotel Beispiel as they appear on ledger lines, in apaleo's real shapes. */
export const ACCOUNTS = {
  visa: { number: '1102', name: 'Visa Credit Card Payment', type: 'Payments', parentNumber: '1000' },
  maestro: { number: '1106', name: 'Maestro Card Payment', type: 'Payments', parentNumber: '1000' },
  cash: { number: '1600', name: 'Cash Payment', type: 'Payments', parentNumber: '1000' },
  receivables: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables for Reservation BSP-ABCDEF-1', type: 'Receivables', parentNumber: '1200' },
  offset: { number: 'BSP-ABCDEF-1_Receivables/Offset', name: 'Receivables for Reservation BSP-ABCDEF-1 (Offset)', type: 'Receivables', parentNumber: '1200' },
  folio: { number: 'BSP-EXT-1_Receivables', name: 'Müller, Hans', type: 'Receivables', parentNumber: '1200' },
  liabilities: { number: 'BSP-GHIJKL-1_Liabilities/VeryReduced:10.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (10%)', type: 'Liabilities', parentNumber: '3000' },
  liabilities0: { number: 'BSP-GHIJKL-1_Liabilities/Null:0.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (0%)', type: 'Liabilities', parentNumber: '3000' },
  accommodation10: { number: 'RevenueAccommodation_VeryReduced:10.00', name: 'Revenues Accommodation (10%)', type: 'Revenues', parentNumber: '5000' },
  accommodation20: { number: 'RevenueAccommodation_Normal:20.00', name: 'Revenues Accommodation (20%)', type: 'Revenues', parentNumber: '5000' },
  accommodation0: { number: 'RevenueAccommodation_Without:0.00', name: 'Revenues Accommodation (no VAT)', type: 'Revenues', parentNumber: '5000' },
  food10: { number: 'RevenueFoodAndBeverages_VeryReduced:10.00', name: 'Revenues Food and beverages (10%)', type: 'Revenues', parentNumber: '5000' },
  beverages20: { number: 'RevenueFoodAndBeverages_Normal:20.00', name: 'Revenues Food and beverages (20%)', type: 'Revenues', parentNumber: '5000' },
  cityTax: { number: '3501', name: 'City Tax (no VAT)', type: 'CityTaxes', parentNumber: '3500' },
  accountsReceivable: { number: 'BSP-ABCDEF-1_AccountsReceivable', name: 'AccountsReceivable for Reservation BSP-ABCDEF-1', type: 'AccountsReceivable', parentNumber: '9999' },
  vat10: { number: 'Vat_VeryReduced:10.00', name: 'VAT Very Reduced (10%)', type: 'Vat', parentNumber: '8000' },
  vatOnLiabilities10: { number: 'LiabilitiesVat_VeryReduced:10.00', name: 'LiabilitiesVat Very Reduced (10%)', type: 'VatOnLiabilities', parentNumber: '8001' },
} satisfies Record<string, AccountRef>;
