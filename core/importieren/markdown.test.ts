import { describe, expect, it } from 'vitest';
import { importiereMarkdownOrdner } from './index';

describe.each(['de', 'en'] as const)('Ordnerparser (%s)', (sprache) => {
  it('sortiert natürlich und unabhängig von der Oberflächensprache', () => {
    const namen = ['10-flut.md', '02-ebbe.md', '01-ankunft.md', '2-lotte.markdown'];
    const ergebnis = importiereMarkdownOrdner(namen.map((name) => ({ name, inhalt: 'Hafenlichter.' })), sprache);
    expect(ergebnis.kapitel.map((k) => k.titel)).toEqual(['ankunft', 'ebbe', 'lotte', 'flut']);
    expect(namen).toEqual(['10-flut.md', '02-ebbe.md', '01-ankunft.md', '2-lotte.markdown']);
  });

  it('entfernt nur BOM, Frontmatter und die erste Titelzeile; CRLF und Typografie bleiben gleich', () => {
    const text = '\r\n"Hafenlichter" --\r\n\r\n# Flut\r\n';
    const e = importiereMarkdownOrdner([{ name: '01-ankunft.md', inhalt: '\uFEFF---\r\ntitel: Hafenlichter\r\n---\r\n\r\n# Ankunft\r\n' + text }], sprache);
    expect(e.kapitel).toEqual([{ titel: 'Ankunft', text: '\r\n' + text }]);
    expect(e.hinweise).toEqual([]);
  });

  it('nutzt nur eine Überschrift am Anfang, sonst den Dateinamen ohne Nummer', () => {
    const text = 'Hafenlichter.\n\n# Flut\n';
    const e = importiereMarkdownOrdner([{ name: '002_Ebbe.MARKDOWN', inhalt: text }], sprache);
    expect(e.kapitel).toEqual([{ titel: 'Ebbe', text }]);
    expect(e.hinweise).toHaveLength(1);
    expect(e.hinweise[0]!.erklaerung).toContain('002_Ebbe.MARKDOWN');
  });

  it('erhält txt-Absätze, Leerzeilen und einfache Zeilenumbrüche zeichengleich', () => {
    const text = 'Hafenlichter.\r\nEbbe.\r\n \r\nFlut.\r\n\r\n';
    expect(importiereMarkdownOrdner([{ name: '01-Hafenlichter.txt', inhalt: text }], sprache).kapitel[0]!.text).toBe(text);
  });

  it('meldet leere, nicht lesbare und falsch kodierte Dateien und importiert den Rest', () => {
    const e = importiereMarkdownOrdner([
      { name: '01-leer.md', inhalt: '\uFEFF \r\n' },
      { name: '02-ebbe.md', fehler: 'lesen' },
      { name: '03-flut.txt', fehler: 'kodierung' },
      { name: '04-lotte.md', inhalt: '# Lotte\nHafenlichter.' },
      { name: '05-leer.md', inhalt: '---\ntitel: Ebbe\n---\n# Ebbe\n' },
    ], sprache);
    expect(e.kapitel).toEqual([{ titel: 'Lotte', text: 'Hafenlichter.' }]);
    expect(e.hinweise).toHaveLength(4);
    expect(new Set(e.hinweise.map((h) => h.schluessel)).size).toBe(4);
    expect(e.hinweise.map((h) => h.titel)).toContain(sprache === 'de' ? 'UTF-8 erwartet' : 'UTF-8 expected');
  });

  it('ignoriert fremde Endungen, versteckte Dateien und Unterordner; leere Eingabe ist leer', () => {
    const namen = ['.DS_Store', '.ebbe.md', 'flut.docx', 'unter/lotte.md', 'unter\\lotte.txt'];
    expect(importiereMarkdownOrdner(namen.map((name) => ({ name, inhalt: 'Hafenlichter.' })), sprache)).toEqual({ kapitel: [], hinweise: [], vorspann: '', textUnveraendert: true });
    expect(importiereMarkdownOrdner([], sprache).kapitel).toEqual([]);
  });

  it('entfernt kein unabgeschlossenes Frontmatter und keine zweite Überschrift', () => {
    const text = '---\ntitel: Hafenlichter\n# Ebbe\n';
    expect(importiereMarkdownOrdner([{ name: '01-ebbe.md', inhalt: text }], sprache).kapitel[0]!.text).toBe(text);
    expect(importiereMarkdownOrdner([{ name: '02-flut.md', inhalt: '# Flut\n# Ebbe\n' }], sprache).kapitel[0]!.text).toBe('# Ebbe\n');
  });
});
