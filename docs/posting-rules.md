# Buchungsregeln: von apaleo-Zeilen zu BMD-Buchungen

`buildBookings(lines, mapping, chart, options)` in `src/posting` macht aus den Zeilen von `export-gross-daily` in apaleo die Buchungen eines BMD-Buchungsimports. Die Funktion ist rein: Dieselben Zeilen und dieselbe Kontenzuordnung ergeben immer dasselbe Ergebnis. Jede apaleo-Zeile landet an genau einer von drei Stellen: in einer Buchung, in der Liste der übersprungenen Zeilen (mit Grund und Betrag) oder in einem Befund mit `E-`, der den Export blockiert.

Keine Gewähr, keine Steuerberatung: Die steuerlichen Entscheidungen stecken in der Kontenzuordnung, und die muss deine Steuerberatung freigeben. Die Regeln unten stellen nur sicher, dass BMD die USt bucht, die apaleo berechnet hat.

## Eine Buchung pro Zeile

In dieser Version wird nichts verdichtet: Jede apaleo-Zeile wird eine Buchung mit dem Geschäftstag als Beleg- und Buchungsdatum und der `sourceEntryNumber` aus apaleo, damit sich jede Buchung zurückverfolgen lässt. Ein Hotel mit 40 Zimmern erzeugt ein paar tausend Buchungen im Monat; BMD importiert das ohne Probleme, und die USt-Prüfung bleibt pro Zeile genau.

## Richtung: die Seite mit Steuercode kommt ins Konto

BMD rechnet und bucht die Steuer nur auf dem führenden Konto (`konto`), und auf einem Sachkonto erwartet es dort den Nettobetrag. Beide Seiten der Zeile werden über die Kontenzuordnung aufgelöst (siehe [mapping-guide.md](mapping-guide.md)); die Seite, deren Zeile einen Steuercode hat, ist die USt-Seite.

| Fall | `konto` | `gkonto` | `betrag` | `steuer` |
|---|---|---|---|---|
| USt-Seite im Haben (Leistung, erhaltene Anzahlung) | USt-Seite | andere Seite | Brutto minus Steuer, negativ | Steuer, negativ |
| USt-Seite im Soll (Nachlass auf Erlöse, Auflösung einer Anzahlung) | USt-Seite | andere Seite | Brutto minus Steuer, positiv | Steuer, positiv |
| keine USt-Seite, eine Seite ist Erlös oder Forderungsverlust (Erlöse ohne Steuercode) | Erlös- oder Forderungsverlustkonto | andere Seite | Brutto, negativ im Haben, positiv im Soll | leer |
| keine USt-Seite sonst (Zahlungen, Umbuchungen zwischen Folios, Ortstaxe ohne Steuercode) | belastetes Konto | entlastetes Konto | Brutto, positiv | leer |
| beide Seiten mit Steuercode (Umbuchung zwischen zwei Erlöskonten) | Fehler `E-TWO-VAT-SIDES`, keine Buchung | | | |

Ein Erlös ohne Steuercode führt mit dem Erlöskonto, damit die Kostenstelle (`kost`) auf der Leistung und auf ihrem Nachlass steht. Zahlungen, Gastforderungen und Debitoren haben nie einen Steuercode (`E-STEUERCODE-NOT-ALLOWED`), sonst stünde die Umsatzsteuer im Soll. Ein negativer Bruttobetrag (eine negative Leistung, eine Erstattung) tauscht die Seiten. apaleo bucht die Auflösung einer Anzahlung als negative Belastung im Haben der Anzahlung; das Tool bucht sie deshalb mit positivem Betrag und positiver Steuer auf dem Anzahlungskonto. Mit `verbuchkz` `A` erzeugt BMD die Gegenbuchung auf `gkonto` (Betrag plus Steuer, also genau der Bruttobetrag aus apaleo) und die Steuerbuchung selbst.

Die Steuer ist die Steuer der apaleo-Zeile, kaufmännisch auf den Cent gerundet (bei ,5 weg von null); der Betrag ist Brutto minus diese Steuer, nie der für sich gerundete Nettobetrag von apaleo. Steuercode und Prozent kommen aus der Zeile der USt-Seite. Eine Zeile mit Steuercode und 0 % (zum Beispiel ein Code für nicht steuerbare Umsätze) ist erlaubt und bucht die Steuer 0.

