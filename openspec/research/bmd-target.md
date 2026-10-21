# Research: BMD as the target format

Planning notes for the b01-b08 slices, checked on 2026-10-21. English, like the specs. The German user doc `docs/bmd-format.md` (slice b02) is written from this file and keeps the source list. Nothing here is tax advice; every booking rule is confirmed by a Kanzlei with a real BMD NTCS test import before the first release (see "Open questions").

## 1. The BMD booking import (BuErf, Satzart 0)

BMD imports bookings from a text file ("Erfassungsfile", "buerf") either with a fixed record length of 480 bytes or with a variable layout: a header line names the columns, the order is free, the separator is tab or `;` (both detected automatically in current versions; parameter `XPR08TRENN` 009/059 in BMD 5.5). We write the variable layout with `;`.

| Field (NTCS name / BMD 5.5 name) | Meaning and rule (source) |
|---|---|
| `satzart` | always `0` = FIBU-Buchungssatz (PR08 p.10; dvo: "nur Null zulässig", reliable marker of a BuErf file) |
| `konto` / `konto-nr` | leading account, digits, must match the Kontenplan-Stelligkeit exactly (dvo 5.1). "Konto und Gegenkonto haben auf die Einstellung Soll/Haben keine Auswirkung" (PR08). The revenue or expense Sachkonto must be the `konto`, never the `gkonto`, "da in BMD nur am Konto die Entsteuerung ... erfolgen kann" (HOW2 G/H) |
| `gkonto` / `gkto` | Gegenkonto, digits, same Stelligkeit rule |
| `buchdatum` / `buchdat` | booking date; JJJJMMTT in BMD 5.5; dvo accepts TT.MM.JJ, TT.MM.JJJJ and JJJJMMTT; NTCS exports TT.MM.JJJJ. Decides the booking period and so the UVA period (HOW2 P) |
| `belegdatum` / `belegdat` | document date, same formats; `periode` (01-13) defaults to the month of the Belegdatum (PR08 p.12) |
| `belegnr` | numeric, max 9 digits (PR08: "nummerisch, 9 Stellen"; dvo: longer or alphanumeric values are cut to the rightmost 9 digits) |
| `extbelegnr` | external document number, alphanumeric (12 in the fixed layout, 35 in dvo), used as OP-Nummer |
| `buchcode` / `bucod` | `1` Soll, `2` Haben. "der Buchungscode steuert nur das im Journal angezeigte S oder H ... ausschlaggebend für Soll/Haben-Wirksamkeit ist nur das Vorzeichen beim Betrag" (HOW2 E) |
| `betrag` | amount of the leading account. "Buchungen im Soll (Bucod = 1) haben kein Vorzeichen. Buchungen im Haben (Bucod = 2) müssen mit – (Minus) angegeben werden." Personenkonto as leading account: always gross; otherwise gross or net "richtet sich nach dem führenden Konto" (PR08 p.12). Revenue account leading: net amount, tax separately (PR08 example "AR mit Erlöskonto beginnend": `4020;201001;2;-1.000,00;20;-200`) |
| `steuer` | tax amount, sign follows the tax side: "Umsatzsteuer Haben Minus, Vorsteuer Soll Plus" (PR08 p.12); same sign as `betrag` for normal revenue (HOW2 J). dvo: only importable when the leading account is not a Personenkonto |
| `prozent` / `mwst` | VAT percent, `0`, `10`, `20`, decimals allowed in BMD (`20,5`); 88 = mixed rate in BMD 5.5 only, removed in NTCS. dvo limits the field to "Ziffern, max. 2 Stellen", so `4,9` is not dvo-safe |
| `steuercode` / `steucod` | The meaning differs by version, so header names, date format and code set are one switch (`bmd.dialect`, see §1a). **BMD NTCS:** `1` Umsatzsteuer (normal output VAT, Soll or Ist is set in the Firmen/FIBU master data, not per booking), `2` Vorsteuer ("zwingend 2", NTCS_BUCHEN p.5, p.38), `3` Vorsteuer-Berichtigung "nicht abzugsfähig gem. § 12 Abs. 3" (UVA KZ 062). NTCS_BUCHEN Anhang A p.107: "KZ 022 / 029: USt-Steuercode 1 + 12/20 % bzw. 10 % + Anzahlungen", p.108: "KZ 062: USt-Steuercode 3"; dvo BuErf §9: 1 = Umsatzsteuer, 2 = Vorsteuer, 3 = Berichtigung der VSt. dvo §9 also lists codes for non-taxable revenue (81 "Umsatz nicht steuerbar", 64 "nicht steuerbare Umsätze § 19/1"), unconfirmed for NTCS. **BMD 5.5:** `03` Soll-Umsatzsteuer, `01` Ist-Umsatzsteuer, `00` Vorsteuer or no tax; `07` ig. Lieferung, `77` sonstige Leistungen EU, ... (PR08 p.11, HOW2 F). An earlier draft of this note used the 5.5 meanings for NTCS; with NTCS that would have put revenue into the Vorsteuer correction (KZ 062) and left KZ 000/022/029 empty |
| `buchsymbol` / `symbol` | Buchungssymbol such as `AR`, `ER`, `KA`, `BK`; 2 chars in BMD 5.5, up to 4 in NTCS ("Buchungssymbole ... können 4 Buchstaben haben"), dvo: A-Z and 0-9, max 3. In NTCS a symbol has a Buchungstyp (AR = "Rechnung (umsatzrelevant)") and Kontenart rules; the guide's own example blocks Passiv accounts under AR (NTCS_BUCHEN p.43-44, "Konto erlauben"). Symbols default to "Kontrolle Belegnummer je BuSymbol": a Belegnummer may occur only once per symbol (p.37). Hence no default `AR`: the Kanzlei creates a dedicated symbol (for example `HO`, copied from AR with every Kontenart allowed) |
| `text` | Buchungstext; 18 chars in the fixed layout, dvo reads 40 and cuts the rest; no `;` inside text fields |
| `kost` | numeric, max 9 digits (PR08, dvo "Ziffern"). Two meanings: Kostenstelle on revenue/expense lines, but "bei Zahlungen wird die Belegnummer der Rechnung angegeben, die durch die Zahlung abgestattet wird" (PR08 p.10, HOW2 N). So the tool writes it only when `konto` is a profit-and-loss account |
| `gegenbuchkz` | only with `verbuchkz` A: `E` Einzelgegenbuchung, `S` Sammelgegenbuchung, `O` ohne |
| `verbuchkz` | `A`: PR08A generates the Gegenbuchung and the Sammelbuchungen (tax and collective accounts), which then must not be in the file; empty: PR08, every leg must be in the file. BMD recommends `A` |
| `filiale`, `waehrung`, `fwbetrag`, `uidnr`, `zziel`, `skontopz`, ... | not used in v1 (EUR only, no OSS, no Personenkonten terms) |

