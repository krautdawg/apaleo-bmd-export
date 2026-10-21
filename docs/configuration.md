# Konfiguration: alle Einstellungen

Das Tool liest eine Konfigurationsdatei im Format YAML oder JSON und dazu ein paar Umgebungsvariablen. Fang mit [`apaleo-bmd.config.example.yaml`](../apaleo-bmd.config.example.yaml) an: Kopiere die Datei nach `apaleo-bmd.config.yaml` und füll sie aus.

## Wo die Datei liegt

1. `--config <Pfad>` auf der Kommandozeile, sonst
2. die Umgebungsvariable `APALEO_BMD_CONFIG`, sonst
3. `./apaleo-bmd.config.yaml` im Arbeitsverzeichnis.

Eine Datei, deren Name auf `.json` endet, wird als JSON gelesen, jede andere als YAML. Unbekannte Schlüssel lehnt das Tool mit ihrem Namen ab, damit ein Tippfehler nie unbemerkt bleibt. Ein Schlüssel ohne Wert (`buchsymbol:`) gilt als nicht gesetzt. Eine Konfiguration aus dem Vorgängerprojekt mit einem Abschnitt `datev` lehnt das Tool ab und nennt den Abschnitt `bmd`, der ihn ersetzt ([troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-übernommen)). `apaleo-bmd doctor` zeigt, welche Datei verwendet wird und ob sie gültig ist.

## Secrets

Das Client-Secret der apaleo Custom App kommt nur aus der Umgebung: `APALEO_CLIENT_SECRET`. Steht in der Konfigurationsdatei ein Secret unter `apaleo`, startet das Tool nicht und sagt dir, dass du es in die Umgebung verschieben sollst. Mit Docker kommt es in die Datei `.env`, die Git ignoriert; siehe [docker.md](docker.md). Das Tool gibt das Secret nie aus.

## Umgebungsvariablen

Das Tool liest nur diese Variablen. Jede andere Variable, die mit `APALEO_BMD_` beginnt, lehnt es mit einer Meldung ab, damit eine falsch geschriebene nicht still wirkungslos bleibt. Listen wie `properties` lassen sich nur in der Datei setzen.

| Variable | Setzt | Typ |
|---|---|---|
| `APALEO_CLIENT_SECRET` | das Client-Secret der Custom App (nie in der Datei) | Text |
| `APALEO_BMD_CONFIG` | den Pfad der Konfigurationsdatei | Pfad |
| `APALEO_CLIENT_ID` | `apaleo.clientId` | Text |
| `APALEO_BMD_OUTPUT_DIR` | `output.dir` | Pfad |
| `APALEO_BMD_TIMEZONE` | `schedule.timezone` (Standard `Europe/Vienna`) | IANA-Zeitzone, zum Beispiel `Europe/Vienna` |

Ein Wert aus der Umgebung geht dem Wert in der Datei vor.

## Schlüssel

### `apaleo`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `apaleo.clientId` | keiner | Client-ID der Custom App ([setup-apaleo.md](setup-apaleo.md)). Jeder Befehl, der mit apaleo spricht, braucht sie. Auch über `APALEO_CLIENT_ID`. |
| `apaleo.scopes` | wird nicht gesendet | Scopes, durch Leerzeichen getrennt, nur für Clients mit Scopes statt Berechtigungen, zum Beispiel `accounting.read`. Custom Apps mit Berechtigungen lassen den Schlüssel weg. |
| `apaleo.baseUrl` | `https://api.apaleo.com` | Adresse der API. Ändere sie nur, um gegen eine andere apaleo-Umgebung zu testen. Muss https sein (einfaches http nur für localhost). |
| `apaleo.identityUrl` | `https://identity.apaleo.com` | Adresse der Anmeldung, dieselben Regeln wie bei `apaleo.baseUrl`. |

### `bmd`

Diese Werte legt die Kanzlei in ihrem BMD-Mandanten fest. Frag sie, bevor du den ersten Export schickst.

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `bmd` | Pflicht | Der Abschnitt muss da sein, weil `bmd.buchsymbol` keinen Standardwert hat. |
| `bmd.buchsymbol` | Pflicht | Das Buchungssymbol jeder Buchung, 1 bis 4 Zeichen `A-Z` und `0-9` (bei `bmd55` höchstens 2). Die Kanzlei legt es in BMD an, zum Beispiel `HO` als Kopie von `AR` mit allen Kontenarten erlaubt; siehe [bmd-import.md](bmd-import.md). Ein Symbol, das es in BMD nicht gibt, lehnt der Import ab. |
| `bmd.buchsymbolZahlung` | `bmd.buchsymbol` | Ein eigenes Buchungssymbol für Zahlungen (Zeilen ohne Steuer mit einem Zahlungskonto), zum Beispiel mit Buchungstyp Zahlung. |
| `bmd.sachkontenlaenge` | `4` | Stellen eines Sachkontos im Kontenplan der Kanzlei, 4 bis 9. Der EKR nutzt 4. |
| `bmd.personenkontenlaenge` | `6` | Stellen eines Personenkontos (Debitor), 5 bis 9, zum Beispiel 6 für den Sammeldebitor `200000`. |
| `bmd.dialect` | `ntcs` | `ntcs` für BMD NTCS oder `bmd55` für BMD 5.5. Der Dialekt bestimmt die Spaltennamen, das Datumsformat und die Steuercodes (in NTCS ist `1` die Umsatzsteuer, in BMD 5.5 `3`); siehe [bmd-format.md](bmd-format.md). |

