import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { LedgerLine } from '../../src/core/source.js';
import { BSP, FIXTURE_FILES, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext } from '../helpers/context.js';
import { FakeSource } from '../helpers/fake-source.js';
import { ledgerLine, tax } from '../helpers/ledger.js';

const CONFIG = FIXTURE_FILES['apaleo-bmd.config.yaml'];
const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment';
const csv = (...lines: string[]) => [HEADER, ...lines].map((l) => `${l}\r\n`).join('');
const withBmd = (lines: string) => CONFIG.replace('  buchsymbol: HO\n', `  buchsymbol: HO\n${lines}`);
const ACC10 = 'RevenueAccommodation_VeryReduced:10.00';

const VALID = csv(
  `${ACC10};Revenues;Revenues Accommodation (10%);10;4000;1;10;;`,
  '1102;Payments;Visa Credit Card Payment;;2890;;;;',
  '*;Payments;;;2890;;;;',
  '*;Liabilities;;10;3200;1;10;;',
  '*;AccountsReceivable;;;200000;;;;',
  '3501;CityTaxes;City Tax;0;;;;;',
);

const BEISPIEL = await loadBeispielData();

function context(files: Record<string, string>, ledger?: LedgerLine[], config = CONFIG) {
  const data = structuredClone(BEISPIEL);
  if (ledger) data.ledger[BSP] = ledger;
  const fake = new FakeSource(data);
  const ctx = createTestContext({ files: { 'apaleo-bmd.config.yaml': config, ...files }, sourceFactory: () => fake });
  return { ctx, fake };
}

