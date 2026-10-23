import { describe, expect, it } from 'vitest';
import { SCRIVX, scrivenerMini } from '../../fixtures/scrivener-mini';
import { importHinweisKapitel } from '../docx';
import { importiereScrivener, parseBinder, ScrivenerFehler } from './index';

describe('Scrivener-3-Binder und Paket', () => {
  it('liest nur Draft, in Tiefensuche/Binder-Reihenfolge; nur oberste Ordner werden Akte', () => {
    const b = parseBinder(SCRIVX);
    expect(b.dokumente.map((k) => [k.uuid, k.titel, k.akt])).toEqual([
      ['loose', 'Grundriss', null], ['first', 'Lotte', 1], ['child', 'Ebbe', 1], ['second', 'Flut', 1], ['empty', 'Regatta', 2],
    ]);
    expect(b.akte).toEqual([{ nummer: 1, titel: 'Hafen & Licht' }, { nummer: 2, titel: 'Hafen & Licht' }, { nummer: 3, titel: 'Funkstille' }]);
  });

  it.each([false, true])('Mini-Paket (Windows-Pfade: %s): Text, Synopsis, Notiz und Akte', (windows) => {
    const r = importiereScrivener(scrivenerMini(windows));
    expect(r.kapitel.map((k) => k.titel)).toEqual(['Grundriss', 'Lotte', 'Ebbe', 'Flut', 'Regatta']);
    expect(r.kapitel[1]).toEqual({ titel: 'Lotte', text: 'Lotte **am Hafen**, *Ebbe*.\n\nFlut.', szene: 'Lotte am Hafen.\r\nEbbe.', notiz: 'Hafenlichter.\n\nNotiz.', notizPrivat: true, akt: 1 });
    expect(r.kapitel[4]).toMatchObject({ text: '', szene: '', notiz: '', akt: 2 });
    expect(r.akte).toHaveLength(3);
    expect(r.vorspann).toBe('');
  });

  it.each(['de', 'en'] as const)('ältere Pakete werden verständlich abgelehnt (%s)', (sprache) => {
    expect(() => importiereScrivener({ 'Files\\Docs\\1.rtf': '', 'old.scrivx': SCRIVX }, sprache)).toThrow(ScrivenerFehler);
    expect(() => importiereScrivener({ 'Files/Docs/1.rtf': '' }, sprache)).toThrow(sprache === 'de' ? /Scrivener 1.*2.*Scrivener 3/ : /Scrivener 1.*2.*Scrivener 3/);
  });

  it.each([false, true])('geplantes Kapitel ohne content.rtf bleibt ohne Schadenshinweis (Windows-Pfade: %s)', (windows) => {
    const dateien = scrivenerMini(windows);
    const pfad = windows ? 'Files\\Data\\empty\\' : 'Files/Data/empty/';
    delete dateien[`${pfad}content.rtf`];
    dateien[`${pfad}synopsis.txt`] = 'Regatta.';
    const r = importiereScrivener(dateien);
    expect(r.kapitel[4]).toMatchObject({ titel: 'Regatta', text: '', szene: 'Regatta.', notiz: '', akt: 2 });
    expect(r.hinweise).toEqual([]);
  });

  it('nur vorhandenes kaputtes RTF lässt das Feld leer und meldet einen zugeordneten Hinweis', () => {
    const dateien = scrivenerMini();
    dateien['Files/Data/first/content.rtf'] = '{\\rtf1 kaputt';
    delete dateien['Files/Data/second/content.rtf'];
    dateien['Files/Data/child/notes.rtf'] = 'kaputt';
    const r = importiereScrivener(dateien, 'en');
    expect(r.kapitel[1]).toMatchObject({ text: '', szene: 'Lotte am Hafen.\r\nEbbe.', notiz: 'Hafenlichter.\n\nNotiz.' });
    expect(r.kapitel[2]).toMatchObject({ text: 'Ebbe.', notiz: '' });
    expect(r.kapitel[3]!.text).toBe('');
    expect(r.hinweise.map(importHinweisKapitel)).toEqual([2, 3]);
    expect(r.hinweise[0]!.erklaerung).toContain('content.rtf');
    expect(r.hinweise[1]!.erklaerung).toContain('notes.rtf');
  });

  it.each([
    '<ScrivenerProject><Binder>',
    '<!DOCTYPE x [<!ENTITY a "geheim">]><ScrivenerProject/>',
    '<ScrivenerProject><Binder/></ScrivenerProject>',
    SCRIVX.replace('UUID="first"', 'UUID="../first"'),
    SCRIVX.replace('UUID="first"', 'UUID="loose"'),
    SCRIVX.replace('Type="DraftFolder"', 'Type="Folder"'),
  ])('weist ungültigen Binder zurück', (xml) => {
    expect(() => parseBinder(xml)).toThrow(ScrivenerFehler);
  });

  it('verwirft mehrdeutige Pakete und unsichere relative Pfade', () => {
    expect(() => importiereScrivener({ ...scrivenerMini(), 'other.scrivx': SCRIVX })).toThrow(ScrivenerFehler);
    expect(() => importiereScrivener({ ...scrivenerMini(), '../Files/Data/x/content.rtf': '' })).toThrow(ScrivenerFehler);
    expect(() => importiereScrivener({ ...scrivenerMini(), 'Files\\Data\\first\\content.rtf': '' })).toThrow(ScrivenerFehler);
  });
});
