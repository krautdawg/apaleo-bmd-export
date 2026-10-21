# Live recordings: apaleo DEV sandbox (properties `BER` and `VIE`)

Real responses of an apaleo DEV sandbox account, recorded on 2026-10-21 before the night audit of that day. The guests, reservations and bookings in the sandbox are synthetic; no real hotel or person is behind them. They pin the tool to what apaleo really sends (eight-decimal net and tax amounts, per-reservation accounts with `parentNumber`, `/Offset` accounts, releases as negative charges, aggregates on leaf global accounts and guest parents).

Origin: copied unchanged from release 0.1.1 (commit `e16e75e`) of the upstream project this engine started from; the CHANGELOG names it. Each file is the bare response body, unwrapped from the recording (`{ status, query, body }`); the query always matched the folder and the day.

| File | Swagger model | What it holds |
|---|---|---|
| `<BER\|VIE>/accounts-schema.json` | ChartOfAccountsModel | `GET /finance/v1/accounts/schema?depth=4&includeArchived=true`. BER: German rates 7/19 % plus the historical 16/5 % of 2020; VIE: Austrian rates 4.9/10/13/20 % plus the historical 5 % (1 July 2020 to 31 December 2021). |
| `<BER\|VIE>/export-gross-daily/2026-10-21.json` | ExportGrossTransactionListModel | 35 ledger lines each: prepayments, releases, a refund, an overpayment parked at 0 %, payments with their `/Offset` lines, an AR transfer, a no-show and a cancellation fee. |
| `<BER\|VIE>/export-gross-daily/2026-10-22.json` | ExportGrossTransactionListModel | 4 lines each, posted ahead for the next business day (not yet audited). |
| `<BER\|VIE>/aggregate-daily/<day>.json` | AggregateTransactionListModel | apaleo's own daily totals for the same days. |
| `BER/mapping-BER.live.csv` | mapping file | What `init-mapping --skr 03` writes with the German SKR03 template `skr03-hotel@2` on the BER chart (header comment renamed to `apaleo-bmd`), used by the regression tests. |

The BER mapping is in the German SKR03 mapping format of the current default target. It lives only until b03 switches the mapping format to BMD; b03 replaces it with a VIE mapping from the EKR template. Folio recordings were not copied: the tool does not read folios.

## Privacy scan

Before copying, `node test/helpers/fixture-scan.ts <recordings folder>` scanned every recording except the folios (and never opened a `.env` file there). It rejects keys or values that look like a token, secret, bearer, authorization or password, e-mail addresses, and every account name that is neither an apaleo default name nor of the form `… for Reservation|Folio <id>`. Result on 2026-10-21:

```
12 file(s) scanned, 0 problem(s)
```

No names, e-mail addresses or postal addresses had to be stripped. `test/apaleo/live-fixtures.test.ts` runs the same scan over this folder on every test run (10 files here).

## Hand-checked BER totals of 2026-10-21

With `BER/mapping-BER.live.csv` (see `test/posting/live-day.test.ts` for the arithmetic):

- 35 apaleo lines: 29 bookings, 6 skipped `SAME_ACCOUNT` lines (the `/Offset` second lines) with an unsigned gross of 331.60.
- Revenue gross 571.22 at 7 %, 47.38 at 19 %, 45.00 at 0 % (663.60 in all).
- Revenue VAT per booking 37.38 at 7 % and 7.57 at 19 %; apaleo precise 37.3695327 and 7.56487395 (37.37 and 7.56).
- Deposit VAT per booking 14.26 at 7 % and 3.19 at 19 %; apaleo precise 14.26299065 and 3.19008404.
- Payments 111.70 on 1000 (cash) and 675.90 on 1360 (cards), 787.60 in all.
- Deposits received 590.00, released 352.00, of it refunded 10.00 (to a Girocard); balance 238.00.
- Accounts receivable (10000) 114.00 Soll.
- No `W-VAT-ROUNDING`: per line the VAT per booking equals apaleo's tax rounded half away from zero.
- `aggregate-daily` matches the ledger by balance on all 18 accounts.

## VIE totals of 2026-10-21

The first real Austrian data of this project, recomputed offline from the recordings (exact decimals, half away from zero). b03 asserts them through the BMD target; until then the tests read and post VIE and expect `E-UNMAPPED` for its Austrian accounts.

| VIE 2026-10-21 | value |
|---|---|
| revenue gross | 85.20 at 10 %, 410.02 at 13 %, 47.38 at 20 %, 45.00 at 0 % (`RevenueCancellationFees_Without:0.00`) |
| revenue VAT, apaleo precise | 7.74545454 (10 %), 47.17044248 (13 %), 7.89666666 (20 %) |
| revenue VAT, per-line tax rounded | 7.74 (10 %), 47.17 (13 %), 7.89 (20 %) |
| deposit VAT, precise / rounded per line | 20.2500885 / 20.25 (13 %), 3.33 / 3.33 (20 %) |
| payments | 111.70 cash (`1600`), 576.90 on cards (`1101`–`1106`) |
| deposits | received 491.00, released 295.00, of it refunded 10.00 |
| accounts receivable | 95.00 |
| skipped `SAME_ACCOUNT` (`/Offset` lines) | 6 lines, 312.60 unsigned |

`aggregate-daily` matches the ledger by balance on all 19 accounts.
