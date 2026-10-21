## Context

`openspec/research/bmd-target.md` collects the field rules from BMD's PR08/PR08A description (BMD 5.5, 2015), the BMD HOW2 import guide, "Das Buchenprogramm in NTCS" (Steuercodes, Buchungssymbole, UVA Kennzahlen), the dvo BuErf handbook (2021), the Hausleitner fixed-layout interface and open-source exporters (heliumv, funkring at_bmd, TdTools). BMD itself publishes no current spec, and no BMD installation is available, so the writer follows the intersection of these sources and keeps every choice that is uncertain in one place (`src/bmd/format.ts`) for the first real import with a Kanzlei.

## Goals / Non-Goals

**Goals:**
- A file that follows the documented PR08/PR08A and dvo variable layout, in the NTCS dialect by default and the BMD 5.5 dialect on request. Whether BMD NTCS reads it without manual editing is confirmed only by a first Kanzlei test import; until then no doc claims it.
- Deterministic bytes: same bookings, same file, so idempotent re-runs and golden tests work.
- PMS-neutral: the writer knows BMD, not apaleo.

**Non-Goals:**
- Posting decisions (which account is `konto`, which Steuercode, when `kost` is set): those belong to b03.
- Supporting every BMD field. Only Satzart 0 fields that a hotel ledger export needs.

## Decisions

