# export-run Specification

## Purpose
The `export` command that turns one period of a property's apaleo ledger into DATEV Buchungsstapel files: period parsing and the split per month and fiscal year, the date rules that stand in for the night-audit status, the blocking coverage, posting and plausibility checks, the dry run, the output folder with protocol and manifest, and idempotent re-runs.
## Requirements
### Requirement: Export command
The CLI SHALL provide `apaleo-bmd export` taking either `--from <date> --to <date>` (inclusive business dates) or `--month <YYYY-MM>`, an optional `--property <id>` (default: every configured property), and the flags `--dry-run` and `--overwrite`. It SHALL exit with code 0 when every property and month succeeded and 1 when any failed.

#### Scenario: Monthly export
- **WHEN** the user runs `apaleo-bmd export --month 2026-10 --property BSP` with a complete mapping
- **THEN** one file of the configured target for 2026-10-01 to 2026-10-31 is written for BSP and the exit code is 0

#### Scenario: Missing period
- **WHEN** the user runs `apaleo-bmd export` without a period
- **THEN** the CLI exits with code 2 and explains `--month` and `--from/--to`

### Requirement: Period rules
The export SHALL split a period at calendar-month boundaries into one file per property and month, SHALL refuse a period that contains today or a later date in the property's time zone with `E-DAY-NOT-CLOSED`, and SHALL warn with `W-RECENT-DAY` when the period ends yesterday.

#### Scenario: Range across two months
- **WHEN** the user exports 2026-09-25 to 2026-10-05
- **THEN** two files are produced, 2026-09-25 to 2026-09-30 and 2026-10-01 to 2026-10-05

#### Scenario: Fiscal year not starting in January
- **WHEN** `datev.wjBeginn` is `07-01` and the user exports `--month 2027-03`
- **THEN** the header's WJ-Beginn is `20260701` and the file is written

#### Scenario: Today included
- **WHEN** the period ends on today's date in the property time zone, with today taken from the injected clock `ctx.now()`
- **THEN** no file is written and the error says the day is not closed by the night audit yet

### Requirement: Blocking checks before writing
For each property and month the export SHALL run the mapping coverage check, the posting rules and the plausibility checks before writing, and SHALL NOT write a file when any error finding exists. Errors SHALL be printed with code, explanation and the fix, and other property-months SHALL still be processed.

#### Scenario: Unmapped account blocks only its property
- **WHEN** property BSP has an unmapped booked account and property BSP2 is fully mapped
- **THEN** no file is written for BSP, the file for BSP2 is written, `E-UNMAPPED` is printed for BSP, and the exit code is 1

### Requirement: EUR only
The export SHALL refuse with `E-CURRENCY`, per property-month and before writing, a property whose currency is not EUR and a month with any ledger line whose currency is not EUR, because the BMD lines carry no currency and are booked in the Mandant's Grundwährung, and the tool does not convert.

#### Scenario: Swiss property
- **WHEN** the property's currency is CHF
- **THEN** `E-CURRENCY` names the currency, the ledger is not read and no file is written for that property

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped BMD account in the bookings equals the signed apaleo movement of the booked lines mapped to it, where a booking moves `konto` by its amount and `gkonto` by minus its amount plus tax, which is apaleo's gross (the tax leg on BMD's own tax account is not part of this check); and that per rate the tax amounts in the bookings equal the sum of apaleo's per-line tax rounded to cents of the booked lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. The `E-VAT-TOTAL` message SHALL also name apaleo's precise VAT total of the rate and the line-rounding difference; the difference between the tax per booking and apaleo's precise total SHALL never be an error by itself. When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day and compare each listed account's balance (debit minus credit) with the signed sum of that day's ledger lines: a side on a global chart account counts for that account, any other side for its main account; Revenues and Liabilities sides count with their precise net amount, all other types with their gross amount; each tax of a line with a Revenues side counts for the chart's `Vat` account of that VAT type and rate, and of a line with a Liabilities side for the `VatOnLiabilities` account, signed like that side; both balances are rounded to cents only for the comparison. A difference SHALL be reported as a warning. The aggregate comparison SHALL depend only on the ledger lines and the chart, never on the bookings of a target.

#### Scenario: Tax total per rate
- **WHEN** a defect makes the bookings at 20 % carry 4.00 tax in total while apaleo's per-line taxes at 20 %, rounded to cents, total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 20 % with both amounts and apaleo's precise total, and no file is written

#### Scenario: Line rounding is not an error
- **WHEN** the recorded VIE day 2026-10-21 is exported, where the bookings carry 7.74 tax at 10 % and apaleo's precise total is 7.74545454
- **THEN** no `E-VAT-TOTAL` is raised, and the protocol shows both amounts and the difference 0.01

#### Scenario: Roundings at another rate
- **WHEN** the posting run reported two `W-VAT-ROUNDING` differences of computed deposit tax at 10 % and the bookings at 20 % carry two cents more tax than apaleo charged
- **THEN** error `E-VAT-TOTAL` is reported for 20 % and no file is written

