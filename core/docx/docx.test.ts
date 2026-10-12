import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ankerFinden, klartext } from '../text';
import {
  absatzZuMarkdown,
  exportiereDocx,
  exportiereDocxMit,
  importiereDocx,
  leseMarkdown,
  markdownKlartext,
  type ImportErgebnis,
  type Lauf,
} from './index';
import { erzeugeTestManuskript, TEST_BUCHTITEL, TEST_KAPITEL, type TestKapitel } from './testdaten/testManuskript';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Klartext der Generator-Eingabe nach der Import-Regel: Leerraum am Zeilenrand entfällt. */
function erwarteterKlartext(kap: TestKapitel): string {
  const teile: string[] = [];
  for (const x of kap.absaetze) {
    if (x.art === 'trenner') teile.push('* * *');
    else if (x.art === 'ueberschrift2') teile.push(x.text);
    else if (x.art === 'absatz')
      teile.push(
        x.laeufe
          .map((l) => l.text)
          .join('')
          .split('\n')
          .map((z) => z.trim())
          .join('\n'),
      );
  }
  return teile.filter((t) => t.trim()).join('\n\n');
}

type Spanne = { absatz: number; text: string; fett: boolean; kursiv: boolean };

/** Fett/kursiv ausgezeichnete Wörter (Nicht-Leerzeichen-Folgen) je Absatz. */
function spannenAusLaeufen(absaetze: Lauf[][]): Spanne[] {
  const ergebnis: Spanne[] = [];
  absaetze.forEach((laeufe, absatz) => {
    for (const l of laeufe) {
      if (!l.fett && !l.kursiv) continue;
      for (const wort of l.text.split(/\s+/)) if (wort) ergebnis.push({ absatz, text: wort, fett: l.fett, kursiv: l.kursiv });
    }
  });
  return ergebnis;
}

function spannenAusMarkdown(markdown: string): Spanne[] {
  return spannenAusLaeufen(leseMarkdown(markdown).flatMap((b) => (b.art === 'trenner' ? [[]] : [b.laeufe])));
}

