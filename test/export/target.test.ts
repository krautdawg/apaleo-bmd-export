import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { FindingsError } from '../../src/core/errors.js';
import { DEFAULT_TARGET, exportedFile, fileTag, runExport, type ExportRequest, type TargetWriter } from '../../src/export/index.js';
import { BMD_DEFAULT_SETTINGS, createBmdTarget } from '../../src/bmd/index.js';
import type { PostedBooking } from '../../src/posting/index.js';
import { BSP, FIXTURE_FILES, createApaleoContext, createFixtureSource } from '../helpers/apaleo.js';
import { VIE_MAPPING } from '../helpers/live-mapping.js';
import { exportSetup, latePosting, type ExportSetup } from '../helpers/export.js';

/**
 * The output folder logic must work for any target, not only EXTF: a fake
 * target with its own file names and a comparison that ignores nothing.
 */
const fakeTarget: TargetWriter<PostedBooking> = {
  id: 'fake',
  protocolTitle: 'FAKE protocol',
  filePattern: /^FAKE_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.txt$/,
  fileName: ({ part, ...meta }) => `FAKE_${part.from.replaceAll('-', '')}-${part.to.replaceAll('-', '')}_${fileTag(meta)}.txt`,
  render: (bookings) => ({
    bytes: new TextEncoder().encode(bookings.map((b) => `${b.konto};${b.gkonto};${b.betragCents};${b.tax?.steuerCents ?? ''}\n`).join('')),
    findings: [],
  }),
  sameContent: (existing, next) => Buffer.from(existing).equals(Buffer.from(next)),
  importBlock: (bookings) => ['FAKE import:', `  ${bookings.length} lines`],
  advice: {
    overlap: 'FAKE overlap advice',
    reimport: 'FAKE reimport advice.',
  },
};

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

async function runWith(setup: ExportSetup, request: Partial<ExportRequest>, target: TargetWriter<PostedBooking>) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-bmd.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  const [outcome] = await runExport(full, { loaded, source: fake, ctx, target });
  if (!outcome) throw new Error('no outcome');
  return outcome;
}

const folderOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports', BSP, '2026-09');
const errorCodes = (outcome: { findings: { code: string }[] }) => outcome.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code);

/** The BMD writer behind the same contract, with the settings of the config's bmd section. */
const bmdContractTarget = createBmdTarget();

interface ContractCase {
  target: TargetWriter<PostedBooking>;
  /** The file name of property BSP for a period, as `YYYYMMDD`. */
  name: (from: string, to: string) => string;
  /** Lines before the first booking. */
  headerLines: number;
  protocolTitle: RegExp;
}

const CONTRACT_CASES: [string, ContractCase][] = [
  ['the fake target', { target: fakeTarget, name: (from, to) => `FAKE_${from}-${to}_BSP.txt`, headerLines: 0, protocolTitle: /^FAKE protocol\. No warranty/ }],
  ['the BMD target', { target: bmdContractTarget, name: (from, to) => `BMD_Buchungsimport_${from}-${to}_BSP.csv`, headerLines: 1, protocolTitle: /^apaleo-bmd export protocol\. No warranty/ }],
];

