## MODIFIED Requirements

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped BMD account in the bookings equals the signed apaleo movement of the booked lines mapped to it, where a booking moves `konto` by its amount and `gkonto` by minus its amount plus tax, which is apaleo's gross (the tax leg on BMD's own tax account is not part of this check); and that per rate the tax amounts in the bookings equal the sum of apaleo's per-line tax rounded to cents of the booked lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. The `E-VAT-TOTAL` message SHALL also name apaleo's precise VAT total of the rate and the line-rounding difference; the difference between the tax per booking and apaleo's precise total SHALL never be an error by itself. When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day and compare each listed account's balance (debit minus credit) with the signed sum of that day's ledger lines: a side on a global chart account counts for that account, any other side for its main account; Revenues and Liabilities sides count with their precise net amount, all other types with their gross amount; each tax of a line with a Revenues side counts for the chart's `Vat` account of that VAT type and rate, and of a line with a Liabilities side for the `VatOnLiabilities` account, signed like that side; both balances are rounded to cents only for the comparison. A difference SHALL be reported as a warning. The aggregate comparison SHALL depend only on the ledger lines and the chart, never on the bookings of a target.

#### Scenario: Tax total per rate
- **WHEN** a defect makes the bookings at 20 % carry 4.00 tax in total while apaleo's per-line taxes at 20 %, rounded to cents, total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 20 % with both amounts and apaleo's precise total, and no file is written

#### Scenario: Line rounding is not an error
- **WHEN** the recorded VIE day 2026-10-21 is exported, where the bookings carry 7.74 tax at 10 % and apaleo's precise total is 7.74545454
- **THEN** no `E-VAT-TOTAL` is raised, and the protocol shows both amounts and the difference 0.01

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
