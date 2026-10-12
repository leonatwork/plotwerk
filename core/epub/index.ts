/**
 * EPUB-3-Export (G7). Satz wie die E-Book-Vorschau (src/features/vorschau): Kapitel ohne Text entfallen,
 * Kapitelkopf „Kapitel n“ + Titel, Blocksatz mit Silbentrennung, Einzug 1,1 em für Folgeabsätze,
 * Szenentrenner „* * *“ zentriert, Zwischentitel kursiv zentriert. Nur der Manuskripttext – keine
 * Anmerkungen, Markierungen oder Pläne.
 *
 * Aufbau (gültig nach EPUB 3.3): mimetype (erste Datei, unkomprimiert), META-INF/container.xml,
 * OEBPS/content.opf (Metadaten Titel, Autor, Sprache, Kennung, Änderungsdatum), OEBPS/nav.xhtml
 * (Inhaltsverzeichnis + Landmarks), OEBPS/toc.ncx (für ältere Lesegeräte), OEBPS/titel.xhtml,
 * OEBPS/text/kapitel-NNN.xhtml je Kapitel, OEBPS/stil.css und optional eingebettete Schriften (WOFF).
 */
import JSZip from 'jszip';
import type { Lauf } from '../docx/markdown';
import { satzBloecke, type SatzBlock } from '../satz';
import type { Id, Kapitel, ProjektAngaben } from '../model/types';

// ---------------------------------------------------------------------------
// Blöcke (core/satz, gemeinsam mit der Lesevorschau)
// ---------------------------------------------------------------------------

export type EpubBlock = SatzBlock;
export const epubBloecke = satzBloecke;

/** Kapitel mit druckbarem Text (Trenner allein zählen nicht). */
export function epubKapitel(kapitel: Kapitel[]): Kapitel[] {
  return kapitel.filter((k) => epubBloecke(k.text, k.titel).some((b) => b.art !== 'trenner'));
}

// ---------------------------------------------------------------------------
// XHTML
// ---------------------------------------------------------------------------

/** Nur die fünf XML-Entitäten; Steuerzeichen (in XML 1.0 verboten) entfallen. */
export function xml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function laeufeXhtml(laeufe: Lauf[]): string {
  let html = '';
  for (const l of laeufe) {
    let t = xml(l.text).replace(/\t/g, ' ').replace(/\n/g, '<br/>');
    if (l.kursiv) t = `<em>${t}</em>`;
    if (l.fett) t = `<strong>${t}</strong>`;
    html += t;
  }
  return html;
}

function bloeckeXhtml(bloecke: EpubBlock[]): string {
  return bloecke
    .map((b) => {
      if (b.art === 'trenner') return '<p class="trenner" role="separator" aria-label="Szenenwechsel">* * *</p>';
      if (b.art === 'ueberschrift') return `<h2 class="zwischentitel">${laeufeXhtml(b.laeufe)}</h2>`;
      return b.einzug ? `<p class="e">${laeufeXhtml(b.laeufe)}</p>` : `<p>${laeufeXhtml(b.laeufe)}</p>`;
    })
    .join('\n');
}

function xhtmlSeite(titel: string, sprache: string, body: string, epubTyp?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(sprache)}" lang="${xml(sprache)}">
<head>
<meta charset="UTF-8"/>
<title>${xml(titel)}</title>
<link rel="stylesheet" type="text/css" href="${epubTyp === 'nav' ? '' : '../'}stil.css"/>
</head>
<body${epubTyp && epubTyp !== 'nav' ? ` epub:type="${epubTyp}"` : ''}>
${body}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Stil (Werte aus src/features/vorschau/vorschau.css, Satz „E-Book“)
// ---------------------------------------------------------------------------

function stilCss(schrift: string | null): string {
  const familie = schrift ? `"${schrift}", ` : '';
  const fontFace = schrift
    ? [
        ['normal', 'normal', 'normal'],
        ['kursiv', 'italic', 'normal'],
        ['fett', 'normal', 'bold'],
        ['fett-kursiv', 'italic', 'bold'],
      ]
        .map(([datei, stil, gewicht]) => `@font-face {\n  font-family: "${schrift}";\n  font-style: ${stil};\n  font-weight: ${gewicht};\n  src: url("schriften/${datei}.woff") format("woff");\n}`)
        .join('\n')
    : '';
  return `@charset "UTF-8";
${fontFace}
html { font-family: ${familie}Georgia, "Times New Roman", serif; }
body { margin: 0 5%; line-height: 1.5; font-kerning: normal; font-variant-ligatures: common-ligatures; }
p { margin: 0; text-align: justify; -webkit-hyphens: auto; -epub-hyphens: auto; hyphens: auto; orphans: 2; widows: 2; }
p.e { text-indent: 1.1em; }
strong { font-weight: bold; }
.trenner { margin: 1.5em 0; text-align: center; text-indent: 0; -webkit-hyphens: manual; hyphens: manual; page-break-inside: avoid; page-break-after: avoid; }
.zwischentitel { margin: 1.5em 0 0; font-size: 1em; font-style: italic; font-weight: 500; text-align: center; -webkit-hyphens: manual; hyphens: manual; page-break-after: avoid; }
.kopf { margin: 0; padding: 3em 0 2.25em; text-align: center; text-indent: 0; page-break-after: avoid; page-break-inside: avoid; }
.kopf .nummer { margin: 0 0 0.6em; font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 0.68em; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; text-indent: 0; }
.kopf h1 { margin: 0; font-size: 2.1em; font-weight: normal; line-height: 1.12; text-align: center; -webkit-hyphens: manual; hyphens: manual; }
.titelseite { margin-top: 30%; text-align: center; }
.titelseite h1 { margin: 0; font-size: 2.6em; font-weight: normal; line-height: 1.05; }
.titelseite .untertitel { margin: 0.8em 0 0; font-style: italic; text-align: center; }
.titelseite .linie { width: 2.2em; margin: 1.4em auto; border: 0; border-top: 1px solid currentColor; opacity: 0.6; }
.titelseite .autor { margin: 0; text-align: center; font-variant: small-caps; letter-spacing: 0.05em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: 0.4em 0; }
nav a { text-decoration: none; }
`;
}

