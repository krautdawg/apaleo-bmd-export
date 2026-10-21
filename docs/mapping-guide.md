# Kontenzuordnung (Mapping): Leitfaden für Hotel und Steuerberatung

Die BMD-Datei ist nur so gut wie die Kontenzuordnung. Sie ist eine CSV-Datei pro Hotel (Property), die du in Excel öffnest und mit deiner Kanzlei durchgehst. Sie ordnet jedem apaleo-Konto ein Sachkonto oder Personenkonto in BMD zu, dazu den Steuercode und den USt-Satz. **Keine Gewähr, keine Steuerberatung: Jede Zeile der Vorlage ist ein Vorschlag (ungeprüft), den die Kanzlei bestätigt.**

Ein vollständiges Beispiel liegt in [examples/mapping-BSP.example.csv](examples/mapping-BSP.example.csv): die Zuordnung des erfundenen „Hotel Beispiel“ nach dem Einheitskontenrahmen (EKR), aus der die Beispieldatei in [examples/](examples/) entstanden ist. Die Kanzlei kann damit die Ausgabe beurteilen, bevor jemand eine apaleo-App anlegt.

## Ablauf

```sh
apaleo-bmd init-mapping --property BSP --template ekr      # schreibt mapping-BSP.csv aus dem apaleo-Kontenplan
# Datei mit der Kanzlei prüfen, leere BMD-Konten ausfüllen
apaleo-bmd mapping check --property BSP                    # prüft die Datei
apaleo-bmd mapping check --property BSP --from 2026-09-01 --to 2026-09-30   # ist jedes gebuchte Konto zugeordnet?
apaleo-bmd init-mapping --property BSP --template ekr --update   # später: neue apaleo-Konten anhängen, bearbeitete Zeilen bleiben
```

Der Pfad der Datei kann in der Konfiguration stehen (`properties[].mapping`), sonst heißt sie `mapping-<id>.csv` im Arbeitsverzeichnis. `mapping check --from --to` liest das Buchungsjournal des Zeitraums aus apaleo und meldet jedes gebuchte Konto ohne Zuordnung; die Kanzlei kann die Datei also an einem echten Monat prüfen, bevor ein Export läuft. Die Vorlage richtet sich nach `bmd.sachkontenlaenge`, `bmd.personenkontenlaenge` und `bmd.dialect` aus der Konfiguration.

## Spalten

| Spalte | Bedeutung |
|---|---|
| `apaleo_account` | apaleo-Kontonummer, oder `*` für alle Konten eines Typs |
| `apaleo_type` | apaleo-Kontotyp (Revenues, Payments, Liabilities, Receivables, AccountsReceivable, CityTaxes, …) |
| `apaleo_name`, `apaleo_vat_percent` | zur Information, aus apaleo; bei `*`-Zeilen ist `apaleo_vat_percent` der USt-Satz, für den die Zeile gilt |
| `bmd_account` | Sachkonto oder Personenkonto in BMD. Leer heißt: nicht zugeordnet, der Export bricht mit `E-UNMAPPED` ab |
| `steuercode` | Steuercode in BMD. Leer heißt: keine Steuer auf dieser Zeile. In BMD NTCS ist `1` die Umsatzsteuer, siehe unten |
| `bmd_vat_percent` | USt-Satz, den BMD mit dem Steuercode bucht, zum Beispiel `10`, `13`, `20` oder `4,9`. Mit Steuercode Pflicht (auch `0`), ohne Steuercode leer oder `0` |
| `kost` | Kostenstelle, 1 bis 9 Ziffern (optional). Steht nur auf Erlös- und Forderungsverlust-Buchungen in der Datei, siehe unten |
| `comment` | Freitext, zum Beispiel die Begründung der Kanzlei |

USt-Sätze darfst du mit Komma oder Punkt schreiben (`4,9` oder `4.9`). Eine Kontenzuordnung aus einer deutschen Einrichtung (Spalten `datev_account`, `bu_key`) liest das Tool nicht; es nennt dann `init-mapping --template ekr` ([troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-übernommen)).

### Kontonummern, Sachkontenlänge und Personenkontenlänge

