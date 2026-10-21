## Why

The product's output is a file that BMD NTCS imports through "Buchungen importieren" (BMD-Standard, variable record layout). No public specification of BMD exists, but the BMD import descriptions (PR08/PR08A, HOW2, "Das Buchenprogramm in NTCS") and the dvo BuErf handbook agree on the fields and rules. A pure, golden-tested writer is the foundation every later slice builds on.

## What Changes

- New module `src/bmd/` with the type `BmdBooking`, `renderBuchungsimport(bookings, options)` and `bmdTarget: TargetWriter<BmdBooking>`.
- Dialect option `ntcs` (default) or `bmd55` that sets header names, date format (`TT.MM.JJJJ` or `JJJJMMTT`) and the Steuercode meanings together. NTCS header: `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz`; one line per booking with `satzart` 0, `gegenbuchkz` E and `verbuchkz` A.
- Amounts with decimal comma and leading minus for Haben, `buchcode` derived from the sign, tax amount with BMD's sign rule (output tax: NTCS code 1), Windows-1252, CRLF.
- Belegnummer: `MMDD` of the file's first day plus a 5-digit counter, unique across the non-overlapping files of a property within any twelve months, so BMD neither merges unrelated lines into a Splittbuchung nor sees duplicates under one Buchungssymbol; the apaleo receipt number goes to `extbelegnr`.
- Validation of every field with findings (`E-BMD-*`, including `kost`), all collected in one error; text sanitising.
- Deterministic file name `BMD_Buchungsimport_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.csv`; unchanged means byte-identical.
- Golden files per dialect in `test/golden/bmd/`; German `docs/bmd-format.md` with sources, the open questions and the first-import checklist.

## Capabilities

### New Capabilities

- `bmd-import-writer`: the BMD Buchungsimport file (dialects, layout, field rules, encoding, validation, sanitising, file name, golden tests).

### Modified Capabilities

- `project-quality`: the source-adapter import boundary also covers `src/bmd`.

## Non-goals

- Not wired into `export` yet (b03 switches the pipeline); posting logic and mapping stay DATEV until then.
- No fixed 480-byte layout, no Satzart 1/2/6, no Personenkonten master data, no foreign currency, no OSS `filiale`.
- No BMD API or BMD Com upload. No compatibility claim before a Kanzlei test import.

## Impact

- New `src/bmd/{types,format,validate,sanitise,writer,target,index}.ts`, `src/bmd/README.md`.
- `src/datev/cp1252.ts` moves to `src/core/cp1252.ts` (shared by both writers until b04 removes DATEV).
- `eslint.config.js` boundary, `test/lint/boundaries.test.ts`, new `test/bmd/*`, `test/golden/bmd/*`.
- `docs/bmd-format.md`, `docs/troubleshooting.md` (new codes).
