## 1. Module skeleton

- [ ] 1.1 Move `src/datev/cp1252.ts` to `src/core/cp1252.ts` and update its imports and tests
- [ ] 1.2 Add `src/bmd/types.ts` (`BmdBooking`, `BmdRenderOptions` with period, property id, Sachkonten and Personenkonten length) and `src/bmd/README.md`
- [ ] 1.3 Add `src/bmd` to the restricted-import boundary in `eslint.config.js` and a case to `test/lint/boundaries.test.ts`

## 2. Format and validation

- [ ] 2.1 `src/bmd/format.ts`: header constant, amount formatting (decimal comma, leading minus, no thousands separator), rate formatting, date `TT.MM.JJJJ`, Belegnummer `MM` + 7 digits; unit tests per function
- [ ] 2.2 `src/bmd/sanitise.ts`: text and extbelegnr rules, CP1252 replacement, truncation with `N-BMD-CHARSET` and `N-BMD-TRUNCATED`; tests
- [ ] 2.3 `src/bmd/validate.ts`: every `E-BMD-*` code from the spec, all findings at once with booking number and field; tests per code
- [ ] 2.4 `src/bmd/writer.ts`: `renderBuchungsimport` (header, lines, CRLF, CP1252, `BmdValidationError`) and tests for buchcode from sign and empty tax fields without Steuercode

## 3. Target and golden files

- [ ] 3.1 `src/bmd/target.ts`: `bmdTarget` with file name, pattern `^BMD_Buchungsimport_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$`, byte-equality `sameContent`, protocol title
- [ ] 3.2 Golden files in `test/golden/bmd/` for the cases listed in the spec, compared byte by byte (`UPDATE_GOLDEN=1` to refresh)
- [ ] 3.3 Run the `target.test.ts` contract from b01 against `bmdTarget`

## 4. Docs

- [ ] 4.1 Write `docs/bmd-format.md` (German, "du") from `openspec/research/bmd-target.md`: fields, sign rule, Steuercodes, encoding, Belegnummer, the checklist for the first test import, and the source list with the date checked
- [ ] 4.2 Add every new finding code to `docs/troubleshooting.md` (German), link `docs/bmd-format.md` from `docs/architecture.md`
- [ ] 4.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
