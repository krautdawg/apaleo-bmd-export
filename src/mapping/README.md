# src/mapping

Account mapping: the editable CSV from apaleo accounts to BMD Sachkonten and Personenkonten with Steuercode and rate. PMS-neutral; must not import from `src/sources/` (enforced by lint).

- `load.ts` reads a mapping file (UTF-8 or CP1252, `;` or `,`, decimal comma or point) and rejects DATEV and Grman mappings, duplicate keys and forbidden wildcards.
- `resolve.ts` finds the row for one side of a ledger line (exact, any type, parent chain, rate wildcard, plain wildcard).
- `check.ts` validates rows (`checkMapping`: account lengths, Steuercodes of `bmd.dialect`, Austrian rates, `kost`) and the accounts booked in a period (`checkCoverage`, `E-UNMAPPED`).
- `template.ts` applies the EKR hotel rules in `templates/ekr-hotel.rules.csv` to a chart of accounts.
- `file.ts` writes mapping files and appends rows for `init-mapping --update`.
