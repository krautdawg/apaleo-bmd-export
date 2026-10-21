## 1. Schedule

- [ ] 1.1 Default `schedule.timezone` to `Europe/Vienna` in `src/core/config.ts`; update the config test and the schedule tests that relied on the default
- [ ] 1.2 Scheduler tests for the Vienna scenarios (monthly run at 06:30 Vienna, not yet due, finality in Vienna)

## 2. Docker

- [ ] 2.1 OCI labels in `Dockerfile`; compose service `apaleo-bmd` with `build:` and `image: apaleo-bmd-export:local`; `.env.example` comments in German
- [ ] 2.2 CI `docker` job: build, `--help`, `--version`, demo with `-w /data` on a uid-1000 folder, assert the demo file exists, no registry login or push
- [ ] 2.3 `test/repo-files.test.ts`: compose has `build:` and the local image name, no registry host; `.env.example` has empty values

## 3. Docs

- [ ] 3.1 Rewrite `docs/docker.md` in German for apaleo-bmd (compose loop, host cron, demo in the image, `chown` hint, output folder for the Kanzlei)
- [ ] 3.2 Update `docs/configuration.md` (`schedule.timezone` default, `APALEO_BMD_TIMEZONE`)
- [ ] 3.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; `docker compose -f docker-compose.example.yml build` works locally