Numbers: decimal comma, minus sign in front, no thousands separator in our output (`-1000,00`). Record end: CR LF (dvo 14.1: CR ends the record, a lone LF inside text is turned into a space). Encoding: not stated by any source; BMD and dvo are Windows programs, the BMD 5.5 files are ASCII/ANSI. Decision: Windows-1252 without BOM, characters outside CP1252 replaced during sanitising (same approach as the DATEV writer). To be confirmed in the first test import.

Splittbuchungen: consecutive lines with the same `konto`, `belegnr` and `belegdatum` are merged into one split booking by PR08A (PR08 p.6, Hausleitner p.19). Our writer therefore gives every booking its own `belegnr` so nothing is merged by accident. Because NTCS checks Belegnummern per Buchungssymbol, the number must also be unique across files: `MMDD` of the file's first day plus a 5-digit counter (`100100001` for the first booking of a file starting on 1 October). Non-overlapping files of one property never share a start day, and `MMDD` repeats only after twelve months, so the numbers are unique within any Wirtschaftsjahr (also an abweichendes one). Two properties booked into one Mandant need different Buchungssymbole (`properties[].buchsymbol`).

NTCS makes the tax and collective bookings after every booking ("Die NTCS macht nach JEDER Buchung automatisch die benötigten Sammelbuchungen (USt, VSt, Personensammelkonten etc)", NTCS_BUCHEN p.4). With `verbuchkz` `A` and `gegenbuchkz` `E` one file line is one booking with its Gegenbuchung and its tax posting.

