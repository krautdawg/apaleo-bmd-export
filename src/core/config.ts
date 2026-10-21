import { extname, resolve } from 'node:path';
import { LineCounter, parseDocument, type ErrorCode } from 'yaml';
import { z } from 'zod';
import { UserError } from './errors.js';
import type { Finding } from './findings.js';
import { parseClockTime } from './date.js';

export type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_CONFIG_FILE = 'apaleo-bmd.config.yaml';
export const EXAMPLE_CONFIG_FILE = 'apaleo-bmd.config.example.yaml';
export const CONFIG_PATH_ENV = 'APALEO_BMD_CONFIG';
const ENV_PREFIX = 'APALEO_BMD_';

// ---------------------------------------------------------------------------
// Schema. Each section is exported so later slices can extend it, for example
// `bmdSection.extend({ ... })`, and add new sections to `configSections`.
// ---------------------------------------------------------------------------

function wholeNumber(min: number, max: number) {
  const message = `must be a whole number between ${min} and ${max}`;
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

const HTTPS_URL_MESSAGE = 'must be an https URL (plain http only for localhost, 127.0.0.1 or [::1])';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An https URL. The client secret and the access token travel with every call,
 * so plain http is accepted only for a local test server on this machine.
 */
const httpsUrl = (fallback: string) =>
  z
    .url({ protocol: /^https?$/, error: HTTPS_URL_MESSAGE })
    .refine((url) => {
      const { protocol, hostname } = new URL(url);
      return protocol === 'https:' || LOOPBACK_HOSTS.has(hostname);
    }, HTTPS_URL_MESSAGE)
    .transform((url) => url.replace(/\/+$/, ''))
    .default(fallback);

export const apaleoSection = z.strictObject({
  clientId: z.string().min(1, 'must not be empty').optional(),
  /** Space-separated scopes. Custom apps carry their permissions on the client, so this is usually left out. */
  scopes: z.string().trim().min(1, 'must not be empty').optional(),
  baseUrl: httpsUrl('https://api.apaleo.com'),
  identityUrl: httpsUrl('https://identity.apaleo.com'),
});

export const outputSection = z.strictObject({
  dir: z.string().min(1, 'must not be empty').default('./exports'),
});

export const BMD_DIALECTS = ['ntcs', 'bmd55'] as const;
export type BmdDialectName = (typeof BMD_DIALECTS)[number];

/** Longest Buchungssymbol per dialect: NTCS takes 4 characters, BMD 5.5 two. */
export const MAX_SYMBOL_LENGTH: Readonly<Record<BmdDialectName, number>> = { ntcs: 4, bmd55: 2 };

const SYMBOL_MESSAGE = 'must be 1 to 4 characters of A-Z and 0-9 (a Buchungssymbol the Kanzlei created in BMD)';
const buchsymbol = z.string({ error: SYMBOL_MESSAGE }).regex(/^[A-Z0-9]{1,4}$/, SYMBOL_MESSAGE);

/** Where the docs explain how the Kanzlei creates the Buchungssymbol; named in the "is required" error. */
export const BUCHSYMBOL_DOC = 'docs/bmd-import.md';

/** What the Kanzlei's BMD Mandant decides about every file. */
export const bmdSection = z.strictObject({
  /** `ntcs` (BMD NTCS, default) or `bmd55` (BMD 5.5 header names, dates and Steuercodes). */
  dialect: z.enum(BMD_DIALECTS, { error: 'must be "ntcs" or "bmd55"' }).default('ntcs'),
  /** Digits of a Sachkonto in the Kanzlei's Kontenplan (4 in the EKR). */
  sachkontenlaenge: wholeNumber(4, 9).default(4),
  /** Digits of a Personenkonto (Debitor). */
  personenkontenlaenge: wholeNumber(5, 9).default(6),
  /** The Buchungssymbol of every booking. No default: the Kanzlei must create it in BMD first. */
  buchsymbol,
  /** The Buchungssymbol of payment lines; default `buchsymbol`. */
  buchsymbolZahlung: buchsymbol.optional(),
});

/** How the posting rules fill BMD fields. */
export const postingSection = z.strictObject({
  /** extbelegnr: the receipt (invoice) number when there is one (default), or always the reservation reference. */
  extbelegnr: z.enum(['receipt', 'reference'], { error: 'must be "receipt" or "reference"' }).default('receipt'),
});

export const propertyEntry = z.strictObject({
  /** The apaleo property id, for example `BSP`. */
  id: z.string().trim().min(1, 'must not be empty'),
  /** The mapping CSV, relative to the working directory. Default `./mapping-<id>.csv`. */
  mapping: z.string().trim().min(1, 'must not be empty').optional(),
  /** Overrides `bmd.buchsymbol` for this property's bookings. */
  buchsymbol: buchsymbol.optional(),
  /** Overrides `bmd.buchsymbolZahlung` for this property's payment lines. */
  buchsymbolZahlung: buchsymbol.optional(),
});

export const propertiesSection = z
  .array(propertyEntry)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, 'must not list a property id twice');

