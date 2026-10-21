# Der Befehl export

`apaleo-bmd export` liest das apaleo-Buchungsjournal eines Zeitraums, bucht es mit deiner Kontenzuordnung und schreibt pro Hotel und Kalendermonat eine BMD-Datei (Buchungsimport) in den Ausgabeordner. Deine Kanzlei holt die Dateien dort ab (ein gemeinsamer Ordner, ein Cloud-Ordner, oder du schickst sie). Nichts wird irgendwohin hochgeladen.

Keine Gewähr, keine Steuerberatung: Lass deine Steuerberatung die Kontenzuordnung und die ersten Importe prüfen.

```sh
apaleo-bmd export --month 2026-10 --dry-run          # alles prüfen, Übersicht zeigen, nichts schreiben
apaleo-bmd export --month 2026-10                    # jedes Hotel aus der Konfiguration
apaleo-bmd export --month 2026-10 --property BSP     # ein Hotel
apaleo-bmd export --from 2026-09-25 --to 2026-10-05  # beide Tage eingeschlossen; zwei Dateien, eine pro Monat
apaleo-bmd export --month 2026-10 --overwrite        # nach einer Nachbuchung, siehe „Noch einmal exportieren“
```

Der Exit-Code ist 0, wenn jedes Hotel und jeder Monat geschrieben wurde oder schon aktuell war, 1, wenn einer davon fehlgeschlagen ist, und 2 bei falschem Aufruf (zum Beispiel ohne Zeitraum).

## Demo ohne apaleo

```sh
apaleo-bmd export --month 2026-09 --demo --dry-run   # die Übersicht für das erfundene Hotel Beispiel
apaleo-bmd export --month 2026-09 --demo             # die Datei, nur nach ./demo-output/
```

