## Why

With the BMD writer in place (b02), the export still maps apaleo accounts to DATEV accounts, BU-Schlüssel and Automatikkonten. Austrian Kanzleien need a Kontenzuordnung to BMD Sachkonten and Personenkonten with a Steuercode and rate per row, an EKR-based hotel template, and posting rules where BMD receives net amount and tax explicitly. This slice switches the product to BMD end to end; b04 deletes the then unused DATEV code separately.

## What Changes

- **BREAKING** Mapping CSV columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment`; DATEV and Grman mapping files are no longer read.
- **BREAKING** Config section `bmd` replaces `datev`: `dialect` (`ntcs` default, `bmd55`), `sachkontenlaenge` (default 4), `personenkontenlaenge` (default 6), `buchsymbol` (required, no default; the Kanzlei creates it), optional `buchsymbolZahlung`; per-property overrides `properties[].buchsymbol` and `properties[].buchsymbolZahlung`. `posting.belegfeld1` becomes `posting.extbelegnr`; `mandantennummer` and the DATEV env overrides are removed.
- EKR hotel template and `init-mapping --template ekr` (replaces `--skr`); revenue and deposit rows use the dialect's output-tax code (NTCS `1`); every row "Vorschlag (ungeprüft)"; Ortstaxe rows stay empty.
- `mapping check` for BMD: account lengths, NTCS Steuercodes (input-tax codes 2 and 3 rejected on revenue-side rows), Austrian rates, `kost` format, untaxed revenue rows.
- Posting rules for BMD: the VAT-side account is `konto` with net amount, rate, Steuercode and apaleo's tax; other lines book gross; `kost` only on profit-and-loss lines; payment symbol for payment lines.
- The pipeline uses `bmdTarget`; the plausibility checks use a BMD movement model.
- Demo data, posting fixtures and `docs/examples/` become Austrian; every `init-mapping` command line in README and docs uses `--template ekr`, so demo, CI and docs test stay green.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-mapping`: file format, validation, unmapped guard, EKR template replaces SKR templates, init-mapping, Grman format removed.
- `posting-rules`: VAT side in Konto, tax, guard, fields, symbols, summary.
- `cli`: `bmd` section, `datev` rejected.
- `export-run`: plausibility checks with the BMD movement model.

## Non-goals

- Deleting `src/datev`, the SKR templates and DATEV tests and docs: b04.
- Austrian special cases (Anzahlungen setup, Stornogebühren, Forderungsverlust, Ortstaxe per Bundesland): b05.
- Output wording, demo extension, Docker, full German docs: b06-b08.
- Personenkonten master data, cost-centre splits (Satzart 1).

## Impact

- `src/mapping`, `src/posting`, `src/core/config.ts`, `src/export/pipeline.ts`, `src/export/checks.ts`, `src/cli/commands`, demo data, `templates/ekr-hotel.rules.csv`.
- Tests under `test/mapping`, `test/posting`, `test/export`, `test/cli`, `test/examples.test.ts`.
- `README.md`, `README.en.md` (command lines only), `docs/mapping-guide.md`, `docs/posting-rules.md`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/export.md`, `docs/maintainers.md`, new `docs/bmd-import.md`, `docs/examples/`.
