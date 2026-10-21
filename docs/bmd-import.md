# Import in BMD

Für die Kanzlei: So kommt die Datei in BMD NTCS, und darauf solltest du beim ersten Import achten. Keine Gewähr, keine Steuerberatung. Was in der Datei steht und warum, beschreibt [bmd-format.md](bmd-format.md).

## Was du bekommst

Pro Hotel und Monat eine Datei `BMD_Buchungsimport_<von>-<bis>_<Hotel>.csv` im variablen Format des BMD-Buchungsimports (Satzart 0, Kopfzeile mit Feldnamen, `;` als Trennzeichen, Windows-1252), daneben ein Protokoll `….protokoll.txt` mit den Summen pro Konto und USt-Satz und eine `manifest.json` mit Prüfsummen. Eine Beispieldatei mit Protokoll und Zuordnung liegt in [examples/](examples/).

Jede Zeile ist eine Buchung mit `verbuchkz` `A` und `gegenbuchkz` `E`: BMD erzeugt die Gegenbuchung und die Steuerbuchung selbst. Das Konto mit Steuercode steht vorn, mit Nettobetrag und der Steuer aus apaleo.

## Buchungssymbol anlegen

Das Tool schreibt kein `AR`. In NTCS hat das Symbol `AR` den Buchungstyp „Rechnung (umsatzrelevant)“ und Regeln für die erlaubten Kontenarten; die Passivkonten der Anzahlungen und der Ortstaxe lehnt es dann unter Umständen ab, und Zahlungen unter `AR` zählen als Rechnungen. Lege deshalb ein eigenes Buchungssymbol an und trag es in der Konfiguration ein (`bmd.buchsymbol`):

1. In BMD NTCS die Buchungssymbole öffnen und `AR` kopieren, zum Beispiel als `HO` (Hotel).
2. Beim neuen Symbol alle Kontenarten erlauben, die das Hotel bucht: Erlöse, Anzahlungen, Verbindlichkeiten (Ortstaxe), Forderungen, Kassa und Geldverkehr.
3. Die Kontrolle der Belegnummer je Buchungssymbol eingeschaltet lassen: Das Tool vergibt Belegnummern, die sich innerhalb eines Wirtschaftsjahres nicht wiederholen.
4. Optional ein zweites Symbol mit Buchungstyp Zahlung anlegen, zum Beispiel `HZ`, und als `bmd.buchsymbolZahlung` eintragen. Dann kommen Zahlungen (Zeilen ohne Steuer mit einem Zahlungskonto) unter dieses Symbol, alles andere unter `bmd.buchsymbol`.

Ein Symbol hat in NTCS höchstens 4 Zeichen, in BMD 5.5 höchstens 2 (`bmd.dialect: bmd55`).

## Ein Symbol oder ein Mandant pro Hotel

Bucht die Kanzlei mehrere Hotels in einen Mandanten, braucht jedes Hotel ein eigenes Buchungssymbol (`properties[].buchsymbol`), sonst wiederholen sich die Belegnummern: Zwei Dateien desselben Zeitraums beginnen beide mit `MMTT` und dem Zähler `00001`. `apaleo-bmd doctor` und das Protokoll warnen in diesem Fall mit `W-BUCHSYMBOL-SHARED`. Hat jedes Hotel einen eigenen Mandanten, reicht ein Symbol.

```yaml
bmd:
  buchsymbol: HO
properties:
  - id: BSP
  - id: BSP2
    buchsymbol: HO2
```

## Buchungen importieren

1. Kopiere die Datei unverändert in einen Ordner, den BMD lesen kann.
2. In BMD NTCS den Import von Buchungen (Erfassungsfile, Buchungsimport im variablen Format) öffnen und den richtigen Mandanten wählen. Die genaue Menüführung hängt von deiner Version ab.
3. Die Datei einlesen und das **Importprotokoll** prüfen: keine abgelehnten Zeilen, die Anzahl der Buchungen entspricht dem Protokoll des Tools.
4. Die Summen pro Konto und die Umsatzsteuer pro Satz mit dem Protokoll und mit den Berichten in apaleo vergleichen.

## Periode und Datum

Belegdatum und Buchungsdatum jeder Zeile sind der Geschäftstag in apaleo. BMD ordnet die Buchung damit der Periode des Monats zu, auch für die UVA. Eine Datei bleibt immer in einem Kalendermonat. Ein Monat ist erst nach dem Tagesabschluss (Night Audit) des Folgetags vollständig; `schedule --once` wartet deshalb bis `schedule.finalAfter` am zweiten Tag nach dem Monatsende.

## Drei Regeln

- **Nie in Excel öffnen und speichern.** Excel ändert Zeichensatz, Trennzeichen, Datumsformate und führende Nullen; BMD lehnt die Datei dann ab oder bucht falsch. Zum Ansehen nimm einen Texteditor oder das Protokoll.
- **Nie umbenennen.** Der Name zeigt Zeitraum und Hotel, und das Tool erkennt seine eigenen Dateien daran.
- **Nie zweimal importieren.** BMD erkennt eine schon importierte Datei nicht: Dieselben Buchungen stünden doppelt im Mandanten. Das Tool schreibt einen Monat nur einmal. Kommt später eine Nachbuchung, lehnt es den Monat mit `E-FILE-EXISTS` ab. Hat die Kanzlei die alte Datei importiert, löscht oder storniert sie deren Buchungen zuerst in BMD (sie tragen die Belegnummern der alten Datei unter ihrem Buchungssymbol); danach schreibt `export --overwrite` die neue Datei.

```sh
apaleo-bmd export --month 2026-10 --dry-run      # was hat sich geändert?
apaleo-bmd export --month 2026-10 --overwrite    # erst nachdem die Buchungen der alten Datei in BMD entfernt sind
```

## Erster Import: bitte prüfen

Mach den ersten Import mit deiner Kanzlei in einem Testmandanten oder mit einer Datei, die sie danach wieder löscht. Die vollständige Checkliste steht in [bmd-format.md](bmd-format.md#checkliste-für-den-ersten-testimport); die wichtigsten Punkte:

1. BMD liest die Datei ohne Formatfehler (Zeichensatz, Kopfzeile, Dialekt, Datumsformat).
2. Das Buchungssymbol nimmt alle Konten an, auch Anzahlungen und die Ortstaxe.
3. Eine Erlösbuchung zeigt Nettobetrag, Steuer und Steuercode wie im Protokoll, und die UVA zeigt die Umsatzsteuer bei den richtigen Kennzahlen (bei Anzahlungen unter „+ Anzahlungen“).
4. Eine Zahlung landet auf Schwebende Geldbewegungen ohne Steuer, eine Rechnung an eine Firma auf dem Sammeldebitor mit der Rechnungsnummer als OP-Nummer.
5. Erlöse ohne Steuercode bekommen keinen fixen Steuercode des Kontos.

Schick uns gern das Importprotokoll (ohne Namen und Beträge) als Issue, wenn etwas nicht passt.