/** Optional plausibility checks of the export. */
export const checksSection = z.strictObject({
  /** Compare the ledger with apaleo's daily aggregates (needs core.subledger_aggregate.create). */
  aggregates: z.boolean({ error: 'must be true or false' }).default(false),
});

const TIME_ZONE_MESSAGE = 'must be an IANA time zone name, for example "Europe/Vienna" or "Europe/Zurich"';

/** An IANA zone name. Fixed offsets such as `+01:00` are refused: they ignore summer time. */
const ianaTimeZone = z.string({ error: TIME_ZONE_MESSAGE }).refine((value) => {
  if (!/^[A-Za-z]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, TIME_ZONE_MESSAGE);

const FINAL_AFTER_MESSAGE = 'must be a local time "HH:MM" between "00:00" and "12:00", in quotes (the night audit usually ends by then)';

/** The latest `schedule.finalAfter`: with it, every held period stays inside the smallest catch-up window long enough (see below). */
const LATEST_FINAL_AFTER = 12 * 60;

const finalAfterTime = z.string({ error: FINAL_AFTER_MESSAGE }).refine((value) => {
  const minutes = parseClockTime(value);
  return minutes !== undefined && minutes <= LATEST_FINAL_AFTER;
}, FINAL_AFTER_MESSAGE);

/**
 * The smallest `schedule.catchUpDays` per cadence. A period is final two days
 * after its last day, from `finalAfter` (src/export/period.ts), and a run can
 * hold it back as not yet final until four days after its last day: before
 * `finalAfter` in a property time zone up to 26 hours behind `schedule.timezone`.
 * The window must still hold the period then, or it would never be exported.
 * Daily counts the window from the day itself (4 days later plus today: 5),
 * monthly from its due date (at the earliest 2 days after the month: 3).
 */
export const MIN_CATCH_UP_DAYS = { daily: 5, monthly: 3 } as const;

/** When `schedule --once` exports what. One cadence per install, so daily and monthly files never both reach BMD. */
export const scheduleSection = z
  .strictObject({
    /** "Today" for the due-period computation is the date in this zone. */
    timezone: ianaTimeZone.default('Europe/Vienna'),
    cadence: z.enum(['monthly', 'daily'], { error: 'must be "monthly" or "daily"' }).default('monthly'),
    /** A day is due this many days after it (2 = the day before yesterday). With 1 it waits one more day for the next night audit. */
    daily: z.strictObject({ offsetDays: wholeNumber(1, 3).default(2) }).prefault({}),
    /** A month is due from this day of the following month. With 1 it waits until the 2nd for the next night audit. */
    monthly: z.strictObject({ dayOfMonth: wholeNumber(1, 5).default(3) }).prefault({}),
    /**
     * Local time from which a period that ended the day before yesterday counts as final: the night audit
     * that closes yesterday runs after midnight and can still post to the day before.
     */
    finalAfter: finalAfterTime.default('06:00'),
    /** How far back (in days) a missed period is still exported. */
    catchUpDays: wholeNumber(1, 366).default(40),
  })
  .superRefine((schedule, issue) => {
    const minimum = MIN_CATCH_UP_DAYS[schedule.cadence];
    if (schedule.catchUpDays >= minimum) return;
    issue.addIssue({
      code: 'custom',
      path: ['catchUpDays'],
      message:
        `must be at least ${minimum} with cadence ${schedule.cadence}: a period is final two days after its last day at the earliest ` +
        '(after schedule.finalAfter), and a run that holds it back as not yet final must still find it in the window on the following days',
    });
  });

export const configSections = {
  apaleo: apaleoSection.prefault({}),
  output: outputSection.prefault({}),
  bmd: bmdSection,
  posting: postingSection.prefault({}),
  properties: propertiesSection.default([]),
  checks: checksSection.prefault({}),
  schedule: scheduleSection.prefault({}),
};

export const configSchema = z.strictObject(configSections).superRefine((config, issue) => {
  // Every Buchungssymbol must fit the dialect: BMD 5.5 takes only two characters.
  const max = MAX_SYMBOL_LENGTH[config.bmd.dialect];
  const symbols: [PropertyKey[], string | undefined][] = [
    [['bmd', 'buchsymbol'], config.bmd.buchsymbol],
    [['bmd', 'buchsymbolZahlung'], config.bmd.buchsymbolZahlung],
    ...config.properties.flatMap((p, i): [PropertyKey[], string | undefined][] => [
      [['properties', i, 'buchsymbol'], p.buchsymbol],
      [['properties', i, 'buchsymbolZahlung'], p.buchsymbolZahlung],
    ]),
  ];
  for (const [path, symbol] of symbols) {
    if (symbol !== undefined && symbol.length > max) {
      issue.addIssue({ code: 'custom', path, message: `must have at most ${max} characters with bmd.dialect ${config.bmd.dialect}` });
    }
  }
});

export type Config = z.infer<typeof configSchema>;
export type PostingConfig = z.infer<typeof postingSection>;
export type BmdConfig = z.infer<typeof bmdSection>;
export type PropertyConfig = z.infer<typeof propertyEntry>;
export type ScheduleConfig = z.infer<typeof scheduleSection>;

/** The Buchungssymbole of one property: its own, else the `bmd` section's; payments default to the main symbol. */
export interface Buchsymbole {
  buchsymbol: string;
  buchsymbolZahlung: string;
}

export function buchsymboleOf(config: Pick<Config, 'bmd' | 'properties'>, propertyId: string): Buchsymbole {
  const property = config.properties.find((p) => p.id === propertyId);
  const buchsymbol = property?.buchsymbol ?? config.bmd.buchsymbol;
  return { buchsymbol, buchsymbolZahlung: property?.buchsymbolZahlung ?? config.bmd.buchsymbolZahlung ?? buchsymbol };
}

/**
 * `W-BUCHSYMBOL-SHARED` for each Buchungssymbol that two or more configured
 * properties use: the Belegnummern of their files start alike (`MMDD` and a
 * counter), so in one BMD Mandant they would repeat under that symbol.
 */
export function sharedBuchsymbolFindings(config: Pick<Config, 'bmd' | 'properties'>): Finding[] {
  const users = new Map<string, string[]>();
  for (const { id } of config.properties) {
    const { buchsymbol, buchsymbolZahlung } = buchsymboleOf(config, id);
    for (const symbol of new Set([buchsymbol, buchsymbolZahlung])) users.set(symbol, [...(users.get(symbol) ?? []), id]);
  }
  return [...users]
    .filter(([, ids]) => ids.length > 1)
    .map(([symbol, ids]) => ({
      code: 'W-BUCHSYMBOL-SHARED',
      message:
        `the properties ${ids.join(', ')} all book under the Buchungssymbol ${symbol}. If the Kanzlei imports them into one BMD Mandant, ` +
        'their Belegnummern would repeat; give each property its own symbol (properties[].buchsymbol) or its own Mandant',
      value: symbol,
    }));
}

// ---------------------------------------------------------------------------
// Environment. Overrides are an explicit allow-list of scalar keys; there is
// no generic mapper. This table is the single source for code and docs.
// ---------------------------------------------------------------------------

export interface EnvOverride {
  readonly variable: string;
  readonly path: readonly string[];
  readonly type: 'string' | 'integer';
}

export const ENV_OVERRIDES: readonly EnvOverride[] = [
  { variable: 'APALEO_BMD_OUTPUT_DIR', path: ['output', 'dir'], type: 'string' },
  { variable: 'APALEO_CLIENT_ID', path: ['apaleo', 'clientId'], type: 'string' },
  { variable: 'APALEO_BMD_TIMEZONE', path: ['schedule', 'timezone'], type: 'string' },
];

export interface SecretKey {
  readonly variable: string;
  readonly path: readonly string[];
}

/** Secrets come only from the environment; these keys are rejected in the file. */
export const SECRET_KEYS: readonly SecretKey[] = [
  { variable: 'APALEO_CLIENT_SECRET', path: ['apaleo', 'clientSecret'] },
];

/** Top-level array keys. They can only be set in the config file. */
export const ARRAY_KEYS: readonly string[] = ['properties'];

export interface Secrets {
  apaleoClientSecret: string | undefined;
}

export interface LoadedConfig {
  path: string;
  config: Config;
  secrets: Secrets;
}

export class ConfigNotFoundError extends UserError {
  override readonly name: string = 'ConfigNotFoundError';

  constructor(readonly path: string) {
    super(
      `No config file found at ${path}.\n` +
        `Create one by copying ${EXAMPLE_CONFIG_FILE} to ${DEFAULT_CONFIG_FILE} and editing it,\n` +
        `or point to an existing file with --config <path> or ${CONFIG_PATH_ENV}.`,
    );
  }
}

/** `--config`, else `APALEO_BMD_CONFIG`, else `./apaleo-bmd.config.yaml`, resolved against `cwd`. */
export function resolveConfigPath(flag: string | undefined, env: Env, cwd: string): string {
  return resolve(cwd, flag || env[CONFIG_PATH_ENV] || DEFAULT_CONFIG_FILE);
}

export interface LoadConfigOptions {
  path: string;
  env: Env;
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
}

export async function loadConfig({ path, env, readFile }: LoadConfigOptions): Promise<LoadedConfig> {
  checkEnvVariables(env);
  const raw = parseConfigText(await readConfigFile(path, readFile), path);
  rejectSecretsInFile(raw, path);
  rejectDatevSection(raw, path);
  const fromEnv = applyEnvOverrides(raw, env);

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.flatMap((issue) => describeIssue(issue, raw, fromEnv));
    throw new UserError(`Invalid config in ${path}:\n${lines.map((l) => `  - ${l}`).join('\n')}`);
  }
  return {
    path,
    config: result.data,
    secrets: { apaleoClientSecret: env.APALEO_CLIENT_SECRET || undefined },
  };
}

async function readConfigFile(path: string, readFile: LoadConfigOptions['readFile']): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigNotFoundError(path);
    throw new UserError(`Cannot read config file ${path}: ${(error as Error).message}`);
  }
}

