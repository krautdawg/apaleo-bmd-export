# account-mapping Specification

## Purpose
The account mapping from apaleo accounts to DATEV accounts: the editable mapping CSV (with Excel and Grman-export input), the resolution order for ledger accounts, offline validation, the SKR03 and SKR04 hotel templates, the `init-mapping` and `mapping check` commands, and the guard that blocks unmapped booked accounts.
## Requirements
### Requirement: Mapping file format
The tool SHALL read and write a mapping CSV with the columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment`, keyed by apaleo account number and type. Written files SHALL be UTF-8 with byte-order mark and `;` separators. Reading SHALL accept UTF-8 with or without BOM and CP1252, `;` or `,` separators, and a decimal comma or point in the two rate columns. A file whose header has the DATEV columns (`datev_account`, `bu_key`) or the Grman connector layout SHALL be rejected with an error that names `init-mapping --template ekr`.

#### Scenario: Excel round trip
- **WHEN** the committed fixture `test/fixtures/mapping/excel-at-saved.csv` (the written original after an Excel AT save: CP1252, `;`, CRLF, leading zeros stripped, rate `4,9` with a decimal comma, Excel's quoting) is loaded with Sachkontenlänge 4
- **THEN** it yields the same rows and values as the written original, with the stripped leading zeros of the class-0 account restored and reported as `W-PADDED` warnings, and the rate read as 4.9

#### Scenario: Duplicate key
- **WHEN** two rows share the same apaleo account and type
- **THEN** loading fails with an error naming both line numbers

#### Scenario: Old DATEV mapping
- **WHEN** the user points `--mapping` at a mapping CSV with the column `datev_account`
- **THEN** loading fails, says the file is a DATEV mapping, and names `init-mapping --template ekr`

### Requirement: Account resolution order
For a ledger account the tool SHALL resolve the mapping row in this order: exact number and type; exact number with any type; the parent account chain with the same type, where a parent row with an empty target account SHALL NOT end the search but SHALL be passed over; for VAT-relevant types (Liabilities, CityTaxes, SecondCityTax, GuestLevies, LossOfAccountsReceivable, Vat, VatOnLiabilities) a wildcard row `*` for the type whose `apaleo_vat_percent` equals the line's normalised tax rate; for other types a wildcard row `*` for the type. An exact row (number and type, or number with any type) with an empty target account SHALL still mean "unmapped". When no row with a target account is found, the first empty parent row passed over SHALL be returned so that findings can name it. Wildcard rows without a VAT rate SHALL be rejected for VAT-relevant types, and wildcard rows of type Revenues SHALL be rejected with or without a rate.

#### Scenario: Per-reservation account with a parent
- **WHEN** a ledger line debits account `BSP-12345-1` of type Receivables with parent `1200`, and the mapping has a row for `1200` Receivables
- **THEN** the line resolves to the row for `1200`

#### Scenario: Per-reservation accounts without a parent
- **WHEN** a ledger line debits `BSP-ABCDEF-1_Receivables` (type Receivables, no `parentNumber`, not in the chart) and credits `BSP-ABCDEF-1_Liabilities` (type Liabilities, no `parentNumber`) with a 7 % tax entry, and the mapping has a `*` Receivables row and a `*` Liabilities row with `apaleo_vat_percent` 7
- **THEN** the debit resolves to the Receivables wildcard and the credit to the 7 % Liabilities wildcard

#### Scenario: Empty parent row does not hide the wildcards
- **WHEN** a mapping has the row `3000;Liabilities` with an empty target account and `*` Liabilities rows at 7 %, 19 % and 0 %, and a prepayment credits `EPEBVUIU-1_Liabilities/Reduced:7.00` (parent `3000`) at 7 %
- **THEN** the account resolves to the 7 % wildcard row, and a 0 % line on `EPEBVUIU-1_Liabilities/Null:0.00` resolves to the 0 % wildcard row

#### Scenario: Austrian rates through the wildcards
- **WHEN** the same mapping also has `*` Liabilities rows at 13 % and 20 %, and the recorded VIE day credits `DHNEKKIT-1_Liabilities/Reduced:13.00` and `DHNEKKIT-1_Liabilities/Normal:20.00` (parent `3000`)
- **THEN** they resolve to the 13 % and the 20 % wildcard row

#### Scenario: Exact empty row stays unmapped
- **WHEN** the mapping has the row `RevenueNoShow_Reduced:7.00;Revenues` with an empty target account and a line credits that account
- **THEN** the account is unmapped and the finding asks to fill in the target account on that row's line

#### Scenario: Liabilities wildcard without rate rejected
- **WHEN** the mapping contains a `*` row of type Liabilities with an empty `apaleo_vat_percent`
- **THEN** loading fails with an error saying that VAT-relevant wildcards must name a VAT rate

#### Scenario: Wildcard for payments
- **WHEN** a new payment-method account appears and the mapping has a `*` Payments row
- **THEN** the account resolves to the wildcard row

#### Scenario: Wildcard for accounts receivable
- **WHEN** a line debits `ZAQSEFYC-1_AccountsReceivable` (parent `9999`, not in the chart), the mapping has no row for `9999` and has a `*` AccountsReceivable row for the collective debtor
- **THEN** the account resolves to the collective debtor, and so does `ZAQSEFYC-1_AccountsReceivable/Offset`

#### Scenario: Wildcard for revenue rejected
- **WHEN** the mapping contains a `*` row of type Revenues
- **THEN** loading fails with an error explaining that revenue accounts must be mapped one by one because of VAT

### Requirement: Unmapped accounts block the export
The tool SHALL refuse to produce a BMD file when any account booked in the period does not resolve to a row with a BMD account, and SHALL list each such account with number, type, name, number of lines and gross total. Accounts outside the chart that have a parent (per-reservation and folio accounts) SHALL be reported once per parent, type and VAT rate, with the number of such accounts and up to three examples, not once per reservation. The fix SHALL name the row to change: for an exact row with an empty BMD account, that row's line; for accounts reached through an empty parent row, that parent row and its line together with the wildcard row to add (for VAT-relevant types a `*` row for the type and rate, with the EKR template's account for that type and rate as example when it has one, never "fill in the parent row"; for other types the parent row or a `*` row for the type). `mapping check --from --to` SHALL resolve each line with the rate the posting rules use, including the inferred rate of an untaxed deposit release.

#### Scenario: Untaxed deposit release
- **WHEN** the period contains a deposit release (debit Liabilities, credit Receivables, no tax entries) with a `PostPrepaymentVat` line of the same day and reference at 10 %, and the mapping has rate wildcards for Liabilities at 10 % and 0 %
- **THEN** `mapping check --from --to` resolves the release through the 10 % wildcard, never through the 0 % wildcard, reports nothing for it, and exits with code 0 if nothing else fails

#### Scenario: Untaxed deposit release without a rate source
- **WHEN** the period contains such a deposit release without a matching `PostPrepaymentVat` line, and the chart gives its Liabilities account no VAT rate
- **THEN** `mapping check --from --to` reports `E-VAT-RATE-UNKNOWN` once for all such lines, does not mention the 0 % row, and exits with code 1

#### Scenario: Untaxed deposit release without deposit rows
- **WHEN** the rate of such a deposit release is inferred as 20 % and the mapping has no Liabilities row for 20 % that applies to it
- **THEN** `mapping check --from --to` reports `E-UNMAPPED` for the Liabilities account and suggests a `*` Liabilities row at 20 %

#### Scenario: Parent row with the wrong VAT rate
- **WHEN** a mapping has only the parent row `5000;Revenues;Revenues;;4030;1;20` and the period books accommodation (`5011`) and food (`5111`) at 10 %
- **THEN** `mapping check --from --to` reports `E-VAT-MISMATCH` for `5011` and `5111` (booked at 10 %, the row applies 20 % on `4030`) and exits with code 1

#### Scenario: New revenue account
- **WHEN** the period contains lines on revenue account `5010` that has no mapping row
- **THEN** the check fails with exit code 1 and a finding `E-UNMAPPED` naming `5010`, its type, its name, the line count and the gross total, and no file is written

#### Scenario: Deposits under an empty parent without wildcards
- **WHEN** the mapping has the empty row `3000;Liabilities` on line 40 and no Liabilities wildcards, and the period books three per-reservation Liabilities accounts at 13 %
- **THEN** one `E-UNMAPPED` finding names parent `3000`, line 40, three accounts with their examples, and the fix "add a wildcard row `*;Liabilities` at 13 %" with the template's `3202` as example, and it does not ask to fill in line 40

#### Scenario: Accounts receivable without a row
- **WHEN** the mapping has neither a `9999` row nor an AccountsReceivable wildcard and the period books `AHTJTGFK-1_AccountsReceivable` and its `/Offset`
- **THEN** one `E-UNMAPPED` finding names parent `9999` (AccountsReceivable) with both accounts and suggests a `9999` row or `*;AccountsReceivable;;;200000` (Sammeldebitor)

### Requirement: EKR hotel template
The tool SHALL ship a rule-based template based on the Austrian Einheitskontenrahmen (KFS/BW 6) that maps, by apaleo type, VAT percent and account-name pattern: accommodation revenue at 10 % (`4000`), food revenue at 10 % (`4010`), drinks at 20 % (`4020`), other revenue at 20 % (`4030`), revenue at 13 % (`4040`) and 4.9 % (`4050`), all with the output-tax Steuercode of `bmd.dialect` (`1` with `ntcs`, `3` with `bmd55`), revenue at 0 % (`4090`) without Steuercode and with a comment on the fixed-Steuercode check, cash payments to `2700`, every non-cash payment to the clearing account `2890` (never to a bank account), guest receivables to `2390`, every accounts-receivable account (the `CollectiveDebitor_AccountsReceivable` row and a wildcard row `*;AccountsReceivable`) to the Personenkonto `200000`, and deposits by VAT rate through wildcard rows (`3200` at 10 %, `3202` at 13 % and `3201` at 20 % with the output-tax Steuercode of the dialect, `3209` at 0 % without Steuercode). The template SHALL NOT write a row for a container account outside the global ledger (`hasChildren`) when its type has wildcard rules and no rule yields a BMD account for it (Liabilities `3000`, AccountsReceivable `9999`): the wildcard rows cover its per-reservation children. Revenue and Liabilities accounts at the historical rate of 5 % (1 July 2020 to 31 December 2021) SHALL be written with an empty BMD account and a comment explaining that a booking on them stops the export and that exports for that period need the Kanzlei. City tax, second city tax and guest levies, LossOfAccountsReceivable, House and TransitoryItems SHALL be written with an empty BMD account and a comment describing the options. Template rows SHALL be written with 4-digit base numbers and scaled to `bmd.sachkontenlaenge` with trailing zeros, the Personenkonto `200000` SHALL be scaled to `bmd.personenkontenlaenge` by adding or dropping trailing zeros (`20000` at 5, `2000000` at 7) and left empty with a comment when that length equals `bmd.sachkontenlaenge` (both reported as a note), the `E-UNMAPPED` fix hint SHALL name the scaled Personenkonto, template rows SHALL each be marked `Vorschlag (ungeprüft)`, and accounts that no rule matches SHALL stay unmapped.

#### Scenario: Template does not guess
- **WHEN** the chart contains a House account and a TransitoryItems account
- **THEN** the generated rows for them have an empty BMD account and an explanatory comment

#### Scenario: Ortstaxe is not pre-filled
- **WHEN** the chart contains a CityTaxes account
- **THEN** its generated row has an empty BMD account and a comment naming both options (liability to the Gemeinde without Steuercode, or the Kanzlei's durchlaufender Posten), and `mapping check --from --to` reports `E-UNMAPPED` for it until the user fills it in

#### Scenario: Food and drinks
- **WHEN** the chart contains revenue accounts "Frühstück Speisen" at 10 % and "Getränke" at 20 %
- **THEN** the food account maps to `4010` with Steuercode 1 and rate 10, and the drinks account to `4020` with Steuercode 1 and rate 20

#### Scenario: Real apaleo chart
- **WHEN** `init-mapping --template ekr` runs on the recorded VIE chart of accounts
- **THEN** the file has no row for `3000` or `9999`, has `*;Liabilities` rows at 10, 13, 20 and 0 % and `*;AccountsReceivable` to `200000`, and leaves every `…_Special:5.00` revenue row and the `*;Liabilities` row at 5 % empty with the comment

#### Scenario: Template in the BMD 5.5 dialect
- **WHEN** `init-mapping --template ekr` runs with `bmd.dialect` `bmd55`
- **THEN** the revenue and deposit rows with tax carry Steuercode 3 (Soll-Umsatzsteuer in BMD 5.5) instead of 1

#### Scenario: Template scales to Sachkontenlänge 5
- **WHEN** `init-mapping --template ekr` runs with `bmd.sachkontenlaenge` 5
- **THEN** the template's `4000` is written as `40000`, the Personenkonto `200000` is left as it is, and the command prints a note naming Sachkontenlänge 5

#### Scenario: Template scales to Personenkontenlänge 5
- **WHEN** `init-mapping --template ekr` runs with `bmd.personenkontenlaenge` 5
- **THEN** the `CollectiveDebitor_AccountsReceivable` row and the `*;AccountsReceivable` row map to `20000`, their comments name `20000`, and `mapping check` reports no `E-ACCOUNT-LENGTH` for them

### Requirement: Mapping validation for BMD
`apaleo-bmd mapping check` SHALL validate that BMD accounts are digits only and have exactly `bmd.sachkontenlaenge` digits, or for AccountsReceivable rows exactly `bmd.sachkontenlaenge` or `bmd.personenkontenlaenge` digits (`E-ACCOUNT-LENGTH`); that a Steuercode is an integer from 0 to 99; that a row with a Steuercode has a `bmd_vat_percent`, 0 included (`E-VAT-RATE-MISSING`), and a row with a `bmd_vat_percent` above 0 has a Steuercode (`E-STEUERCODE-MISSING`); that no row of type Revenues, Liabilities, CityTaxes, SecondCityTax, GuestLevies or LossOfAccountsReceivable uses an input-tax code of the configured `bmd.dialect` (`ntcs`: 2 Vorsteuer and 3 Vorsteuer-Berichtigung; `bmd55`: 0) (`E-STEUERCODE-INPUT-TAX`); that no row of type Payments, Receivables or AccountsReceivable has a Steuercode, 0 included (`E-STEUERCODE-NOT-ALLOWED`), because BMD would book the tax on the money or claim account; that a Steuercode outside the dialect's output-tax set (`ntcs`: 1; `bmd55`: 1 and 3) gives the warning `W-STEUERCODE-UNCHECKED`, also at rate 0; that a Revenues row at rate 0 without Steuercode gives the warning `W-UNTAXED-REVENUE` (check that the BMD account has no fixed Steuercode, or enter the Kanzlei's code for non-taxable revenue); that a rate other than 0, 4.9, 10, 13 or 20 gives the warning `W-VAT-RATE-UNUSUAL`; that `kost` is empty or 1 to 9 digits (`E-KOST-FORMAT`) and that a `kost` on a row whose type is not Revenues or LossOfAccountsReceivable gives the warning `W-KOST-IGNORED`; that the row's rate (`bmd_vat_percent`, 0 without Steuercode) equals `apaleo_vat_percent` where both are known, and with `--from --to` equals the rate each booked line of a VAT-relevant type carries (`E-VAT-MISMATCH`, also for rows reached through the parent chain). The command SHALL exit with code 1 on any error. Short numbers SHALL only be left-padded when the padding is unambiguous (Sachkontenlänge 4 and a 1–3 digit number), with a warning.

#### Scenario: VAT mismatch
- **WHEN** an apaleo revenue account at 10 % is mapped to `4020` with Steuercode 1 and `bmd_vat_percent` 20
- **THEN** the check reports `E-VAT-MISMATCH` naming the row and both rates

#### Scenario: German mapping copied
- **WHEN** a row maps apaleo revenue at 7 % to `4000` with Steuercode 1 and `bmd_vat_percent` 7
- **THEN** the check warns `W-VAT-RATE-UNUSUAL` naming the row and the Austrian rates

#### Scenario: Input-tax code on a revenue row
- **WHEN** `bmd.dialect` is `ntcs` and a row maps apaleo revenue at 10 % to `4000` with Steuercode 2 or 3
- **THEN** the check reports `E-STEUERCODE-INPUT-TAX` naming the row, the code and its NTCS meaning (Vorsteuer, Vorsteuer-Berichtigung), and exits with code 1

#### Scenario: Steuercode on a receivables row
- **WHEN** the row `1200;Receivables` maps to `2390` with Steuercode 1 and `bmd_vat_percent` 10
- **THEN** the check reports `E-STEUERCODE-NOT-ALLOWED` naming the row, and exits with code 1

#### Scenario: BMD 5.5 Soll-USt code
- **WHEN** `bmd.dialect` is `bmd55` and a row maps apaleo revenue at 10 % to `4000` with Steuercode 3
- **THEN** no Steuercode finding is reported for the row

#### Scenario: Non-taxable code at rate 0
- **WHEN** a Revenues row at 0 % maps to `4090` with Steuercode 81 and `bmd_vat_percent` 0
- **THEN** neither `E-STEUERCODE-MISSING` nor `E-VAT-RATE-MISSING` is reported, `W-STEUERCODE-UNCHECKED` names code 81, and the command exits with code 0 if nothing else fails

#### Scenario: Untaxed revenue without Steuercode
- **WHEN** a Revenues row at 0 % maps to `4090` with an empty Steuercode
- **THEN** the check warns `W-UNTAXED-REVENUE` naming the row and saying that the BMD account must not carry a fixed Steuercode

#### Scenario: Kostenstelle on a payment row
- **WHEN** a Payments row has `kost` `10`
- **THEN** the check warns `W-KOST-IGNORED` naming the row, and a row with `kost` `K10` reports `E-KOST-FORMAT`

#### Scenario: Rate without Steuercode
- **WHEN** a row has `bmd_vat_percent` 10 and an empty Steuercode
- **THEN** the check reports `E-STEUERCODE-MISSING`

#### Scenario: Template-length account at a longer Sachkontenlänge
- **WHEN** `bmd.sachkontenlaenge` is 5 and a row maps to `2890`
- **THEN** the check reports `E-ACCOUNT-LENGTH` for the row, explains that the number needs 5 digits (for example `28900`), and does not pad it to `02890`

#### Scenario: Sammeldebitor as Personenkonto
- **WHEN** an AccountsReceivable row maps to `200000` with `bmd.personenkontenlaenge` 6
- **THEN** no finding is reported for the row

#### Scenario: Valid mapping
- **WHEN** every row passes all checks
- **THEN** the command prints a summary of rows by type and exits with code 0

### Requirement: init-mapping command with the EKR template
`apaleo-bmd init-mapping --property <id> --template ekr [--out <file>] [--update]` SHALL read the property's chart of accounts and write a mapping CSV with one row per leaf account pre-filled from the template, SHALL refuse to overwrite an existing file unless `--update` is given, and with `--update` SHALL keep every existing row unchanged and append rows only for accounts not yet present.

#### Scenario: First run
- **WHEN** the user runs `init-mapping --property BSP --template ekr` and no file exists
- **THEN** `mapping-BSP.csv` is written with all leaf accounts, template suggestions where a rule matched, and the command prints how many rows are mapped and unmapped

#### Scenario: Update keeps edits
- **WHEN** the user has edited row `5000` and apaleo has added account `5020`, and runs `init-mapping --property BSP --template ekr --update`
- **THEN** row `5000` is unchanged and a row for `5020` is appended, and the command lists the added account

#### Scenario: Existing file without update
- **WHEN** `mapping-BSP.csv` exists and the user runs `init-mapping` without `--update`
- **THEN** the command exits with code 1 and nothing is written

#### Scenario: Old flag
- **WHEN** the user runs `init-mapping --property BSP --skr 03`
- **THEN** the CLI exits with code 2 naming the unknown flag `--skr`

### Requirement: Deposit rows
Deposit (Liabilities) rows with a rate above 0 SHALL use an output-tax Steuercode of the configured dialect (`ntcs`: 1, which the UVA counts as Anzahlungen in KZ 000/022/029), and `mapping check` SHALL refuse the input-tax codes (`ntcs`: 2 and 3) on them with `E-STEUERCODE-INPUT-TAX`. The EKR template SHALL write the deposit wildcard rows `3200` (10 %), `3202` (13 %) and `3201` (20 %) with the output-tax code and a comment that names both NTCS setups: direct USt on the deposit account, or the Kanzlei's Anzahlungskonto per rate with not-yet-due USt.

#### Scenario: Deposit row with Steuercode 1
- **WHEN** `bmd.dialect` is `ntcs` and a Liabilities row at 10 % maps to `3200` with Steuercode 1
- **THEN** no Steuercode finding is reported for the row

#### Scenario: Deposit row with a BMD 5.5 code in NTCS
- **WHEN** `bmd.dialect` is `ntcs` and a Liabilities row at 10 % maps to `3200` with Steuercode 3
- **THEN** the check reports `E-STEUERCODE-INPUT-TAX` naming the row and saying that code 3 is the Vorsteuer-Berichtigung in NTCS, and exits with code 1

#### Scenario: Deposit row comment
- **WHEN** `init-mapping --template ekr` writes the `*;Liabilities` row at 10 %
- **THEN** the row maps to `3200` with the dialect's output-tax code and rate 10, and its comment names both setups and `docs/mapping-guide.md`

### Requirement: Template rows for Austrian special cases
The EKR hotel template SHALL additionally map LossOfAccountsReceivable accounts by VAT rate through wildcard rows (`7800` at 10 %, `7802` at 13 % and `7801` at 20 % with the output-tax Steuercode of the dialect, `7809` at 0 % without Steuercode), so that no row is written for the containers `6900` and `CollectiveDebitor_LossOfAccountsReceivable`, SHALL map revenue accounts of apaleo's groups `RevenueCancellationFees` and `RevenueNoShow` and revenue accounts whose name matches cancellation or no-show fees (Storno, Stornogebühr, Cancellation, No-Show, Noshow) at 0 % to `4091` without Steuercode and leave them unmapped with an explanatory comment at a rate above 0, also where another rate rule would match, and SHALL write the Ortstaxe comment naming the Bundesland table in `docs/mapping-guide.md` and saying that the BMD account must carry no fixed Steuercode. Every such row SHALL be marked `Vorschlag (ungeprüft)`.

#### Scenario: Bad debt rows
- **WHEN** `bmd.dialect` is `ntcs` and a write-off debits a per-reservation LossOfAccountsReceivable account at 10 % or 20 % whose `parentNumber` is `6900` (assumed by analogy with AR's `9999`; no write-off is recorded) or `CollectiveDebitor_LossOfAccountsReceivable`
- **THEN** it resolves through the wildcard rows to `7800` or `7801` with Steuercode 1 and the matching rate, and the file has no row for `6900` or `CollectiveDebitor_LossOfAccountsReceivable`

#### Scenario: Recorded Austrian chart
- **WHEN** `init-mapping --template ekr` runs on the recorded VIE chart
- **THEN** `RevenueCancellationFees_Without:0.00` maps to `4091` without Steuercode and `RevenueNoShow_Reduced:13.00` has an empty BMD account with the no-show comment

#### Scenario: Taxed cancellation fee is left to the Kanzlei
- **WHEN** the chart contains a revenue account "No-Show Gebühr" at 10 %
- **THEN** its row has an empty BMD account and a comment that no-shows can be taxable and cancellation fees usually are not

#### Scenario: Ortstaxe comment
- **WHEN** the chart contains a CityTaxes account
- **THEN** its row stays empty and the comment names both booking options, the fixed-Steuercode check and `docs/mapping-guide.md`

