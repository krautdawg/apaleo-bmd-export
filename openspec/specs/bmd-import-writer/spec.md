# bmd-import-writer Specification

## Purpose
The BMD Buchungsimport file (BMD-Standard, Satzart 0, variable layout with header line) that a Kanzlei imports into BMD NTCS or BMD 5.5: dialects, field rules, Belegnummern, encoding, validation, sanitising, file name and golden tests.
## Requirements
### Requirement: Dialect
The writer SHALL take a dialect, `ntcs` (default) or `bmd55`, that sets the header names, the date format and the Steuercode meanings together and never mixes them: `ntcs` writes the NTCS column names, dates as `TT.MM.JJJJ`, treats Steuercode 1 as output tax and allows Buchungssymbole of 1 to 4 characters; `bmd55` writes the BMD 5.5 column names, dates as `JJJJMMTT`, treats Steuercodes 1 and 3 as output tax and allows Buchungssymbole of 1 to 2 characters.

#### Scenario: Default dialect
- **WHEN** the writer renders bookings without a dialect option
- **THEN** it uses `ntcs`

#### Scenario: BMD 5.5 dialect
- **WHEN** a booking has konto `4010`, gkonto `2390`, business date 2026-10-14, symbol `HO`, amount −100.00, tax −10.00, rate 10, Steuercode 3, text `Erlös Beherbergung`, extbelegnr `BSP-2026-0042`, it is the first booking of a file starting on 2026-10-01, and the dialect is `bmd55`
- **THEN** the header is `satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz` and the line is `0;4010;2390;100100001;20261014;20261014;HO;2;10;3;-100,00;-10,00;Erlös Beherbergung;;BSP-2026-0042;E;A`

### Requirement: Header line
With the `ntcs` dialect the writer SHALL emit as line 1 exactly `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz`, with the `bmd55` dialect the header given in the Dialect requirement, and every following line SHALL have exactly 17 fields in the header's order.

#### Scenario: Header of an empty month
- **WHEN** the writer renders zero bookings
- **THEN** the file consists of the header line and CRLF only

#### Scenario: Field count
- **WHEN** a file with 3 bookings is parsed with `;` as separator
- **THEN** every line has 17 fields

### Requirement: Booking line format
For each booking the writer SHALL write `satzart` `0`; `konto` and `gkonto` as digits; `belegnr` as the 9-digit Belegnummer; `belegdatum` and `buchdatum` as the booking's business date in the dialect's date format; `buchsymbol` from the booking; `buchcode` `1` when the signed amount is positive and `2` when it is negative; `prozent` and `steuercode` only when the booking has a Steuercode, else empty; `betrag` and `steuer` with a decimal comma, two decimals, a leading minus for negative values and no thousands separator (`steuer` empty when there is no Steuercode); `text`, `kost` and `extbelegnr` sanitised or empty; `gegenbuchkz` `E` and `verbuchkz` `A`.

#### Scenario: Revenue at 10 % with the revenue account leading
- **WHEN** a booking has konto `4010`, gkonto `2390`, business date 2026-10-14, symbol `HO`, amount −100.00, tax −10.00, rate 10, Steuercode 1, text `Erlös Beherbergung`, extbelegnr `BSP-2026-0042`, it is the first booking of the file for 2026-10-01 to 2026-10-31, and the dialect is `ntcs`
- **THEN** its line is `0;4010;2390;100100001;14.10.2026;14.10.2026;HO;2;10;1;-100,00;-10,00;Erlös Beherbergung;;BSP-2026-0042;E;A`

#### Scenario: Payment without tax
- **WHEN** a booking has konto `2890`, gkonto `2390`, amount 120.00 and no Steuercode
- **THEN** its line has `buchcode` `1`, empty `prozent`, `steuercode`, `steuer` and `kost`, and `betrag` `120,00`

#### Scenario: Decimal rate
- **WHEN** a booking has rate 4.9 and Steuercode 1
- **THEN** `prozent` is `4,9`

#### Scenario: Untaxed revenue with a non-taxable Steuercode
- **WHEN** a booking has konto `4090`, Steuercode 81, rate 0 and tax 0.00
- **THEN** `prozent` is `0`, `steuercode` is `81`, `steuer` is `0,00`, and no finding is raised

### Requirement: Belegnummer
The writer SHALL number the bookings of one file in file order with `belegnr` = the two-digit month and two-digit day of the period's first day followed by a 5-digit counter starting at `00001`, so that no two lines of a file share a Belegnummer, files of one property that start on different days never share one, and the same bookings always get the same numbers. The source receipt or reference SHALL be written to `extbelegnr`.

#### Scenario: Numbers in a January file
- **WHEN** a file for 2027-01-01 to 2027-01-31 has 3 bookings
- **THEN** their `belegnr` values are `010100001`, `010100002` and `010100003`

#### Scenario: Two daily files of one month
- **WHEN** the scheduler writes a daily file for 2026-10-14 with 40 bookings and one for 2026-10-15 with 35 bookings
- **THEN** the first file uses `101400001` to `101400040`, the second `101500001` to `101500035`, and no number occurs in both

#### Scenario: Two partial files of one month
- **WHEN** files are written for 2026-10-01 to 2026-10-07 and for 2026-10-08 to 2026-10-14
- **THEN** the first file's numbers start with `1001` and the second file's with `1008`, and no number occurs in both

#### Scenario: No accidental Splittbuchung
- **WHEN** two consecutive bookings have the same konto and business date
- **THEN** their `belegnr` values differ, so BMD does not merge them into one split booking

