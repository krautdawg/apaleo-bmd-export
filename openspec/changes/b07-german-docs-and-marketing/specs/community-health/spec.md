## MODIFIED Requirements

### Requirement: Changelog
The repository SHALL contain `CHANGELOG.md` in German in the Keep a Changelog format (German edition, `https://keepachangelog.com/de/1.1.0/`) with a `## [Unveröffentlicht]` section that lists the user-visible changes since the last version, using the German section names (Hinzugefügt, Geändert, Entfernt, Behoben). Entries SHALL be German; command names, flags and file names in them SHALL stay unchanged. The changelog SHALL start the history of apaleo-bmd-export and SHALL name and link apaleo-datev-export v0.1.0 as its origin instead of repeating that project's entries.

#### Scenario: Unreleased section
- **WHEN** this slice is merged
- **THEN** `## [Unveröffentlicht]` lists under `### Hinzugefügt`, in German, the BMD Buchungsimport, the EKR template with `init-mapping --template ekr`, the Austrian posting rules (Steuercodes, Ortstaxe, Anzahlungen, Forderungsverlust), `export --demo`, `schedule --once` and Docker, and under `### Entfernt` the DATEV EXTF output and the SKR03/SKR04 templates, and the file names apaleo-datev-export v0.1.0 as the origin

### Requirement: Repository description and topics
The repository description and topics SHALL be set for discoverability (description in German naming apaleo, BMD and BMD NTCS; topics including apaleo, bmd, bmd-ntcs, bmd-export, buchungsimport, ekr, hotel, hospitality, accounting, buchhaltung, steuerberater, austria and oesterreich) without changing the repository visibility. `docs/maintainers.md` SHALL state in German that discoverability only takes effect once the maintainer makes the repository public and SHALL contain a `## Vor der Veröffentlichung` checklist (first real BMD NTCS test import with a Kanzlei, visibility, social preview, Discussions, first release tag).

#### Scenario: Metadata applied
- **WHEN** the slice is merged
- **THEN** `gh repo view --json description,repositoryTopics,visibility` shows the German description and all listed topics, and the visibility is unchanged

#### Scenario: Going public later
- **WHEN** the maintainer decides to publish the repository
- **THEN** `docs/maintainers.md` lists the steps in order under `## Vor der Veröffentlichung`, starting with the confirmed test import, and none of them was done by this slice
