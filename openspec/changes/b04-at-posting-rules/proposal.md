## Why

b03 books the common hotel lines correctly, but leaves the Austrian special cases to the Kanzlei's manual work: Anzahlungen are taxed on receipt (Mindest-Istbesteuerung) and BMD needs the right Steuercode on the deposit account, written-off guest receivables need the USt-Berichtigung, Stornogebühren are usually not taxable while no-shows can be, and Ortstaxe / Nächtigungsabgabe differs by Bundesland. These are the cases where a wrong row silently produces a wrong UVA.

## What Changes

- Config `bmd.anzahlungSteuercode` (default `1`); `mapping check` warns `W-DEPOSIT-STEUERCODE` when a Liabilities row with a rate above 0 uses another code, so the Kanzlei decides once and the tool holds it.
- Forderungsverlust: LossOfAccountsReceivable lines with tax are booked on the bad-debt account as konto with Steuercode 3, net and tax positive (reducing USt); untaxed write-offs without Steuercode. EKR template rows `7800` (10 %), `7801` (20 %), `7809` (0 %) as suggestions.
- Stornogebühren / No-Show: template rule for revenue accounts named like cancellation or no-show at 0 % to `4091` without Steuercode; at a rate above 0 the row stays empty with a comment, so the Kanzlei confirms that apaleo's tax is right.
- Ortstaxe / Nächtigungsabgabe / Aufenthaltsabgabe: template comment and mapping guide table by Bundesland, both booking options, never pre-filled.
- An Austrian fixture month (rooms, breakfast, drinks, Ortstaxe, deposit received, released and refunded, cancellation fee, card, cash and invoice payments, a write-off) with hand-computed totals in the test.
- Mapping guide section on VAT rates by service date (10 % Beherbergung, 13 % only for special cases, 4.9 % for listed staple foods since 2026-07-01).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `posting-rules`: bad debt with USt-Berichtigung, cancellation fees through the guard, the Austrian fixture month.
- `account-mapping`: deposit Steuercode check, template rows for bad debt and cancellation fees, Ortstaxe comment.

## Non-goals

- Deciding tax questions for the hotel: the tool books what apaleo charged and checks consistency.
- Payment-provider fees, chargebacks and booking-portal commissions.
- Ist-Versteuerung of the whole business (Steuercode 1 on all revenue) beyond what the mapping column already allows.

## Impact

- `src/core/config.ts`, `src/mapping/check.ts`, `templates/ekr-hotel.rules.csv`, `src/posting/build.ts`, `src/posting/describe.ts`.
- New fixture `test/fixtures/apaleo/at-month/` and `test/posting/fixture-month-at.test.ts`.
- `docs/mapping-guide.md`, `docs/posting-rules.md`, `docs/troubleshooting.md`, `docs/configuration.md`.
