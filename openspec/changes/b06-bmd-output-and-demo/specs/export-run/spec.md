## MODIFIED Requirements

### Requirement: EUR only
The export SHALL refuse with `E-CURRENCY`, per property-month and before writing, a property whose currency is not EUR and a month with any ledger line whose currency is not EUR, because the BMD lines carry no currency and are booked in the Mandant's Grundwährung, and the tool does not convert.

#### Scenario: Swiss property
- **WHEN** the property's currency is CHF
- **THEN** `E-CURRENCY` names the currency, the ledger is not read and no file is written for that property

### Requirement: Dry run
With `--dry-run` the export SHALL run every step except writing, SHALL print the posting summary (totals per BMD account, net, tax and gross per VAT rate, Ortstaxe and other levies, payments per clearing account, deposits received and released, write-offs, skipped lines, findings) and the import block of the protocol, and SHALL exit with code 1 if any error finding exists.

#### Scenario: Review before the first file
- **WHEN** the user runs `apaleo-bmd export --month 2026-10 --property BSP --dry-run`
- **THEN** the summary and the import block are printed and no file or folder is created

### Requirement: Output layout and manifest
The export SHALL write each file to `<output.dir>/<propertyId>/<YYYY-MM>/` with the deterministic name `BMD_Buchungsimport_<from>-<to>_<propertyId>.csv`, SHALL write a protocol text file `<name>.protokoll.txt` beside it, and SHALL record in `manifest.json` the file name, SHA-256 of the file, booking count, Soll and Haben totals, tax per rate, mapping file SHA-256, tool version and creation time. The protocol SHALL contain an import block with the file name, line count, the dialect, every Buchungssymbol used, the range of Belegnummern, the `verbuchkz` and `gegenbuchkz` values, every Steuercode and rate used, and the configured Sachkonten and Personenkonten lengths.

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

#### Scenario: Overlapping period
- **WHEN** the folder holds the file for 2026-09-01 to 2026-09-30 and the user exports 2026-09-20 to 2026-09-30
- **THEN** the export refuses with `E-PERIOD-OVERLAP`, names the existing file and writes nothing
