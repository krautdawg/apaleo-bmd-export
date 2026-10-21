## MODIFIED Requirements

### Requirement: Export command
The CLI SHALL provide `apaleo-bmd export` taking either `--from <date> --to <date>` (inclusive business dates) or `--month <YYYY-MM>`, an optional `--property <id>` (default: every configured property), and the flags `--dry-run` and `--overwrite`. It SHALL exit with code 0 when every property and month succeeded and 1 when any failed.

#### Scenario: Monthly export
- **WHEN** the user runs `apaleo-bmd export --month 2026-10 --property BSP` with a complete mapping
- **THEN** one file of the configured target for 2026-10-01 to 2026-10-31 is written for BSP and the exit code is 0

#### Scenario: Missing period
- **WHEN** the user runs `apaleo-bmd export` without a period
- **THEN** the CLI exits with code 2 and explains `--month` and `--from/--to`

## ADDED Requirements

### Requirement: Target writer boundary
The export pipeline SHALL write files only through a `TargetWriter` that provides the file name for a property and period, the file-name pattern used to find existing and overlapping files of that target, the rendered bytes, the comparison that decides whether an existing file is unchanged, and the protocol title. `src/export/` SHALL NOT import a target module's internals other than its `TargetWriter`, and the output folder logic SHALL NOT contain a target-specific file pattern.

#### Scenario: DATEV output unchanged behind the boundary
- **WHEN** the golden-file tests run after the writer is wrapped as a `TargetWriter`
- **THEN** every golden EXTF file and protocol is byte-identical to before

#### Scenario: Pattern and comparison come from the writer
- **WHEN** a test runs the export with a fake `TargetWriter` whose files are named `FAKE_<from>-<to>_<propertyId>.txt` and whose comparison ignores nothing
- **THEN** existence, overlap (`E-PERIOD-OVERLAP`), unchanged re-runs and `E-FILE-EXISTS` work for the fake files exactly as for EXTF files, and no EXTF name appears in the output folder
