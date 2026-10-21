import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConfigNotFoundError,
  ENV_OVERRIDES,
  buchsymboleOf,
  loadConfig,
  resolveConfigPath,
  sharedBuchsymbolFindings,
  type Env,
} from '../../src/core/config.js';
import { UserError } from '../../src/core/errors.js';
import { runCli } from '../../src/cli/run.js';
import { EXIT_OK, type Command } from '../../src/cli/command.js';
import { createTestContext } from '../helpers/context.js';

const VALID = 'bmd:\n  buchsymbol: HO\n';
const BMD_DEFAULTS = { dialect: 'ntcs', sachkontenlaenge: 4, personenkontenlaenge: 6, buchsymbol: 'HO' };
const APALEO_DEFAULTS = { baseUrl: 'https://api.apaleo.com', identityUrl: 'https://identity.apaleo.com' };

async function load(content: string, env: Env = {}, fileName = 'apaleo-bmd.config.yaml') {
  const ctx = createTestContext({ files: { [fileName]: content }, env });
  return loadConfig({ path: join(ctx.cwd, fileName), env: ctx.env, readFile: ctx.fs.readFile });
}

async function loadError(content: string, env: Env = {}, fileName?: string): Promise<UserError> {
  const error = await load(content, env, fileName).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UserError);
  return error as UserError;
}

describe('config path resolution', () => {
  it('prefers --config, then APALEO_BMD_CONFIG, then the default file', () => {
    const env = { APALEO_BMD_CONFIG: 'from-env.yaml' };
    expect(resolveConfigPath('flag.yaml', env, '/work')).toBe(resolve('/work/flag.yaml'));
    expect(resolveConfigPath(undefined, env, '/work')).toBe(resolve('/work/from-env.yaml'));
    expect(resolveConfigPath(undefined, {}, '/work')).toBe(resolve('/work/apaleo-bmd.config.yaml'));
    expect(resolveConfigPath('/abs/c.json', env, '/work')).toBe('/abs/c.json');
  });
});

