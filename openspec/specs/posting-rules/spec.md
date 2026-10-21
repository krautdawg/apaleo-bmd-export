# posting-rules Specification

## Purpose
The PMS-neutral posting rules that turn canonical ledger lines into DATEV bookings: the direction rule (VAT side in Gegenkonto), the per-line VAT consistency guard, the rate inference for untaxed deposit releases, skip rules, field filling without personal data, and the posting summary.
## Requirements
### Requirement: One booking per ledger line
The posting module SHALL turn every ledger line that is not skipped into exactly one BMD booking whose business date is the line's business date and which carries the line's source entry number for traceability. Its Buchungssymbol SHALL be the property's `buchsymbolZahlung` (`properties[].buchsymbolZahlung`, else `bmd.buchsymbolZahlung`, else the property's Buchungssymbol) for a line without VAT side that has a side of type Payments, and the property's Buchungssymbol (`properties[].buchsymbol`, else `bmd.buchsymbol`) for every other line.

#### Scenario: Card payment
- **WHEN** a line debits the Visa payment account (mapped to `2890`) and credits a guest receivables account (mapped to `2390`) with gross 120.00 and no taxes, and `bmd.buchsymbol` is `HO` with no `buchsymbolZahlung`
- **THEN** one booking is produced with konto `2890`, gkonto `2390`, amount 120.00 (Soll), no Steuercode, no rate, no tax and Buchungssymbol `HO`

#### Scenario: Separate payment symbol
- **WHEN** `bmd.buchsymbol` is `HO`, `bmd.buchsymbolZahlung` is `HZ`, and the period has a card payment and an accommodation charge
- **THEN** the payment booking carries `HZ` and the revenue booking carries `HO`

#### Scenario: Per-property symbol
- **WHEN** properties `BSP` and `BS2` are exported with `bmd.buchsymbol` `HO` and `properties[1].buchsymbol` `HO2`
- **THEN** every booking of `BS2` carries `HO2`, every booking of `BSP` carries `HO`, and no `W-BUCHSYMBOL-SHARED` is reported

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
The posting module SHALL skip, and list with reason, count and unsigned gross total (the sum of absolute gross amounts): lines touching apaleo Vat or VatOnLiabilities accounts (always, because BMD books the tax from the `steuer` field of the taxed line), lines with zero gross amount, and lines whose two sides map to the same BMD account.

#### Scenario: Move between guest folios
- **WHEN** a `MoveLineItem` line moves 50.00 between two guest receivables accounts that both map to `2390`
- **THEN** no booking is produced and the summary lists one `SAME_ACCOUNT` line of 50.00

#### Scenario: VAT account lines are skipped
- **WHEN** a line touches a Vat or VatOnLiabilities account
- **THEN** no booking is produced, the summary lists it as `VAT_ACCOUNT_LINE` with its amount, and the Vat account does not need a mapping row

#### Scenario: Offset lines of payments
- **WHEN** the recorded VIE day 2026-10-21 is posted, whose five payments each have a second line `<folio>_Receivables → <folio>_Receivables/Offset` and whose AR transfer has a line `<res>_AccountsReceivable → <res>_AccountsReceivable/Offset`
- **THEN** the summary lists 6 `SAME_ACCOUNT` lines with an unsigned gross total of 312.60

### Requirement: Field filling without personal data
`extbelegnr` SHALL be the receipt number when `posting.extbelegnr` is `receipt` (the default) and a receipt number exists, otherwise the reference; `text` SHALL be built from a German command label (Erlös, Zahlung, Anzahlung, Umbuchung, Forderung, Forderungsverlust, …) and an account label, SHALL use the parent account name or a fixed label (`Gastforderung`, `Debitor`, `Anzahlung Gast`) instead of the leaf name for guest, booking and per-reservation accounts, and SHALL NOT contain guest names; `kost` SHALL be taken only from the mapping row of `konto` and only when that row is of type Revenues or LossOfAccountsReceivable, and SHALL stay empty on every other booking (payments, Personenkonto, deposit, city-tax and clearing lines), because BMD reads `kost` on a payment as the Belegnummer of the invoice it clears.

