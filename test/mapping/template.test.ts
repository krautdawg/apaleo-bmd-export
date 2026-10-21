import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BmdDialect } from '../../src/bmd/types.js';
import type { SourceAccount } from '../../src/core/source.js';
import {
  OUTPUT_TAX_MARKER,
  SUGGESTION_MARK,
  checkMapping,
  loadTemplate,
  mappingHeaderComment,
  parseTemplate,
  renderMappingFile,
  scaleAccount,
  shippedTemplate,
  suggestRows,
  templateWildcardAccount,
  type MappingRowValues,
  type Template,
  type TemplateSettings,
} from '../../src/mapping/index.js';
import { BSP, LIVE_PROPERTIES, loadBeispielData, loadLiveData } from '../helpers/apaleo.js';
import { mappingOf } from '../helpers/mapping.js';

const settings = (overrides: Partial<TemplateSettings> = {}): TemplateSettings => ({ sachkontenlaenge: 4, personenkontenlaenge: 6, dialect: 'ntcs', ...overrides });

const account = (number: string, name: string, type: string, extra: Partial<SourceAccount> = {}): SourceAccount => ({
  number,
  name,
  type,
  ledger: 'global',
  isArchived: false,
  hasChildren: false,
  ...extra,
});
const rate = (percent: number, type = 'X') => ({ vat: { type, percent } });

const find = (rows: MappingRowValues[], number: string, type?: string) =>
  rows.find((r) => r.apaleoAccount === number && (type === undefined || r.apaleoType === type));
const wildcard = (rows: MappingRowValues[], type: string, percent = '') => rows.find((r) => r.apaleoAccount === '*' && r.apaleoType === type && r.apaleoVatPercent === percent);

/** Every rule of the template with an account as a mapping row, so `checkMapping` can check the numbers. */
function templateRows(template: Template, s: TemplateSettings): MappingRowValues[] {
  const { rows } = suggestRows([], { ...template, rules: template.rules.map((rule) => ({ ...rule, wildcard: true })) }, s);
  return rows.filter((row) => row.bmdAccount !== '').map((row, i) => ({ ...row, apaleoAccount: `${i}`, comment: '' }));
}

