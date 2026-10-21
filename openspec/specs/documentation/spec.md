# documentation Specification

## Purpose
The German README with a short English `README.en.md`, the German guides in `docs/`, the example output in `docs/examples/`, the `export --demo` mode that shows the output without apaleo, and the test that keeps commands, flags, config keys, finding codes, links, anchors and the language of the docs in line with the code.
## Requirements
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

### Requirement: Example output and demo mode
The repository SHALL contain `docs/examples/` with a golden BMD Buchungsimport file, its protocol text and a filled sample EKR mapping CSV for the Austrian "Hotel Beispiel", linked from the README and the mapping guide, and `apaleo-bmd export --demo` SHALL run the pipeline on bundled Austrian demo data with no config, secret or network, marking its output as demo.

#### Scenario: Kanzlei reviews before setup
- **WHEN** a Steuerberater opens `docs/examples/`
- **THEN** they find a `BMD_Buchungsimport_*.csv` file, its protocol and the mapping that produced it, and a test guarantees the BMD file equals the current golden output

#### Scenario: Demo without credentials
- **WHEN** someone runs `apaleo-bmd export --month 2026-09 --demo --dry-run` with no config file and no `APALEO_CLIENT_SECRET`
- **THEN** the summary is printed with a `DEMO` marker, no network call is made, and the exit code is 0

#### Scenario: Demo file is marked in its name
- **WHEN** someone runs `apaleo-bmd export --month 2026-09 --demo` without `--dry-run`
- **THEN** the file is written below `./demo-output/` with `_DEMO` after the property id in its name, every Buchungstext starts with `DEMO `, and the protocol's first line is `DEMO`, so it never looks like a real export in a file list or in BMD

#### Scenario: Demo in the Docker image
- **WHEN** someone runs the real demo in the image with `-w /data` and a data folder owned by uid 1000, as docs/docker.md shows
- **THEN** the files appear in that folder under `demo-output/`, and CI runs exactly that; without a writable working directory the run fails with `E-EXPORT` and a hint naming `-w /data`

### Requirement: Honest scope and comparison
The README SHALL include a `## Was es nicht macht` section (no upload to BMD or BMD Com, no Personenkonten-Stammdaten, no postings of payment-provider fees, chargebacks or booking-portal commissions, no Weboberfläche, no gehosteter Dienst, no other target formats such as DATEV or RZL) and a `## Vergleich mit kostenpflichtigen Connectoren` section that names no vendor, gives the price as "18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026", and states the trade-offs of self-hosting ("Selbst betreiben heißt"). It SHALL state in one sentence that the tool is built on apaleo-datev-export and link that project for DATEV users.

#### Scenario: Comparison table
- **WHEN** a reader looks at the comparison
- **THEN** it shows Preis, Betrieb, Einrichtung, Zustellung der Dateien, Personenkonten-Datei, Gebühren aus Abrechnungsdateien, Support and Vorlagen für die Zuordnung for both options, contains no vendor or product name of a competitor, and `test/readme.test.ts` finds the price sentence with "Oktober 2026"

### Requirement: Docs folder
The repository SHALL contain, in German, `docs/setup-apaleo.md` (custom app creation with the exact permissions, the optional one marked `optional`), `docs/mapping-guide.md` (columns, resolution order, Steuercodes, VAT guard, Ortstaxe by Bundesland, Anzahlungen, Forderungsverlust, payments, and a last section `## Checkliste zur Freigabe durch die Kanzlei`), `docs/bmd-import.md` (how the Kanzlei imports the file in BMD NTCS and what to check after the first import), `docs/bmd-format.md` (fields, rules and sources), `docs/configuration.md`, `docs/docker.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md` (`## Vor der Veröffentlichung` checklist, `## Testimporte` record and `## Später geplant` backlog with items inside this product only, no other target formats), `docs/posting-rules.md`, `docs/export.md`, `docs/apaleo-source.md` and `docs/examples/README.md`. The mapping guide SHALL explain that VAT rates depend on the service date (10 % Beherbergung including an ortsübliches Frühstück in the room price, § 10 Abs. 2 Z 3 lit. c UStG, and Speisen; 13 % for Schwimmbad and Therme admission, thermal treatment, culture and sports admissions, § 10 Abs. 3 Z 5, 6 and 12; 20 % for massages, spa treatments, parking, most drinks and other services; 4.9 % for listed staple foods since 2026-07-01) and SHALL list every template row marked `Vorschlag (ungeprüft)`. No `docs/datev-*.md` file SHALL exist.

#### Scenario: Steuerberater review
- **WHEN** a Steuerberater reads the mapping guide and a mapping CSV
- **THEN** they can decide each row without running the tool, and the guide ends with the sign-off checklist

#### Scenario: Contributor adds a source
- **WHEN** a contributor wants to add a Smoobu source
- **THEN** `docs/architecture.md` explains in German the SourceAdapter contract, the canonical ledger line (`LedgerLine`) and where tests and fixtures go

#### Scenario: Former German file names
- **WHEN** someone looks for `docs/setup-apaleo.de.md` or `docs/mapping-guide.de.md`
- **THEN** neither exists, and the README and every doc link `docs/setup-apaleo.md` and `docs/mapping-guide.md`

