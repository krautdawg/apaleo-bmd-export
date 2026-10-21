import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { SourceAccount } from '../../src/core/source.js';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv } from '../../src/mapping/csv.js';
import { parseMapping } from '../../src/mapping/index.js';
import { BSP, CLIENT_ID, FIXTURE_FILES, createApaleoContext, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext, type TestContext } from '../helpers/context.js';
import { FakeSource, type FakeSourceData } from '../helpers/fake-source.js';

const CONFIG = FIXTURE_FILES['apaleo-bmd.config.yaml'];

async function fakeContext(options: { config?: string; files?: Record<string, string>; extraAccounts?: SourceAccount[] } = {}) {
  const data: FakeSourceData = await loadBeispielData();
  data.charts[BSP] = [...(data.charts[BSP] ?? []), ...(options.extraAccounts ?? [])];
  const fake = new FakeSource(data);
  const ctx = createTestContext({
    files: { 'apaleo-bmd.config.yaml': options.config ?? CONFIG, ...options.files },
    sourceFactory: () => fake,
  });
  return { ctx, fake };
}

const read = (ctx: TestContext, file = 'mapping-BSP.csv') => readFileSync(join(ctx.cwd, file));
const text = (ctx: TestContext, file?: string) => decodeCsv(read(ctx, file)).text;
const rowOf = (ctx: TestContext, account: string, file?: string) =>
  text(ctx, file)
    .split('\r\n')
    .find((line) => line.startsWith(`${account};`));

const SPA: SourceAccount = {
  number: 'RevenueSpa_Normal:20.00',
  name: 'Spa (20%)',
  type: 'Revenues',
  parentNumber: '5000',
  ledger: 'global',
  vat: { type: 'Normal', percent: 20 },
  isArchived: false,
  hasChildren: false,
};
const SPA_ROW = 'RevenueSpa_Normal:20.00;Revenues;Spa (20%);20;4030;1;20;;Vorschlag (ungeprüft): sonstige Erlöse 20 % USt (zum Beispiel Parken, Spa-Behandlungen). EKR Klasse 4.';
const ACC10 = 'RevenueAccommodation_VeryReduced:10.00';
const withBmd = (lines: string) => CONFIG.replace('  buchsymbol: HO\n', `  buchsymbol: HO\n${lines}`);

