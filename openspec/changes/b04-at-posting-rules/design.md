## Context

After b03 every apaleo line is booked by one mechanism: the row with a Steuercode is `konto`, apaleo's net and tax are passed. Whether the booking is right then depends only on the mapping rows. The cases below are the ones where Austrian law or BMD practice differs from a plain sale and where a German-trained default (or no default) leads to a wrong UVA. Sources are in `openspec/research/bmd-target.md` (UStG § 10 and § 19, WKO notes on Stornogebühren, KFS/BW 6 groups 32 and 780-781, BMD Steuercodes).

## Goals / Non-Goals

**Goals:**
- Make each Austrian special case visible in the mapping and checked, with one documented default.
- One fixture month that exercises all of them, with totals a Kanzlei can recompute by hand.

**Non-Goals:**
- Second-guessing apaleo's tax per line (for example re-taxing a no-show): the guard checks consistency between apaleo and the mapping, not the law.

## Decisions

1. **Deposit Steuercode as a config value.** BMD sources agree that `01` is "Ist-Umsatzsteuer" and `03` "Soll-Umsatzsteuer"; dvo lists a separate code for "Anzahlung bei Ist- und Sollversteuerern". Which one a Kanzlei uses for Anzahlungen in NTCS depends on its setup (tax accounts, Evidenzkonto). The tool proposes `1`, stores the Kanzlei's choice in `bmd.anzahlungSteuercode`, and warns per row when a Liabilities row with a rate deviates (`W-DEPOSIT-STEUERCODE`). Alternative: hard-code `1`; rejected, it would force wrong data on Kanzleien that use `3` plus an Evidenzkonto.
2. **Forderungsverlust.** apaleo posts the write-off as debit LossOfAccountsReceivable, credit receivables, with `taxes[]` when the VAT is corrected. With the bad-debt row carrying Steuercode 3 and the rate, the b03 direction rule already yields konto = bad-debt account, amount = +net, tax = +tax (an output-tax reduction, the sign BMD uses for an AR-Gutschrift). b04 adds the template rows, the summary line "Forderungsverluste" and tests, and refuses an input-tax code on the row (already `E-STEUERCODE-INPUT-TAX`).
3. **Cancellation fees by template, not by heuristic in posting.** A name-pattern rule in the template (Storno, Cancellation, Stornogebühr) at 0 % proposes `4091` "Stornoerlöse (nicht steuerbar)". At a rate above 0 the template leaves the row empty with a comment ("No-Show kann steuerbar sein, Stornogebühr meist nicht; mit der Kanzlei klären"). Posting stays rule-free.
4. **Ortstaxe documented per Bundesland.** A small table in `docs/mapping-guide.md`: Land, usual name (Ortstaxe, Nächtigungsabgabe, Aufenthaltsabgabe, Tourismusabgabe), owed by the guest, collected by the hotel; options (a) liability to the Gemeinde / Tourismusverband in EKR 350-359 or 370-389, (b) the Kanzlei's durchlaufender Posten; never a revenue account unless apaleo taxes it. The template comment points to the table. No pre-filled account.
5. **Fixture month.** Fabricated apaleo responses for one Austrian property (Europe/Vienna), shaped exactly like the Swagger schemas, no real guest data; totals written as constants in the test with the arithmetic in comments.

## Risks / Trade-offs

- [Kanzlei uses neither 1 nor 3 for Anzahlungen] → any 0-99 code is allowed in the row; only the warning names the configured value.
- [apaleo taxes a cancellation fee that should be untaxed] → the template does not map it; `mapping check` shows `E-UNMAPPED` until the Kanzlei decides.

## Migration Plan

None; new config key with a default, template rows only affect new or `--update` runs.

## Open Questions

- Confirm `bmd.anzahlungSteuercode` default `1` with the first Kanzlei test import.
