import { describe, expect, it } from 'vitest';
import { formatFinding, isErrorFinding } from '../../src/core/findings.js';

describe('findings', () => {
  it('treats E- codes as errors', () => {
    expect(isErrorFinding({ code: 'E-BMD-AMOUNT', message: '' })).toBe(true);
    expect(isErrorFinding({ code: 'W-RECENT-DAY', message: '' })).toBe(false);
  });

  it('formats code, booking number (from 1), field label and message on one line', () => {
    expect(formatFinding({ code: 'E-BMD-AMOUNT', index: 3, field: 'betragCents', label: 'Betrag', message: 'too small' })).toBe(
      'E-BMD-AMOUNT (booking 4, Betrag): too small',
    );
    expect(formatFinding({ code: 'E-X', index: 0, field: 'konto', message: 'bad' })).toBe('E-X (booking 1, konto): bad');
    expect(formatFinding({ code: 'E-BMD-PERIOD', message: 'bad' })).toBe('E-BMD-PERIOD: bad');
  });
});
