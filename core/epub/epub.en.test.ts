/** Export-Dokumente in der Buchsprache Englisch (angaben.sprache = 'en'): EPUB, Normseite, Exposé, Lektoratsmappe, Word. */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { exportiereNormseite, exposeDocx, exposeGeruest, exposeMarkdown, lektoratsmappe } from '../abgabe';
import { exportiereDocxMit } from '../docx';
import type { Hinweis, Kapitel, ProjektDaten } from '../model/types';
import { epubDateien } from './index';

const kap = (id: string, titel: string, text: string): Kapitel => ({ id, titel, text });
const KAPITEL = [kap('eins', 'Grundriss', 'Der Wecker klingelt.\n\n* * *\n\nSpäter.'), kap('zwei', '', 'Das Konzept.')];

const datei = (dateien: { pfad: string; inhalt: string | Uint8Array }[], pfad: string) => String(dateien.find((d) => d.pfad === pfad)!.inhalt);

async function xmlAus(docx: Uint8Array, pfad: string): Promise<string> {
  return (await JSZip.loadAsync(docx)).file(pfad)!.async('string');
}

describe('EPUB (en)', () => {
  it('Inhaltsverzeichnis, Landmarks, Kapitelköpfe und Trenner englisch', () => {
    const d = epubDateien(KAPITEL, '', { angaben: { autor: 'Leon Machnik', sprache: 'en' }, jetzt: '2026-10-10T12:00:00Z' });
    const nav = datei(d, 'OEBPS/nav.xhtml');
    expect(nav).toContain('<h1>Contents</h1>');
    expect(nav).toContain('>Title page</a>');
    expect(nav).toContain('>Start</a>');
    expect(nav).not.toMatch(/Inhalt|Titelseite|Beginn|Orientierung/);
    expect(datei(d, 'OEBPS/content.opf')).toContain('<dc:language>en</dc:language>');
    expect(datei(d, 'OEBPS/content.opf')).toContain('<dc:title id="titel">Untitled</dc:title>');
    const k1 = datei(d, 'OEBPS/text/kapitel-001.xhtml');
    expect(k1).toContain('<p class="nummer">Chapter 1</p>');
    expect(k1).toContain('aria-label="Scene break"');
    expect(datei(d, 'OEBPS/text/kapitel-002.xhtml')).toContain('<h1 id="titel-2">Untitled</h1>');
  });

  it('ohne Sprache bleibt alles deutsch', () => {
    const d = epubDateien(KAPITEL, 'Hafenlichter', { jetzt: '2026-10-10T12:00:00Z' });
    expect(datei(d, 'OEBPS/nav.xhtml')).toContain('<h1>Inhalt</h1>');
    expect(datei(d, 'OEBPS/text/kapitel-001.xhtml')).toContain('<p class="nummer">Kapitel 1</p>');
  });
});

describe('Normseite, Exposé, Lektoratsmappe, Word (en)', () => {
  it('Normseite: Kopfzeile, Titelseite und Sprachkennung englisch', async () => {
    const docx = await exportiereNormseite(KAPITEL, 'Harbour Lights', { angaben: { autor: 'Leon Machnik', sprache: 'en-GB' } });
    const dok = await xmlAus(docx, 'word/document.xml');
    expect(dok).toContain('by Leon Machnik');
    expect(dok).toMatch(/approx\. \d+ standard pages · \d+ words/);
    expect(dok).toContain('Untitled');
    const kopf = Object.keys((await JSZip.loadAsync(docx)).files).filter((p) => /word\/header\d*\.xml/.test(p));
    const koepfe = await Promise.all(kopf.map((p) => xmlAus(docx, p)));
    expect(koepfe.join('')).toContain('Page ');
    expect(koepfe.join('')).not.toContain('Seite ');
    expect(await xmlAus(docx, 'word/styles.xml')).toContain('en-US');
  });

  it('Exposé: Gerüst, Markdown und Word englisch', async () => {
    const daten = await ladeDemoProjekt();
    const en: ProjektDaten = { ...daten, projekt: { ...daten.projekt, angaben: { ...daten.projekt.angaben, sprache: 'en' } } };
    const bloecke = exposeGeruest(en, { kapitel: 'platzhalter' });
    const ueberschriften = bloecke.filter((b) => b.art === 'ueberschrift' && b.ebene === 1).map((b) => (b.art === 'ueberschrift' ? b.text : ''));
    expect(ueberschriften).toEqual(['Key facts', 'Pitch', 'Plot', 'Characters', 'Chapter overview', 'About me']);
    const md = exposeMarkdown(bloecke, 'en');
    expect(md).toContain('\\[Placeholder: What happens in this chapter?\\]');
    expect(md).not.toContain('Platzhalter');
    const docx = await exposeDocx(bloecke, { sprache: 'en' });
    expect(await xmlAus(docx, 'word/document.xml')).toContain('[Placeholder: ');
    // Deutsch unverändert
    expect(exposeGeruest(daten, { kapitel: 'keine' }).some((b) => b.art === 'ueberschrift' && b.text === 'Eckdaten')).toBe(true);
  });

  it('Lektoratsmappe: Beschriftungen und Typnamen in der Buchsprache', async () => {
    const daten = await ladeDemoProjekt();
    const en: ProjektDaten = { ...daten, projekt: { ...daten.projekt, angaben: { ...daten.projekt.angaben, sprache: 'en' } } };
    const id = daten.projekt.kapitel[0]!;
    const hinweise: Hinweis[] = [
      { schluessel: 'x', typ: 'schreibweise', titel: 'T', zitate: [{ kapitel: id, text: 'a' }], erklaerung: 'E', quelle: 'lokal', status: 'neu' },
      { schluessel: 'y', typ: 'struktur', titel: 'T2', zitate: [], erklaerung: '', quelle: 'lokal', status: 'neu' },
    ];
    const mappe = lektoratsmappe(en, hinweise, { jetzt: '2026-10-12T10:00:00Z' });
    expect(mappe.sprache).toBe('en');
    expect(mappe.umfang).toBe('Whole book');
    expect(mappe.abschnitte.map((a) => a.titel)).toEqual([`Ch. 1 · ${daten.kapitel[id]!.titel}`, 'No text passage']);
    expect(mappe.abschnitte[0]!.hinweise[0]!.typName).toBe('Spelling');
    const de = lektoratsmappe(daten, hinweise, { kapitel: id, jetzt: '2026-10-12T10:00:00Z' });
    expect(de.sprache).toBeUndefined();
    expect(de.umfang.startsWith('Kapitel 1 · ')).toBe(true);
    expect(de.abschnitte[0]!.hinweise[0]!.typName).toBe('Schreibweise');
  });

  it('Word-Export: Sprachkennung und Formatvorlagen-Namen in der Buchsprache', async () => {
    const en = await exportiereDocxMit(KAPITEL, 'Harbour Lights', { sprache: 'en' });
    const stile = await xmlAus(en, 'word/styles.xml');
    expect(stile).toContain('en-US');
    expect(stile).toContain('Scene Break');
    const de = await xmlAus(await exportiereDocxMit(KAPITEL, 'Hafenlichter'), 'word/styles.xml');
    expect(de).toContain('de-DE');
    expect(de).toContain('Szenentrenner');
  });
});