1. **Variable layout with header, `;` separator.** Accepted by PR08 ("Tabulator und Strichpunkt werden ... automatisch erkannt"), NTCS and dvo; editable in Excel by the Kanzlei. Alternative: fixed 480-byte records (needs every field, padding and `+/-` suffixes; harder to review). Rejected.
2. **One dialect switch: `ntcs` (default) or `bmd55`.** Header names, date format and Steuercode meanings belong together: PR08 5.B4 documents only the 5.5 names (`gkto`, `belegdat`, `buchdat`, `symbol`, `bucod`, `mwst`, `steucod`), `JJJJMMTT` dates and the 5.5 codes (03 Soll-USt, 01 Ist-USt, 00 Vorsteuer), while NTCS writes `gkonto`, `belegdatum`, `buchdatum`, `buchsymbol`, `buchcode`, `prozent`, `steuercode`, `TT.MM.JJJJ` and uses 1 Umsatzsteuer, 2 Vorsteuer, 3 Vorsteuer-Berichtigung (NTCS_BUCHEN p.5, p.38, Anhang A p.107-108; dvo §9). A 5.5 PR08A import would not recognise the NTCS names and would misread the codes, so the three are never mixed. `BmdRenderOptions.dialect` selects the header, the date format, the output-tax code set for the sign check and the symbol length; each dialect has its own golden file. dvo accepts both header variants. Alternative: separate switches per aspect; rejected, a mixed file matches no BMD version.
3. **`verbuchkz` A, `gegenbuchkz` E.** BMD recommends PR08A; BMD then creates the Gegenbuchung on `gkonto` and the tax posting from `steuer` on its own tax account. The file therefore never contains tax-account lines, and one line is one complete booking.
4. **Sign and Buchungscode.** `betragCents` on `BmdBooking` is signed from the point of view of `konto` (positive = Soll). The writer derives `buchcode` (1 for > 0, 2 for < 0) and refuses 0. `steuerCents` must have the same sign as `betragCents` for an output-tax Steuercode of the dialect (`ntcs`: 1; `bmd55`: 1 and 3) or be 0 (`E-BMD-STEUER-SIGN`). Alternative: a separate side field like DATEV's S/H; rejected because BMD reads the sign, the code is only cosmetic ("ausschlaggebend für Soll/Haben-Wirksamkeit ist nur das Vorzeichen").
5. **Numbers.** `-1000,00`: decimal comma, two decimals, no thousands separator, at most 13 integer digits (NTCS) - else `E-BMD-AMOUNT`. `prozent`: integer or one/two decimals with comma (`10`, `4,9`, `0`), empty when the booking has no Steuercode. dvo limits `prozent` to "Ziffern, max. 2 Stellen", so `4,9` is not dvo-safe; `docs/bmd-format.md` says so (4.9 % applies to staple-food Lieferungen, rarely to a hotel). `steuercode` written as a plain integer (`1`).
6. **Belegnummer.** BMD's `belegnr` is numeric with at most 9 digits, PR08A merges consecutive lines with equal `konto`, `belegnr` and `belegdatum` into a split booking, and NTCS symbols default to "Kontrolle Belegnummer je BuSymbol" (each number once per symbol, NTCS_BUCHEN p.37). A counter that restarts at 1 in every file would repeat across daily, weekly or partial files of one month. The writer therefore numbers bookings in file order as `MMDD` of the period's first day followed by a 5-digit counter starting at 1 (`100100001` for the first booking of a file starting on 1 October, `101400001` for a daily file of 14 October). Files of one property never overlap (`E-PERIOD-OVERLAP`), so no two of them share a first day, and `MMDD` repeats only after twelve months, so numbers are unique within any Wirtschaftsjahr, also an abweichendes one of a Saisonbetrieb. A file holds at most 99,999 bookings (`E-BMD-BELEGNR` otherwise; a large hotel books a few thousand lines a month). Two properties in one Mandant need different Buchungssymbole (b03: `properties[].buchsymbol`). The apaleo receipt or reference goes to `extbelegnr` (alphanumeric, sanitised to `A-Z a-z 0-9 - / . _`, max 35, longer values cut with a note). Alternatives: `MM` + 7-digit counter (repeats in every file of a month; rejected), a per-property prefix (no digits left in 9; rejected), a hash of the apaleo entry number (not readable; rejected).
7. **Dates.** `ntcs`: `TT.MM.JJJJ` (NTCS exports this format, dvo accepts it); `bmd55`: `JJJJMMTT` (PR08 p.10). `buchdatum` = `belegdatum` = the booking's business date; the period (UVA month) then follows the business date, matching the per-month files.
8. **Text.** `text` max 40 characters (dvo reads 40; BMD 5.5 fixed layout had 18, NTCS more). Sanitising replaces `;`, `"`, tab, CR and LF with a space, collapses spaces, maps characters outside CP1252 to `?` with a note, and trims.
9. **Encoding CP1252, CRLF, no BOM.** BMD and dvo are Windows programs; dvo ends a record at CR. The CP1252 encoder moves from `src/datev` to `src/core` so both writers share it while DATEV still exists.
10. **Validation as findings.** `validateBookings` returns all findings at once; `renderBuchungsimport` throws `BmdValidationError` carrying them, like `ExtfValidationError`. Codes: `E-BMD-ACCOUNT` (non-digits, wrong length against `sachkontenlaenge`/`personenkontenlaenge` passed in options), `E-BMD-AMOUNT`, `E-BMD-STEUER-SIGN`, `E-BMD-RATE` (rate with more than two decimals or above 99,99), `E-BMD-STEUERCODE` (not 0-99), `E-BMD-SYMBOL` (not 1-4 of `A-Z0-9` with `ntcs`, not 1-2 with `bmd55`), `E-BMD-KOST` (`kost` not 1-9 digits), `E-BMD-BELEGNR` (more than 99,999 bookings in a file), `E-BMD-DATE` (outside the file period).
11. **File name and sameness.** `BMD_Buchungsimport_<from>-<to>_<propertyId>.csv`; the file has no creation timestamp, so `sameContent` is byte equality.

## Risks / Trade-offs

- [BMD NTCS expects other header names, encoding or date format] → the dialect switch covers the documented 5.5 variant; encoding and text length live in `src/bmd/format.ts`; `docs/bmd-format.md` lists the first-import checklist; a change is one line plus a golden update.
- [`text` cut at 40 hides information] → the apaleo entry number stays traceable via the protocol; length becomes configurable if a Kanzlei asks.
- [Belegnummern collide with the Kanzlei's own numbering under the same Buchungssymbol] → b03 makes `bmd.buchsymbol` required with no default, and `docs/bmd-import.md` tells the Kanzlei to create a dedicated symbol for the PMS import; the protocol prints the number range of each file.

## Migration Plan

None; the module is not wired until b03.

## Open Questions

All are on the first-import checklist in `docs/bmd-format.md`:
- Dialect (NTCS names, dates and codes, or BMD 5.5), encoding and maximum text length in current NTCS.
- Whether the `MMDD` + counter Belegnummern pass the symbol's Belegnummer check without duplicate warnings.
- Whether BMD NTCS rejects a `steuer` that deviates by one cent from `prozent` × `betrag` (b03's VAT guard keeps deviations at most one cent and reports them).