function parseConfigText(text: string, path: string): Record<string, unknown> {
  const parsed = extname(path).toLowerCase() === '.json' ? parseJson(text, path) : parseYamlText(text, path);
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UserError(`Config file ${path} must contain key/value settings at the top level.`);
  }
  return dropNullValues(parsed as Record<string, unknown>);
}

// Parse errors are reported by position and error kind only. The messages of the
// YAML and JSON parsers quote the surrounding source, which may be a neighbouring
// secret (for example an apaleo.clientSecret that rejectSecretsInFile would reject).

const YAML_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  BAD_INDENT: 'bad indentation',
  BAD_DQ_ESCAPE: 'invalid escape sequence in a double-quoted string',
  BAD_SCALAR_START: 'a plain value cannot start with this character',
  BLOCK_AS_IMPLICIT_KEY: 'a nested block cannot be used as a key',
  BLOCK_IN_FLOW: 'block syntax inside [ ] or { }',
  DUPLICATE_KEY: 'duplicate key',
  MISSING_CHAR: 'missing closing quote or bracket',
  MULTILINE_IMPLICIT_KEY: 'a key must fit on one line (missing colon?)',
  MULTIPLE_DOCS: 'the file must contain a single YAML document',
  TAB_AS_INDENT: 'tabs cannot be used for indentation',
  UNEXPECTED_TOKEN: 'unexpected character',
};

