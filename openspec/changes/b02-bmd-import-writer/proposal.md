## Why

The product's output is a file that BMD NTCS imports through "Buchungen importieren" (BMD-Standard, variable record layout). No public specification of BMD exists, but the BMD import descriptions (PR08/PR08A, HOW2, NTCS changes) and the dvo BuErf handbook agree on the fields and rules. A pure, golden-tested writer is the foundation every later slice builds on.

## What Changes

- New module `src/bmd/` with the type `BmdBooking`, `renderBuchungsimport(bookings, options)` and `bmdTarget: TargetWriter<BmdBooking>`.
- Header line with the NTCS column names `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz`, one line per booking with `satzart` 0, `gegenbuchkz` E and `verbuchkz` A.
- Amounts with decimal comma and leading minus for Haben, `buchcode` derived from the sign, tax amount with the sign rule of BMD, dates `TT.MM.JJJJ`, Windows-1252, CRLF.
- Belegnummer: a deterministic 9-digit running number per file (`MM` + 7 digits), so BMD never merges unrelated lines into a Splittbuchung; the apaleo receipt number goes to `extbelegnr`.
- Validation of every field with findings (`E-BMD-*`), all collected in one error; text sanitising.
- Deterministic file name `BMD_Buchungsimport_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.csv`; unchanged means byte-identical.
- Golden files in `test/golden/bmd/`; German `docs/bmd-format.md` from `openspec/research/bmd-target.md` with sources and the open questions for the first test import.

## Capabilities

### New Capabilities

- `bmd-import-writer`: the BMD Buchungsimport file (layout, field rules, encoding, validation, sanitising, file name, golden tests).

### Modified Capabilities

- `project-quality`: the source-adapter import boundary also covers `src/bmd`.

## Non-goals

- Not wired into `export` yet (b03 switches the pipeline); posting logic and mapping stay DATEV until then.
- No fixed 480-byte layout, no Satzart 1/2/6, no Personenkonten master data, no foreign currency, no OSS `filiale`.
- No BMD API or BMD Com upload.

## Impact

- New `src/bmd/{types,format,validate,sanitise,writer,target,index}.ts`, `src/bmd/README.md`.
- `src/datev/cp1252.ts` moves to `src/core/cp1252.ts` (shared by both writers until b03 removes DATEV).
- `eslint.config.js` boundary, `test/lint/boundaries.test.ts`, new `test/bmd/*`, `test/golden/bmd/*`.
- `docs/bmd-format.md`, `docs/troubleshooting.md` (new codes).