// ---------------------------------------------------------------------------
// Paket
// ---------------------------------------------------------------------------

export interface EpubSchrift {
  /** Familienname, z. B. „Newsreader“ */
  name: string;
  normal: Uint8Array;
  kursiv: Uint8Array;
  fett: Uint8Array;
  fettKursiv: Uint8Array;
}

export interface EpubOptionen {
  angaben?: ProjektAngaben;
  /** Schrift einbetten (WOFF); fehlt = Schrift des Lesegeräts */
  schrift?: EpubSchrift | null;
  /** Kennung (UUID); fehlt = aus Titel und Autor abgeleitet (gleiches Buch → gleiche Kennung) */
  kennung?: string;
  /** Änderungsdatum (ISO); Standard jetzt */
  jetzt?: string;
  /** Titelseite (Standard: ja) */
  titelseite?: boolean;
}

/** Aus einem Text eine stabile UUID (Version-5-Form, FNV-Hash – keine Kryptographie nötig). */
export function stabileUuid(text: string): string {
  const h = (seed: number) => {
    let x = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      x ^= text.charCodeAt(i);
      x = Math.imul(x, 0x01000193);
    }
    return (x >>> 0).toString(16).padStart(8, '0');
  };
  const hex = h(0x811c9dc5) + h(0x12345678) + h(0x9e3779b9) + h(0x7f4a7c15);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const modifiziert = (iso: string) => `${new Date(iso).toISOString().slice(0, 19)}Z`;

export interface EpubDatei {
  pfad: string;
  inhalt: string | Uint8Array;
}

