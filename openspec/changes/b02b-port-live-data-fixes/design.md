## Context

This repository is a copy of apaleo-datev-export v0.1.0 (commit `de206a6`). b01 renamed it and put the `TargetWriter` boundary in front of the output folder; b02 added the BMD writer (`bmdTarget`), which the pipeline does not use yet: `DEFAULT_TARGET` is still `datevTarget`, and posting still produces DATEV-shaped `PostedBooking`s until b03.

On 2026-10-21 a test agent ran the upstream v0.1.0 against an apaleo DEV sandbox (properties BER with German rates and VIE with Austrian rates, 35 ledger lines each on business day 2026-10-21) and found 13 defects. Upstream fixed them in v0.1.1, commit `e16e75e`, archived change `2026-10-21-s10-live-data-fixes` (in apaleo-datev-export, local only). Its design records the facts behind each fix; the ones that matter here:

- Every `netAmount` and `taxes[].amount` has up to 8 decimals; every `grossAmount` is whole cents; `gross = net + Σ taxes` holds exactly on every recorded line. v0.1.0 rejects the first such line with "not a whole number of cents".
- The real export has no `PostPrepaymentVat` and no `Vat`/`VatOnLiabilities` lines. Deposits: `PostPrepayment` debit Payments, credit `<res>_Liabilities/<VatType>:<rate>` (parent `3000`) with `taxes[]`; release: `PostCharge` debit `<res>_Receivables`, credit the same Liabilities account with negative gross and negative taxes; refund: `PostPrepayment` with negative gross; overpayment parked at 0 %: `PostCharge` to `Liabilities/Null:0.00`, positive.
- Every payment and AR transfer comes in pairs: the booked line and a second line `<x>_Receivables → <x>_Receivables/Offset` (or `<res>_AccountsReceivable → …/Offset`, parent `9999`) with the negative amount.
- `3000`, `1200`, `9999` and `6900` are containers (`hasChildren`) in the guest, external and booking ledgers; `9999` and `6900` each have one chart child (`CollectiveDebitor_…`).
- `aggregate-daily` lists leaf global accounts and only the parent of guest-ledger accounts; only the balance (debit − credit) is comparable, with net for revenue and Liabilities, gross otherwise, and the VAT accounts against the precise taxes.

The engine files the fixes touch are byte-identical here to the upstream base, apart from the renamed CLI name in messages: `src/sources/apaleo/parse.ts`, `src/sources/apaleo/live-questions.ts`, `src/core/{source,money,aggregates}.ts`, `src/mapping/{resolve,template,index}.ts`, `src/posting/{fields,summary,types,index}.ts`, `src/export/{checks,summary}.ts`. `src/mapping/check.ts`, `src/cli/commands/live-smoke.ts`, `src/export/pipeline.ts` and `src/export/output.ts` differ only by the rename and the b01 `TargetWriter` call.

The VIE day is the first real Austrian data this project has. Recomputed offline from the recordings while writing this design (exact decimals, half away from zero):

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

## Goals / Non-Goals

**Goals:**
- Read, map, post and check the recorded BER and VIE days without parse errors and with the upstream hand-checked BER totals, guarded by regression tests on the recordings.
- Port only what is computed from apaleo ledger lines and the chart, so b03 builds the BMD posting on a correct engine.
- Leave the DATEV path consistent and green: every EXTF and BMD golden file stays byte-identical.
- Tell b03, b05 and b06 exactly what they must keep, so they do not bring the defects back.

**Non-Goals:**
- SKR template version 2, `init-mapping --update` notes (`N-PARENT-ROW-EMPTY`, `N-TEMPLATE-SUGGESTION`), `N-FOREIGN-VAT-RATES`, German DATEV Buchungstexte, the manifest `sollTotal`/`habenTotal` change. They are about the DATEV output or the German templates, which b03 replaces and b04 deletes.
- Re-recording live data; the recordings are copied from upstream.

