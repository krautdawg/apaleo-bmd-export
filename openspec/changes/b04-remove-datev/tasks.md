## 1. Code and tests

- [x] 1.1 Delete `src/datev/`, `test/datev/`, the EXTF golden files and `test/helpers/extf.ts`
- [x] 1.2 Delete the Grman reader, `src/mapping/automatic-accounts.ts`, the BU-Schlüssel helpers and their tests
- [x] 1.3 Delete `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` and the SKR code paths in `src/mapping/template.ts`
- [x] 1.4 Remove `src/datev` from the restricted-import boundary in `eslint.config.js` and from `test/lint/boundaries.test.ts`

## 2. Docs

- [x] 2.1 Delete `docs/datev-format.md` and `docs/datev-import.md`; replace links to them with `docs/bmd-format.md` or `docs/bmd-import.md`; update the docs test's required-file list
- [x] 2.2 Remove the SKR, Automatikkonto, Grman and EXTF finding codes from `docs/troubleshooting.md`
- [x] 2.3 Remove the DATEV topics (`datev`, `datev-export`, `buchungsstapel`, `extf`, `skr03`, `skr04`) from the topic command in `docs/maintainers.md`

## 3. Release check

- [x] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; every BMD golden file and `docs/examples/` unchanged
- [x] 3.2 `grep -rni "datev" src test templates` finds nothing; `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the same summary as after b03
  - Note: `grep` still finds `datev` where the merged specs require it, and nowhere else: the refusal of an old `datev:` config section (cli, "Old DATEV section") and of DATEV and Grman mapping files (account-mapping, "Old DATEV mapping") with their tests, negative assertions that BMD messages never mention DATEV, and the README tests that b08 rewrites. The `*any*` row type stays, because the account resolution order in `openspec/specs/account-mapping` still names "exact number with any type"; the Grman conversion, the Automatikkonten and the BU-Schlüssel helpers were already gone after b03.
