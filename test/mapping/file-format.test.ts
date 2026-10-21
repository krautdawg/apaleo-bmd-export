import { describe, expect, it } from 'vitest';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv, detectSeparator, formatCsvLine, parseCsv } from '../../src/mapping/csv.js';
import { MappingError, appendRows, parsePercent, parseMapping, renderMappingFile, type MappingRow, type MappingRowValues } from '../../src/mapping/index.js';
import { EXCEL_ORIGINAL_ROWS, csvBytes, mappingRow, readMappingFixture } from '../helpers/mapping.js';

const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment';
const parse = (bytes: Uint8Array, sachkontenlaenge = 4) => parseMapping(bytes, { path: 'm.csv', sachkontenlaenge });
const values = (row: MappingRow): MappingRowValues => {
  const { line, ...rest } = row;
  expect(line).toBeGreaterThan(0);
  return rest;
};
/** The row with both rate columns as numbers, so `4,9` and `4.9` compare equal. */
const rated = (row: MappingRowValues) => ({ ...row, apaleoVatPercent: parsePercent(row.apaleoVatPercent), bmdVatPercent: parsePercent(row.bmdVatPercent) });

function loadError(bytes: Uint8Array): MappingError {
  try {
    parse(bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(MappingError);
    return error as MappingError;
  }
  throw new Error('expected a MappingError');
}

describe('encoding', () => {
  it('strips a UTF-8 BOM and decodes UTF-8', () => {
    const decoded = decodeCsv(Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Getränke')]));
    expect(decoded).toEqual({ text: 'Getränke', encoding: 'utf-8', bom: true });
  });

  it('decodes bytes that are not valid UTF-8 as CP1252', () => {
    const decoded = decodeCsv(encodeCp1252('Frühstück – 10 €').bytes);
    expect(decoded).toEqual({ text: 'Frühstück – 10 €', encoding: 'windows-1252', bom: false });
  });

  it('reads UTF-8 without BOM and CP1252 files to the same rows', () => {
    const text = `${HEADER}\r\nRevenueFoodAndBeverages_Normal:20.00;Revenues;Getränke;20;4020;1;20;;Vorschlag – prüfen\r\n`;
    const utf8 = parse(new TextEncoder().encode(text));
    const cp1252 = parse(encodeCp1252(text).bytes);
    expect(cp1252.rows).toEqual(utf8.rows);
    expect(utf8.rows[0]).toMatchObject({ apaleoName: 'Getränke', bmdAccount: '4020', steuercode: '1', bmdVatPercent: '20', comment: 'Vorschlag – prüfen' });
  });
});

describe('separator', () => {
  it('detects ; or , from the header line, skipping comment lines', () => {
    expect(detectSeparator(`# a, b, c, d\n${HEADER}\n`)).toBe(';');
    expect(detectSeparator('apaleo_account,apaleo_type,bmd_account\n1;2;3\n')).toBe(',');
  });

  it('reads a comma-separated file, with a decimal point in the rates', () => {
    const mapping = parse(csvBytes(['apaleo_account,apaleo_type,bmd_account,steuercode,bmd_vat_percent,comment', 'R:4.9,Revenues,4050,1,4.9,"Karte, Visa"']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: 'R:4.9', bmdAccount: '4050', bmdVatPercent: '4.9', comment: 'Karte, Visa' });
  });

  it('reads a decimal comma in the rate columns of a ; file', () => {
    const [row] = parse(csvBytes([HEADER, 'R;Revenues;;4,9;4050;1;4,9;;'])).rows;
    expect(row && [parsePercent(row.apaleoVatPercent), parsePercent(row.bmdVatPercent)]).toEqual([4.9, 4.9]);
  });

  it('accepts the columns in any order and ignores unknown ones with a warning', () => {
    const mapping = parse(csvBytes(['bmd_account;Notiz;apaleo_type;apaleo_account', '2890;x;Payments;1102']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: '1102', apaleoType: 'Payments', bmdAccount: '2890' });
    expect(mapping.findings.map((f) => f.code)).toEqual(['W-UNKNOWN-COLUMN']);
  });

  it('skips comment lines and rows Excel left with empty cells only', () => {
    const mapping = parse(csvBytes(['# Vorlage ekr-hotel@1', HEADER, '1102;Payments;Visa;;2890;;;;', ';;;;;;;;']));
    expect(mapping.rows).toHaveLength(1);
  });
});

describe('mappings of other tools', () => {
  it('rejects a DATEV mapping (datev_account) and names init-mapping --template ekr', () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment';
    const error = loadError(csvBytes([datev, '5011;Revenues;Accommodation 7%;7;8300;;7;;;']));
    expect(error.message).toContain('this is a DATEV mapping');
    expect(error.message).toContain('init-mapping --property <id> --template ekr');
  });

  it('rejects the Grman connector export', () => {
    const error = loadError(csvBytes(['ApaleoAccountNumber;DatevAccountNumber;CostCenter;CostCenter2', '5011;8300;LOGIS;']));
    expect(error.message).toContain('Grman DATEV connector export');
    expect(error.message).toContain('--template ekr');
  });
});

describe('account length on load', () => {
  it('restores the leading zeros of a 1-3 digit Sachkonto at Sachkontenlänge 4 with W-PADDED', () => {
    const mapping = parse(csvBytes([HEADER, '9000;House;House;;650;;;;', '9001;House;House 2;;65;;;;']));
    expect(mapping.rows.map((r) => r.bmdAccount)).toEqual(['0650', '0065']);
    expect(mapping.findings.map((f) => [f.code, f.value])).toEqual([
      ['W-PADDED', '650'],
      ['W-PADDED', '65'],
    ]);
    expect(mapping.findings[0]?.message).toContain('line 2');
  });

  it('never pads at a longer Sachkontenlänge: 2890 stays 2890 at length 5', () => {
    const mapping = parse(csvBytes([HEADER, '1102;Payments;Visa;;2890;;;;']), 5);
    expect(mapping.rows[0]?.bmdAccount).toBe('2890');
    expect(mapping.findings).toEqual([]);
  });

  it('never pads AccountsReceivable rows, which may name a Personenkonto', () => {
    const mapping = parse(csvBytes([HEADER, '*;AccountsReceivable;AR;;200;;;;']));
    expect(mapping.rows[0]?.bmdAccount).toBe('200');
    expect(mapping.findings).toEqual([]);
  });
});

describe('structural errors', () => {
  it('fails on two rows with the same account and type, naming both lines', () => {
    const error = loadError(csvBytes([HEADER, 'R10;Revenues;A;10;4000;1;10;;', '1102;Payments;Visa;;2890;;;;', 'R10;Revenues;A;10;4010;1;10;;']));
    expect(error.message).toContain('lines 2 and 4 both map apaleo account R10 of type Revenues');
  });

  it('allows the same number with different types, and rate wildcards with different rates', () => {
    const mapping = parse(
      csvBytes([HEADER, '1200;Receivables;;;2390;;;;', '1200;Payments;;;2890;;;;', '*;Liabilities;;10;3200;1;10;;', '*;Liabilities;;20;3201;1;20;;']),
    );
    expect(mapping.rows).toHaveLength(4);
  });

  it('fails on two wildcards for the same rate, written differently', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;10;3200;1;10;;', '*;Liabilities;;"10,0";3200;1;10;;']));
    expect(error.message).toContain('lines 2 and 3 both map apaleo account * of type Liabilities at 10,0 %');
  });

  it('rejects a Liabilities wildcard without a rate: VAT-relevant wildcards must name a VAT rate', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;;3200;1;10;;']));
    expect(error.message).toContain('line 2: VAT-relevant wildcards must name a VAT rate');
  });

  it.each(['', '10'])('rejects a Revenues wildcard (rate "%s") because revenue accounts are mapped one by one', (rate) => {
    const error = loadError(csvBytes([HEADER, `*;Revenues;;${rate};4000;1;10;;`]));
    expect(error.message).toContain('revenue accounts must be mapped one by one because of VAT');
  });

  it('rejects a header without the required columns and an empty file', () => {
    expect(loadError(csvBytes(['account;bmd'])).message).toContain('lacks the column(s) apaleo_account, apaleo_type, bmd_account');
    expect(loadError(new Uint8Array()).message).toContain('the file is empty');
  });

  it('reports a broken quote with the file name', () => {
    expect(() => parse(csvBytes([HEADER, 'R10;Revenues;"Accommodation;10']))).toThrow(/Cannot read the mapping file m\.csv/);
  });
});

