# src/bmd

BMD Buchungsimport writer (BMD-Standard, Satzart 0, variable layout with header line, `;`, Windows-1252, CRLF): dialects, field formats, validation, sanitising and Belegnummern. PMS-neutral; must not import from `src/sources/` (enforced by lint). Not wired into `export` yet; b03 switches the pipeline to `bmdTarget`.

```ts
import { buchungsimportFileName, renderBuchungsimport } from './index.js';

const options = { dialect: 'ntcs', from: '2026-10-01', to: '2026-10-31', propertyId: 'BSP', sachkontenlaenge: 4, personenkontenlaenge: 6 } as const;
const { bytes, notes } = renderBuchungsimport(bookings, options); // throws BmdValidationError with every E-BMD-* finding
const name = buchungsimportFileName(options); // BMD_Buchungsimport_20261001-20261031_BSP.csv
```

- `types.ts`: `BmdBooking` (amount signed from `konto`, positive = Soll) and `BmdRenderOptions`.
- `format.ts`: the dialect table (`ntcs`, `bmd55`) and every format choice the first Kanzlei import may change.
- `validate.ts`, `sanitise.ts`, `writer.ts`: `E-BMD-*` errors, `N-BMD-*` notes, the file.
- `target.ts`: `bmdTarget`, the export's `TargetWriter` (file name, `BMD_Buchungsimport_...` pattern, byte-equality `sameContent`, the `DEMO ` text prefix of a demo file, BMD advice).
- `import-block.ts`: the protocol's import block (file, lines, dialect, Buchungssymbole, Belegnummern, `verbuchkz`/`gegenbuchkz`, Steuercodes with rates, account lengths).

Format decisions, sources and the checklist for the first test import: [docs/bmd-format.md](../../docs/bmd-format.md).
