## Context

`openspec/research/bmd-target.md` collects the field rules from BMD's PR08/PR08A description (BMD 5.5, 2015), the BMD HOW2 import guide, the NTCS change notes (Vorsteuer code 2, NTCS field names), the dvo BuErf handbook (2021), the Hausleitner fixed-layout interface and open-source exporters (heliumv, funkring at_bmd, TdTools). BMD itself publishes no current spec, and no BMD installation is available, so the writer follows the intersection of these sources and keeps every choice that is uncertain in one place (`src/bmd/format.ts`) for the first real import with a Kanzlei.

## Goals / Non-Goals

**Goals:**
- A file that BMD NTCS, BMD 5.5 (PR08A, variable layout) and dvo's BuErf import all read without manual editing.
- Deterministic bytes: same bookings, same file, so idempotent re-runs and golden tests work.
- PMS-neutral: the writer knows BMD, not apaleo.

**Non-Goals:**
- Posting decisions (which account is `konto`, which Steuercode): those belong to b03.
- Supporting every BMD field. Only Satzart 0 fields that a hotel ledger export needs.

## Decisions

1. **Variable layout with header, `;` separator.** Accepted by PR08 ("Tabulator und Strichpunkt werden ... automatisch erkannt"), NTCS and dvo; editable in Excel by the Kanzlei. Alternative: fixed 480-byte records (needs every field, padding and `+/-` suffixes; harder to review). Rejected.
2. **NTCS column names.** `gkonto`, `belegdatum`, `buchdatum`, `prozent`, `steuercode`, `buchcode`, `buchsymbol` are what NTCS writes in its own exports and what dvo accepts next to the 5.5 names. A config switch for 5.5 names is added only if a test import needs it (open question).
3. **`verbuchkz` A, `gegenbuchkz` E.** BMD recommends PR08A; BMD then creates the Gegenbuchung on `gkonto` and the tax posting from `steuer` on its own tax account. The file therefore never contains tax-account lines, and one line is one complete booking.
4. **Sign and Buchungscode.** `betragCents` on `BmdBooking` is signed from the point of view of `konto` (positive = Soll). The writer derives `buchcode` (1 for > 0, 2 for < 0) and refuses 0. `steuerCents` must have the same sign as `betragCents` for output-tax codes (1, 3) or be 0 (`E-BMD-STEUER-SIGN`). Alternative: a separate side field like DATEV's S/H; rejected because BMD reads the sign, the code is only cosmetic ("ausschlaggebend für Soll/Haben-Wirksamkeit ist nur das Vorzeichen").
5. **Numbers.** `-1000,00`: decimal comma, two decimals, no thousands separator, at most 13 integer digits (NTCS) - else `E-BMD-AMOUNT`. `prozent`: integer or one/two decimals with comma (`10`, `4,9`, `0`), empty when the booking has no Steuercode. `steuercode` written as a plain integer (`3`).
6. **Belegnummer.** BMD's `belegnr` is numeric with at most 9 digits, and PR08A merges consecutive lines with equal `konto`, `belegnr` and `belegdatum` into a split booking. The writer numbers bookings in file order as `MM` (month of the period start) followed by a 7-digit counter starting at 1 (`100000001` for the first October booking). Unique per month and year, never merges, and the same input always gives the same numbers. The apaleo receipt or reference goes to `extbelegnr` (alphanumeric, sanitised to `A-Z a-z 0-9 - / . _`, max 35, longer values cut with a note). Alternative: hash of the apaleo entry number; rejected as not readable and still capped at 9 digits.
7. **Dates `TT.MM.JJJJ`.** NTCS exports this format, dvo accepts it. `buchdatum` = `belegdatum` = the booking's business date; the period (UVA month) then follows the business date, matching the per-month files.
8. **Text.** `text` max 40 characters (dvo reads 40; BMD 5.5 fixed layout had 18, NTCS more). Sanitising replaces `;`, `"`, tab, CR and LF with a space, collapses spaces, maps characters outside CP1252 to `?` with a note, and trims.
9. **Encoding CP1252, CRLF, no BOM.** BMD and dvo are Windows programs; dvo ends a record at CR. The CP1252 encoder moves from `src/datev` to `src/core` so both writers share it while DATEV still exists.
10. **Validation as findings.** `validateBookings` returns all findings at once; `renderBuchungsimport` throws `BmdValidationError` carrying them, like `ExtfValidationError`. Codes: `E-BMD-ACCOUNT` (non-digits, wrong length against `sachkontenlaenge`/`personenkontenlaenge` passed in options), `E-BMD-AMOUNT`, `E-BMD-STEUER-SIGN`, `E-BMD-RATE` (rate with more than two decimals or above 99,99), `E-BMD-STEUERCODE` (not 0-99), `E-BMD-SYMBOL` (not 1-4 of `A-Z0-9`), `E-BMD-BELEGNR` (more than 9,999,999 bookings in a file), `E-BMD-DATE` (outside the file period).
11. **File name and sameness.** `BMD_Buchungsimport_<from>-<to>_<propertyId>.csv`; the file has no creation timestamp, so `sameContent` is byte equality.

## Risks / Trade-offs

- [BMD NTCS expects other header names, encoding or date format] → all three live in `src/bmd/format.ts`; `docs/bmd-format.md` lists the first-import checklist; changing them is a one-line change plus golden update.
- [`text` cut at 40 hides information] → the apaleo entry number stays traceable via the protocol; length becomes configurable if a Kanzlei asks.
- [Running Belegnummer collides with the Kanzlei's own numbering in the same Buchungssymbol] → the symbol is configurable (b03, default `AR`); the docs recommend a dedicated symbol such as `HO`.

## Migration Plan

None; the module is not wired until b03.

## Open Questions

- Header style, encoding, date format and maximum text length in current NTCS (first test import).
- Whether BMD NTCS rejects a `steuer` that deviates by one cent from `prozent` × `betrag` (b03's VAT guard keeps deviations at most one cent and reports them).