### 1a. Dialect: NTCS (default) and BMD 5.5

Header names, date format and Steuercode meanings belong together, so one config switch `bmd.dialect` sets all three:

| | `ntcs` (default) | `bmd55` |
|---|---|---|
| Header | `satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz` | `satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz` (PR08 5.B4) |
| Dates | `TT.MM.JJJJ` (NTCS exports, TdTools) | `JJJJMMTT` (PR08 p.10, HOW2 B) |
| Output VAT | `1` | `3` (Soll-USt; `1` Ist-USt) |
| Input-tax codes rejected on revenue-side rows | `2`, `3` | `0` |
| Buchungssymbol length | 1-4 | 1-2 |

dvo accepts both header variants. Each dialect has its own golden file. Which one a Kanzlei needs is confirmed by the first test import.

Personenkonten: BMD imports master data separately (PR08I, variable layout, fields Kontonummer, Name, Matchcode, Strasse, PLZ, Ort, Staat, UID; HOW2 ch. 2; dvo ch. 13). Grman's connector offers a "Personenkonten" file. Not in v1: apaleo's finance export carries no company master data, and a Sammeldebitor is enough for the first release.

## 2. Austrian VAT for hotels

- UStG 1994 § 10 (RIS, Fassung ab 2026-07-01, BGBl. I Nr. 37/2026): 10 % for Beherbergung in eingerichteten Wohn- und Schlafräumen incl. regular Nebenleistungen; "als Nebenleistung auch die Verabreichung eines ortsüblichen Frühstücks ..., wenn der Preis hiefür im Beherbergungsentgelt enthalten ist"; 10 % for Speisen and Getränke of Anlage 1 as Restaurationsumsatz; 20 % normal rate (massages and spa treatments, parking, most drinks, other services); 13 % (§ 10 Abs. 3 UStG) among others for "die unmittelbar mit dem Betrieb von Schwimmbädern verbundenen Umsätze und die Thermalbehandlung" (Z 5: pool and Therme admission, thermal treatment), theatre, concert and museum admissions (Z 6) and admissions to sports events (Z 12). Beherbergung is § 10 Abs. 2 Z 3 lit. c, including an ortsübliches Frühstück that is part of the room price. Checked on RIS (Fassung 21.10.2026, in force since 2026-07-01). Since 2026-07-01 a 4.9 % rate for selected staple foods (Anlage 3, Lieferungen only; "Restaurations- bzw. Cateringumsätze sind vom Anwendungsbereich nicht umfasst", USP). So the tool must accept the rates 0, 4.9, 10, 13 and 20 and take the rate per line from apaleo.
- Pauschalangebote (Halbpension, Packages): split by individual selling prices, else by costs (UStR, WKO Vorarlberg). apaleo posts package components with their own VAT, so the split happens in apaleo; the tool only checks that each line's rate matches its mapping row.
- Anzahlungen: Sollversteuerer owe VAT on Anzahlungen when received (Mindest-Istbesteuerung, § 19 Abs. 2 Z 1 lit. a UStG). EKR group 32 "Erhaltene Anzahlungen auf Bestellungen" and the "Umsatzsteuer-Evidenzkonto für erhaltene Anzahlungen" in group 25 (KFS/BW 6). In NTCS the deposit VAT is ordinary USt (Steuercode 1); the UVA shows "+ Anzahlungen" inside KZ 000/022/029 (NTCS_BUCHEN Anhang A p.107). NTCS_BUCHEN Anhang C shows a second setup: Anzahlungskonten per rate (3290/3292) with an account for "n.n.fällige USt" (3510). The open question is therefore direct USt on the deposit account (code 1) versus BMD's Anzahlungskonto with not-yet-due USt, not code 1 versus 3. Stornogebühren are generally not taxable (WKO Vorarlberg), no-shows may be (Forvis Mazars 2025, EuGH); apaleo decides the tax, the tool only checks consistency.
- Ortstaxe / Nächtigungsabgabe / Aufenthaltsabgabe / Gästetaxe (guest-owed, name and amount per Bundesland and Gemeinde, e.g. Wien Ortstaxe, Salzburg Ortstaxe, Oberösterreich Ortstaxe (Oö. Tourismusgesetz 2018, paid to the Gemeinde), Tirol Aufenthaltsabgabe, Steiermark Nächtigungsabgabe): the hotel collects it from the guest and pays it to the Gemeinde or Tourismusverband, so it is booked without VAT on a liability account ("Verbindlichkeiten gegenüber Gemeinde/Stadtkasse" in EKR 350-359) or a durchlaufender Posten. Not to be confused with the business-owed Tourismusbeitrag / Interessentenbeitrag (in Oberösterreich the Tourismusabgabe), which apaleo does not post. The template leaves the row empty with both options in the comment, as the DATEV template does.

