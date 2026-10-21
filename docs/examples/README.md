# Beispielausgabe: „Hotel Beispiel“

Das schreibt das Tool, noch bevor jemand eine apaleo-App anlegt. Alles hier ist erfunden: das Hotel „Hotel Beispiel“ (`BSP`) in Salzburg, die Reservierungen und die Beträge. Hinter den Daten steht kein echtes Hotel und kein echter Gast. Die Kanzlei kann damit die Ausgabe prüfen, bevor jemand etwas einrichtet.

| Datei | Was sie ist |
|---|---|
| [`BMD_Buchungsimport_20260901-20260930_BSP.csv`](BMD_Buchungsimport_20260901-20260930_BSP.csv) | Der BMD-Buchungsimport für September 2026 im Dialekt NTCS: 24 Buchungen aus 29 apaleo-Zeilen (Beherbergung und Speisen mit 10 %, Getränke mit 20 %, Ortstaxe, Karten- und Barzahlungen, eine Rechnung an eine Firma auf den Sammeldebitor, zwei Anzahlungen und ihre Auflösung, eine Erstattung). |
| [`BMD_Buchungsimport_20260901-20260930_BSP.protokoll.txt`](BMD_Buchungsimport_20260901-20260930_BSP.protokoll.txt) | Das Protokoll, das daneben geschrieben wird: Summen pro BMD-Konto, Erlöse und USt pro Satz, Ortstaxe, Zahlungen, Anzahlungen, übersprungene Zeilen, Befunde und Prüfsummen. |
| [`mapping-BSP.example.csv`](mapping-BSP.example.csv) | Die Kontenzuordnung nach dem Einheitskontenrahmen (EKR), aus der die Datei entstanden ist, mit der Entscheidung zur Ortstaxe (vom Gast geschuldet, als Verbindlichkeit gegenüber der Gemeinde 3580) in der Spalte für Kommentare. |

**Öffne die BMD-Datei nicht in Excel und speichere sie dort nicht.** Sie ist in Windows-1252 kodiert, mit `;` als Trennzeichen und CRLF am Zeilenende, genau so, wie BMD sie importiert, und Excel ändert das alles. Zum Ansehen nimm einen Texteditor, oder öffne sie in Excel, ohne zu speichern. Eine Kanzlei kann sie in einen Testmandanten mit dem Buchungssymbol `HO` importieren ([bmd-import.md](../bmd-import.md)).

Die BMD-Datei ist das Golden File der Tests: Ein Test schlägt fehl, sobald sie von dem abweicht, was der aktuelle Code schreibt, und ein weiterer prüft das Protokoll und die Kontenzuordnung. So erzeugst du eine solche Datei selbst, ohne apaleo:

```sh
apaleo-bmd export --month 2026-09 --demo
```

Die Demo markiert ihre Datei und ihr Protokoll mit `DEMO` und schreibt nach `./demo-output/`.
