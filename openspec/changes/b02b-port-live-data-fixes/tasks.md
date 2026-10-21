## 1. Live fixtures first

- [ ] 1.1 Copy `test/helpers/fixture-scan.ts` from apaleo-datev-export `e16e75e` and the BER and VIE files `accounts-schema.json`, `export-gross-daily/2026-10-21.json`, `export-gross-daily/2026-10-22.json`, `aggregate-daily/2026-10-21.json`, `aggregate-daily/2026-10-22.json` unchanged into `test/fixtures/apaleo/live/<BER|VIE>/`; do not copy `mapping-BER.v1.csv`
- [ ] 1.2 Copy `BER/mapping-BER.live.csv` with its header comment renamed to `apaleo-bmd`; check that this repo's mapping loader reads it without findings other than those upstream had
- [ ] 1.3 Write `test/fixtures/apaleo/live/README.md` (origin by release 0.1.1 and commit `e16e75e` of the upstream project, named only in the CHANGELOG so that b04's `grep -rni datev src test templates` stays clean once b03 removed the BER mapping; synthetic sandbox data, files, scan result, hand-checked BER totals, the VIE totals from design.md, and that the BER mapping is DATEV-format until b03); point `test/fixtures/apaleo/README.md` to `live/`
- [ ] 1.4 Port the live-folder support of `test/helpers/apaleo.ts` and `test/apaleo/live-fixtures.test.ts` (scan on every run, Swagger validation of the live files)
- [ ] 1.5 Add the failing test: reading the BER ledger of 2026-10-21 through the adapter succeeds (today it throws the sub-cent error on entry `000000032`)

## 2. Precise amounts

- [ ] 2.1 Port the exact decimal helpers of `src/core/money.ts` with their tests (including `37.3695327` from the eight 7 % BER lines)
- [ ] 2.2 Add `netPrecise` and `amountPrecise` to `src/core/source.ts`; update `test/helpers/ledger.ts`, `test/helpers/posting.ts`, the fake source and the demo source that build lines, and `docs/architecture.md`
- [ ] 2.3 Port `src/sources/apaleo/parse.ts` (gross whole cents, net and tax precise, half-cent consistency check naming day and entry) and `test/apaleo/adapter.test.ts` cases, plus a VIE case for `000000029` at 13 %
- [ ] 2.4 VAT guard compares with `amountCents`; scenario "Precise tax from apaleo" in `test/posting/taxes.test.ts`; make 1.5 pass; `pnpm test`, `pnpm lint`, `pnpm typecheck` green

## 3. Resolver and unmapped findings

- [ ] 3.1 Port `src/mapping/resolve.ts` (pass over empty parent rows, return the first one only when nothing else applies, exact empty rows stay unmapped) with the upstream tests and a VIE case for the 13 % and 20 % Liabilities wildcards
- [ ] 3.2 Port `shippedTemplate` and `templateWildcardAccount` into `src/mapping/template.ts` without `isHistoricalRow`, `foreignRates` or any template-v2 rule change; the SKR template files stay as they are
- [ ] 3.3 Merge the upstream `E-UNMAPPED` grouping into `src/mapping/check.ts` (per parent, type and rate, count, three examples, fix naming the empty parent row and the `*` row with the template account, an existing empty wildcard row named by line); tests for the Liabilities and the AccountsReceivable scenarios
- [ ] 3.4 `mapping check --from 2026-10-21 --to 2026-10-21` on BER with the live mapping exits 0 (port the mapping part of `test/cli/live-data.test.ts`)

## 4. Posting summary

- [ ] 4.1 Port `src/core/deposits.ts` (`depositMovement`) and the summary's `{ receivedCents, releasedCents, refundedCents }`; tests for the negative-charge release, the refund and the 0 % overpayment (BER and the VIE line `000000027`)
- [ ] 4.2 Accounts-receivable movement in the summary; unsigned skipped totals; tests 114.00 and 6 lines / 331.60 on the BER day
- [ ] 4.3 Port `src/posting/apaleo-vat.ts` and `VatTotal` (`vatCents` as the target books it, `apaleoVat` precise) for revenue and deposits; tests with the BER values (37.38/37.37, 7.57/7.56, 14.26/14.26, 3.19/3.19)
- [ ] 4.4 Port `test/posting/live-day.test.ts` without the Buchungstext assertions (those stay DATEV and are not ported); update `test/posting/fixture-month.test.ts` for the new deposit and skipped values, with the arithmetic in comments

## 5. Export checks and output

- [ ] 5.1 Port `compareAggregates` in `src/core/aggregates.ts` (balance, leaf global vs main account, net for Revenues/Liabilities, VAT accounts from precise taxes) with tests on BER and VIE for 2026-10-21 and 2026-10-22, all accounts matching
- [ ] 5.2 Rewrite `test/fixtures/apaleo/aggregate-daily/` and `examples/demo/apaleo/aggregate-daily/` in the real shape (take upstream's files where they fit this repo's BSP chart and ledger, else derive them from this repo's fixtures); update `test/core/aggregates.test.ts`
- [ ] 5.3 `W-AGGREGATE-DIFF` with both balances and the basis; `E-VAT-TOTAL` with apaleo's precise total and the line-rounding difference, still cent-exact; tests "Line rounding is not an error" and "Roundings at another rate"
- [ ] 5.4 `src/export/summary.ts`: VAT comparison tables with the explaining sentence, deposits received/released/refunded, accounts receivable, skipped `gross (unsigned)`; dry-run and protocol tests
- [ ] 5.5 Full-pipeline test on BER 2026-10-21 with `DEFAULT_TARGET` and `checks.aggregates: true`: one file, no `E-` and no `W-AGGREGATE-DIFF`, 35 lines / 29 bookings / 6 skipped, the hand-checked totals, target validation passes
- [ ] 5.6 VIE test: `init-mapping --property VIE` with the current template, then `export`: no parse, sub-cent or Swagger-shape error, `E-UNMAPPED` for the 13/10/20 % revenue accounts and grouped for the Liabilities under `3000` at 13 % and 20 %, no file
- [ ] 5.7 Run the BER export once more with the fake `TargetWriter` of `test/export/target.test.ts`: same summary values and no `W-AGGREGATE-DIFF`, so the checks do not depend on the DATEV target
- [ ] 5.8 Every EXTF and BMD golden file unchanged without `UPDATE_GOLDEN`; regenerate the golden protocol and the `docs/examples/` protocol and review the diff (summary sections only)

## 6. live-smoke

- [ ] 6.1 Port the empty-day warning (`WARN  ledger`, "nothing about the postings was checked", exit 0) with a 204-day test
- [ ] 6.2 Port `src/sources/apaleo/live-questions.ts` and the live-smoke output: deposit lines received/released/refunded with and without `taxes[]`, aggregate table by balance with "N of M accounts match"; tests on BER (6 received, 5 released of which 1 refunded, 18 of 18) and VIE (19 of 19)

## 7. Docs, changelog and plan of the later slices

- [ ] 7.1 `docs/apaleo-source.md`: precise amounts (no more "a net or tax amount off a whole cent stops the export"), the answers of the live test, the aggregate rule, `/Offset` accounts; `docs/setup-apaleo.md` to the real apaleo screens with **Omit all** recommended; `docs/troubleshooting.md`: an old sub-cent error on net or tax means an old version, a real `grossAmount` error still stops; all German with "du"
- [ ] 7.2 `CHANGELOG.md` under `## [Unveröffentlicht]`, German: `### Behoben` precise amounts, empty parent rows and grouped `E-UNMAPPED`, aggregate check by balance, deposits by side and sign, VAT comparison in protocol and dry run, unsigned skipped totals, live-smoke on an empty day; origin "aus apaleo-datev-export 0.1.1 übernommen"
- [ ] 7.3 Check that the planning updates of b03, b05 and b06 in this change still match what was implemented (design.md, "Building on this"); adjust them if an implementation detail moved
- [ ] 7.4 `pnpm typecheck`, `pnpm lint`, `pnpm test` (docs consistency included), `pnpm build` green; `openspec validate b02b-port-live-data-fixes --strict`