describe('loading', () => {
  it('loads YAML and fills defaults', async () => {
    const { config, secrets } = await load(VALID);
    expect(config).toEqual({
      apaleo: APALEO_DEFAULTS,
      output: { dir: './exports' },
      bmd: BMD_DEFAULTS,
      posting: { extbelegnr: 'receipt' },
      properties: [],
      checks: { aggregates: false },
      schedule: { timezone: 'Europe/Vienna', cadence: 'monthly', daily: { offsetDays: 2 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 40 },
    });
    expect(secrets.apaleoClientSecret).toBeUndefined();
  });

  it('reads the bmd section: dialect, account lengths and both Buchungssymbole', async () => {
    const { config } = await load('bmd:\n  dialect: bmd55\n  sachkontenlaenge: 5\n  personenkontenlaenge: 7\n  buchsymbol: HO\n  buchsymbolZahlung: HZ\n');
    expect(config.bmd).toEqual({ dialect: 'bmd55', sachkontenlaenge: 5, personenkontenlaenge: 7, buchsymbol: 'HO', buchsymbolZahlung: 'HZ' });
  });

  it('rejects an unknown dialect and account lengths outside their ranges', async () => {
    const error = await loadError(`${VALID}  dialect: bmd60\n  sachkontenlaenge: 3\n  personenkontenlaenge: 10\n`);
    expect(error.message).toContain('bmd.dialect: must be "ntcs" or "bmd55" (got "bmd60")');
    expect(error.message).toContain('bmd.sachkontenlaenge: must be a whole number between 4 and 9 (got 3)');
    expect(error.message).toContain('bmd.personenkontenlaenge: must be a whole number between 5 and 9 (got 10)');
  });

  it('requires bmd.buchsymbol and points to docs/bmd-import.md for creating it in BMD', async () => {
    const error = await loadError('bmd:\n  sachkontenlaenge: 4\n');
    expect(error.message).toContain('bmd.buchsymbol: is required');
    expect(error.message).toContain('docs/bmd-import.md');
    expect((await loadError('output:\n  dir: ./x\n')).message).toMatch(/bmd: is required: .*bmd\.buchsymbol.*docs\/bmd-import\.md/);
  });

  it('accepts 1 to 4 characters of A-Z and 0-9 as Buchungssymbol, at most 2 with bmd55', async () => {
    for (const symbol of ['H', 'HO', 'HO26']) expect((await load(`bmd:\n  buchsymbol: ${symbol}\n`)).config.bmd.buchsymbol).toBe(symbol);
    for (const symbol of ['ho', 'HOTEL', 'H-O', '""']) {
      expect((await loadError(`bmd:\n  buchsymbol: ${symbol}\n`)).message).toMatch(/bmd\.buchsymbol: (must be 1 to 4 characters of A-Z and 0-9|is required)/);
    }
    const error = await loadError('bmd:\n  dialect: bmd55\n  buchsymbol: PMS\n  buchsymbolZahlung: HZ\n');
    expect(error.message).toContain('bmd.buchsymbol: must have at most 2 characters with bmd.dialect bmd55');
    expect(error.message).not.toContain('bmd.buchsymbolZahlung');
  });

  it('rejects a datev section and names the bmd section', async () => {
    const error = await loadError('datev:\n  beraternummer: 1234567\n  mandantennummer: 42\n');
    expect(error.message).toContain('datev is not a section of apaleo-bmd');
    expect(error.message).toContain('bmd section');
    expect(error.message).toContain('bmd.buchsymbol');
  });

  it('reads a Buchungssymbol per property and checks.aggregates', async () => {
    const { config } = await load(`${VALID}properties:\n  - id: BSP\n    buchsymbol: HO2\n    buchsymbolZahlung: HZ2\nchecks:\n  aggregates: true\n`);
    expect(config.properties).toEqual([{ id: 'BSP', buchsymbol: 'HO2', buchsymbolZahlung: 'HZ2' }]);
    expect(config.checks).toEqual({ aggregates: true });
    const error = await loadError(`bmd:\n  dialect: bmd55\n  buchsymbol: HO\nproperties:\n  - id: BSP\n    buchsymbol: HO2X\n    mandantennummer: 43\nchecks:\n  aggregates: yes please\n`);
    expect(error.message).toContain('properties.0.mandantennummer: unknown key');
    expect(error.message).toContain('checks.aggregates: must be true or false');
  });

  it('reads posting.extbelegnr and rejects other values and the old belegfeld1', async () => {
    const { config } = await load(`${VALID}posting:\n  extbelegnr: reference\n`);
    expect(config.posting).toEqual({ extbelegnr: 'reference' });
    await expect(load(`${VALID}posting:\n  extbelegnr: invoice\n`)).rejects.toThrow(
      'posting.extbelegnr: must be "receipt" or "reference" (got "invoice")',
    );
    await expect(load(`${VALID}posting:\n  belegfeld1: receipt\n`)).rejects.toThrow('posting.belegfeld1: unknown key');
  });

  it('loads JSON by extension', async () => {
    const json = JSON.stringify({ bmd: { buchsymbol: 'HO', sachkontenlaenge: 6 } });
    const { config } = await load(json, {}, 'config.json');
    expect(config.bmd.sachkontenlaenge).toBe(6);
  });

  it('reads the client secret from the environment only', async () => {
    const { secrets } = await load(VALID, { APALEO_CLIENT_SECRET: 'abc' });
    expect(secrets.apaleoClientSecret).toBe('abc');
  });

  const example = readFileSync(new URL('../../apaleo-bmd.config.example.yaml', import.meta.url), 'utf8');

  it('accepts the example config, which names the Buchungssymbol HO with the note that it must exist in BMD', async () => {
    expect(example).toMatch(/BMD zuerst anlegen[\s\S]*buchsymbol: HO/);
    const { config } = await load(example, { APALEO_CLIENT_ID: 'client-1' });
    expect(config.output.dir).toBe('./exports');
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.bmd).toEqual(BMD_DEFAULTS);
    expect(config.posting).toEqual({ extbelegnr: 'receipt' });
    expect(config.checks).toEqual({ aggregates: false });
    expect(config.schedule).toEqual({ timezone: 'Europe/Vienna', cadence: 'monthly', daily: { offsetDays: 2 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 40 });
  });

  it('treats a section whose keys are all commented out as missing, with or without env overrides', async () => {
    const file = `apaleo:\n  # clientId: abc\noutput:\n  # dir: ./x\n${VALID}`;
    const { config } = await load(file);
    expect(config.apaleo).toEqual(APALEO_DEFAULTS);
    expect(config.output.dir).toBe('./exports');
    const withEnv = await load(file, { APALEO_CLIENT_ID: 'client-1' });
    expect(withEnv.config.apaleo.clientId).toBe('client-1');
  });

  it('reports an empty required value as required', async () => {
    const error = await loadError('bmd:\n  buchsymbol:\n  sachkontenlaenge: 4\n');
    expect(error.message).toContain('bmd.buchsymbol: is required');
    expect(await loadError('bmd:\n').then((e) => e.message)).toContain('bmd: is required');
    expect(await loadError('bmd:\n  buchsymbol:\n', { APALEO_CLIENT_ID: 'x' }).then((e) => e.message)).toContain('bmd.buchsymbol: is required');
  });
});

describe('apaleo section', () => {
  it('accepts scopes and other API hosts, without a trailing slash', async () => {
    const file = `apaleo:\n  clientId: abc\n  scopes: "accounting.read"\n  baseUrl: https://api.example.test/\n  identityUrl: http://localhost:8080\n${VALID}`;
    const { config } = await load(file);
    expect(config.apaleo).toEqual({
      clientId: 'abc',
      scopes: 'accounting.read',
      baseUrl: 'https://api.example.test',
      identityUrl: 'http://localhost:8080',
    });
  });

  it('rejects a base URL that is not https', async () => {
    const error = await loadError(`apaleo:\n  baseUrl: ftp://api.apaleo.com\n${VALID}`);
    expect(error.message).toContain(
      'apaleo.baseUrl: must be an https URL (plain http only for localhost, 127.0.0.1 or [::1]) (got "ftp://api.apaleo.com")',
    );
  });

  it.each(['baseUrl: http://api.apaleo.com', 'identityUrl: http://identity.apaleo.com', 'baseUrl: http://localhost.evil.test'])(
    'rejects plain http for a host that is not this machine (%s)',
    async (line) => {
      const error = await loadError(`apaleo:\n  ${line}\n${VALID}`);
      expect(error.message).toMatch(/apaleo\.(baseUrl|identityUrl): must be an https URL/);
    },
  );

  it('accepts plain http for 127.0.0.1 and [::1]', async () => {
    const { config } = await load(`apaleo:\n  baseUrl: http://127.0.0.1:4010\n  identityUrl: "http://[::1]:4011/"\n${VALID}`);
    expect(config.apaleo.baseUrl).toBe('http://127.0.0.1:4010');
    expect(config.apaleo.identityUrl).toBe('http://[::1]:4011');
  });
});

describe('validation errors name the key path', () => {
  it('rejects bmd.sachkontenlaenge: 3 with the allowed range', async () => {
    const error = await loadError(`${VALID}  sachkontenlaenge: 3\n`);
    expect(error.message).toContain('bmd.sachkontenlaenge: must be a whole number between 4 and 9 (got 3)');
  });

  it.each([
    ['personenkontenlaenge: 4', 'bmd.personenkontenlaenge'],
    ['personenkontenlaenge: 6.5', 'bmd.personenkontenlaenge'],
    ['personenkontenlaenge: "6"', 'bmd.personenkontenlaenge'],
  ])('rejects %s', async (line, key) => {
    const error = await loadError(`${VALID}  ${line}\n`);
    expect(error.message).toContain(`${key}: must be a whole number between 5 and 9`);
  });

  it('reports missing required keys', async () => {
    const error = await loadError('output:\n  dir: ./x\n');
    expect(error.message).toContain('bmd: is required');
  });

  it('reports unknown keys with their path', async () => {
    const error = await loadError(`${VALID}  buchsymbl: HO\nfoo: 1\n`);
    expect(error.message).toContain('bmd.buchsymbl: unknown key');
    expect(error.message).toContain('foo: unknown key');
  });

  it('reports YAML syntax errors with the file path', async () => {
    const error = await loadError('bmd: [unclosed\n');
    expect(error.message).toMatch(/Cannot parse config file .*apaleo-bmd\.config\.yaml: line \d+, column \d+: /);
  });

  it('does not quote neighbouring lines, such as a secret, in a YAML syntax error', async () => {
    const error = await loadError(`${VALID}apaleo:\n  clientId: "unclosed\nclientSecret: SUPERSECRET\n`);
    expect(error.message).toMatch(/line \d+, column \d+: missing closing quote or bracket\.$/);
    expect(error.message).not.toContain('SUPERSECRET');
    expect(error.message).not.toContain('unclosed');
    expect(error.message).not.toContain('^');
  });

  it.each([
    ['{"apaleo": {"clientId": "a", "clientSecret": SUPERSECRET}}', /: invalid JSON\.$/],
    ['{"apaleo": {"clientSecret": "SUPERSECRET"', /line 1, column \d+: invalid JSON\.$/],
  ])('does not quote the source in a JSON syntax error: %s', async (json, pattern) => {
    const error = await loadError(json, {}, 'config.json');
    expect(error.message).toMatch(pattern);
    expect(error.message).not.toContain('SUPERSECRET');
  });

  it('rejects a top level that is not key/value settings', async () => {
    const error = await loadError('- a\n- b\n');
    expect(error.message).toContain('must contain key/value settings');
  });
});

describe('properties section', () => {
  it('reads properties with an optional mapping path', async () => {
    const { config } = await load(`${VALID}properties:\n  - id: BSP\n    mapping: ./maps/bsp.csv\n  - id: HBW\n`);
    expect(config.properties).toEqual([{ id: 'BSP', mapping: './maps/bsp.csv' }, { id: 'HBW' }]);
  });

  it('names the key path of an invalid entry', async () => {
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n    mapping: ""\n  - mappin: x\n`);
    expect(error.message).toContain('properties.0.mapping: must not be empty');
    expect(error.message).toContain('properties.1.id: is required');
    expect(error.message).toContain('properties.1.mappin: unknown key');
  });

  it('rejects a property id listed twice', async () => {
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n  - id: BSP\n`);
    expect(error.message).toContain('properties: must not list a property id twice');
  });
});

