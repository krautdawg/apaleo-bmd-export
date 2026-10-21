# Austrian fixture month: "Hotel Beispiel Tirol" (property `TIR`, August 2026)

Fabricated responses for one Austrian property (Innsbruck, `Europe/Vienna`), shaped exactly like the apaleo Swagger models (`test/apaleo/fixtures.test.ts` validates every file against `../swagger-excerpt.json`) and like the recorded real data in [`../live/`](../live/README.md): eight-decimal net and tax amounts, per-reservation accounts with `parentNumber`, `/Offset` second lines of payments and of the transfer to accounts receivable, the release of a deposit as a negative `PostCharge` with `taxes[]`, a refund as a negative `PostPrepayment`, no `PostPrepaymentVat`. No real hotel, guest or account is behind it: reservations are called `TIR-ALPHA-1` to `TIR-FOXTROT-1`. `test/helpers/apaleo.ts` serves the files as a fake apaleo API (`atMonth: true`), and `loadAtMonthData()` reads them through the real apaleo adapter.

| File | Swagger model | What it holds |
|---|---|---|
| `properties/page-1.json` | PropertyListModel | `TIR` Hotel Beispiel Tirol, EUR, `Europe/Vienna`. |
| `accounts-schema.json` | ChartOfAccountsModel | A subset of apaleo's Austrian chart (the recorded VIE chart): revenue groups `RevenueAccommodation`, `RevenueCancellationFees`, `RevenueFoodAndBeverages`, `RevenueNoShow` (13 %, not booked) and `RevenueOther`; payments `1102` Visa, `1104` Mastercard, `1400` Bank Transfer, `1600` Cash; `Vat_…` and `LiabilitiesVat_…`; city tax `3501` under `3500`; house `9000`, transitory items `7000`; in the guest, external and booking ledgers the containers `3000`, `1200`, `9999` and `6900` with `CollectiveDebitor_AccountsReceivable` and `CollectiveDebitor_LossOfAccountsReceivable`. |
| `export-gross-daily/<day>.json` | ExportGrossTransactionListModel | The ledger of one business day (below). Days without a file are answered with 204. |

There are no `aggregate-daily` files: the tests that use this month run without `checks.aggregates`. The EKR mapping for it is `test/fixtures/mapping/ekr-at-month.csv`: what `init-mapping --template ekr` writes on this chart, with only the Ortstaxe row filled in as a Kanzlei would (`3580`, a liability without Steuercode).

Business days (27 lines):

- **2026-08-03**: Visa prepayment 330.00 at 10 % for `TIR-ALPHA-1` onto `TIR-ALPHA-1_Liabilities/VeryReduced:10.00`.
- **2026-08-10**: one night of `TIR-BRAVO-1`: logis 98.00 at 10 % (net 89.09090909), breakfast 16.50 at 10 %, Ortstaxe 3.00 with a `Without`/0 %/0.00 tax entry, drinks 7.90 at 20 % (tax 1.31666667).
- **2026-08-11**: `TIR-BRAVO-1` pays 125.40 in cash, with its `/Offset` second line.
- **2026-08-12**: check-out of `TIR-ALPHA-1`: two nights of 110.00 at 10 %, Ortstaxe 6.00, the release of 220.00 of the deposit as a negative charge (tax −20.00), the refund of the remaining 110.00 to the Visa card as a negative prepayment (tax −10.00), and the Ortstaxe paid by Mastercard 6.00 with its `/Offset` line.
- **2026-08-14**: `TIR-CHARLIE-1` cancels: cancellation fee 45.00 on `RevenueCancellationFees_Without:0.00` (no `taxes`), paid by Mastercard with its `/Offset` line.
- **2026-08-18**: one night of `TIR-FOXTROT-1`, 55.00 at 10 %, never paid.
- **2026-08-20**: company stay `TIR-DELTA-1`: logis 132.00 and breakfast 21.00 at 10 % (tax 1.90909091), checked out to accounts receivable with the invoice `TIR-2026-0815` (two `PostToAccountsReceivables` lines on `TIR-DELTA-1_AccountsReceivable` and its `/Offset`, like the recorded VIE day).
- **2026-08-24**: `TIR-ECHO-1`: logis 89.00 at 10 % (tax 8.09090909) and drinks 4.80 at 20 %, paid by bank transfer 93.80 against the invoice `TIR-2026-0816`, with its `/Offset` line.
- **2026-08-28**: the open 55.00 of `TIR-FOXTROT-1` is written off with the VAT correction: `PostToLossOfAccountsReceivables`, debit `TIR-FOXTROT-1_LossOfAccountsReceivable`, credit `TIR-FOXTROT-1_Receivables`, net 50.00, tax 5.00 at 10 %.

**Assumption:** no recorded apaleo day contains a write-off. The account `TIR-FOXTROT-1_LossOfAccountsReceivable` with `parentNumber` `6900` is fabricated by analogy with accounts receivable, where the recorded per-reservation accounts (`AHTJTGFK-1_AccountsReceivable` and its `/Offset`) carry the top container `9999` as parent, not its child `CollectiveDebitor_AccountsReceivable`. The mapping resolves it through the rate wildcards of `LossOfAccountsReceivable` whatever the parent. When `apaleo-bmd live-smoke` records a real write-off, add it to `../live/` and correct this file if the shape differs.

The amounts are chosen so that BMD's check of every booking (Betrag × rate) equals apaleo's tax rounded to cents: the month has no `W-VAT-ROUNDING`. The hand-computed totals are in `test/posting/fixture-month-at.test.ts`; the BMD file is `test/golden/bmd/at-month.csv`.
