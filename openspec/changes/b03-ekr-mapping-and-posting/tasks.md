## 1. Config

- [ ] 1.1 Replace `datevSection` with `bmdSection` (`sachkontenlaenge` 4-9 default 4, `personenkontenlaenge` 5-9 default 6, `buchsymbol` 1-4 of `A-Z0-9` default `AR`) in `src/core/config.ts`; reject a `datev` section naming `bmd`; remove `properties[].mandantennummer` and the DATEV env overrides; rename `posting.belegfeld1` to `posting.extbelegnr`
- [ ] 1.2 Update `apaleo-bmd.config.example.yaml`, `examples/demo/apaleo-bmd.config.yaml` and `docs/configuration.md`; config tests for the new keys and the "Old DATEV section" scenario

## 2. Mapping

- [ ] 2.1 New row type and CSV columns in `src/mapping/types.ts`, `csv.ts`, `file.ts`, `load.ts` (rates with decimal comma or point, DATEV header rejected); fixture `test/fixtures/mapping/excel-at-saved.csv` and the round-trip test
- [ ] 2.2 Remove the Grman reader, `automatic-accounts.ts` (Automatikkonten) and BU-key logic; keep the resolution order and wildcard rules with tests updated to EKR numbers
- [ ] 2.3 Rewrite `src/mapping/check.ts` for BMD: `E-ACCOUNT-LENGTH` (Sachkonto / Personenkonto), `E-VAT-RATE-MISSING`, `E-STEUERCODE-MISSING`, `E-STEUERCODE-INPUT-TAX`, `W-STEUERCODE-UNCHECKED`, `W-VAT-RATE-UNUSUAL`, `E-VAT-MISMATCH`; one test per scenario
- [ ] 2.4 `templates/ekr-hotel.rules.csv` and `src/mapping/template.ts` (rules from the design, scaling to Sachkontenlänge, `Vorschlag (ungeprüft)`); delete `templates/skr0*-hotel.rules.csv`; template tests
- [ ] 2.5 `init-mapping --template ekr` (flag replaces `--skr`, `--update` unchanged, Grman backup logic removed); CLI tests

## 3. Posting

- [ ] 3.1 `BmdBooking` output in `src/posting/types.ts` and `build.ts`: VAT side in `konto`, net and tax signed from `konto`, sides for lines without VAT side, `E-TWO-VAT-SIDES`
- [ ] 3.2 Rewrite `src/posting/taxes.ts` guard: rate, net + tax = gross, BMD check value within one cent (`W-VAT-ROUNDING`), `E-VAT-MISSING`, `E-VAT-UNEXPECTED`, `E-VAT-MIXED`, `E-VAT-SIGN`; remove `E-DATEV-RATE-UNKNOWN`
- [ ] 3.3 Adapt `src/posting/release.ts`: inferred rate plus tax amount from PostPrepaymentVat or computed from the chart rate; tests for every deposit scenario
- [ ] 3.4 Fields (`extbelegnr`, German text without guest names, `kost` order) and summary (movement model, revenue per rate with net/tax/gross); rewrite `test/posting/fixture-month.test.ts` with hand-computed EKR totals

## 4. Pipeline and checks

- [ ] 4.1 Switch `src/export/pipeline.ts` to `bmdTarget` with `bmd.*` options; protocol and dry-run summary say BMD account instead of DATEV account
- [ ] 4.2 Movement model in `src/export/checks.ts` (konto += amount, gkonto −= amount + tax) and the tax-per-rate check against apaleo's VAT lines; tests for `E-VAT-TOTAL`, `E-ACCOUNT-BALANCE`, `E-CONSERVATION`
- [ ] 4.3 Convert the recorded demo responses in `examples/demo/apaleo/` and the posting fixtures to an Austrian property (time zone Europe/Vienna, rates 10 % and 20 %, Ortstaxe, a deposit at 10 %), keeping them shaped exactly like the Swagger schemas; regenerate `examples/demo/mapping-BSP.csv` from the EKR template; `export --demo --dry-run` prints a BMD summary

## 5. Remove DATEV

- [ ] 5.1 Delete `src/datev/`, `test/datev/`, `test/golden/datev` (or the EXTF golden files), `test/helpers/extf.ts`; remove `src/datev` from the lint boundary
- [ ] 5.2 Delete `docs/datev-format.md` and `docs/datev-import.md`; add a first German `docs/bmd-import.md` (how the Kanzlei imports the file in BMD NTCS: Buchungen importieren, Buchungssymbol, Periode, checklist); update links, the docs test file list and `docs/troubleshooting.md` (codes added and removed)
- [ ] 5.3 Replace the files in `docs/examples/` with the BMD golden file, its protocol and the EKR sample mapping (final wording in b05)

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; `grep -rni "datev" src test templates` finds nothing
- [ ] 6.2 `node dist/cli/main.js export --month 2026-09 --demo` writes `demo-output/BSP/2026-09/BMD_Buchungsimport_20260901-20260930_BSP_DEMO.csv`
