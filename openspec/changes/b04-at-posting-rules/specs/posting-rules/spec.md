## ADDED Requirements

### Requirement: Bad debt with VAT correction
Lines that debit a LossOfAccountsReceivable account SHALL be booked through its mapping row: with tax entries, the bad-debt row SHALL carry an output-tax Steuercode and the line's rate, so that the booking has the bad-debt account as `konto`, the positive net amount and the positive tax amount (an USt-Berichtigung); without tax entries the row SHALL have no Steuercode and the line is booked without tax fields. The posting summary SHALL show the total of written-off receivables per rate.

#### Scenario: Write-off with VAT correction
- **WHEN** a line debits the LossOfAccountsReceivable 10 % account (mapped to `7800`, Steuercode 3, rate 10) and credits guest receivables (`2390`) with gross 55.00, net 50.00 and taxes 5.00 at 10 %
- **THEN** the booking has konto `7800`, gkonto `2390`, amount 50.00, tax 5.00, Steuercode 3, and the summary shows 55.00 written off at 10 %

#### Scenario: Write-off without VAT
- **WHEN** a write-off line of 30.00 has no tax entries and debits an account mapped to `7809` without Steuercode
- **THEN** the booking has konto `7809`, gkonto `2390`, amount 30.00 and no tax fields

### Requirement: Cancellation and no-show fees
Cancellation and no-show fees SHALL be booked through their revenue mapping rows like other revenue, with the rate apaleo charged and under the VAT guard; the posting module SHALL NOT change their tax.

#### Scenario: Untaxed cancellation fee
- **WHEN** a line credits a revenue account "Stornogebühr" mapped to `4091` without Steuercode with gross 80.00 and no taxes
- **THEN** the booking has konto `2390`, gkonto `4091`, amount 80.00 and no tax fields

#### Scenario: Taxed no-show on an untaxed row
- **WHEN** a no-show line with taxes 8.00 at 10 % credits an account mapped without Steuercode
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: Austrian fixture month
The test suite SHALL post a fabricated Austrian fixture month (rooms at 10 %, breakfast at 10 %, drinks at 20 %, Ortstaxe, a deposit received at 10 %, released at check-out and partly refunded, a cancellation fee at 0 %, card, cash and invoice payments, an invoice on accounts receivable and a write-off with VAT correction) with the EKR fixture mapping, and SHALL compare every summary value and every booking with hand-computed values recorded in the test.

#### Scenario: Totals of the Austrian month
- **WHEN** `test/posting/fixture-month-at.test.ts` runs
- **THEN** revenue per rate, tax per rate, Ortstaxe, deposits received and released, payments per clearing account, write-offs and the balance per BMD account equal the recorded constants, and no `E-` finding is raised
