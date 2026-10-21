# Beispielausgabe: „Hotel Beispiel“

Das schreibt das Tool, noch bevor jemand eine apaleo-App anlegt. Alles hier ist erfunden: das Hotel „Hotel Beispiel“ (`BSP`) in Wien, die Reservierungen und die Beträge. Hinter den Daten steht kein echtes Hotel und kein echter Gast. Die Kanzlei kann damit die Ausgabe prüfen, bevor jemand etwas einrichtet.

| Datei | Was sie ist |
|---|---|
| [`BMD_Buchungsimport_20260901-20260930_BSP.csv`](BMD_Buchungsimport_20260901-20260930_BSP.csv) | Der BMD-Buchungsimport für September 2026 im Dialekt NTCS: 26 Buchungen aus 31 apaleo-Zeilen. Beherbergung und Speisen mit 10 %, Getränke mit 20 % und Kostenstelle 20, eine Erlösminderung, Ortstaxe, Karten- und Barzahlungen, eine Rechnung an eine Firma auf den Sammeldebitor, zwei Anzahlungen und ihre Auflösung, eine Überzahlung mit Erstattung und ein Forderungsverlust mit USt-Berichtigung. |
| [`BMD_Buchungsimport_20260901-20260930_BSP.protokoll.txt`](BMD_Buchungsimport_20260901-20260930_BSP.protokoll.txt) | Das Protokoll, das daneben geschrieben wird: der Block „Import into BMD“ zum Vergleich mit dem Mandanten, Summen pro BMD-Konto, Erlöse, Anzahlungen und Forderungsverluste mit ihrer USt pro Satz, Ortstaxe, Zahlungen, Anzahlungen, Sammeldebitor, übersprungene Zeilen, Befunde und Prüfsummen. |
| [`mapping-BSP.example.csv`](mapping-BSP.example.csv) | Die Kontenzuordnung nach dem Einheitskontenrahmen (EKR), aus der die Datei entstanden ist: genau das, was `init-mapping --template ekr` für dieses Hotel schreibt, plus zwei Entscheidungen der Kanzlei. Die Ortstaxe ist eine Verbindlichkeit gegenüber der Stadt Wien auf `3580`, und die Getränke tragen die Kostenstelle `20`. |

**Öffne die BMD-Datei nicht in Excel und speichere sie dort nicht.** Sie ist in Windows-1252 kodiert, mit `;` als Trennzeichen und CRLF am Zeilenende, genau so, wie BMD sie importiert, und Excel ändert das alles. Zum Ansehen nimm einen Texteditor, oder öffne sie in Excel, ohne zu speichern. Eine Kanzlei kann sie in einen Testmandanten mit dem Buchungssymbol `HO` importieren ([bmd-import.md](../bmd-import.md)).

## Die Spalten der BMD-Datei

Die erste Zeile nennt die Felder, jede weitere ist eine Buchung. Als Beispiel die zweite Buchung, eine Übernachtung:

```
0;4000;2390;090100002;14.09.2026;14.09.2026;HO;2;10;1;-89,09;-8,91;Erlös Logis 10 %;;BSP-ABCDEF-1-V1;E;A
```

| Spalte | Beispiel | Bedeutung |
|---|---|---|
| `satzart` | `0` | Immer 0: eine Buchung der Finanzbuchhaltung. |
| `konto` | `4000` | Das führende Konto. Bei Erlösen, Anzahlungen und Forderungsverlusten ist es das Konto mit Steuercode, sonst das Konto, das im Soll steht (Kassa, Schwebende Geldbewegungen, Sammeldebitor). |
| `gkonto` | `2390` | Das Gegenkonto, hier die Verrechnung der Gastforderungen. |
| `belegnr` | `090100002` | Monat und Tag des ersten Tags der Datei (`0901`) und ein fünfstelliger Zähler. So wiederholen sich die Belegnummern eines Hotels innerhalb eines Wirtschaftsjahres zwischen seinen Dateien nicht. |
| `belegdatum`, `buchdatum` | `14.09.2026` | Der Geschäftstag in apaleo, in beiden Feldern. BMD ordnet die Buchung damit der Periode zu. |
| `buchsymbol` | `HO` | Das Buchungssymbol aus `bmd.buchsymbol`, das die Kanzlei in BMD angelegt hat. |
| `buchcode` | `2` | 1 Soll, 2 Haben, aus Sicht von `konto`. Folgt dem Vorzeichen von `betrag`. |
| `prozent` | `10` | Der USt-Satz, leer bei Buchungen ohne Steuer (Zahlungen, Ortstaxe, Umbuchungen). |
| `steuercode` | `1` | Der Steuercode aus der Kontenzuordnung, in NTCS 1 für Umsatzsteuer. |
| `betrag` | `-89,09` | Der Nettobetrag mit Dezimalkomma, negativ im Haben. |
| `steuer` | `-8,91` | Die Steuer aus apaleo, mit demselben Vorzeichen. BMD bucht sie auf sein Steuerkonto; das Gegenkonto bekommt Betrag plus Steuer, hier 98,00. |
| `text` | `Erlös Logis 10 %` | Der Buchungstext, höchstens 40 Zeichen. Eine Demodatei setzt `DEMO ` davor. |
| `kost` | | Die Kostenstelle aus der Kontenzuordnung, hier nur bei den Getränken (`20`). |
| `extbelegnr` | `BSP-ABCDEF-1-V1` | Die Belegnummer aus apaleo (Rechnung, Folio oder Zahlungsreferenz), bei einer Rechnung an eine Firma die OP-Nummer. |
| `gegenbuchkz`, `verbuchkz` | `E`, `A` | Immer diese beiden Werte: BMD erzeugt die Gegenbuchung auf `gkonto` und die Steuerbuchung selbst. Die Datei enthält deshalb keine Zeilen für Steuerkonten, und eine Zeile ist eine vollständige Buchung. |

Was jedes Feld genau erlaubt und woher die Regeln kommen, steht in [bmd-format.md](../bmd-format.md).

## Selbst erzeugen

Die BMD-Datei und das Protokoll sind das, was ein normaler Export der Demodaten in `examples/demo/` schreibt; ein Test schlägt fehl, sobald sie von dem abweichen, was der aktuelle Code schreibt, und ein weiterer prüft, dass die Kontenzuordnung der Ausgabe von `init-mapping` bis auf die zwei Entscheidungen gleicht. So erzeugst du die Datei selbst, ohne apaleo:

```sh
apaleo-bmd export --month 2026-09 --demo
```

Die Demo schreibt nach `./demo-output/` und markiert ihre Ausgabe mit `DEMO`: im Dateinamen (`…_BSP_DEMO.csv`), am Anfang jedes Buchungstexts und in der ersten Zeile des Protokolls. Sonst ist ihre Datei gleich wie die hier.