`--demo` lässt genau diese Verarbeitung auf den aufgezeichneten apaleo-Antworten in `examples/demo/` laufen: keine Konfigurationsdatei, kein Secret, kein Netz. Die Demodaten sind ein erfundenes „Hotel Beispiel“ in Wien mit Beherbergung zu 10 %, Getränken zu 20 %, Ortstaxe, Anzahlungen, einer Rechnung an eine Firma und einem Forderungsverlust, sodass jeder Abschnitt des Protokolls etwas zeigt. Die Uhr der Demo steht auf 2026-10-05, der September 2026 ist also abgeschlossen. Die Demo markiert ihre Ausgabe dreifach, denn eine BMD-Datei hat keine Bezeichnung: Der Dateiname endet auf `_DEMO` (`BMD_Buchungsimport_20260901-20260930_BSP_DEMO.csv`), jeder Buchungstext beginnt mit `DEMO ` (der Buchungstext bleibt samt `DEMO ` bei 40 Zeichen, vom eigentlichen Text bleiben 35), und die erste Zeile des Protokolls ist `DEMO`. Eine versehentlich importierte Demobuchung erkennst du in BMD also am Text. Importiere sie nie in einen echten Mandanten. Die Demo schreibt unterhalb des Arbeitsverzeichnisses; im Docker-Image ist das das nur lesbare `/config`, siehe deshalb [docker.md](docker.md#die-demo-im-image). `--config` lässt sich nicht mit `--demo` kombinieren, und die Umgebung ändert nicht, wohin die Demo schreibt.

## Einstellungen

```yaml
bmd:
  buchsymbol: HO        # das Buchungssymbol, das die Kanzlei in BMD angelegt hat
  sachkontenlaenge: 4
  personenkontenlaenge: 6
  dialect: ntcs         # oder bmd55
properties:
  - id: BSP
    mapping: ./mapping-BSP.csv
    buchsymbol: HO2     # optional, ersetzt bmd.buchsymbol für dieses Hotel
output:
  dir: ./exports
checks:
  aggregates: false     # zusätzliche Vollständigkeitsprüfung, siehe unten
```

## Welche Tage sich exportieren lassen

apaleo veröffentlicht nicht, ob der Tagesabschluss (Night Audit) einen Tag geschlossen hat. Das Tool nutzt deshalb Datumsregeln in der Zeitzone des Hotels:

- Einen Zeitraum, der bis heute (oder später) reicht, lehnt es mit `E-DAY-NOT-CLOSED` ab.
- Einen Zeitraum, der gestern endet, exportiert es mit der Warnung `W-RECENT-DAY`: Der Tagesabschluss ist vielleicht noch nicht gelaufen, spätere Buchungen für diesen Tag sind also möglich. Exportiere nach Möglichkeit nur bis vorgestern.

Ein Zeitraum wird an Monatsgrenzen geteilt, damit jede Datei in einem Kalendermonat bleibt. Die BMD-Datei hat keinen Kopfsatz mit Wirtschaftsjahr; BMD ordnet jede Buchung über ihr Datum der Periode zu.

## Was vor dem Schreiben geprüft wird

Für jedes Hotel und jeden Monat, in dieser Reihenfolge:

1. Das Hotel und jede apaleo-Zeile des Monats sind in EUR (`E-CURRENCY`). Eine Zeile des BMD-Buchungsimports hat kein Feld für die Währung: BMD bucht jeden Betrag in der Grundwährung des Mandanten (EUR), und das Tool rechnet nicht um. Ein Hotel in CHF oder einer anderen Währung wird deshalb abgelehnt, bevor das Buchungsjournal gelesen wird.
2. Die Kontenzuordnung lässt sich lesen; eine Kontenzuordnung aus einer deutschen Einrichtung lehnt das Tool ab (`E-EXPORT`, siehe [troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-übernommen)).
3. Jedes im Zeitraum gebuchte Konto ist zugeordnet (`E-UNMAPPED`, `E-VAT-MISMATCH`, `E-VAT-RATE-UNKNOWN`, wie bei `mapping check --from --to`).
4. Die Buchungsregeln und ihre USt-Prüfung pro Zeile ([posting-rules.md](posting-rules.md)).
5. Plausibilitätsprüfungen auf dem Ergebnis, die nachrechnen, was die Buchungen ergeben müssen:
   - `E-CONSERVATION`: Jede apaleo-Zeile ist gebucht oder übersprungen, nach Anzahl und Betrag ohne Vorzeichen.
   - `E-ACCOUNT-BALANCE`: Pro Geschäftstag und BMD-Konto bewegen die Buchungen das Konto genau so wie die apaleo-Zeilen, die ihm zugeordnet sind: das führende Konto (`konto`) mit dem Betrag, das Gegenkonto (`gkonto`) mit Betrag plus Steuer, also dem Bruttobetrag aus apaleo. Die Steuerbuchung auf BMDs eigenem Steuerkonto zählt hier nicht mit. Das findet Fehler bei Soll/Haben und Vorzeichen.
   - `E-VAT-TOTAL`: Pro USt-Satz entspricht die Steuer der Buchungen der Summe der Steuerbeträge von apaleo, jeder pro Zeile auf Cent gerundet, mit höchstens einem Cent pro gemeldeter Rundungsdifferenz einer berechneten Anzahlungssteuer bei diesem Satz. Da jede Buchung die Steuer ihrer apaleo-Zeile trägt, passt das normalerweise auf den Cent. Die Meldung nennt auch die genaue Summe von apaleo und die Rundungsdifferenz der Zeilen. Dass die Steuer der Buchungen um ein paar Cent von der genauen Summe von apaleo abweicht, ist allein nie ein Fehler (siehe unten).
6. Optional (`checks.aggregates: true`): die Tagessummen von apaleo, eine Anfrage pro Geschäftstag, gegen die Zeilen des Buchungsjournals an diesem Tag. Verglichen wird pro Konto, das apaleo listet, der **Saldo** (Soll minus Haben): globale Konten wie Zahlungsarten, Erlös- und USt-Unterkonten für sich, Gast-, externe und Buchungskonten über ihr oberstes Elternkonto (`1200`, `3000`, `9999`); Erlöse und Anzahlungen mit dem genauen Nettobetrag, die USt-Konten von apaleo mit den genauen Steuern der Erlös- und Anzahlungszeilen, alle anderen Konten brutto. So passten im ersten Live-Test alle Konten. Ein Konto, dessen Saldo abweicht, ergibt die Warnung `W-AGGREGATE-DIFF` mit beiden Salden und der Grundlage (brutto, netto oder Steuer); die Datei wird trotzdem geschrieben. Dafür braucht es die optionale Berechtigung `core.subledger_aggregate.create`; ohne sie scheitert der Monat mit `E-AGGREGATE-CHECK` und einem Hinweis, sie zu vergeben. Ist apaleo nicht erreichbar oder antwortet mit einem anderen Fehler, scheitert der Monat ebenfalls mit `E-AGGREGATE-CHECK`; starte ihn später noch einmal. Standardmäßig aus: Die Regel stammt aus einer Sandbox und zwei Tagen und ist für Produktivkonten noch nicht bestätigt.

Jeder Befund mit `E-` stoppt dieses Hotel und diesen Monat: Dafür wird keine Datei geschrieben, und die anderen Hotels und Monate laufen weiter. Warnungen (`W-`) werden ausgegeben und im Protokoll festgehalten.

Ein Monat ohne Buchungen schreibt keine Datei (`N-NO-BOOKINGS`).

### USt im Protokoll: pro Zeile gerundet, apaleo genau

Das Protokoll und der Probelauf zeigen pro USt-Satz, für die Erlöse, die Anzahlungen und die Forderungsverluste, Netto, Steuer und Brutto der Buchungen, daneben die USt von apaleo und die Differenz (USt von apaleo minus Steuer der Buchungen), zum Beispiel am Live-Tag VIE:

```
Revenue and VAT per rate:
  10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)
  13 %: net 362.85, tax 47.17, gross 410.02, apaleo VAT 47.17, difference 0.00 (apaleo precise 47.17044248)
```

Jede Buchung trägt die Steuer ihrer apaleo-Zeile, auf den Cent gerundet; apaleo hält die Steuer jeder Zeile genau (bis zu acht Nachkommastellen) und rundet erst die Summe. Die Differenz von ein paar Cent ist diese Rundung, kein Fehler, und kein Grund, Buchungen zu ändern. In der UVA zählt, was BMD gebucht hat.

BMD kontrolliert beim Import jede Buchung selbst (Betrag mal Satz, auf den Cent gerundet). Weicht das um einen Cent von der Steuer aus apaleo ab, meldet der Export `W-VAT-ROUNDING`, und die Buchung behält die Steuer von apaleo; am Live-Tag VIE ist das eine Zeile (46,80 brutto zu 10 %: Steuer 4,25, BMDs Kontrolle 4,26).

## Ausgabeordner

```
exports/
  BSP/
    2026-10/
      BMD_Buchungsimport_20261001-20261031_BSP.csv
      BMD_Buchungsimport_20261001-20261031_BSP.protokoll.txt
      manifest.json
```

Pro Hotel ein Ordner mit seiner apaleo-ID, darin pro Kalendermonat ein Ordner `JJJJ-MM`. Der Dateiname nennt den ersten und den letzten Tag und das Hotel; das Tool erkennt seine Dateien an diesem Namen. Ein Beispiel für alle drei Dateien liegt in [examples/](examples/).

- Die BMD-Datei ist das, was die Kanzlei importiert ([bmd-import.md](bmd-import.md)). Benenne sie nicht um, und öffne und speichere sie nicht in Excel.
- Das Protokoll beginnt mit dem Hinweis „keine Gewähr“, dem Hotel, dem Zeitraum und der Zahl der apaleo-Zeilen und Buchungen. Dann folgt der Block **Import into BMD**, den die Kanzlei vor dem Import mit ihrem Mandanten vergleicht: Dateiname, Zahl der Zeilen, Dialekt, jedes verwendete Buchungssymbol, der Bereich der Belegnummern, `verbuchkz A` und `gegenbuchkz E`, jeder Steuercode mit seinen Sätzen und die Längen der Sach- und Personenkonten. Danach kommen die Summen: pro BMD-Konto, Erlöse, Anzahlungen und Forderungsverluste mit ihrer USt pro Satz, Ortstaxe, Zahlungen pro Konto, erhaltene, aufgelöste und erstattete Anzahlungen, Sammeldebitor, übersprungene Zeilen (mit Beträgen ohne Vorzeichen) und die Befunde. Am Ende stehen die SHA-256-Prüfsumme der Datei, die der Kontenzuordnung, die Version des Tools und die Erstellungszeit. Der Probelauf zeigt denselben Text ohne die Prüfsummen.
- `manifest.json` listet jede Datei des Ordners, auch ersetzte, mit:
  - `sha256`: die Prüfsumme der ganzen Datei. Die BMD-Datei hat keine Erstellungszeit, dieselben Buchungen ergeben also immer dieselbe Prüfsumme;
  - `bookings`: die Zahl der Buchungen;
  - `sollTotal` und `habenTotal`: die Summen, die das Journal in BMD nach dem Import zeigt. BMD bucht aus jeder Zeile das Konto, das Gegenkonto und die Steuer, deshalb sind beide gleich, nämlich die Summe der Bruttobeträge;
  - `taxByRate`: die Steuer der Buchungen pro USt-Satz in Cent, als geschuldete USt (eine Erlösminderung oder ein Forderungsverlust mindert sie), zum Abgleich mit der UVA;
  - `mappingSha256`, `toolVersion` und `createdAt`: die Prüfsumme der Kontenzuordnung, die Version des Tools und die Erstellungszeit; bei einer ersetzten Datei zusätzlich `replacedAt` und `replacedBy`.

  Felder, die das Tool nicht kennt (zum Beispiel `bodySha256` aus einer früheren Version), stören nicht: Es liest sie nicht und lässt sie stehen.

## Noch einmal exportieren

BMD erkennt eine schon importierte Datei nicht wieder: Dieselben Buchungen zweimal zu importieren, bucht sie zweimal. Der Export nutzt deshalb den Ausgabeordner als Gedächtnis:

- Dieselbe Datei wie die im Ordner (Byte für Byte): `unchanged`, nichts wird geschrieben, Exit-Code 0. Denselben Monat noch einmal zu exportieren, ist also immer sicher.
- Ein anderer Inhalt, und sei es nur ein Byte: abgelehnt mit `E-FILE-EXISTS`. Das passiert nach einer Nachbuchung in apaleo, einer geänderten Kontenzuordnung oder einer geänderten Einstellung, die jede Zeile ändert (`bmd.buchsymbol`, `bmd.dialect`). Hat die Kanzlei die alte Datei schon importiert, muss sie zuerst die importierten Buchungen dieser Datei in BMD löschen; Buchungssymbol und Bereich der Belegnummern stehen im Protokoll der alten Datei. Dann starte den Export noch einmal mit `--overwrite` ([bmd-import.md](bmd-import.md)). Mit `--overwrite` bleibt die alte Datei als `<name>.replaced-<Zeitstempel>.csv` erhalten (ihr Protokoll ebenso), die neue Datei wird geschrieben, und das Manifest verzeichnet beide.
- Ein anderer Zeitraum, der einige derselben Tage abdeckt wie eine Datei im Ordner (zum Beispiel ein Monatsexport nach einem Teilexport vom 20. bis 30.): abgelehnt mit `E-PERIOD-OVERLAP`, und die Meldung nennt die vorhandene Datei, weil der Import beider Dateien diese Tage doppelt buchen würde. Exportiere denselben Zeitraum wie die vorhandene Datei, oder verschiebe sie zuerst, und lass die Kanzlei ihre Buchungen in BMD löschen, falls sie importiert wurde.

Der Vergleich liest die Datei selbst, er funktioniert also auch, wenn `manifest.json` gelöscht wurde. Ist die Datei unverändert, aber ihr Protokoll oder ihr Eintrag im Manifest fehlt oder beschreibt eine andere Datei (zum Beispiel weil `manifest.json` gelöscht oder ein Lauf nach dem Schreiben der CSV-Datei unterbrochen wurde), schreibt der Lauf beides neu und meldet den Hinweis `N-COMPANIONS-REPAIRED`; die CSV-Datei selbst bleibt unberührt.

Während ein Lauf in einen Ordner für Hotel und Monat schreibt, hält er dort die Sperrdatei `.apaleo-bmd.lock` und prüft noch einmal, dass die Datei auf der Festplatte noch die ist, die er verglichen hat. Ein zweiter Lauf, der gleichzeitig startet, scheitert für diesen Monat mit `E-EXPORT` und schreibt nichts; starte ihn noch einmal, wenn der erste fertig ist. Wurde ein Lauf beim Schreiben abgebrochen, kann die Sperrdatei übrig bleiben: Wenn kein anderer Lauf aktiv ist, lösch sie und starte noch einmal.
