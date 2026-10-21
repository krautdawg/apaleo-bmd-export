## Why

b03 books the common hotel lines correctly, but leaves the Austrian special cases to the Kanzlei's manual work: Anzahlungen are taxed on receipt (Mindest-Istbesteuerung) and BMD NTCS offers two setups for them, written-off guest receivables need the USt-Berichtigung, Stornogebühren are usually not taxable while no-shows can be, and Ortstaxe / Nächtigungsabgabe differs by Bundesland. These are the cases where a wrong row silently produces a wrong UVA.

## What Changes

- Anzahlungen: deposit rows use the normal output-tax Steuercode (NTCS `1`, which the UVA counts as "+ Anzahlungen" in KZ 000/022/029). Template comment and mapping guide name the alternative NTCS setup (Anzahlungskonto with n.n.fällige USt, NTCS_BUCHEN Anhang C); input-tax codes 2 and 3 stay rejected.
- Forderungsverlust: LossOfAccountsReceivable lines with tax are booked on the bad-debt account as konto with the output-tax Steuercode (NTCS `1`), net and tax positive (reducing USt); untaxed write-offs without Steuercode. EKR template rate wildcards `7800` (10 %), `7802` (13 %), `7801` (20 %), `7809` (0 %) as suggestions, because apaleo books write-offs on per-reservation accounts.
- Stornogebühren / No-Show: template rule for apaleo's cancellation and no-show accounts at 0 % to `4091` without Steuercode; at a rate above 0 the row stays empty with a comment, so the Kanzlei confirms that apaleo's tax is right.
- Ortstaxe / Nächtigungsabgabe / Aufenthaltsabgabe: template comment and mapping guide table by Bundesland, both booking options, never pre-filled.
- An Austrian fixture month in apaleo's real shapes (b02b) covering every case above, with hand-computed totals in the test.
- Mapping guide section on VAT rates: 10 % Beherbergung incl. ortsübliches Frühstück and Speisen; 13 % Schwimmbad, Therme, culture and sports admissions; 20 % massages, spa, parking, most drinks; 4.9 % listed staple foods (UStG § 10, RIS).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `posting-rules`: bad debt with USt-Berichtigung, cancellation fees through the guard, the Austrian fixture month.
- `account-mapping`: deposit row guidance, template rows for bad debt and cancellation fees, Ortstaxe comment.

## Non-goals

- Deciding tax questions for the hotel: the tool books what apaleo charged and checks consistency.
- Booking deposits through BMD's Anzahlungskonto mechanism automatically; the Kanzlei maps the rows.
- Payment-provider fees, chargebacks and booking-portal commissions.

## Impact

- `src/mapping/check.ts`, `templates/ekr-hotel.rules.csv`, `src/posting/build.ts`, `src/posting/describe.ts`, `src/posting/summary.ts`.
- New fixture `test/fixtures/apaleo/at-month/` and `test/posting/fixture-month-at.test.ts`.
- `docs/mapping-guide.md`, `docs/posting-rules.md`, `docs/bmd-format.md` (checklist), `docs/troubleshooting.md`.
