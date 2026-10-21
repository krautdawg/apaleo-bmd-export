## Why

This repository started from apaleo-datev-export v0.1.0. Its first live test against a real apaleo sandbox (BER and VIE, 2026-10-21) showed that v0.1.0 cannot read real data: net and tax amounts arrive with eight decimals, an empty parent mapping row hides the wildcards, the aggregate check raises false alarms and the deposit summary misreads releases. v0.1.1 fixed this (commit `e16e75e`, change `s10-live-data-fixes`). The engine here is still v0.1.0, so b03 and b05 would build BMD posting on a parser that rejects every real day.

## What Changes

- Ledger lines keep apaleo's precise net and tax amounts beside the cent values; only gross must be whole cents, and gross must equal net plus taxes within half a cent.
- The resolver passes over empty parent rows to the wildcards; `E-UNMAPPED` groups per-reservation accounts by parent, type and rate and proposes the `*` row (also `*;AccountsReceivable` to the collective debtor).
- Aggregate check by balance per leaf global account or guest parent: net for revenue and deposits, VAT accounts against precise taxes, gross otherwise.
- Deposits classified by side and sign (received, released, refunded); accounts-receivable movement; unsigned skipped totals.
- Protocol and dry run show apaleo's precise VAT per rate beside the VAT per booking; `E-VAT-TOTAL` names the precise total and stays cent-exact.
- `live-smoke` warns on an empty day, counts deposit lines by kind, compares aggregates by balance.
- Recorded BER and VIE responses in `test/fixtures/apaleo/live/` with a privacy scan and full-pipeline regression tests through the current `TargetWriter`.
- b03, b05 and the overlapping deltas of b06 are revised to build on these fixes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `source-adapter-contract`: precise amounts on the ledger line.
- `apaleo-source`: amount parsing, aggregates, live-smoke.
- `account-mapping`: resolution past empty parent rows, grouped unmapped findings.
- `posting-rules`: VAT guard on rounded precise tax, deposits by side and sign, skipped totals, summary.
- `export-run`: aggregate and VAT checks, dry run, live-data regression.

## Non-goals

- DATEV-only parts of v0.1.1: SKR template version 2, `init-mapping --update` notes, `N-FOREIGN-VAT-RATES`, DATEV Buchungstexte, manifest Soll/Haben totals. Their BMD equivalents belong to b03, b05 and b06.
- Switching the pipeline to BMD (b03) or deleting DATEV code (b04).
- Version bump, tag or release.

## Impact

`src/sources/apaleo/`, `src/core/{source,money,aggregates,deposits}.ts`, `src/mapping/{resolve,check}.ts`, `src/posting/`, `src/export/{checks,summary}.ts`, `src/cli/commands/live-smoke.ts`, test helpers and fixtures, `docs/apaleo-source.md`, `docs/setup-apaleo.md`, `docs/troubleshooting.md`, `CHANGELOG.md`, and the planning files of b03, b05 and b06.