## 3. Einheitskontenrahmen (KFS/BW 6, 2017)

Groups used by the EKR hotel template (4-digit accounts as BMD Kanzleien usually set up; every row is a "Vorschlag (ungeprüft)"):

| Group (KFS/BW 6) | Use in the template |
|---|---|
| 20-21 Forderungen aus L+L (200 Inland 0 %, 201 10 %, 202 20 %) | collective debtor; Personenkonten are 5-6 digits in BMD (e.g. `201001` in PR08) |
| 23-24 Sonstige Forderungen | guest folio clearing (Gastforderungen) |
| 25 Forderungen aus der Abgabenverrechnung | Vorsteuer, USt-Evidenzkonto Anzahlungen (not booked by the tool) |
| 27-28 Kassa (270-273), Bank (280-288), 289 Schwebende Geldbewegungen | cash, bank, card and PSP clearing (Geldtransit) |
| 32 Erhaltene Anzahlungen (320) | deposits by VAT rate |
| 35-38 Sonstige Verbindlichkeiten (350-359 Steuern incl. Gemeinde; 370-389 übrige) | Ortstaxe option, USt accounts (BMD books those itself) |
| 40-44 Umsatzerlöse (400-439 by VAT rate), Erlösschmälerungen (440-449) | revenue Beherbergung 10 %, Speisen 10 %, Getränke 20 %, sonstige 20 %, 13 %, 4.9 %, 0 % |
| 780-781 Forderungsverluste, Zuführung Wertberichtigungen | bad debt (Forderungsverlust) by VAT rate |

Exact numbers are the Kanzlei's choice; BMD Kanzleien often run their own Kontenplan derived from the EKR.

## 4. Paid apaleo Store connectors (prices from the store pages, 2026-10-21)

- "Apaleo BMD Connector" by Grman IT Solutions (AT): 24 EUR / 34 EUR / 51 EUR per month by number of properties, 60 days free; detailed file (one line per booking), summary file (per day and account), Personenkonten file; daily, weekly or monthly; email or AWS S3. No file format published.
- "BMD Connector" by HoTechOlution (AT): 20 EUR per month, 18 EUR per month paid yearly, 60 days free; monthly email exports, custom periods, payment fees and chargebacks from settlement files. Onboarding guide (PDF) describes only signup and pricing, no file format.
- Together: 18-51 EUR per month depending on vendor and number of properties (not a per-property price). The README comparison names no vendor (same rule as the DATEV project) and says "18-51 EUR pro Monat (je nach Anbieter und Anzahl der Betriebe), laut apaleo Store, Oktober 2026".

## 5. Open questions for the first real import

The file follows the documented PR08/PR08A and dvo variable layout; nothing here is confirmed until a Kanzlei imports a test file. Each answer is a setting in one place (`src/bmd/format.ts` or a config key):

1. Dialect: NTCS header names, `TT.MM.JJJJ` and NTCS Steuercodes (default), or BMD 5.5 (`bmd.dialect: bmd55`)?
2. Encoding CP1252 vs UTF-8 with BOM.
3. Maximum text length in NTCS (40 assumed).
4. Anzahlungen: direct USt on the deposit account with Steuercode 1 (template default) or BMD's Anzahlungskonto with n.n.fällige USt (NTCS_BUCHEN Anhang C)?
5. Forderungsverlust with Steuercode 1 and positive net and tax: does the USt-Berichtigung appear as a reduction in KZ 029/022 (or KZ 090)?
6. Belegnummern: are the `MMDD` + counter numbers accepted under the chosen Buchungssymbol without duplicate warnings?
7. Untaxed revenue: does the Kanzlei's revenue account for 0 % (and the Ortstaxe account) carry a fixed Steuercode in the Kontenplan (Feld 152/153, NTCS_BUCHEN p.40, p.63) that BMD would apply to an empty field, and should such rows carry a non-taxable code (dvo §9: 81)?
8. Does BMD NTCS reject a `steuer` that deviates by one cent from `prozent` x `betrag`?
9. Is the movement model right, i.e. does BMD book `betrag + steuer` on `gkonto`?