Ein Sachkonto hat genau die Sachkontenlänge der Kanzlei (`bmd.sachkontenlaenge`, im EKR 4 Stellen), ein Personenkonto (Debitor) genau die Personenkontenlänge (`bmd.personenkontenlaenge`, Standard 6). Nur Zeilen vom Typ AccountsReceivable dürfen ein Personenkonto nennen. Die Vorlage ist für Sachkontenlänge 4 geschrieben. Bei einer größeren Länge hängt `init-mapping` Nullen an (Hinweis `N-TEMPLATE-SCALED`): Bei Sachkontenlänge 5 wird aus 2890 also 28900; der Sammeldebitor 200000 richtet sich nach der Personenkontenlänge: Bei 6 Stellen bleibt er 200000, bei 5 wird er 20000, bei 7 wird er 2000000. Sind Personenkontenlänge und Sachkontenlänge gleich, lässt die Vorlage den Sammeldebitor leer, weil BMD Personen- und Sachkonto dann nicht an der Länge unterscheidet; trag dann das Personenkonto der Kanzlei ein. Prüfe mit der Kanzlei, dass das ihren Konten entspricht.

Excel entfernt führende Nullen: Formatiere die Spalte `bmd_account` als Text. Fehlen bei Sachkontenlänge 4 nur führende Nullen eines Kontos der Klasse 0 (650 statt 0650), ergänzt das Tool sie mit der Warnung `W-PADDED`; jede andere falsche Länge ist ein Fehler (`E-ACCOUNT-LENGTH`).

## Welche Zeile gilt?

Für jedes gebuchte apaleo-Konto sucht das Tool in dieser Reihenfolge:

1. genau diese Nummer und dieser Typ;
2. diese Nummer mit beliebigem Typ (Zeilen mit dem Typ `*any*`);
3. das Elternkonto (und dessen Eltern) mit gleichem Typ; eine Elternzeile ohne BMD-Konto überspringt es;
4. für Typen mit USt eine `*`-Zeile mit dem USt-Satz der Buchung;
5. für andere Typen eine `*`-Zeile des Typs.

Erlöskonten (Revenues) werden nie per `*` zugeordnet: Ein neues Erlöskonto (Spa, Parken) ordnet ein Mensch zu. Konten je Reservierung (Anzahlungen unter `3000`, Debitoren unter `9999`, ihre `/Offset`-Konten) erreichen die `*`-Zeilen.

## Steuercode und USt-Satz

BMD bekommt Nettobetrag und Steuer getrennt: Das Konto mit Steuercode steht vorn (`konto`), der Betrag ist netto, die Steuer kommt genau so, wie apaleo sie für die Buchung berechnet hat. So bucht BMD in der UVA dieselbe Umsatzsteuer wie apaleo. Die Steuercodes hängen vom Dialekt ab (`bmd.dialect`):

| | BMD NTCS (`ntcs`, Standard) | BMD 5.5 (`bmd55`) |
|---|---|---|
| Umsatzsteuer, die die Vorlage schreibt | `1` | `3` (Soll-USt; `1` ist Ist-USt) |
| Codes, die auf Erlösen, Anzahlungen, Abgaben und Forderungsverlusten nie stehen dürfen | `2` Vorsteuer, `3` Vorsteuer-Berichtigung | `0` Vorsteuer |

`mapping check` prüft jede Zeile:

