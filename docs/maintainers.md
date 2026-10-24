# Hinweise für Maintainer

## Das Repository ist öffentlich

Das Repository ist seit dem 21. Oktober 2026 öffentlich, Version `v0.1.0` ist veröffentlicht. README, Beschreibung und Themen sind für Hotels und Kanzleien in Österreich geschrieben, die auf GitHub nach „apaleo BMD Export“, „BMD NTCS Import“ oder „apaleo Buchhaltung Österreich“ suchen. Beschreibung und Themen sind mit diesem Befehl gesetzt; mit `gh repo view` prüfst du den Stand:

```sh
gh repo edit krautdawg/apaleo-bmd-export \
  --description "Kostenloser apaleo BMD Export (Open Source): Buchungsimport für BMD NTCS aus apaleo. Selbst gehostet, MIT, kein Abo." \
  --add-topic apaleo,bmd,bmd-ntcs,bmd-export,buchungsimport,ekr,hotel,hospitality,accounting,buchhaltung,steuerberater,austria,oesterreich
gh repo view krautdawg/apaleo-bmd-export --json description,repositoryTopics,visibility
```

## Zusammenführen

Der Branch `main` ist geschützt und verlangt die CI-Prüfungen, GitHub blockiert also einen roten Pull Request. Führe zusammen, wenn die CI grün ist:

```sh
gh pr checks <number> --watch --fail-fast && gh pr merge <number> --squash
```

## Veröffentlichung

Erledigt ist, was abgehakt ist; die offenen Schritte sind weiterhin die Entscheidung des Maintainers.

1. [ ] Mach mit einer Kanzlei einen ersten echten Testimport in BMD NTCS (Testmandant, Checkliste in [bmd-import.md](bmd-import.md#erster-import-bitte-prüfen)) und trag ihn unten unter [Testimporte](#testimporte) ein: Datum, BMD-Version, Dialekt und Ergebnis. Erst wenn der Import ohne Nacharbeit ging, darf das README mehr sagen als „folgt dem dokumentierten BMD-Importformat“.
2. [ ] Lies das README in einem frischen Klon und führe den Schnellstart und `export --month 2026-09 --demo --dry-run` noch einmal aus.
3. [x] `pnpm test` (mit dem Docs-Test) läuft, und die CI auf `main` ist grün.
4. [x] Die Historie ist durchsucht: `git log -p | grep -iE 'secret|password|token'` zeigt nur Code und Dokumentation, nie einen Wert. Keine echten Gästedaten in den Testdaten.
5. [x] Die Sichtbarkeit ist öffentlich (seit dem 21. Oktober 2026).
6. [ ] Lade ein Vorschaubild (Social Preview) hoch (Settings > General > Social preview).
7. [ ] Entscheide, ob es GitHub Discussions für Fragen geben soll. Schaltest du sie ein, leg eine `config.yml` in `.github/ISSUE_TEMPLATE/` an, die auf die Discussions verweist; bis dahin sind die Vorlagen für Issues der einzige Weg.
8. [x] Die private Meldung von Sicherheitslücken ist eingeschaltet (Settings > Code security), auf die `SECURITY.md` verweist.
9. [x] Der Schutz für den Branch `main` ist eingeschaltet und verlangt die CI-Prüfungen, damit sich ein roter Pull Request nicht zusammenführen lässt.
10. [x] Die erste Version ist mit dem Tag `v0.1.0` markiert. Ein Tag ist nur eine Version des Quellcodes; nichts wird auf npm oder in einer Container-Registry veröffentlicht.
11. [ ] Prüfe, dass das deutsche README auf github.com richtig angezeigt wird (Tabellen, der Link auf `README.en.md` in der zweiten Zeile, die Anker der Überschriften, die Badges) und dass das CI-Badge den Stand von `main` zeigt.

## Testimporte

Jeder echte Import einer Datei des Tools in BMD, den eine Kanzlei gemacht hat. Solange die Tabelle leer ist, sagen README und Dokumentation nur, dass die Datei dem dokumentierten BMD-Importformat folgt und der erste Testimport noch aussteht; der Docs-Test schlägt fehl, wenn sie mehr behaupten.

| Datum | BMD-Version | Dialekt | Ergebnis |
|---|---|---|---|

Trag unter „Ergebnis“ ein, was ohne Nacharbeit ging und was nicht (zum Beispiel Zeichensatz, Steuercodes in der UVA-Vorschau, Belegnummern), ohne Namen der Kanzlei oder des Hotels, wenn sie das nicht möchten. Jede offene Frage aus [bmd-format.md](bmd-format.md#offene-fragen), die der Import beantwortet, kommt als Einstellung oder Korrektur in eine eigene OpenSpec-Änderung.

## Später geplant

Nicht Teil von Version 1, in keiner bestimmten Reihenfolge, und alles innerhalb dieses Tools. Jeder Punkt braucht eine eigene OpenSpec-Änderung.

- **Personenkonten-Datei**: die Stammdaten der Debitoren (Firmen mit Name, Adresse und UID) als eigene Importdatei für BMD, damit Rechnungen an Firmen nicht nur auf den Sammeldebitor gehen.
- **Summendatei**: neben der Datei mit einer Buchung pro apaleo-Zeile eine verdichtete Datei mit einer Buchung pro Tag, Konto und Steuersatz, für sehr große Hotels.
- **Gebühren aus Abrechnungsdateien**: die Gebühren und Rückbuchungen (Chargebacks) der Zahlungsdienstleister aus ihren Abrechnungen buchen.
- **E-Mail-Versand**: die Dateien per SMTP an die Kanzlei schicken statt über einen gemeinsamen Ordner.
- **Dauerprozess mit eigenem Zeitplan**: ein Modus, der dauerhaft läuft und eine eigene Uhr hat, statt `schedule --once` aus Cron oder der Compose-Schleife.
- **Überwachung und Alarme**: eine Zustandsprüfung und ein Alarm (Mail oder Webhook), wenn ein geplanter Lauf fehlschlägt.
- **Dependabot**: automatische Updates der Abhängigkeiten für npm-Pakete, GitHub Actions und das Docker-Basis-Image.
- **Veröffentlichung auf npm oder in einer Registry**: das Kommandozeilenprogramm auf npm und ein Container-Image in einer Registry veröffentlichen. Heute ist das Paket mit Absicht `"private": true`, und das Image wird lokal gebaut.
