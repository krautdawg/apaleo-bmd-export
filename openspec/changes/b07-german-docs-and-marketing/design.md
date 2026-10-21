## Context

The DATEV project's documentation rules (German only, "du", one short English README, docs test for commands, config keys, finding codes, links and language) proved useful and stay. What changes is the audience: Austrian hotels and Kanzleien using BMD NTCS. Their vocabulary differs from the German DATEV world (Buchungsimport instead of Buchungsstapel, Steuercode instead of BU-Schlüssel, EKR instead of SKR, Ortstaxe / Nächtigungsabgabe instead of Kurtaxe, Kanzlei / Steuerberatung, UVA). The paid alternatives in the apaleo Store cost 18-51 EUR per month and property (store pages, 2026-10-21).

## Goals / Non-Goals

**Goals:**
- First screen answers: what is it (apaleo BMD Export, kostenlos, Open Source), for whom (Hotels in Österreich und ihre Kanzlei), what it costs (nothing, self-hosted), what it does not do.
- Search: the H1, tagline, intro and repository topics carry the terms people type ("apaleo BMD", "BMD NTCS Import", "apaleo Buchhaltung Österreich").
- Every command, flag, config key and finding code in the docs exists (docs test).

**Non-Goals:**
- Marketing claims that are not verified (no "BMD-zertifiziert", no customer quotes, no invented numbers).

## Decisions

1. **Austrian term list in the docs test.** The language check gets a small list of DATEV-only terms that must not appear outside the history notes (`Buchungsstapel`, `BU-Schlüssel`, `SKR03`, `SKR04`, `Automatikkonto`), so a copied DATEV paragraph fails the test. `CHANGELOG.md` and the origin note in the README are exempt.
2. **Comparison without vendors.** Same rule as before: compare "kostenpflichtige Connectoren im apaleo Store" as one column (price range, hosted, email/S3 delivery, Personenkonten file, settlement fees) with this tool (free, self-hosted, local folder, no Personenkonten file in v1, no fees), plus "Selbst betreiben heißt".
3. **Origin made explicit.** One sentence in the README and CHANGELOG: built on apaleo-datev-export, with a link; DATEV users should use that project.
4. **Repository metadata by `gh repo edit --add-topic`.** Description stays as set; visibility is not touched; `docs/maintainers.md` lists the publication steps for the maintainer.

## Risks / Trade-offs

- [Wording drifts from the code again] → the docs test covers commands, flags, config keys, codes, links, anchors and language.
- [Austrian practice differs between Kanzleien] → the docs say "Vorschlag", show options, and end the mapping guide with the sign-off checklist.

## Migration Plan

None.

## Open Questions

- Whether to add a short FAQ entry for hotels switching from a paid BMD connector (mapping screens differ by vendor); add once a first user reports.