/** Alle Dateien des EPUB in Paketreihenfolge (ohne zu packen; für Tests und den Export). */
export function epubDateien(kapitelEingabe: Kapitel[], buchtitel: string, optionen: EpubOptionen = {}): EpubDatei[] {
  const angaben = optionen.angaben ?? {};
  const titel = buchtitel.trim() || 'Ohne Titel';
  const autor = angaben.autor?.trim() ?? '';
  const sprache = angaben.sprache?.trim() || 'de';
  const kennung = optionen.kennung ?? `urn:uuid:${stabileUuid(`${titel}\u0000${autor}`)}`;
  const titelseite = optionen.titelseite ?? true;
  const schrift = optionen.schrift ?? null;

  const kapitel = epubKapitel(kapitelEingabe).map((k, i) => ({
    id: k.id as Id,
    nummer: i + 1,
    titel: k.titel.trim() || 'Ohne Titel',
    datei: `text/kapitel-${String(i + 1).padStart(3, '0')}.xhtml`,
    manifestId: `kapitel-${i + 1}`,
    bloecke: epubBloecke(k.text, k.titel),
  }));

  const dateien: EpubDatei[] = [];
  dateien.push({ pfad: 'mimetype', inhalt: 'application/epub+zip' });
  dateien.push({
    pfad: 'META-INF/container.xml',
    inhalt: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  });

  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="stil" href="stil.css" media-type="text/css"/>',
  ];
  const spine: string[] = [];
  if (titelseite) {
    manifest.push('<item id="titel" href="text/titel.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="titel"/>');
  }
  for (const k of kapitel) {
    manifest.push(`<item id="${k.manifestId}" href="${k.datei}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${k.manifestId}"/>`);
  }
  spine.push('<itemref idref="nav" linear="no"/>');
  const schriftDateien: [string, Uint8Array][] = schrift
    ? [
        ['normal', schrift.normal],
        ['kursiv', schrift.kursiv],
        ['fett', schrift.fett],
        ['fett-kursiv', schrift.fettKursiv],
      ]
    : [];
  for (const [name] of schriftDateien) manifest.push(`<item id="schrift-${name}" href="schriften/${name}.woff" media-type="font/woff"/>`);

  const metadaten = [
    `<dc:identifier id="buch-id">${xml(kennung)}</dc:identifier>`,
    `<dc:title id="titel">${xml(titel)}</dc:title>`,
    '<meta refines="#titel" property="title-type">main</meta>',
    ...(angaben.untertitel?.trim()
      ? [`<dc:title id="untertitel">${xml(angaben.untertitel.trim())}</dc:title>`, '<meta refines="#untertitel" property="title-type">subtitle</meta>']
      : []),
    ...(autor ? [`<dc:creator id="autor">${xml(autor)}</dc:creator>`, '<meta refines="#autor" property="role" scheme="marc:relators">aut</meta>'] : []),
    `<dc:language>${xml(sprache)}</dc:language>`,
    ...(angaben.genre?.trim() ? [`<dc:subject>${xml(angaben.genre.trim())}</dc:subject>`] : []),
    `<meta property="dcterms:modified">${modifiziert(optionen.jetzt ?? new Date().toISOString())}</meta>`,
    '<meta name="generator" content="Plotwerk"/>',
  ];

  dateien.push({
    pfad: 'OEBPS/content.opf',
    inhalt: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="buch-id" xml:lang="${xml(sprache)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metadaten.join('\n    ')}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
</package>
`,
  });

  const navListe = kapitel.map((k) => `<li><a href="${k.datei}">${xml(k.titel)}</a></li>`).join('\n      ');
  dateien.push({
    pfad: 'OEBPS/nav.xhtml',
    inhalt: xhtmlSeite(
      titel,
      sprache,
      `<nav epub:type="toc" id="toc" role="doc-toc">
  <h1>Inhalt</h1>
  <ol>
      ${navListe || `<li><a href="${titelseite ? 'text/titel.xhtml' : 'nav.xhtml'}">${xml(titel)}</a></li>`}
  </ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
  <h2>Orientierung</h2>
  <ol>
    ${titelseite ? '<li><a epub:type="titlepage" href="text/titel.xhtml">Titelseite</a></li>' : ''}
    ${kapitel.length ? `<li><a epub:type="bodymatter" href="${kapitel[0]!.datei}">Beginn</a></li>` : ''}
    <li><a epub:type="toc" href="nav.xhtml#toc">Inhalt</a></li>
  </ol>
</nav>`,
      'nav',
    ),
  });

  dateien.push({
    pfad: 'OEBPS/toc.ncx',
    inhalt: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${xml(sprache)}">
  <head>
    <meta name="dtb:uid" content="${xml(kennung)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xml(titel)}</text></docTitle>
  <navMap>
    ${(kapitel.length ? kapitel : [{ nummer: 1, titel, datei: titelseite ? 'text/titel.xhtml' : 'nav.xhtml' }])
      .map((k) => `<navPoint id="np-${k.nummer}" playOrder="${k.nummer}"><navLabel><text>${xml(k.titel)}</text></navLabel><content src="${k.datei}"/></navPoint>`)
      .join('\n    ')}
  </navMap>
</ncx>
`,
  });

  dateien.push({ pfad: 'OEBPS/stil.css', inhalt: stilCss(schrift?.name ?? null) });

  if (titelseite) {
    dateien.push({
      pfad: 'OEBPS/text/titel.xhtml',
      inhalt: xhtmlSeite(
        titel,
        sprache,
        `<section class="titelseite" epub:type="titlepage">
<h1>${xml(titel)}</h1>
${angaben.untertitel?.trim() ? `<p class="untertitel">${xml(angaben.untertitel.trim())}</p>` : ''}
<hr class="linie"/>
${autor ? `<p class="autor">${xml(autor)}</p>` : ''}
</section>`,
        'frontmatter',
      ),
    });
  }

  for (const k of kapitel) {
    dateien.push({
      pfad: `OEBPS/${k.datei}`,
      inhalt: xhtmlSeite(
        k.titel,
        sprache,
        `<section epub:type="chapter" role="doc-chapter" aria-labelledby="titel-${k.nummer}">
<header class="kopf"><p class="nummer">Kapitel ${k.nummer}</p><h1 id="titel-${k.nummer}">${xml(k.titel)}</h1></header>
${bloeckeXhtml(k.bloecke)}
</section>`,
        'bodymatter',
      ),
    });
  }

  for (const [name, daten] of schriftDateien) dateien.push({ pfad: `OEBPS/schriften/${name}.woff`, inhalt: daten });
  return dateien;
}

/** EPUB-Datei erzeugen. `kapitel` in Buchreihenfolge; Kapitel ohne Text entfallen. */
export async function exportiereEpub(kapitel: Kapitel[], buchtitel: string, optionen: EpubOptionen = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const d of epubDateien(kapitel, buchtitel, optionen)) {
    if (d.pfad === 'mimetype') zip.file(d.pfad, d.inhalt, { compression: 'STORE' });
    else zip.file(d.pfad, d.inhalt, { compression: 'DEFLATE' });
  }
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip', platform: 'UNIX' });
}
