# Fehlerbehebung: alle Befund-Codes

Jede Prüfung des Tools meldet einen Befund mit einem Code. Der Anfang des Codes sagt, wie ernst er ist:

- `E-` ist ein Fehler. Er stoppt das Hotel und den Monat, zu dem er gehört: Dafür wird keine Datei geschrieben. Andere Hotels und Monate laufen weiter.
- `W-` ist eine Warnung. Die Datei wird geschrieben; lies die Warnung und entscheide, ob etwas korrigiert werden muss.
- `N-` ist ein Hinweis. Es ist nichts falsch; er sagt dir, was passiert ist.

Die Codes sind dieselben in `export`, `export --dry-run`, `mapping check`, `init-mapping` und `schedule --once`, in der Protokolldatei und in der Ausgabe von Cron oder `docker logs`. Die Tests prüfen, dass diese Seite jeden Code aus dem Quellcode aufführt, und nur diese.

Meldungen nennen apaleo-Konten mit Nummer und Typ, nie mit Namen, überall dort, wo ein Gästename stehen könnte. Wenn du in einem Issue um Hilfe bittest, kannst du Code und Meldung einfügen, entferne aber vorher alle Namen.

Keine Gewähr, keine Steuerberatung: Wenn eine Lösung die Kontenzuordnung ändert, lass sie von deiner Steuerberatung bestätigen.

## Zeitraum und Hotel

| Code | Ursache | Lösung |
|---|---|---|
| `E-DAY-NOT-CLOSED` | Der Zeitraum reicht bis heute (oder später) in der Zeitzone des Hotels. apaleo hat diesen Tag noch nicht mit dem Tagesabschluss (Night Audit) geschlossen, Buchungen können sich also noch ändern. | Exportiere höchstens bis gestern, besser bis vorgestern. |
| `W-RECENT-DAY` | Der Zeitraum endet gestern. Der Tagesabschluss ist vielleicht noch nicht gelaufen, spätere Buchungen für diesen Tag sind also möglich. | Exportiere lieber nur bis vorgestern. Kommt eine Nachbuchung, siehe `E-FILE-EXISTS`. |
| `N-NOT-FINAL` | Nur bei `schedule --once`: Der Zeitraum ist fällig, aber sein letzter Tag ist noch nicht abgeschlossen (siehe `schedule.finalAfter` in [docker.md](docker.md)). Es wurde nichts abgerufen und nichts geschrieben. | Nichts zu tun. Der erste geplante Lauf nach dieser Uhrzeit exportiert ihn. |
| `E-PROPERTY-UNKNOWN` | Die Property-ID aus der Konfiguration oder aus `--property` ist für die apaleo Custom App nicht sichtbar. | Lass dir mit `apaleo-bmd properties` die IDs anzeigen, die die App lesen darf. Prüfe die Hotel-Auswahl der Custom App in apaleo ([setup-apaleo.md](setup-apaleo.md)). |
| `E-CURRENCY` | Das Hotel oder eine Zeile im Buchungsjournal ist nicht in EUR. Eine Zeile des BMD-Buchungsimports hat kein Feld für die Währung: BMD bucht jeden Betrag in der Grundwährung des Mandanten (EUR), und das Tool rechnet nicht um. Für ein Hotel in einer anderen Währung liest das Tool das Buchungsjournal gar nicht erst. | Nicht unterstützt. Das Tool funktioniert nur für Hotels, die ihre Bücher in EUR führen. |
| `N-NO-BOOKINGS` | apaleo hat für den Zeitraum keine Buchungen, also wurde keine Datei geschrieben. | Nichts zu tun, außer du hast Buchungen erwartet: Dann prüfe die Property-ID und die Daten. |
| `W-BUCHSYMBOL-SHARED` | Zwei oder mehr Hotels der Konfiguration buchen unter demselben Buchungssymbol. Importiert die Kanzlei sie in einen BMD-Mandanten, wiederholen sich ihre Belegnummern, denn BMD prüft sie je Buchungssymbol. `doctor` und das Protokoll melden das. | Gib jedem Hotel ein eigenes Symbol (`properties[].buchsymbol`), das die Kanzlei in BMD anlegt, oder einen eigenen Mandanten; siehe [bmd-import.md](bmd-import.md). |