## Decisions

1. **Port from the upstream diff, file by file.** For the byte-identical files the upstream versions of `e16e75e` are taken and only the CLI name in messages is adjusted (`apaleo-bmd`). For `check.ts`, `live-smoke.ts`, `pipeline.ts` the upstream hunks are merged by hand into the b01 code. New upstream files that are target-independent come along: `src/core/deposits.ts`, `src/posting/apaleo-vat.ts`, `test/helpers/fixture-scan.ts` and the live tests. *Alternative:* re-implement from the s10 design. Rejected: the upstream code is tested on the same recordings, and a second implementation would diverge.

2. **Split between engine and target.** Ported: parser and money helpers, resolver, the grouping of `E-UNMAPPED`, aggregate comparison, deposit classification, apaleo's precise VAT per rate, the unsigned skipped totals, the accounts-receivable movement, live-smoke. Kept as in v0.1.0: the DATEV VAT per booking (`vatCents`, what DATEV computes on the Automatikkonto), Buchungstext, BU-Schlüssel and Automatikkonten, the SKR templates, the manifest totals. In the summary, `VatTotal` gets `apaleoVat` (precise decimal text) beside `vatCents`; `vatCents` means "VAT as the target books it", which is DATEV's per-booking VAT until b03 and BMD's `steuer` afterwards. The protocol column stays labelled `DATEV VAT` while the default target is DATEV.

3. **Precise amounts (upstream decision 1).** `LedgerLine.netPrecise` and `LedgerTax.amountPrecise` hold the source's decimal text; `netCents` and `amountCents` become the precise value rounded half away from zero; `grossCents` keeps the sub-cent guard; the parser checks `|gross − net − Σ taxes| ≤ 0.005` and names day and entry otherwise. Sums of precise values use exact scaled-integer helpers in `src/core/money.ts`, never floats. The DATEV VAT guard compares with `amountCents`, so sub-cent digits never cause a finding.

4. **Resolver past empty parent rows, findings grouped (upstream decisions 4 and 6).** A parent row with an empty target account no longer ends the search; exact empty rows still mean unmapped. `E-UNMAPPED` for per-reservation accounts is reported once per parent, type and rate and proposes the `*` row. The example account in that proposal comes from the shipped template's wildcard rule for that type and rate (upstream `templateWildcardAccount(shippedTemplate(…), type, rate, length)`, ported without the SKR-only helpers `isHistoricalRow` and `foreignRates`), not from a hard-coded SKR number, so b03's EKR template supplies its own (`*;Liabilities` at 13 % → `3202`, `*;AccountsReceivable` → `200000`). When an existing empty wildcard row applies, the finding names that row by its line instead of asking to add it. v0.1.0 mapping files with the empty `3000;Liabilities` row work without editing.

5. **Aggregates by balance (upstream decision 8).** `compareAggregates` works on ledger lines and the chart only; it never sees bookings, so it is the same for every target. The BSP aggregate fixtures and `examples/demo/apaleo/aggregate-daily/` are rewritten in the real shape (leaf global accounts, guest parents, balances) as upstream did.

6. **Deposits by side and sign (upstream decision 9).** `depositMovement(line, side)` in `src/core/deposits.ts`: a Liabilities side is an increase when credited positive or debited negative, else a decrease, and a decrease against Payments is a refund. The summary's `deposits` becomes `{ receivedCents, releasedCents, refundedCents }`, unsigned. The release-rate inference is unchanged.

7. **VAT per rate beside the per-booking VAT (upstream decision 3).** `src/posting/apaleo-vat.ts` sums apaleo's precise taxes per rate for revenue and deposit lines. `E-VAT-TOTAL` stays cent-exact against the per-line tax rounded to cents and its message adds the precise total and the line-rounding difference; the precise difference is never an error.

