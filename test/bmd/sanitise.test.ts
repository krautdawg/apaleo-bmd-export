import { describe, expect, it } from 'vitest';
import { sanitiseExtbelegnr, sanitiseText } from '../../src/bmd/sanitise.js';

describe('sanitiseText', () => {
  it('keeps a clean text without notes', () => {
    expect(sanitiseText('Erlös Beherbergung', 0)).toEqual({ value: 'Erlös Beherbergung', notes: [] });
  });

  it('replaces separator, quotes, tab, CR and LF with a space, collapses spaces and trims', () => {
    expect(sanitiseText('Zahlung; Visa', 0).value).toBe('Zahlung Visa');
    expect(sanitiseText(' Zimmer "Seeblick"\t101\r\nFrühstück ', 0)).toEqual({ value: 'Zimmer Seeblick 101 Frühstück', notes: [] });
  });

  it('keeps a decomposed ü as ü', () => {
    expect(sanitiseText('Frühstück'.normalize('NFD'), 0)).toEqual({ value: 'Frühstück', notes: [] });
  });

  it('keeps € and other Windows-1252 characters', () => {
    expect(sanitiseText('Frühstück 5 € – „OK“', 0).notes).toEqual([]);
  });

  it('replaces characters outside Windows-1252 with ? and reports N-BMD-CHARSET', () => {
    const { value, notes } = sanitiseText('Bett 🛏 Łódź', 3);
    expect(value).toBe('Bett ? ?ód?');
    expect(notes).toEqual([
      expect.objectContaining({ code: 'N-BMD-CHARSET', index: 3, field: 'text', label: 'Buchungstext', value: 'Bett 🛏 Łódź' }),
    ]);
    expect(notes[0]?.message).toContain('U+1F6CF');
  });

  it('handles a long text with many distinct unencodable characters in linear time', () => {
    const distinct = Array.from({ length: 20000 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
    const { value, notes } = sanitiseText(distinct, 0);
    expect(value).toBe('?'.repeat(40));
    expect(notes.map((n) => n.code)).toEqual(['N-BMD-CHARSET', 'N-BMD-TRUNCATED']);
    expect(notes[0]?.message.indexOf('U+4E00')).toBeLessThan(notes[0]?.message.indexOf('U+4E01') ?? -1);
  });

  it('cuts at 40 characters and reports N-BMD-TRUNCATED', () => {
    const long = 'Logis Doppelzimmer Seeblick mit Frühstück und Halbpension';
    const { value, notes } = sanitiseText(long, 1);
    expect(value).toBe(long.slice(0, 40).trimEnd());
    expect([...value].length).toBeLessThanOrEqual(40);
    expect(notes).toEqual([expect.objectContaining({ code: 'N-BMD-TRUNCATED', index: 1, field: 'text', value: long })]);
  });

  it('counts characters, not bytes or UTF-16 units', () => {
    const text = 'ä'.repeat(40);
    expect(sanitiseText(text, 0)).toEqual({ value: text, notes: [] });
  });
});

describe('sanitiseExtbelegnr', () => {
  it('keeps A-Z a-z 0-9 - / . _', () => {
    expect(sanitiseExtbelegnr('BSP-2026/0042.a_b', 0)).toEqual({ value: 'BSP-2026/0042.a_b', notes: [] });
  });

  it('removes every other character and reports N-BMD-CHARSET', () => {
    const { value, notes } = sanitiseExtbelegnr('Rechnung Nr. 42; Müller', 2);
    expect(value).toBe('RechnungNr.42Mller');
    expect(notes).toEqual([expect.objectContaining({ code: 'N-BMD-CHARSET', index: 2, field: 'extbelegnr', label: 'Externe Belegnummer' })]);
  });

  it('writes the first 35 characters of a long reference and reports N-BMD-TRUNCATED', () => {
    const reference = 'A'.repeat(20) + 'B'.repeat(30);
    const { value, notes } = sanitiseExtbelegnr(reference, 4);
    expect(value).toBe(reference.slice(0, 35));
    expect(notes).toEqual([expect.objectContaining({ code: 'N-BMD-TRUNCATED', index: 4, field: 'extbelegnr', value: reference })]);
  });
});
