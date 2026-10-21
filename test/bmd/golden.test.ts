import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIALECTS, renderBuchungsimport, type BmdBooking, type BmdDialect, type BmdTax } from '../../src/bmd/index.js';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { bmdBooking, bmdPayment, octoberOptions } from '../helpers/bmd.js';
import { describeDifference, type FieldNamer } from '../helpers/golden.js';

/**
 * Byte-for-byte regression tests, one folder per dialect. After an intended
 * change to the writer, run `UPDATE_GOLDEN=1 pnpm test`, read the diff of
 * test/golden/bmd/ and commit it.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';

interface GoldenCase {
  bookings: BmdBooking[];
  notes: string[];
}

/** Output tax of the dialect: Steuercode 1 in NTCS, 3 (Soll-Umsatzsteuer) in BMD 5.5. */
const ust = (dialect: BmdDialect, prozent: number, steuerCents: number): BmdTax => ({ steuercode: dialect === 'ntcs' ? 1 : 3, prozent, steuerCents });

const revenue10 = (dialect: BmdDialect): GoldenCase => ({
  bookings: [bmdBooking({ konto: '4000', tax: ust(dialect, 10, -1_000), text: 'Logis 10%' })],
  notes: [],
});
const payment: GoldenCase = {
  bookings: [bmdPayment(), bmdPayment({ konto: '2700', betragCents: -3_000, text: 'Rückgeld bar', extbelegnr: 'BSP-2026-0043' })],
  notes: [],
};
const deposit = (dialect: BmdDialect): GoldenCase => ({
  // Gross 220.00 received by card: net 200.00 on the deposit account, 20.00 USt, Gegenkonto card clearing.
  bookings: [bmdBooking({ konto: '3200', gkonto: '2890', betragCents: -20_000, tax: ust(dialect, 10, -2_000), text: 'Anzahlung 10%', extbelegnr: 'RES-4711-1' })],
  notes: [],
});

const CASES: Record<BmdDialect, Record<string, GoldenCase>> = {
  ntcs: {
    'revenue-10': revenue10('ntcs'),
    'revenue-20': { bookings: [bmdBooking({ konto: '4020', betragCents: -5_000, tax: ust('ntcs', 20, -1_000), text: 'Getränke 20%' })], notes: [] },
    'revenue-13': { bookings: [bmdBooking({ konto: '4040', betragCents: -3_000, tax: ust('ntcs', 13, -390), text: 'Therme 13%' })], notes: [] },
    'revenue-4-9': { bookings: [bmdBooking({ konto: '4050', betragCents: -2_000, tax: ust('ntcs', 4.9, -98), text: 'Lebensmittel 4,9%' })], notes: [] },
    'untaxed-with-code': {
      bookings: [bmdBooking({ konto: '4090', betragCents: -1_500, tax: { steuercode: 81, prozent: 0, steuerCents: 0 }, text: 'Stornogebühr' })],
      notes: [],
    },
    'untaxed-without-code': {
      bookings: [{ ...withoutTax(bmdBooking({ konto: '4090', betragCents: -1_500 })), text: 'Stornogebühr' }],
      notes: [],
    },
    allowance: { bookings: [bmdBooking({ konto: '4000', betragCents: 2_000, tax: ust('ntcs', 10, 200), text: 'Nachlass Logis 10%', kost: '100' })], notes: [] },
    payment,
    'city-tax': { bookings: [{ ...withoutTax(bmdBooking({ konto: '3550', betragCents: -500 })), text: 'Ortstaxe 2 Nächte' }], notes: [] },
    deposit: deposit('ntcs'),
    umlauts: {
      bookings: [bmdBooking({ konto: '4010', betragCents: -1_800, tax: ust('ntcs', 10, -180), text: 'Frühstück Größe Ä Ö Ü € – „Seeblick“' })],
      notes: [],
    },
    'truncated-text': {
      bookings: [bmdBooking({ text: 'Logis Doppelzimmer Seeblick mit Frühstück und Halbpension; 3 Nächte', extbelegnr: 'BSP-2026-0042-ZAHLUNG-KREDITKARTE-VISA-1234' })],
      notes: ['N-BMD-TRUNCATED', 'N-BMD-TRUNCATED'],
    },
  },
  bmd55: {
    'revenue-10': revenue10('bmd55'),
    payment,
    deposit: deposit('bmd55'),
  },
};