- Ein Vorsteuer-Code auf einer Erlös-, Anzahlungs-, Abgaben- oder Forderungsverlustzeile ist ein Fehler (`E-STEUERCODE-INPUT-TAX`). Ein Steuercode, den das Tool nicht kennt (zum Beispiel `81` für nicht steuerbare Umsätze), ergibt `W-STEUERCODE-UNCHECKED`: Lass ihn von der Kanzlei bestätigen.
- Zahlungen (Payments), Gastforderungen (Receivables) und Debitoren (AccountsReceivable) haben nie einen Steuercode (`E-STEUERCODE-NOT-ALLOWED`): Sonst bucht BMD die Steuer auf das Geld- oder Forderungskonto, und aus einem Verkauf wird eine Minderung der Umsatzsteuer.
- Ein Steuercode braucht einen USt-Satz (`E-VAT-RATE-MISSING`), ein USt-Satz über 0 % einen Steuercode (`E-STEUERCODE-MISSING`). Ein Steuercode mit 0 % ist erlaubt.
- Ein Satz außer 0, 4,9, 10, 13 und 20 % ergibt `W-VAT-RATE-UNUSUAL`; das fängt zum Beispiel eine Zeile ab, die mit einem deutschen Satz aus einer anderen Zuordnung kopiert wurde.
- Der USt-Satz der Zeile muss dem Satz in apaleo entsprechen (`E-VAT-MISMATCH`), auch über eine Elternzeile: Landet ein Konto mit 10 % über `5000;Revenues;…;4030;1;20` auf 4030 mit 20 %, meldet `mapping check --from --to` `E-VAT-MISMATCH` und verlangt eine eigene Zeile.
- Eine Erlöszeile ohne Steuercode ergibt `W-UNTAXED-REVENUE`: BMD trägt einen Steuercode, der am Konto fix hinterlegt ist, in ein leeres Feld ein. Prüfe, dass das BMD-Konto keinen fixen Steuercode hat, oder trag den Steuercode der Kanzlei für nicht steuerbare Umsätze ein.

Beim Export prüft das Tool zusätzlich jede Buchung: Der Satz muss der Satz der apaleo-Buchung sein (`E-VAT-RATE`), und BMDs eigene Kontrolle (Betrag mal Satz) darf höchstens einen Cent von der Steuer abweichen (`W-VAT-ROUNDING`, die Buchung behält die Steuer aus apaleo). Mehr dazu in [posting-rules.md](posting-rules.md).

## Steuersätze in Österreich

Nach UStG 1994 § 10 (RIS, Fassung ab 2026-07-01). Das Tool bucht den Satz, den apaleo auf der Buchung hat; die Liste hilft dir und der Kanzlei, die Erlöskonten in apaleo richtig einzurichten.

- **Beherbergung**: 10 % (§ 10 Abs. 2 Z 3 lit. c), mit einem ortsüblichen Frühstück, das im Zimmerpreis enthalten ist.
- **Speisen**: 10 %, auch im Restaurant und beim Frühstück, das extra verrechnet wird.
- **13 %**: Eintritt in Schwimmbad und Therme und die Thermalbehandlung (§ 10 Abs. 3 Z 5), Eintritt zu Theater, Konzert und Museum (Z 6) und zu Sportveranstaltungen (Z 12). Die 13-%-Zeile der Vorlage (`4040`) deckt Schwimmbad und Therme ab.
- **Getränke**: 20 %, ebenso Massagen, Spa-Behandlungen, Parken und die meisten anderen Leistungen.
- **4,9 %**: seit 2026-07-01 nur für die Lieferung ausgewählter Grundnahrungsmittel (Anlage 3), nicht für Restaurations- oder Cateringumsätze.
- **5 %** galt von 1. Juli 2020 bis 31. Dezember 2021. apaleo legt diese Konten in jedem Kontenplan an; die Vorlage lässt sie leer, damit eine Buchung darauf den Export stoppt (`E-UNMAPPED`). Exporte für diesen Zeitraum klärst du mit der Kanzlei.

## Ortstaxe, Nächtigungsabgabe, Gästeabgaben

Die Zeilen für CityTaxes, SecondCityTax und GuestLevies bleiben in der Vorlage leer. Das ist Absicht: Name und Buchung hängen vom Bundesland und von der Gemeinde ab, und die Entscheidung trifft die Kanzlei.

In jedem Bundesland schuldet der Gast die Abgabe für seine Nächtigung, und das Hotel hebt sie ein und führt sie ab. Sie ist kein Erlös des Hotels. Die üblichen Namen (Stand 2026-10, ohne Gewähr; maßgeblich sind das Landesgesetz und die Verordnung deiner Gemeinde):

