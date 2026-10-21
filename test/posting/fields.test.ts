import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { lineRate } from '../../src/mapping/index.js';
import { accountLabel, buchungstext, commandLabel, paymentLabel, revenueLabel } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, CHART, mappingWith, post } from '../helpers/posting.js';

const payment = (overrides: Parameters<typeof ledgerLine>[0] = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_000, taxes: [], ...overrides });
const tax10 = (cents: number) => [tax('VeryReduced', 10, cents)];

describe('extbelegnr', () => {
  it('is the receipt number of a payment without invoice, for example a PSP reference', () => {
    const [booking] = post([payment({ receipt: { type: 'PspReference', number: 'PSP123' }, reference: 'BSP-ABCDEF-1' })]).bookings;
    expect(booking?.extbelegnr).toBe('PSP123');
  });

  it('is the reference with posting.extbelegnr "reference", or when there is no receipt number', () => {
    const line = payment({ receipt: { type: 'PspReference', number: 'PSP123' }, reference: 'BSP-ABCDEF-1' });
    expect(post([line], undefined, { extbelegnr: 'reference' }).bookings[0]?.extbelegnr).toBe('BSP-ABCDEF-1');
    expect(post([payment({ receipt: { number: '' }, reference: 'BSP-ABCDEF-1' })]).bookings[0]?.extbelegnr).toBe('BSP-ABCDEF-1');
  });

  it('never falls back to an account name', () => {
    const [booking] = post([payment({ credit: ACCOUNTS.folio, receipt: { number: ' ' }, reference: 'BSP-EXT-1' })]).bookings;
    expect(booking?.extbelegnr).toBe('BSP-EXT-1');
  });
});

