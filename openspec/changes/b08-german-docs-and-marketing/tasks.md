## 1. README

- [ ] 1.1 Rewrite `README.md` first screen (H1, English link, tagline, badges, intro with the search terms, disclaimer notice, `## Was es macht` with five items)
- [ ] 1.2 `## Schnellstart` (five steps, `init-mapping --template ekr`) with the `<!-- quickstart -->` block and `## Schnellstart mit Docker`
- [ ] 1.3 `## Was es nicht macht`, `## Vergleich mit kostenpflichtigen Connectoren` (no vendor names, "18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026", "Selbst betreiben heißt"), the compatibility sentence (test import pending), origin sentence with link, `## Häufige Fragen`
- [ ] 1.4 Rewrite `README.en.md` (max 80 lines, same install commands, no quickstart marker)
- [ ] 1.5 Update `test/readme.test.ts` for the new first-screen rules and search terms, the price sentence with "Oktober 2026", and no "getestet mit BMD" while `docs/maintainers.md` records no test import

## 2. Guides

- [ ] 2.1 Review and rewrite for Austria: `docs/setup-apaleo.md`, `docs/mapping-guide.md` (ends with `## Checkliste zur Freigabe durch die Kanzlei`), `docs/bmd-import.md`, `docs/bmd-format.md`, `docs/posting-rules.md`
- [ ] 2.2 Review and rewrite: `docs/export.md`, `docs/configuration.md`, `docs/docker.md`, `docs/troubleshooting.md`, `docs/architecture.md` (TargetWriter boundary with `BmdBooking` as the example; another target only as a hypothetical contributor case), `docs/apaleo-source.md`, `docs/examples/README.md`, `examples/demo/README.md`
- [ ] 2.3 `docs/maintainers.md`: `## Vor der Veröffentlichung` (test import first), `## Testimporte` (empty table: Datum, BMD-Version, Dialekt, Ergebnis) and `## Später geplant` (only items inside this product: Personenkonten file, Summendatei, settlement fees)
- [ ] 2.4 German comments in `apaleo-bmd.config.example.yaml`, `.env.example`, `docker-compose.example.yml`

## 3. Community files

- [ ] 3.1 `DISCLAIMER.md` (BMD imports, German binding, English translation), `CONTRIBUTING.md`, `SECURITY.md`, issue forms (target request names RZL and DATEV as examples) and PR template
- [ ] 3.2 Restart `CHANGELOG.md` for apaleo-bmd-export with the `## [Unveröffentlicht]` entries and the origin note
- [ ] 3.3 Set the repository topics with `gh repo edit --add-topic ...`; confirm with `gh repo view --json description,repositoryTopics,visibility` that the visibility is unchanged

## 4. Docs test

- [ ] 4.1 `test/helpers/docs.ts`: `apaleo-bmd` command lines, config-key pattern with `bmd`, the German-only term list and the bare `DATEV` check with the exemptions from the design; one test per class ("Copied DATEV paragraph", "German levy or rate", "Bare DATEV mention", "Allowed DATEV mention") and the other scenarios
- [ ] 4.2 Update the required-file list (no `docs/datev-*.md`, `docs/bmd-import.md` and `docs/bmd-format.md` present)
- [ ] 4.3 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; CI `readme-quickstart` job passes