| Bundesland | üblicher Name | schuldet | hebt ein |
|---|---|---|---|
| Burgenland | Ortstaxe | Gast | Hotel |
| Kärnten | Ortstaxe, Nächtigungstaxe | Gast | Hotel |
| Niederösterreich | Nächtigungstaxe | Gast | Hotel |
| Oberösterreich | Ortstaxe | Gast | Hotel, abgeführt an die Gemeinde |
| Salzburg | Ortstaxe | Gast | Hotel |
| Steiermark | Nächtigungsabgabe | Gast | Hotel |
| Tirol | Aufenthaltsabgabe | Gast | Hotel, abgeführt an den Tourismusverband |
| Vorarlberg | Gästetaxe | Gast | Hotel |
| Wien | Ortstaxe | Gast | Hotel |

Nicht gemeint ist der Tourismusbeitrag (Interessentenbeitrag, in Oberösterreich die Tourismusabgabe nach dem Oö. Tourismusgesetz 2018), den das Hotel selbst schuldet: Den bucht apaleo nicht, und er ist kein durchlaufender Posten.

Zwei Möglichkeiten für die Zeile, beide ohne Steuercode:

- **(a) Verbindlichkeit** gegenüber der Gemeinde, dem Land oder dem Tourismusverband: EKR 350-359 (Abgaben) oder 370-389 (übrige sonstige Verbindlichkeiten). Die Beispielzuordnung nimmt `3580`.
- **(b) Durchlaufender Posten** nach dem Kontenplan der Kanzlei.

Das BMD-Konto darf keinen fixen Steuercode haben: Sonst trägt BMD ihn in das leere Feld ein, und die Abgabe landet in der UVA. Unterwirft apaleo eine Abgabe der USt, gehört sie auf ein Erlöskonto mit Steuercode und Satz; dann prüft die USt-Prüfung sie wie jeden Erlös.

Bis eine Zeile ausgefüllt ist, blockieren `mapping check --from --to` und der Export mit `E-UNMAPPED`. Die Beispielzuordnung bucht die Ortstaxe auf die Verbindlichkeit gegenüber der Gemeinde 3580 und sagt das im Kommentar.

## Anzahlungen

Anzahlungen der Gäste (Liabilities) gehen auf erhaltene Anzahlungen (EKR 320), je USt-Satz eine `*`-Zeile: 3200 (10 %), 3202 (13 %) und 3201 (20 %) mit dem Umsatzsteuer-Code, 3209 (0 %) ohne. Auch Sollversteuerer schulden die USt auf eine Anzahlung schon bei Erhalt (Mindest-Istbesteuerung, § 19 Abs. 2 Z 1 lit. a UStG). In BMD NTCS ist das die normale Umsatzsteuer mit Steuercode `1`: Die UVA zählt sie in KZ 000/022/029/006 unter „+ Anzahlungen“ (BMD NTCS Buchen, Anhang A). Ob Soll- oder Istversteuerung, steht im Firmen- und FIBU-Stamm, nicht auf der Buchung. Wird die Anzahlung mit der Rechnung verrechnet, bucht apaleo eine negative Belastung auf dieselbe Anzahlung, und das Tool bucht die USt dort wieder zurück; eine Rückzahlung an den Gast (eine negative Anzahlung) ebenso.

BMD NTCS kennt zwei Einrichtungen (BMD NTCS Buchen, Anhang C):

1. **USt direkt am Anzahlungskonto** (Vorschlag der Vorlage): Das Konto 3200, 3202 oder 3201 bekommt den Steuercode `1` und den Satz, BMD bucht die USt bei Erhalt.
2. **Anzahlungskonto der Kanzlei je Steuersatz** (im Anhang C zum Beispiel 3290 und 3292) mit einem Konto für noch nicht fällige USt (dort 3510): Dann trägst du die Anzahlungskonten der Kanzlei und ihren Steuercode in die `*`-Zeilen ein.

Jeder Umsatzsteuer-Code des Dialekts geht durch. Ein Vorsteuer-Code (`2` oder `3` in NTCS) auf einer Anzahlungszeile ist ein Fehler (`E-STEUERCODE-INPUT-TAX`): In NTCS ist `3` die Vorsteuer-Berichtigung (KZ 062), nicht die Soll-USt von BMD 5.5. Welche Einrichtung gilt, bestätigt der erste Testimport mit der Kanzlei. apaleos eigene USt-Konten (Vat, VatOnLiabilities) brauchen keine Zuordnung: Diese Buchungen überspringt das Tool, denn BMD bucht die Steuer aus dem Feld `steuer` der Erlös- oder Anzahlungsbuchung.

