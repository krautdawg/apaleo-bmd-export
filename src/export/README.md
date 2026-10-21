# src/export

The export pipeline that wires a source adapter to the core and writes files. All I/O, clock reads and network calls go through the injected `CommandContext` (enforced by lint). User guide: [docs/export.md](../../docs/export.md).

- `period.ts`: `--month` and `--from/--to` parsing, the split per calendar month, and the day rules (`E-DAY-NOT-CLOSED`, `W-RECENT-DAY`).
- `pipeline.ts`: `runExport(request, deps)`: per property and month, fetch, coverage, posting, plausibility checks, render and write; a failure stops only its own property-month.
- `checks.ts`: conservation, account movement per day (movement model of the BMD bookings), tax per rate against apaleo, and the opt-in aggregate check.
- `summary.ts`: the posting summary as text (dry run and protocol), with the target's import block after the first line.
- `target.ts`: the `TargetWriter` interface. The pipeline writes files only through it (`DEFAULT_TARGET`, or `deps.target` in tests); `src/export/` imports nothing else from a target module.
- `output.ts`: file plan (write, unchanged, replace, refuse), overlap guard, protocol and `manifest.json` (file SHA-256, bookings, journal Soll and Haben totals, tax per rate), using only the target's `filePattern`, `sameContent` and `advice` (the refusal wording names no accounting program). Reading the manifest keeps fields it does not know.