describe('schedule section', () => {
  it('reads a daily schedule', async () => {
    const { config } = await load(`${VALID}schedule:\n  timezone: Europe/Zurich\n  cadence: daily\n  daily:\n    offsetDays: 3\n  catchUpDays: 10\n`);
    expect(config.schedule).toEqual({ timezone: 'Europe/Zurich', cadence: 'daily', daily: { offsetDays: 3 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 10 });
  });

  it('names schedule.daily.offsetDays and the range 1 to 3 for offsetDays 0', async () => {
    const error = await loadError(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: 0\n`);
    expect(error.message).toContain('schedule.daily.offsetDays: must be a whole number between 1 and 3 (got 0)');
  });

  it('limits monthly.dayOfMonth to 1 to 5', async () => {
    const error = await loadError(`${VALID}schedule:\n  monthly:\n    dayOfMonth: 6\n`);
    expect(error.message).toContain('schedule.monthly.dayOfMonth: must be a whole number between 1 and 5 (got 6)');
  });

  it('accepts exactly one cadence, monthly or daily', async () => {
    for (const cadence of ['weekly', '[daily, monthly]']) {
      const error = await loadError(`${VALID}schedule:\n  cadence: ${cadence}\n`);
      expect(error.message).toContain('schedule.cadence: must be "monthly" or "daily"');
    }
  });

  it('refuses a fixed UTC offset or an unknown zone as schedule.timezone', async () => {
    for (const zone of ['"+01:00"', 'Berlin', 'CEST+1']) {
      const error = await loadError(`${VALID}schedule:\n  timezone: ${zone}\n`);
      expect(error.message).toContain('schedule.timezone: must be an IANA time zone name');
    }
  });

  it('refuses a daily catch-up window under 5 days, so a day held back as not yet final is still exported later', async () => {
    for (const offsetDays of [1, 2, 3]) {
      const error = await loadError(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: ${offsetDays}\n  catchUpDays: 4\n`);
      expect(error.message).toContain('schedule.catchUpDays: must be at least 5 with cadence daily');
    }
    const { config } = await load(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: 1\n  catchUpDays: 5\n`);
    expect(config.schedule.catchUpDays).toBe(5);
  });

  it('refuses a monthly catch-up window under 3 days', async () => {
    const error = await loadError(`${VALID}schedule:\n  catchUpDays: 2\n`);
    expect(error.message).toContain('schedule.catchUpDays: must be at least 3 with cadence monthly');
    const { config } = await load(`${VALID}schedule:\n  catchUpDays: 3\n`);
    expect(config.schedule.catchUpDays).toBe(3);
  });

  it('reads schedule.finalAfter as a quoted local time up to 12:00 and refuses anything else', async () => {
    const { config } = await load(`${VALID}schedule:\n  finalAfter: "04:30"\n`);
    expect(config.schedule.finalAfter).toBe('04:30');
    for (const value of ['"13:00"', '"6:00"', '"24:00"', '6', 'morning']) {
      const error = await loadError(`${VALID}schedule:\n  finalAfter: ${value}\n`);
      expect(error.message).toContain('schedule.finalAfter: must be a local time "HH:MM" between "00:00" and "12:00"');
    }
  });

  it('rejects unknown schedule keys', async () => {
    const error = await loadError(`${VALID}schedule:\n  weekly: {}\n`);
    expect(error.message).toContain('schedule.weekly: unknown key');
  });
});

describe('secrets', () => {
  it('rejects apaleo.clientSecret in the file and points to APALEO_CLIENT_SECRET', async () => {
    const error = await loadError(`apaleo:\n  clientId: abc\n  clientSecret: oops\n${VALID}`);
    expect(error.message).toContain('apaleo.clientSecret must not be stored in the config file');
    expect(error.message).toContain('set APALEO_CLIENT_SECRET in the environment');
    expect(error.message).not.toContain('oops');
  });
});

describe('environment overrides', () => {
  it('APALEO_BMD_OUTPUT_DIR wins over output.dir in the file', async () => {
    const { config } = await load(`${VALID}output:\n  dir: ./out\n`, { APALEO_BMD_OUTPUT_DIR: '/data/out' });
    expect(config.output.dir).toBe('/data/out');
  });

  it('applies every allow-listed scalar override', async () => {
    const { config } = await load(VALID, { APALEO_CLIENT_ID: 'client-1', APALEO_BMD_OUTPUT_DIR: '/data/out', APALEO_BMD_TIMEZONE: 'Europe/Zurich' });
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.output.dir).toBe('/data/out');
    expect(config.schedule.timezone).toBe('Europe/Zurich');
  });

  it('no longer reads the DATEV overrides of the Berater- and Mandantennummer', async () => {
    const error = await loadError(VALID, { APALEO_BMD_BERATERNUMMER: '7654321', APALEO_BMD_MANDANTENNUMMER: '99' });
    expect(error.message).toContain('APALEO_BMD_BERATERNUMMER: unknown variable');
    expect(error.message).toContain('APALEO_BMD_MANDANTENNUMMER: unknown variable');
  });

  it('APALEO_BMD_TIMEZONE sets schedule.timezone and is validated like the file value', async () => {
    const { config } = await load(VALID, { APALEO_BMD_TIMEZONE: 'Europe/Zurich' });
    expect(config.schedule.timezone).toBe('Europe/Zurich');
    const error = await loadError(VALID, { APALEO_BMD_TIMEZONE: 'Mars/Olympus' });
    expect(error.message).toContain('schedule.timezone: must be an IANA time zone name');
    expect(error.message).toContain('from APALEO_BMD_TIMEZONE');
  });

  it('ignores empty override values', async () => {
    const { config } = await load(VALID, { APALEO_BMD_OUTPUT_DIR: '' });
    expect(config.output.dir).toBe('./exports');
  });

  it('rejects an unknown APALEO_BMD_* variable and names it', async () => {
    const error = await loadError(VALID, { APALEO_BMD_OUTPUTDIR: '/x' });
    expect(error.message).toContain('APALEO_BMD_OUTPUTDIR: unknown variable');
    expect(error.message).toContain('APALEO_BMD_OUTPUT_DIR');
  });

  it('rejects an array key set from the environment', async () => {
    const error = await loadError(VALID, { APALEO_BMD_PROPERTIES: 'BER,MUC' });
    expect(error.message).toContain('APALEO_BMD_PROPERTIES');
    expect(error.message).toContain('"properties" is an array and can only be set in the config file');
  });

  it('ignores the old APALEO_DATEV_* names of the DATEV project', async () => {
    const { config } = await load(VALID, { APALEO_DATEV_OUTPUT_DIR: '/old', APALEO_DATEV_PROPERTIES: 'BER', APALEO_DATEV_TIMEZONE: 'nope' });
    expect(config.output.dir).toBe('./exports');
  });

  it('ignores unrelated environment variables', async () => {
    await expect(load(VALID, { PATH: '/usr/bin', APALEO_OTHER: 'x' })).resolves.toBeDefined();
  });

  it('only allow-lists scalar keys', () => {
    expect(ENV_OVERRIDES.map((o) => o.variable)).toEqual([
      'APALEO_BMD_OUTPUT_DIR',
      'APALEO_CLIENT_ID',
      'APALEO_BMD_TIMEZONE',
    ]);
  });
});

describe('Buchungssymbole of the properties', () => {
  const bmd = { dialect: 'ntcs' as const, sachkontenlaenge: 4, personenkontenlaenge: 6, buchsymbol: 'HO' };

  it('uses the property symbol, else the bmd section, and the main symbol for payments without buchsymbolZahlung', () => {
    const config = { bmd, properties: [{ id: 'BSP' }, { id: 'BS2', buchsymbol: 'HO2' }] };
    expect(buchsymboleOf(config, 'BSP')).toEqual({ buchsymbol: 'HO', buchsymbolZahlung: 'HO' });
    expect(buchsymboleOf(config, 'BS2')).toEqual({ buchsymbol: 'HO2', buchsymbolZahlung: 'HO2' });
    expect(buchsymboleOf({ bmd: { ...bmd, buchsymbolZahlung: 'HZ' }, properties: [] }, 'BSP')).toEqual({ buchsymbol: 'HO', buchsymbolZahlung: 'HZ' });
  });

  it('warns W-BUCHSYMBOL-SHARED when two properties book under the same symbol', () => {
    const [finding, ...rest] = sharedBuchsymbolFindings({ bmd, properties: [{ id: 'BSP' }, { id: 'BS2' }] });
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'W-BUCHSYMBOL-SHARED', value: 'HO' });
    expect(finding?.message).toContain('BSP, BS2');
    expect(finding?.message).toContain('Belegnummern would repeat');
  });

  it('does not warn when each property has its own symbol, and warns for a shared payment symbol', () => {
    expect(sharedBuchsymbolFindings({ bmd, properties: [{ id: 'BSP' }, { id: 'BS2', buchsymbol: 'HO2' }] })).toEqual([]);
    const shared = sharedBuchsymbolFindings({ bmd: { ...bmd, buchsymbolZahlung: 'HZ' }, properties: [{ id: 'BSP' }, { id: 'BS2', buchsymbol: 'HO2' }] });
    expect(shared.map((f) => f.value)).toEqual(['HZ']);
  });
});

describe('missing config file', () => {
  it('throws ConfigNotFoundError with the path and how to create the file', async () => {
    const ctx = createTestContext();
    const path = join(ctx.cwd, 'apaleo-bmd.config.yaml');
    const error = await loadConfig({ path, env: {}, readFile: ctx.fs.readFile }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigNotFoundError);
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).toContain('apaleo-bmd.config.example.yaml');
  });

  it('makes a command that needs config exit 1 with the path it looked for', async () => {
    const needsConfig: Command = {
      name: 'needs-config',
      summary: 'Loads the config',
      usage: '',
      options: {},
      async run(_args, ctx) {
        const path = resolveConfigPath(undefined, ctx.env, ctx.cwd);
        await loadConfig({ path, env: ctx.env, readFile: ctx.fs.readFile });
        return EXIT_OK;
      },
    };
    const ctx = createTestContext();
    expect(await runCli(['needs-config'], ctx, [needsConfig])).toBe(1);
    expect(ctx.err()).toContain(`No config file found at ${join(ctx.cwd, 'apaleo-bmd.config.yaml')}`);
    expect(ctx.err()).toContain('--config <path>');
    expect(ctx.err()).not.toMatch(/\n\s+at /);
  });
});