## USt-Prüfung pro Zeile

Zuerst werden die `taxes[]` der Zeile bereinigt: Einträge mit Satz 0 und Betrag 0 (zum Beispiel `Without` bei der Ortstaxe) fallen weg. Dass Netto plus Steuer den Bruttobetrag ergibt, prüft schon das Lesen der apaleo-Daten auf den halben Cent genau. Dann prüft das Tool:

| Code | Bedeutung |
|---|---|
| `W-VAT-ROUNDING` | BMDs eigene Kontrolle, `round(|betrag| × Satz / 100)`, weicht um einen Cent von der Steuer ab (am Live-Tag VIE: 46,80 brutto zu 10 %, Steuer 4,25, Kontrolle 4,26). Gebucht mit der Steuer von apaleo; die Differenz geht in die Rundungssumme der Übersicht. |
| `E-VAT-AMOUNT` | Die Abweichung ist größer als ein Cent. |
| `E-VAT-RATE` | Der Satz von apaleo weicht von `bmd_vat_percent` der USt-Seite ab. |
| `E-VAT-MISSING` | apaleo hat USt berechnet, aber keine der beiden Seiten hat einen Steuercode. |
| `E-VAT-UNEXPECTED` | apaleo hat keine USt berechnet, aber die USt-Seite bucht einen Satz über 0 %. |
| `E-VAT-MIXED` | Eine Zeile hat mehr als einen USt-Satz. |
| `E-VAT-SIGN` | USt und Bruttobetrag haben verschiedene Vorzeichen. |
| `E-VAT-RATE-MISSING` | Die Zeile der Kontenzuordnung hat einen Steuercode, aber keinen gültigen USt-Satz. |
| `E-UNMAPPED` | Ein Konto hat keine Zeile mit BMD-Konto; einmal pro Konto, wie bei `mapping check --from --to`. |

Die Meldungen nennen die Buchungsnummer aus apaleo, beide Konten mit Nummer und Typ (nie mit Namen, weil Gastfolios Gästenamen tragen) und die Zeile der Kontenzuordnung, die du ändern musst.

## Anzahlungen

Anzahlungen werden auf das zugeordnete Anzahlungskonto gebucht, in der EKR-Vorlage 3200 (10 %), 3202 (13 %) und 3201 (20 %) mit Steuercode 1, Überzahlungen zu 0 % auf 3209 ohne Steuercode. In echten apaleo-Daten kommt jede Anzahlung, ihre Auflösung (eine negative Belastung derselben Anzahlung) und ihre Erstattung (eine negative Anzahlung) mit `taxes[]` oder mit 0 %, und es gibt keine `PostPrepaymentVat`-Zeilen. Die Übersicht zählt erhaltene, aufgelöste und erstattete Anzahlungen nach Seite und Vorzeichen.

Für ältere Daten und andere Quellen gilt: Die Auflösung (Soll auf dem Konto `Liabilities` des Gastes, Haben auf seinem Konto `Receivables`) muss den Satz der Anzahlung tragen. Schickt apaleo sie ohne `taxes[]`, wird der Satz ermittelt, nie mit 0 % angenommen:

1. aus der oder den `PostPrepaymentVat`-Zeilen desselben Geschäftstags und derselben Referenz (ihr Steuersatz, oder der bekannte Satz, dessen USt auf der Auflösung ihrem Betrag entspricht). Die Steuer ist dann der Betrag dieser Zeile (bei mehreren Auflösungen die aus dem Bruttobetrag berechnete Steuer jeder Auflösung), und die berechnete Steuer muss bis auf einen Cent der USt auf diesen Zeilen entsprechen;
2. sonst aus dem USt-Satz des Kontos `Liabilities` oder seines Elternkontos im Kontenplan von apaleo, mit der Steuer `round(|brutto| × Satz / (100 + Satz))` und der Warnung `W-VAT-INFERRED` (immer, auch wenn dieser Satz 0 % ist und die Auflösung auf das Anzahlungskonto ohne Steuercode geht);
3. sonst stoppt der Export mit `E-VAT-RATE-UNKNOWN`, statt die Auflösung ohne USt zu buchen.

