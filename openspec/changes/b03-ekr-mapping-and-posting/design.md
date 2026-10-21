## Context

The DATEV engine lets DATEV compute VAT from the gross amount on the Gegenkonto (Automatikkonto or BU-Schlüssel); that is why it skips apaleo's Vat-account lines and guards that DATEV's computed VAT equals apaleo's. BMD works differently (see `openspec/research/bmd-target.md`): the tax is computed or passed on the leading account, the revenue account must be `konto` ("nur am Konto die Entsteuerung"), the amount on a non-Personenkonto is net with `steuer` given explicitly, and with `verbuchkz` A BMD books the Gegenbuchung (gross) on `gkonto` and the tax on its own USt account. apaleo's `export-gross-daily` lines already carry gross, net and `taxes[]` per line, so the file can pass apaleo's own tax amounts and BMD's UVA equals apaleo's VAT by construction.

## Goals / Non-Goals

**Goals:**
- One BMD line per apaleo ledger line that is not skipped, traceable to the apaleo entry number.
- The VAT that BMD books equals the VAT apaleo charged, per line and per rate, in the UVA Kennzahlen for Umsatzsteuer (NTCS Steuercode 1).
- A Kontenzuordnung a Kanzlei can review row by row, pre-filled from the EKR.
- Reuse the engine: the review can check that only the target-specific parts changed.

**Non-Goals:**
- Aggregating lines (one line per booking day and account, like a "Summendatei"): later, if Kanzleien ask.
- Personenkonten per company or per guest.
- Deleting the DATEV code (b04). After this slice `src/datev` is still in the tree but no longer imported by `src/export`, `src/cli` or `src/posting`.

## Kept unchanged

These modules are reused as they are; their tests change only where account numbers or the booking type appear in fixtures:
- `src/sources/apaleo/` (adapter, OAuth, paging, Swagger shapes) and `src/core/source.ts`.
- Deposit-release rate inference in `src/posting/release.ts` (PostPrepaymentVat pair, chart rate, `W-VAT-INFERRED`, `E-VAT-RATE-UNKNOWN`); only the tax amount is added.
- Skip rules (`VAT_ACCOUNT_LINE`, `ZERO_AMOUNT`, `SAME_ACCOUNT`) and the `taxes[]` normalisation.
- Mapping resolution order and wildcard rules in `src/mapping/resolve.ts`, and the Excel padding rule in `account-length.ts`.
- Output folder, lock, overlap and manifest logic in `src/export/output.ts` (behind the b01 `TargetWriter`), period rules, the conservation check and the aggregate check.
- `schedule --once`, the CLI dispatcher and the config loader mechanics (allow-list, secrets, error messages).

Rewritten: the mapping row type and CSV columns, `src/mapping/check.ts`, the template, the direction rule in `src/posting/build.ts`, the VAT guard in `src/posting/taxes.ts`, field filling, the summary and the movement function used by `src/export/checks.ts`.

## Decisions