describe.each(CONTRACT_CASES)('the export through a TargetWriter: %s', (_label, { target, name, headerLines, protocolTitle }) => {
  const FILE = name('20260901', '20260930');
  const [stem = '', extension = ''] = FILE.split(/(?=\.[a-z]+$)/);
  const PROTOCOL = `${stem}.protokoll.txt`;
  const run = (setup: ExportSetup, request: Partial<ExportRequest> = {}, chosen = target) => runWith(setup, request, chosen);
  const fileLines = (setup: ExportSetup) => readFileSync(join(folderOf(setup), FILE), 'latin1').split('\n');

  it('writes the file under the name of the target, with protocol and manifest, and no EXTF name', async () => {
    const setup = exportSetup();
    const outcome = await run(setup);
    expect(outcome.status).toBe('written');
    expect(outcome.path).toBe(join(folderOf(setup), FILE));
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json'].sort());
    expect(fileLines(setup)).toHaveLength(headerLines + 24 + 1);
    expect(readFileSync(join(folderOf(setup), PROTOCOL), 'utf8')).toMatch(protocolTitle);
    expect(JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8'))).toMatchObject({ files: [{ file: FILE, status: 'current', ...SEPTEMBER }] });
  });

  it('finds the existing file through the pattern of the target', async () => {
    const setup = exportSetup();
    await run(setup);
    const folder = folderOf(setup);
    const other = target === fakeTarget ? DEFAULT_TARGET : fakeTarget;
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, target)).toBe(FILE);
    // The manifest records this target's file; another target must not take it for its own.
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, other)).toBeUndefined();
    await setup.ctx.fs.rm(join(folder, 'manifest.json'));
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, target)).toBe(FILE);
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, other)).toBeUndefined();
  });

  it('sees every file of the target even when its pattern has the g or y flag', async () => {
    for (const flags of ['g', 'y', 'gy']) {
      const stateful = { ...target, filePattern: new RegExp(target.filePattern.source, flags) };
      const setup = exportSetup();
      await run(setup, {}, stateful);
      const folder = folderOf(setup);
      for (let i = 0; i < 3; i++) expect(await exportedFile(setup.ctx, folder, SEPTEMBER, stateful)).toBe(FILE);
      // Sorted right after FILE: a pattern that kept its lastIndex would skip it.
      await setup.ctx.fs.writeFile(join(folder, name('20260915', '20260920')), '');
      const outcome = await run(setup, {}, stateful);
      expect(errorCodes(outcome)).toEqual(['E-PERIOD-OVERLAP']);
    }
  });

  it('leaves an unchanged file alone on a re-run', async () => {
    const setup = exportSetup();
    await run(setup);
    const outcome = await run(setup);
    expect(outcome.status).toBe('unchanged');
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json'].sort());
  });

  it('refuses a period that overlaps another file of the target with E-PERIOD-OVERLAP', async () => {
    const setup = exportSetup();
    expect((await run(setup, { period: { from: '2026-09-01', to: '2026-09-15' } })).status).toBe('written');
    const outcome = await run(setup);
    expect(outcome.status).toBe('failed');
    expect(errorCodes(outcome)).toEqual(['E-PERIOD-OVERLAP']);
    expect(outcome.findings[0]?.message).toContain(`${name('20260901', '20260915')} already covers some of the days`);
    expect(outcome.findings[0]?.message.endsWith(` ${target.advice.overlap}`)).toBe(true);
    expect(outcome.findings[0]?.message).not.toMatch(/DATEV|datev\./);
    expect(existsSync(join(folderOf(setup), FILE))).toBe(false);
  });

  it('refuses changed content with E-FILE-EXISTS, and --overwrite keeps the old file beside the new one', async () => {
    const setup = exportSetup();
    await run(setup);
    latePosting(setup.data);
    const refused = await run(setup);
    expect(refused.status).toBe('failed');
    expect(errorCodes(refused)).toEqual(['E-FILE-EXISTS']);
    expect(refused.findings[0]?.message).toContain(`${target.advice.reimport} Then run again with --overwrite`);
    expect(refused.findings[0]?.message).toMatch(new RegExp(`the old file is kept as <name>\\.replaced-<timestamp>\\${extension}\\.$`));
    expect(refused.findings[0]?.message).not.toMatch(/DATEV|datev\.|Festschreibung/);

    const replaced = await run(setup, { overwrite: true });
    expect(replaced.status).toBe('replaced');
    expect(readdirSync(folderOf(setup)).sort()).toEqual(
      [PROTOCOL, `${stem}.replaced-20261020T080000Z.protokoll.txt`, `${stem}.replaced-20261020T080000Z${extension}`, FILE, 'manifest.json'].sort(),
    );
    expect(fileLines(setup)).toHaveLength(headerLines + 25 + 1);
  });

  it('reports the findings of a file the target refuses to render, and writes nothing', async () => {
    const setup = exportSetup();
    const refusing: TargetWriter<PostedBooking> = {
      ...target,
      render: () => {
        throw new FindingsError('not written', [{ code: 'E-FAKE', message: 'the fake target refuses' }]);
      },
    };
    const outcome = await run(setup, {}, refusing);
    expect(outcome.status).toBe('failed');
    expect(errorCodes(outcome)).toEqual(['E-FAKE']);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });
});

