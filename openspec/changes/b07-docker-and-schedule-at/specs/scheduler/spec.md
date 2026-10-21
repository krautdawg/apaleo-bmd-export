## MODIFIED Requirements

### Requirement: Daily and monthly cadences
`apaleo-bmd schedule --once` SHALL compute due periods for all configured properties on exactly one cadence: `monthly` (default), where a calendar month is due from `dayOfMonth` (1–5, default 3) of the following month, or `daily`, where a single day `d` is due once `d <= today − offsetDays` (offset 1–3, default 2). "Today" SHALL be the date of `ctx.now()` in `schedule.timezone` (default `Europe/Vienna`). `catchUpDays` SHALL be at least 3 with `cadence: monthly` and at least 5 with `cadence: daily`, because a run can hold a period back as not yet final until four days after its last day and the period must then still be inside the window.

#### Scenario: Monthly run
- **WHEN** cadence is monthly, dayOfMonth 3, `schedule.timezone` not set, and `ctx.now()` is 2026-11-03T05:30:00Z (06:30 in Vienna)
- **THEN** the export for 2026-10-01 to 2026-10-31 runs for every configured property

#### Scenario: Monthly not yet due
- **WHEN** cadence is monthly, dayOfMonth 3, and `ctx.now()` is 2026-11-02 in Vienna
- **THEN** October is not due, nothing is exported, and the command exits 0

#### Scenario: Daily run
- **WHEN** cadence is daily with offsetDays 2 and `ctx.now()` is 2026-10-20 10:00 in the configured time zone
- **THEN** the export for 2026-10-18 runs

#### Scenario: Invalid offset
- **WHEN** the config sets `daily.offsetDays: 0`
- **THEN** config validation fails naming `schedule.daily.offsetDays` and the range 1–3

#### Scenario: Catch-up window too small
- **WHEN** the config sets `cadence: daily` and `catchUpDays: 4`, or `cadence: monthly` and `catchUpDays: 2`
- **THEN** config validation fails naming `schedule.catchUpDays` and the minimum

### Requirement: Run once and exit
`apaleo-bmd schedule --once` SHALL exit with code 0 if every due period succeeded, was already exported, had no bookings or is not yet final, and 1 if any failed, printing one line per property and period with the result and every finding code (`E-`, `W-` and `N-`, except `N-NO-BOOKINGS`, which the result already states), each finding printed indented below the line. Each line SHALL be printed as soon as its property and period are done. A file-system error in the output folder (for example `EACCES`) SHALL fail only that property and period with `E-EXPORT` and the next step (for a permission error the `chown` command for the container user), and the run SHALL go on with the others. Running `apaleo-bmd schedule` without `--once` SHALL exit with code 2 and a hint to use `--once` from cron or the compose loop.

#### Scenario: External cron
- **WHEN** a system cron job calls `apaleo-bmd schedule --once` daily
- **THEN** the due period is exported and the process exits

#### Scenario: Failed period
- **WHEN** a due period fails with `E-UNMAPPED`
- **THEN** the output line names the property, the period and `E-UNMAPPED`, and the exit code is 1

#### Scenario: Warning on a written period
- **WHEN** a due period is written with the warning `W-VAT-ROUNDING`
- **THEN** the output line ends with `W-VAT-ROUNDING`, the finding follows indented, and the exit code is 0

#### Scenario: Output folder not writable
- **WHEN** the output folder of one property cannot be written or read (`EACCES`)
- **THEN** that property's line reads `failed E-EXPORT` with the `chown` hint, the other properties are still exported and printed, and the exit code is 1

#### Scenario: Unexpected error halfway
- **WHEN** an unexpected error stops the run after a file was written
- **THEN** the line for that file has already been printed