#### Scenario: Payment without invoice
- **WHEN** a payment line has receipt type PspReference number `PSP123` and reference `BSP-ABCDEF-1`
- **THEN** extbelegnr is `PSP123`

#### Scenario: Revenue line carries the Kostenstelle
- **WHEN** an accommodation charge credits a revenue account whose row has `kost` `10`
- **THEN** the booking has konto `4000` and kost `10`

#### Scenario: Payment line never carries kost
- **WHEN** a payment line debits `2890` and credits `2390`, and the rows of both accounts have a `kost` value
- **THEN** the booking's `kost` is empty

#### Scenario: Payment crediting a named guest folio
- **WHEN** a payment line debits the Visa account and credits a guest folio account named `Müller, Hans` (type Receivables, not in the global ledger)
- **THEN** the text is `Zahlung Gastforderung` (or the global parent's name) and does not contain `Müller`

### Requirement: VAT side in Konto
The posting module SHALL place the account whose mapping row has a Steuercode (the VAT side) in `konto` and the other account in `gkonto`, SHALL set the tax to apaleo's precise tax rounded half away from zero to cents and the amount to the gross minus that tax, both signed from the point of view of `konto` (negative when the VAT side is credited, positive when it is debited, flipped for a negative gross), and SHALL take Steuercode and rate from the VAT-side row. A line without a VAT side whose rows give exactly one side the type Revenues or LossOfAccountsReceivable SHALL be booked with that side in `konto`, the other in `gkonto` and the gross amount signed from `konto`, so the Kostenstelle of an untaxed charge is written like that of its allowance. Any other line without a VAT side SHALL be booked with the debited account in `konto`, the credited account in `gkonto` and the absolute gross amount as Soll amount (sides swapped for a negative gross). A side whose row is of type Payments, Receivables or AccountsReceivable and has a Steuercode SHALL NOT be booked; the line SHALL fail with `E-STEUERCODE-NOT-ALLOWED` naming the account and the mapping line.

#### Scenario: Accommodation charge at 10 %
- **WHEN** a line debits a guest receivables account (`2390`) and credits the accommodation 10 % revenue account (`4000`, Steuercode 1, rate 10) with gross 110.00, net 100.00 and taxes 10.00 at 10 %
- **THEN** the booking has konto `4000`, gkonto `2390`, amount −100.00, tax −10.00, Steuercode 1 and rate 10

#### Scenario: Allowance on accommodation
- **WHEN** a line debits the accommodation 10 % revenue account and credits the guest receivables account with gross 11.00, net 10.00 and taxes 1.00 at 10 %
- **THEN** the booking has konto `4000`, gkonto `2390`, amount 10.00 and tax 1.00

#### Scenario: Untaxed charge keeps its Kostenstelle
- **WHEN** a line debits guest receivables (`2390`) and credits the 0 % revenue account mapped to `4090` without Steuercode and with `kost` `10`, gross 45.00
- **THEN** the booking has konto `4090`, gkonto `2390`, amount −45.00, no tax and kost `10`, and its allowance has konto `4090`, amount 45.00 and kost `10`

#### Scenario: Steuercode on the receivables side
- **WHEN** the Receivables row maps to `2390` with Steuercode 1 and rate 10 and the revenue row has no Steuercode
- **THEN** the line is not booked and fails with `E-STEUERCODE-NOT-ALLOWED` naming the account and the mapping line

#### Scenario: Negative gross without VAT side
- **WHEN** a payment line debits `2890` and credits `2390` with gross −20.00 (a refund)
- **THEN** the booking has konto `2390`, gkonto `2890` and amount 20.00

#### Scenario: Untaxed revenue with a non-taxable Steuercode
- **WHEN** a line debits `2390` and credits a revenue account mapped to `4090` with Steuercode 81 at rate 0, with gross 80.00 and no taxes
- **THEN** the booking has konto `4090`, gkonto `2390`, amount −80.00, tax 0.00, Steuercode 81, rate 0, and no `E-VAT-UNEXPECTED` is raised

#### Scenario: Two VAT sides
- **WHEN** both mapped accounts of a line carry a Steuercode
- **THEN** a finding `E-TWO-VAT-SIDES` names the source entry number and both accounts, and no booking is produced for the line

### Requirement: Tax guard for BMD bookings
For every booked line the posting module SHALL first normalise `taxes[]` by dropping entries with percent 0 and amount 0, and SHALL then ensure that the VAT-side row's `bmd_vat_percent` equals apaleo's tax percent, that apaleo's precise net plus taxes equals its gross within half a cent (checked on the precise values, never again on separately rounded cents), that BMD's check value `round(|amount| × rate / 100)` differs from the absolute tax amount of the booking by at most one cent, and that the signs of tax and gross agree. The tax amount of a booking SHALL be apaleo's precise tax rounded half away from zero to cents, and its amount SHALL be the gross minus that tax, so that `gkonto` receives exactly apaleo's gross. A VAT-side row with a Steuercode at rate 0 SHALL be accepted for a line without tax and SHALL book tax 0. A one-cent difference SHALL be a warning `W-VAT-ROUNDING` (the booking still carries apaleo's tax amount); larger differences, rate mismatches, taxed lines without a VAT side, untaxed lines with a VAT side above 0 %, and lines with several tax rates SHALL be errors that name the source entry number and the mapping row to fix. Sub-cent digits of apaleo's precise tax SHALL never cause a finding on a line.

#### Scenario: Drinks at 20 %
- **WHEN** a line credits the drinks account (`4020`, Steuercode 1, rate 20) with gross 24.00, net 20.00 and taxes 4.00 at 20 %
- **THEN** the booking carries amount −20.00 and tax −4.00, no finding is raised, and the summary shows 24.00 gross revenue at 20 %

#### Scenario: Breakfast food at 10 %
- **WHEN** a line credits the food account (`4010`, Steuercode 1, rate 10) with gross 16.50, net 15.00 and taxes 1.50 at 10 %
- **THEN** the booking carries amount −15.00 and tax −1.50 and no finding is raised

#### Scenario: Zero-rate tax entry
- **WHEN** a city-tax line has `taxes[]` with one entry of type `Without`, percent 0, amount 0.00, and credits an account mapped without Steuercode
- **THEN** the entry is dropped by normalisation and no `E-VAT-MISSING` is raised

#### Scenario: Negative allowance with negative tax
- **WHEN** an allowance line has gross −11.00, net −10.00 and taxes −1.00 at 10 % and credits the receivables side of a 10 % revenue account
- **THEN** the booking carries amount 10.00 and tax 1.00 on the revenue account, the signs agree, and no `E-VAT-AMOUNT` is raised

#### Scenario: Wrong rate in mapping
- **WHEN** an apaleo line taxed at 10 % credits an account mapped to Steuercode 1 at 20 %
- **THEN** a finding `E-VAT-RATE` is raised and the export is blocked

#### Scenario: Taxed line on an untaxed BMD account
- **WHEN** an apaleo line with 10.00 tax credits an account mapped without Steuercode
- **THEN** a finding `E-VAT-MISSING` is raised

#### Scenario: One-cent rounding
- **WHEN** `round(|net| × rate / 100)` differs by one cent from apaleo's tax amount
- **THEN** a warning `W-VAT-ROUNDING` is raised, the booking carries apaleo's tax amount, and the difference is added to the rounding total in the summary

#### Scenario: Precise tax from apaleo
- **WHEN** the recorded VIE line `000000029` credits the accommodation 13 % account (`4040`, Steuercode 1, rate 13) with gross 95.00, net 84.07079646 and tax 10.92920354 at 13 %
- **THEN** the booking carries amount −84.07 and tax −10.93, and no finding is raised

#### Scenario: One-cent difference on real data
- **WHEN** the recorded VIE line `000000031` credits the food 10 % account with gross 46.80 and tax 4.25454545 at 10 %
- **THEN** the booking carries amount −42.55 and tax −4.25, BMD's check value is 4.26, and exactly one `W-VAT-ROUNDING` is raised for the line

#### Scenario: Net and tax do not add up
- **WHEN** apaleo returns a line with gross 110.00, net 100.00 and taxes 9.00 at 10 %
- **THEN** reading fails with the adapter's half-cent check, naming the source entry number and the three amounts, and no file is written

### Requirement: Ortstaxe and guest levies
Lines on CityTaxes, SecondCityTax and GuestLevies accounts SHALL be booked through their mapping rows like any other line, so that a guest-owed Ortstaxe or Nächtigungsabgabe mapped to a liability or durchlaufender Posten without Steuercode is booked without tax, and a levy that apaleo taxes is booked on a revenue account with the matching Steuercode and rate; the VAT guard SHALL apply to both.

#### Scenario: Guest-owed Ortstaxe
- **WHEN** a line debits guest receivables (`2390`) and credits the city-tax account mapped to `3580` without Steuercode with gross 5.20 and no taxes
- **THEN** the booking has konto `2390`, gkonto `3580`, amount 5.20, no tax fields, and the summary shows 5.20 city tax

### Requirement: Deposits and accounts receivable in BMD
Prepayment lines (`PostPrepayment`) SHALL be booked to the mapped deposit account, and accounts-receivable lines (`PostToAccountsReceivables`) to the mapped Sachkonto or Personenkonto, both under the VAT guard. A Liabilities side SHALL count as a deposit increase when it is credited with a positive amount or debited with a negative amount, and as a decrease otherwise; a decrease whose other side is a Payments account is a refund. This covers apaleo's real shapes: a release as `PostCharge` debit guest receivables, credit `<reservation>_Liabilities/<rate>` with negative gross and negative taxes, a refund as `PostPrepayment` with negative gross, and an overpayment parked on the 0 % deposit as `PostCharge` credit `<reservation>_Liabilities/Null:0.00` with positive gross.

#### Scenario: Prepayment at 10 %
- **WHEN** a line debits the card payment account (`2890`) and credits the guest liabilities 10 % account mapped to `3200` with Steuercode 1 and rate 10, with gross 220.00, net 200.00 and taxes 20.00 at 10 %, and `bmd.buchsymbolZahlung` is set
- **THEN** the booking has konto `3200`, gkonto `2890`, amount −200.00, tax −20.00, Steuercode 1, rate 10, the main Buchungssymbol (it has a VAT side), and the summary shows 220.00 deposits received

#### Scenario: Check-out on accounts receivable
- **WHEN** a line debits the AccountsReceivable account (mapped to Personenkonto `200000`) and credits guest receivables (`2390`) with gross 300.00 and receipt type Invoice number `BSP-2026-0042`
- **THEN** the booking has konto `200000`, gkonto `2390`, amount 300.00, extbelegnr `BSP-2026-0042`

#### Scenario: Release as a negative charge
- **WHEN** the recorded VIE line `000000025` (`PostCharge`) debits `WXPBFNSN-1_Receivables` and credits `WXPBFNSN-1_Liabilities/Reduced:13.00` (13 % wildcard, `3202`, Steuercode 1) with gross −105.00 and tax −12.07964602 at 13 %
- **THEN** the booking has konto `3202`, gkonto `2390`, amount 92.92 and tax 12.08, and the summary counts 105.00 as released, not as received

#### Scenario: Overpayment parked on the 0 % deposit
- **WHEN** a `PostCharge` line debits `WXPBFNSN-1_Receivables` and credits `WXPBFNSN-1_Liabilities/Null:0.00` (0 % wildcard, `3209`) with gross 10.00 and no taxes (recorded VIE, 2026-10-21)
- **THEN** the booking has konto `2390`, gkonto `3209`, amount 10.00, no tax fields, and the summary counts 10.00 as received

#### Scenario: Refund of a deposit
- **WHEN** the recorded VIE line `000000028` (`PostPrepayment`) debits the Maestro payment account and credits `WXPBFNSN-1_Liabilities/Null:0.00` (0 % wildcard, `3209`) with gross −10.00 and no taxes
- **THEN** the booking has no tax fields, and the summary counts 10.00 as released and, of the released, as refunded

### Requirement: Posting summary for BMD
The posting module SHALL return a summary with Soll, Haben and balance per BMD account (from the movement model: konto gets the amount, gkonto the amount plus tax), revenue per VAT rate with net, tax and gross as passed to BMD and apaleo's precise VAT on the same lines (summed exactly) with the difference, deposit tax per rate the same way, city-tax total, payments per clearing account, deposits received, released and, of the released, refunded, classified by side and sign, the net movement on accounts receivable, skipped lines per reason with count and unsigned gross, the rounding total, and findings grouped by code.

#### Scenario: Summary of the fixture month
- **WHEN** the fixture period is posted with the EKR fixture mapping
- **THEN** the summary values equal the hand-computed totals recorded in the test

#### Scenario: Summary of the recorded VIE day
- **WHEN** the recorded VIE responses of 2026-10-21 are posted with the committed EKR live mapping
- **THEN** revenue gross is 85.20 at 10 %, 410.02 at 13 %, 47.38 at 20 % and 45.00 at 0 %; revenue tax is 7.74 against apaleo 7.75 (precise 7.74545454) at 10 %, 47.17 against 47.17 at 13 % and 7.89 against 7.90 at 20 %; deposit tax is 20.25 at 13 % and 3.33 at 20 %; payments are 111.70 cash and 576.90 non-cash; deposits received 491.00, released 295.00, of it refunded 10.00; accounts receivable 95.00

### Requirement: Bad debt with VAT correction
Lines that debit a LossOfAccountsReceivable account SHALL be booked through its mapping row: with tax entries, the bad-debt row SHALL carry the output-tax Steuercode of the dialect (`ntcs`: 1) and the line's rate, so that the booking has the bad-debt account as `konto`, the positive net amount and the positive tax amount (an USt-Berichtigung that reduces the Umsatzsteuer); without tax entries the row SHALL have no Steuercode and the line is booked without tax fields. The posting summary SHALL show the total of written-off receivables per rate.

#### Scenario: Write-off with VAT correction
- **WHEN** a line debits a per-reservation LossOfAccountsReceivable account at 10 % (resolved through the wildcard to `7800`, Steuercode 1, rate 10) and credits guest receivables (`2390`) with gross 55.00, net 50.00 and taxes 5.00 at 10 %
- **THEN** the booking has konto `7800`, gkonto `2390`, amount 50.00, tax 5.00, Steuercode 1, and the summary shows 55.00 written off at 10 %

#### Scenario: Write-off without VAT
- **WHEN** a write-off line of 30.00 has no tax entries and debits an account mapped to `7809` without Steuercode
- **THEN** the booking has konto `7809`, gkonto `2390`, amount 30.00 and no tax fields

### Requirement: Cancellation and no-show fees
Cancellation and no-show fees SHALL be booked through their revenue mapping rows like other revenue, with the rate apaleo charged and under the VAT guard; the posting module SHALL NOT change their tax.

#### Scenario: Untaxed cancellation fee
- **WHEN** a line credits a revenue account "Stornogebühr" mapped to `4091` without Steuercode with gross 80.00 and no taxes
- **THEN** the booking has konto `4091`, gkonto `2390`, amount −80.00 (the revenue account leads, as for every untaxed charge) and no tax fields

#### Scenario: Taxed no-show on an untaxed row
- **WHEN** a no-show line with taxes 8.00 at 10 % credits an account mapped without Steuercode
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: Austrian fixture month
The test suite SHALL post a fabricated Austrian fixture month, shaped like apaleo's recorded real data (eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` second lines, releases as negative charges with `taxes[]`, no `PostPrepaymentVat`) (rooms at 10 %, breakfast at 10 %, drinks at 20 %, Ortstaxe, a deposit received at 10 %, released at check-out and partly refunded, a cancellation fee at 0 %, card, cash and invoice payments, an invoice on accounts receivable and a write-off with VAT correction) with the EKR fixture mapping, and SHALL compare every summary value and every booking with hand-computed values recorded in the test.

#### Scenario: Totals of the Austrian month
- **WHEN** `test/posting/fixture-month-at.test.ts` runs
- **THEN** revenue per rate, tax per rate, Ortstaxe, deposits received and released, payments per clearing account, write-offs and the balance per BMD account equal the recorded constants, every taxed booking carries Steuercode 1, and no `E-` finding is raised

