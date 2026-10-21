import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { FindingsError } from '../../src/core/errors.js';
import { DEFAULT_TARGET, exportedFile, fileTag, runExport, type ExportRequest, type TargetWriter } from '../../src/export/index.js';
import type { PostedBooking } from '../../src/posting/index.js';
import { BSP } from '../helpers/apaleo.js';
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
    bytes: new TextEncoder().encode(bookings.map((b) => `${b.konto};${b.gegenkonto};${b.side};${b.amountCents}\n`).join('')),
    findings: [],
  }),
  sameContent: (existing, next) => Buffer.from(existing).equals(Buffer.from(next)),
  advice: {
    overlap: 'FAKE overlap advice',
    headerChange: 'FAKE header advice.',
    reimport: 'FAKE reimport advice.',
  },
};

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;
const FILE = 'FAKE_20260901-20260930_BSP.txt';
const PROTOCOL = 'FAKE_20260901-20260930_BSP.protokoll.txt';

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}, target = fakeTarget) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-bmd.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  const [outcome] = await runExport(full, { loaded, source: fake, ctx, target });
  if (!outcome) throw new Error('no outcome');
  return outcome;
}

const folderOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports', BSP, '2026-09');
const errorCodes = (outcome: { findings: { code: string }[] }) => outcome.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code);

describe('the export through a fake TargetWriter', () => {
  it('writes the file under the name of the target, with protocol and manifest, and no EXTF name', async () => {
    const setup = exportSetup();
    const outcome = await run(setup);
    expect(outcome.status).toBe('written');
    expect(outcome.path).toBe(join(folderOf(setup), FILE));
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json']);
    expect(readFileSync(join(folderOf(setup), FILE), 'utf8').split('\n')).toHaveLength(22 + 1);
    expect(readFileSync(join(folderOf(setup), PROTOCOL), 'utf8')).toMatch(/^FAKE protocol\. No warranty/);
    expect(JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8'))).toMatchObject({ files: [{ file: FILE, status: 'current', ...SEPTEMBER }] });
  });

  it('finds the existing file through the pattern of the target', async () => {
    const setup = exportSetup();
    await run(setup);
    const folder = folderOf(setup);
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, fakeTarget)).toBe(FILE);
    // The manifest records the FAKE file; another target must not take it for its own.
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, DEFAULT_TARGET)).toBeUndefined();
    await setup.ctx.fs.rm(join(folder, 'manifest.json'));
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, fakeTarget)).toBe(FILE);
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, DEFAULT_TARGET)).toBeUndefined();
  });

  it('leaves an unchanged file alone on a re-run', async () => {
    const setup = exportSetup();
    await run(setup);
    const outcome = await run(setup);
    expect(outcome.status).toBe('unchanged');
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json']);
  });

  it('refuses a period that overlaps another file of the target with E-PERIOD-OVERLAP', async () => {
    const setup = exportSetup();
    expect((await run(setup, { period: { from: '2026-09-01', to: '2026-09-15' } })).status).toBe('written');
    const outcome = await run(setup);
    expect(outcome.status).toBe('failed');
    expect(errorCodes(outcome)).toEqual(['E-PERIOD-OVERLAP']);
    expect(outcome.findings[0]?.message).toContain('FAKE_20260901-20260915_BSP.txt already covers some of the days');
    expect(outcome.findings[0]?.message).toMatch(/ FAKE overlap advice$/);
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
    expect(refused.findings[0]?.message).toContain('FAKE reimport advice. Then run again with --overwrite');
    expect(refused.findings[0]?.message).toMatch(/the old file is kept as <name>\.replaced-<timestamp>\.txt\.$/);
    expect(refused.findings[0]?.message).not.toMatch(/DATEV|datev\.|Festschreibung/);

    const replaced = await run(setup, { overwrite: true });
    expect(replaced.status).toBe('replaced');
    expect(readdirSync(folderOf(setup)).sort()).toEqual([
      PROTOCOL,
      'FAKE_20260901-20260930_BSP.replaced-20261020T080000Z.protokoll.txt',
      'FAKE_20260901-20260930_BSP.replaced-20261020T080000Z.txt',
      FILE,
      'manifest.json',
    ]);
    expect(readFileSync(join(folderOf(setup), FILE), 'utf8').split('\n')).toHaveLength(23 + 1);
  });

  it('reports the findings of a file the target refuses to render, and writes nothing', async () => {
    const setup = exportSetup();
    const refusing: TargetWriter<PostedBooking> = {
      ...fakeTarget,
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

describe('the target boundary in src/export', () => {
  const dir = fileURLToPath(new URL('../../src/export/', import.meta.url));
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);

  it.each(sources)('%s imports a target module only through its TargetWriter', (_name, text) => {
    const targetImports = [...text.matchAll(/from '\.\.\/datev\/([^']+)'/g)].map((match) => match[1]);
    expect(targetImports.every((module) => module === 'target.js')).toBe(true);
  });

  it('keeps target file names, formats and import advice out of the output folder logic', () => {
    const output = sources.find(([name]) => name === 'output.ts')?.[1] ?? '';
    expect(output).not.toMatch(/EXTF|Buchungsstapel|\.csv/);
    expect(output).not.toMatch(/DATEV|datev\.[a-z]|\bBMD\b|bmd\.[a-z]|Festschreibung/);
    expect(output).not.toContain('../datev');
  });
});
