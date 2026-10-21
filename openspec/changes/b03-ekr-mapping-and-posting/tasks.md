## 1. Config

- [ ] 1.1 Replace `datevSection` with `bmdSection` in `src/core/config.ts`: `dialect` (`ntcs` | `bmd55`, default `ntcs`), `sachkontenlaenge` 4-9 default 4, `personenkontenlaenge` 5-9 default 6, `buchsymbol` required without default (1-4 of `A-Z0-9`, 1-2 with `bmd55`), optional `buchsymbolZahlung`; optional `properties[].buchsymbol` and `properties[].buchsymbolZahlung`; reject a `datev` section naming `bmd`; remove `properties[].mandantennummer` and the DATEV env overrides; rename `posting.belegfeld1` to `posting.extbelegnr`
- [ ] 1.2 `W-BUCHSYMBOL-SHARED` in `doctor` and in the export protocol when two properties have the same effective symbol; tests
- [ ] 1.3 Update `apaleo-bmd.config.example.yaml` (`buchsymbol: HO` with the comment that the symbol must exist in BMD), `examples/demo/apaleo-bmd.config.yaml` and `docs/configuration.md`; config tests for the new keys, the missing `buchsymbol` and the "Old DATEV section" scenario

## 2. Mapping

- [ ] 2.1 New row type and CSV columns in `src/mapping/types.ts`, `csv.ts`, `file.ts`, `load.ts` (rates with decimal comma or point, DATEV and Grman headers rejected); fixture `test/fixtures/mapping/excel-at-saved.csv` and the round-trip test
- [ ] 2.2 Keep `resolve.ts` (resolution order, wildcards) unchanged; update its tests to EKR numbers only
- [ ] 2.3 Rewrite `src/mapping/check.ts` for BMD with dialect-dependent code sets: `E-ACCOUNT-LENGTH` (Sachkonto / Personenkonto), `E-VAT-RATE-MISSING`, `E-STEUERCODE-MISSING`, `E-STEUERCODE-INPUT-TAX` (`ntcs`: 2, 3; `bmd55`: 0), `W-STEUERCODE-UNCHECKED`, `W-UNTAXED-REVENUE`, `W-VAT-RATE-UNUSUAL`, `E-VAT-MISMATCH`, `E-KOST-FORMAT`, `W-KOST-IGNORED`; one test per scenario
- [ ] 2.4 `templates/ekr-hotel.rules.csv` and `src/mapping/template.ts` (rules from the design, output-tax code from `bmd.dialect`, scaling to Sachkontenlänge, `Vorschlag (ungeprüft)`); template tests for both dialects
- [ ] 2.5 `init-mapping --template ekr` (flag replaces `--skr`, `--update` unchanged); the SKR and Grman paths become unreachable (deleted in b04); CLI tests

## 3. Posting

- [ ] 3.1 `BmdBooking` output in `src/posting/types.ts` and `build.ts`: VAT side in `konto`, net and tax signed from `konto`, sides for lines without VAT side, VAT side at rate 0, `E-TWO-VAT-SIDES`
- [ ] 3.2 Rewrite `src/posting/taxes.ts` guard: rate, net + tax = gross, BMD check value within one cent (`W-VAT-ROUNDING`), `E-VAT-MISSING`, `E-VAT-UNEXPECTED`, `E-VAT-MIXED`, `E-VAT-SIGN`; `E-DATEV-RATE-UNKNOWN` no longer raised
- [ ] 3.3 `src/posting/release.ts`: keep the rate inference, add the tax amount from PostPrepaymentVat or computed from the chart rate; tests for every deposit scenario
- [ ] 3.4 Fields: `extbelegnr`, German text without guest names, `kost` only from a Revenues or LossOfAccountsReceivable `konto` row, Buchungssymbol (`buchsymbolZahlung` for payment lines, per-property overrides); tests including "Payment line never carries kost"
- [ ] 3.5 Summary (movement model, revenue per rate with net/tax/gross); rewrite `test/posting/fixture-month.test.ts` with hand-computed EKR totals

## 4. Pipeline, checks and demo

- [ ] 4.1 Switch `src/export/pipeline.ts` to `bmdTarget` with `bmd.*` options (dialect, lengths, symbols); protocol and dry-run summary say BMD account instead of DATEV account; `src/export`, `src/cli` and `src/posting` no longer import `src/datev`
- [ ] 4.2 Movement model in `src/export/checks.ts` (konto += amount, gkonto −= amount + tax) and the tax-per-rate check against apaleo's VAT lines; tests for `E-VAT-TOTAL`, `E-ACCOUNT-BALANCE`, `E-CONSERVATION`
- [ ] 4.3 Convert the recorded demo responses in `examples/demo/apaleo/` and the posting fixtures to an Austrian property (time zone Europe/Vienna, rates 10 % and 20 %, Ortstaxe, a deposit at 10 %), keeping them shaped exactly like the Swagger schemas; regenerate `examples/demo/mapping-BSP.csv` from the EKR template; `export --demo --dry-run` prints a BMD summary
- [ ] 4.4 Replace the files in `docs/examples/` with the BMD golden file, its protocol and the EKR sample mapping, so `test/examples.test.ts` stays green (final wording in b06)

## 5. Docs

- [ ] 5.1 Update every `init-mapping` command line in `README.md`, `README.en.md` and `docs/` to `--template ekr`, and every `datev.*` config key in them to its `bmd.*` successor or remove it, so the docs test passes (prose stays until b08)
- [ ] 5.2 Add a first German `docs/bmd-import.md`: create a dedicated Buchungssymbol (copy of AR with every Kontenart allowed, optionally one with Buchungstyp Zahlung for `buchsymbolZahlung`), one symbol or Mandant per property, Buchungen importieren, Periode, and the first-import checklist from `docs/bmd-format.md`
- [ ] 5.3 Update `docs/mapping-guide.md`, `docs/posting-rules.md` and `docs/troubleshooting.md` for the new columns, Steuercodes and codes (added: the codes above; no longer raised: the SKR and Automatikkonto codes, which stay documented until b04 deletes them)

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; `grep -rn "datev" src/export src/cli src/posting src/mapping` finds no import
- [ ] 6.2 `node dist/cli/main.js export --month 2026-09 --demo` writes `demo-output/BSP/2026-09/BMD_Buchungsimport_20260901-20260930_BSP_DEMO.csv`
