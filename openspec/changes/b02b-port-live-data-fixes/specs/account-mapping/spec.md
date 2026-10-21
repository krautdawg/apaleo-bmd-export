## MODIFIED Requirements

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
The tool SHALL refuse to produce a DATEV file when any account booked in the period does not resolve to a row with a DATEV account, and SHALL list each such account with number, type, name, number of lines and gross total. Accounts outside the chart that have a parent (per-reservation and folio accounts) SHALL be reported once per parent, type and VAT rate, with the number of such accounts and up to three examples, not once per reservation. The fix SHALL name the row to change: for an exact row with an empty account, that row's line; for accounts reached through an empty parent row, that parent row and its line together with the wildcard row to add (for VAT-relevant types a `*` row for the type and rate, with the active template's account for that type and rate as example when it has one, never "fill in the parent row"; for other types the parent row or a `*` row for the type). `mapping check --from --to` SHALL resolve each line with the rate the posting rules use, including the inferred rate of an untaxed deposit release.

#### Scenario: Untaxed deposit release
- **WHEN** the period contains a deposit release (debit Liabilities, credit Receivables, no tax entries) with a `PostPrepaymentVat` line of the same day and reference at 7 %, and the mapping has rate wildcards for Liabilities at 7 % and 0 %
- **THEN** `mapping check --from --to` resolves the release through the 7 % wildcard, never through the 0 % wildcard, reports nothing for it, and exits with code 0 if nothing else fails

#### Scenario: Untaxed deposit release without a rate source
- **WHEN** the period contains such a deposit release without a matching `PostPrepaymentVat` line, and the chart gives its Liabilities account no VAT rate
- **THEN** `mapping check --from --to` reports `E-VAT-RATE-UNKNOWN` once for all such lines, does not mention the 0 % row, and exits with code 1

#### Scenario: Untaxed deposit release without deposit rows
- **WHEN** the rate of such a deposit release is inferred as 19 % and the mapping has no Liabilities row for 19 % that applies to it
- **THEN** `mapping check --from --to` reports `E-UNMAPPED` for the Liabilities account and suggests a `*` Liabilities row at 19 %

#### Scenario: Parent row with the wrong VAT rate
- **WHEN** an SKR03 mapping has only the parent row `5000;Revenues;Revenues;;8400` and the period books accommodation (`5011`) and food (`5111`) at 7 %
- **THEN** `mapping check --from --to` reports `E-VAT-MISMATCH` for `5011` and `5111` (booked at 7 %, DATEV applies 19 % on `8400`) and exits with code 1; a Grman row `5000;8400` is checked the same way

#### Scenario: New revenue account
- **WHEN** the period contains lines on revenue account `5010` that has no mapping row
- **THEN** the check fails with exit code 1 and a finding `E-UNMAPPED` naming `5010`, its type, its name, the line count and the gross total, and no file is written

#### Scenario: Deposits under an empty parent without wildcards
- **WHEN** the mapping has the empty row `3000;Liabilities` on line 67 and no Liabilities wildcards, and the period books five per-reservation Liabilities accounts at 7 %
- **THEN** one `E-UNMAPPED` finding names parent `3000`, line 67, five accounts with up to three examples, and the fix "add a wildcard row `*;Liabilities` at 7 %" with the template's account for 7 % deposits as example, and it does not ask to fill in line 67

#### Scenario: Accounts receivable without a row
- **WHEN** the mapping has neither a `9999` row nor an AccountsReceivable wildcard and the period books `ZAQSEFYC-1_AccountsReceivable` and its `/Offset`
- **THEN** one `E-UNMAPPED` finding names parent `9999` (AccountsReceivable) with both accounts and suggests a `9999` row or a `*` AccountsReceivable row to the collective debtor