describe('apaleo-bmd mapping check (offline)', () => {
  it('prints a summary of rows by type and exits 0 for a valid mapping', async () => {
    const { ctx, fake } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain(`Mapping file: ${join(ctx.cwd, 'mapping-BSP.csv')} (6 rows, Sachkontenlänge 4, Personenkontenlänge 6, bmd.dialect ntcs)`);
    expect(ctx.out()).toMatch(/type\s+rows\s+mapped\s+unmapped/);
    expect(ctx.out()).toMatch(/Revenues\s+1\s+1\s+0/);
    expect(ctx.out()).toMatch(/Payments\s+2\s+2\s+0/);
    expect(ctx.out()).toMatch(/CityTaxes\s+1\s+0\s+1/);
    expect(ctx.out()).toContain('Result: mapping OK.');
    expect(fake.calls).toEqual([]);
  });

  it('uses --mapping and the only configured property by default', async () => {
    const { ctx } = context({ 'maps/hotel.csv': VALID }, undefined, `${CONFIG}properties:\n  - id: BSP\n    mapping: maps/hotel.csv\n`);
    expect(await runCli(['mapping', 'check'], ctx)).toBe(0);
    expect(ctx.out()).toContain(join(ctx.cwd, 'maps/hotel.csv'));
    const other = context({ 'other.csv': VALID });
    expect(await runCli(['mapping', 'check', '--mapping', 'other.csv'], other.ctx)).toBe(0);
  });

  it('reports E-STEUERCODE-INPUT-TAX for the NTCS Vorsteuer code 2 on a revenue row and exits 1', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv(`${ACC10};Revenues;Revenues Accommodation (10%);10;4000;2;10;;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-STEUERCODE-INPUT-TAX');
    expect(ctx.out()).toContain('line 2: Steuercode 2 means Vorsteuer in BMD NTCS');
    expect(ctx.out()).toContain('Result: 1 error, 0 warnings.');
  });

  it('reports E-STEUERCODE-INPUT-TAX for the BMD 5.5 code 3 on a deposit row in NTCS, where 3 is the Vorsteuer-Berichtigung, and exits 1', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('*;Liabilities;;10;3200;3;10;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-STEUERCODE-INPUT-TAX');
    expect(ctx.out()).toContain('line 2: Steuercode 3 means Vorsteuer-Berichtigung in BMD NTCS, but apaleo type Liabilities');
    expect(ctx.out()).toContain('Result: 1 error, 0 warnings.');
  });

  it('passes a deposit row at 10 % with Steuercode 1 in NTCS', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('*;Liabilities;;10;3200;1;10;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('Result: mapping OK.');
  });

  it('accepts the BMD 5.5 Soll-USt code 3 with bmd.dialect bmd55', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv(`${ACC10};Revenues;Revenues Accommodation (10%);10;4000;3;10;;`) }, undefined, withBmd('  dialect: bmd55\n'));
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('bmd.dialect bmd55');
    expect(ctx.out()).toContain('Result: mapping OK.');
  });

  it('reports E-ACCOUNT-LENGTH for 2890 at Sachkontenlänge 5', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1102;Payments;Visa;;2890;;;;') }, undefined, withBmd('  sachkontenlaenge: 5\n'));
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-ACCOUNT-LENGTH');
    expect(ctx.out()).toContain('for example 28900');
    expect(ctx.out()).not.toContain('02890');
  });

  it('reports a VAT mismatch with both rates', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv(`${ACC10};Revenues;Revenues Accommodation (10%);10;4020;1;20;;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toMatch(/E-VAT-MISMATCH .*VAT 10 %.*books 20 %/);
  });

  it('warns about untaxed revenue, an unusual rate and a Kostenstelle on a payment, and still passes', async () => {
    const { ctx } = context({
      'mapping-BSP.csv': csv('RevenueAccommodation_Without:0.00;Revenues;No VAT;0;4090;;0;;', 'R7;Revenues;German;7;4000;1;7;;', '1102;Payments;Visa;;2890;;;10;'),
    });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('W-UNTAXED-REVENUE');
    expect(ctx.out()).toContain('W-VAT-RATE-UNUSUAL');
    expect(ctx.out()).toContain('W-KOST-IGNORED');
    expect(ctx.out()).toContain('Result: mapping OK (3 warnings).');
  });

  it('prints the W-PADDED warning for leading zeros Excel removed and still passes', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('9000;House;House;;650;;;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('W-PADDED');
    expect(ctx.out()).toContain('Result: mapping OK (1 warning).');
  });

  it('fails with exit 1 on duplicate keys, naming both lines', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('R10;Revenues;A;10;4000;1;10;;', 'R10;Revenues;A;10;4001;1;10;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('lines 2 and 3 both map apaleo account R10 of type Revenues');
  });

  it('fails with exit 1 and a hint when the mapping file is missing', async () => {
    const { ctx } = context({});
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('No mapping file at');
    expect(ctx.err()).toContain('init-mapping --property <id> --template ekr');
  });

  it('refuses a DATEV mapping and names init-mapping --template ekr', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n5011;Revenues;A;7;8300;;7;;;\r\n';
    const { ctx } = context({ 'old.csv': datev });
    expect(await runCli(['mapping', 'check', '--mapping', 'old.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a DATEV mapping');
    expect(ctx.err()).toContain('init-mapping --property <id> --template ekr');
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});

describe('apaleo-bmd mapping check --from --to', () => {
  it('fails with E-UNMAPPED for a new revenue account 5010, naming type, name, line count and gross total', async () => {
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const ledger = [
      ledgerLine({ credit, grossCents: 4000 }),
      ledgerLine({ credit, grossCents: 6000, businessDate: '2026-09-15', sourceEntryNumber: 'BSPE0002' }),
    ];
    const { ctx, fake } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;2390;;;;') }, ledger);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-15'], ctx)).toBe(1);
    expect(fake.calls).toContain(`getLedger ${BSP} 2026-09-14 2026-09-16`);
    expect(ctx.out()).toContain('Checked 2 ledger lines of BSP from 2026-09-14 to 2026-09-15: 1 unmapped account(s).');
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 100.00)');
  });

  it('reports the empty Ortstaxe row of a fresh init-mapping file as E-UNMAPPED until it is filled in, then passes', async () => {
    const { ctx } = context({});
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'ekr'], ctx)).toBe(0);
    const period = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    expect(await runCli(period, ctx)).toBe(1);
    const unmapped = ctx.out().split('\n').filter((line) => line.startsWith('E-UNMAPPED'));
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain('apaleo account 3501 (CityTaxes, "City Tax (no VAT)")');

    const path = join(ctx.cwd, 'mapping-BSP.csv');
    const text = (await ctx.fs.readFile(path, 'utf8')).replace(/^3501;CityTaxes;City Tax \(no VAT\);0;;/m, '3501;CityTaxes;City Tax (no VAT);0;3580;');
    const after = createTestContext({ files: { 'apaleo-bmd.config.yaml': CONFIG, 'mapping-BSP.csv': text }, sourceFactory: () => new FakeSource(BEISPIEL) });
    expect(await runCli(period, after)).toBe(0);
    expect(after.out()).not.toMatch(/^E-/m);
    expect(after.out()).toContain('every booked account is mapped.');
    expect(after.out()).toContain('Result: mapping OK');
  });

  it('fails with E-VAT-MISMATCH when only the parent row 5000 maps revenue, at 20 %, and the period books 10 %', async () => {
    const parent = csv('5000;Revenues;Revenues;;4030;1;20;;', '*;Receivables;;;2390;;;;', '*;Payments;;;2890;;;;');
    const ledger = BEISPIEL.ledger[BSP]?.filter((line) => line.credit.type === 'Revenues' && line.debit.type === 'Receivables') ?? [];
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    const { ctx } = context({ 'mapping-BSP.csv': parent }, ledger);
    expect(await runCli(args, ctx)).toBe(1);
    const mismatches = ctx.out().split('\n').filter((line) => line.startsWith('E-VAT-MISMATCH'));
    expect(mismatches.some((line) => line.includes(`apaleo account ${ACC10} (Revenues`) && line.includes('books 20 % on BMD account 4030'))).toBe(true);
    expect(mismatches.some((line) => line.includes('apaleo account RevenueFoodAndBeverages_VeryReduced:10.00 (Revenues'))).toBe(true);
    expect(mismatches.some((line) => line.includes('RevenueFoodAndBeverages_Normal:20.00'))).toBe(false);
    expect(ctx.out()).toContain('account(s) with the wrong VAT rate');
    expect(ctx.out()).not.toContain('Result: mapping OK');
  });

  it('resolves an untaxed deposit release through the inferred 10 % wildcard, never through the 0 % one', async () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const receivables = { number: 'BSP-X-1_Receivables', name: 'Receivables', type: 'Receivables' };
    const release = ledgerLine({ debit: liabilities, credit: receivables, taxes: [], command: 'System', reference: 'BSP-X-1' });
    const pair = ledgerLine({
      debit: { number: 'LiabilitiesVat_VeryReduced:10.00', name: 'LiabilitiesVat Very Reduced (10%)', type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: 1_000,
      taxes: [tax('VeryReduced', 10, 1_000)],
      reference: 'BSP-X-1',
    });
    const mapping = (...rows: string[]) => csv('*;Receivables;;;2390;;;;', '*;Liabilities;;10;3200;1;10;;', '*;Liabilities;;20;3201;1;20;;', ...rows);
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'];

    const paired = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;3209;;0;;') }, [release, pair]);
    expect(await runCli(args, paired.ctx)).toBe(0);
    expect(paired.ctx.out()).toContain('every booked account is mapped.');

    const unknown = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;3209;;0;;') }, [release]);
    expect(await runCli(args, unknown.ctx)).toBe(1);
    expect(unknown.ctx.out()).toMatch(/E-VAT-RATE-UNKNOWN .*1 deposit release .*account BSP-X-1_Liabilities/);
    expect(unknown.ctx.out()).toContain('deposit releases without a known VAT rate');
    expect(unknown.ctx.out()).not.toContain('3209');
    expect(unknown.ctx.out()).not.toContain('wildcard row (*) for Liabilities at 0 %');
  });

  it('asks for a 20 % deposit row when an untaxed release is inferred at 20 % and the mapping has none', async () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const release = ledgerLine({ debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, grossCents: 12_000, taxes: [], reference: 'BSP-X-1' });
    const pair = ledgerLine({
      debit: { number: 'LiabilitiesVat_Normal:20.00', name: 'LiabilitiesVat Normal (20%)', type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: 2_000,
      taxes: [tax('Normal', 20, 2_000)],
      reference: 'BSP-X-1',
    });
    const { ctx } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;2390;;;;', '*;Liabilities;;10;3200;1;10;;') }, [release, pair]);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('`*;Liabilities;;20;<BMD account>;1;20` (template: 3201)');
  });
});

describe('apaleo-bmd mapping usage', () => {
  it.each([
    [['mapping'], 'Usage: apaleo-bmd mapping check'],
    [['mapping', 'lint'], 'Usage: apaleo-bmd mapping check'],
    [['mapping', 'check', '--from', '2026-09-01'], '--from and --to go together'],
    [['mapping', 'check', '--from', '2026-09-31', '--to', '2026-10-01'], '--from must be a date'],
    [['mapping', 'check', '--from', '2026-09-02', '--to', '2026-09-01'], 'lies before'],
    [['mapping', 'check'], 'Name the mapping with --mapping'],
    [['mapping', 'check', '--mapping', 'x.csv', '--from', '2026-09-01', '--to', '2026-09-02'], 'needs --property'],
  ])('exits 2 on %j', async (argv, message) => {
    const { ctx } = context({});
    expect(await runCli(argv, ctx)).toBe(2);
    expect(ctx.err()).toContain(message);
  });
});
