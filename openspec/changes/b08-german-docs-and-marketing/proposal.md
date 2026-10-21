## Why

After b01-b07 the tool is a working apaleo to BMD export, but README, guides, changelog, disclaimer and repository metadata still describe the German DATEV product. Austrian hotels and Kanzleien search for "apaleo BMD" and decide on the first screen; the docs must be German, in Austrian accounting terms, honest about scope, and findable once the maintainer makes the repository public.

## What Changes

- README rewritten: H1 "apaleo BMD Export – kostenlos und Open Source", tagline "Kostenloser apaleo BMD Export: Buchungsimport für BMD NTCS aus apaleo, Open Source", intro with the search terms (apaleo, BMD, BMD NTCS, Buchungsimport, EKR, Steuerberater, Hotel, Österreich), disclaimer, `## Was es macht`, `## Schnellstart` (`init-mapping --template ekr`), Docker quick start, `## Was es nicht macht`, `## Vergleich mit kostenpflichtigen Connectoren` (no vendor names, "18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026"), FAQ. No compatibility claim until a Kanzlei test import is recorded in `docs/maintainers.md`.
- Every guide reviewed for Austria: setup-apaleo, mapping-guide (EKR, Steuercodes, sign-off checklist), bmd-format, bmd-import, posting-rules, export, configuration, docker, troubleshooting, architecture, apaleo-source, maintainers, examples. Austrian terms, "du", sources cited.
- `README.en.md` (max 80 lines) for the BMD product.
- `DISCLAIMER.md`, `CONTRIBUTING.md`, `SECURITY.md`, issue forms and PR template mention BMD instead of DATEV; the target-request form names RZL and DATEV as examples.
- `CHANGELOG.md` restarted for apaleo-bmd-export: `## [Unveröffentlicht]` lists b01-b08 in German; a note links the DATEV origin project.
- Repository topics for discoverability (apaleo, bmd, bmd-ntcs, bmd-export, buchungsimport, ekr, hotel, hospitality, accounting, buchhaltung, steuerberater, austria, oesterreich), description kept; visibility unchanged.
- Docs test: `apaleo-bmd` command lines, `bmd.*` config keys, a longer list of German DATEV-practice terms (Kurtaxe, Beraternummer, EXTF, UStVA, 19 %, ...) and bare `DATEV` mentions outside the allowed places.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `documentation`: README first screen, quick start, scope and comparison, docs folder, docs test, German-first rules for Austria.
- `community-health`: changelog, repository description and topics.
- `project-quality`: disclaimer names BMD imports.

## Non-goals

- Making the repository public, a release tag, a social preview image or any announcement: those are the maintainer's steps in `docs/maintainers.md`.
- Translating code, CLI output or specs.
- A website or landing page.

## Impact

- `README.md`, `README.en.md`, `docs/**/*.md`, `CHANGELOG.md`, `DISCLAIMER.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, example config comments.
- `test/docs.test.ts`, `test/readme.test.ts`, `test/community.test.ts`, `test/helpers/docs.ts`.
- GitHub repository topics (metadata only).
