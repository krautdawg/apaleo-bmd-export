import { describe, expect, it } from 'vitest';
import { BmdValidationError, buchungsimportFileName, renderBuchungsimport } from '../../src/bmd/index.js';
import type { LocalDate } from '../../src/core/date.js';
import { MAX_AMOUNT_CENTS, MAX_BOOKINGS_PER_FILE } from '../../src/bmd/format.js';
import type { BmdBooking, BmdRenderOptions } from '../../src/bmd/types.js';
import { validateBookings } from '../../src/bmd/validate.js';
import { bmdBooking, bmdPayment, octoberOptions } from '../helpers/bmd.js';

function errors(overrides: Partial<BmdBooking>, options: Partial<BmdRenderOptions> = {}) {
  return validateBookings([bmdBooking(overrides)], octoberOptions(options));
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe('booking validation', () => {
  it('accepts the spec bookings in both dialects', () => {
    expect(validateBookings([bmdBooking(), bmdPayment()], octoberOptions())).toEqual([]);
    expect(validateBookings([bmdBooking({ tax: { steuercode: 3, prozent: 10, steuerCents: -1_000 } }), bmdPayment()], octoberOptions({ dialect: 'bmd55' }))).toEqual([]);
  });

  it('reports several errors at once, each with booking number and field', () => {
    const bookings = [bmdBooking(), bmdBooking({ konto: '40A0' }), bmdBooking(), bmdBooking(), bmdPayment({ betragCents: 0 })];
    expect(validateBookings(bookings, octoberOptions())).toEqual([
      expect.objectContaining({ code: 'E-BMD-ACCOUNT', index: 1, field: 'konto', label: 'Konto', value: '40A0' }),
      expect.objectContaining({ code: 'E-BMD-AMOUNT', index: 4, field: 'betragCents', label: 'Betrag', value: '0' }),
    ]);
  });

  describe('E-BMD-ACCOUNT', () => {
    it('names the booking, the account and both allowed lengths', () => {
      const [finding] = errors({ konto: '40100' });
      expect(finding).toMatchObject({ code: 'E-BMD-ACCOUNT', index: 0, field: 'konto', value: '40100' });
      expect(finding?.message).toBe('Konto "40100" must have 4 digits (Sachkonto) or 6 digits (Personenkonto); account numbers are never padded');
    });

    it('accepts a Personenkonto and checks the Gegenkonto too', () => {
      expect(errors({ gkonto: '201001' })).toEqual([]);
      expect(codes(errors({ gkonto: '239' }))).toEqual(['E-BMD-ACCOUNT']);
      expect(errors({ gkonto: '' })).toEqual([expect.objectContaining({ field: 'gkonto', label: 'Gegenkonto' })]);
    });
  });

  describe('E-BMD-AMOUNT', () => {
    it.each([0, 1.5, MAX_AMOUNT_CENTS + 1, -(MAX_AMOUNT_CENTS + 1)])('rejects Betrag %d', (betragCents) => {
      expect(codes(validateBookings([bmdPayment({ betragCents })], octoberOptions()))).toEqual(['E-BMD-AMOUNT']);
    });

    it('accepts 13 integer digits on both sides', () => {
      expect(validateBookings([bmdPayment({ betragCents: MAX_AMOUNT_CENTS }), bmdPayment({ betragCents: -MAX_AMOUNT_CENTS })], octoberOptions())).toEqual([]);
    });

    it('rejects a Steuer with too many digits', () => {
      expect(errors({ tax: { steuercode: 1, prozent: 10, steuerCents: -(MAX_AMOUNT_CENTS + 1) } })).toEqual([
        expect.objectContaining({ code: 'E-BMD-AMOUNT', field: 'steuerCents', label: 'Steuer' }),
      ]);
    });
  });

  describe('E-BMD-STEUER-SIGN', () => {
    it('rejects output tax with the other sign than the amount in NTCS', () => {
      expect(errors({ betragCents: -10_000, tax: { steuercode: 1, prozent: 10, steuerCents: 1_000 } })).toEqual([
        expect.objectContaining({ code: 'E-BMD-STEUER-SIGN', index: 0, field: 'steuerCents', value: '1000' }),
      ]);
    });

    it('treats 1 and 3 as output tax in BMD 5.5', () => {
      for (const steuercode of [1, 3]) {
        expect(codes(errors({ tax: { steuercode, prozent: 10, steuerCents: 1_000 } }, { dialect: 'bmd55' }))).toEqual(['E-BMD-STEUER-SIGN']);
      }
    });

    it('does not check codes outside the dialect output-tax set', () => {
      expect(errors({ tax: { steuercode: 3, prozent: 10, steuerCents: 1_000 } })).toEqual([]);
      expect(errors({ tax: { steuercode: 0, prozent: 10, steuerCents: 1_000 } }, { dialect: 'bmd55' })).toEqual([]);
    });

    it('accepts a tax of 0 and a positive amount with positive tax', () => {
      expect(errors({ konto: '4090', tax: { steuercode: 81, prozent: 0, steuerCents: 0 } })).toEqual([]);
      expect(errors({ tax: { steuercode: 1, prozent: 10, steuerCents: 0 } })).toEqual([]);
      expect(errors({ betragCents: 10_000, tax: { steuercode: 1, prozent: 10, steuerCents: 1_000 } })).toEqual([]);
    });
  });

  describe('E-BMD-RATE', () => {
    it.each([-1, 100, 99.991, 4.925, Number.NaN])('rejects Prozent %d', (prozent) => {
      expect(codes(errors({ tax: { steuercode: 1, prozent, steuerCents: -1_000 } }))).toEqual(['E-BMD-RATE']);
    });

    it.each([0, 4.9, 10, 13, 20, 99.99, 12.25])('accepts Prozent %d', (prozent) => {
      expect(errors({ tax: { steuercode: 1, prozent, steuerCents: -1_000 } })).toEqual([]);
    });
  });

  describe('E-BMD-STEUERCODE', () => {
    it.each([-1, 100, 1.5])('rejects Steuercode %d', (steuercode) => {
      expect(codes(errors({ tax: { steuercode, prozent: 10, steuerCents: -1_000 } }))).toEqual(['E-BMD-STEUERCODE']);
    });

    it.each([0, 99])('accepts Steuercode %d', (steuercode) => {
      expect(errors({ tax: { steuercode, prozent: 10, steuerCents: -1_000 } })).toEqual([]);
    });
  });

  describe('E-BMD-SYMBOL', () => {
    it.each(['', 'ho', 'H-O', 'HOTEL'])('rejects "%s" in NTCS', (buchsymbol) => {
      expect(codes(errors({ buchsymbol }))).toEqual(['E-BMD-SYMBOL']);
    });

    it.each(['A', 'HO', 'PMS', 'HO26'])('accepts "%s" in NTCS', (buchsymbol) => {
      expect(errors({ buchsymbol })).toEqual([]);
    });

    it('names the symbol and the limit of 2 characters in BMD 5.5', () => {
      const [finding] = errors({ buchsymbol: 'PMS', tax: { steuercode: 3, prozent: 10, steuerCents: -1_000 } }, { dialect: 'bmd55' });
      expect(finding).toMatchObject({ code: 'E-BMD-SYMBOL', value: 'PMS', label: 'Buchungssymbol' });
      expect(finding?.message).toBe('Buchungssymbol must be 1 to 2 characters of A-Z and 0-9, got "PMS"');
    });
  });

  describe('E-BMD-KOST', () => {
    it.each(['KS-10', '1234567890'])('names the booking and the value %s', (kost) => {
      expect(errors({ kost })).toEqual([expect.objectContaining({ code: 'E-BMD-KOST', index: 0, field: 'kost', value: kost })]);
    });

    it.each(['1', '123456789', ''])('accepts "%s"', (kost) => {
      expect(errors({ kost })).toEqual([]);
    });
  });

  describe('E-BMD-TAX-PERSONENKONTO', () => {
    it('rejects a Steuercode on a booking that leads with a Personenkonto', () => {
      expect(errors({ konto: '201001' })).toEqual([
        expect.objectContaining({ code: 'E-BMD-TAX-PERSONENKONTO', index: 0, field: 'konto', label: 'Konto', value: '201001' }),
      ]);
    });

    it('accepts a leading Personenkonto without tax, and a Personenkonto as Gegenkonto with tax', () => {
      expect(validateBookings([bmdPayment({ konto: '201001', gkonto: '2890' })], octoberOptions())).toEqual([]);
      expect(errors({ gkonto: '201001' })).toEqual([]);
    });

    it('cannot tell the account kinds apart when both lengths are equal, and then accepts the booking', () => {
      expect(errors({ konto: '4010' }, { personenkontenlaenge: 4 })).toEqual([]);
    });
  });

  describe('E-BMD-PERIOD', () => {
    it.each([
      [{ from: '2026-10-32' }, 'from'],
      [{ to: 'morgen' }, 'to'],
      [{ from: '2026-11-01' }, 'from'],
    ] as const)('rejects the period %o once, without a booking index and without flagging every Belegdatum', (period, field) => {
      const findings = validateBookings([bmdBooking(), bmdPayment()], octoberOptions(period as Partial<BmdRenderOptions>));
      expect(findings).toEqual([expect.objectContaining({ code: 'E-BMD-PERIOD', field })]);
      expect(findings[0]).not.toHaveProperty('index');
    });

    it('makes rendering fail with the finding instead of a TypeError', () => {
      expect(() => renderBuchungsimport([bmdBooking()], octoberOptions({ from: 'gestern' as LocalDate }))).toThrow(BmdValidationError);
      expect(() => buchungsimportFileName(octoberOptions({ from: '2026-11-01' }))).toThrow(BmdValidationError);
    });
  });

  describe('E-BMD-DATE', () => {
    it.each(['2026-09-30', '2026-11-01', '2026-02-30', 'gestern'])('rejects %s in an October file', (businessDate) => {
      expect(errors({ businessDate: businessDate as BmdBooking['businessDate'] })).toEqual([
        expect.objectContaining({ code: 'E-BMD-DATE', field: 'businessDate', label: 'Belegdatum', value: businessDate }),
      ]);
    });

    it('accepts the first and last day', () => {
      expect(errors({ businessDate: '2026-10-01' })).toEqual([]);
      expect(errors({ businessDate: '2026-10-31' })).toEqual([]);
    });
  });

  describe('E-BMD-BELEGNR', () => {
    it('accepts 99,999 bookings and rejects one more', () => {
      const many = (count: number) => Array.from({ length: count }, () => bmdPayment());
      expect(validateBookings(many(MAX_BOOKINGS_PER_FILE), octoberOptions())).toEqual([]);
      expect(validateBookings(many(MAX_BOOKINGS_PER_FILE + 1), octoberOptions())).toEqual([
        expect.objectContaining({ code: 'E-BMD-BELEGNR', field: 'belegnr', value: '100000' }),
      ]);
    });
  });

  it('words messages with BMD field names, never internal property names', () => {
    const findings = [
      ...errors({ konto: 'x', betragCents: 0, businessDate: '2026-12-01', buchsymbol: 'x', kost: 'x', tax: { steuercode: 100, prozent: -1, steuerCents: 5 } }),
      ...errors({ tax: { steuercode: 1, prozent: 10, steuerCents: 5 } }),
    ];
    expect(new Set(codes(findings))).toEqual(
      new Set(['E-BMD-ACCOUNT', 'E-BMD-AMOUNT', 'E-BMD-DATE', 'E-BMD-SYMBOL', 'E-BMD-KOST', 'E-BMD-STEUERCODE', 'E-BMD-RATE', 'E-BMD-STEUER-SIGN']),
    );
    expect(findings.map((f) => f.message).join('\n')).not.toMatch(/betragCents|steuerCents|businessDate|buchsymbol|gkonto/);
  });
});