## Sources

- BMD, "PR08 / PR08A - Verbuchen Erfassungsfile", FIBU-BASIS, Version 5.B4, 30.10.2015: https://www.simplesoft.at/BMD_Hilfe_Wiki/BMD_5_5/pr08_pr08a_Beschreibung.pdf
- S. Wenninger, "BMD HOW2 - Import von Buchungen und Personenkonten in BMD 5.5", 12.10.2010: https://www.simplesoft.at/BMD_Hilfe_Wiki/BMD_5_5/Import_Buchungen_und_Personenkonten.pdf
- "Das Buchenprogramm in NTCS" (NTCS changes, Steuercodes, Buchungssymbole p.37-44, Kontenstamm p.40/p.63, Anhang A UVA-Kennzahlen p.107-108, Anhang C Anzahlungen): https://www.simplesoft.at/BMD_Hilfe_Wiki/BUCHHALTUNG/NTCS_BUCHEN.pdf
- dvo Software, "Handbuch BuErf-Import Fibu (BMD BuErf-Modul)", 13.09.2021 (§9 Steuercodes): https://www.dvo.at/PDF/ReleaseNotes/Handbuch%20BuErf%20Import%20Fibu%20(BMD%20BuErf-Modul)_07092021.pdf
- EDV Hausleitner, "Schnittstelle BMD FIBU01": https://www.edv-hausleitner.at/fileadmin/FIBU01_SchnittstelleBMD.pdf
- Kinnovis help, BMD accounting export (column list): https://help.kinnovis.com/en/articles/9675693-bmd-accounting-export
- UStG 1994 § 10, RIS: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=10
- USP, "Neuer Umsatzsteuersatz von 4,9 Prozent": https://www.usp.gv.at/aktuelles/newsliste/neuer_ustsatz.html
- WKO NÖ Gastronomie, Umsatzsteuersenkung: https://www.wko.at/noe/tourismus-freizeitwirtschaft/gastronomie/umsatzsteuersenkung
- WKO Vorarlberg, Steuerreform 2015 Mehrwertsteuer Hotellerie (Pauschalaufteilung): https://www.wko.at/vlbg/tourismus-freizeitwirtschaft/hotellerie/steuerreform-2015-mehrwertsteuer.pdf
- WKO Vorarlberg, Stornogebühren und No-Shows: https://www.wko.at/vlbg/steuern/umsatzsteuerliche-behandlung-von-stornogebuehren-no-shows-un
- Forvis Mazars, Umsatzsteuer bei Stornos von Hotelgästen (04/2025): https://www.forvismazars.com/at/en/insights/tax-news/newsletter-april-2025/umsatzsteuer-bei-stornos-von-hotelgaesten
- KSW, KFS/BW 6 Einheitskontenrahmen, 13.07.2017: https://www.ksw.or.at/PortalData/1/Resources/fachgutachten/KFSBW6_13072017_RF.pdf
- apaleo Store, Apaleo BMD Connector (Grman): https://store.apaleo.com/apps/apaleo-bmd-connector
- apaleo Store, BMD Connector (HoTechOlution): https://store.apaleo.com/apps/bmd-connector and https://bmd.hotecholution.com/onboarding_guide
- Cross-checks (read only, not copied): heliumv/ejb `FibuExportFormatterBMD.java` (AGPL-3.0, BMD 5.5 codes steucod 00/01/03, bucod 1/2, amounts negated for Haben): https://github.com/heliumv/ejb ; funkring/fdoo `at_bmd` (Odoo BMD export): https://github.com/funkring/fdoo ; tgassner/TdTools BMD 5.5 -> NTCS converter (field names, Vorsteuer 0 -> 2, `;`, CRLF, TT.MM.JJJJ): https://github.com/tgassner/TdTools
