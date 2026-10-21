# src/demo

`export --demo`: the real export pipeline on the bundled data of the fabricated "Hotel Beispiel" in `examples/demo/`. No config file, no secret, no network.

- `source.ts`: `RecordedApaleoSource`, a `SourceAdapter` over recorded apaleo responses, parsed with the same schemas and converters as the live adapter in `src/sources/apaleo/`. A business day without a file has no transactions, like apaleo's 204.
- `index.ts`: `demoRun(ctx)` loads `examples/demo/apaleo-bmd.config.yaml` without the environment, resolves its mapping paths inside the demo folder, sends the output to `./demo-output/` and returns a context with the demo clock (2026-10-05) and the recorded source.

The output is marked `DEMO` three times: `_DEMO` in the file name (`fileTag`), `DEMO ` before every Buchungstext (the BMD target's `markDemo`) and `DEMO` as the first protocol line. `test/examples.test.ts` keeps `examples/demo/` identical to the test fixtures apart from the two demo-only days listed there, and `docs/examples/` equal to a real (unmarked) export of the demo data.
