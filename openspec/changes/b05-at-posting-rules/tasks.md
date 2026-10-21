## 1. Deposits

- [ ] 1.1 Template comment for the Liabilities rows `3200`/`3201` naming both NTCS setups (direct USt with Steuercode 1, or the Kanzlei's Anzahlungskonto with n.n.fällige USt); template test
- [ ] 1.2 `mapping check` tests for deposit rows: Steuercode 2 and 3 give `E-STEUERCODE-INPUT-TAX` with `ntcs`, Steuercode 1 passes

## 2. Bad debt and cancellation fees

- [ ] 2.1 Template rules for LossOfAccountsReceivable (`7800`, `7801` with the dialect's output-tax code, `7809` without) and cancellation fees (`4091` at 0 %, unmapped with comment above 0 %) in `templates/ekr-hotel.rules.csv`; template tests
- [ ] 2.2 Posting tests for the write-off with and without VAT and for both cancellation scenarios; "Forderungsverlust" text label and the summary line for written-off receivables per rate
- [ ] 2.3 Ortstaxe template comment pointing to the mapping guide table and the fixed-Steuercode check

## 3. Austrian fixture month

- [ ] 3.1 Fabricate `test/fixtures/apaleo/at-month/` (property, chart of accounts, `export-gross-daily` per day) shaped like the Swagger schemas, with a `README.md` describing each file and no real guest data
- [ ] 3.2 EKR fixture mapping for it and `test/posting/fixture-month-at.test.ts` with hand-computed totals and the arithmetic in comments
- [ ] 3.3 Run the export pipeline on the fixture month in `test/export/pipeline.test.ts` (no `E-` finding, plausibility checks pass, golden BMD file `test/golden/bmd/at-month.csv`)

## 4. Docs

- [ ] 4.1 `docs/mapping-guide.md`: Anzahlungen (Mindest-Istbesteuerung, Steuercode 1, both NTCS setups with NTCS_BUCHEN Anhang C as source), Forderungsverlust, Stornogebühr / No-Show, the Bundesland table for Ortstaxe and similar levies, VAT rates (10 % Beherbergung incl. ortsübliches Frühstück, § 10 Abs. 2 Z 3 lit. c; 13 % Schwimmbad/Therme, Thermalbehandlung, Kultur, Sport, § 10 Abs. 3 Z 5, 6, 12; 20 % Massagen, Spa-Behandlungen, Parken, die meisten Getränke; 4,9 % Grundnahrungsmittel)
- [ ] 4.2 `docs/posting-rules.md`: the same cases from the booking point of view, with one example line each
- [ ] 4.3 Add to the first-import checklist in `docs/bmd-format.md`: "USt-Berichtigung bei Forderungsverlust erscheint als Minderung in KZ 029/022 (bzw. 090)", "Anzahlungen erscheinen in KZ 000/022/029", "Konten 4090/4091 und das Ortstaxe-Konto haben keinen fixen Steuercode"
- [ ] 4.4 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