function withoutTax(booking: BmdBooking): BmdBooking {
  const copy = { ...booking };
  delete copy.tax;
  return copy;
}

const fieldNamer =
  (dialect: BmdDialect): FieldNamer =>
  (_line, index) =>
    DIALECTS[dialect].header[index] ?? '?';

const cases = Object.entries(CASES).flatMap(([dialect, byName]) =>
  Object.entries(byName).map(([name, golden]) => [`${dialect}/${name}`, dialect as BmdDialect, golden] as const),
);

describe('BMD golden files', () => {
  it.each(cases)('%s matches its golden file byte for byte', (path, dialect, { bookings, notes }) => {
    const rendered = renderBuchungsimport(bookings, octoberOptions({ dialect }));
    expect(rendered.notes.map((note) => note.code)).toEqual(notes);

    const file = new URL(`../golden/bmd/${path}.csv`, import.meta.url);
    if (UPDATE) {
      mkdirSync(new URL('.', file), { recursive: true });
      writeFileSync(file, rendered.bytes);
    }
    expect(existsSync(file), `missing ${file.pathname}; run UPDATE_GOLDEN=1 pnpm test`).toBe(true);
    const difference = describeDifference(new Uint8Array(readFileSync(file)), rendered.bytes, fieldNamer(dialect));
    expect(difference, `${path}.csv differs from the writer output:\n${difference ?? ''}`).toBeUndefined();
  });

  it('covers at least the cases the spec lists', () => {
    expect(Object.keys(CASES.ntcs)).toEqual(
      expect.arrayContaining([
        'revenue-10',
        'revenue-20',
        'revenue-13',
        'revenue-4-9',
        'untaxed-with-code',
        'untaxed-without-code',
        'allowance',
        'payment',
        'city-tax',
        'deposit',
        'umlauts',
        'truncated-text',
      ]),
    );
    expect(Object.keys(CASES.bmd55)).toEqual(expect.arrayContaining(['revenue-10', 'payment', 'deposit']));
  });

  it('names the BMD field of a changed byte', () => {
    const golden = renderBuchungsimport(CASES.ntcs.payment?.bookings ?? [], octoberOptions()).bytes;
    const changed = renderBuchungsimport([bmdPayment({ betragCents: 12_001 }), ...(CASES.ntcs.payment?.bookings.slice(1) ?? [])], octoberOptions()).bytes;
    expect(describeDifference(golden, changed, fieldNamer('ntcs'))).toBe('line 2:\n  field 11 (betrag): expected 120,00, got 120,01');
  });
});

describe('golden diff helper', () => {
  const golden = renderBuchungsimport(CASES.ntcs.payment?.bookings ?? [], octoberOptions()).bytes;

  it('reports nothing for identical bytes', () => {
    expect(describeDifference(golden, golden.slice())).toBeUndefined();
  });

  it('shows a lost CR in a line end', () => {
    const text = new TextDecoder('windows-1252').decode(golden).replaceAll('\r\n', '\n');
    expect(describeDifference(golden, encodeCp1252(text).bytes)).toContain('\\r\\n');
  });

  it('reports a missing line', () => {
    const shorter = renderBuchungsimport(CASES.ntcs.payment?.bookings.slice(0, 1) ?? [], octoberOptions()).bytes;
    expect(describeDifference(golden, shorter)).toContain('line 3:\n  - expected:');
  });
});
