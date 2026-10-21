import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { FIXTURE_FILES, createApaleoContext } from '../helpers/apaleo.js';
import { VIE_MAPPING, VIE_NO_SHOW, VIE_TEMPLATE_MAPPING } from '../helpers/live-mapping.js';

/**
 * The CLI on the recorded apaleo sandbox responses (`test/fixtures/apaleo/live/`)
 * through the fake apaleo API (design decision 13): VIE is the regression day of
 * the BMD target, with the mapping `init-mapping --template ekr` writes and the
 * Kanzlei's one decision (the no-show at 13 %, `VIE_MAPPING`); BER, a
 * German property, shows that the EKR template maps none of its 7 % and 19 % accounts.
 */

const decodeCp1252 = (bytes: Uint8Array) => new TextDecoder('windows-1252').decode(bytes);

/** After the recorded days, so both are closed. */
const AFTER_THE_DAY = new Date('2026-10-25T08:00:00Z');
function liveContext(extraConfig = '', files: Record<string, string> = {}) {
  const config = `${FIXTURE_FILES['apaleo-bmd.config.yaml']}properties:\n  - id: VIE\n  - id: BER\n    buchsymbol: HB\n${extraConfig}`;
  return createApaleoContext({ live: true }, { files: { 'apaleo-bmd.config.yaml': config, 'mapping-VIE.csv': VIE_MAPPING, ...files }, now: AFTER_THE_DAY });
}

describe('init-mapping and mapping check on the recorded VIE day', () => {
  it('init-mapping --template ekr writes the committed live mapping byte for byte', async () => {
    const ctx = liveContext();
    expect(await runCli(['init-mapping', '--property', 'VIE', '--template', 'ekr', '--out', 'fresh.csv'], ctx)).toBe(0);
    expect(readFileSync(join(ctx.cwd, 'fresh.csv'), 'utf8')).toBe(VIE_TEMPLATE_MAPPING);
  });

  it('stops mapping check --from --to on the template mapping with E-UNMAPPED for the no-show at 13 %', async () => {
    const ctx = liveContext('', { 'mapping-VIE.csv': VIE_TEMPLATE_MAPPING });
    expect(await runCli(['mapping', 'check', '--property', 'VIE', '--from', '2026-10-21', '--to', '2026-10-21'], ctx)).toBe(1);
    const unmapped = ctx.out().split('\n').filter((line) => line.includes('E-UNMAPPED'));
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain(`apaleo account ${VIE_NO_SHOW} (Revenues`);
  });

  it('passes mapping check --from --to once the Kanzlei filled in the no-show row', async () => {
    const ctx = liveContext();
    expect(await runCli(['mapping', 'check', '--property', 'VIE', '--from', '2026-10-21', '--to', '2026-10-21'], ctx)).toBe(0);
    expect(ctx.out()).not.toMatch(/sub-cent|not a whole number of cents/);
    expect(ctx.out()).toContain('every booked account is mapped');
    expect(ctx.out()).toContain('Result: mapping OK');
  });
});

