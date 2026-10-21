import type { BmdBooking, BmdRenderOptions } from '../../src/bmd/types.js';

/** The file of property BSP for October 2026: NTCS, 4-digit Sachkonten, 6-digit Personenkonten. */
export function octoberOptions(overrides: Partial<BmdRenderOptions> = {}): BmdRenderOptions {
  return { dialect: 'ntcs', from: '2026-10-01', to: '2026-10-31', propertyId: 'BSP', sachkontenlaenge: 4, personenkontenlaenge: 6, ...overrides };
}

/** The spec's revenue booking at 10 % with the revenue account leading; override what the test is about. */
export function bmdBooking(overrides: Partial<BmdBooking> = {}): BmdBooking {
  return {
    konto: '4010',
    gkonto: '2390',
    businessDate: '2026-10-14',
    buchsymbol: 'HO',
    betragCents: -10_000,
    tax: { steuercode: 1, prozent: 10, steuerCents: -1_000 },
    text: 'Erlös Beherbergung',
    extbelegnr: 'BSP-2026-0042',
    ...overrides,
  };
}

/** A payment without tax: card clearing account in Soll, guest receivables as Gegenkonto. */
export function bmdPayment(overrides: Partial<BmdBooking> = {}): BmdBooking {
  return {
    konto: '2890',
    gkonto: '2390',
    businessDate: '2026-10-14',
    buchsymbol: 'HO',
    betragCents: 12_000,
    text: 'Kartenzahlung Visa',
    extbelegnr: 'BSP-2026-0042',
    ...overrides,
  };
}

/** The data lines of a rendered file: without the header line and the empty string after the last CRLF. */
export function dataLines(text: string): string[] {
  return text.split('\r\n').slice(1, -1);
}
