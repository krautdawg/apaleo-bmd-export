import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { runExport, type ExportRequest } from '../../src/export/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { ApaleoPermissionError } from '../../src/sources/apaleo/index.js';
import { DIALECTS } from '../../src/bmd/index.js';
import { AT_MONTH, FIXTURE_FILES, BSP, loadAtMonthData } from '../helpers/apaleo.js';
import { createTestContext } from '../helpers/context.js';
import { addSecondProperty, exportConfig, exportSetup, type ExportSetup } from '../helpers/export.js';
import { FakeSource } from '../helpers/fake-source.js';
import { describeDifference } from '../helpers/golden.js';

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}, post?: typeof buildBookings) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-bmd.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  return runExport(full, { loaded, source: fake, ctx, ...(post ? { post } : {}) });
}

const exportsOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports');
const fileLines = (path: string) => new TextDecoder('windows-1252').decode(readFileSync(path)).split('\r\n');
const FILE = 'BMD_Buchungsimport_20260901-20260930_BSP.csv';
const withBmd = (config: string, lines: string) => config.replace('  buchsymbol: HO\n', `  buchsymbol: HO\n${lines}`);

describe('the period-part runner', () => {
  it('fetches the chart once per property and the ledger once per month through the source', async () => {
    const setup = exportSetup();
    const outcomes = await run(setup, { period: { from: '2026-08-25', to: '2026-09-30' } });
    expect(outcomes.map((o) => [o.part.month, o.status])).toEqual([
      ['2026-08', 'empty'],
      ['2026-09', 'written'],
    ]);
    expect(setup.fake.calls).toEqual([
      'listProperties',
      'getChartOfAccounts BSP',
      'getLedger BSP 2026-08-25 2026-09-01',
      'getLedger BSP 2026-09-01 2026-10-01',
    ]);
    expect(outcomes[0]?.findings.map((f) => f.code)).toEqual(['N-NO-BOOKINGS']);
  });

  it('renders the bookings through the BMD writer with the settings of the bmd section', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('written');
    expect(outcome?.bookings).toBe(24);
    const path = join(exportsOf(setup), BSP, '2026-09', FILE);
    expect(outcome?.path).toBe(path);
    const lines = fileLines(path);
    expect(lines[0]).toBe('satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz');
    expect(lines).toHaveLength(1 + 24 + 1);
    expect(lines[1]).toBe('0;3200;2890;090100001;14.09.2026;14.09.2026;HO;2;10;1;-200,00;-20,00;Anzahlung 10 %;;PSP-8823410001;E;A');
    expect(lines.join('\n')).not.toContain('Müller');
  });

  it('writes the BMD 5.5 dialect when bmd.dialect is bmd55', async () => {
    const setup = exportSetup({ config: withBmd(exportConfig(), '  dialect: bmd55\n') });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('written');
    const lines = fileLines(join(exportsOf(setup), BSP, '2026-09', FILE));
    expect(lines[0]).toBe('satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz');
    expect(lines[1]?.split(';').slice(4, 6)).toEqual(['20260914', '20260914']);
  });

  it('puts payment lines under bmd.buchsymbolZahlung and every other line under bmd.buchsymbol', async () => {
    const setup = exportSetup({ config: withBmd(exportConfig(), '  buchsymbolZahlung: HZ\n') });
    await run(setup);
    const rows = fileLines(join(exportsOf(setup), BSP, '2026-09', FILE)).slice(1, -1).map((line) => line.split(';'));
    const symbolOf = (text: string) => [...new Set(rows.filter((row) => row[12]?.startsWith(text)).map((row) => row[6]))];
    expect(symbolOf('Zahlung')).toEqual(['HZ']);
    expect(symbolOf('Erlös')).toEqual(['HO']);
    // A prepayment has a VAT side, so it keeps the main symbol.
    expect(symbolOf('Anzahlung')).toEqual(['HO']);
  });

  it('gives each property its own Buchungssymbol and warns W-BUCHSYMBOL-SHARED only when two share one', async () => {
    const own = exportSetup({ config: exportConfig('  - id: BS2', '    buchsymbol: HO2'), files: { 'mapping-BS2.csv': readMapping() }, data: (data) => addSecondProperty(data, 'BS2') });
    const outcomes = await run(own, { propertyIds: [BSP, 'BS2'] });
    expect(outcomes.map((o) => [o.propertyId, o.status, o.findings.map((f) => f.code)])).toEqual([
      [BSP, 'written', []],
      ['BS2', 'written', []],
    ]);
    const symbols = (id: string) => new Set(fileLines(join(exportsOf(own), id, '2026-09', `BMD_Buchungsimport_20260901-20260930_${id}.csv`)).slice(1, -1).map((line) => line.split(';')[6]));
    expect(symbols(BSP)).toEqual(new Set(['HO']));
    expect(symbols('BS2')).toEqual(new Set(['HO2']));

    const shared = exportSetup({ config: exportConfig('  - id: BS2'), files: { 'mapping-BS2.csv': readMapping() }, data: (data) => addSecondProperty(data, 'BS2') });
    const both = await run(shared, { propertyIds: [BSP, 'BS2'] });
    expect(both.map((o) => [o.status, o.findings.map((f) => f.code)])).toEqual([
      ['written', ['W-BUCHSYMBOL-SHARED']],
      ['written', ['W-BUCHSYMBOL-SHARED']],
    ]);
    expect(both[0]?.summary).toContain('W-BUCHSYMBOL-SHARED');
    expect(readFileSync(join(exportsOf(shared), BSP, '2026-09', 'BMD_Buchungsimport_20260901-20260930_BSP.protokoll.txt'), 'utf8')).toContain(
      'the properties BSP, BS2 all book under the Buchungssymbol HO',
    );
  });

  it('stops a part on an E- finding of the coverage check or the posting rules, before writing', async () => {
    const unmapped = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, '') } });
    const [first] = await run(unmapped);
    expect(first?.status).toBe('failed');
    expect(first?.findings.filter((f) => f.code.startsWith('E-')).map((f) => [f.code, f.value])).toEqual([['E-UNMAPPED', 'RevenueFoodAndBeverages_Normal:20.00']]);
    expect(existsSync(exportsOf(unmapped))).toBe(false);

    const wrongRate = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace('(10%);10;4000;1;10;', '(10%);10;4030;1;20;') } });
    const [second] = await run(wrongRate);
    expect(second?.status).toBe('failed');
    expect(new Set(second?.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code))).toEqual(new Set(['E-VAT-RATE']));
    expect(existsSync(exportsOf(wrongRate))).toBe(false);
  });

  it('isolates property-months: an unmapped account blocks only its property', async () => {
    const setup = exportSetup({
      config: exportConfig('  - id: BSP2', '    buchsymbol: HO2'),
      files: { 'mapping-BSP.csv': readMapping().replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, ''), 'mapping-BSP2.csv': readMapping() },
      data: addSecondProperty,
    });
    const outcomes = await run(setup, { propertyIds: [BSP, 'BSP2'] });
    expect(outcomes.map((o) => [o.propertyId, o.status])).toEqual([
      [BSP, 'failed'],
      ['BSP2', 'written'],
    ]);
    expect(readdirSync(exportsOf(setup))).toEqual(['BSP2']);
  });

  it('reports a property the custom app cannot see and a missing mapping file per property', async () => {
    const setup = exportSetup({ config: exportConfig('  - id: HBW', '    buchsymbol: HBW', '  - id: NOPE', '    buchsymbol: NO') });
    const outcomes = await run(setup, { propertyIds: [BSP, 'HBW', 'NOPE'] });
    expect(outcomes.map((o) => [o.propertyId, o.status, o.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code)])).toEqual([
      [BSP, 'written', []],
      ['HBW', 'failed', ['E-EXPORT']],
      ['NOPE', 'failed', ['E-PROPERTY-UNKNOWN']],
    ]);
    expect(outcomes[1]?.findings[0]?.message).toContain('No mapping file at');
    expect(outcomes[1]?.findings[0]?.message).toContain('init-mapping --property <id> --template ekr');
  });

  it('refuses a DATEV mapping file and names init-mapping --template ekr', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n';
    const setup = exportSetup({ files: { 'mapping-BSP.csv': datev } });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => f.code)).toEqual(['E-EXPORT']);
    expect(outcome?.findings[0]?.message).toContain('this is a DATEV mapping');
    expect(outcome?.findings[0]?.message).toContain('--template ekr');
  });

  it('refuses a property that does not keep its books in EUR, before reading its ledger', async () => {
    const setup = exportSetup({
      data: (data) => {
        for (const property of data.properties) property.currency = 'CHF';
      },
    });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'CHF']]);
    expect(outcome?.findings[0]?.message).toContain('writes BMD files in EUR only');
    expect(outcome?.findings[0]?.message).toContain("A BMD Buchungsimport line has no currency field: BMD books every amount in the Mandant's Grundwährung (EUR)");
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('refuses a month with a ledger line in another currency than EUR', async () => {
    const setup = exportSetup({
      data: (data) => {
        const [line] = data.ledger[BSP] ?? [];
        if (line) line.currency = 'USD';
      },
    });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'USD']]);
    expect(outcome?.findings[0]?.message).toContain('1 apaleo line(s) of BSP are in USD');
    expect(outcome?.findings[0]?.message).toContain('has no currency field');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('writes nothing in a dry run but reports what a real run would do', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup, { dryRun: true });
    expect(outcome?.status).toBe('checked');
    expect(outcome?.plan).toBe('write');
    expect(outcome?.summary).toContain('Totals per BMD account');
    expect(readdirSync(setup.ctx.cwd).sort()).toEqual(['apaleo-bmd.config.yaml', 'mapping-BSP.csv']);
  });
});

