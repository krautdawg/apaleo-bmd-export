# Änderungsprotokoll

Alle wichtigen Änderungen an diesem Projekt stehen in dieser Datei.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), und dieses Projekt hält sich an die [Semantische Versionierung](https://semver.org/lang/de/spec/v2.0.0.html).

## [Unveröffentlicht]

### Hinzugefügt

- **Writer für den BMD Buchungsimport** (`src/bmd`, noch nicht im Export): Satzart 0 mit Kopfzeile, `;`, Windows-1252 und CRLF, in den Dialekten NTCS (Standard) und BMD 5.5, die Kopfzeile, Datumsformat und Steuercodes gemeinsam umschalten; Belegnummern aus Monat und Tag des ersten Tags plus Zähler, die sich zwischen den Dateien eines Hotels nicht wiederholen; Prüfung jedes Felds mit den Codes `E-BMD-ACCOUNT` bis `E-BMD-FILE-NAME`, Bereinigung von Buchungstext und externer Belegnummer und Golden Files für beide Dialekte. Format, Quellen und die Checkliste für den ersten Testimport: `docs/bmd-format.md`.

### Geändert

- **Neuer Name apaleo-bmd-export**: Das Paket heißt `apaleo-bmd-export` (Version `0.0.0` bis zum ersten Release), die Kommandozeile `apaleo-bmd`, die Konfigurationsdatei `apaleo-bmd.config.yaml` (Vorlage `apaleo-bmd.config.example.yaml`), die Umgebungsvariablen `APALEO_BMD_CONFIG` und `APALEO_BMD_*`; `APALEO_CLIENT_ID` und `APALEO_CLIENT_SECRET` bleiben. Die alten Namen `apaleo-datev` und `APALEO_DATEV_*` liest das Tool nicht mehr: Benenne deine Konfigurationsdatei um. Docker-Image, Compose-Beispiel und `.env.example` folgen den neuen Namen.
- **Schnittstelle für Zielformate**: Der Export schreibt Dateien nur noch über einen `TargetWriter` (Dateiname, Muster für vorhandene Dateien, Vergleich „unverändert“, Titel des Protokolls, Hinweise in den Meldungen `E-PERIOD-OVERLAP` und `E-FILE-EXISTS`). Der DATEV-Writer ist vorerst die einzige Umsetzung; seine EXTF-Dateien bleiben Byte für Byte gleich, Protokoll und `manifest.json` unterscheiden sich nur im Namen und in der Version des Tools und im SHA-256 der Kontenzuordnung.
- **Dokumentation auf Deutsch**: Das README und die gesamte Dokumentation sind jetzt deutsch und sagen „du“; ein kurzes `README.en.md` erklärt das Tool für internationale Mitwirkende. `docs/setup-apaleo.de.md` und `docs/mapping-guide.de.md` heißen jetzt `docs/setup-apaleo.md` und `docs/mapping-guide.md`, die englischen Fassungen sind entfallen. `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, die Vorlagen für Issues und Pull Requests und die Kommentare in den Beispieldateien sind deutsch, `CODE_OF_CONDUCT.md` ist die offizielle deutsche Übersetzung des Contributor Covenant 2.1, und in `DISCLAIMER.md` ist die deutsche Fassung verbindlich. Der Docs-Test prüft jetzt auch Links, Anker und die Sprache. Code, Ausgaben der Kommandozeile und Commits bleiben englisch.

## [0.1.0] - 2026-10-21

### Hinzugefügt

- **Grundgerüst**: die Kommandozeile `apaleo-datev` mit `--help`, `--version` und `doctor`; Konfigurationsdatei in YAML oder JSON mit Werten aus der Umgebung und dem Client-Secret nur aus der Umgebung; MIT-Lizenz und ein Haftungsausschluss auf Deutsch und Englisch; CI für Typprüfung, Lint, Tests und Build.
- **Writer für das DATEV-Format**: EXTF-Buchungsstapel in Formatversion 13 mit dem Kopfsatz aus 31 Feldern, allen 125 Spalten, Windows-1252 und CRLF, Prüfung jedes Felds, Bereinigung der Texte in Belegfeld und Buchungstext, und Tests gegen Golden Files.
- **Quelle apaleo**: Lesezugriff über eine apaleo Custom App (Client Credentials), das Buchungsjournal pro Geschäftstag (`export-gross-daily`), der Kontenplan und die Tagessummen, mit Wiederholungen und Prüfung gegen die Swagger-Schemas; die Befehle `properties` und `live-smoke`.
- **Kontenzuordnung**: eine CSV-Datei pro Hotel, Hotel-Vorlagen für SKR03 und SKR04, `init-mapping` (auch mit `--update` und der Umwandlung eines Mapping-Exports von Grman) und `mapping check`, mit der Prüfung, dass jedes im Zeitraum gebuchte Konto zugeordnet ist.
- **Buchungsregeln**: eine DATEV-Buchung pro apaleo-Zeile, die USt-Seite im Gegenkonto, die Prüfung pro Zeile, dass DATEV die USt rechnet, die apaleo berechnet hat, Anzahlungen auf den Automatikkonten für versteuerte Anzahlungen, wobei die USt-Zeilen von apaleo übersprungen werden, die Ermittlung des Satzes für Auflösungen von Anzahlungen ohne USt, und keine Gästenamen im Buchungstext.
- **Befehl export**: `export --month` oder `--from`/`--to`, eine Datei pro Hotel und Monat, Datumsregeln für den Tagesabschluss, Plausibilitätsprüfungen (Vollständigkeit, Kontobewegungen, USt pro Satz, optional die Tagessummen), `--dry-run`, ein Protokoll und eine `manifest.json` neben jeder Datei, und erneute Läufe ohne doppelte Dateien, mit `--overwrite` für Nachbuchungen.
- **Zeitplan und Docker**: `schedule --once` mit monatlichem oder täglichem Rhythmus, Nachholen nach einem Ausfall und Warten, bis ein Zeitraum abgeschlossen ist; ein lokal gebautes Docker-Image und ein Compose-Beispiel mit einer stündlichen Schleife.
- **Dokumentation und Community**: ein vollständiges README auf Englisch und Deutsch, Anleitungen für Einrichtung, Kontenzuordnung, DATEV-Import, Konfiguration, Fehlerbehebung und Architektur, eine Beispielausgabe in `docs/examples/`, `export --demo` auf mitgelieferten Demodaten (der Dateiname endet auf `_DEMO`), Dateien für Mitwirkende, Sicherheit und Verhaltenskodex, Vorlagen für Issues und Pull Requests und ein Test, der die Dokumentation im Einklang mit dem Code hält.
