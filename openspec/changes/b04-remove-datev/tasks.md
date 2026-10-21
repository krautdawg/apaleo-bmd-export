## 1. Code and tests

- [ ] 1.1 Delete `src/datev/`, `test/datev/`, the EXTF golden files and `test/helpers/extf.ts`
- [ ] 1.2 Delete the Grman reader, `src/mapping/automatic-accounts.ts`, the BU-Schlüssel helpers and their tests
- [ ] 1.3 Delete `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` and the SKR code paths in `src/mapping/template.ts`
- [ ] 1.4 Remove `src/datev` from the restricted-import boundary in `eslint.config.js` and from `test/lint/boundaries.test.ts`

## 2. Docs

- [ ] 2.1 Delete `docs/datev-format.md` and `docs/datev-import.md`; replace links to them with `docs/bmd-format.md` or `docs/bmd-import.md`; update the docs test's required-file list
- [ ] 2.2 Remove the SKR, Automatikkonto, Grman and EXTF finding codes from `docs/troubleshooting.md`
- [ ] 2.3 Remove the DATEV topics (`datev`, `datev-export`, `buchungsstapel`, `extf`, `skr03`, `skr04`) from the topic command in `docs/maintainers.md`

## 3. Release check

- [ ] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; every BMD golden file and `docs/examples/` unchanged
- [ ] 3.2 `grep -rni "datev" src test templates` finds nothing; `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the same summary as after b03
