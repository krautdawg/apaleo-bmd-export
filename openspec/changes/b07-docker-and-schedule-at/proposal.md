## Why

The schedule mode and the Docker setup came over from the DATEV project unchanged apart from the binary name (b01): the default time zone is Europe/Berlin, the image is still tagged and labelled as the DATEV tool, the CI image job runs a DATEV-era demo, and `docs/docker.md` explains a German setup. Austrian hotels run the tool unattended, so these defaults must be right before the docs and release (b08).

## What Changes

- **BREAKING** Default `schedule.timezone` becomes `Europe/Vienna`; examples and docs use Vienna.
- Local image name `apaleo-bmd-export:local` in `docker-compose.example.yml` and the docs, OCI labels (`org.opencontainers.image.title`, `description`, `source`, `licenses`) for the BMD product; the compose service is called `apaleo-bmd`.
- CI `docker` job builds the image, runs `--help`, `--version` and the real demo with `-w /data`, checks that `demo-output/BSP/2026-09/BMD_Buchungsimport_20260901-20260930_BSP_DEMO.csv` exists, and pushes nothing.
- Scheduler spec wording uses `apaleo-bmd schedule --once`; behaviour (cadences, finality, catch-up, exit codes) unchanged.
- German `docs/docker.md` rewritten for the BMD product (compose loop, host-cron alternative, the demo in the image, `chown` hint, where the Kanzlei finds the files).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scheduler`: command name and default time zone.
- `container-deployment`: image name and labels, compose service, CI image check runs the BMD demo.

## Non-goals

- No registry push, no published image, no Helm chart or systemd unit.
- No in-process daemon; `schedule --once` from cron or the compose loop stays the only mode.
- No change to the finality rules (D+2 after `finalAfter`).

## Impact

- `src/core/config.ts` (default time zone), `Dockerfile`, `docker-compose.example.yml`, `.env.example`, `.github/workflows/ci.yml`.
- Tests in `test/schedule/*`, `test/cli/schedule.test.ts`, `test/repo-files.test.ts`.
- `docs/docker.md`, `docs/configuration.md`.
