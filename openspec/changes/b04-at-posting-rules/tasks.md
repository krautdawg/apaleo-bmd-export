## 1. Deposits

- [ ] 1.1 Add `bmd.anzahlungSteuercode` (0-99, default 1) to `src/core/config.ts`, the example configs and `docs/configuration.md`
- [ ] 1.2 Add `W-DEPOSIT-STEUERCODE` to `src/mapping/check.ts` with tests for both scenarios; document it in `docs/troubleshooting.md`

## 2. Bad debt and cancellation fees

- [ ] 2.1 Template rules for LossOfAccountsReceivable (`7800`, `7801`, `7809`) and cancellation fees (`4091` at 0 %, unmapped with comment above 0 %) in `templates/ekr-hotel.rules.csv`; template tests
- [ ] 2.2 Posting tests for the write-off with and without VAT and for both cancellation scenarios; "Forderungsverlust" text label and the summary line for written-off receivables per rate
- [ ] 2.3 Ortstaxe template comment pointing to the mapping guide table

## 3. Austrian fixture month

- [ ] 3.1 Fabricate `test/fixtures/apaleo/at-month/` (property, chart of accounts, `export-gross-daily` per day) shaped like the Swagger schemas, with a `README.md` describing each file and no real guest data
- [ ] 3.2 EKR fixture mapping for it and `test/posting/fixture-month-at.test.ts` with hand-computed totals and the arithmetic in comments
- [ ] 3.3 Run the export pipeline on the fixture month in `test/export/pipeline.test.ts` (no `E-` finding, plausibility checks pass, golden BMD file `test/golden/bmd/at-month.csv`)

## 4. Docs

- [ ] 4.1 `docs/mapping-guide.md`: Anzahlungen (Mindest-Istbesteuerung, Steuercode choice), Forderungsverlust, Stornogebühr / No-Show, the Bundesland table for Ortstaxe and similar levies, VAT rates by service date
- [ ] 4.2 `docs/posting-rules.md`: the same cases from the booking point of view, with one example line each
- [ ] 4.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
