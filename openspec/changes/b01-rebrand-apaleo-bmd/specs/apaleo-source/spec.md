## MODIFIED Requirements

### Requirement: Properties command
The CLI SHALL provide `apaleo-bmd properties`, which lists every property the custom app can read with id, code, name, time zone and currency.

#### Scenario: List properties
- **WHEN** the user runs `apaleo-bmd properties` with valid credentials
- **THEN** one line per property is printed and the exit code is 0

### Requirement: Live smoke command
The CLI SHALL provide `apaleo-bmd live-smoke --property <id> [--date YYYY-MM-DD]` that, against real credentials, fetches a token, the property, the chart of accounts and one business day of ledger and aggregates, prints counts and totals, reports whether per-reservation accounts carry `parentNumber` and whether deposit-release lines carry `taxes[]`, writes no files, and exits 0 only if every required step succeeded (a missing optional aggregate permission is reported, not fatal). The test suite SHALL NOT call it against the network.

#### Scenario: Smoke run succeeds
- **WHEN** a developer runs `apaleo-bmd live-smoke --property BSP` with a valid custom app
- **THEN** the output shows account counts by type, the number of ledger lines and debit and credit totals for the day, and the exit code is 0

#### Scenario: Smoke run without secret
- **WHEN** `APALEO_CLIENT_SECRET` is not set
- **THEN** the command exits with code 1 before any network call and names the missing variable