describe('plausibility checks in the pipeline', () => {
  it('blocks the file when a defect writes a positive Betrag where the apaleo line credits the Konto account', async () => {
    const setup = exportSetup();
    const sideBug: typeof buildBookings = (...args) => {
      const result = buildBookings(...args);
      // The 98.00 logis charge: Betrag -89.09 and Steuer -8.91 on 4000 written as Soll.
      const booking = result.bookings[1];
      if (booking?.tax) {
        booking.betragCents = -booking.betragCents;
        booking.tax.steuerCents = -booking.tax.steuerCents;
      }
      return result;
    };
    const [outcome] = await run(setup, {}, sideBug);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings[0]?.code).toBe('E-ACCOUNT-BALANCE');
    expect(outcome?.findings[0]?.message).toMatch(/^on 2026-09-14 BMD account \d+ moves -?\d+\.\d\d in the bookings, but the apaleo lines mapped to it move .* \(Soll positive, Haben negative\)/);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('blocks the file when a defect drops a line', async () => {
    const setup = exportSetup();
    const dropBug: typeof buildBookings = (...args) => {
      const result = buildBookings(...args);
      return { ...result, bookings: result.bookings.slice(1) };
    };
    const [outcome] = await run(setup, {}, dropBug);
    expect(outcome?.findings.map((f) => f.code)).toContain('E-CONSERVATION');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('sends no aggregate request unless checks.aggregates is true', async () => {
    const setup = exportSetup();
    await run(setup);
    expect(setup.fake.calls.filter((call) => call.startsWith('getAccountTotals'))).toEqual([]);
  });

  it('with checks.aggregates, warns about a difference and still writes the file', async () => {
    const setup = exportSetup({
      config: `${exportConfig()}checks:\n  aggregates: true\n`,
      data: (data) => {
        const day = data.totals?.[BSP]?.find((t) => t.businessDate === '2026-09-15');
        const revenue = day?.accounts.find((a) => a.account.number === 'RevenueAccommodation_VeryReduced:10.00');
        if (revenue) revenue.balance.value = '-1.00';
      },
    });
    const [outcome] = await run(setup);
    expect(setup.fake.calls.filter((call) => call.startsWith('getAccountTotals'))).toHaveLength(30);
    expect(outcome?.status).toBe('written');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['W-AGGREGATE-DIFF', 'RevenueAccommodation_VeryReduced:10.00']]);
    expect(outcome?.findings[0]?.message).toContain("on 2026-09-15 apaleo's daily aggregate for account RevenueAccommodation_VeryReduced:10.00 (Revenues) has the balance -1.00");
  });

  it('with checks.aggregates, blocks the part with a hint when apaleo refuses the aggregates', async () => {
    const setup = exportSetup({ config: `${exportConfig()}checks:\n  aggregates: true\n` });
    setup.fake.getAccountTotals = async () => {
      throw new ApaleoPermissionError('the daily aggregates');
    };
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings[0]?.code).toBe('E-AGGREGATE-CHECK');
    expect(outcome?.findings[0]?.message).toContain('core.subledger_aggregate.create, or set checks.aggregates: false');
  });
});

