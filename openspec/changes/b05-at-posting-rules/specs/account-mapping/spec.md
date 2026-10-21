## ADDED Requirements

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
- **WHEN** `bmd.dialect` is `ntcs` and a write-off debits a per-reservation LossOfAccountsReceivable account under `CollectiveDebitor_LossOfAccountsReceivable` at 10 % or 20 %
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
