## MODIFIED Requirements

### Requirement: Example output and demo mode
The repository SHALL contain `docs/examples/` with a golden BMD Buchungsimport file, its protocol text and a filled sample EKR mapping CSV for the Austrian "Hotel Beispiel", linked from the README and the mapping guide, and `apaleo-bmd export --demo` SHALL run the pipeline on bundled Austrian demo data with no config, secret or network, marking its output as demo.

#### Scenario: Kanzlei reviews before setup
- **WHEN** a Steuerberater opens `docs/examples/`
- **THEN** they find a `BMD_Buchungsimport_*.csv` file, its protocol and the mapping that produced it, and a test guarantees the BMD file equals the current golden output

#### Scenario: Demo without credentials
- **WHEN** someone runs `apaleo-bmd export --month 2026-09 --demo --dry-run` with no config file and no `APALEO_CLIENT_SECRET`
- **THEN** the summary is printed with a `DEMO` marker, no network call is made, and the exit code is 0

#### Scenario: Demo file is marked
- **WHEN** someone runs `apaleo-bmd export --month 2026-09 --demo` without `--dry-run`
- **THEN** the file is written below `./demo-output/` with `_DEMO` after the property id in its name, every Buchungstext starts with `DEMO `, and the protocol's first line is `DEMO`, so it never looks like a real export in a file list or in BMD

#### Scenario: Demo in the Docker image
- **WHEN** someone runs the real demo in the image with `-w /data` and a data folder owned by uid 1000, as docs/docker.md shows
- **THEN** the files appear in that folder under `demo-output/`, and CI runs exactly that; without a writable working directory the run fails with `E-EXPORT` and a hint naming `-w /data`
