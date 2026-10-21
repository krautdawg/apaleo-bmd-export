## Context

`src/export/output.ts` was built around EXTF: header line 1 with a creation timestamp (field 6), a manifest with a hash of the body without the header, and "unchanged" meaning "equal apart from field 6". The b01 `TargetWriter` already moved pattern and comparison to the target; b03 switched to `bmdTarget`. This slice removes the remaining DATEV assumptions, rewrites the human-readable artefacts and replaces the examples.

## Goals / Non-Goals

**Goals:**
- A Kanzlei can review `docs/examples/` and one protocol and know what will land in BMD.
- Re-runs stay safe: never two files for the same days, never a silent replacement of a file that may already be imported.

**Non-Goals:**
- Translating CLI output (stays English by project rule); the protocol is CLI output written to a file.

## Decisions

1. **Manifest without body hash.** `sha256` of the file is enough because the file is deterministic. Entries of older replaced files keep what is known. Manifest gains `taxByRate` (cents per rate) so a later run or the Kanzlei can compare with the UVA.
2. **Protocol sections.** Header (tool, version, property, period, `DEMO` when demo), the disclaimer line, an "Import" block (file name, line count, dialect, Buchungssymbole, Belegnummern range, `verbuchkz` A / `gegenbuchkz` E, Steuercodes and rates used, Sachkonten and Personenkonten length), then the summary tables, then findings. The Import block mirrors the checklist in `docs/bmd-import.md`.
3. **Demo marking in the data.** BMD has no file-level description, so the demo marks every `text` with the prefix `DEMO ` (the 40-character limit applies after the prefix) besides the file name and protocol. Alternative: a dedicated Buchungssymbol `DM`; rejected because a Kanzlei might really use `DM`.
4. **Demo property.** "Hotel Beispiel" in Wien, time zone Europe/Vienna, rates 10 % and 20 %, Ortstaxe, one deposit, one company invoice; the same data as the b03 demo, extended so the protocol shows each section.

## Risks / Trade-offs

- [A Kanzlei imports the demo file by mistake] → `DEMO` in file name, every text and the protocol; the import guide warns.
- [Old manifests from b03 runs contain `bodySha256`] → reading ignores unknown fields; no users exist yet.

## Migration Plan

None.

## Open Questions

None.