function parseYamlText(text: string, path: string): unknown {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { prettyErrors: false, lineCounter });
  const [error] = doc.errors;
  if (error) {
    const { line, col } = lineCounter.linePos(error.pos[0]);
    const what = YAML_ERROR_TEXT[error.code] ?? `invalid YAML (${error.code})`;
    throw new UserError(`Cannot parse config file ${path}: line ${line}, column ${col}: ${what}.`);
  }
  try {
    return doc.toJS();
  } catch {
    throw new UserError(`Cannot parse config file ${path}: invalid YAML (aliases or tags).`);
  }
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = (error as Error).message;
    const lineCol = /\(line (\d+) column (\d+)\)/.exec(message);
    const position = /at position (\d+)/.exec(message);
    let where = '';
    if (lineCol) where = `line ${lineCol[1]}, column ${lineCol[2]}: `;
    else if (position) where = `${lineAndColumn(text, Number(position[1]))}: `;
    else if (/end of (JSON|data) input/i.test(message)) where = 'end of file: ';
    throw new UserError(`Cannot parse config file ${path}: ${where}invalid JSON.`);
  }
}

function lineAndColumn(text: string, offset: number): string {
  const before = text.slice(0, offset).split('\n');
  return `line ${before.length}, column ${(before.at(-1)?.length ?? 0) + 1}`;
}