8. **Live fixtures and regression through the `TargetWriter`.** `test/fixtures/apaleo/live/` gets upstream's BER and VIE `accounts-schema.json`, `export-gross-daily/2026-10-2{1,2}.json`, `aggregate-daily/2026-10-2{1,2}.json` unchanged, and `BER/mapping-BER.live.csv` (upstream `init-mapping --skr 03` with template v2) with its header comment renamed to `apaleo-bmd`. It is a DATEV-format mapping and lives only until b03 switches the mapping format. `mapping-BER.v1.csv` is not copied (it only serves the SKR migration test). The README names the origin by release and commit; the scan runs over the folder on every test run. The full-pipeline test runs `export` with `DEFAULT_TARGET` and asserts the BER totals; a second test runs VIE with a mapping from the current template and asserts clean reading and the grouped `E-UNMAPPED`. A pipeline test with the fake `TargetWriter` from b01 shows that the checks and the summary are the same with another target.

9. **Golden files.** No booking changes, so every EXTF and BMD golden file stays byte-identical, and the test run proves it without `UPDATE_GOLDEN`. The golden protocol, `docs/examples/` protocol and dry-run snapshots change only in the summary sections (VAT comparison, deposits, accounts receivable, unsigned skipped totals); they are regenerated and the diff reviewed by hand.

10. **Docs, German.** `docs/apaleo-source.md` (precise amounts, answers of the live test, aggregate rule), `docs/setup-apaleo.md` (the real apaleo screens: Apps > Connected apps, Add a new app, Add custom app, New simple client, Secret description, Search permission, PII option **Omit all**), `docs/troubleshooting.md` (an old sub-cent error means an old version), CHANGELOG under `## [Unveröffentlicht]`.

## Building on this in b03, b05 and b06

These rules go into the tasks (and, where a later delta modifies the same requirement, into its spec delta) of the open changes:

