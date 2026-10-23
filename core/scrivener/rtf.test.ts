import { describe, expect, it } from 'vitest';
import { markdownKlartext, leseMarkdown } from '../docx';
import { klartext } from '../text';
import { rtfUmwandeln } from './index';

describe('RTF aus Scrivener 3', () => {
  it('übernimmt Absätze, Gruppen, fett/kursiv und Reset ohne Typografie', () => {
    const r = rtfUmwandeln(String.raw`{\rtf1\ansi "Lotte" - ... {\b Hafen {\i Licht} Hafen} normal.\par\b Flut\plain .\par}`);
    expect(r.text).toBe('"Lotte" - ... Hafen Licht Hafen normal.\n\nFlut.');
    expect(markdownKlartext(r.markdown)).toBe(r.text);
    expect(r.markdown).toContain('**');
    expect(r.markdown).toContain('*Licht*');
    expect(leseMarkdown(r.markdown)[0]).toMatchObject({ laeufe: expect.arrayContaining([{ text: 'Licht', fett: true, kursiv: true }]) });
  });

  it('dekodiert Windows-1252, MacRoman, Unicode und gruppenlokale Fallback-Länge', () => {
    expect(rtfUmwandeln(String.raw`{\rtf1\ansi\ansicpg1252 \'93Lotte\'94 \'80 \u228? \uc2\u246?? {\uc0\u252} \u-10179??\u-8704??}`).text)
      .toBe('“Lotte” € ä ö ü 😀');
    expect(rtfUmwandeln(String.raw`{\rtf1\mac \'8a}`).text).toBe('ä');
    const bytes = new Uint8Array([...new TextEncoder().encode('{\\rtf1\\ansi '), 0xe4, 0x7d]);
    expect(rtfUmwandeln(bytes).text).toBe('ä');
    expect(rtfUmwandeln(String.raw`{\rtf1\ansi\ansicpg65001 \'c3\'a4}`).text).toBe('ä');
  });

  it('bewahrt Leerraum, Sonderzeichen, harte Umbrüche und leere Absätze', () => {
    const r = rtfUmwandeln(String.raw`{\rtf1\ansi  Lotte  \tab Hafen\line Licht \{x\} \\ * _ # &amp;\par\par Ebbe.\par}`);
    expect(r.text).toBe(' Lotte  \tHafen\nLicht {x} \\ * _ # &amp;\n\n\n\nEbbe.');
    expect(r.markdown).toContain('\\*');
    expect(r.markdown).toContain(' Lotte  \tHafen');
    expect(r.markdown).not.toMatch(/&#\d+;/);
  });

  it('erhält Tabs und NBSP auch im Plotwerk-Markdown-Leser statt als Entities', () => {
    const r = rtfUmwandeln(String.raw`{\rtf1\ansi Lotte\tab z.\~B. {\b Hafen}\par}`);
    expect(r.markdown).toBe('Lotte\tz.\u00a0B. **Hafen**');
    expect(klartext(r.markdown)).toBe(r.text);
  });

  it.each([' ', '\t', '\u00a0', '\u2003'])('bewahrt Leerraum %j an Zeilenrändern im Markdown unverändert', (leerraum) => {
    const r = rtfUmwandeln(`{\\rtf1 ${leerraum}Lotte${leerraum}\\line ${leerraum}Hafen${leerraum}\\par}`);
    expect(r.markdown).toBe(`${leerraum}Lotte${leerraum}\\\n${leerraum}Hafen${leerraum}`);
  });

  describe.each([
    { steuerwort: '\\b', marke: '**', fett: true, kursiv: false },
    { steuerwort: '\\i', marke: '*', fett: false, kursiv: true },
    { steuerwort: '\\b\\i', marke: '***', fett: true, kursiv: true },
  ])('Auszeichnung $steuerwort mit geschütztem Leerraum', ({ steuerwort, marke, fett, kursiv }) => {
    it.each([' ', '\t', '\u00a0', '\u2003'])('setzt Marker innerhalb der Zeilenränder %j', (leerraum) => {
      const r = rtfUmwandeln(`{\\rtf1 ${steuerwort} ${leerraum}Lotte${leerraum}\\line ${leerraum}Hafen${leerraum}\\par}`);
      expect(r.text).toBe(`${leerraum}Lotte${leerraum}\n${leerraum}Hafen${leerraum}`);
      expect(r.markdown).toBe(`${leerraum}${marke}Lotte${marke}${leerraum}\\\n${leerraum}${marke}Hafen${marke}${leerraum}`);
      // Führende Tabs sind in CommonMark Codeblock-Einrückung. Die Originalzeichen
      // oben separat prüfen, die Inline-Auszeichnung ohne Block-Einrückung lesen.
      const block = leseMarkdown(r.markdown.replace(/^\s+/gm, ''))[0];
      expect(block?.art).toBe('absatz');
      if (block?.art === 'absatz') {
        const woerter = block.laeufe.filter((l) => /Lotte|Hafen/.test(l.text));
        expect(woerter).toHaveLength(2);
        for (const l of woerter) {
          expect(l).toMatchObject({ fett, kursiv });
        }
      }
      expect(r.markdown).not.toMatch(/&#\d+;/);
    });

    it.each(['\t', '\u00a0'])('gleicht %j zwischen gleich ausgezeichneten Wörtern vor der Maskierung an', (leerraum) => {
      const r = rtfUmwandeln(`{\\rtf1 {${steuerwort} Lotte}${leerraum}{${steuerwort} Hafen}}`);
      expect(r.markdown).toBe(`${marke}Lotte${leerraum}Hafen${marke}`);
      expect(leseMarkdown(r.markdown)).toEqual([{ art: 'absatz', laeufe: [{ text: r.text, fett, kursiv }] }]);
      expect(klartext(r.markdown)).toBe(r.text);
    });

    it.each(['\t', '\u00a0'])('schließt die Auszeichnung vor %j und nicht ausgezeichnetem Text', (leerraum) => {
      const r = rtfUmwandeln(`{\\rtf1 {${steuerwort} Lotte${leerraum}}Hafen}`);
      expect(r.markdown).toBe(`${marke}Lotte${marke}${leerraum}Hafen`);
      expect(leseMarkdown(r.markdown)).toEqual([{ art: 'absatz', laeufe: [
        { text: 'Lotte', fett, kursiv },
        { text: `${leerraum}Hafen`, fett: false, kursiv: false },
      ] }]);
      expect(klartext(r.markdown)).toBe(r.text);
    });
  });

  it('ignoriert Metadaten, Bilder, Fußnoten, Annotationen und versteckten Text', () => {
    expect(rtfUmwandeln(String.raw`{\rtf1\ansi{\fonttbl{\f0 Helvetica;}}{\colortbl;\red0;}{\*\unknown geheim}{\info{\title geheim}}Lotte{\pict abc}{\footnote geheim}{\*\annotation geheim}{\v geheim}\v0 .}`).text).toBe('Lotte.');
    expect(rtfUmwandeln(String.raw`{\rtf1{\field{\*\fldinst HYPERLINK "https://example.org"}{\fldrslt Hafen}}}`).text).toBe('Hafen');
  });

  it('erhält Unicode-Leerraum am Rand, maskiert Szenentrenner und binäre Bilddaten', () => {
    const r = rtfUmwandeln(String.raw`{\rtf1\ansi\emspace Hafen\emspace\par * * *\par{\pict\bin3 {}\}Licht.}`);
    expect(r.text).toBe('\u2003Hafen\u2003\n\n* * *\n\nLicht.');
    expect(r.markdown).toBe('\u2003Hafen\u2003\n\n\\* \\* \\*\n\nLicht.');
    expect(klartext(r.markdown)).toBe(r.text);
  });

  it.each(['', 'Text', '{\\rtf1 Lotte', '{\\rtf1 Lotte}}', "{\\rtf1 \\'xy}", '{\\rtf1 \\u}', '{\\rtf1 \\bin20 abc}', '{\\rtf1 Lotte} Müll'])('weist beschädigtes RTF zurück: %s', (rtf) => {
    expect(() => rtfUmwandeln(rtf)).toThrow();
  });
});
