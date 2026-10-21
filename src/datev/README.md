# src/datev

DATEV-Format (EXTF) Buchungsstapel writer: header line, column layout, validation, sanitising and CP1252 encoding. PMS-neutral; must not import from `src/sources/` (enforced by lint).

```ts
import { buchungsstapelFileName, encodeCp1252, renderBuchungsstapel } from './index.js';

const { text, warnings } = renderBuchungsstapel({ header, bookings }); // throws ExtfValidationError
const { bytes } = encodeCp1252(text);
const name = buchungsstapelFileName(header, 'MUC');
```

Format decisions and the sources they were checked against: [docs/datev-format.md](../../docs/datev-format.md).

No longer used: since b03 the export writes BMD files (`src/bmd`), and nothing in `src/export`, `src/cli`, `src/mapping` or `src/posting` imports this folder. b04 deletes it.
