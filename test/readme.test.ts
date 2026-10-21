import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { COMMANDS } from '../src/cli/commands/index.js';
import { ENV_OVERRIDES, SECRET_KEYS } from '../src/core/config.js';
import { APALEO_PERMISSIONS } from '../src/sources/apaleo/index.js';
import { ROOT, checkCompatibilityClaims, commandPhrases, configPaths, readRepoFile, recordedTestImports } from './helpers/docs.js';

const README = readRepoFile('README.md');
const ENGLISH_README = readRepoFile('README.en.md');
const MAINTAINERS = readRepoFile('docs/maintainers.md');
const GERMAN_TAGLINE = 'Kostenloser apaleo BMD Export: Buchungsimport für BMD NTCS aus apaleo, Open Source';
const PRICE = '18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026';
const PENDING_IMPORT = 'Die Datei folgt dem dokumentierten BMD-Importformat (PR08/PR08A); ein erster Testimport mit einer Kanzlei steht noch aus.';
/** The install block of the German quick start (s09 design decision 3), which CI runs. */
const INSTALL_BLOCK = [
  'git clone https://github.com/krautdawg/apaleo-bmd-export.git',
  'cd apaleo-bmd-export',
  'corepack enable',
  'pnpm install --frozen-lockfile',
  'pnpm build',
  'node dist/cli/main.js --help        # oder: pnpm link --global, dann apaleo-bmd --help',
];