function spannenAusEingabe(kap: TestKapitel): Spanne[] {
  return spannenAusLaeufen(
    kap.absaetze
      .filter((x) => x.art !== 'leer')
      .map((x) => (x.art === 'absatz' ? x.laeufe.map((l) => ({ text: l.text, fett: !!l.fett, kursiv: !!l.kursiv })) : [])),
  );
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Minimale .docx aus eigenem document.xml (und optional styles.xml). */
async function docxAus(body: string, styles?: string, extra: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const rels = [
    styles ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' : '',
    extra['word/comments.xml'] ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : '',
    extra['word/commentsExtended.xml']
      ? '<Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>'
      : '',
  ].join('');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  if (styles) zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${styles}</w:styles>`);
  for (const [pfad, inhalt] of Object.entries(extra)) zip.file(pfad, inhalt);
  return zip.generateAsync({ type: 'uint8array' });
}

const p = (inhalt: string, stil?: string) => `<w:p>${stil ? `<w:pPr><w:pStyle w:val="${stil}"/></w:pPr>` : ''}${inhalt}</w:p>`;
const r = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

// ---------------------------------------------------------------------------
// Test-Manuskript
// ---------------------------------------------------------------------------

describe('Import des Test-Manuskripts', () => {
  let ergebnis: ImportErgebnis;

  it('ergibt 10 Kapitel mit den Titeln aus der Eingabe', async () => {
    ergebnis = await importiereDocx(await erzeugeTestManuskript());
    expect(ergebnis.kapitel.map((k) => k.titel)).toEqual(TEST_KAPITEL.map((k) => k.titel));
    expect(ergebnis.buchtitel).toBe(TEST_BUCHTITEL);
    expect(ergebnis.vorspann).toBe('');
  });

  it('liefert identischen Klartext je Kapitel (eigener Leser und core/text)', () => {
    ergebnis.kapitel.forEach((k, i) => {
      const soll = erwarteterKlartext(TEST_KAPITEL[i]!);
      expect(markdownKlartext(k.text), k.titel).toBe(soll);
      expect(klartext(k.text), k.titel).toBe(soll);
    });
  });

  it('übernimmt fett und kursiv wortgenau', () => {
    ergebnis.kapitel.forEach((k, i) => {
      expect(spannenAusMarkdown(k.text), k.titel).toEqual(spannenAusEingabe(TEST_KAPITEL[i]!));
    });
    expect(ergebnis.kapitel[1]!.text).toContain('**Das ist *sehr* wichtig**');
    expect(ergebnis.kapitel[4]!.text).toContain('Linden*hof*');
  });

  it('maskiert Markdown-Zeichen, setzt Szenentrenner, Überschrift 2 und harte Umbrüche', () => {
    const lotte = ergebnis.kapitel[2]!.text;
    expect(lotte).toContain('\\*Sternchen\\* und \\_Unterstriche\\_');
    expect(lotte).toContain('\\# Keine Überschrift');
    expect(lotte).toContain('\\- Ein Bindestrich');
    expect(lotte).toContain('1\\. Auch das');
    expect(leseMarkdown(lotte).every((b) => b.art === 'absatz')).toBe(true);
    expect(ergebnis.kapitel[4]!.text.split('\n\n')).toContain('* * *');
    expect(ergebnis.kapitel[5]!.text.startsWith('## Montag\n\n')).toBe(true);
    expect(ergebnis.kapitel[1]!.text).toContain('Liebe Grüße\\\nDein Ole');
  });

  it('behält leere Kapitel und meldet Struktur-Hinweise', () => {
    expect(ergebnis.kapitel[3]).toEqual({ titel: 'Regatta', text: '' });
    const titel = ergebnis.hinweise.map((h) => h.titel);
    expect(titel).toContain('Leere Überschrift am Ende');
    expect(titel).toContain('Kapitel ohne Text');
    const satz = ergebnis.hinweise.filter((h) => h.titel === 'Endet mitten im Satz');
    expect(satz).toHaveLength(1);
    expect(satz[0]!.zitate[0]!.kapitel).toBe('#9');
    expect(ergebnis.hinweise.every((h) => h.typ === 'struktur' && h.quelle === 'lokal' && h.status === 'neu')).toBe(true);
    expect(new Set(ergebnis.hinweise.map((h) => h.schluessel)).size).toBe(ergebnis.hinweise.length);
  });

  it('fixtures/test-manuskript.docx entspricht dem Generator', async () => {
    const datei = new Uint8Array(readFileSync(join(__dirname, '../../fixtures/test-manuskript.docx')));
    const ausDatei = await importiereDocx(datei);
    expect(ausDatei).toEqual(ergebnis);
  });
});

describe('Roundtrip Import → Export → Import', () => {
  it('erhält Klartext und fett/kursiv', async () => {
    const erst = await importiereDocx(await erzeugeTestManuskript());
    const kapitel = erst.kapitel.map((k, i) => ({ id: `k${i}`, ...k }));
    const datei = await exportiereDocx(kapitel, 'Hafenlichter');
    expect(new TextDecoder().decode(datei.slice(0, 2))).toBe('PK');
    const zweit = await importiereDocx(datei);
    expect(zweit.buchtitel).toBe('Hafenlichter');
    expect(zweit.kapitel.map((k) => k.titel)).toEqual(erst.kapitel.map((k) => k.titel));
    zweit.kapitel.forEach((k, i) => {
      expect(markdownKlartext(k.text)).toBe(markdownKlartext(erst.kapitel[i]!.text));
      expect(spannenAusMarkdown(k.text)).toEqual(spannenAusMarkdown(erst.kapitel[i]!.text));
      expect(k.text).toBe(erst.kapitel[i]!.text);
    });
  });

  it('exportiert eine Auswahl ohne Titelseite und mit anderer Schrift', async () => {
    const datei = await exportiereDocxMit(
      [
        { id: 'a', titel: 'Eins', text: 'Erster **Absatz**.\n\n* * *\n\nZweiter *Absatz*.' },
        { id: 'b', titel: 'Zwei', text: '' },
      ],
      'Buch',
      { titelseite: false, schrift: 'Times New Roman' },
    );
    const zip = await JSZip.loadAsync(datei);
    const dok = await zip.file('word/document.xml')!.async('string');
    expect(dok).not.toContain('>Buch<');
    expect(dok).toContain('w:val="Szenentrenner"');
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('Times New Roman');
    const wieder = await importiereDocx(datei);
    expect(wieder.kapitel).toEqual([
      { titel: 'Eins', text: 'Erster **Absatz**.\n\n* * *\n\nZweiter *Absatz*.' },
      { titel: 'Zwei', text: '' },
    ]);
  });

  it('lässt Markdown-Reste ohne Text weg (Bilder, HTML bleibt Text)', async () => {
    const datei = await exportiereDocx([{ id: 'a', titel: 'A', text: 'Text mit <mark>Markierung</mark> und ![Bild](x.png).' }], '');
    const wieder = await importiereDocx(datei);
    expect(markdownKlartext(wieder.kapitel[0]!.text)).toBe('Text mit <mark>Markierung</mark> und .');
  });
});

// ---------------------------------------------------------------------------
// Robustheit
// ---------------------------------------------------------------------------

describe('Überschriften erkennen', () => {
  it('deutsche Word-Vorlage „berschrift1“, eigene Vorlage auf Basis von Überschrift 1, outlineLvl direkt', async () => {
    const stile = [
      '<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:basedOn w:val="Standard"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Kapitel"><w:name w:val="Kapitel"/><w:basedOn w:val="berschrift1"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="MeineU"><w:name w:val="Überschrift 1"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style>',
    ].join('');
    const body = [
      p(r('Eins'), 'berschrift1'),
      p(r('Text eins.')),
      p(r('Zwei'), 'Kapitel'),
      p(r('Unter'), 'berschrift2'),
      p(r('Text zwei.')),
      p(r('Drei'), 'MeineU'),
      p(r('Text drei.')),
      `<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr>${r('Vier')}</w:p>`,
      p(r('Text vier.')),
    ].join('');
    const e = await importiereDocx(await docxAus(body, stile));
    expect(e.kapitel).toEqual([
      { titel: 'Eins', text: 'Text eins.' },
      { titel: 'Zwei', text: '## Unter\n\nText zwei.' },
      { titel: 'Drei', text: 'Text drei.' },
      { titel: 'Vier', text: 'Text vier.' },
    ]);
  });

  it('Vorspann, leere Überschrift mitten im Text und keine Überschrift', async () => {
    const e = await importiereDocx(
      await docxAus([p(r('Widmung für A.')), p(r('Eins'), 'Heading1'), p(r('Text.')), p('', 'Heading1'), p(r('Weiter ohne Titel.'))].join('')),
    );
    expect(e.vorspann).toBe('Widmung für A.');
    expect(e.kapitel).toEqual([
      { titel: 'Eins', text: 'Text.' },
      { titel: 'Kapitel 2', text: 'Weiter ohne Titel.' },
    ]);
    expect(e.hinweise.map((h) => h.titel)).toEqual(['Text vor der ersten Überschrift', 'Überschrift ohne Text']);
    const ohne = await importiereDocx(await docxAus(p(r('Nur Text.'))));
    expect(ohne.kapitel).toEqual([]);
    expect(ohne.vorspann).toBe('Nur Text.');
    expect(ohne.hinweise[0]!.titel).toBe('Keine Kapitelüberschriften');
  });
});

describe('Text und Formate aus WordprocessingML', () => {
  it('Zeichenvorlagen, w:b val=0, Hyperlinks, Änderungen, Entitäten, versteckter Text, Fußnoten, Kommentare', async () => {
    const stile =
      '<w:style w:type="character" w:styleId="Betont"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Fett"><w:name w:val="Fett"/><w:rPr><w:b/></w:rPr></w:style>';
    const body = [
      p(r('Eins'), 'Heading1'),
      p(
        r('Ein ') +
          r('betontes', '<w:rStyle w:val="Betont"/>') +
          r(' Wort, ') +
          r('nicht fett', '<w:b w:val="0"/>') +
          '<w:hyperlink r:id="x" xmlns:r="r">' +
          r(' mit Link') +
          '</w:hyperlink>' +
          '<w:ins w:id="1">' +
          r(' eingefügt') +
          '</w:ins>' +
          '<w:del w:id="2"><w:r><w:delText>gelöscht</w:delText></w:r></w:del>' +
          r(' &amp; &#8222;Zitat&#x201C;') +
          r('versteckt', '<w:vanish/>') +
          '<w:r><w:footnoteReference w:id="1"/></w:r>' +
          '<w:r><w:t>.</w:t><w:br w:type="page"/></w:r>',
      ),
      p(r('Ganz fett, ') + r('außer hier', '<w:b w:val="false"/>') + r('.'), 'Fett'),
      p('<w:r><w:t>A</w:t><w:softHyphen/><w:t>B</w:t><w:noBreakHyphen/><w:t>C</w:t><w:cr/><w:t>D</w:t></w:r>'),
    ].join('');
    const kommentare = `<?xml version="1.0"?><w:comments ${W}><w:comment w:id="0"><w:p/></w:comment></w:comments>`;
    const e = await importiereDocx(await docxAus(body, stile, { 'word/comments.xml': kommentare }));
    expect(e.kapitel[0]!.text).toBe(
      'Ein *betontes* Wort, nicht fett mit Link eingefügt & „Zitat“.\n\n**Ganz fett,** außer hier.\n\nAB‑C\\\nD',
    );
    expect(markdownKlartext(e.kapitel[0]!.text)).toBe('Ein betontes Wort, nicht fett mit Link eingefügt & „Zitat“.\n\nGanz fett, außer hier.\n\nAB‑C\nD');
    const titel = e.hinweise.map((h) => h.titel);
    expect(titel).toEqual(expect.arrayContaining(['Fußnoten nicht übernommen', 'Word-Kommentare ohne Stelle', 'Nachverfolgte Änderungen angenommen']));
    expect(e.kommentare).toEqual([]);
  });

  it('Tabellen werden Absätze, doppelte Umbrüche trennen Absätze, Leerraum am Rand entfällt', async () => {
    const body =
      p(r('Eins'), 'Heading1') +
      `<w:tbl><w:tr><w:tc>${p(r('Zelle A'))}</w:tc><w:tc>${p(r('Zelle B'))}</w:tc></w:tr></w:tbl>` +
      p('<w:r><w:tab/><w:t xml:space="preserve">  Anfang </w:t><w:br/><w:br/><w:t xml:space="preserve"> neuer Absatz  </w:t></w:r>');
    const e = await importiereDocx(await docxAus(body));
    expect(e.kapitel[0]!.text).toBe('Zelle A\n\nZelle B\n\nAnfang\n\nneuer Absatz');
    expect(e.hinweise.map((h) => h.titel)).toContain('Tabellen als Absätze');
  });

  it('meldet alte .doc-Dateien und kaputte Dateien verständlich', async () => {
    await expect(importiereDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/\.doc/);
    await expect(importiereDocx(new Uint8Array([1, 2, 3]))).rejects.toThrow(/keine gültige Word-Datei/);
  });
});

// ---------------------------------------------------------------------------
// Markdown schreiben
// ---------------------------------------------------------------------------

function zufall(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('absatzZuMarkdown', () => {
  it('liefert für zufällige Absätze denselben Text und dieselbe Auszeichnung (wo darstellbar)', () => {
    const alphabet = [...'ab cÄß*_#-+>=1.)[]<>&;\\`~|!„“‚‘’–…»«\t', 'amp;', '* * *', '\n', '  ', '#x41;'];
    const rnd = zufall(42);
    for (let n = 0; n < 1500; n++) {
      const laeufe: Lauf[] = [];
      const anzahl = 1 + Math.floor(rnd() * 5);
      for (let i = 0; i < anzahl; i++) {
        let text = '';
        const laenge = 1 + Math.floor(rnd() * 8);
        for (let j = 0; j < laenge; j++) text += alphabet[Math.floor(rnd() * alphabet.length)];
        laeufe.push({ text, fett: rnd() < 0.3, kursiv: rnd() < 0.3 });
      }
      const original = laeufe.map((l) => l.text).join('');
      const soll = original
        .split('\n')
        .map((z) => z.trim())
        .filter((z) => z !== '')
        .join('\n');
      const md = absatzZuMarkdown(laeufe);
      const ist = md.map((m) => markdownKlartext(m)).join('\n');
      expect(ist, JSON.stringify({ laeufe, md })).toBe(soll);
      for (const m of md) expect(leseMarkdown(m), m).toHaveLength(1);
    }
  });

  it('Satzzeichen am Rand fetter Stellen: Text bleibt, Buchstaben bleiben fett', () => {
    const md = absatzZuMarkdown([
      { text: 'Er sagte', fett: false, kursiv: false },
      { text: ':', fett: true, kursiv: false },
      { text: ' ab', fett: false, kursiv: false },
      { text: '„Hallo“', fett: true, kursiv: false },
      { text: 'cd', fett: false, kursiv: false },
    ]);
    expect(md).toHaveLength(1);
    expect(markdownKlartext(md[0]!)).toBe('Er sagte: ab„Hallo“cd');
    expect(spannenAusMarkdown(md[0]!).map((s) => s.text)).toEqual(['Hallo']);
  });

  it('überkreuzte fett/kursiv-Bereiche verlieren nie Text', () => {
    const md = absatzZuMarkdown([
      { text: 'ab', fett: true, kursiv: false },
      { text: 'cd', fett: true, kursiv: true },
      { text: 'ef', fett: false, kursiv: true },
    ]);
    expect(markdownKlartext(md.join('\n\n'))).toBe('abcdef');
  });

  it('Szenentrenner nur bei exakt „* * *“', () => {
    expect(absatzZuMarkdown([{ text: '* * *', fett: false, kursiv: false }])).toEqual(['* * *']);
    expect(absatzZuMarkdown([{ text: '***', fett: false, kursiv: false }])).toEqual(['\\*\\*\\*']);
    expect(absatzZuMarkdown([{ text: '---', fett: false, kursiv: false }])).toEqual(['\\---']);
  });
});

