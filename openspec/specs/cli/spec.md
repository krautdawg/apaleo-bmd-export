# cli Specification

## Purpose
The `apaleo-datev` command line interface: help and version output, subcommand dispatch, stable exit codes, the injected `CommandContext` that carries every side effect, and loading of the config file and environment.
## Requirements
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

### Requirement: Injected command context
Every subcommand SHALL receive a `CommandContext` (`env`, `stdout`, `stderr`, `cwd`, `now()`, `fetchFn`, `fs`, optional `sourceFactory`) and SHALL perform all I/O, clock reads and network calls through it. The dispatcher SHALL be callable in-process as `runCli(argv, ctx)` returning the exit code.

#### Scenario: Clock comes from the context
- **WHEN** a command that needs today's date runs with a context whose `now()` returns a fixed instant
- **THEN** its output depends only on that instant, not on the machine clock

### Requirement: Config file and environment loading
The CLI SHALL load configuration from the file given by `--config`, else from `APALEO_BMD_CONFIG`, else from `./apaleo-bmd.config.yaml`, accepting YAML or JSON. Values SHALL be validated against a schema, and every validation error SHALL name the offending key path. Secrets SHALL only be read from environment variables, and a secret key present in the config file SHALL be rejected. Environment overrides SHALL be limited to a documented allow-list of scalar keys; any other `APALEO_BMD_*` variable SHALL be rejected with an error naming it. A `datev` section SHALL be rejected with an error that names the `bmd` section. The `bmd` section SHALL accept `dialect` (`ntcs` or `bmd55`, default `ntcs`), `sachkontenlaenge`, `personenkontenlaenge`, `buchsymbol` (required, no default) and `buchsymbolZahlung` (optional), and each property MAY override `buchsymbol` and `buchsymbolZahlung`; a Buchungssymbol SHALL be 1 to 4 characters of `A-Z` and `0-9`, at most 2 with `bmd55`. `doctor` and the export protocol SHALL warn `W-BUCHSYMBOL-SHARED` when two configured properties have the same effective Buchungssymbol.

#### Scenario: Invalid config value
- **WHEN** the config file sets `bmd.sachkontenlaenge: 3`
- **THEN** loading fails with an error that names `bmd.sachkontenlaenge` and the allowed range

#### Scenario: Buchungssymbol missing
- **WHEN** the config file has a `bmd` section without `buchsymbol`
- **THEN** loading fails with an error that names `bmd.buchsymbol` as required and points to `docs/bmd-import.md` for creating the symbol in BMD

#### Scenario: Symbol too long for BMD 5.5
- **WHEN** the config file sets `bmd.dialect: bmd55` and `bmd.buchsymbol: PMS`
- **THEN** loading fails with an error that names `bmd.buchsymbol` and the limit of 2 characters

#### Scenario: Two properties share a symbol
- **WHEN** properties `BSP` and `BS2` are configured and neither overrides `bmd.buchsymbol`
- **THEN** `doctor` warns `W-BUCHSYMBOL-SHARED` naming both properties and the symbol, and explains that in one Mandant their Belegnummern would repeat

#### Scenario: Old DATEV section
- **WHEN** the config file contains `datev.beraternummer`
- **THEN** loading fails with an error saying that `datev` is not a section of apaleo-bmd and naming `bmd`

#### Scenario: Secret in config file
- **WHEN** the config file contains `apaleo.clientSecret`
- **THEN** loading fails with an error telling the user to set `APALEO_CLIENT_SECRET` in the environment instead

#### Scenario: Syntax error does not quote the file
- **WHEN** the config file has a YAML or JSON syntax error next to a line such as `clientSecret: SUPERSECRET`
- **THEN** loading fails with an error that gives the file path, line, column and kind of error, and does not quote any content of the file

#### Scenario: Empty section or value
- **WHEN** a section such as `apaleo:` has all its keys commented out, or a value such as `bmd.buchsymbol:` is left empty
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