#### Scenario: Side bug is caught
- **WHEN** a defect writes a booking with a positive amount where the apaleo line credits the `konto` account
- **THEN** error `E-ACCOUNT-BALANCE` names the day, the BMD account and both signed amounts, and no file is written

#### Scenario: Aggregate check off by default
- **WHEN** `checks.aggregates` is not set
- **THEN** no aggregate request is sent and the custom app does not need `core.subledger_aggregate.create`

#### Scenario: Aggregate difference
- **WHEN** `checks.aggregates` is true and apaleo's daily balance for an account differs from the ledger lines of that day
- **THEN** warning `W-AGGREGATE-DIFF` names the day, the account, both balances and the basis (gross, net or tax), and the file is still written

#### Scenario: Normal real day has no aggregate warning
- **WHEN** `checks.aggregates` is true and the recorded VIE responses of 2026-10-21 are exported with the EKR live mapping
- **THEN** all 19 listed accounts match and no `W-AGGREGATE-DIFF` is raised

#### Scenario: Conservation violated
- **WHEN** a defect causes a ledger line to be neither booked nor listed as skipped
- **THEN** error `E-CONSERVATION` is raised and no file is written

### Requirement: Dry run
With `--dry-run` the export SHALL run every step except writing, SHALL print the posting summary (totals per BMD account; net, tax and gross per VAT rate with apaleo's precise VAT and the difference to the tax per booking; deposit tax per rate the same way; Ortstaxe and other levies; payments per clearing account; deposits received, released and refunded; accounts receivable; write-offs; skipped lines with unsigned totals; findings) and the import block of the protocol, and SHALL exit with code 1 if any error finding exists. The protocol file SHALL contain the same summary.

#### Scenario: Review before the first file
- **WHEN** the user runs `apaleo-bmd export --month 2026-10 --property BSP --dry-run`
- **THEN** the summary and the import block are printed and no file or folder is created

#### Scenario: VAT comparison on the recorded VIE day
- **WHEN** the recorded VIE day 2026-10-21 is exported with `--dry-run`
- **THEN** the summary shows for revenue at 10 % the tax 7.74 of the bookings, apaleo's VAT 7.75 and the difference 0.01, with one sentence explaining that the tax is rounded per booking and apaleo's total per day

#### Scenario: VAT comparison in the protocol
- **WHEN** the recorded VIE day 2026-10-21 is exported
- **THEN** the protocol shows for revenue `10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01` and `20 %: net 39.49, tax 7.89, gross 47.38, apaleo VAT 7.90, difference 0.01`, with the same sentence on the rounding

### Requirement: Output layout and manifest
The export SHALL write each file to `<output.dir>/<propertyId>/<YYYY-MM>/` with the deterministic name `BMD_Buchungsimport_<from>-<to>_<propertyId>.csv`, SHALL write a protocol text file `<name>.protokoll.txt` beside it, and SHALL record in `manifest.json` the file name, SHA-256 of the file, booking count, Soll and Haben totals as the Kanzlei sees them in BMD after the import (not sums by the sign of the amount), tax per rate, mapping file SHA-256, tool version and creation time. The protocol SHALL contain an import block with the file name, line count, the dialect, every Buchungssymbol used, the range of Belegnummern, the `verbuchkz` and `gegenbuchkz` values, every Steuercode and rate used, and the configured Sachkonten and Personenkonten lengths.

#### Scenario: Files after a run
- **WHEN** a monthly export for BSP 2026-10 succeeds
- **THEN** the folder `exports/BSP/2026-10/` contains `BMD_Buchungsimport_20261001-20261031_BSP.csv`, its protocol and a manifest entry with the file hash and the tax per rate

#### Scenario: Import block
- **WHEN** the October file for 2026-10-01 to 2026-10-31 has 812 bookings with Buchungssymbole `HO` and `HZ`, Steuercode 1 at 10 % and 20 % and Steuercode 81 at 0 %, in the `ntcs` dialect
- **THEN** the protocol names the dialect `ntcs`, `HO` and `HZ`, Belegnummern `100100001` to `100100812`, `verbuchkz A`, `gegenbuchkz E`, Steuercode 1 with 10 % and 20 % and Steuercode 81 with 0 %

### Requirement: Idempotent re-runs
Re-running an export for a period whose file exists SHALL do nothing when the new file is byte-identical to the existing one, SHALL refuse with `E-FILE-EXISTS` when any byte differs, and with `--overwrite` SHALL keep the old file under a `.replaced-<timestamp>.csv` name, write the new one and record both in the manifest. The comparison SHALL read the existing file, so it works without the manifest. When the file is unchanged but its protocol or current manifest entry is missing or describes another file (a run interrupted between writing the file and its companions), the run SHALL rewrite them and report `N-COMPANIONS-REPAIRED`. Writing SHALL hold an exclusive lock file in the property-month folder and SHALL re-check the file on disk under that lock, so two concurrent runs never both write or replace the same file; the run that finds the lock or a changed file SHALL fail that property-month with `E-EXPORT` and write nothing. An export whose period overlaps another BMD file in the same folder SHALL be refused with `E-PERIOD-OVERLAP`, because importing both would book the shared days twice.

#### Scenario: Unchanged re-run
- **WHEN** the same month is exported twice with unchanged apaleo data and mapping
- **THEN** the second run reports `unchanged`, rewrites nothing and exits 0

#### Scenario: Late posting changed the month
- **WHEN** a late posting changed the month after it was exported
- **THEN** the second run refuses with `E-FILE-EXISTS`, explains that the Kanzlei must delete the imported bookings of that file in BMD first, and suggests `--overwrite`

#### Scenario: Manifest deleted
- **WHEN** `manifest.json` was deleted and the same month is exported again with unchanged data
- **THEN** the run reports `unchanged` by comparing the existing file, leaves the BMD file untouched and writes the missing manifest entry again (`N-COMPANIONS-REPAIRED`)

#### Scenario: Config changed the content
- **WHEN** the month was exported and `bmd.buchsymbol` was changed before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, and with `--overwrite` it replaces the file and the new lines carry the new Buchungssymbol

#### Scenario: Config changed the header
- **WHEN** the month was exported and `bmd.dialect` was changed to `bmd55` before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, because the header line and the date in every line differ, and with `--overwrite` it replaces the file and the new header line carries the BMD 5.5 field names

#### Scenario: Overlapping period
- **WHEN** the folder holds the file for 2026-09-01 to 2026-09-30 and the user exports 2026-09-20 to 2026-09-30
- **THEN** the export refuses with `E-PERIOD-OVERLAP`, names the existing file and writes nothing

### Requirement: Target writer boundary
The export pipeline SHALL write files only through a `TargetWriter` that provides the file name for a property and period, the file-name pattern used to find existing and overlapping files of that target, the rendered bytes, the comparison that decides whether an existing file is unchanged, the protocol title, and the target's advice in the `E-PERIOD-OVERLAP` and `E-FILE-EXISTS` refusals (the program the file is imported into, its config keys, how an imported file is undone). `src/export/` SHALL NOT import a target module's internals other than its `TargetWriter`, and the output folder logic SHALL NOT contain a target-specific file pattern, program name or config key. A manifest entry SHALL count as a file of the target only when its name matches the target's file pattern.

#### Scenario: DATEV output unchanged behind the boundary
- **WHEN** the golden-file tests run after the writer is wrapped as a `TargetWriter`
- **THEN** every golden EXTF file is byte-identical to before, and the golden protocol and `manifest.json` differ only in the tool name, the tool version and the mapping SHA-256

#### Scenario: Pattern and comparison come from the writer
- **WHEN** a test runs the export with a fake `TargetWriter` whose files are named `FAKE_<from>-<to>_<propertyId>.txt` and whose comparison ignores nothing
- **THEN** existence, overlap (`E-PERIOD-OVERLAP`), unchanged re-runs and `E-FILE-EXISTS` work for the fake files exactly as for EXTF files, and no EXTF name appears in the output folder

#### Scenario: Refusal advice comes from the writer
- **WHEN** the fake `TargetWriter` refuses a file with `E-PERIOD-OVERLAP` or `E-FILE-EXISTS`
- **THEN** the message carries the fake target's advice and names neither DATEV nor a `datev.*` config key

#### Scenario: Manifest entry of another target
- **WHEN** `manifest.json` records a current file of the fake target for the period and no file of the default target exists
- **THEN** the lookup for the default target (as used by `schedule --once`) finds no file for that period

### Requirement: Regression on recorded live data
The repository SHALL contain recorded real apaleo responses in `test/fixtures/apaleo/live/` (chart of accounts, `export-gross-daily` and `aggregate-daily` of BER and VIE for 2026-10-21 and 2026-10-22, synthetic sandbox data, no folios), scanned for tokens, secrets, e-mail addresses, guest names and addresses on every test run, with a README naming origin, files and scan; and tests that run the full pipeline (apaleo adapter on a fake fetch, mapping, posting, plausibility and aggregate checks, the configured `TargetWriter`) on them and assert the hand-checked totals.

#### Scenario: BER exports cleanly
- **WHEN** `export --from 2026-10-21 --to 2026-10-21 --property BER` runs on the recorded responses with the committed live mapping, `checks.aggregates: true` and the default target
- **THEN** it writes one file without `E-` findings or `W-AGGREGATE-DIFF`, with 35 apaleo lines, 29 bookings and 6 skipped lines, the target's validation passes, and the summary has the values of the posting-rules scenario "Summary of the recorded BER day"

#### Scenario: VIE reads and posts without a parse error
- **WHEN** the same export runs for VIE with a mapping that `init-mapping` writes from the current (German) template on the VIE chart
- **THEN** it raises no parse, sub-cent or Swagger-shape error and stops with `E-UNMAPPED` for the 13 %, 10 % and 20 % revenue accounts and one grouped `E-UNMAPPED` each for the per-reservation Liabilities accounts under parent `3000` at 13 % and at 20 %, and no file is written

#### Scenario: Fixture scan
- **WHEN** the scan runs over `test/fixtures/apaleo/live/`
- **THEN** it finds no key or value matching token, secret, bearer, password or e-mail patterns, and every account name is an apaleo default name or of the form `… for Reservation|Folio <id>`

