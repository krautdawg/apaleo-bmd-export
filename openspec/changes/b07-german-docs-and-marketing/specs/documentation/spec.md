## MODIFIED Requirements

### Requirement: README first screen
The README SHALL be German. Its first line SHALL be the H1 and SHALL contain "apaleo BMD Export", "kostenlos" and "Open Source". The first non-empty line after the H1 SHALL link `README.en.md`. Then, before any installation detail, the README SHALL show the German tagline "Kostenloser apaleo BMD Export: Buchungsimport für BMD NTCS aus apaleo, Open Source", CI, licence and Node.js badges, an intro paragraph that names `apaleo-bmd-export` and says it is built for Austrian hotels and their Kanzlei, the notice "Keine Gewähr, keine Steuerberatung" with "Lass deine Kontenzuordnung von deiner Steuerberatung prüfen" linking `DISCLAIMER.md`, and a `## Was es macht` list with five items.

#### Scenario: Visitor from a search
- **WHEN** someone opens the repository page
- **THEN** the first screen states in German that the tool is a free, open-source apaleo BMD Export that writes BMD Buchungsimport files for BMD NTCS, shows the disclaimer notice and links the English README

#### Scenario: Search terms in the first lines
- **WHEN** the title, tagline and intro paragraph are scanned
- **THEN** they contain apaleo, BMD, BMD NTCS, BMD-Export, Buchungsimport, Einheitskontenrahmen or EKR, Steuerberater, Buchhaltung, Hotel, Österreich, Open Source and kostenlos

### Requirement: Quick start that works
The README SHALL contain a `## Schnellstart` with five numbered steps labelled "apaleo Custom App anlegen.", "Installieren", "Kontenzuordnung anlegen", "Probelauf" and "Export" (create the apaleo custom app; install from source with `git clone`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; then `init-mapping --template ekr`, `export --dry-run`, `export`), and a `## Schnellstart mit Docker` that builds the image locally with `docker compose -f docker-compose.example.yml build`. It SHALL contain the sentence "Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.", SHALL NOT show `npx` or `docker pull` (nor shall `README.en.md`), and every command shown SHALL exist in the CLI. CI SHALL run the install block marked `<!-- quickstart -->` in `README.md` verbatim up to `--help` and then the demo dry run.

#### Scenario: Install commands run in CI
- **WHEN** the `readme-quickstart` CI job runs
- **THEN** it executes the German README's quick-start install block, `node dist/cli/main.js --help` exits 0, and `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints a BMD posting summary and exits 0 without network or credentials

#### Scenario: No dead-end install step
- **WHEN** `README.md` and `README.en.md` are scanned
- **THEN** they contain no `npx apaleo-bmd` and no `docker pull`, and each contains its sentence that there is no npm or registry release yet

### Requirement: Honest scope and comparison
The README SHALL include a `## Was es nicht macht` section (no upload to BMD or BMD Com, no Personenkonten-Stammdaten, no postings of payment-provider fees, chargebacks or booking-portal commissions, no Weboberfläche, no gehosteter Dienst, no other target formats such as DATEV or RZL) and a `## Vergleich mit kostenpflichtigen Connectoren` section that names no vendor, cites prices "laut apaleo Store, Oktober 2026", and states the trade-offs of self-hosting ("Selbst betreiben heißt"). It SHALL state in one sentence that the tool is built on apaleo-datev-export and link that project for DATEV users.

#### Scenario: Comparison table
- **WHEN** a reader looks at the comparison
- **THEN** it shows Preis, Betrieb, Einrichtung, Zustellung der Dateien, Personenkonten-Datei, Gebühren aus Abrechnungsdateien, Support and Vorlagen für die Zuordnung for both options and contains no vendor or product name of a competitor

### Requirement: Docs folder
The repository SHALL contain, in German, `docs/setup-apaleo.md` (custom app creation with the exact permissions, the optional one marked `optional`), `docs/mapping-guide.md` (columns, resolution order, Steuercodes, VAT guard, Ortstaxe by Bundesland, Anzahlungen, Forderungsverlust, payments, and a last section `## Checkliste zur Freigabe durch die Kanzlei`), `docs/bmd-import.md` (how the Kanzlei imports the file in BMD NTCS and what to check after the first import), `docs/bmd-format.md` (fields, rules and sources), `docs/configuration.md`, `docs/docker.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md` (`## Vor der Veröffentlichung` checklist and `## Später geplant` backlog), `docs/posting-rules.md`, `docs/export.md`, `docs/apaleo-source.md` and `docs/examples/README.md`. The mapping guide SHALL explain that VAT rates depend on the service date (10 % Beherbergung and Speisen, 20 % Getränke and other services, 13 % only in special cases, 4.9 % for listed staple foods since 2026-07-01) and SHALL list every template row marked `Vorschlag (ungeprüft)`. No `docs/datev-*.md` file SHALL exist.

#### Scenario: Steuerberater review
- **WHEN** a Steuerberater reads the mapping guide and a mapping CSV
- **THEN** they can decide each row without running the tool, and the guide ends with the sign-off checklist

#### Scenario: Contributor adds a target
- **WHEN** a contributor wants to add an RZL writer
- **THEN** `docs/architecture.md` explains in German the `TargetWriter` boundary, the `BmdBooking` example and where golden files go