Wird eine Anzahlung verrechnet, ohne dass apaleo dabei einen USt-Betrag mitschickt, nimmt das Tool Satz und Steuer aus der `PostPrepaymentVat`-Buchung desselben Tages und derselben Reservierung, sonst den Satz aus dem Kontenplan (Warnung `W-VAT-INFERRED`), nie 0 %. Lässt sich kein Satz finden, stoppt es mit `E-VAT-RATE-UNKNOWN`.

## Forderungsverlust

Schreibt das Hotel eine Gastforderung ab, bucht apaleo den Forderungsverlust (LossOfAccountsReceivable) gegen die Gastforderung, mit der USt, wenn es die USt berichtigt (§ 16 Abs. 3 UStG). Die Vorlage ordnet Forderungsverluste nach USt-Satz zu, mit `*`-Zeilen:

- `7800` (10 %), `7802` (13 %) und `7801` (20 %) mit dem Umsatzsteuer-Code (NTCS `1`) und dem Satz,
- `7809` (0 %) ohne Steuercode.

Mit dem Umsatzsteuer-Code steht das Forderungsverlust-Konto vorn (`konto`), Betrag und Steuer sind positiv: eine Soll-Buchung auf das USt-Konto, die die Umsatzsteuer mindert, wie eine Gutschrift an einen Kunden. In der UVA sollte die Berichtigung als Minderung in KZ 022/029/006 (oder KZ 090) erscheinen; das prüft der erste Import (Checkliste in [bmd-format.md](bmd-format.md)). Ein Vorsteuer-Code auf dieser Zeile ist ein Fehler (`E-STEUERCODE-INPUT-TAX`).

Warum `*`-Zeilen: apaleo bucht Forderungsverluste wohl auf Konten je Reservierung unter den Containern `6900` und `CollectiveDebitor_LossOfAccountsReceivable`, wie bei den Debitoren. Belegt ist das noch nicht, denn keine aufgezeichnete Buchung enthält einen Forderungsverlust. Die `*`-Zeilen greifen nach Typ und Satz, egal unter welchem Container das Konto hängt; für die Container selbst schreibt die Vorlage keine Zeile. Bucht apaleo direkt auf einen Container, stoppt der Export mit `E-UNMAPPED`.

## Stornogebühr und No-Show

Eine Stornogebühr ist meist echter Schadenersatz und nicht steuerbar; ein No-Show kann steuerbar sein (die Leistung stand bereit). Das entscheidet nicht dieses Tool: Es bucht die USt, die apaleo auf der Buchung hat, und prüft nur, ob die Zeile dazu passt.

- **Ohne USt** (apaleos Konten `RevenueCancellationFees…` und `RevenueNoShow…` mit 0 %, oder ein Erlöskonto, dessen Name Storno, Stornogebühr, Cancellation, No-Show oder Noshow enthält): Die Vorlage schlägt `4091` Stornoerlöse (nicht steuerbar) ohne Steuercode vor. Wie bei `4090` gilt `W-UNTAXED-REVENUE`, bis die Kanzlei bestätigt, dass das Konto in BMD keinen fixen Steuercode hat, oder ihren Steuercode für nicht steuerbare Umsätze einträgt.
- **Mit USt** (zum Beispiel apaleos `RevenueNoShow_Reduced:13.00`): Die Vorlage lässt die Zeile leer, mit dem Kommentar „No-Show kann steuerbar sein, Stornogebühr meist nicht“, auch dort, wo sonst die 13-%- oder 20-%-Regel greifen würde. Ist die USt richtig, trägst du ein Erlöskonto mit Umsatzsteuer-Code und dem Satz von apaleo ein; sonst korrigierst du die USt in apaleo. Bis dahin stoppen `mapping check --from --to` und der Export mit `E-UNMAPPED`.

Hat apaleo eine Gebühr besteuert, die Zeile aber keinen Steuercode, stoppt der Export mit `E-VAT-MISSING`: Das Tool ändert die USt von apaleo nie.

## Zahlungen, Forderungen, Debitoren

