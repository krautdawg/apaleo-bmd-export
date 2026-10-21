## Context

The engine (apaleo source, pipeline, checks, schedule, Docker) works and is tested. It calls the DATEV writer directly from `src/export/pipeline.ts`, and `src/export/output.ts` knows the EXTF file name pattern and the volatile header field 6 (Erzeugt am). `docs/architecture.md` already says that a second target is the moment to introduce a writer interface. BMD replaces DATEV in this product, but the replacement happens over b02-b03; b01 must stay green and releasable on its own.

## Goals / Non-Goals

**Goals:**
- New name everywhere a user types or reads it: binary, config file, env variables, container.
- One small `TargetWriter` seam so b02/b03 only add a BMD implementation and switch the default.
- No behaviour change of the export itself: same bookings, same DATEV bytes, same exit codes.

**Non-Goals:**
- Supporting two targets at runtime for end users. DATEV stays only as long as BMD is not wired (removed in b03).
- Migration aliases for the old names (`apaleo-datev`, `APALEO_DATEV_*`): this is a new product with no users yet.

## Decisions

1. **Interface shape.** `TargetWriter { id; fileName(meta): string; filePattern: RegExp (captures from/to); render(bookings, meta): Uint8Array; sameContent(existing, next): boolean; protocolTitle: string }`. `output.ts` takes the pattern and comparison from the writer instead of hard-coding EXTF and header field 6. Alternative considered: a generic "writer returns files" plug-in system with registration by name; rejected as more than two targets are not planned in this repo.
2. **Bookings type.** The pipeline passes the target's own booking type through (`TargetWriter<B>` generic). b03 changes the posting module to produce BMD bookings; the pipeline does not depend on booking fields except through the plausibility checks, which receive an "account movement" function from the target (added in b03).
3. **Rename by search, not by alias.** One commit replaces `apaleo-datev` with `apaleo-bmd` and `APALEO_DATEV_` with `APALEO_BMD_` in code, tests, examples, Docker and docs command lines; the docs test then proves no stale command remains. The H1 and prose of the README stay until b07 (the README test expects "apaleo DATEV Export" until then and is updated together with the content).
4. **Version `0.0.0`.** The engine's `0.1.0` belongs to apaleo-datev-export; the first apaleo-bmd-export release is cut in b07.

## Risks / Trade-offs

- [Docs still describe DATEV between b01 and b07] → acceptable while the repository is private; the README gets no new claims here.
- [A missed rename in a shell script or CI step] → CI runs the Docker `--help` smoke and the README quick-start block, both of which use the binary name.
- [Generic writer type leaks DATEV fields into the pipeline] → the pipeline only touches bookings through `TargetWriter` and the checks' movement function; a lint boundary test is extended in b02 for `src/bmd`.

## Migration Plan

None for users. Developers re-run `pnpm build`; local config files must be renamed to `apaleo-bmd.config.yaml`.

## Open Questions

None.
