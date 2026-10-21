## MODIFIED Requirements

### Requirement: VAT consistency guard
For every booked line the posting module SHALL first normalise `taxes[]` by dropping entries with percent 0 and amount 0, and SHALL then ensure that the VAT rate DATEV will apply equals apaleo's tax percent, that DATEV's VAT computed from the absolute gross amount differs from the absolute apaleo tax amount, taken as apaleo's precise tax rounded half away from zero to cents, by at most one cent, and that the signs of tax and gross agree. A one-cent difference SHALL be a warning `W-VAT-ROUNDING`; larger differences, rate mismatches, taxed lines without a VAT side, untaxed lines with a VAT side, and lines with several tax rates SHALL be errors that name the source entry number and the mapping row to fix. Sub-cent digits of apaleo's precise tax SHALL never cause a finding on a line.

#### Scenario: Drinks at 19 %
- **WHEN** a line credits the 19 % revenue account (8400, rate 19) with gross 23.80 and taxes 3.80 at 19 %
- **THEN** DATEV's VAT is 3.80, no finding is raised, and the summary shows 23.80 gross revenue at 19 %

#### Scenario: Breakfast food at 7 % (2026 rules)
- **WHEN** a line credits the food revenue account (8300, rate 7) with gross 12.00 and taxes 0.79 at 7 %
- **THEN** DATEV's VAT is 0.79 and no finding is raised

#### Scenario: Precise tax from apaleo
- **WHEN** a line credits the 7 % revenue account (8300) with gross 114.00 and a precise tax of 7.45794393 at 7 %
- **THEN** DATEV's VAT is 7.46, apaleo's rounded tax is 7.46, and no finding is raised

#### Scenario: Zero-rate tax entry
- **WHEN** a city-tax line has `taxes[]` with one entry of type `Without`, percent 0, amount 0.00, and credits an account mapped with rate 0
- **THEN** the entry is dropped by normalisation and no `E-VAT-MISSING` is raised

#### Scenario: Negative allowance with negative tax
- **WHEN** an allowance line has gross −10.00 and taxes −0.65 at 7 % and credits the receivables side of a 7 % revenue account
- **THEN** DATEV's VAT on 10.00 (0.65) is compared with |−0.65|, the signs agree, and no `E-VAT-AMOUNT` is raised

#### Scenario: Wrong rate in mapping
- **WHEN** an apaleo line taxed at 7 % credits an account mapped to a 19 % DATEV rate
- **THEN** a finding `E-VAT-RATE` is raised and the export is blocked

#### Scenario: Taxed line on an untaxed DATEV account
- **WHEN** an apaleo line with 6.54 tax credits an account mapped with rate 0 and no BU key
- **THEN** a finding `E-VAT-MISSING` is raised

#### Scenario: One-cent rounding
- **WHEN** DATEV's VAT computed from the gross amount differs by one cent from apaleo's tax amount
- **THEN** a warning `W-VAT-ROUNDING` is raised and the difference is added to the rounding total in the summary

#### Scenario: DATEV rate of a row unknown
- **WHEN** a line resolves to a row with a BU key the tool does not know and an empty `datev_vat_percent`
- **THEN** a finding `E-DATEV-RATE-UNKNOWN` names the mapping line and asks for `datev_vat_percent`, and no booking is produced

### Requirement: Deposits and accounts receivable
Prepayment lines (`PostPrepayment`) SHALL be booked to the mapped liability account, and accounts-receivable lines (`PostToAccountsReceivables`) to the mapped collective debtor, both under the VAT guard. A Liabilities side SHALL count as a deposit increase when it is credited with a positive amount or debited with a negative amount, and as a decrease otherwise; a decrease whose other side is a Payments account is a refund. This covers apaleo's real shapes: a release as `PostCharge` debit guest receivables, credit `<reservation>_Liabilities/<rate>` with negative gross and negative taxes, a refund as `PostPrepayment` with negative gross, and an overpayment parked on the 0 % deposit as `PostCharge` debit guest receivables, credit `<reservation>_Liabilities/Null:0.00` with positive gross.

#### Scenario: Prepayment at 7 %
- **WHEN** a line debits the card payment account (1360) and credits the guest liabilities 7 % account mapped to a taxed deposit account (rate 7) with gross 200.00 and taxes 13.08 at 7 %
- **THEN** the booking is 20,000 cents, Konto 1360, Gegenkonto the deposit account, side `S`, and the summary shows 200.00 deposits received

