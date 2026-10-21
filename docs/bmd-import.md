# Import in BMD

Für die Kanzlei: So kommt die Datei in BMD NTCS, und darauf solltest du beim ersten Import achten. Keine Gewähr, keine Steuerberatung. Was in der Datei steht und warum, beschreibt [bmd-format.md](bmd-format.md).

Die Datei folgt dem dokumentierten BMD-Importformat (PR08/PR08A, dvo); ein erster Testimport mit einer Kanzlei steht noch aus. Mach den ersten Import deshalb in einem Testmandanten oder in die Vorerfassung, und schick uns das Ergebnis (siehe unten).

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

Die Bezeichnungen in BMD NTCS hängen von Version, Modulen und Benutzerrechten ab. Laut der Importanleitung eines anderen Anbieters für BMD NTCS ([Moss-Hilfe](https://help.getmoss.com/en/articles/11645801-exporting-and-importing-moss-transactions-to-bmd-ntcs), abgerufen 2026-10-21) gibt es zwei Wege:

- **Direkt in die Buchhaltung**: **Buchen > Buchungen importieren**, dann den Mandanten wählen, die Datei auswählen, die Buchungsperiode festlegen und importieren.
- **In die Vorerfassung** (mit dem Zusatzmodul Vorerfassung): eine passende Vorerfassung anlegen, dann **Menü > Extras > Buchungen importieren**. Die Buchungen stehen dann zuerst in der Vorerfassung; die Kanzlei sieht sie durch, korrigiert sie bei Bedarf und verbucht sie erst danach ins Journal. Für den ersten Import ist das der sichere Weg.

Beide Wege lesen den Buchungsimport im variablen Format (Satzart 0 mit Kopfzeile), den das Tool schreibt. So gehst du vor:

1. Kopiere die Datei unverändert in einen Ordner, den BMD lesen kann.
2. Wähle in BMD den richtigen Mandanten und einen der beiden Wege oben.
3. Vergleiche vor dem Einlesen den Block **Import into BMD** im Protokoll des Tools mit dem Mandanten: Dialekt, Buchungssymbole, Bereich der Belegnummern, `verbuchkz A` und `gegenbuchkz E`, Steuercodes mit ihren Sätzen und die Längen der Sach- und Personenkonten.
4. Lies die Datei ein und prüfe das **Importprotokoll** von BMD: keine abgelehnten Zeilen, die Anzahl der Buchungen entspricht der Zeile `Lines` im Protokoll des Tools.
5. Vergleiche die Summen pro Konto und die Umsatzsteuer pro Satz mit dem Protokoll und mit den Berichten in apaleo (Checkliste unten).

## Periode und Datum

Belegdatum und Buchungsdatum jeder Zeile sind der Geschäftstag in apaleo (`TT.MM.JJJJ`, bei `bmd55` `JJJJMMTT`). Die Datei hat kein Feld `periode`: BMD ordnet jede Buchung über ihr Datum der Periode des Monats zu, auch für die UVA. Eine Datei bleibt immer in einem Kalendermonat. Damit der Import klappt:

- Das Wirtschaftsjahr des Monats ist im Mandanten angelegt, und die Periode ist nicht abgeschlossen. Ein abweichendes Wirtschaftsjahr (Saisonbetrieb) braucht keine Einstellung im Tool; die Belegnummern bleiben auch dann eindeutig ([bmd-format.md](bmd-format.md#belegnummer)).
- Fragt der Import nach der Buchungsperiode, nimm den Monat der Datei. Der Dateiname nennt den ersten und letzten Tag (`BMD_Buchungsimport_20261001-20261031_…`).
- Ein Monat ist erst nach dem Tagesabschluss (Night Audit) des Folgetags vollständig; `schedule --once` wartet deshalb bis `schedule.finalAfter` am zweiten Tag nach dem Monatsende.

## Vier Regeln

- **Nie in Excel öffnen und speichern.** Excel ändert Zeichensatz, Trennzeichen, Datumsformate und führende Nullen; BMD lehnt die Datei dann ab oder bucht falsch. Zum Ansehen nimm einen Texteditor oder das Protokoll.
- **Nie eine Demodatei importieren.** `export --demo` schreibt erfundene Daten: Der Dateiname endet auf `_DEMO`, jeder Buchungstext beginnt mit `DEMO ` und das Protokoll mit der Zeile `DEMO`. Ist doch eine Demobuchung im Mandanten gelandet, findest du sie am Buchungstext.
- **Nie umbenennen.** Der Name zeigt Zeitraum und Hotel, und das Tool erkennt seine eigenen Dateien daran.
- **Nie zweimal importieren.** BMD erkennt eine schon importierte Datei nicht: Dieselben Buchungen stünden doppelt im Mandanten. Das Tool schreibt einen Monat nur einmal. Kommt später eine Nachbuchung, lehnt es den Monat mit `E-FILE-EXISTS` ab. Hat die Kanzlei die alte Datei importiert, löscht sie zuerst die importierten Buchungen dieser Datei in BMD (Buchungssymbol und Belegnummern stehen im Protokoll der alten Datei); danach schreibt `export --overwrite` die neue Datei.

```sh
apaleo-bmd export --month 2026-10 --dry-run      # was hat sich geändert?
apaleo-bmd export --month 2026-10 --overwrite    # erst nachdem die Buchungen der alten Datei in BMD entfernt sind
```

## Erster Import: bitte prüfen

Mach den ersten Import mit deiner Kanzlei in einem Testmandanten, in die Vorerfassung oder mit einer Datei, die sie danach wieder löscht. Vergleiche das Ergebnis mit dem Protokoll des Tools:

- [ ] BMD liest die Datei ohne Formatfehler: Zeichensatz, Kopfzeile, Dialekt und Datumsformat stimmen, und das Importprotokoll lehnt keine Zeile ab.
- [ ] Das Buchungssymbol nimmt alle Konten an, auch die Anzahlungen und die Ortstaxe.
- [ ] Die Saldenliste des Monats zeigt pro Konto dieselben Summen wie „Totals per BMD account“ im Protokoll.
- [ ] Die UVA-Vorschau zeigt die Umsatzsteuer pro Satz wie das Protokoll: Erlöse mit Steuercode 1 in KZ 022 (20 %), KZ 029 (10 %) und KZ 006 (13 %), und nichts in KZ 062 (Vorsteuer-Berichtigung).
- [ ] Anzahlungen erscheinen in KZ 000/022/029/006 (KZ 022 für 20 %, 029 für 10 %, 006 für 13 %; in der UVA-Vorschau unter „+ Anzahlungen“), und ihre Auflösung bucht die USt wieder zurück.
- [ ] Die USt-Berichtigung bei Forderungsverlust erscheint als Minderung der Umsatzsteuer (KZ 022/029/006 oder KZ 090), nicht als Vorsteuer.
- [ ] Das Konto, das die Kanzlei für die Ortstaxe gewählt hat (Beispiel `3580`), die Erlöskonten mit 0 % (`4090`, `4091`) und die Konten ohne USt für Anzahlungen (`3209`) und Forderungsverlust (`7809`) haben im Kontenplan keinen fixen Steuercode, den BMD in das leere Feld eintragen würde.
- [ ] Eine Zahlung landet auf Schwebende Geldbewegungen ohne Steuer, eine Rechnung an eine Firma auf dem Sammeldebitor mit der Rechnungsnummer als OP-Nummer.
- [ ] BMD meldet keine Belegnummern-Duplikate unter dem Buchungssymbol, auch nicht mit einer zweiten Datei eines anderen Monats.
- [ ] Umlaute, ß und € sind im Buchungstext lesbar.

Die vollständige Liste mit den offenen Fragen steht in [bmd-format.md](bmd-format.md#checkliste-für-den-ersten-testimport). Schick uns das Ergebnis gern als Issue (BMD-Version, Dialekt, was ging und was nicht, ohne Namen und Beträge); der Maintainer trägt es unter [Testimporte](maintainers.md#testimporte) ein.