#### Scenario: First import in BMD
- **WHEN** a Kanzlei imports the first file
- **THEN** `docs/bmd-import.md` names the menu path, the Buchungssymbol and period settings, and a checklist (Saldenliste, UVA-Vorschau per rate, Ortstaxe account, Anzahlungen) to compare with the protocol

### Requirement: Docs consistency test
The test suite SHALL check `README.md`, `README.en.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, every Markdown file in `docs/` and `examples/demo/README.md`. It SHALL fail when one of them contains, inside an `sh` or `bash` code fence, an `apaleo-bmd` command line whose command is not registered or whose flag is not in that command's options; when it contains a backticked token matching `^(apaleo|bmd|output|posting|properties|schedule|checks)(\.[A-Za-z\[\]]+)+$` that is not a config schema path; when a finding code (`[EWN]-[A-Z-]+`) used in the source is missing from `docs/troubleshooting.md` or a documented code no longer exists in the source; when a relative link outside code fences points to a missing file or to an anchor that is not a heading slug of its target (GitHub slug rules, umlauts kept); when a `*.de.md` file exists outside `node_modules/`, `dist/` and `openspec/`; when the prose of a German file is not predominantly German; when a German file other than `CODE_OF_CONDUCT.md` addresses the reader with "Sie"; or when a German file other than `CHANGELOG.md` uses a DATEV-only term (`Buchungsstapel`, `BU-Schlüssel`, `SKR03`, `SKR04`, `Automatikkonto`) outside the sentence that names the origin project.

#### Scenario: Renamed command
- **WHEN** a command is renamed in code but not in the README
- **THEN** `pnpm test` fails and names the stale mention and the file

#### Scenario: Stale flag
- **WHEN** `docs/bmd-import.md` shows ```` ```sh ```` `apaleo-bmd export --month 2026-10 --email` and `export` has no `--email` option
- **THEN** `pnpm test` fails naming `--email`, the command and the file

#### Scenario: Stale config key
- **WHEN** `docs/configuration.md` mentions `` `bmd.beraternummer` `` and the schema has no such key
- **THEN** `pnpm test` fails naming `bmd.beraternummer` and the file

#### Scenario: Other backticked text is ignored
- **WHEN** a doc mentions `` `BMD_` ``, `` `2890` `` or `` `Revenues` ``
- **THEN** the test does not treat them as config keys or commands

#### Scenario: Broken anchor after translation
- **WHEN** the README links `docs/docker.md#the-demo-in-the-image` and that heading is now `### Die Demo im Image`
- **THEN** `pnpm test` fails naming the README, the link and the missing anchor, and passes once the link is `docs/docker.md#die-demo-im-image`

#### Scenario: Umlaut anchor
- **WHEN** a doc links `../README.md#häufige-fragen` and the README has `## Häufige Fragen`
- **THEN** the link check passes

#### Scenario: English paragraph in a German doc
- **WHEN** `docs/troubleshooting.md` is left in English
- **THEN** `pnpm test` fails naming the file as not German, and `README.en.md` is the only checked file expected to be English

#### Scenario: Copied DATEV paragraph
- **WHEN** `docs/mapping-guide.md` contains "Trag den BU-Schlüssel ein"
- **THEN** `pnpm test` fails naming the file and the term `BU-Schlüssel`

### Requirement: German-first documentation
The README and every user-facing document SHALL be written in German only: `README.md`, every Markdown file in `docs/` (including `docs/examples/README.md`), `examples/demo/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, the issue forms and the pull-request template in `.github/`, and the comments in `apaleo-bmd.config.example.yaml`, `.env.example` and `docker-compose.example.yml`. The text SHALL address the reader with "du", SHALL use German words where a common one exists, and SHALL use BMD and Austrian accounting terms as practitioners do (Buchungsimport, Kontenplan, Einheitskontenrahmen, Sachkonto, Personenkonto, Gegenkonto, Steuercode, Buchungssymbol, Belegnummer, Ortstaxe or Nächtigungsabgabe, Anzahlung, UVA, Steuerberatung or Kanzlei). Source code, identifiers, CLI output, commit messages, `LICENSE`, `src/**/README.md`, `openspec/research/` and the OpenSpec specs SHALL stay English, and commands, flags, config keys, finding codes and quoted CLI output SHALL appear unchanged. No topic SHALL be documented in two languages, except `README.en.md` and the non-binding English translation in `DISCLAIMER.md`; there SHALL be no `*.de.md` files.

#### Scenario: Hotel reads a guide
- **WHEN** a hotel back office opens any file in `docs/`
- **THEN** the text is German, uses "du", and every command and config key in it is the one the CLI accepts

#### Scenario: Guide in two languages is rejected
- **WHEN** someone adds `docs/docker.de.md` or an English section to a German doc
- **THEN** `pnpm test` fails, naming the `.de.md` file or the file whose prose is not German

#### Scenario: Polite address is rejected
- **WHEN** a German doc contains "Prüfen Sie die Datei" or "Ihre Kanzlei"
- **THEN** `pnpm test` fails naming the file, while "Sie prüft die Datei" at the start of a sentence passes

#### Scenario: Code stays English
- **WHEN** the German docs are merged
- **THEN** no file under `src/` changed, the example config files changed only in comments, and the CLI prints the same output as before
