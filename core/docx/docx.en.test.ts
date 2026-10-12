/** Word-Import und Rückimport mit englischen Meldungen (Oberflächensprache); Schlüssel unverändert. */
import { describe, expect, it } from 'vitest';
import { wendeAenderungAn } from '../abgabe';
import type { Kapitel, LektoratsAenderung } from '../model/types';
import { ankerErzeugen, klartext } from '../text';
import { DocxFehler, exportiereDocxMit, importiereDocx } from './index';
import { leseRueckimport } from './rueckimport';

const kap = (id: string, titel: string, text: string): Kapitel => ({ id, titel, text });

describe('Word-Import (en)', () => {
  it('Import-Hinweise englisch, gleiche Schlüssel', async () => {
    const datei = await exportiereDocxMit([kap('a', 'Eins', 'Er geht'), kap('b', 'Zwei', '')], 'Buch');
    const de = await importiereDocx(datei);
    const en = await importiereDocx(datei, 'en');
    expect(en.hinweise.map((h) => h.schluessel)).toEqual(de.hinweise.map((h) => h.schluessel));
    expect(en.hinweise.map((h) => h.titel)).toEqual(['Ends mid-sentence', 'Chapter without text']);
    expect(en.hinweise[1]!.erklaerung).toBe('Chapter 2 “Zwei” has no text and is imported as a planned chapter.');
    expect(de.hinweise.map((h) => h.titel)).toEqual(['Endet mitten im Satz', 'Kapitel ohne Text']);
  });

  it('Fehlermeldungen englisch', async () => {
    const kaputt = new TextEncoder().encode('kein zip');
    await expect(importiereDocx(kaputt, 'en')).rejects.toThrow(new DocxFehler('The file is not a valid Word file (.docx).'));
    await expect(leseRueckimport(kaputt, 'en')).rejects.toThrow('not a valid Word file');
    await expect(importiereDocx(kaputt)).rejects.toThrow('keine gültige Word-Datei');
  });

  it('Lektorat: Grund englisch', () => {
    const md = 'Der Text steht hier.';
    const a: LektoratsAenderung = {
      id: 'x',
      anker: { ...ankerErzeugen('k', klartext(md), 4, 8), exakt: 'Wort' },
      art: 'ersetzen',
      alt: 'Wort',
      neu: 'Satz',
      quelle: 'test.docx',
      status: 'offen',
    };
    expect(wendeAenderungAn(md, a, 'en')).toEqual({ ok: false, grund: 'This passage is no longer in the text.' });
    expect(wendeAenderungAn(md, a)).toEqual({ ok: false, grund: 'Die Stelle steht so nicht mehr im Text.' });
  });
});
