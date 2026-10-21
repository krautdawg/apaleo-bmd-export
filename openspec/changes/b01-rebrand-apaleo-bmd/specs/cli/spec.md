## MODIFIED Requirements

### Requirement: CLI entry point with help and version
The tool SHALL install a binary named `apaleo-bmd` (package `apaleo-bmd-export`). Running it with `--help`, `-h` or no arguments SHALL print the usage, the list of registered subcommands with a one-line summary each, and a pointer to `DISCLAIMER.md`. Running it with `--version` SHALL print the package version. No binary named `apaleo-datev` SHALL be installed.

#### Scenario: Help output
- **WHEN** the user runs `apaleo-bmd --help`
- **THEN** the output starts with the usage line `apaleo-bmd <command> [options]`, lists every registered subcommand with its summary and mentions the disclaimer, and the exit code is 0

#### Scenario: Version output
- **WHEN** the user runs `apaleo-bmd --version`
- **THEN** the output is the version from `package.json` and the exit code is 0

#### Scenario: Old binary name is gone
- **WHEN** `package.json` is inspected after `pnpm build`
- **THEN** its `bin` field has exactly one entry, `apaleo-bmd`, and its `name` is `apaleo-bmd-export`

### Requirement: Subcommand dispatch and exit codes
The CLI SHALL dispatch to registered subcommands by name, SHALL support `apaleo-bmd <command> --help`, and SHALL use exit code 0 for success, 1 for runtime or validation failures, and 2 for usage errors.

#### Scenario: Unknown subcommand
- **WHEN** the user runs `apaleo-bmd frobnicate`
- **THEN** the CLI prints an error naming the unknown command and the help hint, and exits with code 2

#### Scenario: Unknown flag
- **WHEN** the user passes a flag that the subcommand does not define
- **THEN** the CLI prints an error naming the flag and exits with code 2

#### Scenario: Command runs against a fake context
- **WHEN** a test calls `runCli(['doctor'], ctx)` with a context from `createTestContext()` whose `fetchFn` throws on any call and whose `now()` returns 2026-10-20T08:00:00Z
- **THEN** the returned exit code is 0, the captured stdout contains the resolved config path, and no network call or real clock read happens

#### Scenario: Runtime failure
- **WHEN** a subcommand throws a user-facing error
- **THEN** the CLI prints the error message without a stack trace (unless `--debug` is set) and exits with code 1

### Requirement: Config file and environment loading
The CLI SHALL load configuration from the file given by `--config`, else from `APALEO_BMD_CONFIG`, else from `./apaleo-bmd.config.yaml`, accepting YAML or JSON. Values SHALL be validated against a schema, and every validation error SHALL name the offending key path. Secrets SHALL only be read from environment variables, and a secret key present in the config file SHALL be rejected. Environment overrides SHALL be limited to a documented allow-list of scalar keys; any other `APALEO_BMD_*` variable SHALL be rejected with an error naming it.

#### Scenario: Invalid config value
- **WHEN** the config file sets `datev.beraternummer: 12`
- **THEN** loading fails with an error that names `datev.beraternummer` and the allowed range

#### Scenario: Secret in config file
- **WHEN** the config file contains `apaleo.clientSecret`
- **THEN** loading fails with an error telling the user to set `APALEO_CLIENT_SECRET` in the environment instead

#### Scenario: Syntax error does not quote the file
- **WHEN** the config file has a YAML or JSON syntax error next to a line such as `clientSecret: SUPERSECRET`
- **THEN** loading fails with an error that gives the file path, line, column and kind of error, and does not quote any content of the file

#### Scenario: Empty section or value
- **WHEN** a section such as `apaleo:` has all its keys commented out, or a value such as `datev.beraternummer:` is left empty
- **THEN** the key is treated as missing, so defaults apply and a required key is reported as `is required`, whether or not an environment override is set

#### Scenario: Environment override
- **WHEN** `APALEO_BMD_OUTPUT_DIR=/data/out` is set and the file sets `output.dir: ./out`
- **THEN** the effective value of `output.dir` is `/data/out`

#### Scenario: Array key cannot be set from the environment
- **WHEN** `APALEO_BMD_PROPERTIES=BER,MUC` is set
- **THEN** loading fails with an error naming the variable and saying that `properties` is an array that can only be set in the config file

#### Scenario: Missing config file
- **WHEN** no config file exists at the resolved path and the subcommand needs config
- **THEN** the CLI exits with code 1 and prints the path it looked for and how to create the file

#### Scenario: Old variable names are not read
- **WHEN** only `APALEO_DATEV_CONFIG=/x/old.yaml` is set and `./apaleo-bmd.config.yaml` exists
- **THEN** the CLI loads `./apaleo-bmd.config.yaml` and ignores the old variable