### Requirement: File encoding and line format
The file SHALL be encoded in Windows-1252 without byte-order mark, every line including the last SHALL end with CRLF, and no field SHALL be quoted.

#### Scenario: Umlauts
- **WHEN** a booking text is `Getränke Frühstück`
- **THEN** the bytes for `ä` and `ü` are `0xE4` and `0xFC`, and the line ends with `0x0D 0x0A`

### Requirement: Booking validation
Before writing, the writer SHALL validate every booking and SHALL report all problems at once as findings with the booking number and field, and SHALL write nothing when any exists: `E-BMD-ACCOUNT` for an account that is not digits or whose length is neither the configured Sachkonten length nor the configured Personenkonten length, `E-BMD-AMOUNT` for an amount of 0 or with more than 13 integer digits, `E-BMD-STEUER-SIGN` for a tax amount that is not 0 and whose sign differs from the amount for an output-tax Steuercode of the dialect (`ntcs`: 1; `bmd55`: 1 or 3), `E-BMD-RATE` for a rate below 0, above 99.99 or with more than two decimals, `E-BMD-STEUERCODE` for a Steuercode outside 0-99, `E-BMD-SYMBOL` for a Buchungssymbol that is not 1 to 4 (`ntcs`) or 1 to 2 (`bmd55`) characters of `A-Z` and `0-9`, `E-BMD-KOST` for a `kost` that is not 1 to 9 digits, `E-BMD-TAX-PERSONENKONTO` for a booking with tax whose `konto` has the Personenkonten length when that differs from the Sachkonten length (BMD reads `betrag` of a leading Personenkonto as gross and does not import `steuer` there), `E-BMD-DATE` for a business date outside the file period, `E-BMD-PERIOD` without a booking number for a file period whose first or last day is not a valid date or whose first day is after its last, and `E-BMD-BELEGNR` for more than 99,999 bookings in one file.

#### Scenario: Several errors at once
- **WHEN** booking 2 has konto `40A0` and booking 5 has amount 0
- **THEN** rendering fails with one error carrying `E-BMD-ACCOUNT` for booking 2 and `E-BMD-AMOUNT` for booking 5, and no bytes are returned

#### Scenario: Wrong account length
- **WHEN** Sachkonten length is 4, Personenkonten length is 6, and a booking uses konto `40100`
- **THEN** `E-BMD-ACCOUNT` names the booking, the account and both allowed lengths

#### Scenario: Tax sign
- **WHEN** a booking with Steuercode 1 has amount −100.00 and tax 10.00 in the `ntcs` dialect
- **THEN** `E-BMD-STEUER-SIGN` is reported

#### Scenario: Invalid Kostenstelle
- **WHEN** a booking has `kost` `KS-10` or `1234567890`
- **THEN** `E-BMD-KOST` names the booking and the value

#### Scenario: Tax on a leading Personenkonto
- **WHEN** Personenkonten length is 6 and a booking with Steuercode 1 has konto `201001`
- **THEN** `E-BMD-TAX-PERSONENKONTO` names the booking and the account

#### Scenario: Reversed period
- **WHEN** the file period starts on 2026-11-01 and ends on 2026-10-31
- **THEN** rendering fails with one `E-BMD-PERIOD` finding without a booking number, and no booking is reported with `E-BMD-DATE`

#### Scenario: Symbol too long for BMD 5.5
- **WHEN** the dialect is `bmd55` and a booking has Buchungssymbol `PMS`
- **THEN** `E-BMD-SYMBOL` names the symbol and the limit of 2 characters

### Requirement: Text sanitising
The writer SHALL replace `;`, `"`, tab, CR and LF in `text` and `extbelegnr` with a space, collapse repeated spaces, trim, replace characters that Windows-1252 cannot encode with `?` and report `N-BMD-CHARSET`, cut `text` to 40 and `extbelegnr` to 35 characters and report `N-BMD-TRUNCATED`, and limit `extbelegnr` to `A-Z`, `a-z`, `0-9`, `-`, `/`, `.` and `_`.

#### Scenario: Semicolon in text
- **WHEN** a booking text is `Zahlung; Visa`
- **THEN** the field is `Zahlung Visa` and the line still has 17 fields

#### Scenario: Long reference
- **WHEN** extbelegnr is 50 characters long
- **THEN** the first 35 are written and `N-BMD-TRUNCATED` names the booking

### Requirement: Deterministic file name and content
The writer's file name SHALL be `BMD_Buchungsimport_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.csv` for the first and last day of the period, the file SHALL contain no creation time or other value that changes between runs, and an existing file SHALL count as unchanged exactly when its bytes equal the new bytes.

#### Scenario: File name
- **WHEN** property BSP is exported for 2026-10-01 to 2026-10-31
- **THEN** the file is named `BMD_Buchungsimport_20261001-20261031_BSP.csv`

#### Scenario: Same input twice
- **WHEN** the same bookings are rendered twice at different clock times
- **THEN** both results are byte-identical

### Requirement: Golden-file regression tests
The test suite SHALL compare rendered files byte by byte with golden files in `test/golden/bmd/` covering, for the `ntcs` dialect, revenue at 10 %, 20 %, 13 % and 4.9 %, untaxed revenue with and without a Steuercode, an allowance, a payment, a city-tax line without tax, a deposit with tax, umlauts and a truncated text, and for the `bmd55` dialect at least revenue at 10 %, a payment and a deposit, and SHALL update them only with `UPDATE_GOLDEN=1`.

#### Scenario: Unintended change
- **WHEN** a code change alters one byte of the output
- **THEN** `pnpm test` fails and shows the differing line

