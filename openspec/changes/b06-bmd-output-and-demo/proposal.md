## Why

Since b03 the export writes BMD files, but the output folder rules, the protocol, the dry-run summary, the demo and the examples in `docs/examples/` still carry DATEV wording and DATEV assumptions (EXTF header field 6, "Bezeichnung", Buchungsstapel). A Kanzlei decides from these artefacts whether it trusts the tool, so they must speak BMD and Austrian accounting before the docs rewrite (b08).

## What Changes

- Output folder `<output.dir>/<propertyId>/<YYYY-MM>/` with `BMD_Buchungsimport_<from>-<to>_<propertyId>.csv`, its `.protokoll.txt` and `manifest.json` (file SHA-256, booking count, Soll and Haben totals, tax per rate, mapping SHA-256, tool version, creation time). The "body hash" without header is dropped: the BMD file has no volatile header.
- Idempotent re-runs compare the existing file byte by byte; `E-FILE-EXISTS`, `--overwrite`, lock file, `N-COMPANIONS-REPAIRED` and `E-PERIOD-OVERLAP` stay.
- Protocol and dry-run summary in BMD terms: totals per BMD account, net, tax and gross per rate, Ortstaxe, payments, deposits, write-offs, skipped lines, and an import note for the Kanzlei (dialect, Buchungssymbole, period, number of lines, Belegnummern range, `verbuchkz` A, Steuercodes used). CLI output stays English.
- `E-CURRENCY` explanation: BMD lines carry no currency, so everything must be EUR.
- Demo: Austrian "Hotel Beispiel" (Wien), `_DEMO` in the file name, `DEMO` as first protocol line and at the start of every Buchungstext, so an imported demo line is recognisable in BMD.
- `docs/examples/`: golden BMD file, protocol and EKR sample mapping, guaranteed equal to the current output by a test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `export-run`: EUR only, dry run, output layout and manifest, idempotent re-runs for BMD files.
- `documentation`: example output and demo mode for BMD.

## Non-goals

- No change to posting or mapping logic.
- No UVA-Kennzahlen mapping in the protocol (the Kanzlei's UVA comes from BMD).
- No email, S3 or other delivery.

## Impact

- `src/export/output.ts`, `src/export/summary.ts`, `src/export/pipeline.ts`, `src/demo/`, `examples/demo/`.
- `docs/examples/*`, `docs/export.md`, `docs/troubleshooting.md`.
- Tests in `test/export/*`, `test/cli/export.test.ts`, `test/cli/demo.test.ts`, `test/examples.test.ts`.
