## MODIFIED Requirements

### Requirement: Compose and env examples
The repository SHALL contain `docker-compose.example.yml` (one locally built service `apaleo-bmd` with the image name `apaleo-bmd-export:local`, restart policy, config and data volumes, env file, a `while sleep` loop around `schedule --once`) and `.env.example` listing the secret variable names with empty values, and `docs/docker.md` SHALL document in German the loop, the host-cron alternative and where the Kanzlei finds the BMD files.

#### Scenario: No secret values committed
- **WHEN** the repository is inspected
- **THEN** `.env.example` contains only variable names with empty values and `.env` is git-ignored

#### Scenario: No customer data committed
- **WHEN** the documented compose or host-cron setup creates `config/`, `data/` and `schedule.log` inside the clone
- **THEN** git ignores all three, as well as a root `mapping-*.csv`, so `git add -A` cannot commit account numbers, the mapping or exported bookings

#### Scenario: Image name is local
- **WHEN** `docker-compose.example.yml` is inspected
- **THEN** the service has both `build:` and `image: apaleo-bmd-export:local`, and no registry host appears

### Requirement: Image build check without publishing
CI SHALL build the image and run it with `--help` and `--version` and the real demo (`export --month 2026-09 --demo` with `-w /data` on a data folder owned by uid 1000) on every pull request, SHALL check that the demo file `demo-output/BSP/2026-09/BMD_Buchungsimport_20260901-20260930_BSP_DEMO.csv` exists, and SHALL NOT log in to or push to any container registry. The image SHALL carry OCI labels for title `apaleo-bmd-export`, description, source and licence `MIT`.

#### Scenario: Pull request
- **WHEN** a pull request changes the Dockerfile
- **THEN** the `docker` job builds the image, runs the three commands, finds the demo file, and pushes nothing

#### Scenario: Labels
- **WHEN** `docker inspect` reads the built image
- **THEN** `org.opencontainers.image.title` is `apaleo-bmd-export` and `org.opencontainers.image.licenses` is `MIT`