describe('EKR hotel template', () => {
  it('names its version and marks every rule "Vorschlag (ungeprüft)"', async () => {
    const template = await loadTemplate();
    expect(template.id).toBe('ekr-hotel@1');
    expect(template.rules.length).toBeGreaterThan(20);
    for (const rule of template.rules) {
      expect(rule.comment.startsWith(SUGGESTION_MARK), `line ${rule.line}`).toBe(true);
      expect(rule.bmdAccount).toMatch(/^(\d{4}|200000)?$/);
      expect(['', OUTPUT_TAX_MARKER]).toContain(rule.steuercode);
    }
    expect(shippedTemplate()).toEqual(template);
  });

  it.each([
    [4, 'ntcs'],
    [5, 'ntcs'],
    [9, 'bmd55'],
  ] as const)('passes checkMapping at Sachkontenlänge %i with dialect %s', async (sachkontenlaenge, dialect) => {
    const s = settings({ sachkontenlaenge, dialect });
    const mapping = mappingOf(templateRows(await loadTemplate(), s), sachkontenlaenge);
    const findings = checkMapping(mapping, { ...s }).filter((finding) => finding.code !== 'W-UNTAXED-REVENUE');
    expect(findings).toEqual([]);
  });

  it('suggests rows for the Hotel Beispiel chart: Beherbergung, Speisen, Getränke, cards to Schwebende Geldbewegungen, nothing guessed', async () => {
    const chart = (await loadBeispielData()).charts[BSP] ?? [];
    const { rows, findings } = suggestRows(chart, await loadTemplate(), settings());
    expect(findings).toEqual([]);
    const pick = (number: string) => {
      const row = find(rows, number);
      return row && [row.bmdAccount, row.steuercode, row.bmdVatPercent];
    };
    expect(pick('RevenueAccommodation_VeryReduced:10.00')).toEqual(['4000', '1', '10']);
    expect(pick('RevenueFoodAndBeverages_VeryReduced:10.00')).toEqual(['4010', '1', '10']);
    expect(pick('RevenueFoodAndBeverages_Normal:20.00')).toEqual(['4020', '1', '20']);
    expect(pick('RevenueAccommodation_Normal:20.00')).toEqual(['4030', '1', '20']);
    expect(pick('RevenueAccommodation_Without:0.00')).toEqual(['4090', '', '0']);
    expect(find(rows, 'RevenueOther_Without:0.00')?.comment).toMatch(/^archiviert\. Vorschlag \(ungeprüft\)/);
    expect(pick('1600')).toEqual(['2700', '', '']);
    for (const card of ['1102', '1104', '1106']) expect(pick(card)).toEqual(['2890', '', '']);
    expect(pick('1200')).toEqual(['2390', '', '']);
    expect(pick('CollectiveDebitor_AccountsReceivable')).toEqual(['200000', '', '']);
    for (const number of ['9000', '7000', '3501', 'Vat_VeryReduced:10.00', 'LiabilitiesVat_VeryReduced:10.00']) {
      expect(find(rows, number)?.bmdAccount, number).toBe('');
    }
    expect(rows.filter((r) => r.apaleoAccount === '*').map((r) => [r.apaleoType, r.apaleoVatPercent, r.bmdAccount, r.steuercode, r.bmdVatPercent])).toEqual([
      ['Payments', '', '2890', '', ''],
      ['Liabilities', '10', '3200', '1', '10'],
      ['Liabilities', '13', '3202', '1', '13'],
      ['Liabilities', '20', '3201', '1', '20'],
      ['Liabilities', '0', '3209', '', '0'],
      ['Liabilities', '5', '', '', ''],
      ['Receivables', '', '2390', '', ''],
      ['AccountsReceivable', '', '200000', '', ''],
    ]);
    // Parents get no row, nor do containers of wildcard types that no rule maps.
    for (const parent of ['1000', '5000', 'RevenueAccommodation', '3000', '9999', '6900']) expect(find(rows, parent), parent).toBeUndefined();
  });

  it('does not guess House and TransitoryItems', async () => {
    const { rows } = suggestRows([account('9000', 'House Account', 'House'), account('7000', 'Transitory Items', 'TransitoryItems')], await loadTemplate(), settings());
    for (const number of ['9000', '7000']) {
      expect(find(rows, number)).toMatchObject({ bmdAccount: '', steuercode: '' });
      expect(find(rows, number)?.comment).toMatch(/^Vorschlag \(ungeprüft\): keine Vorlage/);
    }
  });

  it('leaves the Ortstaxe and the other levies empty with both options in the comment', async () => {
    const chart = [
      account('3501', 'City Tax (no VAT)', 'CityTaxes', rate(0, 'Without')),
      account('3600', 'Second City Tax', 'SecondCityTax'),
      account('3700', 'Guest Levy', 'GuestLevies'),
    ];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    for (const number of ['3501', '3600', '3700']) {
      const row = find(rows, number);
      expect(row?.bmdAccount, number).toBe('');
      expect(row?.comment).toContain('Verbindlichkeit gegenüber der Gemeinde ohne Steuercode');
      expect(row?.comment).toContain('durchlaufende Posten der Kanzlei');
    }
    expect(find(rows, '3501')?.comment).toContain('Ortstaxe');
  });

  it('maps "Frühstück Speisen" at 10 % to 4010 and "Getränke" at 20 % to 4020, both with Steuercode 1', async () => {
    const chart = [account('F', 'Frühstück Speisen', 'Revenues', rate(10)), account('G', 'Getränke', 'Revenues', rate(20))];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    expect(rows.filter((r) => r.apaleoAccount !== '*').map((r) => [r.apaleoAccount, r.bmdAccount, r.steuercode, r.bmdVatPercent])).toEqual([
      ['F', '4010', '1', '10'],
      ['G', '4020', '1', '20'],
    ]);
  });

  it('proposes 4040 at 13 %, 4050 at 4.9 % and 4090 without Steuercode at 0 %, with the comment on the fixed Steuercode', async () => {
    const chart = [account('A', 'Therme', 'Revenues', rate(13)), account('B', 'Brot', 'Revenues', rate(4.9)), account('C', 'Storno', 'Revenues', rate(0))];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    expect(['A', 'B', 'C'].map((n) => find(rows, n)).map((r) => [r?.bmdAccount, r?.steuercode, r?.bmdVatPercent])).toEqual([
      ['4040', '1', '13'],
      ['4050', '1', '4.9'],
      ['4090', '', '0'],
    ]);
    expect(find(rows, 'C')?.comment).toContain('keinen fixen Steuercode');
  });

  it('matches name patterns on parent names too, and leaves an unmatched 10 % revenue empty', async () => {
    const chart = [
      account('5100', 'Restaurant', 'Revenues', { hasChildren: true }),
      account('5101', 'Menü 10%', 'Revenues', { parentNumber: '5100', ...rate(10) }),
      account('5200', 'Spa 10%', 'Revenues', rate(10)),
    ];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    expect(find(rows, '5101')?.bmdAccount).toBe('4010');
    expect(find(rows, '5200')).toMatchObject({ bmdAccount: '', steuercode: '', comment: expect.stringContaining('weder Beherbergung noch Speisen') });
  });

  it('leaves accounts no rule matches unmapped', async () => {
    const { rows } = suggestRows([account('5300', 'Parking', 'Revenues', rate(7))], await loadTemplate(), settings());
    expect(find(rows, '5300')).toMatchObject({ bmdAccount: '', comment: expect.stringContaining('keine Vorlage-Regel passt') });
  });

  it.each(['RevenueAccommodation_Special:5.00', 'RevenueFoodAndBeverages_Special:5.00'])('leaves the historical 5 %% row %s empty with the 2020/2021 comment', async (number) => {
    const { rows } = suggestRows([account(number, 'Revenues (5%)', 'Revenues', rate(5, 'Special'))], await loadTemplate(), settings());
    expect(find(rows, number)).toMatchObject({ bmdAccount: '', comment: expect.stringContaining('historischer Satz 5 % (1.7.2020 bis 31.12.2021)') });
    expect(find(rows, number)?.comment).toContain('E-UNMAPPED');
  });

  it('writes Steuercode 3 (Soll-Umsatzsteuer in BMD 5.5) on taxed revenue and deposit rows with dialect bmd55', async () => {
    const chart = [account('A', 'Accommodation', 'Revenues', rate(10)), account('B', 'Storno', 'Revenues', rate(0))];
    const { rows } = suggestRows(chart, await loadTemplate(), settings({ dialect: 'bmd55' }));
    expect(find(rows, 'A')?.steuercode).toBe('3');
    expect(find(rows, 'B')?.steuercode).toBe('');
    expect(['10', '13', '20'].map((p) => wildcard(rows, 'Liabilities', p)?.steuercode)).toEqual(['3', '3', '3']);
    expect(wildcard(rows, 'Liabilities', '0')?.steuercode).toBe('');
  });

  it('writes no row for an empty container outside the global ledger, but keeps one a rule maps', async () => {
    const guest = { ledger: 'guest' as const, hasChildren: true };
    const chart = [
      account('3000', 'Liabilities', 'Liabilities', guest),
      account('1200', 'Receivables', 'Receivables', guest),
      account('9999', 'Accounts Receivable', 'AccountsReceivable', guest),
      account('CollectiveDebitor_AccountsReceivable', 'AccountsReceivable for …', 'AccountsReceivable', { ...guest, parentNumber: '9999' }),
      account('6900', 'Loss of Accounts Receivable', 'LossOfAccountsReceivable', guest),
      account('CollectiveDebitor_LossOfAccountsReceivable', 'LossOfAccountsReceivable for …', 'LossOfAccountsReceivable', { ...guest, parentNumber: '6900' }),
      account('9000', 'House Account', 'House', { hasChildren: true }),
    ];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    expect(find(rows, '3000')).toBeUndefined();
    expect(find(rows, '9999')).toBeUndefined();
    expect(find(rows, '1200')?.bmdAccount).toBe('2390');
    expect(find(rows, 'CollectiveDebitor_AccountsReceivable')?.bmdAccount).toBe('200000');
    // Bad debt has no wildcard rule yet (b05): its container keeps its empty row.
    expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')).toMatchObject({ bmdAccount: '', comment: expect.stringContaining('Forderungsverluste') });
    expect(find(rows, '9000')).toBeDefined();
  });

  it('scales template numbers with trailing zeros, keeps the Personenkonto 200000 and notes the Sachkontenlänge', async () => {
    const chart = [account('A', 'Accommodation', 'Revenues', rate(10)), account('CollectiveDebitor_AccountsReceivable', 'AR', 'AccountsReceivable')];
    const { rows, findings } = suggestRows(chart, await loadTemplate(), settings({ sachkontenlaenge: 5 }));
    expect(find(rows, 'A')?.bmdAccount).toBe('40000');
    expect(find(rows, 'CollectiveDebitor_AccountsReceivable')?.bmdAccount).toBe('200000');
    expect(findings).toEqual([expect.objectContaining({ code: 'N-TEMPLATE-SCALED', message: expect.stringContaining('Sachkontenlänge 5') })]);
    expect(findings[0]?.message).toContain('200000 stays as it is');
    expect(suggestRows(chart, await loadTemplate(), settings()).findings).toEqual([]);
    expect(scaleAccount('', 6)).toBe('');
    expect(scaleAccount('2890', 9)).toBe('289000000');
  });

  it('gives the wildcard account of a type and rate for fix hints', async () => {
    const template = await loadTemplate();
    const lengths = (sachkontenlaenge: number, personenkontenlaenge = 6) => ({ sachkontenlaenge, personenkontenlaenge });
    expect(templateWildcardAccount(template, 'Liabilities', 13, lengths(4))).toBe('3202');
    expect(templateWildcardAccount(template, 'Liabilities', 5, lengths(4))).toBeUndefined();
    expect(templateWildcardAccount(template, 'AccountsReceivable', undefined, lengths(5))).toBe('200000');
    expect(templateWildcardAccount(template, 'AccountsReceivable', undefined, lengths(4, 5))).toBe('20000');
    expect(templateWildcardAccount(template, 'AccountsReceivable', undefined, lengths(4, 8))).toBe('20000000');
    expect(templateWildcardAccount(template, 'AccountsReceivable', undefined, lengths(6, 6))).toBeUndefined();
    expect(templateWildcardAccount(template, 'Payments', undefined, lengths(5))).toBe('28900');
  });

  it.each([
    [5, '20000'],
    [7, '2000000'],
    [9, '200000000'],
  ])('scales the Personenkonto to Personenkontenlänge %i, so its own mapping check passes', async (personenkontenlaenge, expected) => {
    const chart = [account('A', 'Accommodation', 'Revenues', rate(10)), account('CollectiveDebitor_AccountsReceivable', 'AR', 'AccountsReceivable')];
    const s = settings({ personenkontenlaenge });
    const { rows, findings } = suggestRows(chart, await loadTemplate(), s);
    expect(find(rows, 'A')?.bmdAccount).toBe('4000');
    const debtor = find(rows, 'CollectiveDebitor_AccountsReceivable');
    expect(debtor?.bmdAccount).toBe(expected);
    expect(debtor?.comment).toContain(`Personenkonto ${expected}`);
    expect(debtor?.comment).not.toContain('200000 ');
    expect(wildcard(rows, 'AccountsReceivable')?.bmdAccount).toBe(expected);
    expect(findings).toEqual([expect.objectContaining({ code: 'N-TEMPLATE-SCALED', message: expect.stringContaining(`became ${expected}`) })]);
    const mapping = mappingOf(rows);
    expect(checkMapping(mapping, s).filter((f) => f.code === 'E-ACCOUNT-LENGTH')).toEqual([]);
    expect(scaleAccount('200000', 4, personenkontenlaenge)).toBe(expected);
  });

  it('leaves the Personenkonto empty with a comment when Personenkontenlänge equals Sachkontenlänge', async () => {
    const chart = [account('CollectiveDebitor_AccountsReceivable', 'AR', 'AccountsReceivable')];
    const { rows, findings } = suggestRows(chart, await loadTemplate(), settings({ sachkontenlaenge: 6, personenkontenlaenge: 6 }));
    for (const row of [find(rows, 'CollectiveDebitor_AccountsReceivable'), wildcard(rows, 'AccountsReceivable')]) {
      expect(row).toMatchObject({ bmdAccount: '', steuercode: '', bmdVatPercent: '' });
      expect(row?.comment).toMatch(/^Vorschlag \(ungeprüft\): bmd_account leer gelassen, weil die Personenkontenlänge 6 gleich der Sachkontenlänge/);
    }
    expect(findings[0]?.message).toContain('Sammeldebitor rows were left empty');
  });

  it('rejects a template without version or with the wrong header', () => {
    expect(() => parseTemplate('apaleo_type;name_pattern\r\n')).toThrow(/does not name its version/);
    expect(() => parseTemplate('# ekr-hotel@1\r\na;b\r\n')).toThrow(/header must be/);
  });

  it('ships a template file that is valid UTF-8 with CRLF and 7 columns per line', () => {
    const text = readFileSync(new URL('../../templates/ekr-hotel.rules.csv', import.meta.url), 'utf8');
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
    const lines = text.split('\r\n').filter((l) => l !== '' && !l.startsWith('#'));
    for (const line of lines) expect(line.split(';'), line).toHaveLength(7);
  });
});