describe('Word-Kommentare', () => {
  const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
  const start = (id: number) => `<w:commentRangeStart w:id="${id}"/>`;
  const ende = (id: number) => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`;
  const ref = (id: number) => `<w:r><w:commentReference w:id="${id}"/></w:r>`;
  const kommentar = (id: number, text: string, para: string, datum = '2024-01-22T00:14:00Z') =>
    `<w:comment w:id="${id}" w:author="Leon Machnik" w:date="${datum}"><w:p w14:paraId="${para}"><w:r><w:annotationRef/></w:r>${r(text)}</w:p></w:comment>`;

  async function datei() {
    const body = [
      p(start(1) + r('Eins') + ende(1), 'Heading1'),
      p(r('Paul öffnet die ') + start(2) + r('Schwip Schwap') + ende(2) + r(' mit dem Bleistift.')),
      p(r('Ein Absatz ohne') + ref(3) + r(' Markierung.')),
      p(start(4) + r('Zwei') + ende(4), 'Heading1'),
      p(r('Drei'), 'Heading1'),
      p(start(5) + r('Erster Teil.')),
      p(r('Zweiter Teil') + ende(5) + r(' und Rest.')),
    ].join('');
    const kommentare =
      `<?xml version="1.0"?><w:comments ${W} ${W14}>` +
      kommentar(1, 'Kapitel straffen?', 'A1') +
      kommentar(2, 'Bleistift-Motiv weiterführen.', 'A2') +
      kommentar(3, 'Hier fehlt etwas.', 'A3') +
      kommentar(4, 'Szene am Pool?', 'A4') +
      kommentar(5, 'Zwei Absätze markiert.', 'A5') +
      kommentar(6, 'Ja, auf die Hälfte.', 'A6', '2024-02-01T10:00:00Z') +
      kommentar(7, 'Ohne Stelle.', 'A7') +
      '</w:comments>';
    const erweitert =
      '<?xml version="1.0"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
      '<w15:commentEx w15:paraId="A1" w15:done="0"/><w15:commentEx w15:paraId="A2" w15:done="1"/>' +
      '<w15:commentEx w15:paraId="A6" w15:paraIdParent="A1" w15:done="0"/></w15:commentsEx>';
    return importiereDocx(await docxAus(body, undefined, { 'word/comments.xml': kommentare, 'word/commentsExtended.xml': erweitert }));
  }

  it('ordnet Kommentare ihren Stellen zu, fasst Antworten zusammen und meldet Kommentare ohne Stelle', async () => {
    const e = await datei();
    expect(e.kapitel.map((k) => k.titel)).toEqual(['Eins', 'Zwei', 'Drei']);
    const k = e.kommentare!;
    expect(k.map((x) => x.text)).toEqual(['Kapitel straffen?', 'Bleistift-Motiv weiterführen.', 'Hier fehlt etwas.', 'Szene am Pool?', 'Zwei Absätze markiert.']);

    // an der Überschrift: Notiz zum Kapitel, verankert am Kapitelanfang, mit Antwort
    expect(k[0]).toMatchObject({ kapitel: 0, ueberschrift: true, autor: 'Leon Machnik', erledigt: false });
    expect(k[0]!.anker!.exakt).toBe('Paul öffnet die Schwip Schwap mit');
    expect(k[0]!.antworten).toEqual([{ autor: 'Leon Machnik', datum: '2024-02-01T10:00:00Z', text: 'Ja, auf die Hälfte.' }]);

    // markierter Text, in Word erledigt
    expect(k[1]).toMatchObject({ kapitel: 0, ueberschrift: false, erledigt: true });
    expect(k[1]!.anker).toMatchObject({ kapitel: '#1', exakt: 'Schwip Schwap', davor: 'Paul öffnet die ' });
    const kt = klartext(e.kapitel[0]!.text);
    expect(ankerFinden(kt, k[1]!.anker!)).toEqual({ start: kt.indexOf('Schwip Schwap'), ende: kt.indexOf('Schwip Schwap') + 'Schwip Schwap'.length });

    // Kommentar ohne markierten Text: das Wort davor
    expect(k[2]!.anker!.exakt).toBe('ohne');

    // Kapitel ohne Text: kein Anker
    expect(k[3]).toMatchObject({ kapitel: 1, ueberschrift: true, anker: null });

    // über zwei Absätze (Anker speichern normalisierten Text, E6)
    expect(k[4]!.anker).toMatchObject({ kapitel: '#3', exakt: 'Erster Teil. Zweiter Teil' });

    expect(e.hinweise.find((h) => h.titel === 'Word-Kommentare ohne Stelle')!.erklaerung).toBe('1 Kommentar hängt an keiner Textstelle und wird nicht übernommen.');
  });

  it('wandelt Kommentare in Anmerkungen, Plan- und Projekt-Notizen', async () => {
    const e = await datei();
    const { kommentareAlsAnmerkungen } = await import('./index');
    let n = 0;
    const u = kommentareAlsAnmerkungen(e.kommentare!, ['eins', 'zwei', 'drei'], null, [], (t) => `${t.split(' ')[0]}-${++n}`, '2026-10-09T12:00:00Z');
    expect(u.anmerkungen.map((a) => [a.anker.kapitel, a.anker.exakt, a.ziel, a.quelle])).toEqual([
      ['eins', 'Paul öffnet die Schwip Schwap mit', { typ: 'kapitel', id: 'eins' }, 'word'],
      ['eins', 'Schwip Schwap', null, 'word'],
      ['eins', 'ohne', null, 'word'],
      ['drei', 'Erster Teil. Zweiter Teil', null, 'word'],
    ]);
    expect(u.anmerkungen[0]!.notiz).toBe('Kapitel straffen?\n\nAntwort (01.02.2024): Ja, auf die Hälfte.');
    expect(u.anmerkungen[1]!.notiz).toBe('Bleistift-Motiv weiterführen.\n\n(In Word als erledigt markiert.)');
    expect(u.anmerkungen[0]!).toMatchObject({ autor: 'Leon Machnik', erstellt: '2024-01-22T00:14:00Z' });
    expect(u.planNotizen).toEqual({ zwei: 'Word-Kommentar von Leon Machnik (22.01.2024): Szene am Pool?' });
    expect(u.projektNotiz).toBe('');
  });
});
