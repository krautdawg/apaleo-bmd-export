## Context

The DATEV project's documentation rules (German only, "du", one short English README, docs test for commands, config keys, finding codes, links and language) proved useful and stay. What changes is the audience: Austrian hotels and Kanzleien using BMD NTCS. Their vocabulary differs from the German DATEV world (Buchungsimport instead of Buchungsstapel, Steuercode instead of BU-Schlüssel, EKR instead of SKR, Ortstaxe / Nächtigungsabgabe instead of Kurtaxe, Kanzlei / Steuerberatung, UVA / FinanzOnline instead of UStVA / ELSTER). The paid alternatives in the apaleo Store cost 18-51 EUR per month depending on vendor and number of properties (Grman's 24/34/51 EUR are tiers by number of properties, not a per-property price; store pages, 2026-10-21).

## Goals / Non-Goals

**Goals:**
- First screen answers: what is it (apaleo BMD Export, kostenlos, Open Source), for whom (Hotels in Österreich und ihre Kanzlei), what it costs (nothing, self-hosted), what it does not do.
- Search: the H1, tagline, intro and repository topics carry the terms people type ("apaleo BMD", "BMD NTCS Import", "apaleo Buchhaltung Österreich").
- Every command, flag, config key and finding code in the docs exists (docs test).

**Non-Goals:**
- Marketing claims that are not verified (no "BMD-zertifiziert", no customer quotes, no invented numbers).
- A compatibility claim before a real import: README and docs say that the file follows the documented BMD import layout and that a Kanzlei test import is pending, never "getestet mit BMD NTCS", until `docs/maintainers.md` records a test import (date, BMD version, dialect, result).
- Promising future targets: the roadmap for other accounting systems lives in separate repositories, so `## Später geplant` lists only items inside this product.

## Decisions

1. **German-only term list in the docs test.** The language check gets a list of terms from German DATEV practice that have no place in an Austrian BMD doc: `Buchungsstapel`, `BU-Schlüssel`, `SKR03`, `SKR04`, `Automatikkonto`, `Kurtaxe`, `Beherbergungssteuer`, `Übernachtungssteuer`, `Beraternummer`, `Mandantennummer`, `EXTF`, `Belegfeld`, `Festschreibung`, `UStVA`, `ELSTER`, `19 %` and `7 %`. It also fails on any `DATEV` token. Both checks skip the README sentence that names the origin project, the README `## Was es nicht macht` item about other target formats, `CHANGELOG.md`, and the `docs/troubleshooting.md` entries of the findings that detect a copied German setup (the DATEV-mapping error, the rejected `datev` config section and `W-VAT-RATE-UNUSUAL`). So a copied DATEV paragraph, a German Kurtaxe or a German rate fails the test, while the places that must name DATEV still pass.
2. **Comparison without vendors.** Same rule as before: compare "kostenpflichtige Connectoren im apaleo Store" as one column (price "18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026", hosted, email/S3 delivery, Personenkonten file, settlement fees) with this tool (free, self-hosted, local folder, no Personenkonten file in v1, no fees), plus "Selbst betreiben heißt". The README test asserts the price sentence with its date.
3. **Origin made explicit.** One sentence in the README and CHANGELOG: built on apaleo-datev-export, with a link; DATEV users should use that project.
4. **Compatibility wording.** Until a test import is recorded, the README says "folgt dem dokumentierten BMD-Importformat (PR08/PR08A); ein erster Testimport mit einer Kanzlei steht noch aus". `docs/maintainers.md` has a `## Testimporte` section; the README test fails on "getestet mit BMD" while that section lists no import.
5. **Repository metadata by `gh repo edit --add-topic`.** Description stays as set; visibility is not touched; `docs/maintainers.md` lists the publication steps for the maintainer.

## Risks / Trade-offs

- [Wording drifts from the code again] → the docs test covers commands, flags, config keys, codes, links, anchors and language.
- [Austrian practice differs between Kanzleien] → the docs say "Vorschlag", show options, and end the mapping guide with the sign-off checklist.

## Migration Plan

None.

## Open Questions

- Whether to add a short FAQ entry for hotels switching from a paid BMD connector (mapping screens differ by vendor); add once a first user reports.
