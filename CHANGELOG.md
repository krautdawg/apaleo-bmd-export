# Änderungsprotokoll

Alle wichtigen Änderungen an apaleo-bmd-export stehen in dieser Datei.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), und dieses Projekt hält sich an die [Semantische Versionierung](https://semver.org/lang/de/spec/v2.0.0.html).

Die Geschichte von apaleo-bmd-export beginnt hier. Das Projekt ist eine Kopie von [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) v0.1.0 (apaleo nach DATEV EXTF): Quelle apaleo, Ablauf des Exports, Plausibilitätsprüfungen, Zeitplan und Docker kommen von dort, die Einträge jenes Projekts stehen in seinem eigenen Änderungsprotokoll. Wer mit DATEV bucht, nimmt apaleo-datev-export.

## [Unveröffentlicht]

## [0.1.0] - 2026-10-21

### Hinzugefügt

- **BMD Buchungsimport** (b02, b03, b06): Der Export schreibt pro Hotel und Monat `BMD_Buchungsimport_<von>-<bis>_<Hotel>.csv` im variablen Format des BMD-Buchungsimports (Satzart 0, Kopfzeile, `;`, Windows-1252, CRLF) für BMD NTCS, mit `bmd.dialect: bmd55` für BMD 5.5 (Spaltennamen, Datum und Steuercodes schalten gemeinsam um). Das Konto mit Steuercode führt, mit Nettobetrag und der Steuer aus apaleo, sodass BMD in der UVA genau die USt von apaleo bucht. Belegnummern aus Monat und Tag des ersten Tags plus Zähler wiederholen sich zwischen den Dateien eines Hotels nicht. Jedes Feld wird vor dem Schreiben geprüft (`E-BMD-ACCOUNT` bis `E-BMD-FILE-NAME`). Das Protokoll beginnt mit dem Block „Import into BMD“ zum Vergleich mit dem Mandanten; `manifest.json` enthält die Steuer pro Satz (`taxByRate`).
- **EKR-Vorlage** (b03): `init-mapping --template ekr` schreibt die Kontenzuordnung aus dem apaleo-Kontenplan und einer Hotelvorlage nach dem Einheitskontenrahmen (EKR), jede Zeile als `Vorschlag (ungeprüft)` markiert. Die Spalten sind `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;bmd_account;steuercode;bmd_vat_percent;kost;comment`; `mapping check` prüft die Steuercodes von BMD NTCS und BMD 5.5, die Sach- und Personenkontenlänge und die österreichischen Steuersätze.
- **Österreichische Buchungsregeln** (b03, b05): Steuercodes für Umsatzsteuer (NTCS `1`, BMD 5.5 `3`) und kein Vorsteuer-Code auf Erlösen (`E-STEUERCODE-INPUT-TAX`); Ortstaxe ohne Steuercode auf eine Verbindlichkeit oder einen durchlaufenden Posten; Anzahlungen mit der USt bei Erhalt (Mindest-Istbesteuerung) auf `3200`, `3202` und `3201`; Forderungsverlust mit USt-Berichtigung auf `7800`, `7802` und `7801`; Stornogebühren und No-Shows ohne USt auf `4091`; Kostenstelle nur auf Erlösen; ein Buchungssymbol pro Hotel (`W-BUCHSYMBOL-SHARED`). Ein erfundener österreichischer Testmonat und der aufgezeichnete Tag VIE prüfen alle Fälle.
- **Demo** (b06): `export --demo` lässt den Export auf dem erfundenen „Hotel Beispiel“ in Wien laufen, ohne Konfiguration, Secret und Netz; Dateiname, Buchungstexte und Protokoll sind mit `DEMO` markiert. `docs/examples/` zeigt, was ein normaler Export der Demodaten schreibt.
- **Zeitplan und Docker** (b07): `schedule --once` exportiert jeden fälligen Monat und rechnet standardmäßig mit `Europe/Vienna`; das lokal gebaute Docker-Image trägt OCI-Labels für das BMD-Produkt, und `docs/docker.md` beschreibt Compose, Cron und die Demo im Image.
- **Dokumentation für Österreich** (b08): README, `README.en.md` und alle Anleitungen für BMD NTCS, mit `docs/bmd-import.md` (Menüweg, Buchungssymbol, Periode, Checkliste für den ersten Import), `docs/bmd-format.md`, dem Leitfaden zur Kontenzuordnung mit der Checkliste zur Freigabe durch die Kanzlei und `docs/maintainers.md` mit dem Abschnitt „Testimporte“. Der Docs-Test lehnt Begriffe aus der deutschen DATEV-Praxis ab und jede Behauptung eines getesteten Imports, solange keiner festgehalten ist. Themen für die Suche auf GitHub sind gesetzt.

### Geändert

- **Neuer Name apaleo-bmd-export** (b01): das Paket `apaleo-bmd-export`, die Kommandozeile `apaleo-bmd`, die Konfigurationsdatei `apaleo-bmd.config.yaml` und die Umgebungsvariablen `APALEO_BMD_*`; `APALEO_CLIENT_ID` und `APALEO_CLIENT_SECRET` bleiben.
- **Schnittstelle für Zielformate** (b01): Der Export schreibt Dateien nur noch über einen `TargetWriter`; der BMD-Writer ist die einzige Umsetzung.
- **Konfiguration für BMD** (b03): Der Abschnitt `bmd` (`buchsymbol` als Pflicht, `buchsymbolZahlung`, `sachkontenlaenge`, `personenkontenlaenge`, `dialect`) ersetzt `datev`, `posting.extbelegnr` ersetzt `posting.belegfeld1`, und `properties[].buchsymbol` ersetzt die Mandantennummer pro Hotel. Eine Konfiguration mit `datev` und eine DATEV-Kontenzuordnung lehnt das Tool mit einem Hinweis auf `bmd` und `init-mapping --template ekr` ab.

### Entfernt

- **DATEV EXTF** (b04): der Writer für den DATEV-Buchungsstapel (EXTF), seine Golden Files und die DATEV-Anleitungen.
- **SKR03 und SKR04** (b04): die Hotelvorlagen für SKR03 und SKR04 und die Option `--skr`.

### Behoben

- **Echte apaleo-Daten** (b02b): die Korrekturen aus apaleo-datev-export 0.1.1 nach dem ersten Live-Test gegen eine apaleo-Sandbox (Hotels BER und VIE): genaue Netto- und Steuerbeträge mit bis zu acht Nachkommastellen, leere Elternzeilen und gebündeltes `E-UNMAPPED`, Tagessummen über den Saldo, Anzahlungen nach Seite und Vorzeichen, `live-smoke` an einem Tag ohne Buchungen und die aufgezeichneten Antworten als Regressionstest.
