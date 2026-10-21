## MODIFIED Requirements

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped BMD account in the bookings equals the signed apaleo movement of the booked lines mapped to it, where a booking moves `konto` by its amount and `gkonto` by minus its amount plus tax (the tax leg on BMD's own tax account is not part of this check); and that per rate the tax amounts in the bookings equal apaleo's tax totals of the booked and skipped VAT lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day, compare them with the ledger lines rolled up to their main accounts, and report differences as warnings.

#### Scenario: Tax total per rate
- **WHEN** the bookings at 20 % carry 4.00 tax in total and apaleo's tax lines at 20 % for the period total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 20 % with both amounts and no file is written

#### Scenario: Side bug is caught
- **WHEN** a defect writes a booking with a positive amount where the apaleo line credits the `konto` account
- **THEN** error `E-ACCOUNT-BALANCE` names the day, the BMD account and both signed amounts, and no file is written

#### Scenario: Aggregate check off by default
- **WHEN** `checks.aggregates` is not set
- **THEN** no aggregate request is sent and the custom app does not need `core.subledger_aggregate.create`

#### Scenario: Aggregate difference
- **WHEN** `checks.aggregates` is true and apaleo's daily aggregate for a main account differs from the rolled-up ledger lines of that day
- **THEN** warning `W-AGGREGATE-DIFF` names the day, the account and both amounts, and the file is still written

#### Scenario: Conservation violated
- **WHEN** a defect causes a ledger line to be neither booked nor listed as skipped
- **THEN** error `E-CONSERVATION` is raised and no file is written
