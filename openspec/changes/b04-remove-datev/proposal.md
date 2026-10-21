## Why

After b03 the export writes BMD files end to end, and the DATEV code is no longer reached: `src/datev/`, the SKR03/SKR04 templates, the Grman mapping reader, the Automatikkonten logic, the DATEV tests and golden files and the DATEV docs. Deleting them in a slice of their own keeps b03 reviewable as an engine switch, and this slice reviewable as "only deletions, no behaviour change".

## What Changes

- **BREAKING** Remove `src/datev/` (EXTF writer, header, `datevTarget`), `test/datev/`, the EXTF golden files and `test/helpers/extf.ts`.
- **BREAKING** Remove `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv`, the Grman reader, `src/mapping/automatic-accounts.ts` and the BU-Schlüssel helpers, with their tests.
- Remove `src/datev` from the lint boundary.
- Remove `docs/datev-format.md` and `docs/datev-import.md`; fix links; remove the finding codes that no longer exist in the source from `docs/troubleshooting.md` (SKR, Automatikkonto, Grman, EXTF codes); update the docs test's required-file list.
- Remove the DATEV repository topics from the list in `docs/maintainers.md` (final list in b08).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `datev-extf-writer`: removed.
- `project-quality`: `src/datev` leaves the lint boundary.

## Non-goals

- No behaviour change: every BMD golden file, protocol and test from b03 stays byte-identical.
- No README or guide rewrite beyond removing dead links and codes (b08).

## Impact

- Deleted: `src/datev/`, `test/datev/`, EXTF golden files, `test/helpers/extf.ts`, `templates/skr0*-hotel.rules.csv`, Grman and Automatikkonten code in `src/mapping/`, `docs/datev-*.md`.
- Changed: `eslint.config.js`, `test/lint/boundaries.test.ts`, `test/docs.test.ts` (file list), `docs/troubleshooting.md`, `docs/maintainers.md`, links in `docs/`.