describe('Buchungstext', () => {
  it('is "Zahlung Visa" for a payment crediting the folio "Müller, Hans", never the guest', () => {
    const [booking] = post([payment({ credit: ACCOUNTS.folio })]).bookings;
    expect(booking?.text).toBe('Zahlung Visa');
    expect(booking?.text).not.toContain('Müller');
  });

  it('names revenue in German: "Erlös" plus the standard group and rate, "Erlösminderung" for an allowance', () => {
    const [charge, allowance] = post([ledgerLine(), ledgerLine({ grossCents: -1_100, netCents: -1_000, taxes: tax10(-100) })]).bookings;
    expect(charge?.text).toBe('Erlös Logis 10 %');
    expect(allowance?.text).toBe('Erlösminderung Logis 10 %');
  });

  it('names revenue by its economic sign on the debit side: negative is "Erlös", positive is "Erlösminderung"', () => {
    const debited = (grossCents: number, amount: number) =>
      ledgerLine({ debit: ACCOUNTS.accommodation10, credit: ACCOUNTS.receivables, grossCents, netCents: grossCents - amount, taxes: tax10(amount) });
    const [revenue, reduction] = post([debited(-1_100, -100), debited(1_100, 100)]).bookings;
    expect(revenue?.text).toBe('Erlös Logis 10 %');
    expect(reduction?.text).toBe('Erlösminderung Logis 10 %');
  });

  it('names the Ortstaxe and the levies in German, never as revenue, with the rate only when it is not 0', () => {
    const levy = (type: string, grossCents = 500, rate = 0) =>
      ledgerLine({ credit: { number: `${type}-1`, name: `${type} English name`, type }, grossCents, taxes: rate === 0 ? [] : [tax('Normal', rate, 80)] });
    const texts = [levy('CityTaxes'), levy('SecondCityTax'), levy('GuestLevies'), levy('CityTaxes', -500), levy('GuestLevies', 500, 20)].map((line) =>
      buchungstext(line, line.credit, CHART, lineRate(line) ?? 0),
    );
    expect(texts).toEqual(['Ortstaxe', 'Ortstaxe 2', 'Gästeabgabe', 'Korrektur Ortstaxe', 'Gästeabgabe 20 %']);
  });

  it('names a deposit by side and sign, with its rate: Anzahlung, Auflösung, Erstattung, Umbuchung', () => {
    const prepayment = ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment', grossCents: 22_000, netCents: 20_000, taxes: tax10(2_000) });
    const release = ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilities, grossCents: -22_000, netCents: -20_000, taxes: tax10(-2_000) });
    const refund = ledgerLine({ ...prepayment, grossCents: -22_000, netCents: -20_000, taxes: tax10(-2_000) });
    const parked = ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilities, grossCents: 22_000, netCents: 20_000, taxes: tax10(2_000) });
    expect(post([prepayment, release, refund, parked]).bookings.map((b) => b.text)).toEqual([
      'Anzahlung 10 %',
      'Auflösung Anzahlung 10 %',
      'Erstattung Anzahlung 10 %',
      'Umbuchung Anzahlung 10 %',
    ]);
  });

  it('names a payment refund "Erstattung", a debtor transfer "Forderung an Debitor" and the Ortstaxe "Ortstaxe"', () => {
    const [refund, transfer, cityTax, move] = post([
      payment({ grossCents: -5_000 }),
      ledgerLine({ debit: ACCOUNTS.accountsReceivable, credit: ACCOUNTS.receivables, command: 'PostToAccountsReceivables', taxes: [] }),
      ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 320, taxes: [] }),
      ledgerLine({ debit: ACCOUNTS.folio, credit: ACCOUNTS.receivables, command: 'MoveLineItem', taxes: [] }),
    ]).bookings;
    expect(refund?.text).toBe('Erstattung Visa');
    expect(transfer?.text).toBe('Forderung an Debitor');
    expect(cityTax?.text).toBe('Ortstaxe');
    // Both sides map to 2390: skipped, so only three bookings.
    expect(move).toBeUndefined();
  });

  it('is cut to the 40 characters BMD reads', () => {
    const credit = { number: '5500', name: `Spa ${'x'.repeat(80)}`, type: 'Revenues' };
    const mapping = mappingWith(mappingRow({ apaleoAccount: '5500', apaleoType: 'Revenues', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10' }));
    const text = post([ledgerLine({ credit })], mapping).bookings[0]?.text ?? '';
    expect(text).toHaveLength(40);
    expect(text.startsWith('Erlös Spa x')).toBe(true);
  });

  it('labels the remaining apaleo commands in German', () => {
    expect(['MoveLineItem', 'PostToAccountsReceivables', 'PostToLossOfAccountsReceivables', 'PostPrepaymentVat', 'PostCharge', 'Unknown'].map(commandLabel)).toEqual([
      'Umbuchung',
      'Forderung an Debitor',
      'Forderungsverlust',
      'USt Anzahlung',
      'Buchung',
      'Buchung',
    ]);
  });
});

describe('revenueLabel', () => {
  const chart = new ChartIndex([
    { number: '5000', name: 'Revenues', type: 'Revenues', ledger: 'global', isArchived: false, hasChildren: true },
    { number: 'RevenueNoShow', name: 'Revenues No-show', type: 'Revenues', parentNumber: '5000', ledger: 'global', isArchived: false, hasChildren: true },
  ]);
  const revenue = (number: string, name: string, parentNumber?: string) => ({ number, name, type: 'Revenues', ...(parentNumber ? { parentNumber } : {}) });

  it.each([
    ['RevenueAccommodation_Reduced:13.00', 'Revenues Accommodation (13%)', 13, 'Logis 13 %'],
    ['RevenueFoodAndBeverages_Normal:20.00', 'Revenues Food and beverages (20%)', 20, 'Speisen und Getränke 20 %'],
    ['RevenueCancellationFees_Without:0.00', 'Revenues Cancellation fees (no VAT)', 0, 'Stornogebühr 0 %'],
    ['RevenueOther_VeryReduced:10.00', 'Revenues Other (10%)', 10, 'Sonstige Erlöse 10 %'],
    ['5011', 'Accommodation 10%', 10, 'Accommodation 10%'],
    ['5500', 'Revenues Spa (20%)', 20, 'Spa (20%)'],
  ])('labels %s as "%s"', (number, name, rate, label) => {
    expect(revenueLabel(revenue(number, name), chart, rate)).toBe(label);
  });

  it('finds the standard group through the chart parents', () => {
    expect(revenueLabel(revenue('NS-13', 'Revenues No-show (13%)', 'RevenueNoShow'), chart, 13)).toBe('No-Show 13 %');
  });
});

describe('paymentLabel', () => {
  it.each([
    ['Cash Payment', 'Bar'],
    ['Cash and ATM', 'Bar'],
    ['Bank Transfer', 'Überweisung'],
    ['Direct Debit', 'Lastschrift'],
    ['Voucher Payment', 'Gutschein'],
    ['Other Payment', 'Sonstige'],
    ['Credit Card Payment', 'Kreditkarte'],
    ['Visa Credit Card Payment', 'Visa'],
    ['Visa Debit Card Payment', 'Visa Debit'],
    ['Amex Credit Card Payment', 'Amex'],
    ['MasterCard Credit Card Payment', 'Mastercard'],
    ['GiroCard Payment', 'Girocard'],
    ['Maestro Card Payment', 'Maestro'],
    ['Payment by Booking.com', 'Booking.com'],
    ['PayPal Payment', 'PayPal'],
    ['Visa', 'Visa'],
  ])('labels %s as %s', (name, label) => {
    expect(paymentLabel(name)).toBe(label);
  });
});

describe('accountLabel', () => {
  const chart = new ChartIndex([
    ...CHART.accounts,
    { number: '1450', name: 'Company Receivables', type: 'AccountsReceivable', ledger: 'global', isArchived: false, hasChildren: true },
  ]);

  it('keeps the name of global accounts and of accounts of other types', () => {
    expect(accountLabel(ACCOUNTS.beverages20, chart)).toBe('Revenues Food and beverages (20%)');
    expect(accountLabel({ number: '9000', name: 'Anything', type: 'House' }, chart)).toBe('Anything');
  });

  it('uses the global parent name or a fixed label for guest, booking and per-reservation accounts', () => {
    expect(accountLabel({ number: 'ACME-1', name: 'Müller GmbH', type: 'AccountsReceivable', parentNumber: '1450' }, chart)).toBe('Company Receivables');
    expect(accountLabel({ number: 'ACME-2', name: 'Müller GmbH', type: 'AccountsReceivable' }, chart)).toBe('Debitor');
    expect(accountLabel(ACCOUNTS.folio, chart)).toBe('Gastforderung'); // parent 1200 lives in the guest ledger
    expect(accountLabel(ACCOUNTS.liabilities, chart)).toBe('Anzahlung Gast');
  });
});

describe('kost', () => {
  it('carries the Kostenstelle of a revenue row on the revenue booking', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation10.number, apaleoType: 'Revenues', apaleoVatPercent: '10', bmdAccount: '4000', steuercode: '1', bmdVatPercent: '10', kost: '10' }));
    const [booking] = post([ledgerLine()], mapping).bookings;
    expect(booking).toMatchObject({ konto: '4000', kost: '10' });
  });

  it('comes from the fixture row of the drinks account 4020 (Kostenstelle 20)', () => {
    const [booking] = post([ledgerLine({ credit: ACCOUNTS.beverages20, grossCents: 2_400, netCents: 2_000, taxes: [tax('Normal', 20, 400)] })]).bookings;
    expect(booking).toMatchObject({ konto: '4020', kost: '20' });
  });

  it('is never written on a payment, even when both rows have a kost value', () => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', bmdAccount: '2890', kost: '30' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', bmdAccount: '2390', kost: '40' }),
    );
    const [booking] = post([payment()], mapping).bookings;
    expect(booking).toMatchObject({ konto: '2890', gkonto: '2390' });
    expect(booking?.kost).toBeUndefined();
  });

  it('is taken only from the konto row: a payment against a receivable gives none', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', bmdAccount: '2390', kost: '40' }));
    const [booking] = post([payment()], mapping).bookings;
    expect(booking).toMatchObject({ konto: '2890', gkonto: '2390' });
    expect(booking?.kost).toBeUndefined();
  });

  const untaxedRevenue = () =>
    mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', bmdAccount: '4090', bmdVatPercent: '0', kost: '10' }));

  it('keeps the Kostenstelle on an untaxed charge (no Steuercode): the revenue row leads with the signed gross', () => {
    const [booking] = post([ledgerLine({ credit: ACCOUNTS.accommodation0, grossCents: 4_500, netCents: 4_500, taxes: [] })], untaxedRevenue()).bookings;
    expect(booking).toMatchObject({ konto: '4090', gkonto: '2390', betragCents: -4_500, kost: '10' });
    expect(booking?.tax).toBeUndefined();
  });

  it('keeps the same Kostenstelle on the allowance of that untaxed charge', () => {
    const allowance = ledgerLine({ debit: ACCOUNTS.accommodation0, credit: ACCOUNTS.receivables, command: 'PostAllowance', grossCents: 4_500, netCents: 4_500, taxes: [] });
    const [booking] = post([allowance], untaxedRevenue()).bookings;
    expect(booking).toMatchObject({ konto: '4090', gkonto: '2390', betragCents: 4_500, kost: '10' });
  });

  it('keeps the Kostenstelle on a negative untaxed charge (a correction) with the sign flipped', () => {
    const [booking] = post([ledgerLine({ credit: ACCOUNTS.accommodation0, grossCents: -4_500, netCents: -4_500, taxes: [] })], untaxedRevenue()).bookings;
    expect(booking).toMatchObject({ konto: '4090', gkonto: '2390', betragCents: 4_500, kost: '10' });
  });
});
