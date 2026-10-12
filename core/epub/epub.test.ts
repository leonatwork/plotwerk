import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import type { Kapitel } from '../model/types';
import { epubBloecke, epubDateien, exportiereEpub, stabileUuid } from './index';

const kap = (id: string, titel: string, text: string): Kapitel => ({ id, titel, text });

const KAPITEL = [
  kap('eins', 'Grundriss', 'Der Wecker klingelt um *6:12* Uhr & ich drücke ihn weg.\n\nIm Radio läuft **Under Pressure**.\n\n* * *\n\nSpäter <nachts>.'),
  kap('leer', 'Geplant', ''),
  kap('zwei', 'Fassade', '# Fassade\n\n»Hast du’s gesehen?«, fragt Ole.  \nLiebe Grüße\n\n## Montag\n\nDas Konzept.'),
];

describe('EPUB-Export', () => {
  it('legt mimetype als erste, unkomprimierte Datei ab und ist ein gültiges Paket', async () => {
    const datei = await exportiereEpub(KAPITEL, 'Hafenlichter', { angaben: { autor: 'Leon Machnik' }, jetzt: '2026-10-10T12:00:00.123Z' });
    // ZIP-Kopf: erste Datei „mimetype“, Methode 0 (STORE), Inhalt direkt dahinter
    const dv = new DataView(datei.buffer, datei.byteOffset);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint16(8, true)).toBe(0);
    const nameLaenge = dv.getUint16(26, true);
    const extraLaenge = dv.getUint16(28, true);
    expect(new TextDecoder().decode(datei.slice(30, 30 + nameLaenge))).toBe('mimetype');
    expect(extraLaenge).toBe(0);
    expect(new TextDecoder().decode(datei.slice(30 + nameLaenge, 30 + nameLaenge + 20))).toBe('application/epub+zip');

    const zip = await JSZip.loadAsync(datei);
    const pfade = Object.keys(zip.files).filter((p) => !zip.files[p]!.dir);
    expect(pfade).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/toc.ncx',
      'OEBPS/stil.css',
      'OEBPS/text/titel.xhtml',
      'OEBPS/text/kapitel-001.xhtml',
      'OEBPS/text/kapitel-002.xhtml',
    ]);
    // alle XML-Dateien wohlgeformt
    for (const p of pfade.filter((x) => /\.(xml|opf|xhtml|ncx)$/.test(x))) {
      const inhalt = await zip.file(p)!.async('string');
      expect(XMLValidator.validate(inhalt), p).toBe(true);
    }
  });

  it('beschreibt Metadaten, Manifest und Lesereihenfolge im OPF', () => {
    const dateien = epubDateien(KAPITEL, 'Hafenlichter', { angaben: { autor: 'Leon Machnik', untertitel: 'Roman' }, jetzt: '2026-10-10T12:00:00.123Z' });
    const opf = String(dateien.find((d) => d.pfad === 'OEBPS/content.opf')!.inhalt);
    const container = String(dateien.find((d) => d.pfad === 'META-INF/container.xml')!.inhalt);
    expect(container).toContain('full-path="OEBPS/content.opf"');
    expect(opf).toContain('version="3.0"');
    expect(opf).toContain('unique-identifier="buch-id"');
    expect(opf).toMatch(/<dc:identifier id="buch-id">urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}<\/dc:identifier>/);
    expect(opf).toContain('<dc:title id="titel">Hafenlichter</dc:title>');
    expect(opf).toContain('<dc:creator id="autor">Leon Machnik</dc:creator>');
    expect(opf).toContain('<dc:language>de</dc:language>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-10T12:00:00Z</meta>');
    expect(opf).toContain('properties="nav"');

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const pkg = parser.parse(opf).package;
    const items = pkg.manifest.item as { id: string; href: string }[];
    const spine = (pkg.spine.itemref as { idref: string; linear?: string }[]).map((i) => i.idref);
    expect(spine).toEqual(['titel', 'kapitel-1', 'kapitel-2', 'nav']);
    // jede Datei im Paket (außer mimetype/container/opf) steht im Manifest – und umgekehrt
    const imPaket = dateien.map((d) => d.pfad).filter((p) => p.startsWith('OEBPS/') && p !== 'OEBPS/content.opf').map((p) => p.slice(6));
    expect(items.map((i) => i.href).sort()).toEqual(imPaket.sort());
  });

  it('setzt die Kapitel wie die E-Book-Vorschau', () => {
    const dateien = epubDateien(KAPITEL, 'Hafenlichter');
    const k1 = String(dateien.find((d) => d.pfad === 'OEBPS/text/kapitel-001.xhtml')!.inhalt);
    expect(k1).toContain('<p class="nummer">Kapitel 1</p><h1 id="titel-1">Grundriss</h1>');
    expect(k1).toContain('<p>Der Wecker klingelt um <em>6:12</em> Uhr &amp; ich drücke ihn weg.</p>');
    expect(k1).toContain('<p class="e">Im Radio läuft <strong>Under Pressure</strong>.</p>');
    expect(k1).toContain('<p class="trenner"');
    expect(k1).toContain('<p>Später &lt;nachts&gt;.</p>');
    expect(k1).toContain('xml:lang="de"');
    expect(k1).toContain('href="../stil.css"');

    // leeres Kapitel entfällt, Nummerierung läuft weiter; Titel-Wiederholung entfällt
    const k2 = String(dateien.find((d) => d.pfad === 'OEBPS/text/kapitel-002.xhtml')!.inhalt);
    expect(k2).toContain('Kapitel 2</p><h1 id="titel-2">Fassade</h1>');
    expect(k2).not.toContain('<h2 class="zwischentitel">Fassade');
    expect(k2).toContain('fragt Ole.<br/>Liebe Grüße');
    expect(k2).toContain('<h2 class="zwischentitel">Montag</h2>');
    expect(k2).toContain('<p>Das Konzept.</p>');

    const nav = String(dateien.find((d) => d.pfad === 'OEBPS/nav.xhtml')!.inhalt);
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain('<a href="text/kapitel-001.xhtml">Grundriss</a>');
    expect(nav).toContain('<a href="text/kapitel-002.xhtml">Fassade</a>');
    expect(nav).not.toContain('Geplant');
    const css = String(dateien.find((d) => d.pfad === 'OEBPS/stil.css')!.inhalt);
    expect(css).toContain('text-indent: 1.1em');
    expect(css).toContain('hyphens: auto');
  });

  it('bettet eine Schrift auf Wunsch als WOFF ein', () => {
    const b = new Uint8Array([0x77, 0x4f, 0x46, 0x46]);
    const dateien = epubDateien(KAPITEL, 'Hafenlichter', { schrift: { name: 'Newsreader', normal: b, kursiv: b, fett: b, fettKursiv: b } });
    expect(dateien.filter((d) => d.pfad.startsWith('OEBPS/schriften/')).map((d) => d.pfad)).toEqual([
      'OEBPS/schriften/normal.woff',
      'OEBPS/schriften/kursiv.woff',
      'OEBPS/schriften/fett.woff',
      'OEBPS/schriften/fett-kursiv.woff',
    ]);
    const opf = String(dateien.find((d) => d.pfad === 'OEBPS/content.opf')!.inhalt);
    expect(opf).toContain('href="schriften/normal.woff" media-type="font/woff"');
    expect(String(dateien.find((d) => d.pfad === 'OEBPS/stil.css')!.inhalt)).toContain('font-family: "Newsreader"');
  });

  it('hat eine stabile Kennung je Titel und Autor', () => {
    expect(stabileUuid('a')).toBe(stabileUuid('a'));
    expect(stabileUuid('a')).not.toBe(stabileUuid('b'));
  });

  it('lässt Trenner am Rand und doppelte Trenner weg', () => {
    expect(epubBloecke('* * *\n\nA\n\n* * *\n\n* * *\n\nB\n\n* * *').map((b) => b.art)).toEqual(['absatz', 'trenner', 'absatz']);
  });

  it('exportiert das Demo-Projekt', async () => {
    const daten = await ladeDemoProjekt();
    const kapitel = daten.projekt.kapitel.map((id) => daten.kapitel[id]).filter((k): k is Kapitel => !!k);
    const zip = await JSZip.loadAsync(await exportiereEpub(kapitel, daten.projekt.titel));
    const anzahl = Object.keys(zip.files).filter((p) => p.startsWith('OEBPS/text/kapitel-')).length;
    expect(anzahl).toBeGreaterThan(3);
    for (const p of Object.keys(zip.files).filter((x) => x.endsWith('.xhtml'))) expect(XMLValidator.validate(await zip.file(p)!.async('string')), p).toBe(true);
  });
});
