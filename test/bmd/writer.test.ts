import { describe, expect, it } from 'vitest';
import { BmdValidationError } from '../../src/bmd/errors.js';
import { buchungsimportFileName, renderBuchungsimport } from '../../src/bmd/writer.js';
import { bmdBooking, bmdPayment, dataLines, octoberOptions } from '../helpers/bmd.js';

const NTCS_HEADER = 'satzart;konto;gkonto;belegnr;belegdatum;buchdatum;buchsymbol;buchcode;prozent;steuercode;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz';
const BMD55_HEADER = 'satzart;konto;gkto;belegnr;belegdat;buchdat;symbol;bucod;mwst;steucod;betrag;steuer;text;kost;extbelegnr;gegenbuchkz;verbuchkz';

describe('dialect', () => {
  it('uses ntcs without a dialect option', () => {
    const options = octoberOptions();
    delete options.dialect;
    const { text } = renderBuchungsimport([bmdBooking()], options);
    expect(text.split('\r\n')[0]).toBe(NTCS_HEADER);
    expect(dataLines(text)[0]).toContain(';14.10.2026;14.10.2026;');
  });

  it('writes the BMD 5.5 header, dates and codes with bmd55', () => {
    const booking = bmdBooking({ tax: { steuercode: 3, prozent: 10, steuerCents: -1_000 } });
    const { text } = renderBuchungsimport([booking], octoberOptions({ dialect: 'bmd55' }));
    expect(text).toBe(`${BMD55_HEADER}\r\n0;4010;2390;100100001;20261014;20261014;HO;2;10;3;-100,00;-10,00;Erlös Beherbergung;;BSP-2026-0042;E;A\r\n`);
  });
});

describe('header line', () => {
  it('is the whole file of an empty month', () => {
    const { text, bytes, notes } = renderBuchungsimport([], octoberOptions());
    expect(text).toBe(`${NTCS_HEADER}\r\n`);
    expect(bytes).toHaveLength(NTCS_HEADER.length + 2);
    expect(notes).toEqual([]);
  });

  it('is followed by lines of exactly 17 fields', () => {
    const { text } = renderBuchungsimport([bmdBooking(), bmdPayment(), bmdBooking({ text: 'Zahlung; Visa', kost: '10' })], octoberOptions());
    const lines = text.split('\r\n').slice(0, -1);
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line.split(';')).toHaveLength(17);
  });
});

describe('booking line format', () => {
  it('writes revenue at 10 % with the revenue account leading', () => {
    const { text } = renderBuchungsimport([bmdBooking()], octoberOptions());
    expect(dataLines(text)).toEqual(['0;4010;2390;100100001;14.10.2026;14.10.2026;HO;2;10;1;-100,00;-10,00;Erlös Beherbergung;;BSP-2026-0042;E;A']);
  });

  it('writes a payment without tax with buchcode 1 and empty tax fields', () => {
    const fields = dataLines(renderBuchungsimport([bmdPayment()], octoberOptions()).text)[0]?.split(';') ?? [];
    expect(fields.slice(1, 3)).toEqual(['2890', '2390']);
    expect(fields[7]).toBe('1'); // buchcode
    expect([fields[8], fields[9], fields[11], fields[13]]).toEqual(['', '', '', '']); // prozent, steuercode, steuer, kost
    expect(fields[10]).toBe('120,00');
  });

  it('derives buchcode from the sign only', () => {
    const lines = dataLines(renderBuchungsimport([bmdPayment({ betragCents: 1 }), bmdPayment({ betragCents: -1 })], octoberOptions()).text);
    expect(lines.map((line) => line.split(';')[7])).toEqual(['1', '2']);
    expect(lines.map((line) => line.split(';')[10])).toEqual(['0,01', '-0,01']);
  });

  it('writes a decimal rate with a comma', () => {
    const line = dataLines(renderBuchungsimport([bmdBooking({ tax: { steuercode: 1, prozent: 4.9, steuerCents: -490 } })], octoberOptions()).text)[0];
    expect(line?.split(';')[8]).toBe('4,9');
  });

  it('writes untaxed revenue with a non-taxable Steuercode', () => {
    const rendered = renderBuchungsimport([bmdBooking({ konto: '4090', tax: { steuercode: 81, prozent: 0, steuerCents: 0 } })], octoberOptions());
    const fields = dataLines(rendered.text)[0]?.split(';') ?? [];
    expect([fields[8], fields[9], fields[11]]).toEqual(['0', '81', '0,00']);
    expect(rendered.notes).toEqual([]);
  });

  it('writes kost and leaves text and extbelegnr empty when not given', () => {
    const payment = bmdPayment({ kost: '100', extbelegnr: '' });
    delete payment.text;
    const line = dataLines(renderBuchungsimport([payment], octoberOptions()).text)[0];
    expect(line).toBe('0;2890;2390;100100001;14.10.2026;14.10.2026;HO;1;;;120,00;;;100;;E;A');
  });
});

