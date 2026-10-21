## Context

The DATEV engine lets DATEV compute VAT from the gross amount on the Gegenkonto (Automatikkonto or BU-Schlüssel); that is why it skips apaleo's Vat-account lines and guards that DATEV's computed VAT equals apaleo's. BMD works differently (see `openspec/research/bmd-target.md`): the tax is computed or passed on the leading account, the revenue account must be `konto` ("nur am Konto die Entsteuerung"), the amount on a non-Personenkonto is net with `steuer` given explicitly, and with `verbuchkz` A BMD books the Gegenbuchung (gross) on `gkonto` and the tax on its own USt account. apaleo's `export-gross-daily` lines already carry gross, net and `taxes[]` per line, so the file can pass apaleo's own tax amounts and BMD's UVA equals apaleo's VAT by construction.

## Goals / Non-Goals

**Goals:**
- One BMD line per apaleo ledger line that is not skipped, traceable to the apaleo entry number.
- The VAT that BMD books equals the VAT apaleo charged, per line and per rate.
- A Kontenzuordnung a Kanzlei can review row by row, pre-filled from the EKR.

**Non-Goals:**
- Aggregating lines (one line per booking day and account, like a "Summendatei"): later, if Kanzleien ask.
- Personenkonten per company or per guest.

## Decisions

1. **VAT side in `konto`.** For each line both sides are resolved through the mapping. The side whose row has a Steuercode is the VAT side. If there is one, `konto` = VAT-side account, `gkonto` = the other side, `betrag` = apaleo net from the VAT side's point of view (negative when the VAT side is credited, i.e. a normal sale or a received deposit; positive for an allowance or a release), `steuer` = apaleo's tax amount with the same sign, `prozent` and `steuercode` from the row. Without a VAT side: `konto` = debited account, `gkonto` = credited account, `betrag` = |gross|, no tax fields. A negative gross swaps the sides. Two VAT sides → `E-TWO-VAT-SIDES`. Alternative: always debit side as `konto` with gross and tax; rejected because BMD only computes tax on the leading Sachkonto and expects net there.
2. **Explicit tax instead of DATEV recomputation.** The guard keeps its structure but checks different facts: the row's `bmd_vat_percent` equals apaleo's percent (`E-VAT-RATE`), net + tax = gross (`E-VAT-AMOUNT` otherwise), BMD's own check `round(|net| × rate / 100)` is within one cent of apaleo's tax (`W-VAT-ROUNDING`, more → `E-VAT-AMOUNT`), taxed line without VAT side (`E-VAT-MISSING`), untaxed line with VAT side at a rate above 0 (`E-VAT-UNEXPECTED`), several rates (`E-VAT-MIXED`), opposite signs (`E-VAT-SIGN`). Rounding differences no longer reach the UVA because BMD books the passed amount.
3. **Skip apaleo's Vat lines as before.** The tax reaches BMD through `steuer` on the revenue line; booking apaleo's `Vat`/`VatOnLiabilities` lines as well would double it. Same skip reasons as before (`VAT_ACCOUNT_LINE`, `ZERO_AMOUNT`, `SAME_ACCOUNT`).
4. **Deposit releases without `taxes[]`.** The existing inference (PostPrepaymentVat pair of the same day and reference, else chart rate with `W-VAT-INFERRED`, else `E-VAT-RATE-UNKNOWN`) is kept. Tax amount: the sum of the paired PostPrepaymentVat amounts; with a chart rate only, `round(|gross| × rate / (100 + rate))`, which is what apaleo would have computed. Net = gross − tax.
5. **Mapping rows.** `steuercode` empty means "no tax on this row"; `bmd_vat_percent` is required with a Steuercode and must be empty or 0 without one. Known output-tax codes are 1 (Ist-USt) and 3 (Soll-USt, normal); 0 and 2 are input-tax codes and rejected on revenue-side types (`E-STEUERCODE-INPUT-TAX`); other codes are accepted with `W-STEUERCODE-UNCHECKED`. Rates outside 0, 4.9, 10, 13, 20 give `W-VAT-RATE-UNUSUAL` (catches a copied German 7 %/19 % mapping). AccountsReceivable rows may use a Personenkonto (`personenkontenlaenge` digits); every other row uses `sachkontenlaenge` digits. No padding guesses for BMD accounts except the Excel case (leading zeros stripped from a class-0 account at length 4), as before.
6. **EKR template.** Rule-based like the SKR templates (type, rate, name pattern), 4-digit base numbers scaled with trailing zeros to `sachkontenlaenge`: 4000 Beherbergung 10 %, 4010 Speisen 10 %, 4020 Getränke 20 %, 4030 sonstige Erlöse 20 %, 4040 Erlöse 13 %, 4050 Erlöse 4,9 %, 4090 Erlöse 0 % (no Steuercode), 2700 Kassa, 2890 Schwebende Geldbewegungen for every non-cash payment, 2390 Verrechnung Gastforderungen, Personenkonto 200000 Sammeldebitor for AccountsReceivable, 3200/3201 erhaltene Anzahlungen 10 %/20 % (Steuercode 1, to be confirmed) and 3209 at 0 %. City tax, LossOfAccountsReceivable, House and TransitoryItems rows stay empty with a comment. All rows marked "Vorschlag (ungeprüft)".
7. **Movement model for the plausibility checks.** The target supplies `movements(booking)`: `konto` += `betrag`, `gkonto` −= `betrag + steuer`. The tax leg is BMD's, so the account-balance check compares only mapped apaleo accounts; the VAT-per-rate check sums `steuer` per rate against apaleo's tax lines (exact, plus the noted roundings). Conservation is unchanged.
8. **Remove DATEV in the same slice.** Keeping two mapping formats would double the test matrix for no user. `docs/datev-*.md`, SKR templates and `test/datev/` go; the golden DATEV example in `docs/examples/` is replaced by a BMD one in b05 (until then `docs/examples/` holds the b02 golden BMD file).

## Risks / Trade-offs

- [The Kanzlei's Kontenplan differs from the EKR proposals] → template rows are suggestions, unmatched accounts stay unmapped and block the export; the mapping guide ends with the sign-off checklist.
- [Steuercode for Anzahlungen is unclear in NTCS] → per-row column; template proposes 1 with an explicit comment; b04 adds the check and documentation.
- [Sammeldebitor hides who owes what] → OP-Nummer via `extbelegnr` (invoice number) keeps open items traceable; Personenkonten per company are a later slice.

## Migration Plan

No users yet. The demo mapping and fixtures are regenerated from the EKR template; existing DATEV mapping files are not converted.

## Open Questions

- Whether Kanzleien prefer one Verrechnungskonto for all guest folios (2390) or Forderungen L+L by rate (EKR 201/202).
