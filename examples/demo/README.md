# Demodaten: „Hotel Beispiel“

`apaleo-bmd export --month 2026-09 --demo --dry-run` lässt den echten Export auf den Dateien in diesem Ordner laufen. Dafür brauchst du kein apaleo-Konto, keine Konfigurationsdatei und kein Secret, und nichts geht über das Netz.

- `apaleo/`: aufgezeichnete apaleo-Antworten für das erfundene Hotel `BSP` in Salzburg (Hotels, Kontenplan, `export-gross-daily` und `aggregate-daily` pro Geschäftstag). Sie sind Kopien von `test/fixtures/apaleo/`; ein Test hält sie gleich. Hinter ihnen steht kein echtes Hotel, kein echter Gast und keine echte Buchung.
- `mapping-BSP.csv`: die Kontenzuordnung des Hotel Beispiel nach dem Einheitskontenrahmen (EKR), dieselbe Datei wie `docs/examples/mapping-BSP.example.csv`.
- `apaleo-bmd.config.yaml`: die Konfiguration der Demo (Buchungssymbol `HO`, Dialekt NTCS).

Die Uhr der Demo steht auf 2026-10-05, der September 2026 ist also immer abgeschlossen. Ohne `--dry-run` schreibt die Demo nur nach `./demo-output/`, und der Dateiname (`…_BSP_DEMO.csv`) und das Protokoll sind mit `DEMO` markiert. Das ist die Datei für einen Blick auf die Ausgabe, nicht für einen echten Mandanten: Importiere sie nie in die Buchhaltung eines Hotels.
