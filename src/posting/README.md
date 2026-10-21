# src/posting

Posting rules that turn ledger lines into BMD bookings. PMS-neutral; must not import from `src/sources/` (enforced by lint). Rules and codes: [docs/posting-rules.md](../../docs/posting-rules.md).

- `build.ts`: `buildBookings(lines, mapping, chart, options)`, the pure entry point; resolution, skip rules and the direction rule (the side with a Steuercode leads as `konto`, with net `betrag` and apaleo's tax in `steuer`).
- `guard.ts`: the VAT consistency guard per line, with BMD's own check value (`W-VAT-ROUNDING`).
- `release.ts`: rate and tax inference for deposit releases without `taxes[]` (`PostPrepaymentVat` pair, then chart) and for untaxed deposit refunds and receipts with a matching pair, also used by `mapping check --from --to`.
- `taxes.ts`: tax normalisation, the tax contained in a gross amount and BMD's check value.
- `fields.ts`: extbelegnr, German Buchungstext without guest names, `kost` only on revenue and bad-debt bookings.
- `summary.ts`: the posting summary and the movement model (`konto` by Betrag, `gkonto` by Betrag plus Steuer).