describe('the BMD target through the export', () => {
  it('reports the BMD validation findings of a file it cannot write, and writes nothing', async () => {
    const setup = exportSetup();
    const outcome = await runWith(setup, {}, createBmdTarget(() => ({ ...BMD_DEFAULT_SETTINGS, sachkontenlaenge: 5 })));
    expect(outcome.status).toBe('failed');
    expect(new Set(errorCodes(outcome))).toEqual(new Set(['E-BMD-ACCOUNT']));
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });
});

describe('the checks and the summary do not depend on the target (recorded VIE day 2026-10-21)', () => {
  const MAPPING = VIE_MAPPING;
  const CONFIG = `${FIXTURE_FILES['apaleo-bmd.config.yaml']}properties:\n  - id: VIE\nchecks:\n  aggregates: true\n`;

  async function exportVie(target: TargetWriter<PostedBooking> | undefined) {
    const ctx = createApaleoContext(
      { live: true },
      { files: { 'apaleo-bmd.config.yaml': CONFIG, 'mapping-VIE.csv': MAPPING }, now: new Date('2026-10-25T08:00:00Z') },
    );
    const { source } = createFixtureSource({ live: true }, {}, ctx);
    const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-bmd.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
    const request: ExportRequest = { period: { from: '2026-10-21', to: '2026-10-21' }, propertyIds: ['VIE'], dryRun: false, overwrite: false };
    const [outcome] = await runExport(request, { loaded, source, ctx, ...(target ? { target } : {}) });
    if (!outcome) throw new Error('no outcome');
    return outcome;
  }

  it('gives the fake target the same summary and findings as the default target, without W-AGGREGATE-DIFF', async () => {
    const [standard, fake] = [await exportVie(undefined), await exportVie(fakeTarget)];
    expect(standard.status).toBe('written');
    expect(fake.status).toBe('written');
    expect(fake.path).toMatch(/FAKE_20261021-20261021_VIE\.txt$/);
    expect(fake.bookings).toBe(29);
    // Only the import block belongs to the target.
    const withoutImport = (summary: string) => summary.replace(/\n(FAKE import|Import into BMD)[^]*?\n\n/, '\n');
    expect(withoutImport(fake.summary)).toBe(withoutImport(standard.summary));
    expect(fake.summary).toContain('FAKE import:\n  29 lines\n');
    expect(standard.summary).toContain('  Lines: 29 bookings (Satzart 0) after the header line');
    expect(fake.findings).toEqual(standard.findings);
    expect(fake.findings.map((f) => f.code)).toEqual(['W-VAT-ROUNDING']);
    expect(fake.summary).toContain('Deposits: received 491.00, released 295.00, of it refunded 10.00');
  });
});

describe('the target boundary in src/export', () => {
  const dir = fileURLToPath(new URL('../../src/export/', import.meta.url));
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);

  it.each(sources)('%s imports a target module only through its TargetWriter', (_name, text) => {
    const targetImports = [...text.matchAll(/from '\.\.\/bmd\/([^']+)'/g)].map((match) => match[1]);
    expect(targetImports.every((module) => module === 'target.js')).toBe(true);
  });

  it('keeps target file names, formats and import advice out of the output folder logic', () => {
    const output = sources.find(([name]) => name === 'output.ts')?.[1] ?? '';
    expect(output).not.toMatch(/EXTF|Buchungsstapel|\.csv/);
    expect(output).not.toMatch(/DATEV|datev\.[a-z]|\bBMD\b|bmd\.[a-z]|Festschreibung/);
    expect(output).not.toContain('../bmd');
  });
});