#### Scenario: Contributor adds a target
- **WHEN** a contributor wants to add a writer for another target format
- **THEN** `docs/architecture.md` explains in German the `TargetWriter` boundary, the `BmdBooking` example and where golden files go, without announcing any other target as planned

#### Scenario: First import in BMD
- **WHEN** a Kanzlei imports the first file
- **THEN** `docs/bmd-import.md` names the menu path, how to create the dedicated Buchungssymbol (one per property in a shared Mandant), the period settings, and a checklist to compare with the protocol (Saldenliste, UVA-Vorschau per rate with Steuercode 1 in KZ 022/029, Anzahlungen in KZ 000/022/029, USt-Berichtigung bei Forderungsverlust as a reduction, Ortstaxe and 0 % revenue accounts without fixed Steuercode, no Belegnummern-Duplikate)

### Requirement: Docs consistency test
The test suite SHALL check `README.md`, `README.en.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, every Markdown file in `docs/` and `examples/demo/README.md`. It SHALL fail when one of them contains, inside an `sh` or `bash` code fence, an `apaleo-bmd` command line whose command is not registered or whose flag is not in that command's options; when it contains a backticked token matching `^(apaleo|bmd|output|posting|properties|schedule|checks)(\.[A-Za-z\[\]]+)+$` that is not a config schema path; when a finding code (`[EWN]-[A-Z-]+`) used in the source is missing from `docs/troubleshooting.md` or a documented code no longer exists in the source; when a relative link outside code fences points to a missing file or to an anchor that is not a heading slug of its target (GitHub slug rules, umlauts kept); when a `*.de.md` file exists outside `node_modules/`, `dist/` and `openspec/`; when the prose of a German file is not predominantly German; when a German file other than `CODE_OF_CONDUCT.md` addresses the reader with "Sie"; or when a German file uses a term from German DATEV practice (`Buchungsstapel`, `BU-Schlüssel`, `SKR03`, `SKR04`, `Automatikkonto`, `Kurtaxe`, `Beherbergungssteuer`, `Übernachtungssteuer`, `Beraternummer`, `Mandantennummer`, `EXTF`, `Belegfeld`, `Festschreibung`, `UStVA`, `ELSTER`, `19 %` or `7 %`) or the token `DATEV`, except in the README sentence that names the origin project, the README `## Was es nicht macht` item about other target formats, `CHANGELOG.md`, and the `docs/troubleshooting.md` entries of the findings that detect a copied German setup (the DATEV-mapping error, the rejected `datev` config section and `W-VAT-RATE-UNUSUAL`).

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

#### Scenario: German levy or rate
- **WHEN** `docs/posting-rules.md` contains "Die Kurtaxe wird ohne Steuer gebucht" or "Getränke mit 19 %"
- **THEN** `pnpm test` fails naming the file and the term `Kurtaxe` or `19 %`

#### Scenario: Bare DATEV mention
- **WHEN** `docs/bmd-import.md` contains "wie beim DATEV-Import"
- **THEN** `pnpm test` fails naming the file and the token `DATEV`

#### Scenario: Allowed DATEV mention
- **WHEN** the README origin sentence links apaleo-datev-export for DATEV users and the `## Was es nicht macht` list says "keine anderen Zielformate wie DATEV oder RZL"
- **THEN** the term check passes for the README

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

### Requirement: Short English README
The repository SHALL contain `README.en.md` of at most 80 lines with: what the tool is, the disclaimer linking `DISCLAIMER.md`, a quick start with the same install commands as the German README and the sentence "There is no npm package or container image release yet. You install from source.", a list of the German guides, a contributing note that English issues and pull requests are welcome, and the licence linking `LICENSE`. It SHALL NOT contain the `<!-- quickstart -->` marker.

#### Scenario: International contributor
- **WHEN** an English-speaking developer opens the repository and follows the "English" link at the top of the README
- **THEN** `README.en.md` tells them what the tool does, how to install it from source, that the docs are German, and how to contribute

#### Scenario: English README stays short and in step
- **WHEN** `pnpm test` runs
- **THEN** it fails if `README.en.md` exceeds 80 lines, contains the quickstart marker, or lists install commands that differ from the German quick-start block apart from shell comments

### Requirement: No unverified compatibility claim
README and docs SHALL describe the file as following the documented BMD import layout (PR08/PR08A, dvo) and SHALL say that a first test import with a Kanzlei is pending, and SHALL NOT claim that the file was tested with or is accepted by BMD NTCS or BMD 5.5 ("getestet mit BMD", "kompatibel mit BMD NTCS", "BMD-zertifiziert") until `docs/maintainers.md` records a test import under `## Testimporte` with date, BMD version, dialect and result.

#### Scenario: Claim without a recorded import
- **WHEN** the README says "getestet mit BMD NTCS" and `## Testimporte` in `docs/maintainers.md` lists no import
- **THEN** `pnpm test` fails naming the README and the phrase

#### Scenario: Pending test import
- **WHEN** a Kanzlei reads the README first screen before any test import
- **THEN** it says that the file follows the documented BMD import layout and that the first test import is pending

