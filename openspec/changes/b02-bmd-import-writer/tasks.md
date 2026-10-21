## 1. Module skeleton

- [ ] 1.1 Move `src/datev/cp1252.ts` to `src/core/cp1252.ts` and update its imports and tests
- [ ] 1.2 Add `src/bmd/types.ts` (`BmdBooking`, `BmdRenderOptions` with dialect `ntcs` | `bmd55`, period, property id, Sachkonten and Personenkonten length) and `src/bmd/README.md`
- [ ] 1.3 Add `src/bmd` to the restricted-import boundary in `eslint.config.js` and a case to `test/lint/boundaries.test.ts`

## 2. Format and validation

- [ ] 2.1 `src/bmd/format.ts`: one dialect table (header, date format `TT.MM.JJJJ` / `JJJJMMTT`, output-tax codes, symbol length), amount formatting (decimal comma, leading minus, no thousands separator), rate formatting, Belegnummer `MMDD` + 5 digits; unit tests per function and dialect
- [ ] 2.2 `src/bmd/sanitise.ts`: text and extbelegnr rules, CP1252 replacement, truncation with `N-BMD-CHARSET` and `N-BMD-TRUNCATED`; tests
- [ ] 2.3 `src/bmd/validate.ts`: every `E-BMD-*` code from the spec (including `E-BMD-KOST` and the dialect-dependent `E-BMD-STEUER-SIGN` and `E-BMD-SYMBOL`), all findings at once with booking number and field; tests per code
- [ ] 2.4 `src/bmd/writer.ts`: `renderBuchungsimport` (header, lines, CRLF, CP1252, `BmdValidationError`) and tests for buchcode from sign and empty tax fields without Steuercode

## 3. Target and golden files

- [ ] 3.1 `src/bmd/target.ts`: `bmdTarget` with file name, pattern `^BMD_Buchungsimport_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$`, byte-equality `sameContent`, protocol title, and BMD `advice` for `E-PERIOD-OVERLAP` / `E-FILE-EXISTS` (import into BMD NTCS, `bmd.*` header keys, how the Kanzlei reverses an imported Buchungsimport)
- [ ] 3.2 Golden files in `test/golden/bmd/` for the cases listed in the spec, one set per dialect, compared byte by byte (`UPDATE_GOLDEN=1` to refresh)
- [ ] 3.3 Belegnummer tests: two daily files and two partial files of one month share no number
- [ ] 3.4 Run the `target.test.ts` contract from b01 against `bmdTarget`

## 4. Docs

- [ ] 4.1 Write `docs/bmd-format.md` (German, "du") from `openspec/research/bmd-target.md`: dialects, fields, sign rule, Steuercodes per dialect (NTCS 1 USt, 2 VSt, 3 VSt-Berichtigung; sources NTCS_BUCHEN p.107-108 and dvo §9), encoding, Belegnummer, `kost`, the source list with the date checked, and `## Checkliste für den ersten Testimport` (at least: Steuercode 1 lands in KZ 022/029 of the UVA-Vorschau, no Belegnummern-Duplikate under the symbol, the accounts for 0 % revenue and Ortstaxe have no fixed Steuercode, `4,9` accepted in `prozent`, Umlaute readable, dialect right)
- [ ] 4.2 Add every new finding code to `docs/troubleshooting.md` (German), link `docs/bmd-format.md` from `docs/architecture.md`
- [ ] 4.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
