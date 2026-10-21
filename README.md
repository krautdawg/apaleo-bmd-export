# apaleo BMD Export – kostenlos und Open Source

**English:** [README.en.md](README.en.md)

Kostenloser apaleo BMD Export: Buchungsimport für BMD NTCS aus apaleo, Open Source.

[![CI](https://github.com/krautdawg/apaleo-bmd-export/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krautdawg/apaleo-bmd-export/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node.js-24-339933.svg)](https://nodejs.org/)

apaleo-bmd-export ist ein kostenloser BMD-Export für Hotels in Österreich, die mit apaleo arbeiten, und für ihre Kanzlei. Er liest das apaleo-Buchungsjournal eines Monats und schreibt pro Hotel eine Datei im BMD Buchungsimport, die deine Steuerberaterin, dein Steuerberater oder deine Buchhaltung in BMD NTCS einliest, mit einer Vorlage für die Kontenzuordnung nach dem Einheitskontenrahmen (EKR). Das Tool ist Open Source (MIT-Lizenz) und läuft auf deinem eigenen Rechner mit deinem eigenen apaleo-Konto. Kein Abo, kein gehosteter Dienst, kein Konto bei uns.

**Stand:** Die Datei folgt dem dokumentierten BMD-Importformat (PR08/PR08A); ein erster Testimport mit einer Kanzlei steht noch aus. Was die Kanzlei dabei prüft, steht in [docs/bmd-import.md](docs/bmd-import.md).

> **Keine Gewähr, keine Steuerberatung.** Lass deine Kontenzuordnung von deiner Steuerberatung prüfen, ebenso die ersten Importe in BMD. Lies den [Haftungsausschluss](DISCLAIMER.md).

## Was es macht

- Liest das apaleo-Buchungsjournal (`export-gross-daily`) und den Kontenplan über eine apaleo Custom App, die nur lesen darf.
- Ordnet jedes apaleo-Konto einem Sachkonto oder Personenkonto in BMD zu, mit Steuercode und USt-Satz, in einer Kontenzuordnung (CSV) pro Hotel aus der EKR-Hotelvorlage.
- Prüft jede Zeile vor dem Schreiben: BMD bekommt Nettobetrag und Steuer getrennt und bucht genau die Umsatzsteuer, die apaleo berechnet hat; jedes Konto muss zugeordnet sein, und die Summen pro Konto müssen aufgehen.
- Bucht die österreichischen Fälle nach der Kontenzuordnung: Ortstaxe ohne Steuer, Anzahlungen mit der USt bei Erhalt, Forderungsverlust mit USt-Berichtigung, Stornogebühren und No-Shows.
- Schreibt pro Hotel und Monat eine Datei für BMD NTCS (oder BMD 5.5) mit Protokoll und Prüfsummen, schreibt denselben Monat nie zweimal und läuft von Hand, per Cron oder in einem selbst gebauten Docker-Container (`schedule --once`).

## Für wen

- Hotel-Backoffice und kleine Hotelgruppen in Österreich mit apaleo, deren Buchhaltung eine Kanzlei in BMD NTCS macht.
- Steuerberaterinnen, Steuerberater und Kanzleien, die die Kontenzuordnung sehen, prüfen und selbst verantworten wollen.
- Technische Helfer, die es für ein Hotel einrichten. Du brauchst einen Rechner mit Node.js 24 oder Docker und die Kommandozeile.

## Beispielausgabe ansehen

In [docs/examples/](docs/examples/) liegt eine BMD-Datei (Buchungsimport), die das Tool für das erfundene „Hotel Beispiel“ geschrieben hat, mit Protokoll und der Kontenzuordnung, aus der sie entstanden ist. Die Kanzlei kann sie prüfen oder in einen Test-Mandanten importieren, bevor irgendjemand etwas einrichtet.

## Ohne apaleo ausprobieren

Nach der Installation (Schritt 2 unten) läuft der echte Export auf mitgelieferten Demodaten. Dafür brauchst du keine Konfiguration, kein apaleo-Konto und kein Netz:

```sh
node dist/cli/main.js export --month 2026-09 --demo --dry-run
```

Das zeigt die Buchungsübersicht für September 2026 im „Hotel Beispiel“. Ohne `--dry-run` schreibt es die Datei nach `./demo-output/`, markiert mit `DEMO` im Dateinamen (`…_BSP_DEMO.csv`), am Anfang jedes Buchungstexts und im Protokoll. Im Docker-Image: siehe [docs/docker.md](docs/docker.md#die-demo-im-image).

## Schnellstart

Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.

1. **apaleo Custom App anlegen.** In apaleo: Apps > Connected apps > Add a new app > Add custom app (Seite „New simple client“), personenbezogene Daten „Omit all“, mit den Berechtigungen aus [docs/setup-apaleo.md](docs/setup-apaleo.md). Kopiere Client-ID und Secret.

2. **Installieren** (braucht Node.js 24 und git):

   <!-- quickstart -->
   ```sh
   git clone https://github.com/krautdawg/apaleo-bmd-export.git
   cd apaleo-bmd-export
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   node dist/cli/main.js --help        # oder: pnpm link --global, dann apaleo-bmd --help
   ```

   Dann die Konfiguration ausfüllen und das Secret setzen. Das Secret kommt nie in die Konfigurationsdatei.

   ```sh
   cp apaleo-bmd.config.example.yaml apaleo-bmd.config.yaml   # apaleo.clientId, das Buchungssymbol der Kanzlei und unter properties dein Hotel eintragen
   export APALEO_CLIENT_SECRET='das Secret aus apaleo'
   node dist/cli/main.js doctor
   node dist/cli/main.js properties
   ```

   `properties` zeigt die ID deines Hotels. Trag sie in der Konfiguration unter `properties` ein (den auskommentierten Abschnitt `properties:` in der Datei aktivieren); `export` exportiert jedes dort eingetragene Hotel. Die Befehle unten verwenden als Beispiel die ID `BSP`.

   Die Befehle unten verwenden `apaleo-bmd`. Ohne `pnpm link --global` tippst du stattdessen `node dist/cli/main.js`.

3. **Kontenzuordnung anlegen** und von deiner Kanzlei mit dem [Leitfaden zur Kontenzuordnung](docs/mapping-guide.md) prüfen lassen:

   ```sh
   apaleo-bmd init-mapping --property BSP --template ekr   # schreibt mapping-BSP.csv aus dem Einheitskontenrahmen (EKR)
   apaleo-bmd mapping check --property BSP --from 2026-09-01 --to 2026-09-30
   ```

4. **Probelauf**: alle Prüfungen und die Übersicht, keine Datei.

   ```sh
   apaleo-bmd export --month 2026-09 --dry-run
   ```

5. **Export**: eine Datei pro Hotel nach `exports/<Hotel>/<JJJJ-MM>/`. Gib sie der Kanzlei für den [BMD-Import](docs/bmd-import.md).

   ```sh
   apaleo-bmd export --month 2026-09
   ```

## Schnellstart mit Docker

Das Image wird auf deinem Rechner aus diesem Repository gebaut; nichts wird aus einer Registry geladen. Der Container ruft stündlich `schedule --once` auf und exportiert jeden Monat, sobald er fällig ist (Oktober am 3. November).

```sh
cp .env.example .env                 # APALEO_CLIENT_SECRET eintragen
mkdir -p config data
cp apaleo-bmd.config.example.yaml config/apaleo-bmd.config.yaml   # dann bearbeiten
cp mapping-BSP.csv config/           # die von der Kanzlei geprüfte Zuordnung
sudo chown 1000:1000 data            # der Container läuft als Benutzer node (uid 1000)
docker compose -f docker-compose.example.yml build
docker compose -f docker-compose.example.yml up -d
```

Die Dateien erscheinen in `./data/<Hotel>/<JJJJ-MM>/`. Cron auf dem Host, einmalige Befehle und Updates: [docs/docker.md](docs/docker.md).

## Befehle

| Befehl | Was er macht |
|---|---|
| `doctor` | Prüft Node.js, Konfigurationsdatei und Uhr. Ohne Netz. |
| `properties` | Listet die apaleo-Hotels, die die Custom App lesen darf. |
| `live-smoke` | Liest einen Geschäftstag aus apaleo mit echten Zugangsdaten und zeigt, was zurückkam. Schreibt nichts. |
| `init-mapping` | Schreibt eine Kontenzuordnung aus dem apaleo-Kontenplan und der EKR-Hotelvorlage (`--template ekr`); `--update` hängt neue Konten an. |
| `mapping check` | Prüft eine Kontenzuordnung, und mit `--from`/`--to`, ob jedes im Zeitraum gebuchte Konto zugeordnet ist. |
| `export` | Schreibt die BMD-Dateien (Buchungsimport) eines Monats oder Zeitraums nach allen Prüfungen; `--dry-run` schreibt nichts, `--demo` nimmt die Demodaten. |
| `schedule` | `schedule --once` exportiert jeden fälligen Zeitraum, der noch nicht im Ausgabeordner liegt, und endet. Für Cron und Docker. |

`apaleo-bmd <Befehl> --help` zeigt die Optionen. Exit-Codes: 0 Erfolg, 1 eine Prüfung oder ein Lauf ist fehlgeschlagen, 2 falscher Aufruf. Jeder Befund-Code mit Lösung: [docs/troubleshooting.md](docs/troubleshooting.md).

## Konfiguration

Eine YAML-Datei und Umgebungsvariablen für das Secret. Jeder Schlüssel mit Standardwert und Umgebungsvariable: [docs/configuration.md](docs/configuration.md). Die Vorlage zum Kopieren: [apaleo-bmd.config.example.yaml](apaleo-bmd.config.example.yaml).

## Was es nicht macht

- Keine Übertragung an BMD und kein BMD Com: Das Tool schreibt nur Dateien, die die Kanzlei in BMD importiert.
- Keine Personenkonten-Stammdaten. Rechnungen an Firmen gehen auf einen Sammeldebitor.
- Keine Buchung von Gebühren der Zahlungsdienstleister, Rückbuchungen (Chargebacks) oder Provisionen der Buchungsportale. Die bucht die Kanzlei aus den Abrechnungen.
- Keine Weboberfläche, kein gehosteter Dienst, kein E-Mail-Versand, kein zertifiziertes Archiv.
- Nur EUR, nur apaleo und keine anderen Zielformate wie DATEV oder RZL. Ein anderes PMS ist als Beitrag willkommen; siehe [docs/architecture.md](docs/architecture.md).

## Vergleich mit kostenpflichtigen Connectoren

Im apaleo Store gibt es kostenpflichtige BMD-Connectoren. Die Tabelle vergleicht das typische Angebot mit diesem Tool, ohne Namen zu nennen.

| | Kostenpflichtige Connectoren im apaleo Store | apaleo-bmd-export |
|---|---|---|
| Preis | 18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026 | kostenlos |
| Betrieb | beim Anbieter | bei dir (Rechner, Server oder Docker) |
| Einrichtung | Oberfläche des Anbieters | Konfigurationsdatei und Kontenzuordnung (CSV) |
| Zustellung der Dateien | per E-Mail oder in einen Cloud-Speicher | lokaler Ordner; du gibst die Datei der Kanzlei |
| Personenkonten-Datei | bei manchen | keine in Version 1, ein Sammeldebitor |
| Gebühren aus Abrechnungsdateien | bei manchen | nicht gebucht |
| Support | Support des Anbieters | Community, ohne Garantie |
| Vorlagen für die Zuordnung | unterschiedlich | Vorschläge nach dem EKR, geprüft von deiner Kanzlei |

Selbst betreiben heißt: Du behältst die Daten und zahlst nichts, aber du spielst Updates ein, behältst die geplanten Läufe im Blick, gibst die Dateien selbst an die Kanzlei weiter und löst Probleme selbst oder mit einem technischen Helfer. Kann das niemand übernehmen, ist ein bezahlter Connector vielleicht die bessere Wahl.

## Häufige Fragen

**Was kostet es?** Nichts. Es steht unter der MIT-Lizenz. Deine Kosten sind der Rechner, auf dem es läuft, und die Zeit der Kanzlei für die Prüfung der Zuordnung.

**Wohin gehen meine Daten?** Nur auf deine eigene Festplatte. Das Tool liest apaleo mit deiner Custom App und schreibt Dateien in einen lokalen Ordner. Es schickt nichts an uns oder an andere. Die BMD-Datei enthält keine Gästenamen: Buchungstexte nutzen Kontobezeichnungen, nie die Namen von Gastfolios.

**Kann es direkt an BMD übertragen, etwa über BMD Com?** Nein. Die Kanzlei importiert die Datei in BMD NTCS; siehe [docs/bmd-import.md](docs/bmd-import.md).

**Hat eine Kanzlei die Datei schon importiert?** Noch nicht. Die Datei folgt den veröffentlichten Beschreibungen des BMD-Imports (PR08/PR08A, dvo); die Quellen stehen in [docs/bmd-format.md](docs/bmd-format.md). Der erste Testimport wird mit Datum, BMD-Version und Ergebnis in [docs/maintainers.md](docs/maintainers.md#testimporte) festgehalten.

**Kann ich einen Import rückgängig machen?** Die Buchungen kommen unter dem Buchungssymbol, das die Kanzlei in BMD anlegt (`bmd.buchsymbol`); eine falsch importierte Datei löscht oder storniert die Kanzlei dort. Importiere nie eine Datei aus `--overwrite`, bevor die Kanzlei die Buchungen der alten Datei entfernt hat; siehe [docs/bmd-import.md](docs/bmd-import.md).

**Mehrere Hotels?** Trag sie unter `properties` in der Konfiguration ein. Jedes bekommt eine eigene Zuordnung und eine eigene Datei. Bucht die Kanzlei sie in einen Mandanten, bekommt jedes ein eigenes Buchungssymbol (`properties[].buchsymbol`).

**Ich nutze heute einen bezahlten Connector. Kann ich wechseln?** Ja. Die Kontenzuordnung eines anderen Connectors liest das Tool nicht. Leg die Zuordnung mit `init-mapping --template ekr` neu an und übertrag die Kontonummern mit deiner Kanzlei. Fang mit dem ersten Monat an, den der alte Connector nicht mehr geliefert hat, damit nichts doppelt importiert wird; siehe [docs/docker.md](docs/docker.md#der-erste-lauf).

**Und BMD 5.5?** Mit `bmd.dialect: bmd55` schreibt das Tool die Spaltennamen, das Datumsformat und die Steuercodes von BMD 5.5; siehe [docs/bmd-format.md](docs/bmd-format.md).

**Gibt es das auch für DATEV?** Dieses Tool baut auf [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) auf, und wer in Deutschland mit DATEV bucht, nimmt dieses Projekt.

**Ist die Zuordnung Steuerberatung?** Nein. Die Vorlagen sind Vorschläge. Jede Zeile entscheidet deine Kanzlei.

## Haftungsausschluss

Ohne Gewähr, keine Haftung, keine Steuerberatung. Deine Kanzlei muss die Kontenzuordnung und die ersten Importe in BMD prüfen. Lies den vollständigen [Haftungsausschluss](DISCLAIMER.md) (verbindlich auf Deutsch, mit einer unverbindlichen englischen Übersetzung). Keine Verbindung zur apaleo GmbH oder zur BMD Systemhaus GesmbH.

## Mitmachen

Fehlermeldungen, Korrekturen, Wissen über BMD und die Kontenzuordnung und neue Quellen sind willkommen. Lies zuerst [CONTRIBUTING.md](CONTRIBUTING.md): Einrichtung, OpenSpec-Ablauf und die Regel, dass Testdaten nie echte Gästedaten enthalten. Issues und Pull Requests auf Englisch sind ebenso willkommen; Code, Bezeichner und Commits sind auf Englisch. Sicherheitsprobleme: [SECURITY.md](SECURITY.md). Änderungen: [CHANGELOG.md](CHANGELOG.md).

## Lizenz

[MIT](LICENSE) (englischer Originaltext).