describe('apaleo-bmd init-mapping', () => {
  it('writes mapping-BSP.csv with every leaf account from the EKR template and prints mapped and unmapped counts', async () => {
    const { ctx, fake } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    expect(fake.calls).toEqual([`getChartOfAccounts ${BSP}`]);

    const bytes = read(ctx);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(ctx).split('\r\n')[0]).toBe(
      '# apaleo-bmd Kontenzuordnung, Vorlage ekr-hotel@1, Sachkontenlänge 4, Personenkontenlänge 6, Dialekt ntcs. ' +
        'Alle Vorschläge mit der Steuerberatung prüfen. Spalte bmd_account in Excel als Text formatieren.',
    );
    const mapping = parseMapping(bytes, { path: 'x', sachkontenlaenge: 4 });
    const accounts = mapping.rows.filter((r) => r.apaleoAccount !== '*').map((r) => r.apaleoAccount);
    expect(accounts).toEqual([
      ACC10,
      'RevenueAccommodation_Normal:20.00',
      'RevenueAccommodation_Without:0.00',
      'RevenueFoodAndBeverages_VeryReduced:10.00',
      'RevenueFoodAndBeverages_Normal:20.00',
      'RevenueOther_Normal:20.00',
      'RevenueOther_Without:0.00',
      '1102',
      '1104',
      '1106',
      '1600',
      '1200',
      'Vat_Normal:20.00',
      'Vat_Null:0.00',
      'Vat_VeryReduced:10.00',
      '9000',
      'CollectiveDebitor_AccountsReceivable',
      '3501',
      '7000',
      'LiabilitiesVat_Normal:20.00',
      'LiabilitiesVat_Null:0.00',
      'LiabilitiesVat_VeryReduced:10.00',
    ]);
    expect(rowOf(ctx, ACC10)).toMatch(/^RevenueAccommodation_VeryReduced:10\.00;Revenues;Revenues Accommodation \(10%\);10;4000;1;10;;Vorschlag \(ungeprüft\): Erlöse Beherbergung 10 %/);
    expect(rowOf(ctx, '3501')).toMatch(/^3501;CityTaxes;City Tax \(no VAT\);0;;;;;Vorschlag \(ungeprüft\): bitte entscheiden/);

    expect(ctx.out()).toContain(`Wrote ${join(ctx.cwd, 'mapping-BSP.csv')} from template ekr-hotel@1 for property BSP.`);
    expect(ctx.out()).toContain('34 rows: 24 mapped, 4 unmapped, 6 VAT account row(s) that need no BMD account.');
    expect(ctx.out()).toContain('have your Steuerberatung check the file');
  });

  it('takes the EKR template when --template is left out', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP], ctx)).toBe(0);
    expect(rowOf(ctx, ACC10)).toContain(';4000;1;10;');
  });

  it('reads the chart through the apaleo API (ctx.fetchFn)', async () => {
    const ctx = createApaleoContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--out', 'maps/bsp.csv'], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'maps/bsp.csv')).toMatch(/^1102;Payments;Visa Credit Card Payment;;2890;/);
    expect(ctx.fetchCalls.some((call) => call.includes('/finance/v1/accounts/schema'))).toBe(true);
    expect(text(ctx, 'maps/bsp.csv')).not.toContain(CLIENT_ID);
  });

  it('writes to properties[].mapping when the config names one', async () => {
    const { ctx } = await fakeContext({ config: `${CONFIG}properties:\n  - id: BSP\n    mapping: ./mappings/hotel.csv\n` });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'mappings/hotel.csv')).toBeDefined();
  });

  it('scales the template to Sachkontenlänge 5, keeps the Personenkonto 200000 and prints a note', async () => {
    const { ctx } = await fakeContext({ config: withBmd('  sachkontenlaenge: 5\n') });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    expect(rowOf(ctx, ACC10)).toContain(';40000;1;10;');
    expect(rowOf(ctx, 'CollectiveDebitor_AccountsReceivable')).toContain(';200000;');
    expect(ctx.out()).toContain('N-TEMPLATE-SCALED');
    expect(ctx.out()).toContain('Sachkontenlänge 5');
  });

  it('writes Steuercode 3 on revenue and deposit rows with bmd.dialect bmd55', async () => {
    const { ctx } = await fakeContext({ config: withBmd('  dialect: bmd55\n') });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    expect(rowOf(ctx, ACC10)).toContain(';4000;3;10;');
    expect(text(ctx)).toContain('*;Liabilities;;13;3202;3;13;');
    expect(text(ctx).split('\r\n')[0]).toContain('Dialekt bmd55');
  });

  it('refuses to overwrite an existing file without --update, exits 1 and writes nothing', async () => {
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': 'edited by hand' } });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(1);
    expect(read(ctx).toString()).toBe('edited by hand');
    expect(ctx.err()).toContain('already exists and was not changed');
    expect(ctx.err()).toContain('--update');
    expect(fake.calls).toEqual([]);
  });

  it('--update keeps edited rows byte for byte and appends rows for new apaleo accounts', async () => {
    const first = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], first.ctx)).toBe(0);
    const editedRow = `${ACC10};Revenues;Revenues Accommodation (10%);10;4001;1;10;10;Kanzlei: eigenes Konto`;
    const edited = text(first.ctx).replace(/^RevenueAccommodation_VeryReduced:10\.00;.*$/m, editedRow);
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(edited)]);

    const { ctx } = await fakeContext({ files: {}, extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), original);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--update'], ctx)).toBe(0);

    const updated = read(ctx);
    expect(updated.subarray(0, original.length).equals(original)).toBe(true);
    expect(decodeCsv(updated.subarray(original.length)).text).toBe(`${SPA_ROW}\r\n`);
    expect(rowOf(ctx, ACC10)).toBe(editedRow);
    expect(ctx.out()).toContain('Added 1 row(s) for new apaleo accounts:');
    expect(ctx.out()).toMatch(/RevenueSpa_Normal:20\.00\s+Revenues\s+Spa \(20%\)\s+20 %\s+4030/);
  });

  it('--update says so when there is nothing new', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    const before = read(ctx);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--update'], ctx)).toBe(0);
    expect(read(ctx).equals(before)).toBe(true);
    expect(ctx.out()).toContain('No new apaleo accounts');
  });

  it('--update appends in the encoding, separator and line breaks of a file Excel saved', async () => {
    const saved = `apaleo_account,apaleo_type,bmd_account,steuercode,bmd_vat_percent,comment\n${ACC10},Revenues,4000,1,10,Logis für Gäste\n`;
    const { ctx } = await fakeContext({ extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), encodeCp1252(saved).bytes);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--update'], ctx)).toBe(0);
    const decoded = decodeCsv(read(ctx));
    expect(decoded.encoding).toBe('windows-1252');
    expect(decoded.text.startsWith(saved)).toBe(true);
    expect(decoded.text).toContain('\nRevenueSpa_Normal:20.00,Revenues,4030,1,20,"Vorschlag (ungeprüft): sonstige Erlöse 20 % USt (zum Beispiel Parken, Spa-Behandlungen). EKR Klasse 4."\n');
    expect(decoded.text).not.toContain('\r');
  });

  it('--update refuses a DATEV mapping file and names --template ekr, changing nothing', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n5011;Revenues;A;7;8300;;7;;;\r\n';
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': datev } });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--update'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a DATEV mapping');
    expect(ctx.err()).toContain('--template ekr');
    expect(read(ctx).toString()).toBe(datev);
    expect(fake.calls).toEqual([]);
  });

  it('--update appends below a header whose cells are all quoted', async () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"bmd_account";"steuercode";"bmd_vat_percent";"kost";"comment"\r\n' +
      `"${ACC10}";"Revenues";"Revenues Accommodation (10%)";"10";"4000";"1";"10";"";""\r\n`;
    const { ctx } = await fakeContext({ files: { 'mapping-BSP.csv': quoted }, extraAccounts: [SPA] });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr', '--update'], ctx)).toBe(0);
    const mapping = parseMapping(read(ctx), { path: 'x', sachkontenlaenge: 4 });
    expect(mapping.rows.find((r) => r.apaleoAccount === SPA.number)).toMatchObject({ apaleoType: 'Revenues', bmdAccount: '4030', steuercode: '1' });
    expect(mapping.rows.find((r) => r.apaleoAccount === ACC10)).toMatchObject({ bmdAccount: '4000' });
  });

  it.each([
    [['init-mapping', '--template', 'ekr'], '--property'],
    [['init-mapping', '--property', BSP, '--template', 'skr03'], '--template must be ekr'],
  ])('exits 2 on %j', async (argv, message) => {
    const { ctx } = await fakeContext();
    expect(await runCli(argv, ctx)).toBe(2);
    expect(ctx.err()).toContain(message);
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});
