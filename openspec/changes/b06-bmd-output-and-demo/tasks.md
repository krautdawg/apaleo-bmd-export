## 1. Output and manifest

- [ ] 1.1 Remove `bodyOf`, `withoutCreationTime` and `bodySha256` from `src/export/output.ts`; manifest entries gain `taxByRate`; Soll and Haben totals are what BMD shows after the import, not sums by the sign of `betrag` (b02b design, upstream defect 8); reading ignores unknown fields; tests for every idempotency scenario with BMD files
- [ ] 1.2 `E-FILE-EXISTS` message names the deletion of the imported bookings in BMD; `E-CURRENCY` message names the missing currency field; update `docs/troubleshooting.md`

## 2. Protocol and dry run

- [ ] 2.1 `src/export/summary.ts`: tables per BMD account, net/tax/gross per rate with b02b's apaleo precise VAT and the difference, Ortstaxe, payments, deposits received/released/refunded, accounts receivable, write-offs, skipped lines with unsigned totals, findings; dry-run test on the recorded VIE day
- [ ] 2.2 Import block (file name, line count, dialect, Buchungssymbole, Belegnummern range, `verbuchkz`/`gegenbuchkz`, Steuercodes with rates, account lengths) in protocol and dry run; snapshot tests

## 3. Demo and examples

- [ ] 3.1 Extend the Austrian demo data (Hotel Beispiel, Wien) so every protocol section has content; `DEMO ` text prefix, `_DEMO` file suffix, `DEMO` protocol line; `test/cli/demo.test.ts`
- [ ] 3.2 Regenerate `docs/examples/` (BMD file, protocol, `mapping-BSP.example.csv`) and the example test that compares them with the current output; German `docs/examples/README.md` explaining each column for the Kanzlei
- [ ] 3.3 Update `docs/export.md` (output folder, manifest, re-runs, overlap) in German

## 4. Release check

- [ ] 4.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; README quick-start CI job prints the BMD demo summary