describe('Belegnummer', () => {
  it('numbers a January file from 010100001', () => {
    const options = octoberOptions({ from: '2027-01-01', to: '2027-01-31' });
    const bookings = [1, 2, 3].map(() => bmdPayment({ businessDate: '2027-01-05' }));
    expect(dataLines(renderBuchungsimport(bookings, options).text).map((line) => line.split(';')[3])).toEqual(['010100001', '010100002', '010100003']);
  });

  it('gives consecutive bookings with the same konto and date different numbers', () => {
    const lines = dataLines(renderBuchungsimport([bmdBooking(), bmdBooking()], octoberOptions()).text);
    const [first, second] = lines.map((line) => line.split(';'));
    expect(first?.[1]).toBe(second?.[1]);
    expect(first?.[4]).toBe(second?.[4]);
    expect(first?.[3]).not.toBe(second?.[3]);
  });
});

describe('encoding', () => {
  it('writes umlauts as Windows-1252 bytes and ends every line with CRLF, without BOM or quotes', () => {
    const { bytes, text } = renderBuchungsimport([bmdPayment({ text: 'Getränke Frühstück' })], octoberOptions());
    expect(bytes).toContain(0xe4);
    expect(bytes).toContain(0xfc);
    expect([...bytes.slice(-2)]).toEqual([0x0d, 0x0a]);
    expect(bytes[0]).toBe('s'.charCodeAt(0));
    expect(bytes).toHaveLength(text.length);
    expect(text).not.toContain('"');
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
  });
});

describe('validation and sanitising', () => {
  it('throws one BmdValidationError with every finding and returns no bytes', () => {
    const bookings = [bmdBooking(), bmdBooking({ konto: '40A0' }), bmdBooking(), bmdBooking(), bmdPayment({ betragCents: 0 })];
    let error: unknown;
    try {
      renderBuchungsimport(bookings, octoberOptions());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BmdValidationError);
    const { findings, message } = error as BmdValidationError;
    expect(findings.map((f) => [f.code, f.index])).toEqual([
      ['E-BMD-ACCOUNT', 1],
      ['E-BMD-AMOUNT', 4],
    ]);
    expect(message).toMatch(/^The BMD file was not written \(2 problems\):\n {2}- E-BMD-ACCOUNT \(booking 2, Konto\)/);
  });

  it('keeps 17 fields when the text has a semicolon', () => {
    const line = dataLines(renderBuchungsimport([bmdPayment({ text: 'Zahlung; Visa' })], octoberOptions()).text)[0] ?? '';
    expect(line.split(';')).toHaveLength(17);
    expect(line.split(';')[12]).toBe('Zahlung Visa');
  });

  it('writes the first 35 characters of a 50-character reference and names the booking', () => {
    const reference = 'X'.repeat(50);
    const rendered = renderBuchungsimport([bmdPayment(), bmdPayment({ extbelegnr: reference })], octoberOptions());
    expect(dataLines(rendered.text)[1]?.split(';')[14]).toBe('X'.repeat(35));
    expect(rendered.notes).toEqual([expect.objectContaining({ code: 'N-BMD-TRUNCATED', index: 1, field: 'extbelegnr' })]);
  });
});

describe('file name and determinism', () => {
  it('names the file after the period and the property', () => {
    expect(buchungsimportFileName(octoberOptions())).toBe('BMD_Buchungsimport_20261001-20261031_BSP.csv');
    expect(buchungsimportFileName(octoberOptions(), 'BSP_DEMO')).toBe('BMD_Buchungsimport_20261001-20261031_BSP_DEMO.csv');
  });

  it('refuses a property id that cannot be part of the file name', () => {
    expect(() => buchungsimportFileName(octoberOptions({ propertyId: 'B.S/P' }))).toThrow(BmdValidationError);
  });

  it('renders the same bookings to the same bytes', () => {
    const bookings = [bmdBooking(), bmdPayment()];
    const first = renderBuchungsimport(bookings, octoberOptions()).bytes;
    const second = renderBuchungsimport(structuredClone(bookings), octoberOptions()).bytes;
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