/** The text from the start up to the first `## ` heading. */
const firstScreen = README.slice(0, README.search(/^## /m));
const headings = (text: string, level: string) => [...text.matchAll(new RegExp(`^${level} (.+)$`, 'gm'))].map((m) => m[1] ?? '');
/** The body of the section under a heading, up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const level = /^#+/.exec(heading)?.[0] ?? '##';
  const rest = text.slice(start + heading.length + 1);
  const end = rest.search(new RegExp(`^#{1,${level.length}} `, 'm'));
  return end < 0 ? rest : rest.slice(0, end);
}
/** The trimmed, non-empty lines of the first sh block in a text. */
const firstShellBlock = (text: string) =>
  (/```sh\n([\s\S]*?)```/.exec(text)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const withoutComment = (line: string) => line.replace(/\s+#.*$/, '');

describe('README first screen', () => {
  it('opens with the H1, the link to the English README, the tagline, badges, the intro and the disclaimer notice before any install detail', () => {
    const [title = '', ...rest] = README.split('\n');
    expect(title).toMatch(/^# /);
    for (const term of ['apaleo BMD Export', 'kostenlos', 'Open Source']) expect(title).toContain(term);
    expect(rest.find((line) => line.trim() !== '')).toContain('](README.en.md)');
    expect(firstScreen).toContain(GERMAN_TAGLINE);
    for (const badge of ['actions/workflows/ci.yml/badge.svg', 'licence-MIT', 'node.js-24']) expect(firstScreen).toContain(badge);
    expect(firstScreen).toMatch(/apaleo-bmd-export ist .*Hotels in Österreich.*Kanzlei/);
    expect(firstScreen).toContain('Keine Gewähr, keine Steuerberatung');
    expect(firstScreen).toContain('Lass deine Kontenzuordnung von deiner Steuerberatung prüfen');
    expect(firstScreen).toContain('](DISCLAIMER.md)');
    expect(firstScreen).not.toContain('git clone');
    expect(headings(README, '##')[0]).toBe('Was es macht');
    expect(section(README, '## Was es macht').match(/^- /gm)).toHaveLength(5);
  });

  it('uses the search terms people use in the title, tagline and intro', () => {
    for (const term of ['apaleo', 'BMD', 'BMD NTCS', 'BMD-Export', 'Buchungsimport', 'Einheitskontenrahmen', 'EKR', 'Steuerberater', 'Buchhaltung', 'Hotel', 'Österreich', 'Open Source', 'kostenlos']) {
      expect(firstScreen.toLowerCase(), term).toContain(term.toLowerCase());
    }
  });

  it('Pending test import: says on the first screen that the file follows the documented layout and the first test import is pending', () => {
    expect(recordedTestImports(MAINTAINERS)).toEqual([]);
    expect(firstScreen).toContain(PENDING_IMPORT);
  });

  it('Claim without a recorded import: makes no tested-with-BMD claim while docs/maintainers.md records no import', () => {
    expect(checkCompatibilityClaims('README.md', README, recordedTestImports(MAINTAINERS).length)).toEqual([]);
    expect(checkCompatibilityClaims('README.md', `${README}\nDie Datei ist getestet mit BMD NTCS.\n`, recordedTestImports(MAINTAINERS).length)).toEqual([
      expect.stringMatching(/^README\.md: "getestet mit BMD"/),
    ]);
  });

  it('is German only, with the sections in order', () => {
    expect(headings(README, '##')).toEqual([
      'Was es macht',
      'Für wen',
      'Beispielausgabe ansehen',
      'Ohne apaleo ausprobieren',
      'Schnellstart',
      'Schnellstart mit Docker',
      'Befehle',
      'Konfiguration',
      'Was es nicht macht',
      'Vergleich mit kostenpflichtigen Connectoren',
      'Häufige Fragen',
      'Haftungsausschluss',
      'Mitmachen',
      'Lizenz',
    ]);
    expect(README).not.toMatch(/^#+ (Deutsch|English)$/m);
    expect(README).toMatch(/\bdu\b/);
  });
});

describe('README quick start', () => {
  it('has the five numbered steps in order', () => {
    const quickStart = section(README, '## Schnellstart');
    const numbered = [...quickStart.matchAll(/^(\d)\. \*\*(.+?)\*\*/gm)].map((m) => `${m[1]} ${m[2]}`);
    expect(numbered).toEqual(['1 apaleo Custom App anlegen.', '2 Installieren', '3 Kontenzuordnung anlegen', '4 Probelauf', '5 Export']);
    for (const command of ['init-mapping --property BSP --template ekr', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
      expect(quickStart).toContain(command);
    }
  });

  it('marks the German install-from-source block for the readme-quickstart CI job', () => {
    expect(firstShellBlock(README.split('<!-- quickstart -->')[1] ?? '')).toEqual(INSTALL_BLOCK);
  });

  it('builds the Docker image locally and shows no dead-end install step', () => {
    expect(section(README, '## Schnellstart mit Docker')).toContain('docker compose -f docker-compose.example.yml build');
    expect(README).toContain('Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.');
    for (const text of [README, ENGLISH_README]) {
      expect(text).not.toMatch(/npx\s+apaleo-bmd/);
      expect(text).not.toContain('docker pull');
    }
  });

  it('links the example output and the demo', () => {
    expect(section(README, '## Beispielausgabe ansehen')).toContain('](docs/examples/)');
    expect(section(README, '## Ohne apaleo ausprobieren')).toContain('export --month 2026-09 --demo --dry-run');
  });

  it('lists every command in the commands table', () => {
    for (const phrase of commandPhrases(COMMANDS).keys()) {
      expect(section(README, '## Befehle'), phrase).toContain(`| \`${phrase}\` |`);
    }
  });
});

describe('README scope and comparison', () => {
  it('says what the tool does not do', () => {
    const limits = section(README, '## Was es nicht macht');
    for (const phrase of [
      'Keine Übertragung an BMD und kein BMD Com',
      'Keine Personenkonten-Stammdaten',
      'Gebühren der Zahlungsdienstleister',
      'Rückbuchungen (Chargebacks)',
      'Provisionen der Buchungsportale',
      'Weboberfläche',
      'gehosteter Dienst',
      'keine anderen Zielformate wie DATEV oder RZL',
    ]) {
      expect(limits).toContain(phrase);
    }
  });

  it('Comparison table: compares with paid connectors on eight points, with the dated price and no vendor name', () => {
    const table = section(README, '## Vergleich mit kostenpflichtigen Connectoren');
    const rows = [...table.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1]?.trim());
    expect(rows).toEqual(
      expect.arrayContaining(['Preis', 'Betrieb', 'Einrichtung', 'Zustellung der Dateien', 'Personenkonten-Datei', 'Gebühren aus Abrechnungsdateien', 'Support', 'Vorlagen für die Zuordnung']),
    );
    expect(table).toContain(PRICE);
    expect(table).toContain('Selbst betreiben heißt');
    for (const vendor of ['grman', 'hotecholution', 'omniboost', 'bmd connector', 'datev connector']) {
      expect(README.toLowerCase(), vendor).not.toContain(vendor);
      expect(ENGLISH_README.toLowerCase(), vendor).not.toContain(vendor);
    }
  });

  it('names the origin project in one sentence and links it for DATEV users', () => {
    const origin = README.split('\n').filter((line) => line.includes('apaleo-datev-export'));
    expect(origin).toHaveLength(1);
    expect(origin[0]).toContain('](https://github.com/krautdawg/apaleo-datev-export)');
    expect(origin[0]).toMatch(/wer .*mit DATEV bucht/);
  });

  it('answers the FAQ questions', () => {
    const faq = section(README, '## Häufige Fragen');
    for (const topic of ['Was kostet es', 'Wohin gehen meine Daten', 'BMD Com', 'Testimport', 'rückgängig', 'Mehrere Hotels', 'wechseln', 'BMD 5.5', 'DATEV']) {
      expect(faq, topic).toContain(topic);
    }
  });
});

describe('README.en.md', () => {
  it('is a short English README that links the German one, the disclaimer and the licence', () => {
    expect(ENGLISH_README.split('\n').length).toBeLessThanOrEqual(80);
    expect(ENGLISH_README.startsWith('# apaleo-bmd-export\n')).toBe(true);
    for (const phrase of ['BMD Buchungsimport', 'BMD NTCS', 'a first test import with a Kanzlei is still pending']) expect(ENGLISH_README).toContain(phrase);
    for (const link of ['](README.md)', '](DISCLAIMER.md)', '](LICENSE)']) expect(ENGLISH_README).toContain(link);
    expect(ENGLISH_README).toContain('There is no npm package or container image release yet. You install from source.');
    expect(ENGLISH_README).toMatch(/issues and pull requests in English are welcome/i);
    expect(ENGLISH_README).not.toContain('<!-- quickstart -->');
  });

  it('shows the same install commands as the German quick start, without the shell comments', () => {
    expect(firstShellBlock(ENGLISH_README)).toEqual(INSTALL_BLOCK.map(withoutComment));
    for (const command of ['init-mapping --property BSP --template ekr', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
      expect(ENGLISH_README).toContain(command);
    }
  });
});

describe('docs folder', () => {
  it('has every guide under one German file name', () => {
    for (const file of [
      'setup-apaleo.md',
      'mapping-guide.md',
      'bmd-import.md',
      'configuration.md',
      'docker.md',
      'troubleshooting.md',
      'architecture.md',
      'maintainers.md',
      'bmd-format.md',
      'posting-rules.md',
      'export.md',
      'apaleo-source.md',
      'examples/README.md',
    ]) {
      expect(existsSync(join(ROOT, 'docs', file)), file).toBe(true);
    }
    for (const file of ['setup-apaleo.de.md', 'mapping-guide.de.md', 'datev-import.md', 'datev-format.md']) expect(existsSync(join(ROOT, 'docs', file)), file).toBe(false);
  });

  it('docs/setup-apaleo.md lists the exact permissions, the optional one marked optional', () => {
    const text = readRepoFile('docs/setup-apaleo.md');
    for (const permission of [...APALEO_PERMISSIONS.required, ...APALEO_PERMISSIONS.optional]) expect(text).toContain(`\`${permission}\``);
    const [optional] = APALEO_PERMISSIONS.optional;
    expect(text).toMatch(new RegExp(`\`${optional}\`.*\\| optional \\|`));
    expect(text).toContain('Apps > Connected apps');
    expect(text).toContain(APALEO_PERMISSIONS.scopeAlternative);
  });

  it('docs/setup-apaleo.md follows the real apaleo screens in order and recommends "Omit all"', () => {
    const text = readRepoFile('docs/setup-apaleo.md');
    const names = ['Add a new app', 'Add custom app', 'New simple client', 'Secret description', 'Search permission', 'Omit all'];
    const positions = names.map((name) => text.indexOf(`**${name}**`));
    expect(positions.every((position) => position >= 0), names.join(', ')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const name of ['All properties', 'Only selected properties', 'Retrieve', 'Omit linked']) expect(text).toContain(`**${name}**`);
    expect(text).toContain('Wähle **Omit all**');
  });

  it('describes apaleo as tested live: precise amounts, the first live test and the aggregate rule', () => {
    const source = readRepoFile('docs/apaleo-source.md');
    expect(source).toContain('bis zu acht Nachkommastellen');
    expect(source).toContain('Nur der Bruttobetrag (`grossAmount`) muss ganze Cent sein');
    expect(source).not.toMatch(/ein Betrag, der mehr als 0,0001 von einem ganzen Cent abweicht, stoppt den Export/);
    for (const answer of ['`parentNumber`', '**negativem** Betrag', '`PostPrepaymentVat`', '**Saldo**', '/Offset']) expect(source).toContain(answer);
    const troubleshooting = readRepoFile('docs/troubleshooting.md');
    expect(troubleshooting).toContain('`netAmount` oder `taxes[…].amount`: Du nutzt eine alte Version');
    expect(troubleshooting).toContain('`grossAmount`: Das ist auch in der aktuellen Version ein echter Fehler');
    expect(readRepoFile('docs/export.md')).toContain('10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
  });

  it('documents every config key and every environment variable in docs/configuration.md', () => {
    const text = readRepoFile('docs/configuration.md');
    for (const path of configPaths()) expect(text, path).toContain(`\`${path}\``);
    for (const { variable } of [...ENV_OVERRIDES, ...SECRET_KEYS]) expect(text, variable).toContain(`\`${variable}\``);
    expect(text).toContain('`APALEO_BMD_CONFIG`');
  });

  it('has the Austrian rates, every account of the EKR template and a sign-off checklist in the mapping guide, and no English summary', () => {
    const guide = readRepoFile('docs/mapping-guide.md');
    expect(guide).not.toContain('English summary');
    expect(guide).toContain('**Beherbergung**: 10 %');
    expect(guide).toContain('**Getränke**: 20 %');
    for (const rule of ['§ 10 Abs. 2 Z 3 lit. c', 'ortsüblichen Frühstück', '§ 10 Abs. 3 Z 5', '(Z 6)', '(Z 12)', '**4,9 %**: seit 2026-07-01']) expect(guide, rule).toContain(rule);
    for (const topic of ['## Steuercode und USt-Satz', '## Ortstaxe, Nächtigungsabgabe, Gästeabgaben', '## Anzahlungen', '## Forderungsverlust', '## Zahlungen, Forderungen, Debitoren']) {
      expect(guide).toContain(`${topic}\n`);
    }
    expect(guide).toContain('](examples/mapping-BSP.example.csv)');
    const rules = readRepoFile('templates/ekr-hotel.rules.csv')
      .split(/\r?\n/)
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('apaleo_type;'));
    for (const line of rules) expect(line, line).toContain('Vorschlag (ungeprüft)');
    for (const account of new Set(rules.map((line) => line.split(';')[3]).filter(Boolean))) expect(guide).toContain(`\`${account}\``);
    expect(headings(guide, '##').at(-1)).toBe('Checkliste zur Freigabe durch die Kanzlei');
    expect(section(guide, '## Checkliste zur Freigabe durch die Kanzlei').match(/^- \[ \]/gm)?.length).toBeGreaterThanOrEqual(5);
  });

  it('Contributor adds a target: explains the SourceAdapter contract, the TargetWriter boundary with BmdBooking and where golden files go, announcing no other target', () => {
    const architecture = readRepoFile('docs/architecture.md');
    for (const phrase of ['SourceAdapter', 'LedgerLine', 'Smoobu', 'test/fixtures/', 'FakeSource', '## Die Schnittstelle TargetWriter', 'BmdBooking', 'test/golden/<ziel>/', 'Ein Beispiel ohne Zusage']) {
      expect(architecture).toContain(phrase);
    }
    expect(architecture).not.toMatch(/lexoffice|geplant ist (ein|der)/i);
  });

  it('First import in BMD: docs/bmd-import.md names the menu path, the Buchungssymbol per property, the period and the checklist', () => {
    const guide = readRepoFile('docs/bmd-import.md');
    for (const phrase of ['**Buchen > Buchungen importieren**', '**Menü > Extras > Buchungen importieren**', 'Vorerfassung', '## Buchungssymbol anlegen', '`properties[].buchsymbol`', '## Periode und Datum', 'Buchungsperiode']) {
      expect(guide, phrase).toContain(phrase);
    }
    const checklist = section(guide, '## Erster Import: bitte prüfen');
    for (const item of ['Saldenliste', 'UVA-Vorschau', 'Steuercode 1 in KZ 022', 'KZ 029', 'KZ 000/022/029', 'Forderungsverlust erscheint als Minderung', 'Ortstaxe', 'keinen fixen Steuercode', 'Belegnummern-Duplikate']) {
      expect(checklist, item).toContain(item);
    }
  });

  it('Going public later: docs/maintainers.md has the "Vor der Veröffentlichung" checklist, starting with the test import', () => {
    expect(MAINTAINERS).toContain('**niemand außerhalb kann sie sehen, bis der Maintainer das Repository öffentlich macht**');
    const checklist = section(MAINTAINERS, '## Vor der Veröffentlichung');
    const steps = checklist.split('\n').filter((line) => /^\d+\. \[ \] /.test(line));
    expect(steps[0]).toMatch(/Testimport in BMD NTCS.*\[Testimporte\]\(#testimporte\)/);
    for (const step of ['--visibility public', 'Vorschaubild (Social Preview)', 'Discussions', 'v0.1.0']) expect(checklist).toContain(step);
    expect(checklist).not.toContain('[x]');
  });

  it('records test imports under "Testimporte" in a table with date, BMD version, dialect and result', () => {
    expect(section(MAINTAINERS, '## Testimporte')).toContain('| Datum | BMD-Version | Dialekt | Ergebnis |');
  });

  it('plans later only items inside this product, no other target formats', () => {
    const backlog = section(MAINTAINERS, '## Später geplant');
    for (const item of ['Personenkonten-Datei', 'Summendatei', 'Gebühren aus Abrechnungsdateien', 'E-Mail-Versand', 'Dauerprozess mit eigenem Zeitplan', 'Überwachung und Alarme', 'Dependabot', 'Veröffentlichung auf npm oder in einer Registry']) {
      expect(backlog).toContain(item);
    }
    expect(backlog).not.toMatch(/DATEV|RZL|lexoffice|Mews|Smoobu|Zielformat/);
  });

  it('Metadata applied: lists the German description and every topic for discoverability', () => {
    const topics = ['apaleo', 'bmd', 'bmd-ntcs', 'bmd-export', 'buchungsimport', 'ekr', 'hotel', 'hospitality', 'accounting', 'buchhaltung', 'steuerberater', 'austria', 'oesterreich'];
    expect(MAINTAINERS).toContain(`--add-topic ${topics.join(',')}`);
    expect(MAINTAINERS).toMatch(/--description "Kostenloser apaleo BMD Export.*BMD NTCS/);
    expect(section(MAINTAINERS, '## Das Repository ist vorerst privat')).not.toContain('--visibility');
  });
});

describe('readme-quickstart CI job', () => {
  const workflow = parse(readRepoFile('.github/workflows/ci.yml')) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const runs = workflow.jobs['readme-quickstart']?.steps.map((step) => step.run ?? '') ?? [];

  it('extracts the README block after the quickstart marker, runs it, then the demo dry run and checks its BMD summary', () => {
    expect(runs.join('\n')).toContain('<!-- quickstart -->');
    expect(runs).toContain('bash -euxo pipefail "$RUNNER_TEMP/quickstart.sh"');
    const demo = runs.at(-1) ?? '';
    expect(demo.startsWith('node dist/cli/main.js export --month 2026-09 --demo --dry-run | tee "$RUNNER_TEMP/demo.txt"\n')).toBe(true);
    for (const line of ['^Import into BMD', '^Totals per BMD account', '^DEMO Result: dry run']) expect(demo).toContain(`grep -q '${line}`);
  });
});
