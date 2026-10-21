## 1. Rename

- [ ] 1.1 Set `package.json` `name` to `apaleo-bmd-export`, `version` to `0.0.0`, `bin` to `{ "apaleo-bmd": "dist/cli/main.js" }`, and the description to the BMD product; update `pnpm-lock.yaml` with `pnpm install`
- [ ] 1.2 In `src/core/config.ts` rename `CONFIG_PATH_ENV` to `APALEO_BMD_CONFIG`, the default file names to `apaleo-bmd.config.{yaml,yml,json}`, the env prefix to `APALEO_BMD_` and every allow-list entry (`APALEO_BMD_OUTPUT_DIR`, `APALEO_BMD_TIMEZONE`, ...); keep `APALEO_CLIENT_ID` and `APALEO_CLIENT_SECRET`
- [ ] 1.3 Rename the binary in `src/cli/help.ts`, usage lines, error hints and `src/cli/version.ts` output
- [ ] 1.4 Rename `apaleo-datev.config.example.yaml` to `apaleo-bmd.config.example.yaml` and `examples/demo/apaleo-datev.config.yaml` to `examples/demo/apaleo-bmd.config.yaml`; update every reference
- [ ] 1.5 Update `.gitignore` (`/apaleo-bmd.config.*`), `Dockerfile` (entry point `apaleo-bmd`, `/config/apaleo-bmd.config.yaml`), `docker-compose.example.yml`, `.env.example` and the CI workflow: the steps that call the binary, the `readme-quickstart` filter (`grep -v ... -e '^cd apaleo-bmd-export$'`) and the `docker` job image tag (`apaleo-bmd-export:ci`)
- [ ] 1.6 Replace `apaleo-datev` command lines and `APALEO_DATEV_*` names in README, README.en.md and `docs/`, and every pointer to the DATEV repository that would install or show the wrong project: the quick-start `git clone https://github.com/krautdawg/apaleo-bmd-export.git` and `cd apaleo-bmd-export` lines, the CI badge URLs and `apaleo-datev.config.example.yaml` links (prose otherwise unchanged)
- [ ] 1.7 Update tests that name the binary, config file or env variables; add the cli scenarios "Old binary name is gone" and "Old variable names are not read"

## 2. Target writer boundary

- [ ] 2.1 Add `src/export/target.ts` with the generic `TargetWriter<B>` interface (file name, file pattern with from/to captures, render, sameContent, protocol title)
- [ ] 2.2 Wrap the DATEV writer as `datevTarget: TargetWriter<PostedBooking>` (file pattern `EXTF_Buchungsstapel_...`, `sameContent` ignoring header field 6) in `src/datev/target.ts`
- [ ] 2.3 Change `src/export/output.ts` to take pattern and comparison from the writer (remove `EXTF_FILE` and `withoutCreationTime` from the module), and `src/export/pipeline.ts` to call `target.render` and `target.fileName`
- [ ] 2.4 Add the fake-target test (existence, overlap, unchanged, `E-FILE-EXISTS`, `--overwrite`) in `test/export/target.test.ts`
- [ ] 2.5 Confirm every DATEV golden file and protocol is byte-identical (`pnpm test` without `UPDATE_GOLDEN`)

## 3. Release check

- [ ] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; `node dist/cli/main.js --help` shows `apaleo-bmd`
- [ ] 3.2 `docker build` and `docker run <image> --help` work with the new entry point
- [ ] 3.3 `grep -rn "apaleo-datev\|APALEO_DATEV" --exclude-dir=node_modules --exclude-dir=openspec .` returns only the README H1, the tagline, the comparison table heading (the prose b08 rewrites) and the CHANGELOG history; no clone URL, `cd` line, badge, CI step or image tag
