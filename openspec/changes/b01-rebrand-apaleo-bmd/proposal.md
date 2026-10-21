## Why

This repository is a copy of apaleo-datev-export v0.1.0: package, binary, config file, environment variables and container all say DATEV. Before any BMD code lands, the tool needs its own identity and a target-writer seam in the export pipeline, so the BMD writer (b02) plugs in without the pipeline being rewritten twice.

## What Changes

- **BREAKING** Package `apaleo-bmd-export` (version `0.0.0` until the first release), binary `apaleo-bmd`, help text and version output under the new name.
- **BREAKING** Config file `./apaleo-bmd.config.yaml` (or `.yml`/`.json`), `APALEO_BMD_CONFIG`, and the override prefix `APALEO_BMD_` (`APALEO_BMD_OUTPUT_DIR`, `APALEO_BMD_TIMEZONE`, ...). `APALEO_CLIENT_ID` and `APALEO_CLIENT_SECRET` stay. `apaleo-datev.config.example.yaml` becomes `apaleo-bmd.config.example.yaml`; `.gitignore` covers the new config names.
- A `TargetWriter` interface in `src/export/` (render bytes, file name, file pattern for existence and overlap, "unchanged" comparison, protocol title). The DATEV EXTF writer becomes its only implementation for now; its output stays byte-identical (golden files unchanged).
- Dockerfile entry point and config path, compose and `.env` examples follow the new names so the image keeps working.
- Every `apaleo-datev` command line in README and docs becomes `apaleo-bmd` (the docs test enforces it). The content of the docs is rewritten in b07.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: binary name `apaleo-bmd`, config file and environment names.
- `export-run`: command name; new requirement for the target-writer boundary.
- `apaleo-source`: command names of `properties` and `live-smoke`.
- `container-deployment`: config path, entry point and environment names in the image and examples.

## Non-goals

- No BMD output yet (b02), no mapping or posting change (b03), no German content rewrite (b07).
- No change of repository visibility, no publishing, no npm or registry release.
- The scheduler and account-mapping spec wording keeps the old command name until b03/b06 touch those requirements; the code is renamed here.

## Impact

- `package.json`, `src/cli/*`, `src/core/config.ts` (config path, env prefix, allow-list), `src/export/pipeline.ts`, `src/export/output.ts`, new `src/export/target.ts`, `src/datev/` (wrapped, not changed).
- Tests that name the binary, config file or env variables; `test/docs.test.ts` command extraction.
- `Dockerfile`, `docker-compose.example.yml`, `.env.example`, `.gitignore`, `.github/workflows/*` (CLI smoke step), README and docs command lines.
