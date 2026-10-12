import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importiereDocx } from '../docx';
import { erzeugeTestManuskript } from '../docx/testdaten/testManuskript';
import type { Kapitel } from '../model/types';
import { exportierePdf, exportierePdfMit, pdfSchriftenSetzen, pdfSeiten, type PdfSchrift } from './index';

const NEWSREADER = join(__dirname, '../../node_modules/@fontsource/newsreader/files');
const woff = (name: string) => new Uint8Array(readFileSync(join(NEWSREADER, `newsreader-${name}.woff`)));

function newsreader(): PdfSchrift[] {
  return [
    {
      name: 'Newsreader',
      normal: woff('latin-400-normal'),
      kursiv: woff('latin-400-italic'),
      fett: woff('latin-700-normal'),
      fettKursiv: woff('latin-700-italic'),
      bereiche: [[0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x2000, 0x206f], [0x20ac, 0x20ac]],
    },
    {
      name: 'NewsreaderExt',
      normal: woff('latin-ext-400-normal'),
      kursiv: woff('latin-ext-400-italic'),
      fett: woff('latin-ext-700-normal'),
      fettKursiv: woff('latin-ext-700-italic'),
      bereiche: [[0x0100, 0x024f]],
    },
  ];
}

async function testKapitel(): Promise<Kapitel[]> {
  const e = await importiereDocx(await erzeugeTestManuskript());
  return e.kapitel.map((k, i) => ({ id: `k${i + 1}`, ...k }));
}

function alsText(pdf: Uint8Array): string {
  return new TextDecoder('latin1').decode(pdf);
}

describe('PDF-Export', () => {
  it('liefert ein gültiges PDF mit mindestens einer Seite je Kapitel (Standardschrift)', async () => {
    const kapitel = await testKapitel();
    const pdf = await exportierePdf(kapitel, 'Hafenlichter');
    expect(alsText(pdf.slice(0, 5))).toBe('%PDF-');
    expect(alsText(pdf.slice(-6))).toContain('%%EOF');
    expect(pdfSeiten(pdf)).toBeGreaterThanOrEqual(kapitel.length + 1);
  });

  it('bettet Newsreader ein (mit latin-ext für ł, ő …)', async () => {
    const kapitel = await testKapitel();
    kapitel.push({ id: 'x', titel: 'Łódź', text: 'Zażółć gęślą jaźń – **fett** und *kursiv*.' });
    const pdf = await exportierePdfMit(kapitel, 'Hafenlichter', { schriften: newsreader() });
    const text = alsText(pdf);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(pdfSeiten(pdf)).toBeGreaterThanOrEqual(kapitel.length + 1);
    expect(text).toMatch(/\/FontName \/[A-Z]{6}\+Newsreader-Regular/);
    expect(text).toMatch(/\/FontName \/[A-Z]{6}\+Newsreader-Italic/);
    expect(text).toMatch(/\/FontName \/[A-Z]{6}\+Newsreader-Bold/);
    expect(text).not.toContain('/BaseFont /Times-Roman');
    expect((text.match(/\/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('nutzt registrierte Schriften, Auswahl ohne Titelseite', async () => {
    pdfSchriftenSetzen(newsreader());
    try {
      const pdf = await exportierePdf([{ id: 'a', titel: 'Eins', text: 'Nur ein Absatz.' }], 'Buch');
      expect(alsText(pdf)).toMatch(/Newsreader-Regular/);
      expect(pdfSeiten(pdf)).toBe(2);
      const ohne = await exportierePdfMit([{ id: 'a', titel: 'Eins', text: 'A' }, { id: 'b', titel: 'Zwei', text: '' }], 'Buch', { titelseite: false });
      expect(pdfSeiten(ohne)).toBe(2);
    } finally {
      pdfSchriftenSetzen(null);
    }
  });
});
