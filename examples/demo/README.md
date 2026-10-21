# Demodaten: „Hotel Beispiel“

`apaleo-bmd export --month 2026-09 --demo --dry-run` lässt den echten Export auf den Dateien in diesem Ordner laufen. Dafür brauchst du kein apaleo-Konto, keine Konfigurationsdatei und kein Secret, und nichts geht über das Netz.

- `apaleo/`: aufgezeichnete apaleo-Antworten für das erfundene Hotel `BSP` in Wien (Hotels, Kontenplan, `export-gross-daily` und `aggregate-daily` pro Geschäftstag). Sie sind Kopien von `test/fixtures/apaleo/`, und ein Test hält sie gleich. Nur in der Demo gibt es zwei weitere Tage, damit jeder Abschnitt des Protokolls etwas zeigt: am 2026-09-25 eine Übernachtung von `BSP-QRSTUV-1` um 55,00 mit 10 %, die nie bezahlt wird, und am 2026-09-29 ihr Forderungsverlust mit USt-Berichtigung (netto 50,00, Steuer 5,00). Für diese zwei Tage gibt es keine `aggregate-daily`-Dateien; die Demo prüft die Tagessummen nicht (`checks.aggregates` ist aus). Hinter den Daten steht kein echtes Hotel, kein echter Gast und keine echte Buchung.
- `mapping-BSP.csv`: die Kontenzuordnung des Hotel Beispiel nach dem Einheitskontenrahmen (EKR), dieselbe Datei wie `docs/examples/mapping-BSP.example.csv`: die Ausgabe von `init-mapping --template ekr` mit der Ortstaxe auf `3580` und der Kostenstelle `20` auf den Getränken.
- `apaleo-bmd.config.yaml`: die Konfiguration der Demo (Buchungssymbol `HO`, Dialekt NTCS).

Die Uhr der Demo steht auf 2026-10-05, der September 2026 ist also immer abgeschlossen. Ohne `--dry-run` schreibt die Demo nur nach `./demo-output/` und markiert ihre Ausgabe mit `DEMO`: im Dateinamen (`…_BSP_DEMO.csv`), am Anfang jedes Buchungstexts und in der ersten Zeile des Protokolls. Das ist die Datei für einen Blick auf die Ausgabe, nicht für einen echten Mandanten: Importiere sie nie in die Buchhaltung eines Hotels.
