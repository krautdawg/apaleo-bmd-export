import { describe, expect, it } from 'vitest';
import { BMD_DEFAULT_SETTINGS, bmdTarget, BmdValidationError, createBmdTarget, renderBuchungsimport } from '../../src/bmd/index.js';
import type { LocalDate } from '../../src/core/date.js';
import { bodyOf, type TargetFileMeta } from '../../src/export/index.js';
import { bmdBooking, bmdPayment, octoberOptions } from '../helpers/bmd.js';

/** The default target reads its settings from the config's `bmd` section; this one holds the defaults. */
function meta(overrides: Partial<TargetFileMeta> = {}, from: LocalDate = '2026-10-01', to: LocalDate = '2026-10-31'): TargetFileMeta {
  return {
    config: { bmd: { ...BMD_DEFAULT_SETTINGS, buchsymbol: 'HO' } } as TargetFileMeta['config'],
    propertyId: 'BSP',
    part: { from, to, month: from.slice(0, 7), wjBeginn: '2026-01-01' },
    demo: false,
    createdAt: new Date('2026-11-03T09:15:00Z'),
    ...overrides,
  };
}

describe('bmdTarget', () => {
  it('names the file after period and property, with _DEMO for a demo file', () => {
    expect(bmdTarget.fileName(meta())).toBe('BMD_Buchungsimport_20261001-20261031_BSP.csv');
    expect(bmdTarget.fileName(meta({ demo: true }))).toBe('BMD_Buchungsimport_20261001-20261031_BSP_DEMO.csv');
    expect(() => bmdTarget.fileName(meta({ propertyId: 'B S' }))).toThrow(BmdValidationError);
  });

  it('matches its own files and captures the period, but not replaced files, protocols or EXTF files', () => {
    const match = bmdTarget.filePattern.exec('BMD_Buchungsimport_20261001-20261031_BSP.csv');
    expect(match?.slice(1, 3)).toEqual(['20261001', '20261031']);
    expect(bmdTarget.filePattern.test(bmdTarget.fileName(meta({ demo: true })))).toBe(true);
    for (const name of [
      'BMD_Buchungsimport_20261001-20261031_BSP.replaced-20261103T091500Z.csv',
      'BMD_Buchungsimport_20261001-20261031_BSP.protokoll.txt',
      'EXTF_Buchungsstapel_1234567_42_20261001-20261031_BSP.csv',
    ]) {
      expect(bmdTarget.filePattern.test(name), name).toBe(false);
    }
  });

  it('renders the bookings with the default NTCS settings and returns the notes as findings', () => {
    const bookings = [bmdBooking(), bmdPayment({ extbelegnr: 'X'.repeat(40) })];
    const rendered = bmdTarget.render(bookings, meta());
    expect(Buffer.from(rendered.bytes).equals(Buffer.from(renderBuchungsimport(bookings, octoberOptions()).bytes))).toBe(true);
    expect(rendered.findings.map((f) => f.code)).toEqual(['N-BMD-TRUNCATED']);
    expect(BMD_DEFAULT_SETTINGS).toEqual({ dialect: 'ntcs', sachkontenlaenge: 4, personenkontenlaenge: 6 });
  });

  it('takes dialect and account lengths from its settings, and the period from the part', () => {
    const target = createBmdTarget(() => ({ dialect: 'bmd55', sachkontenlaenge: 4, personenkontenlaenge: 6 }));
    const text = new TextDecoder('windows-1252').decode(target.render([bmdPayment({ businessDate: '2026-10-15' })], meta({}, '2026-10-15', '2026-10-15')).bytes);
    expect(text.split('\r\n')[1]).toBe('0;2890;2390;101500001;20261015;20261015;HO;1;;;120,00;;Kartenzahlung Visa;;BSP-2026-0042;E;A');
    expect(() => target.render([bmdPayment({ businessDate: '2026-10-14' })], meta({}, '2026-10-15', '2026-10-15'))).toThrow(BmdValidationError);
  });

  it('counts a file as unchanged only when every byte is equal', () => {
    const bytes = bmdTarget.render([bmdBooking()], meta()).bytes;
    expect(bmdTarget.sameContent(bytes, bytes.slice())).toBe(true);
    const changed = bytes.slice();
    changed[changed.length - 3] = 0x42;
    expect(bmdTarget.sameContent(bytes, changed)).toBe(false);
    expect(bmdTarget.sameContent(bytes, bytes.slice(0, -1))).toBe(false);
  });

  it('renders the same bookings to the same bytes at different clock times', () => {
    const first = bmdTarget.render([bmdBooking()], meta({ createdAt: new Date('2026-11-03T09:15:00Z') })).bytes;
    const second = bmdTarget.render([bmdBooking()], meta({ createdAt: new Date('2027-02-01T23:59:59Z') })).bytes;
    expect(bmdTarget.sameContent(first, second)).toBe(true);
  });

  it('gives BMD advice for refusals and never mentions DATEV', () => {
    const { overlap, headerChange, reimport, afterOverwrite } = bmdTarget.advice;
    expect(overlap).toContain('BMD');
    expect(headerChange).toContain('bmd.dialect');
    expect(reimport).toMatch(/BMD NTCS/);
    expect(afterOverwrite).toBeUndefined();
    expect([overlap, headerChange, reimport, bmdTarget.protocolTitle].join(' ')).not.toMatch(/DATEV|datev\.|Festschreibung|EXTF/);
    expect(bmdTarget.id).toBe('bmd');
  });

  it('reads dialect and account lengths from the bmd section of the config', () => {
    const config = { bmd: { dialect: 'bmd55', sachkontenlaenge: 5, personenkontenlaenge: 6, buchsymbol: 'HO' } } as TargetFileMeta['config'];
    const { bytes } = bmdTarget.render([bmdBooking({ konto: '40100', gkonto: '23900' })], meta({ config }));
    const [header, line] = new TextDecoder('windows-1252').decode(bytes).split('\r\n');
    expect(header).toMatch(/^satzart;konto;gkto;/);
    expect(line).toMatch(/^0;40100;23900;100100001;20261014;/);
    expect(() => bmdTarget.render([bmdBooking()], meta({ config }))).toThrow(BmdValidationError);
  });

  it('names a dialect change in the refusal for a file with bookings, whose lines all change with the dialect', () => {
    const settings = { ...BMD_DEFAULT_SETTINGS };
    const target = createBmdTarget(() => settings);
    const ntcs = target.render([bmdBooking()], meta()).bytes;
    settings.dialect = 'bmd55';
    const bmd55 = target.render([bmdBooking()], meta()).bytes;
    // Not "same bookings, other header": the output folder logic reports other bookings and appends `reimport`.
    expect(Buffer.from(bodyOf(ntcs)).equals(Buffer.from(bodyOf(bmd55)))).toBe(false);
    expect(target.advice.reimport).toContain('bmd.dialect');
  });
});