/**
 * A key with no value (`apaleo:` whose children are all commented out, or
 * `beraternummer:` left empty) parses as null. Treat it as missing, so defaults
 * apply and required keys report "is required". Arrays are left as they are.
 */
function dropNullValues(object: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === null) continue;
    result[key] = isPlainObject(value) ? dropNullValues(value) : value;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkEnvVariables(env: Env): void {
  const allowed = new Set([CONFIG_PATH_ENV, ...ENV_OVERRIDES.map((o) => o.variable)]);
  const problems: string[] = [];
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.startsWith(ENV_PREFIX) || allowed.has(variable) || value === undefined) continue;
    const arrayKey = ARRAY_KEYS.find((key) => `${ENV_PREFIX}${key.toUpperCase()}` === variable);
    problems.push(
      arrayKey
        ? `${variable}: "${arrayKey}" is an array and can only be set in the config file, not from the environment.`
        : `${variable}: unknown variable. Supported: ${[...allowed].join(', ')}.`,
    );
  }
  if (problems.length > 0) {
    throw new UserError(`Unsupported environment variables:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

function rejectSecretsInFile(raw: Record<string, unknown>, path: string): void {
  for (const secret of SECRET_KEYS) {
    if (getAtPath(raw, secret.path) !== undefined) {
      throw new UserError(
        `${secret.path.join('.')} must not be stored in the config file (${path}).\n` +
          `Remove it from the file and set ${secret.variable} in the environment instead (for example in .env).`,
      );
    }
  }
}

/** A config of the DATEV tool this one started from: say so instead of listing every DATEV key as unknown. */
function rejectDatevSection(raw: Record<string, unknown>, path: string): void {
  if (raw.datev === undefined) return;
  throw new UserError(
    `datev is not a section of apaleo-bmd (${path}): this tool writes BMD files. ` +
      'Replace the datev section with a bmd section (bmd.buchsymbol, bmd.sachkontenlaenge, bmd.personenkontenlaenge, bmd.dialect); ' +
      `see ${EXAMPLE_CONFIG_FILE} and docs/configuration.md.`,
  );
}

/** Extra words for a missing required key: what to do before the key can be filled in. */
const REQUIRED_HINTS: Readonly<Record<string, string>> = {
  bmd: `add a bmd section with bmd.buchsymbol, the Buchungssymbol the Kanzlei created in BMD (see ${BUCHSYMBOL_DOC})`,
  'bmd.buchsymbol': `name the Buchungssymbol the Kanzlei created in BMD for these bookings, for example HO (see ${BUCHSYMBOL_DOC})`,
};

/** Writes env values into the raw object and returns which key paths they set. */
function applyEnvOverrides(raw: Record<string, unknown>, env: Env): Map<string, string> {
  const fromEnv = new Map<string, string>();
  for (const override of ENV_OVERRIDES) {
    const value = env[override.variable];
    if (value === undefined || value === '') continue;
    setAtPath(raw, override.path, parseEnvValue(override, value));
    fromEnv.set(override.path.join('.'), override.variable);
  }
  return fromEnv;
}

function parseEnvValue(override: EnvOverride, value: string): string | number {
  if (override.type === 'string') return value;
  if (!/^\d+$/.test(value.trim())) {
    throw new UserError(`${override.variable} must be a whole number, got "${value}".`);
  }
  return Number(value.trim());
}

function describeIssue(issue: z.core.$ZodIssue, raw: unknown, fromEnv: Map<string, string>): string[] {
  const path = issue.path.map(String);
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => `${[...path, key].join('.')}: unknown key`);
  }
  const key = path.join('.') || '(top level)';
  const value = getAtPath(raw, path);
  if (value === undefined) return [`${key}: is required${REQUIRED_HINTS[key] ? `: ${REQUIRED_HINTS[key]}` : ''}`];
  const source = fromEnv.get(key);
  return [`${key}: ${issue.message} (got ${JSON.stringify(value)}${source ? ` from ${source}` : ''})`];
}

function getAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setAtPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current = target;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1] as string] = value;
}