1. **VAT side in `konto`.** For each line both sides are resolved through the mapping. The side whose row has a Steuercode is the VAT side. If there is one, `konto` = VAT-side account, `gkonto` = the other side, `betrag` = apaleo net from the VAT side's point of view (negative when the VAT side is credited, i.e. a normal sale or a received deposit; positive for an allowance or a release), `steuer` = apaleo's tax amount with the same sign, `prozent` and `steuercode` from the row. Without a VAT side: `konto` = debited account, `gkonto` = credited account, `betrag` = |gross|, no tax fields. A negative gross swaps the sides. Two VAT sides → `E-TWO-VAT-SIDES`. Alternative: always debit side as `konto` with gross and tax; rejected because BMD only computes tax on the leading Sachkonto and expects net there.
2. **Explicit tax instead of DATEV recomputation.** The guard keeps its structure but checks different facts: the row's `bmd_vat_percent` equals apaleo's percent (`E-VAT-RATE`), net + tax = gross (`E-VAT-AMOUNT` otherwise), BMD's own check `round(|net| × rate / 100)` is within one cent of apaleo's tax (`W-VAT-ROUNDING`, more → `E-VAT-AMOUNT`), taxed line without VAT side (`E-VAT-MISSING`), untaxed line with VAT side at a rate above 0 (`E-VAT-UNEXPECTED`), several rates (`E-VAT-MIXED`), opposite signs (`E-VAT-SIGN`). A VAT side at rate 0 (an untaxed revenue row with a non-taxable Steuercode) is valid and books tax 0.
3. **Skip apaleo's Vat lines as before.** The tax reaches BMD through `steuer` on the revenue line; booking apaleo's `Vat`/`VatOnLiabilities` lines as well would double it.
4. **Deposit releases without `taxes[]`.** The existing inference is kept. Tax amount: the sum of the paired PostPrepaymentVat amounts; with a chart rate only, `round(|gross| × rate / (100 + rate))`, which is what apaleo would have computed. Net = gross − tax.
5. **Steuercodes follow the dialect (`bmd.dialect`, default `ntcs`).** In BMD NTCS, 1 is Umsatzsteuer (UVA KZ 000/022/029, also for Anzahlungen), 2 Vorsteuer, 3 the Vorsteuer correction "nicht abzugsfähig gem. § 12 Abs. 3" (KZ 062) (NTCS_BUCHEN Anhang A p.107-108, dvo §9); Soll- or Ist-Versteuerung is set in the Firmen/FIBU master data, not per booking. So with `ntcs` the output-tax set is {1}, and the codes 2 and 3 are rejected on revenue-side types (Revenues, Liabilities, CityTaxes, SecondCityTax, GuestLevies, LossOfAccountsReceivable) as `E-STEUERCODE-INPUT-TAX`. With `bmd55` the output-tax set is {1, 3} and 0 is rejected. Other codes get `W-STEUERCODE-UNCHECKED`. The template writes the dialect's normal output-tax code (1 with `ntcs`, 3 with `bmd55`). An earlier draft used the 5.5 meanings for NTCS; that would have put all revenue into KZ 062.
6. **Mapping rows.** `steuercode` empty means "no tax on this row"; `bmd_vat_percent` is required with a Steuercode and must be empty or 0 without one. A Steuercode at rate 0 is allowed (for example 81 "Umsatz nicht steuerbar" from dvo §9, unconfirmed for NTCS, so it carries `W-STEUERCODE-UNCHECKED`). Because NTCS fills Steuercode and Prozent stored on an account into an empty booking field (Feld 152/153 FIX, NTCS_BUCHEN p.40, p.63), a Revenues row at 0 % without Steuercode gets `W-UNTAXED-REVENUE`, telling the Kanzlei to check that the account has no fixed Steuercode or to enter the non-taxable code. Rates outside 0, 4.9, 10, 13, 20 give `W-VAT-RATE-UNUSUAL` (catches a copied German 7 %/19 % mapping). AccountsReceivable rows may use a Personenkonto (`personenkontenlaenge` digits); every other row uses `sachkontenlaenge` digits. `kost` must be 1-9 digits (`E-KOST-FORMAT`); on rows other than Revenues and LossOfAccountsReceivable it is never written (`W-KOST-IGNORED`).
7. **`kost` only on profit-and-loss lines.** BMD reads `kost` as Kostenstelle on revenue and expense bookings, but on payments as the Belegnummer of the invoice the payment clears (PR08 p.10, HOW2 N). The posting module therefore takes `kost` only from the `konto` row and only when that row is of type Revenues or LossOfAccountsReceivable; payment, Personenkonto, deposit and clearing lines never carry it.
8. **Buchungssymbol required, optional payment symbol.** In NTCS the `AR` symbol has Buchungstyp "Rechnung (umsatzrelevant)" and Kontenart rules that can refuse the Passiv accounts of deposits and Ortstaxe (NTCS_BUCHEN p.43-44), and payments booked under it count as revenue documents. So `bmd.buchsymbol` has no default: the config must name a symbol the Kanzlei created, and `docs/bmd-import.md` explains how (for example `HO`, copied from AR with every Kontenart allowed). `bmd.buchsymbolZahlung` (optional, default: `bmd.buchsymbol`) is used for lines without VAT side that have a side of type Payments, so the Kanzlei can book them under a symbol with Buchungstyp Zahlung. `properties[].buchsymbol` and `properties[].buchsymbolZahlung` override both per property; two properties with the same effective symbol get `W-BUCHSYMBOL-SHARED` from `doctor` and in the protocol, because in one Mandant their Belegnummern would repeat.
9. **EKR template.** Rule-based like the SKR templates (type, rate, name pattern), 4-digit base numbers scaled with trailing zeros to `sachkontenlaenge`: 4000 Beherbergung 10 %, 4010 Speisen 10 %, 4020 Getränke 20 %, 4030 sonstige Erlöse 20 %, 4040 Erlöse 13 %, 4050 Erlöse 4,9 %, 4090 Erlöse 0 % (no Steuercode, comment on the fixed-code check), 2700 Kassa, 2890 Schwebende Geldbewegungen for every non-cash payment, 2390 Verrechnung Gastforderungen, Personenkonto 200000 Sammeldebitor for AccountsReceivable, 3200/3201 erhaltene Anzahlungen 10 %/20 % (output-tax code of the dialect) and 3209 at 0 %. City tax, LossOfAccountsReceivable, House and TransitoryItems rows stay empty with a comment. All rows marked "Vorschlag (ungeprüft)".
10. **Movement model for the plausibility checks.** The target supplies `movements(booking)`: `konto` += `betrag`, `gkonto` −= `betrag + steuer`. The tax leg is BMD's, so the account-balance check compares only mapped apaleo accounts; the VAT-per-rate check sums `steuer` per rate against apaleo's tax lines (exact, plus the noted roundings). Conservation is unchanged.
11. **Demo and fixtures in this slice.** The demo is the README quick start and a CI job; with the new mapping format a German demo (7 %/19 %, SKR accounts) would fail `mapping check`. The demo data, posting fixtures and `docs/examples/` are therefore converted here, not with the DATEV deletion in b04.
12. **DATEV deletion in its own slice (b04).** Removing `src/datev`, the SKR templates, the Grman reader, the Automatikkonten code and the DATEV tests and docs touches hundreds of lines but no behaviour; keeping it out of this slice lets the review see the engine switch alone.

## Risks / Trade-offs

- [The Kanzlei's Kontenplan differs from the EKR proposals] → template rows are suggestions, unmatched accounts stay unmapped and block the export; the mapping guide ends with the sign-off checklist.
- [Anzahlungen: the Kanzlei uses BMD's Anzahlungskonto with not-yet-due USt instead of direct USt on the deposit account] → per-row account and code; template proposes code 1 with a comment; b05 documents both setups.
- [Sammeldebitor hides who owes what] → OP-Nummer via `extbelegnr` (invoice number) keeps open items traceable; Personenkonten per company are a later slice.
- [Required `bmd.buchsymbol` adds a setup step] → the error names the key and `docs/bmd-import.md`; the example config shows `HO` with the comment that the symbol must exist in BMD.

## Migration Plan

No users yet. The demo mapping and fixtures are regenerated from the EKR template; existing DATEV mapping files are not converted.

## Open Questions

- Whether Kanzleien prefer one Verrechnungskonto for all guest folios (2390) or Forderungen L+L by rate (EKR 201/202).
- Which non-taxable Steuercode (if any) NTCS expects on 0 % revenue (first test import).