describe('EKR template on the recorded VIE chart', () => {
  const dialects: BmdDialect[] = ['ntcs', 'bmd55'];

  it.each(dialects)('has no row for 3000 or 9999, the four deposit wildcards, the Sammeldebitor wildcard, and empty 5 %% rows (%s)', async (dialect) => {
    const data = await loadLiveData();
    expect(LIVE_PROPERTIES).toContain('VIE');
    const { rows } = suggestRows(data.charts.VIE ?? [], await loadTemplate(), settings({ dialect }));
    const code = dialect === 'ntcs' ? '1' : '3';
    expect(find(rows, '3000')).toBeUndefined();
    expect(find(rows, '9999')).toBeUndefined();
    expect([['10', '3200'], ['13', '3202'], ['20', '3201']].map(([p]) => wildcard(rows, 'Liabilities', p)).map((r) => [r?.bmdAccount, r?.steuercode])).toEqual([
      ['3200', code],
      ['3202', code],
      ['3201', code],
    ]);
    expect(wildcard(rows, 'Liabilities', '0')).toMatchObject({ bmdAccount: '3209', steuercode: '' });
    expect(wildcard(rows, 'Liabilities', '5')).toMatchObject({ bmdAccount: '', comment: expect.stringContaining('historischer Satz 5 %') });
    expect(wildcard(rows, 'AccountsReceivable')?.bmdAccount).toBe('200000');
    const historical = rows.filter((row) => row.apaleoAccount.endsWith('_Special:5.00') && row.apaleoType === 'Revenues');
    expect(historical.length).toBeGreaterThanOrEqual(5);
    for (const row of historical) expect(row).toMatchObject({ bmdAccount: '', comment: expect.stringContaining('1.7.2020 bis 31.12.2021') });
    // Bad debt keeps its empty container row until b05 makes it a wildcard type.
    expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')?.bmdAccount).toBe('');
  });

  it('is the committed live mapping of VIE, byte for byte', async () => {
    const data = await loadLiveData();
    const template = await loadTemplate();
    const { rows } = suggestRows(data.charts.VIE ?? [], template, settings());
    const written = renderMappingFile([mappingHeaderComment(template, settings())], rows);
    const committed = readFileSync(new URL('../fixtures/apaleo/live/VIE/mapping-VIE.live.csv', import.meta.url));
    expect(Buffer.from(written).equals(committed)).toBe(true);
  });
});