- **Bar**: Kassa 2700.
- **Karte, Überweisung und andere unbare Zahlungen**: Schwebende Geldbewegungen 2890, nie direkt das Bankkonto. Die Kanzlei bucht den Kontoauszug oder die Abrechnung des Zahlungsdienstleisters gegen dieses Konto. Gebühren der Zahlungsdienstleister bucht dieses Tool nicht.
- **Gast-, externe und Buchungsfolios (Receivables)**: Verrechnung Gastforderungen 2390. Folios mit Gästenamen erscheinen nie mit Namen im Buchungstext.
- **Rechnungen an Firmen (AccountsReceivable)**: ein Sammeldebitor, das Personenkonto 200000. Lege ihn im Mandanten an. Die Rechnungsnummer steht als OP-Nummer in `extbelegnr`. Einzelne Debitoren pro Firma (mit Stammdaten) erzeugt das Tool nicht.

## Kostenstellen

BMD liest das Feld `kost` auf Erlös- und Aufwandsbuchungen als Kostenstelle, auf einer Zahlung aber als Belegnummer der Rechnung, die die Zahlung ausgleicht. Das Tool schreibt `kost` deshalb nur, wenn das führende Konto eine Erlös- oder Forderungsverlustzeile ist. Steht `kost` auf einer anderen Zeile, warnt `mapping check` mit `W-KOST-IGNORED`; eine Kostenstelle, die nicht aus 1 bis 9 Ziffern besteht, ist ein Fehler (`E-KOST-FORMAT`).

## Die EKR-Vorlage

Die Vorlage steht in `templates/ekr-hotel.rules.csv` (Version `ekr-hotel@1`). Sie folgt den Gruppen des Einheitskontenrahmens (KFS/BW 6, 2017) mit vierstelligen Konten, wie BMD-Kanzleien sie oft einrichten. Die Nummern sind Vorschläge: Viele Kanzleien führen einen eigenen, vom EKR abgeleiteten Kontenplan. Jede Zeile trägt im Kommentar die Markierung „Vorschlag (ungeprüft)“.

| Fall | BMD-Konto | Steuercode (NTCS) | USt |
|---|---|---|---|
| Beherbergung 10 % | `4000` | 1 | 10 % |
| Speisen 10 % | `4010` | 1 | 10 % |
| Getränke 20 % | `4020` | 1 | 20 % |
| sonstige Erlöse 20 % | `4030` | 1 | 20 % |
| Erlöse 13 % | `4040` | 1 | 13 % |
| Erlöse 4,9 % | `4050` | 1 | 4,9 % |
| Erlöse ohne USt | `4090` | leer | 0 % |
| Stornogebühr und No-Show ohne USt | `4091` | leer | 0 % |
| Stornogebühr und No-Show mit USt | leer, Kanzlei entscheidet | | |
| Barzahlung | `2700` Kassa | | |
| Karte, Überweisung, andere unbare Zahlungen | `2890` Schwebende Geldbewegungen | | |
| Gast-, externe und Buchungsfolios | `2390` Verrechnung Gastforderungen | | |
| Rechnungen an Firmen (Sammeldebitor) | `200000` | | |
| Anzahlungen 10 % / 13 % / 20 % | `3200` / `3202` / `3201` | 1 | 10 / 13 / 20 % |
| Anzahlungen ohne USt | `3209` | leer | 0 % |
| Forderungsverlust 10 % / 13 % / 20 % | `7800` / `7802` / `7801` | 1 | 10 / 13 / 20 % |
| Forderungsverlust ohne USt | `7809` | leer | 0 % |

Mit `bmd.dialect: bmd55` schreibt die Vorlage auf denselben Zeilen den Steuercode 3. Für einen Container wie `3000` (Anzahlungen) oder `6900` (Forderungsverluste) schreibt sie keine Zeile, weil die `*`-Zeilen dessen Konten je Reservierung abdecken.

### Was die Kanzlei entscheiden muss

Diese Vorlagenzeilen lassen das BMD-Konto leer oder verlangen eine Entscheidung:

- **Ortstaxe, Nächtigungsabgabe, Gästeabgaben** (CityTaxes, SecondCityTax, GuestLevies): bleiben leer, siehe oben.
- **Erlöse zu 10 % ohne erkennbaren Namen** bleiben leer („weder Beherbergung noch Speisen“).
- **Erlöse ohne USt** auf 4090 und **Stornoerlöse** auf 4091: Hat das Konto in BMD einen fixen Steuercode, oder braucht es den Steuercode der Kanzlei für nicht steuerbare Umsätze?
- **Stornogebühr und No-Show mit USt** bleiben leer: Ist die USt von apaleo richtig?
- **Anzahlungen**: USt direkt am Anzahlungskonto oder das Anzahlungskonto der Kanzlei mit noch nicht fälliger USt?
- **Forderungsverluste** zu 4,9 % oder 5 % haben keine `*`-Zeile.
- **Erlöse und Anzahlungen zu 5 %**: bleiben leer, historischer Satz.
- **Hauskonten (House)** und **durchlaufende Posten aus apaleo (TransitoryItems)** haben noch keine Vorlage.
- **Vat, VatOnLiabilities**: brauchen kein Konto; diese Buchungen werden übersprungen.

## Umstieg von einem anderen Connector

Die Kontenzuordnung eines bezahlten Connectors lässt sich nicht einlesen: Jeder Anbieter hat eigene Spalten und eigene Bildschirme, und eine Zuordnung aus einer deutschen Einrichtung hat keine BMD-Konten und keine Steuercodes. Lege die Datei neu an und übertrag die Kontonummern aus der Zuordnung des alten Connectors mit deiner Kanzlei von Hand:

```sh
apaleo-bmd init-mapping --property BSP --template ekr
apaleo-bmd mapping check --property BSP --from 2026-09-01 --to 2026-09-30
```

## Checkliste zur Freigabe durch die Kanzlei

Bevor die erste Datei in BMD importiert wird:

- [ ] Buchungssymbol, Sachkontenlänge, Personenkontenlänge und Dialekt in der Konfiguration stimmen (`bmd.buchsymbol`, `bmd.sachkontenlaenge`, `bmd.personenkontenlaenge`, `bmd.dialect`), und das Buchungssymbol ist in BMD angelegt ([bmd-import.md](bmd-import.md)).
- [ ] Jede Zeile mit BMD-Konto ist geprüft; jede leere Zeile ist ausgefüllt oder bewusst leer (ein solches Konto darf dann nicht gebucht werden).
- [ ] Die Erlöskonten haben den Steuercode und den Satz, den apaleo bucht (Beherbergung und Speisen 10 %, Getränke 20 %), und auf keiner Erlös- oder Anzahlungszeile steht ein Vorsteuer-Code.
- [ ] Die Ortstaxe ist für die Gemeinde des Hotels entschieden, und ihr BMD-Konto hat keinen fixen Steuercode.
- [ ] Die Einrichtung der Anzahlungen (USt direkt am Anzahlungskonto oder Anzahlungskonto der Kanzlei) ist entschieden.
- [ ] Stornogebühren und No-Shows sind geklärt: ohne USt auf 4091 (oder dem Konto der Kanzlei), mit USt nur, wenn apaleos Satz stimmt.
- [ ] Anzahlungen gehen auf die erhaltenen Anzahlungen mit Steuercode, Zahlungen außer bar auf Schwebende Geldbewegungen, Firmenrechnungen auf den Sammeldebitor, der im Mandanten angelegt ist.
- [ ] Die Erlöskonten ohne Steuercode haben in BMD keinen fixen Steuercode.
- [ ] `apaleo-bmd mapping check --property <id> --from <Monatsanfang> --to <Monatsende>` endet ohne Fehler für einen echten Monat.
- [ ] Ein Probelauf `apaleo-bmd export --month <YYYY-MM> --dry-run` ist ohne `E-` Befund; die Summen pro Konto und USt-Satz stimmen mit den Berichten in apaleo überein.
- [ ] Der erste Import läuft in einen Testmandanten, und das Importprotokoll wurde geprüft ([bmd-import.md](bmd-import.md)).

Datum, Name der Kanzlei und die geprüfte Version der Datei (SHA-256 aus dem Protokoll) kannst du in die Spalte `comment` oder in eure Unterlagen schreiben.