**b03 (EKR mapping and posting)**
- BMD `steuer` per line is apaleo's precise tax rounded half away from zero (`amountCents`); `betrag` is `gross − steuer`, signed from `konto`'s point of view; net is never rounded on its own. So `gkonto` gets exactly apaleo's gross, and the movement model (`gkonto −= betrag + steuer`) balances to the cent.
- "Net plus tax equals gross" is the parser's half-cent check on the precise values. Checking it again on separately rounded cents would raise false `E-VAT-AMOUNT` when both round up.
- BMD's check value `round(|betrag| × rate / 100)` can differ by one cent from `steuer` on real data: VIE `000000031` (gross 46.80 at 10 %, `steuer` 4.25, check 4.26) and BER `000000020` (60.00 at 7 %, 3.93 against 3.92). That is `W-VAT-ROUNDING` and the booking keeps apaleo's tax.
- `E-VAT-TOTAL` compares Σ `steuer` per rate with Σ `amountCents` of the booked lines, because real exports carry no Vat, VatOnLiabilities or `PostPrepaymentVat` lines to compare with. The message names apaleo's precise total and the line-rounding difference (VIE: 7.74 against 7.75 at 10 %, 47.17 against 47.17 at 13 %, 7.89 against 7.90 at 20 %).
- EKR template: `*;Liabilities` wildcard rows for 10 % (`3200`), 13 % (`3202`, new) and 20 % (`3201`) with the dialect's output-tax code and for 0 % (`3209`) without; no row for the container `3000`, which the resolver passes over anyway. apaleo creates the historical Austrian 5 % accounts (`…_Special:5.00`, 1 July 2020 to 31 December 2021) in every group: rows empty with a comment, so a booking on them stops the export. 4.9 % deposit rows only if the Kanzlei asks.
- AccountsReceivable: `*;AccountsReceivable;;;200000` besides the `CollectiveDebitor_AccountsReceivable` row and no row for `9999`; per-reservation AR accounts and their `/Offset` resolve to `200000`, and the `/Offset` lines are skipped as `SAME_ACCOUNT`.
- The container rule of upstream template v2 (`suggestRows` writes no row for a container outside the global ledger whose type has wildcards and no rule yielding an account) is ported with the EKR template, because b03 rewrites the template rules.
- Real deposit shapes: a release (credit Liabilities, negative gross and taxes) gives `konto` = deposit account, positive `betrag` and positive `steuer`; a refund is a negative `PostPrepayment` on the 0 % row; the summary uses `depositMovement`.
- `text` takes over upstream v0.1.1's German labels with Austrian rates (`Erlös Logis 13 %`, `Auflösung Anzahlung 13 %`, `Erstattung Anzahlung`, `Zahlung Visa`, `Forderung an Debitor`) and a test that no `text` of the VIE day contains `Revenues`, `Payment`, `Liabilities`, `Receivables` or `Credit Card`.
- The regression moves to VIE: `test/fixtures/apaleo/live/VIE/mapping-VIE.live.csv` from `init-mapping --template ekr`, a full export with `bmdTarget` asserting the VIE totals above, exactly one `W-VAT-ROUNDING` (`000000031`) and no `W-AGGREGATE-DIFF`; BER with the EKR template stops with `E-UNMAPPED` for its 7 % and 19 % accounts; `mapping-BER.live.csv` and the DATEV assertions are deleted.
- The Austrian demo and posting fixtures use the real shapes (eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` pairs, releases as negative charges, no `PostPrepaymentVat`), and the demo aggregates keep the real shape.

**b05 (AT posting rules)**
- Bad debt: per-reservation accounts sit under the container `CollectiveDebitor_LossOfAccountsReceivable`, so the rows are rate wildcards (`*;LossOfAccountsReceivable` at 10 % `7800`, 13 % `7802`, 20 % `7801`, 0 % `7809`), never exact rows, and no row for `6900` or the container `CollectiveDebitor_LossOfAccountsReceivable`.
- Cancellation and no-show: apaleo's group accounts are `RevenueCancellationFees` and `RevenueNoShow` with English names (`Revenues Cancellation fees`, `Revenues No-show`); the rule matches those as well as German names. VIE books the no-show at 13 % (`RevenueNoShow_Reduced:13.00`, left empty with the comment) and the cancellation fee on `RevenueCancellationFees_Without:0.00` (to `4091`).
- The Austrian fixture month uses the real shapes, and the VIE live day runs beside it; its mapping is regenerated with the new rules (cancellation fee to `4091`, the 13 % no-show filled by the test as a Kanzlei would).

**b06 (output and demo)**
- The dry run and protocol keep apaleo's precise VAT and the difference per rate beside `steuer`, and deposits received, released and refunded.
- Manifest Soll and Haben totals are what the Kanzlei sees in BMD after the import, not sums by sign of `betrag` (upstream defect 8, where per-flag sums did not match what DATEV showed).

## Risks / Trade-offs

- [The aggregate rule is inferred from one sandbox and two days] → it held on every account of BER and VIE on both days, including refunds, releases and AR; differences stay warnings.
- [`String(number)` loses digits beyond ~15 significant digits] → apaleo sends 8 decimals on hotel-sized amounts; the gross = net + taxes check fails loudly if a value were mangled.
- [The DATEV-format live mapping becomes dead weight in b03] → b03's tasks replace it with the EKR mapping of VIE; until then it keeps the DATEV path tested on real data.
- [Porting by diff could carry DATEV wording into shared code] → the review checks that ported files outside `src/datev`, `templates/` and the DATEV posting fields name no SKR account in code (test fixtures and the DATEV path excepted).

## Migration Plan

No users. Mapping files with the empty `3000;Liabilities` row keep working. Rollback: revert the slice; the engine then cannot read real data again.

## Open Questions

- Whether apaleo production sends the same shapes as the DEV sandbox; live-smoke keeps asking, and the fixtures can grow.
- Whether the VIE sandbox's 13 % on accommodation is a sandbox setting; the engine books whatever rate apaleo charged, and b05's mapping guide explains 10 % for Beherbergung.