## Kontenzuordnung

Diese Befunde kommen aus `mapping check`, `init-mapping` und jedem Export, denn der liest zuerst die Kontenzuordnung. Spalten und Regeln: [mapping-guide.md](mapping-guide.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-UNMAPPED` | Ein im Zeitraum gebuchtes apaleo-Konto hat keine Zeile mit BMD-Konto, oder seine Zeile lässt `bmd_account` leer. Die Zeilen für die Ortstaxe und für Stornogebühren oder No-Shows mit USt (zum Beispiel `RevenueNoShow_Reduced:13.00`) bleiben in der Vorlage absichtlich leer. Konten pro Reservierung oder Folio (zum Beispiel Anzahlungen unter `3000`) meldet der Befund einmal pro Elternkonto, Typ und Satz, mit bis zu drei Beispielen. | Folge der Meldung: Sie nennt die Zeile, in die `bmd_account` gehört, oder die `*`-Zeile, die du ergänzen sollst, zum Beispiel `*;Liabilities;;13;<BMD-Konto>;1;13` (Vorlage: 3202) oder `*;AccountsReceivable;;;200000` (Sammeldebitor). Eine leere Elternzeile wie `3000;Liabilities` füllst du nicht aus: Ein BMD-Konto kann nicht jeden Satz abdecken. Frag deine Steuerberatung, welches Konto. Dann starte `apaleo-bmd mapping check --property <id> --from <erster Tag> --to <letzter Tag>`. |
| `E-VAT-MISMATCH` | apaleo bucht das Konto mit einem USt-Satz, aber seine Zeile bucht einen anderen (`bmd_vat_percent`, ohne Steuercode 0 %), zum Beispiel ein Konto mit 10 %, das über die Zeile seines Elternkontos auf 4030 mit 20 % landet. | Gib dem Konto eine eigene Zeile mit einem BMD-Konto, dem Steuercode und dem Satz von apaleo. |
| `E-VAT-RATE-UNKNOWN` | Eine Auflösung einer Anzahlung kommt in apaleo ohne USt, und ihr Satz lässt sich weder aus einer `PostPrepaymentVat`-Zeile desselben Tages und derselben Reservierung noch aus dem Kontenplan ermitteln. Das Tool bucht eine solche Auflösung nie mit 0 %. | Starte `apaleo-bmd live-smoke` für diesen Tag und eröffne ein Issue mit der anonymisierten Ausgabe; siehe [posting-rules.md](posting-rules.md). |
| `E-VAT-PERCENT` | `apaleo_vat_percent` oder `bmd_vat_percent` ist keine Zahl. | Schreib eine einfache Zahl wie `10` oder `4,9`, oder lass das Feld leer. |
| `E-VAT-RATE-MISSING` | Eine Zeile hat einen Steuercode, aber keinen USt-Satz in `bmd_vat_percent`; im Export ist der Satz dann unbekannt. | Trag den Satz ein, mit dem BMD den Steuercode bucht, bei nicht steuerbaren Erlösen `0`. |
| `E-STEUERCODE-MISSING` | `bmd_vat_percent` ist größer als 0, aber der Steuercode ist leer. Ohne Steuercode bucht BMD keine Steuer. | Trag den Steuercode ein (in BMD NTCS `1` für die Umsatzsteuer). |
| `E-STEUERCODE-FORMAT` | Der Steuercode ist keine ganze Zahl von 0 bis 99. | Korrigiere den Steuercode. Frag deine Kanzlei, welchen Code BMD erwartet. |
| `E-STEUERCODE-INPUT-TAX` | Auf einer Zeile für Erlöse, Anzahlungen, Abgaben oder Forderungsverluste steht ein Vorsteuer-Code des Dialekts: in BMD NTCS `2` (Vorsteuer) oder `3` (Vorsteuer-Berichtigung), in BMD 5.5 `0`. Diese Umsätze schulden Umsatzsteuer. | Nimm den Umsatzsteuer-Code (NTCS `1`, BMD 5.5 `3`) und lass ihn von deiner Steuerberatung bestätigen. Prüfe auch `bmd.dialect`. |
| `E-STEUERCODE-NOT-ALLOWED` | Auf einer Zeile für Zahlungen (Payments), Gastforderungen (Receivables) oder Debitoren (AccountsReceivable) steht ein Steuercode. BMD würde die Steuer dann auf diesem Konto buchen, aus einem Verkauf würde eine Minderung der Umsatzsteuer. `mapping check` meldet die Zeile, der Export stoppt bei der ersten Buchung, die sie trifft. | Lass `steuercode` und `bmd_vat_percent` auf dieser Zeile leer und trag den Steuercode auf der Erlös- oder Anzahlungszeile ein. |
| `W-STEUERCODE-UNCHECKED` | Das Tool kennt den Steuercode nicht, zum Beispiel `81` für nicht steuerbare Umsätze. Es prüft nur die Umsatzsteuer-Codes des Dialekts. | Lass dir von der Kanzlei bestätigen, was BMD mit diesem Code bucht. |
| `W-UNTAXED-REVENUE` | Eine Erlöszeile hat keinen Steuercode, zum Beispiel `4090` oder die Stornoerlöse `4091` der Vorlage. BMD trägt einen Steuercode, der am Konto fix hinterlegt ist, in das leere Feld ein. | Prüfe, dass das BMD-Konto keinen fixen Steuercode hat, oder trag den Steuercode der Kanzlei für nicht steuerbare Umsätze ein. |
| `E-KOST-FORMAT` | Die Kostenstelle in `kost` hat nicht 1 bis 9 Ziffern. | Trag eine Kostenstelle aus Ziffern ein, oder lass das Feld leer. |
| `W-KOST-IGNORED` | Auf einer Zeile, die keine Erlös- oder Forderungsverlustzeile ist, steht eine Kostenstelle. Das Tool schreibt sie nie, denn auf einer Zahlung liest BMD `kost` als Belegnummer der bezahlten Rechnung. | Lass `kost` auf dieser Zeile leer. |
| `E-ACCOUNT-LENGTH` | Das BMD-Konto besteht nicht nur aus Ziffern oder hat nicht genau die Sachkontenlänge (`bmd.sachkontenlaenge`); eine Zeile vom Typ AccountsReceivable darf auch die Personenkontenlänge haben (`bmd.personenkontenlaenge`). | Schreib das Konto in der Länge der Kanzlei, zum Beispiel 28900 statt 2890 bei Sachkontenlänge 5. Vielleicht hat Excel führende Nullen entfernt; formatiere die Spalte als Text. |
| `W-PADDED` | Bei Sachkontenlänge 4 hat ein Konto der Klasse 0 seine führenden Nullen verloren (650 statt 0650), und das Tool hat sie ergänzt. | Formatiere die Spalte `bmd_account` in Excel als Text und speichere die Datei neu. |
| `W-UNKNOWN-TYPE` | `apaleo_type` ist keiner der Kontotypen von apaleo. | Korrigiere die Schreibweise (`Revenues`, `Payments`, `Liabilities`, ...). |
| `W-UNKNOWN-COLUMN` | Die Datei hat eine Spalte, die das Tool nicht nutzt. Sie wird ignoriert. | Nichts, außer du hast einen Spaltennamen falsch geschrieben. |
| `N-VAT-ROW-IGNORED` | Die Datei hat Zeilen für die apaleo-Konten `Vat` oder `VatOnLiabilities`. Diese Buchungen werden immer übersprungen, weil BMD die Steuer aus der Erlös- oder Anzahlungsbuchung bucht. | Nichts. Du kannst diese Zeilen löschen. |
| `N-TEMPLATE-SCALED` | `init-mapping` hat an die Konten der Vorlage Nullen angehängt, damit sie zu einer Sachkontenlänge über 4 passen (aus 2890 wird 28900). Der Sammeldebitor 200000 bleibt. | Nichts. Prüfe mit der Kanzlei, dass das ihren Konten entspricht. |

Eine Zuordnung oder Konfiguration aus Deutschland erkennt das Tool und bricht ab; siehe [Einrichtung aus Deutschland übernommen](#einrichtung-aus-deutschland-übernommen).

## Buchungsregeln und Umsatzsteuer

BMD bekommt Nettobetrag und Steuer getrennt: Die Steuer ist die von apaleo, auf den Cent gerundet. Diese Prüfungen stellen sicher, dass BMD genau die USt bucht, die apaleo berechnet hat. Einzelheiten: [posting-rules.md](posting-rules.md).

| Code | Ursache | Lösung |
|---|---|---|
| `W-VAT-ROUNDING` | BMDs eigene Kontrolle der Buchung (Betrag mal Satz, auf den Cent gerundet) weicht um einen Cent von der Steuer ab, die apaleo berechnet hat. Die Buchung behält die Steuer von apaleo, und die Differenz geht in die Rundungssumme der Übersicht. Bei einer Anzahlung ohne USt-Betrag in apaleo: Die berechnete Steuer weicht um einen Cent von der `PostPrepaymentVat`-Zeile ab. | Nichts. |
| `E-VAT-AMOUNT` | Die Steuer einer Zeile weicht um mehr als einen Cent von BMDs Kontrolle oder von der `PostPrepaymentVat`-Zeile ab. | Eröffne ein Issue mit der anonymisierten Zeile. Mit einer korrekten Kontenzuordnung sollte das nicht passieren. |
| `E-VAT-RATE` | Der Satz von apaleo auf der Zeile weicht von dem Satz ab, den die zugeordnete Zeile mit ihrem Steuercode bucht. | Korrigiere die Zeile der Kontenzuordnung, die die Meldung nennt, oder nimm eine Kontenzuordnung für diesen Zeitraum. |
| `E-VAT-MISSING` | apaleo hat USt berechnet, aber keines der beiden zugeordneten Konten hat einen Steuercode, zum Beispiel ein besteuerter No-Show auf `4091` oder ein Forderungsverlust mit USt auf einer Zeile ohne Steuercode. | Ordne das Erlös-, Anzahlungs- oder Forderungsverlustkonto einer Zeile mit Steuercode und dem Satz von apaleo zu. Ist die USt von apaleo falsch (eine nicht steuerbare Stornogebühr), korrigiere sie in apaleo. |
| `E-VAT-UNEXPECTED` | apaleo hat keine USt berechnet, aber die zugeordnete Zeile bucht mit Steuercode einen Satz über 0 %. | Ordne das Konto einer Zeile ohne Steuercode zu, zum Beispiel 4090 für Erlöse ohne USt, oder einer Zeile mit dem Satz 0 %. |
| `E-VAT-MIXED` | Eine Zeile des Buchungsjournals hat mehr als einen USt-Satz. | Eröffne ein Issue mit der anonymisierten Zeile. |
| `E-VAT-SIGN` | USt und Bruttobetrag einer Zeile haben verschiedene Vorzeichen. | Eröffne ein Issue mit der anonymisierten Zeile. |
| `E-TWO-VAT-SIDES` | Beide Seiten einer Zeile sind Zeilen mit Steuercode zugeordnet, zum Beispiel eine Umbuchung zwischen zwei Erlöskonten. BMD rechnet die Steuer nur auf dem führenden Konto. | Eröffne ein Issue mit der anonymisierten Zeile; bis dahin buche sie in BMD von Hand, zum Beispiel über ein Verrechnungskonto. |
| `W-VAT-INFERRED` | Eine Auflösung einer Anzahlung ohne USt in apaleo hat ihren Satz aus dem Kontenplan bekommen, weil keine `PostPrepaymentVat`-Zeile gefunden wurde; die Steuer ist aus dem Bruttobetrag berechnet. | Prüfe die Auflösung im Protokoll. Teile bitte eine anonymisierte Ausgabe von `live-smoke`, damit sich die Regel bestätigen lässt. |

## Plausibilitätsprüfungen

Bevor eine Datei geschrieben wird, rechnet das Tool nach, was die Buchungen ergeben müssen. Diese Fehler bedeuten, dass das Tool selbst etwas falsch gemacht hat. Eröffne bitte ein Issue mit der anonymisierten Übersicht.

| Code | Ursache | Lösung |
|---|---|---|
| `E-CONSERVATION` | Nicht jede apaleo-Zeile ist gebucht oder übersprungen worden (nach Anzahl und Betrag ohne Vorzeichen). | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `E-ACCOUNT-BALANCE` | An einem Geschäftstag bewegt sich ein BMD-Konto in den Buchungen anders als die apaleo-Zeilen, die ihm zugeordnet sind (das Konto mit dem Betrag, das Gegenkonto mit Betrag plus Steuer). Das findet Fehler bei Soll/Haben und Vorzeichen. | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `E-VAT-TOTAL` | Pro USt-Satz weicht die Steuer der Buchungen um mehr als die gemeldeten Rundungsdifferenzen von der Summe der pro Zeile gerundeten Steuern von apaleo ab. Die Meldung nennt auch die genaue Summe von apaleo. Dass die Buchungen um ein paar Cent von dieser genauen Summe abweichen, ist allein nie dieser Fehler; das ist die Rundung pro Zeile (siehe [export.md](export.md)). | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `W-AGGREGATE-DIFF` | Nur bei `checks.aggregates: true`: Der Saldo (Soll minus Haben) eines Kontos in den Tagessummen von apaleo weicht vom Saldo der Zeilen des Buchungsjournals an diesem Tag ab. Die Meldung nennt beide Salden und die Grundlage (brutto, netto oder Steuer). Die Datei wird trotzdem geschrieben. | Vergleiche den Tag mit den Berichten in apaleo. Teile den anonymisierten Befund in einem Issue. |
| `E-AGGREGATE-CHECK` | Nur bei `checks.aggregates: true`: Die Tagessummen von apaleo ließen sich nicht lesen, weil die optionale Berechtigung fehlt oder apaleo nicht erreichbar war. | Gib der Custom App die Berechtigung `core.subledger_aggregate.create`, versuch es später noch einmal oder setze `checks.aggregates: false`. |

## Ausgabeordner und erneute Läufe

Einzelheiten: [export.md](export.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-FILE-EXISTS` | Im Ausgabeordner liegt schon eine Datei für denselben Zeitraum, und die neue Datei weicht in mindestens einem Byte ab: eine Nachbuchung in apaleo, eine geänderte Kontenzuordnung oder eine Einstellung, die jede Zeile ändert (`bmd.buchsymbol`, `bmd.dialect`). BMD würde beide Dateien buchen. | Hat die Kanzlei die alte Datei schon importiert, löscht sie zuerst die importierten Buchungen dieser Datei in BMD (Buchungssymbol und Bereich der Belegnummern stehen im Block „Import into BMD“ des alten Protokolls). Dann starte denselben Export noch einmal mit `--overwrite`; die alte Datei bleibt als `.replaced-<Zeitstempel>.csv` liegen. Siehe [export.md](export.md#noch-einmal-exportieren) und [bmd-import.md](bmd-import.md). |
| `E-PERIOD-OVERLAP` | Im Ordner liegt schon eine Datei für einen anderen Zeitraum, der einige derselben Tage abdeckt, zum Beispiel ein Monatsexport nach einem Teilexport. Die Meldung nennt die Datei. | Exportiere denselben Zeitraum wie die vorhandene Datei, oder verschiebe sie. Wurde sie importiert, löscht die Kanzlei zuerst ihre Buchungen in BMD. |
| `N-COMPANIONS-REPAIRED` | Die Datei war unverändert, aber ihr Protokoll oder ihr Eintrag in `manifest.json` fehlte oder war falsch (ein früherer Lauf wurde unterbrochen), und wurde neu geschrieben. | Nichts. |
| `E-EXPORT` | Ein Schritt des Exports ist fehlgeschlagen: Das Dateisystem hat das Schreiben verweigert (Rechte, volle Festplatte, schreibgeschützter Mount), ein anderer Lauf hielt die Sperre des Ordners, oder ein Problem mit der Kontenzuordnung oder mit apaleo hat den Monat gestoppt. Die Meldung sagt, was. | Folge dem Hinweis in der Meldung. Mit Docker braucht ein Ordner `./data`, der root gehört, `sudo chown -R 1000:1000 data`. Eine übrig gebliebene `.apaleo-bmd.lock` aus einem abgebrochenen Lauf darfst du löschen, wenn kein anderer Lauf aktiv ist. |

## BMD-Datei (Buchungsimport)

Der Writer für den BMD Buchungsimport prüft jedes Feld, bevor er eine Datei schreibt, und meldet alle Fehler auf einmal. Die Codes erscheinen im Export, im Protokoll und in `schedule --once`. Einzelheiten: [bmd-format.md](bmd-format.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-BMD-ACCOUNT` | Ein Konto oder Gegenkonto besteht nicht nur aus Ziffern, oder seine Länge ist weder die Sachkontenlänge noch die Personenkontenlänge. Die Meldung nennt die Buchung, das Konto und beide erlaubten Längen. | Korrigiere das Konto in der Kontenzuordnung. Konten werden nie aufgefüllt: Frag deine Kanzlei nach der Stelligkeit des Kontenplans. |
| `E-BMD-TAX-PERSONENKONTO` | Eine Buchung mit Steuercode hat ein Personenkonto als führendes Konto. Dann liest BMD den Betrag als brutto und übernimmt die Steuer nicht, die Buchung käme falsch an. | Bei Buchungen mit Steuer muss das Sachkonto (zum Beispiel das Erlöskonto) führen und das Personenkonto Gegenkonto sein. Prüf die Kontenzuordnung, sonst eröffne ein Issue. |
| `E-BMD-AMOUNT` | Ein Betrag ist 0 oder hat mehr als 13 Stellen vor dem Komma, oder eine Steuer hat mehr als 13 Stellen. | Eröffne ein Issue: Zeilen mit Betrag 0 werden normalerweise vor dem Schreiben übersprungen. |
| `E-BMD-STEUER-SIGN` | Bei einem Steuercode für Umsatzsteuer (NTCS: 1; BMD 5.5: 1 und 3) hat die Steuer ein anderes Vorzeichen als der Betrag. Umsatzsteuer steht im Haben mit Minus. | Eröffne ein Issue mit der Meldung (ohne Namen). |
| `E-BMD-RATE` | Der Steuersatz ist negativ, größer als 99,99 oder hat mehr als zwei Nachkommastellen. | Korrigiere den Steuersatz in der Kontenzuordnung, zum Beispiel `10`, `20` oder `4.9`. |
| `E-BMD-STEUERCODE` | Der Steuercode ist keine ganze Zahl von 0 bis 99. | Korrigiere den Steuercode in der Kontenzuordnung. Frag deine Kanzlei, welchen Code BMD für das Konto erwartet. |
| `E-BMD-SYMBOL` | Das Buchungssymbol hat nicht 1 bis 4 Zeichen (NTCS) oder 1 bis 2 Zeichen (BMD 5.5) aus `A-Z` und `0-9`. | Nimm das Symbol, das die Kanzlei in BMD für den PMS-Import angelegt hat, zum Beispiel `HO`, in Großbuchstaben. |
| `E-BMD-KOST` | Die Kostenstelle hat nicht 1 bis 9 Ziffern. BMD nimmt in `kost` nur Ziffern an. | Trag in der Kontenzuordnung eine Kostenstelle aus Ziffern ein, oder lass das Feld leer. |
| `E-BMD-DATE` | Das Datum einer Buchung ist ungültig oder liegt außerhalb des Zeitraums der Datei. | Eröffne ein Issue: Der Export liest nur Buchungen des Zeitraums. |
| `E-BMD-PERIOD` | Beginn oder Ende des Zeitraums ist kein gültiges Datum, oder der Zeitraum beginnt nach seinem letzten Tag. Die Meldung hat keine Buchungsnummer. | Prüf `--from` und `--to` (Format `JJJJ-MM-TT`, `--from` nicht nach `--to`). |
| `E-BMD-BELEGNR` | Eine Datei hätte mehr als 99.999 Buchungen. Die Belegnummer hat nur fünf Stellen für den Zähler. | Exportiere kürzere Zeiträume, zum Beispiel mit `--from` und `--to` je eine Woche. |
| `E-BMD-FILE-NAME` | Die Property-ID lässt sich nicht im Dateinamen verwenden (erlaubt sind nur Buchstaben, Ziffern, `_` und `-`). | Eröffne ein Issue mit der Property-ID (sie kommt aus apaleo). |
| `N-BMD-CHARSET` | Ein Zeichen außerhalb von Windows-1252 im Buchungstext wurde durch `?` ersetzt, oder aus der externen Belegnummer wurden Zeichen außerhalb von `A-Z a-z 0-9 - / . _` entfernt. | Nichts, außer der ersetzte Text ist wichtig. |
| `N-BMD-TRUNCATED` | Der Buchungstext wurde auf 40 Zeichen gekürzt oder die externe Belegnummer auf 35. | Nichts, außer der gekürzte Text ist wichtig. Über die Protokolldatei findest du die Buchung im PMS. |

## Einrichtung aus Deutschland übernommen

Dieses Tool baut auf apaleo-datev-export auf, das DATEV-Dateien für Deutschland schreibt. Diese Prüfungen fangen eine Einrichtung ab, die von dort oder aus einer DATEV-Kanzlei kopiert wurde, damit keine deutschen Konten, Schlüssel oder Sätze in BMD landen.

| Code | Ursache | Lösung |
|---|---|---|
| `W-VAT-RATE-UNUSUAL` | `bmd_vat_percent` ist kein österreichischer Satz (0, 4,9, 10, 13 oder 20 %), zum Beispiel 7 % aus einer deutschen Zuordnung. | Prüfe die Zeile. Österreichische Hotels buchen mit den Sätzen aus UStG § 10; siehe [mapping-guide.md](mapping-guide.md#steuersätze-in-österreich). |
| `E-EXPORT` (beim Lesen der Kontenzuordnung) | Die Kontenzuordnung hat die Spalten der DATEV-Zuordnung von apaleo-datev-export (`datev_account`, `bu_key`) oder ist der Mapping-Export eines DATEV-Connectors aus dem apaleo Store. `mapping check` und `init-mapping --update` brechen mit derselben Meldung ab. Die Datei hat DATEV-Konten und BU-Schlüssel statt BMD-Konten und Steuercodes. | Leg die Datei mit `apaleo-bmd init-mapping --property <id> --template ekr` neu an und übertrag die Kontonummern mit deiner Kanzlei; siehe [mapping-guide.md](mapping-guide.md#umstieg-von-einem-anderen-connector). |
| kein Code, jeder Befehl bricht ab | Die Konfigurationsdatei hat einen Abschnitt `datev` (aus der Konfiguration von apaleo-datev-export). | Ersetze ihn durch den Abschnitt `bmd` mit `bmd.buchsymbol`, `bmd.sachkontenlaenge`, `bmd.personenkontenlaenge` und `bmd.dialect`; siehe [configuration.md](configuration.md#bmd). |

## Häufige Fragen nach dem ersten Live-Test

**„the amount 12.5210084 is not a whole number of cents“.** Ältere Stände des Tools brachten diese Meldung, weil apaleo Netto- und Steuerbeträge mit bis zu acht Nachkommastellen schickt. Der aktuelle Stand behält sie genau; nur der Bruttobetrag muss ganze Cent sein. Schau, welches Feld die Meldung vor dem Doppelpunkt nennt:

- `netAmount` oder `taxes[…].amount`: Du nutzt eine alte Version. Hol die aktuelle (`git pull`, `pnpm install --frozen-lockfile`, `pnpm build`).
- `grossAmount`: Das ist auch in der aktuellen Version ein echter Fehler, ein Update hilft nicht. Eröffne ein Issue, wie die Meldung sagt, und lass Gastnamen weg.

**Die USt im Protokoll weicht um ein paar Cent von apaleo ab.** Jede Buchung trägt die Steuer ihrer apaleo-Zeile, auf den Cent gerundet; apaleo rechnet genau und rundet die Summe. Das Protokoll zeigt beide Werte und die Differenz; sie ist kein Fehler. Siehe [export.md](export.md).