describe('the Austrian fixture month through the export pipeline (b05)', () => {
  /** After an intended change to the output, run `UPDATE_GOLDEN=1 pnpm test` and review the diff. */
  const GOLDEN = new URL('../golden/bmd/at-month.csv', import.meta.url);
  const MAPPING = readFileSync(new URL('../fixtures/mapping/ekr-at-month.csv', import.meta.url), 'utf8');
  const CONFIG = `${FIXTURE_FILES['apaleo-bmd.config.yaml']}properties:\n  - id: ${AT_MONTH}\n    buchsymbol: AR\n`;

  it('writes the golden BMD file with no E- finding and the plausibility checks passing', async () => {
    const fake = new FakeSource(await loadAtMonthData());
    const ctx = createTestContext({ files: { 'apaleo-bmd.config.yaml': CONFIG, [`mapping-${AT_MONTH}.csv`]: MAPPING }, sourceFactory: () => fake });
    const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-bmd.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
    const request: ExportRequest = { period: { from: '2026-08-01', to: '2026-08-31' }, propertyIds: [AT_MONTH], dryRun: false, overwrite: false };
    const [outcome] = await runExport(request, { loaded, source: fake, ctx });
    expect(outcome?.status).toBe('written');
    expect(outcome?.bookings).toBe(22);
    expect(outcome?.findings.filter((f) => f.code.startsWith('E-'))).toEqual([]);
    expect(outcome?.summary).toContain('Written-off receivables (Forderungsverluste) and the VAT correction per rate:\n  10 %: net 50.00, tax 5.00, gross 55.00');
    expect(outcome?.summary).toContain('Deposits: received 330.00, released 330.00, of it refunded 110.00');

    const file = readFileSync(join(ctx.cwd, 'exports', AT_MONTH, '2026-08', `BMD_Buchungsimport_20260801-20260831_${AT_MONTH}.csv`));
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, file);
    const difference = describeDifference(readFileSync(GOLDEN), file, (_line, index) => DIALECTS.ntcs.header[index] ?? '?');
    expect(difference, `at-month.csv differs from the golden file:\n${difference}`).toBeUndefined();
  });
});

function readMapping(): string {
  return readFileSync(new URL('../fixtures/mapping/ekr-beispiel.csv', import.meta.url), 'utf8');
}
