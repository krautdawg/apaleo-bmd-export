## Why

With the BMD writer in place (b02), the export still maps apaleo accounts to DATEV accounts, BU-Schlüssel and Automatikkonten. Austrian Kanzleien need a Kontenzuordnung to BMD Sachkonten and Personenkonten with a Steuercode and rate per row, an EKR-based hotel template, and posting rules where BMD receives net amount and tax explicitly. This slice switches the product from DATEV to BMD end to end.

## What Changes

- **BREAKING** Mapping CSV columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment`; the Grman DATEV export format is no longer read.
- **BREAKING** Config section `bmd` (`sachkontenlaenge` default 4, `personenkontenlaenge` default 6, `buchsymbol` default `AR`) replaces `datev`; `posting.belegfeld1` becomes `posting.extbelegnr`; property `mandantennummer` and the DATEV env overrides are removed.
- EKR hotel template (`templates/ekr-hotel.rules.csv`) and `init-mapping --template ekr`; every row "Vorschlag (ungeprüft)"; Ortstaxe rows stay empty with both options.
- `mapping check` for BMD: account lengths, Steuercodes, rates against apaleo and against the Austrian rate set (0, 4.9, 10, 13, 20 %).
- Posting rules for BMD: the VAT-side account is `konto` with net amount, rate, Steuercode and apaleo's tax amount; other lines book gross debit against credit; the per-line VAT guard, skip rules, field filling and summary adapted; untaxed deposit releases keep their rate inference and now also get the tax amount.
- The pipeline uses `bmdTarget`; the plausibility checks use a BMD movement model (konto gets amount, gkonto gets amount plus tax, BMD's tax account is not checked per account).
- **BREAKING** `src/datev/`, the SKR03/SKR04 templates and DATEV-only tests and docs are removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-mapping`: file format, validation, unmapped guard, EKR template replaces SKR templates, init-mapping, Grman format removed.
- `posting-rules`: VAT side in Konto, explicit tax, guard, city tax, deposits, fields, summary.
- `cli`: `bmd` section, `datev` rejected.
- `export-run`: plausibility checks with the BMD movement model.
- `project-quality`: `src/datev` leaves the lint boundary.
- `datev-extf-writer`: removed.

## Non-goals

- Austrian specifics beyond the basic rules (Anzahlung Steuercode policy, Stornogebühren, Forderungsverlust, Ortstaxe per Bundesland): b04.
- Spec wording of export output, demo and examples: b05. Docker and schedule: b06. Full German docs: b07.
- Personenkonten master data, one Personenkonto per company, cost-centre splits (Satzart 1).

## Impact

- `src/mapping`, `src/posting`, `src/core/config.ts`, `src/export`, `src/cli/commands`, demo data, `templates/`; `src/datev/` removed.
- Tests under `test/mapping`, `test/posting`, `test/export`, `test/cli`; `test/datev` removed.
- Docs: mapping guide, posting rules, configuration, troubleshooting; `docs/datev-*.md` replaced by `docs/bmd-format.md` and `docs/bmd-import.md`.
