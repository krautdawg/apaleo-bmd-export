## MODIFIED Requirements

### Requirement: Container image
The repository SHALL contain a multi-stage `Dockerfile` on Node.js 24 slim that runs as a non-root user, reads its config from `/config/apaleo-bmd.config.yaml`, writes exports to `/data`, and uses `apaleo-bmd` as entry point with `schedule --once` as default command.

#### Scenario: Run a one-off export in the container
- **WHEN** the user runs the locally built image with the config and mapping mounted at `/config`, a volume at `/data`, `APALEO_CLIENT_SECRET` set, and the arguments `export --month 2026-10`
- **THEN** the export file is written under `/data` and the container exits with the export's exit code

#### Scenario: Non-root
- **WHEN** the container starts
- **THEN** the process runs as user `node`, not root

### Requirement: Secrets from the environment only
The container SHALL need no secret in the mounted config: `APALEO_CLIENT_SECRET` SHALL come from the environment, and other overrides SHALL be limited to the documented allow-list of scalar keys from the `cli` capability plus `APALEO_BMD_TIMEZONE`.

#### Scenario: Compose with env file
- **WHEN** the user copies `.env.example` to `.env`, fills in the secret and runs `docker compose -f docker-compose.example.yml up -d --build`
- **THEN** the loop runs `schedule --once` with the secret from `.env` and the config from the mounted file

#### Scenario: Array key through the environment
- **WHEN** the compose file sets `APALEO_BMD_PROPERTIES=BSP`
- **THEN** the run fails with the message that `properties` can only be set in the config file
