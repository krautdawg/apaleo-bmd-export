## MODIFIED Requirements

### Requirement: One booking per ledger line
The posting module SHALL turn every ledger line that is not skipped into exactly one BMD booking whose business date is the line's business date, whose Buchungssymbol is `bmd.buchsymbol`, and which carries the line's source entry number for traceability.

#### Scenario: Card payment
- **WHEN** a line debits the Visa payment account (mapped to `2890`) and credits a guest receivables account (mapped to `2390`) with gross 120.00 and no taxes
- **THEN** one booking is produced with konto `2890`, gkonto `2390`, amount 120.00 (Soll), no Steuercode, no rate and no tax

### Requirement: VAT consistency guard
For every booked line the posting module SHALL first normalise `taxes[]` by dropping entries with percent 0 and amount 0, and SHALL then ensure that the VAT-side row's `bmd_vat_percent` equals apaleo's tax percent, that apaleo's net plus tax equals its gross, that BMD's check value `round(|net| × rate / 100)` differs from the absolute apaleo tax amount by at most one cent, and that the signs of tax and gross agree. A one-cent difference SHALL be a warning `W-VAT-ROUNDING` (the booking still carries apaleo's tax amount); larger differences, rate mismatches, taxed lines without a VAT side, untaxed lines with a VAT side above 0 %, and lines with several tax rates SHALL be errors that name the source entry number and the mapping row to fix.

#### Scenario: Drinks at 20 %
- **WHEN** a line credits the drinks account (`4020`, Steuercode 3, rate 20) with gross 24.00, net 20.00 and taxes 4.00 at 20 %
- **THEN** the booking carries amount −20.00 and tax −4.00, no finding is raised, and the summary shows 24.00 gross revenue at 20 %

#### Scenario: Breakfast food at 10 %
- **WHEN** a line credits the food account (`4010`, Steuercode 3, rate 10) with gross 16.50, net 15.00 and taxes 1.50 at 10 %
- **THEN** the booking carries amount −15.00 and tax −1.50 and no finding is raised

#### Scenario: Zero-rate tax entry
- **WHEN** a city-tax line has `taxes[]` with one entry of type `Without`, percent 0, amount 0.00, and credits an account mapped without Steuercode
- **THEN** the entry is dropped by normalisation and no `E-VAT-MISSING` is raised

#### Scenario: Negative allowance with negative tax
- **WHEN** an allowance line has gross −11.00, net −10.00 and taxes −1.00 at 10 % and credits the receivables side of a 10 % revenue account
- **THEN** the booking carries amount 10.00 and tax 1.00 on the revenue account, the signs agree, and no `E-VAT-AMOUNT` is raised

#### Scenario: Wrong rate in mapping
- **WHEN** an apaleo line taxed at 10 % credits an account mapped to Steuercode 3 at 20 %
- **THEN** a finding `E-VAT-RATE` is raised and the export is blocked

#### Scenario: Taxed line on an untaxed BMD account
- **WHEN** an apaleo line with 10.00 tax credits an account mapped without Steuercode
- **THEN** a finding `E-VAT-MISSING` is raised

#### Scenario: One-cent rounding
- **WHEN** `round(|net| × rate / 100)` differs by one cent from apaleo's tax amount
- **THEN** a warning `W-VAT-ROUNDING` is raised, the booking carries apaleo's tax amount, and the difference is added to the rounding total in the summary

#### Scenario: Net and tax do not add up
- **WHEN** a line has gross 110.00, net 100.00 and taxes 9.00 at 10 %
- **THEN** a finding `E-VAT-AMOUNT` names the source entry number and the three amounts, and no booking is produced for the line

### Requirement: City tax and guest levies
Lines on CityTaxes, SecondCityTax and GuestLevies accounts SHALL be booked through their mapping rows like any other line, so that a guest-owed Ortstaxe or Nächtigungsabgabe mapped to a liability or durchlaufender Posten without Steuercode is booked without tax, and a levy that apaleo taxes is booked on a revenue account with the matching Steuercode and rate; the VAT guard SHALL apply to both.

#### Scenario: Guest-owed Ortstaxe
- **WHEN** a line debits guest receivables (`2390`) and credits the city-tax account mapped to `3580` without Steuercode with gross 5.20 and no taxes
- **THEN** the booking has konto `2390`, gkonto `3580`, amount 5.20, no tax fields, and the summary shows 5.20 city tax

### Requirement: Deposits and accounts receivable
Prepayment lines (`PostPrepayment`) SHALL be booked to the mapped deposit account, and accounts-receivable lines (`PostToAccountsReceivables`) to the mapped Sachkonto or Personenkonto, both under the VAT guard.

#### Scenario: Prepayment at 10 %
- **WHEN** a line debits the card payment account (`2890`) and credits the guest liabilities 10 % account mapped to `3200` with Steuercode 1 and rate 10, with gross 220.00, net 200.00 and taxes 20.00 at 10 %
- **THEN** the booking has konto `3200`, gkonto `2890`, amount −200.00, tax −20.00, Steuercode 1, rate 10, and the summary shows 220.00 deposits received

#### Scenario: Check-out on accounts receivable
- **WHEN** a line debits the AccountsReceivable account (mapped to Personenkonto `200000`) and credits guest receivables (`2390`) with gross 300.00 and receipt type Invoice number `BSP-2026-0042`
- **THEN** the booking has konto `200000`, gkonto `2390`, amount 300.00, extbelegnr `BSP-2026-0042`

### Requirement: Deposit release without taxes
When a line debits a Liabilities account and credits a Receivables account and carries no tax entries after normalisation, the posting module SHALL infer the VAT rate from the skipped `PostPrepaymentVat` line(s) of the same business date and reference, else from the chart VAT of the Liabilities account or its parent, SHALL use that rate for mapping resolution and the VAT guard, SHALL take the tax amount from those `PostPrepaymentVat` lines or, with a chart rate only, compute it as `round(|gross| × rate / (100 + rate))`, and SHALL raise `E-VAT-RATE-UNKNOWN` when no rate can be inferred. Any other untaxed line with exactly one Liabilities side (a deposit refunded or received without tax entries) SHALL take its rate and tax amount from a `PostPrepaymentVat` line of the same business date and reference that moves VAT in its direction, with the same amount check, and SHALL keep rate 0 only when there is no such line. A release booked with a chart rate SHALL always raise `W-VAT-INFERRED`, also at 0 %.

#### Scenario: Release with taxes
- **WHEN** a release line of 220.00 debits a per-reservation `_Liabilities` account and credits guest receivables with net 200.00 and taxes 20.00 at 10 %
- **THEN** the debit resolves to the 10 % Liabilities row and the booking has konto `3200`, gkonto `2390`, amount 200.00 and tax 20.00, and no finding is raised

#### Scenario: Release without taxes plus a PostPrepaymentVat pair
- **WHEN** the release line of 220.00 has no `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference carries 20.00 at 10 %
- **THEN** the release resolves to the 10 % Liabilities row with amount 200.00 and tax 20.00, the pair is skipped as `VAT_ACCOUNT_LINE`, and no `E-VAT-UNEXPECTED` is raised

#### Scenario: Release with a chart rate only
- **WHEN** a release line of 220.00 has no `taxes[]` and no matching `PostPrepaymentVat` line, and its Liabilities account (or its parent) carries 10 % in the chart
- **THEN** the release is booked on the 10 % deposit row with tax 20.00 and a warning `W-VAT-INFERRED` names the line and the chart account

#### Scenario: Release with no rate source
- **WHEN** a release line has no `taxes[]`, no matching `PostPrepaymentVat` line, and its account has no VAT in the chart
- **THEN** a finding `E-VAT-RATE-UNKNOWN` names the source entry number and the export is blocked

#### Scenario: Release with a chart rate of 0 %
- **WHEN** a release line has no `taxes[]` and no matching `PostPrepaymentVat` line, and its Liabilities account (or its parent) carries 0 % in the chart
- **THEN** the release is booked on the 0 % deposit row without tax fields and a warning `W-VAT-INFERRED` names the line, the chart account and the 0 % rate

#### Scenario: Untaxed deposit refund with a PostPrepaymentVat line
- **WHEN** a refund of 110.00 debits a per-reservation `_Liabilities` account and credits a payment account without `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference reverses 10.00 at 10 % (debit VAT on liabilities)
- **THEN** the refund resolves to the 10 % Liabilities row with amount 100.00 and tax 10.00 on `3200`, and no finding is raised; a mismatch of more than one cent between the pair and the computed tax raises `E-VAT-AMOUNT`

#### Scenario: Untaxed prepayment received with a PostPrepaymentVat line
- **WHEN** a prepayment of 110.00 credits a per-reservation `_Liabilities` account without `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference books 10.00 at 10 % (credit VAT on liabilities)
- **THEN** the prepayment resolves to the 10 % Liabilities row with amount −100.00 and tax −10.00 and no finding is raised; without such a line it stays on the 0 % deposit row

### Requirement: Skipped lines are reported
The posting module SHALL skip, and list with reason, count and gross total: lines touching apaleo Vat or VatOnLiabilities accounts (always, because BMD books the tax from the `steuer` field of the taxed line), lines with zero gross amount, and lines whose two sides map to the same BMD account.

#### Scenario: Move between guest folios
- **WHEN** a `MoveLineItem` line moves 50.00 between two guest receivables accounts that both map to `2390`
- **THEN** no booking is produced and the summary lists one `SAME_ACCOUNT` line of 50.00

#### Scenario: VAT account lines are skipped
- **WHEN** a line touches a Vat or VatOnLiabilities account
- **THEN** no booking is produced, the summary lists it as `VAT_ACCOUNT_LINE` with its amount, and the Vat account does not need a mapping row

### Requirement: Field filling without personal data
`extbelegnr` SHALL be the receipt number when `posting.extbelegnr` is `receipt` (the default) and a receipt number exists, otherwise the reference; `text` SHALL be built from a German command label (Erlös, Zahlung, Anzahlung, Umbuchung, Forderung, Forderungsverlust, …) and an account label, SHALL use the parent account name or a fixed label (`Gastforderung`, `Debitor`, `Anzahlung Gast`) instead of the leaf name for guest, booking and per-reservation accounts, and SHALL NOT contain guest names; `kost` SHALL come from the mapping, preferring the VAT-side row, then the konto row, then the gkonto row.

#### Scenario: Payment without invoice
- **WHEN** a payment line has receipt type PspReference number `PSP123` and reference `BSP-ABCDEF-1`
- **THEN** extbelegnr is `PSP123`

#### Scenario: Payment crediting a named guest folio
- **WHEN** a payment line debits the Visa account and credits a guest folio account named `Müller, Hans` (type Receivables, not in the global ledger)
- **THEN** the text is `Zahlung Gastforderung` (or the global parent's name) and does not contain `Müller`

### Requirement: Posting summary
The posting module SHALL return a summary with Soll, Haben and balance per BMD account (from the movement model: konto gets the amount, gkonto the amount plus tax), revenue per VAT rate with net, tax and gross as passed to BMD, city-tax total, payments per clearing account, deposits received and released, skipped lines per reason, the rounding total, and findings grouped by code.

#### Scenario: Summary of the fixture month
- **WHEN** the fixture period is posted with the EKR fixture mapping
- **THEN** the summary values equal the hand-computed totals recorded in the test

## ADDED Requirements

### Requirement: VAT side in Konto
The posting module SHALL place the account whose mapping row has a Steuercode (the VAT side) in `konto` and the other account in `gkonto`, SHALL set the amount to apaleo's net amount signed from the point of view of `konto` (negative when the VAT side is credited, positive when it is debited, flipped for a negative gross), SHALL set the tax to apaleo's tax amount with the same sign, and SHALL take Steuercode and rate from the VAT-side row. A line without a VAT side SHALL be booked with the debited account in `konto`, the credited account in `gkonto` and the absolute gross amount as Soll amount (sides swapped for a negative gross).

#### Scenario: Accommodation charge at 10 %
- **WHEN** a line debits a guest receivables account (`2390`) and credits the accommodation 10 % revenue account (`4000`, Steuercode 3, rate 10) with gross 110.00, net 100.00 and taxes 10.00 at 10 %
- **THEN** the booking has konto `4000`, gkonto `2390`, amount −100.00, tax −10.00, Steuercode 3 and rate 10

#### Scenario: Allowance on accommodation
- **WHEN** a line debits the accommodation 10 % revenue account and credits the guest receivables account with gross 11.00, net 10.00 and taxes 1.00 at 10 %
- **THEN** the booking has konto `4000`, gkonto `2390`, amount 10.00 and tax 1.00

#### Scenario: Negative gross without VAT side
- **WHEN** a payment line debits `2890` and credits `2390` with gross −20.00 (a refund)
- **THEN** the booking has konto `2390`, gkonto `2890` and amount 20.00

#### Scenario: Two VAT sides
- **WHEN** both mapped accounts of a line carry a Steuercode
- **THEN** a finding `E-TWO-VAT-SIDES` names the source entry number and both accounts, and no booking is produced for the line

## REMOVED Requirements

### Requirement: VAT side in Gegenkonto
**Reason**: DATEV computes VAT on the Gegenkonto; BMD computes and books it only on the leading account (`konto`).
**Migration**: Replaced by "VAT side in Konto".