#### Scenario: Check-out on accounts receivable
- **WHEN** a line debits the AccountsReceivable account (mapped to 10000) and credits guest receivables (1410) with gross 300.00 and receipt type Invoice number `BSP-2026-0042`
- **THEN** the booking is 30,000 cents, Konto 10000, Gegenkonto 1410, side `S`, Belegfeld 1 `BSP-2026-0042`

#### Scenario: Release as a negative charge
- **WHEN** a `PostCharge` line debits `LJJRUJKV-1_Receivables` and credits `LJJRUJKV-1_Liabilities/Reduced:7.00` (parent `3000`) with gross −84.00 and tax −5.4953271 at 7 %
- **THEN** the credit resolves to the 7 % Liabilities row, the VAT guard passes with apaleo's rounded tax 5.50, and the summary counts 84.00 as released, not as received

#### Scenario: Refund of a deposit
- **WHEN** a `PostPrepayment` line debits the Girocard payment account and credits `EPEBVUIU-1_Liabilities/Null:0.00` with gross −10.00 and no taxes
- **THEN** the credit resolves to the 0 % Liabilities row, and the summary counts 10.00 as released and, of the released, as refunded

#### Scenario: Overpayment parked on the 0 % deposit
- **WHEN** a `PostCharge` line debits `WXPBFNSN-1_Receivables` and credits `WXPBFNSN-1_Liabilities/Null:0.00` with gross 10.00 and no taxes (recorded VIE, 2026-10-21)
- **THEN** the summary counts 10.00 as received

### Requirement: Skipped lines are reported
The posting module SHALL skip, and list with reason, count and unsigned gross total (the sum of absolute gross amounts): lines touching apaleo Vat or VatOnLiabilities accounts (always, in v1), lines with zero gross amount, and lines whose two sides map to the same DATEV account.

#### Scenario: Move between guest folios
- **WHEN** a `MoveLineItem` line moves 50.00 between two guest receivables accounts that both map to 1410
- **THEN** no booking is produced and the summary lists one `SAME_ACCOUNT` line of 50.00

#### Scenario: VAT account lines are skipped
- **WHEN** a line touches a Vat or VatOnLiabilities account
- **THEN** no booking is produced, the summary lists it as `VAT_ACCOUNT_LINE` with its amount, and the Vat account does not need a mapping row

#### Scenario: Offset lines of payments
- **WHEN** the recorded BER day 2026-10-21 is posted, whose five payments each have a second line `<folio>_Receivables → <folio>_Receivables/Offset` with the negative amount, and whose AR transfer has a line `<res>_AccountsReceivable → <res>_AccountsReceivable/Offset`
- **THEN** the summary lists 6 `SAME_ACCOUNT` lines with an unsigned gross total of 331.60, never a negative total

### Requirement: Posting summary
The posting module SHALL return a summary with Soll, Haben and balance per DATEV account; revenue per VAT rate with the VAT DATEV will compute booking by booking, apaleo's precise VAT on the same lines (summed exactly) and the difference; deposit VAT per rate the same way; city-tax total; payments per clearing account; deposits received, released and, of the released, refunded, classified by side and sign; the net movement on accounts receivable; skipped lines per reason with count and unsigned gross; the rounding total of `W-VAT-ROUNDING`; and findings grouped by code.

#### Scenario: Summary of the fixture month
- **WHEN** the fixture period is posted with the SKR03 fixture mapping
- **THEN** the summary values equal the hand-computed totals recorded in the test

#### Scenario: Summary of the recorded BER day
- **WHEN** the recorded BER responses of 2026-10-21 are posted with the committed live SKR03 mapping
- **THEN** revenue gross is 571.22 at 7 %, 47.38 at 19 % and 45.00 at 0 %; revenue VAT is 37.38 (DATEV) against 37.37 (apaleo, precise 37.3695327) at 7 % and 7.57 against 7.56 (precise 7.56487395) at 19 %, difference 0.01 each; deposit VAT is 14.26 against 14.26 at 7 % and 3.19 against 3.19 at 19 %; payments are 111.70 on 1000 and 675.90 on 1360; deposits received 590.00, released 352.00, of it refunded 10.00; accounts receivable 114.00; the rounding total is 0.00