describe('export of the recorded VIE day 2026-10-21 (full pipeline, BMD target, aggregate check on)', () => {
  const FILE = 'BMD_Buchungsimport_20261021-20261021_VIE.csv';
  const PROTOCOL = FILE.replace('.csv', '.protokoll.txt');

  async function exportVie() {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    const code = await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'VIE'], ctx);
    const folder = join(ctx.cwd, 'exports', 'VIE', '2026-10');
    return { ctx, code, folder, protocol: () => readFileSync(join(folder, PROTOCOL), 'utf8') };
  }

  it('writes one file with exactly one W-VAT-ROUNDING, no E- finding and no W-AGGREGATE-DIFF: 35 lines, 29 bookings, 6 skipped', async () => {
    const { ctx, code, folder, protocol } = await exportVie();
    expect(ctx.err()).toBe('');
    expect(code).toBe(0);
    expect(ctx.out()).not.toMatch(/\bE-[A-Z]|W-AGGREGATE-DIFF/);
    expect(ctx.out().match(/W-VAT-ROUNDING/g)).toHaveLength(1);
    expect(ctx.out()).toContain('apaleo entry 000000031');
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json']);
    expect(protocol()).toContain('Property VIE, 2026-10-21 to 2026-10-21: 35 apaleo lines, 29 BMD bookings');
    expect(protocol()).toMatch(/both sides on the same BMD account\s+6\s+312\.60/);
    const text = decodeCp1252(readFileSync(join(folder, FILE)));
    expect(text.split('\r\n')).toHaveLength(1 + 29 + 1);
  });

  it('shows the tax of the bookings beside apaleo precise VAT, with the line rounding and no E-VAT-TOTAL', async () => {
    const { protocol } = await exportVie();
    const text = protocol();
    expect(text).toContain('10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
    expect(text).toContain('13 %: net 362.85, tax 47.17, gross 410.02, apaleo VAT 47.17, difference 0.00 (apaleo precise 47.17044248)');
    expect(text).toContain('20 %: net 39.49, tax 7.89, gross 47.38, apaleo VAT 7.90, difference 0.01 (apaleo precise 7.89666666)');
    expect(text).toContain('0 %: net 45.00, tax 0.00, gross 45.00, apaleo VAT 0.00, difference 0.00');
    expect(text).toContain('13 %: net 155.77, tax 20.25, gross 176.02, apaleo VAT 20.25, difference 0.00 (apaleo precise 20.2500885)');
    expect(text).toContain('20 %: net 16.65, tax 3.33, gross 19.98, apaleo VAT 3.33, difference 0.00 (apaleo precise 3.33)');
    expect(text).toContain('Deposits: received 491.00, released 295.00, of it refunded 10.00');
    expect(text).toContain('Accounts receivable (Sammeldebitor, Soll positive): 95.00');
    expect(text).toMatch(/^ {2}2700 +111\.70$/m);
    expect(text).toMatch(/^ {2}2890 +576\.90$/m);
    expect(text).toContain('VAT rounding differences: 0.01');
    expect(text).not.toContain('E-VAT-TOTAL');
  });

  it('shows the VAT comparison and the import block in a dry run and writes nothing', async () => {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    expect(await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'VIE', '--dry-run'], ctx)).toBe(0);
    const out = ctx.out();
    expect(out).toContain('  10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
    expect(out).toContain(
      "Each booking carries apaleo's tax of its line, rounded to the cent, while apaleo rounds only the precise total of its lines, " +
        'so a difference (apaleo VAT minus tax) of a few cents is this rounding, not an error.',
    );
    expect(out).toContain(`  File: ${FILE}\n  Lines: 29 bookings (Satzart 0) after the header line\n`);
    expect(out).toContain('  Belegnummern: 102100001 to 102100029\n');
    expect(out).toMatch(/ {2}Steuercodes: 1 \(10 %, 13 %, 20 %\)/);
    expect(out).toContain('Result: dry run, nothing written');
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });

  it('books the deposit release and the precise tax of the recorded lines as BMD expects them', async () => {
    const { folder } = await exportVie();
    const rows = decodeCp1252(readFileSync(join(folder, FILE))).split('\r\n').slice(1, -1);
    expect(rows).toContain('0;3202;2390;102100021;21.10.2026;21.10.2026;HO;1;13;1;92,92;12,08;Auflösung Anzahlung 13 %;;WXPBFNSN-1-V0;E;A');
    expect(rows).toContain('0;4040;2390;102100025;21.10.2026;21.10.2026;HO;2;13;1;-84,07;-10,93;Erlös Logis 13 %;;AHTJTGFK-1-V0;E;A');
    expect(rows).toContain('0;4010;2390;102100027;21.10.2026;21.10.2026;HO;2;10;1;-42,55;-4,25;Erlös Speisen und Getränke 10 %;;BON-VIE-1;E;A');
  });
});

describe('export of the recorded BER day (German rates) with the EKR template', () => {
  it('raises no parse or sub-cent error and stops with E-UNMAPPED for the 7 % and 19 % accounts', async () => {
    const ctx = liveContext();
    expect(await runCli(['init-mapping', '--property', 'BER', '--template', 'ekr'], ctx)).toBe(0);
    expect(await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'BER'], ctx)).toBe(1);
    const out = ctx.out();
    expect(out).not.toMatch(/sub-cent|not a whole number of cents|does not match its API description/);
    const unmapped = out.split('\n').filter((line) => line.includes('E-UNMAPPED'));
    for (const account of ['RevenueAccommodation_Reduced:7.00', 'RevenueFoodAndBeverages_Reduced:7.00', 'RevenueFoodAndBeverages_Normal:19.00', 'RevenueNoShow_Reduced:7.00']) {
      expect(unmapped.some((line) => line.includes(`apaleo account ${account} (Revenues`)), account).toBe(true);
    }
    expect(unmapped.some((line) => /Liabilities accounts of reservations or folios under parent 3000 at 7 %/.test(line))).toBe(true);
    expect(unmapped.some((line) => /Liabilities accounts? of reservations or folios under parent 3000 at 19 %/.test(line))).toBe(true);
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });
});
