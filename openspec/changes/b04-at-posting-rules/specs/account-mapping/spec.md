## ADDED Requirements

### Requirement: Deposit Steuercode check
The config SHALL accept `bmd.anzahlungSteuercode` (an integer 0-99, default 1), and `mapping check` SHALL warn `W-DEPOSIT-STEUERCODE` for every row of type Liabilities with a rate above 0 whose Steuercode differs from it, naming the row, its code and the configured code.

#### Scenario: Default deposit code
- **WHEN** a Liabilities row at 10 % maps to `3200` with Steuercode 3 and `bmd.anzahlungSteuercode` is not set
- **THEN** the check warns `W-DEPOSIT-STEUERCODE` naming the row, code 3 and code 1, and exits with code 0 if nothing else fails

#### Scenario: Kanzlei chose Soll-USt
- **WHEN** `bmd.anzahlungSteuercode` is 3 and the Liabilities rows at 10 % and 20 % use Steuercode 3
- **THEN** no `W-DEPOSIT-STEUERCODE` is reported

### Requirement: Template rows for Austrian special cases
The EKR hotel template SHALL additionally map LossOfAccountsReceivable accounts by VAT rate (`7800` at 10 % and `7801` at 20 % with Steuercode 3, `7809` at 0 % without Steuercode), SHALL map revenue accounts whose name matches cancellation fees (Storno, Stornogebühr, Cancellation) at 0 % to `4091` without Steuercode and leave them unmapped with an explanatory comment at a rate above 0, and SHALL write the Ortstaxe comment naming the Bundesland table in `docs/mapping-guide.md`. Every such row SHALL be marked `Vorschlag (ungeprüft)`.

#### Scenario: Bad debt rows
- **WHEN** the chart contains LossOfAccountsReceivable accounts at 10 % and 20 %
- **THEN** they map to `7800` and `7801` with Steuercode 3 and the matching rate

#### Scenario: Taxed cancellation fee is left to the Kanzlei
- **WHEN** the chart contains a revenue account "No-Show Gebühr" at 10 %
- **THEN** its row has an empty BMD account and a comment that no-shows can be taxable and cancellation fees usually are not

#### Scenario: Ortstaxe comment
- **WHEN** the chart contains a CityTaxes account
- **THEN** its row stays empty and the comment names both booking options and `docs/mapping-guide.md`
