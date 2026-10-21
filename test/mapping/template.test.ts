import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BmdDialect } from '../../src/bmd/types.js';
import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, SourceAccount } from '../../src/core/source.js';
import {
  OUTPUT_TAX_MARKER,
  SUGGESTION_MARK,
  checkMapping,
  loadTemplate,
  mappingHeaderComment,
  parseTemplate,
  renderMappingFile,
  resolve,
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
      ['LossOfAccountsReceivable', '10', '7800', '1', '10'],
      ['LossOfAccountsReceivable', '13', '7802', '1', '13'],
      ['LossOfAccountsReceivable', '20', '7801', '1', '20'],
      ['LossOfAccountsReceivable', '0', '7809', '', '0'],
    ]);
    // Parents get no row, nor do containers of wildcard types that no rule maps.
    for (const parent of ['1000', '5000', 'RevenueAccommodation', '3000', '9999', '6900', 'CollectiveDebitor_LossOfAccountsReceivable']) {
      expect(find(rows, parent), parent).toBeUndefined();
    }
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

  it('matches patterns against the apaleo account number too, without letting a number containing "Room" override a 20 % drink', async () => {
    const chart = [account('RoomBarDrinks', 'Getränke Hotelbar', 'Revenues', rate(20)), account('RevenueNoShow_VeryReduced:10.00', 'Revenues (10%)', 'Revenues', rate(10))];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    expect(find(rows, 'RoomBarDrinks')).toMatchObject({ bmdAccount: '4020', steuercode: '1', bmdVatPercent: '20' });
    expect(find(rows, 'RevenueNoShow_VeryReduced:10.00')?.bmdAccount).toBe('');
    expect(find(rows, 'RevenueNoShow_VeryReduced:10.00')?.comment).toContain('No-Show kann steuerbar sein');
  });

  it('proposes 4040 at 13 %, 4050 at 4.9 % and 4090 without Steuercode at 0 %, with the comment on the fixed Steuercode', async () => {
    const chart = [account('A', 'Therme', 'Revenues', rate(13)), account('B', 'Brot', 'Revenues', rate(4.9)), account('C', 'Gutschein ohne USt', 'Revenues', rate(0))];
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
    expect(['10', '13', '20'].map((p) => wildcard(rows, 'LossOfAccountsReceivable', p)?.steuercode)).toEqual(['3', '3', '3']);
    expect(wildcard(rows, 'LossOfAccountsReceivable', '0')?.steuercode).toBe('');
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
    // Bad debt is a wildcard type (b05): neither container gets a row.
    expect(find(rows, '6900')).toBeUndefined();
    expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')).toBeUndefined();
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
    expect(find(rows, '6900')).toBeUndefined();
    expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')).toBeUndefined();
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

describe('EKR template rows for the Austrian special cases (b05)', () => {
  const NO_SHOW_COMMENT = 'No-Show kann steuerbar sein, Stornogebühr meist nicht';

  it.each([
    ['ntcs', '1'],
    ['bmd55', '3'],
  ] as const)('writes the deposit wildcards with the output-tax code and a comment naming both NTCS setups (%s)', async (dialect, code) => {
    const { rows } = suggestRows([], await loadTemplate(), settings({ dialect }));
    for (const [percent, bmdAccount] of [['10', '3200'], ['13', '3202'], ['20', '3201']] as const) {
      const row = wildcard(rows, 'Liabilities', percent);
      expect(row).toMatchObject({ bmdAccount, steuercode: code, bmdVatPercent: percent });
      expect(row?.comment).toContain('die USt direkt am Anzahlungskonto');
      expect(row?.comment).toContain('Anzahlungskonto der Kanzlei je Steuersatz mit einem Konto für noch nicht fällige USt');
      expect(row?.comment).toContain('docs/mapping-guide.md');
    }
  });

  it('maps bad debt by rate: 7800 at 10 %, 7802 at 13 %, 7801 at 20 % with the output-tax code, 7809 at 0 % without', async () => {
    const { rows } = suggestRows([], await loadTemplate(), settings());
    expect(['10', '13', '20', '0'].map((p) => wildcard(rows, 'LossOfAccountsReceivable', p)).map((r) => [r?.bmdAccount, r?.steuercode, r?.bmdVatPercent])).toEqual([
      ['7800', '1', '10'],
      ['7802', '1', '13'],
      ['7801', '1', '20'],
      ['7809', '', '0'],
    ]);
    for (const p of ['10', '13', '20', '0']) expect(wildcard(rows, 'LossOfAccountsReceivable', p)?.comment).toMatch(/^Vorschlag \(ungeprüft\): Forderungsverlust/);
  });

  it('maps cancellation and no-show fees at 0 % to 4091 by group number or by German or English name, before any other rule', async () => {
    const chart = [
      account('RevenueCancellationFees', 'Gebühren', 'Revenues', { hasChildren: true }),
      account('RevenueCancellationFees_Without:0.00', 'Gebühren (0%)', 'Revenues', { parentNumber: 'RevenueCancellationFees', ...rate(0, 'Without') }),
      account('RevenueNoShow_Null:0.00', 'Nicht erschienen', 'Revenues', rate(0, 'Null')),
      account('S1', 'Stornogebühr', 'Revenues', rate(0)),
      account('S2', 'No-Show Zimmer', 'Revenues', rate(0)),
      account('S3', 'Noshow fee', 'Revenues', rate(0)),
      account('S4', 'Cancellation fee', 'Revenues', rate(0)),
    ];
    const { rows } = suggestRows(chart, await loadTemplate(), settings());
    for (const number of ['RevenueCancellationFees_Without:0.00', 'RevenueNoShow_Null:0.00', 'S1', 'S2', 'S3', 'S4']) {
      const row = find(rows, number);
      expect([row?.bmdAccount, row?.steuercode, row?.bmdVatPercent], number).toEqual(['4091', '', '0']);
      expect(row?.comment, number).toContain('prüfe, dass 4091 in BMD keinen fixen Steuercode hat');
    }
  });

  it.each([
    ['No-Show Gebühr', 10],
    ['No-Show Zimmer', 10],
    ['Stornogebühr', 20],
    ['Revenues No-show (13%)', 13],
  ])('leaves a taxed fee "%s" at %i %% empty with the no-show comment, also where a rate rule would match', async (name, percent) => {
    const { rows } = suggestRows([account('F', name, 'Revenues', rate(percent))], await loadTemplate(), settings());
    expect(find(rows, 'F')).toMatchObject({ bmdAccount: '', steuercode: '', bmdVatPercent: '', comment: expect.stringContaining(NO_SHOW_COMMENT) });
    expect(find(rows, 'F')?.comment).toMatch(/^Vorschlag \(ungeprüft\)/);
  });

  it('keeps the historical 5 % comment on a cancellation fee at 5 %', async () => {
    const { rows } = suggestRows([account('RevenueCancellationFees_Special:5.00', 'Revenues Cancellation fees (5%)', 'Revenues', rate(5, 'Special'))], await loadTemplate(), settings());
    expect(find(rows, 'RevenueCancellationFees_Special:5.00')?.comment).toContain('historischer Satz 5 %');
  });

  it('leaves a CityTaxes row empty with both booking options, the fixed-Steuercode check and the Bundesland table', async () => {
    const { rows } = suggestRows([account('3501', 'City Tax (no VAT)', 'CityTaxes', rate(0, 'Without'))], await loadTemplate(), settings());
    const row = find(rows, '3501');
    expect(row?.bmdAccount).toBe('');
    expect(row?.comment).toContain('Verbindlichkeit gegenüber der Gemeinde ohne Steuercode');
    expect(row?.comment).toContain('durchlaufende Posten der Kanzlei');
    expect(row?.comment).toContain('Das BMD-Konto darf keinen fixen Steuercode haben');
    expect(row?.comment).toContain('Tabelle nach Bundesland in docs/mapping-guide.md');
  });
});

describe('b05 rows on the recorded VIE chart', () => {
  const loadVie = async () => (await loadLiveData()).charts.VIE ?? [];

  it('maps RevenueCancellationFees_Without:0.00 to 4091 without Steuercode and leaves RevenueNoShow_Reduced:13.00 empty with the no-show comment', async () => {
    const { rows } = suggestRows(await loadVie(), await loadTemplate(), settings());
    expect(find(rows, 'RevenueCancellationFees_Without:0.00')).toMatchObject({ bmdAccount: '4091', steuercode: '', bmdVatPercent: '0' });
    expect(find(rows, 'RevenueNoShow_Reduced:13.00')).toMatchObject({ bmdAccount: '', steuercode: '', comment: expect.stringContaining('No-Show kann steuerbar sein') });
  });

  it.each(['6900', 'CollectiveDebitor_LossOfAccountsReceivable'])(
    'resolves a write-off on a per-reservation bad-debt account under %s through the rate wildcards, and writes no container row',
    async (parentNumber) => {
      const vie = await loadVie();
      const { rows } = suggestRows(vie, await loadTemplate(), settings());
      expect(find(rows, '6900')).toBeUndefined();
      expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')).toBeUndefined();
      const mapping = mappingOf(rows);
      const chart = new ChartIndex(vie);
      // Assumed shape (no write-off is recorded): like AR's AHTJTGFK-1_AccountsReceivable under 9999.
      const account: AccountRef = { number: 'AHTJTGFK-1_LossOfAccountsReceivable', name: 'LossOfAccountsReceivable for Reservation AHTJTGFK-1', type: 'LossOfAccountsReceivable', parentNumber };
      const at = (rate: number) => resolve(mapping, account, { rate, chart });
      expect([at(10), at(20)].map((row) => [row?.bmdAccount, row?.steuercode, row?.bmdVatPercent])).toEqual([
        ['7800', '1', '10'],
        ['7801', '1', '20'],
      ]);
    },
  );
});