Eine erhaltene oder erstattete Anzahlung ohne `taxes[]` nimmt den Satz einer `PostPrepaymentVat`-Zeile desselben Geschäftstags und derselben Referenz, die USt in ihrer Richtung bucht (Eingang) oder zurückbucht (Erstattung), mit derselben Prüfung des Betrags. Ohne eine solche Zeile bleibt es bei 0 % (ohne Rückgriff auf den Kontenplan). `mapping check --from --to` nutzt dieselbe Ermittlung.

## Österreichische Sonderfälle

Die Fälle, in denen österreichisches Recht oder die Praxis in BMD von einem einfachen Verkauf abweicht. Die Buchungsregeln bleiben dieselben; was sich unterscheidet, steht in der Kontenzuordnung ([mapping-guide.md](mapping-guide.md)). Die Beispielzeilen stammen aus dem erfundenen österreichischen Testmonat (`test/fixtures/apaleo/at-month/`, Hotel Beispiel Tirol, August 2026) und stehen so in `test/golden/bmd/at-month.csv`; der Testmonat bucht unter dem Symbol `AR`, in einer echten Einrichtung steht dort das eigene Symbol der Kanzlei ([bmd-import.md](bmd-import.md#buchungssymbol-anlegen)) (Spalten `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz`).

**Anzahlung, erhalten, aufgelöst und erstattet.** Die erhaltene Anzahlung trägt die USt bei Erhalt (Mindest-Istbesteuerung) mit dem normalen Umsatzsteuer-Code; Auflösung und Erstattung buchen sie zurück, mit positivem Betrag und positiver Steuer auf dem Anzahlungskonto:

```text
0;3200;2890;080100001;03.08.2026;03.08.2026;AR;2;10;1;-300,00;-30,00;Anzahlung 10 %;;DEP-TIR-A;E;A
0;3200;2390;080100010;12.08.2026;12.08.2026;AR;1;10;1;200,00;20,00;Auflösung Anzahlung 10 %;;TIR-ALPHA-1-V0;E;A
0;3200;2890;080100011;12.08.2026;12.08.2026;AR;1;10;1;100,00;10,00;Erstattung Anzahlung 10 %;;REF-TIR-A;E;A
```

**Forderungsverlust mit USt-Berichtigung.** apaleo belastet den Forderungsverlust und entlastet die Gastforderung, mit der USt. Mit dem Umsatzsteuer-Code steht das Forderungsverlust-Konto vorn, Betrag und Steuer sind positiv: Die Soll-Buchung auf das USt-Konto mindert die Umsatzsteuer. Ohne `taxes[]` (Zeile `7809` ohne Steuercode) führt das Forderungsverlust-Konto mit dem Bruttobetrag, ohne Steuerfelder. Die Übersicht zeigt die abgeschriebenen Forderungen pro Satz.

```text
0;7800;2390;080100022;28.08.2026;28.08.2026;AR;1;10;1;50,00;5,00;Forderungsverlust 10 %;;TIR-FOXTROT-1-V0;E;A
```

**Stornogebühr und No-Show.** Sie laufen wie jeder Erlös durch ihre Zeile und die USt-Prüfung; das Tool ändert die USt von apaleo nie. Ohne USt führt das Erlöskonto `4091` mit dem Bruttobetrag im Haben. Hat apaleo eine Gebühr besteuert und die Zeile keinen Steuercode, stoppt der Export mit `E-VAT-MISSING`; lässt die Vorlage die Zeile leer (eine Gebühr mit USt), mit `E-UNMAPPED`.

```text
0;4091;2390;080100013;14.08.2026;14.08.2026;AR;2;;;-45,00;;Erlös Stornogebühr 0 %;;TIR-CHARLIE-1-V1;E;A
```

**Ortstaxe, Aufenthaltsabgabe, Nächtigungsabgabe.** Die Abgabe des Gastes geht ohne Steuercode auf die Verbindlichkeit oder den durchlaufenden Posten der Kanzlei; die Gastforderung ist das belastete Konto:

```text
0;2390;3580;080100004;10.08.2026;10.08.2026;AR;1;;;3,00;;Ortstaxe;;TIR-BRAVO-1-V0;E;A
```

**Steuersätze.** Jede Buchung trägt den Satz, den apaleo hat: Beherbergung und Speisen 10 %, Schwimmbad und Therme 13 %, Getränke, Massagen und Parken 20 %. Die Liste mit den Paragrafen steht im [Leitfaden zur Kontenzuordnung](mapping-guide.md#steuersätze-in-österreich).

```text
0;4000;2390;080100002;10.08.2026;10.08.2026;AR;2;10;1;-89,09;-8,91;Erlös Logis 10 %;;TIR-BRAVO-1-V0;E;A
0;4020;2390;080100005;10.08.2026;10.08.2026;AR;2;20;1;-6,58;-1,32;Erlös Speisen und Getränke 20 %;;BAR-TIR-1;E;A
```

## Übersprungene Zeilen

| Grund | Zeilen |
|---|---|
| `VAT_ACCOUNT_LINE` | Jede Zeile, die ein apaleo-Konto `Vat` oder `VatOnLiabilities` berührt, auch `PostPrepaymentVat`. BMD bucht die Steuer aus dem Feld `steuer` der Erlös- oder Anzahlungsbuchung; würden die USt-Zeilen von apaleo zusätzlich gebucht, stünde die Steuer doppelt in der UVA. Diese Konten brauchen keine Zeile in der Kontenzuordnung. |
| `ZERO_AMOUNT` | Bruttobetrag 0. |
| `SAME_ACCOUNT` | Beide Seiten sind demselben BMD-Konto zugeordnet, zum Beispiel eine Umbuchung zwischen zwei Gastfolios auf 2390, oder die zweite Zeile einer Zahlung (`<Folio>_Receivables` an `<Folio>_Receivables/Offset`). |

Übersprungene Zeilen behalten ihre Anzahl und ihre Bruttosumme ohne Vorzeichen in der Übersicht, es verschwindet also nichts.

## Felder

- **Buchungssymbol**: `bmd.buchsymbol` (oder `properties[].buchsymbol`). Eine Zeile ohne USt-Seite mit einem Zahlungskonto bekommt `bmd.buchsymbolZahlung` (oder `properties[].buchsymbolZahlung`), sonst ebenfalls das Hauptsymbol.
- **extbelegnr**: die Belegnummer aus apaleo (Rechnung, Referenz des Zahlungsdienstleisters, …), wenn `posting.extbelegnr` auf `receipt` steht (Standard) und es eine gibt, sonst die Reservierungsreferenz. Der BMD-Writer bereinigt sie.
- **text**: eine deutsche Bezeichnung ohne Gästenamen, gekürzt auf 40 Zeichen: `Erlös Logis 10 %` oder `Erlösminderung …` nach Seite und Vorzeichen, `Anzahlung 10 %`, `Umbuchung Anzahlung`, `Auflösung Anzahlung 13 %`, `Erstattung Anzahlung`, `Zahlung Visa` oder `Erstattung …` (englische Namen der Zahlungsarten übersetzt oder weggelassen), `Forderung an Debitor`, `Forderungsverlust 10 %`, `Ortstaxe`. Konten vom Typ Receivables, AccountsReceivable und Liabilities außerhalb des globalen Buchungsjournals nutzen den Namen ihres globalen Elternkontos oder eine feste Bezeichnung, nie ihren eigenen Namen, denn der kann der eines Gastes sein.
- **kost**: nur aus der Zeile von `konto`, und nur, wenn das eine Erlös- oder Forderungsverlustzeile ist. Auf Zahlungen, Personenkonten, Anzahlungen, Ortstaxe und Verrechnungskonten bleibt `kost` leer, denn auf einer Zahlung liest BMD es als Belegnummer der bezahlten Rechnung.

## Übersicht

Alles in Cent: Soll, Haben und Saldo pro BMD-Konto nach dem Bewegungsmodell (`konto` mit dem Betrag, `gkonto` mit Betrag plus Steuer); Erlöse, Anzahlungen und abgeschriebene Forderungen (Forderungsverluste mit der USt-Berichtigung) pro USt-Satz mit Netto, Steuer und Brutto, wie sie an BMD gehen, daneben die genaue USt von apaleo auf denselben Zeilen; Ortstaxe und Gästeabgaben; Zahlungen pro Konto; erhaltene, aufgelöste und erstattete Anzahlungen; die Bewegung auf dem Sammeldebitor; übersprungene Zeilen pro Grund; die Rundungssumme; Befunde pro Code.