describe('writer', () => {
  it('writes UTF-8 with BOM, ; and CRLF, quoting only where needed', () => {
    const bytes = renderMappingFile(['Vorlage ekr-hotel@1'], [mappingRow({ apaleoAccount: 'R10', apaleoType: 'Revenues', comment: 'a; "b"' })]);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3))).toBe(`# Vorlage ekr-hotel@1\r\n${HEADER}\r\nR10;Revenues;;;;;;;"a; ""b"""\r\n`);
    expect(formatCsvLine([' x', 'y\nz', 'plain'])).toBe('" x";"y\nz";plain');
  });

  it('reads back what it wrote', () => {
    const mapping = parse(renderMappingFile([], EXCEL_ORIGINAL_ROWS));
    expect(mapping.rows.map(values)).toEqual(EXCEL_ORIGINAL_ROWS);
    expect(mapping.findings).toEqual([]);
  });

  it('keeps line numbers of multi-line records usable', () => {
    const records = parseCsv('a;b\r\n1;"x\r\ny"\r\n2;3\r\n', ';', 'test');
    expect(records.map((r) => r.line)).toEqual([1, 3, 4]);
  });
});

describe('Excel round trip', () => {
  it('reads the Excel (AT) saved fixture to the same rows as the written original, restoring the class-0 account and reading 4,9 as 4.9', () => {
    const original = parse(renderMappingFile([], EXCEL_ORIGINAL_ROWS));
    const saved = parse(readMappingFixture('excel-at-saved.csv'));
    expect(decodeCsv(readMappingFixture('excel-at-saved.csv')).encoding).toBe('windows-1252');
    expect(saved.rows.map(values).map(rated)).toEqual(original.rows.map(values).map(rated));
    expect(saved.rows.find((row) => row.apaleoAccount === 'RevenueOther_Special:4.90')?.bmdVatPercent).toBe('4,9');
    expect(parsePercent('4,9')).toBe(4.9);
    expect(saved.findings.map((f) => [f.code, f.value])).toEqual([['W-PADDED', '650']]);
  });
});

describe('appendRows', () => {
  it('reads the column order of a header with every cell quoted (LibreOffice "quote all")', () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"bmd_account";"steuercode";"bmd_vat_percent";"kost";"comment"\r\n' +
      '"R10";"Revenues";"Accommodation 10%";"10";"4000";"1";"10";"";""\r\n';
    const added = mappingRow({ apaleoAccount: 'R20', apaleoType: 'Revenues', apaleoName: 'Spa 20%', apaleoVatPercent: '20', bmdAccount: '4030', steuercode: '1', bmdVatPercent: '20' });
    const bytes = appendRows(new TextEncoder().encode(quoted), [added]);
    expect(decodeCsv(bytes).text).toBe(`${quoted}R20;Revenues;Spa 20%;20;4030;1;20;;\r\n`);
    const rows = parseMapping(bytes, { path: 'x', sachkontenlaenge: 4 }).rows;
    expect(rows.map((r) => [r.apaleoAccount, r.bmdAccount])).toEqual([
      ['R10', '4000'],
      ['R20', '4030'],
    ]);
  });
});