### `posting`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `posting.extbelegnr` | `receipt` | Was in `extbelegnr` steht, der externen Belegnummer, mit der BMD offene Posten zuordnet: `receipt` nimmt den Beleg aus apaleo (Rechnungs- oder Zahlungsreferenz) und sonst die Reservierungsreferenz; `reference` nimmt immer die Reservierungsreferenz. |

### `properties`

Die apaleo-Hotels, mit denen das Tool arbeitet. `export` und `schedule --once` exportieren jedes hier eingetragene Hotel, außer du gibst `--property` an. Die IDs, die die Custom App lesen darf, listet `apaleo-bmd properties`.

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `properties` | leere Liste | Ein Eintrag pro Hotel. |
| `properties[].id` | Pflicht | Die Property-ID in apaleo, zum Beispiel `BSP`. |
| `properties[].mapping` | `./mapping-<id>.csv` | Die Kontenzuordnung (CSV) des Hotels, relativ zum Arbeitsverzeichnis. |
| `properties[].buchsymbol` | `bmd.buchsymbol` | Ein eigenes Buchungssymbol für dieses Hotel. |
| `properties[].buchsymbolZahlung` | `bmd.buchsymbolZahlung` | Ein eigenes Buchungssymbol für die Zahlungen dieses Hotels. |

Bucht die Kanzlei zwei Hotels in einen Mandanten, braucht jedes ein eigenes Buchungssymbol: Die Belegnummern zweier Dateien desselben Zeitraums beginnen gleich, und BMD prüft sie je Buchungssymbol. Teilen sich zwei Hotels ein Symbol, warnen `doctor` und das Protokoll mit `W-BUCHSYMBOL-SHARED`.

```yaml
properties:
  - id: BSP
    mapping: ./mapping-BSP.csv
  - id: BSP2
    mapping: ./mapping-BSP2.csv
    buchsymbol: HO2
```

### `output`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `output.dir` | `./exports` | Ordner für die BMD-Dateien, relativ zum Arbeitsverzeichnis. Jede Datei landet in `<output.dir>/<Hotel>/<JJJJ-MM>/`. Auch über `APALEO_BMD_OUTPUT_DIR`. |

### `checks`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `checks.aggregates` | `false` | Vergleicht das Buchungsjournal zusätzlich mit den Tagessummen von apaleo, Saldo pro Konto, und warnt bei Abweichungen (`W-AGGREGATE-DIFF`, siehe [export.md](export.md)). Braucht die optionale Berechtigung `core.subledger_aggregate.create` und eine zusätzliche Anfrage pro Tag. |

### `schedule`

Nur für `schedule --once`. Was jede Einstellung bewirkt, mit Beispielen: [docker.md](docker.md).

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `schedule.timezone` | `Europe/Vienna` | „Heute“ ist das Datum in dieser IANA-Zeitzone. Für ein Hotel in Österreich passt der Standard; ob ein Zeitraum abgeschlossen ist, prüft das Tool zusätzlich in der Zeitzone des Hotels aus apaleo. Auch über `APALEO_BMD_TIMEZONE`. |
| `schedule.cadence` | `monthly` | `monthly` (eine Datei pro Monat) oder `daily` (eine Datei pro Tag). Ein Rhythmus pro Installation. |
| `schedule.monthly` | | Einstellungen für `cadence: monthly`. |
| `schedule.monthly.dayOfMonth` | `3` | Ein Monat ist ab diesem Tag des Folgemonats fällig, 1 bis 5. |
| `schedule.daily` | | Einstellungen für `cadence: daily`. |
| `schedule.daily.offsetDays` | `2` | Ein Tag ist so viele Tage später fällig, 1 bis 3. |
| `schedule.finalAfter` | `"06:00"` | Ortszeit, ab der ein Zeitraum, der vorgestern endete, als abgeschlossen gilt, `"00:00"` bis `"12:00"`, in Anführungszeichen. |
| `schedule.catchUpDays` | `40` | Wie viele Tage zurück ein verpasster Zeitraum noch exportiert wird, mindestens 3 (monatlich) oder 5 (täglich), höchstens 366. |

## Ein vollständiges Beispiel

```yaml
apaleo:
  clientId: HOTEL-BMD-EXPORT
bmd:
  buchsymbol: HO
  sachkontenlaenge: 4
  personenkontenlaenge: 6
  dialect: ntcs
posting:
  extbelegnr: receipt
properties:
  - id: BSP
output:
  dir: ./exports
checks:
  aggregates: false
schedule:
  timezone: Europe/Vienna
  cadence: monthly
```

Das Secret kommt in die Umgebung, nicht in diese Datei:

```sh
export APALEO_CLIENT_SECRET='das Secret aus apaleo'
apaleo-bmd doctor
```
