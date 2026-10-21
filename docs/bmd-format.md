# BMD Buchungsimport: was der Writer macht und warum

Diese Seite hält fest, was `src/bmd` schreibt, gegen welche Quellen es geprüft wurde und welche Fragen erst der erste Testimport in einer Kanzlei beantwortet. Sie ist für Mitwirkende und für die Steuerberatung oder Buchhaltung, die den ersten Import in BMD NTCS macht.

Zuletzt geprüft: **2026-10-21**.

Keine Gewähr, keine Steuerberatung: BMD veröffentlicht keine aktuelle Spezifikation des Buchungsimports, und eine BMD-Installation stand nicht zur Verfügung. Der Writer folgt dem, worin die Quellen unten übereinstimmen: Die Datei folgt dem dokumentierten BMD-Importformat (PR08/PR08A, dvo); ein erster Testimport mit einer Kanzlei steht noch aus. Ob BMD NTCS die Datei ohne Nacharbeit liest, bestätigt erst dieser Testimport, festgehalten unter [Testimporte](maintainers.md#testimporte). Lass deine Kontenzuordnung von deiner Steuerberatung prüfen.

## Geprüfte Quellen

| Quelle | Was verwendet wurde | Datum |
|---|---|---|
| BMD, [PR08 / PR08A - Verbuchen Erfassungsfile](https://www.simplesoft.at/BMD_Hilfe_Wiki/BMD_5_5/pr08_pr08a_Beschreibung.pdf), FIBU-BASIS 5.B4, 30.10.2015 | Satzart 0, variable Satzlänge mit Kopfzeile, Feldnamen der BMD 5.5, `bucod`, `steucod`, Vorzeichenregel, Splittbuchungen, `verbuchkz` A | gelesen 2026-10-21 |
| S. Wenninger, [BMD HOW2 - Import von Buchungen und Personenkonten](https://www.simplesoft.at/BMD_Hilfe_Wiki/BMD_5_5/Import_Buchungen_und_Personenkonten.pdf), 12.10.2010 | Erlöskonto als führendes Konto, Vorzeichen statt Buchungscode, `kost` bei Zahlungen | gelesen 2026-10-21 |
| [Das Buchenprogramm in NTCS](https://www.simplesoft.at/BMD_Hilfe_Wiki/BUCHHALTUNG/NTCS_BUCHEN.pdf) | Feldnamen der NTCS, Steuercodes (S. 5, S. 38), Buchungssymbole und Belegnummernkontrolle (S. 37 bis 44), UVA-Kennzahlen in Anhang A (S. 107 und 108) | gelesen 2026-10-21 |
| dvo Software, [Handbuch BuErf-Import Fibu](https://www.dvo.at/PDF/ReleaseNotes/Handbuch%20BuErf%20Import%20Fibu%20(BMD%20BuErf-Modul)_07092021.pdf), 13.09.2021 | Steuercodes in §9, Feldlängen (`text` 40, `extbelegnr` 35, `prozent` zwei Stellen), CR als Satzende | gelesen 2026-10-21 |
| EDV Hausleitner, [Schnittstelle BMD FIBU01](https://www.edv-hausleitner.at/fileadmin/FIBU01_SchnittstelleBMD.pdf) | Splittbuchungen bei gleicher Belegnummer | gelesen 2026-10-21 |
| Gegenprüfung (nur gelesen, kein Code übernommen): [heliumv/ejb](https://github.com/heliumv/ejb) `FibuExportFormatterBMD` (AGPL), [funkring/fdoo](https://github.com/funkring/fdoo) `at_bmd`, [tgassner/TdTools](https://github.com/tgassner/TdTools) | Codes der BMD 5.5, Umsetzung von 5.5 nach NTCS (Feldnamen, `TT.MM.JJJJ`, Vorsteuer 0 wird 2) | gelesen 2026-10-21 |

Die Planungsnotizen mit allen Fundstellen stehen in `openspec/research/bmd-target.md`.

## Was der Writer erzeugt

- Zeile 1: die Kopfzeile mit den 17 Spaltennamen des Dialekts, getrennt durch `;`.
- Eine Zeile pro Buchung mit genau 17 Feldern in der Reihenfolge der Kopfzeile. Kein Feld steht in Anführungszeichen.
- Windows-1252 (CP1252), ohne Byte-Order-Mark, CRLF nach jeder Zeile, auch nach der letzten.
- Dateiname `BMD_Buchungsimport_<JJJJMMTT>-<JJJJMMTT>_<Property-ID>.csv` mit dem ersten und letzten Tag des Zeitraums. Die Datei enthält keine Erstellungszeit: Dieselben Buchungen ergeben immer dieselben Bytes, und ein erneuter Lauf erkennt eine unveränderte Datei am Byte-Vergleich.

Ein Beispiel mit dem Dialekt `ntcs`:

```text
satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz
0;4010;2390;100100001;14.10.2026;14.10.2026;HO;2;10;1;-100,00;-10,00;Erlös Beherbergung;;BSP-2026-0042;E;A
0;2890;2390;100100002;14.10.2026;14.10.2026;HO;1;;;120,00;;Kartenzahlung Visa;;BSP-2026-0042;E;A
```

## Dialekte: NTCS und BMD 5.5

Kopfzeile, Datumsformat und die Bedeutung der Steuercodes gehören zusammen. Ein Schalter wählt alle drei, damit eine Datei sie nie mischt. Standard ist `ntcs`; `bmd55` ist für Kanzleien, die noch mit BMD 5.5 importieren. In der Konfiguration heißt der Schalter `bmd.dialect`.

| | `ntcs` (Standard) | `bmd55` |
|---|---|---|
| Kopfzeile | `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz` | `satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz` |
| Datum | `TT.MM.JJJJ` | `JJJJMMTT` |
| Steuercodes für Umsatzsteuer | `1` | `1` (Ist-USt) und `3` (Soll-USt) |
| Länge des Buchungssymbols | 1 bis 4 Zeichen | 1 bis 2 Zeichen |

Für jeden Dialekt gibt es eigene Golden Files in `test/golden/bmd/`.

## Felder

| Feld (NTCS) | Was der Writer schreibt |
|---|---|
| `satzart` | immer `0` (Buchungssatz der Finanzbuchhaltung) |
| `konto` | das führende Konto, nur Ziffern, genau Sachkontenlänge oder Personenkontenlänge. Bei Erlösen ist das Erlöskonto führend, denn nur am Konto kann BMD entsteuern |
| `gkonto` | das Gegenkonto, dieselben Regeln |
| `belegnr` | die Belegnummer, 9 Ziffern (siehe unten) |
| `belegdatum`, `buchdatum` | beide der Geschäftstag der Buchung. Er entscheidet über Buchungsperiode und UVA-Zeitraum |
| `buchsymbol` | das Buchungssymbol, `A-Z` und `0-9`. Leg in BMD ein eigenes Symbol für den PMS-Import an (zum Beispiel `HO`) |
| `buchcode` | `1` bei positivem Betrag (Soll), `2` bei negativem (Haben) |
| `prozent`, `steuercode`, `steuer` | nur wenn die Buchung einen Steuercode hat, sonst leer |
| `betrag` | Betrag des führenden Kontos, bei Erlösen netto. Ein Personenkonto als führendes Konto würde BMD brutto lesen und die Steuer nicht übernehmen; darum lehnt der Writer eine Buchung mit Steuercode und führendem Personenkonto ab (`E-BMD-TAX-PERSONENKONTO`) |
| `text` | Buchungstext, höchstens 40 Zeichen |
| `kost` | Kostenstelle, 1 bis 9 Ziffern, oder leer |
| `extbelegnr` | die Rechnungs- oder Zahlungsreferenz aus dem PMS, höchstens 35 Zeichen |
| `gegenbuchkz`, `verbuchkz` | immer `E` und `A`: BMD erzeugt die Gegenbuchung und die Steuerbuchung selbst. Die Datei enthält deshalb nie Zeilen für Steuerkonten, und eine Zeile ist eine vollständige Buchung |

## Vorzeichen und Beträge

Der Betrag hat das Vorzeichen aus Sicht von `konto`: Soll ohne Vorzeichen, Haben mit führendem Minus. Für BMD zählt nur dieses Vorzeichen; der Buchungscode steuert nur das S oder H im Journal. Beträge werden mit Dezimalkomma, zwei Nachkommastellen und ohne Tausendertrennzeichen geschrieben (`-1000,00`), mit höchstens 13 Stellen vor dem Komma.

Bei einem Steuercode für Umsatzsteuer (`ntcs`: 1; `bmd55`: 1 und 3) hat `steuer` dasselbe Vorzeichen wie `betrag` oder ist 0: Umsatzsteuer steht im Haben mit Minus. Sonst meldet der Writer `E-BMD-STEUER-SIGN`.

Der Steuersatz in `prozent` ist eine ganze Zahl oder hat eine oder zwei Nachkommastellen mit Komma: `10`, `20`, `13`, `4,9`, `0`. Achtung: dvo erlaubt in `prozent` nur zwei Ziffern, `4,9` ist dort also nicht sicher. Der Satz von 4,9 % gilt seit 2026-07-01 für Lieferungen bestimmter Grundnahrungsmittel und betrifft ein Hotel selten.

## Steuercodes

| Code | `ntcs` | `bmd55` |
|---|---|---|
| `1` | Umsatzsteuer (Soll- oder Istversteuerung stellt die Kanzlei im Firmenstamm ein, nicht pro Buchung) | Ist-Umsatzsteuer |
| `2` | Vorsteuer | – |
| `3` | Vorsteuer-Berichtigung, nicht abzugsfähig gemäß § 12 Abs. 3 UStG (UVA KZ 062) | Soll-Umsatzsteuer |
| `0` | – | Vorsteuer oder keine Steuer |

Quellen: NTCS_BUCHEN S. 5 und S. 38, Anhang A S. 107 („KZ 022 / 029: USt-Steuercode 1“) und S. 108 („KZ 062: USt-Steuercode 3“); dvo BuErf §9 (1 Umsatzsteuer, 2 Vorsteuer, 3 Berichtigung der Vorsteuer); PR08 S. 11 für BMD 5.5. Mit den Codes der BMD 5.5 in NTCS würden alle Erlöse in die Vorsteuer-Berichtigung (KZ 062) laufen. Darum wählt der Dialekt auch die Codes.

Für Erlöse ohne Steuer nennt dvo §9 eigene Codes (zum Beispiel 81 „Umsatz nicht steuerbar“). Der Writer schreibt jeden Code von 0 bis 99, den die Kontenzuordnung vorgibt; ob BMD NTCS ihn so annimmt, steht auf der Checkliste.

## Belegnummer

BMD erlaubt in `belegnr` höchstens 9 Ziffern. Folgen zwei Zeilen mit gleichem Konto, gleicher Belegnummer und gleichem Belegdatum aufeinander, fasst BMD sie zu einer Splittbuchung zusammen. Außerdem prüft NTCS standardmäßig, dass jede Belegnummer pro Buchungssymbol nur einmal vorkommt.

Der Writer nummeriert die Buchungen einer Datei deshalb in Dateireihenfolge: Monat und Tag des ersten Tags des Zeitraums (`MMTT`), dann ein fünfstelliger Zähler ab `00001`. Die erste Buchung einer Datei ab 1. Oktober ist `100100001`, die einer Tagesdatei vom 14. Oktober `101400001`. Dateien eines Hotels überschneiden sich nie (`E-PERIOD-OVERLAP`), haben also nie denselben ersten Tag, und `MMTT` wiederholt sich erst nach zwölf Monaten. So bleiben die Nummern in jedem Wirtschaftsjahr eindeutig, auch in einem abweichenden Wirtschaftsjahr eines Saisonbetriebs. Eine Datei hält höchstens 99.999 Buchungen (`E-BMD-BELEGNR`).

Zwei Hotels, die in denselben BMD-Mandanten buchen, brauchen verschiedene Buchungssymbole, sonst wiederholen sich ihre Belegnummern. Die Referenz aus dem PMS (Rechnungs- oder Zahlungsnummer) steht in `extbelegnr`, bereinigt auf `A-Z a-z 0-9 - / . _`.

## Kostenstelle

`kost` hat in BMD zwei Bedeutungen: an Erlös- und Aufwandszeilen die Kostenstelle, an Zahlungen die Belegnummer der bezahlten Rechnung. Der Writer prüft nur das Format (1 bis 9 Ziffern, sonst `E-BMD-KOST`). Wann eine Zeile eine Kostenstelle bekommt, entscheiden die Buchungsregeln: nur an Erlös- und Forderungsverlustzeilen ([posting-rules.md](posting-rules.md#felder)).

## Texte bereinigen

- In `text` und `extbelegnr` werden `;`, `"`, Tabulatoren, Zeilenumbrüche und andere Steuerzeichen zu Leerzeichen, mehrere Leerzeichen zu einem, und Leerzeichen am Anfang und Ende fallen weg. Ein Strichpunkt im Text kann die Zeile also nie zerteilen.
- In `text` wird jedes Zeichen außerhalb von Windows-1252 zu `?` (Hinweis `N-BMD-CHARSET`). Umlaute, ß und € bleiben, auch wenn sie zerlegt ankommen.
- In `extbelegnr` fällt jedes Zeichen außerhalb von `A-Z a-z 0-9 - / . _` weg, auch Leerzeichen (Hinweis `N-BMD-CHARSET`).
- `text` wird auf 40 Zeichen gekürzt, `extbelegnr` auf 35 (Hinweis `N-BMD-TRUNCATED`).

Jeder Hinweis nennt die Nummer der Buchung, das Feld und den ursprünglichen Wert.

## Prüfungen

Bevor der Writer etwas schreibt, prüft er jede Buchung und meldet alle Fehler auf einmal. Gibt es einen, schreibt er nichts. Die Codes und was du tun kannst, stehen in [troubleshooting.md](troubleshooting.md#bmd-datei-buchungsimport).

## Offene Fragen

Jede Antwort ist eine Einstellung an einer Stelle, `src/bmd/format.ts` oder ein Konfigurationswert:

1. Dialekt: Feldnamen, Datum und Steuercodes der NTCS (Standard) oder der BMD 5.5?
2. Zeichensatz: Windows-1252 oder UTF-8 mit BOM?
3. Höchstlänge von `text` in der aktuellen NTCS (angenommen 40).
4. Nimmt das Buchungssymbol die Belegnummern aus `MMTT` und Zähler ohne Warnung wegen Duplikaten an?
5. Lehnt BMD NTCS eine `steuer` ab, die um einen Cent von `prozent` mal `betrag` abweicht? (Die Buchungsregeln halten Abweichungen bei höchstens einem Cent und melden sie als `W-VAT-ROUNDING`.)

## Checkliste für den ersten Testimport

Mach den ersten Import mit deiner Kanzlei in einem Testmandanten oder mit einer Datei, die sie danach wieder löscht:

- [ ] Der Dialekt stimmt: BMD erkennt alle Spalten der Kopfzeile, und Belegdatum und Buchungsdatum kommen richtig an.
- [ ] Die Saldenliste des Monats zeigt pro Konto dieselben Summen wie das Protokoll des Tools.
- [ ] Eine Erlösbuchung mit Steuercode 1 landet in der UVA-Vorschau in der Kennzahl ihres Steuersatzes (KZ 022 für 20 %, KZ 029 für 10 %, KZ 006 für 13 %), nicht in KZ 062.
- [ ] Unter dem Buchungssymbol gibt es keine Warnung wegen doppelter Belegnummern, auch nicht mit einer zweiten Datei desselben Monats.
- [ ] Die Konten für Erlöse mit 0 % und für die Ortstaxe haben im Kontenplan keinen fest hinterlegten Steuercode, den BMD bei leerem Feld anwenden würde: Konten 4090/4091, 3209 und 7809 und das Ortstaxe-Konto der Kanzlei (Beispiel 3580) haben keinen fixen Steuercode.
- [ ] Anzahlungen erscheinen in KZ 000/022/029/006 (KZ 022 für 20 %, 029 für 10 %, 006 für 13 %; in der UVA-Vorschau unter „+ Anzahlungen“), und ihre Auflösung bucht die USt wieder zurück.
- [ ] USt-Berichtigung bei Forderungsverlust erscheint als Minderung in KZ 022/029/006 (bzw. 090).
- [ ] BMD nimmt `4,9` in `prozent` an.
- [ ] Umlaute, ß und € sind im Buchungstext lesbar.
- [ ] BMD bucht die Gegenbuchung auf `gkonto` und die Steuer auf das Steuerkonto, ohne dass die Datei Steuerzeilen enthält.
