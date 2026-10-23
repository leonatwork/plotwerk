import { describe, expect, it } from 'vitest';
import { importiereOrdner, importDateinameErlaubt } from './index';
import { leseMarkdown } from '../docx/markdown';

describe('Ordnerimport (AC-1 bis AC-6, E7)', () => {
  it('filtert mit derselben Namensregel wie Rust und Browser', () => {
    for (const name of ['a.md', 'a.MD', 'a.markdown', 'a.MARKDOWN', 'a.txt', 'a.TXT']) expect(importDateinameErlaubt(name)).toBe(true);
    for (const name of ['.a.md', '.DS_Store', 'a.docx', 'a.md.png', 'unter/a.md', 'unter\\a.md']) expect(importDateinameErlaubt(name)).toBe(false);
    expect(importiereOrdner([{ name: '.a.md', inhalt: '# Ebbe' }, { name: 'a.png', inhalt: '' }]).kapitel).toEqual([]);
  });

  it('erhält eine Raute im Titel, ignoriert höhere und leere Überschriften', () => {
    expect(importiereOrdner([{ name: 'ebbe.md', inhalt: '# Ebbe # Flut\nText.' }]).kapitel).toEqual([{ titel: 'Ebbe # Flut', text: 'Text.' }]);
    for (const text of ['## Ebbe\nText.', '# \nText.']) expect(importiereOrdner([{ name: '02-ebbe.md', inhalt: text }]).kapitel).toEqual([{ titel: 'ebbe', text }]);
  });
  it('sortiert natürlich, ohne die Eingabeliste zu ändern', () => {
    const dateien = ['10-flut.md', '02-ebbe.md', '01-ankunft.md', '2a.md', '2b.MARKDOWN'].map((name) => ({ name, inhalt: 'Text.' }));
    expect(importiereOrdner(dateien).kapitel.map((k) => k.titel)).toEqual(['ankunft', 'ebbe', 'a', 'b', 'flut']);
    expect(dateien[0]!.name).toBe('10-flut.md');
  });

  it.each(['de', 'en'] as const)('entfernt nur BOM, Frontmatter und Titelzeile (%s), erhält CRLF und Leerraum', (sprache) => {
    const body = '\r\n  "Text" -- **fett & _kursiv_** \\"\r\n\r\n# Später\r\n';
    const inhalt = '\uFEFF---\r\ntitel: ignoriert\r\n---\r\n\r\n# Ankunft\r\n' + body;
    expect(importiereOrdner([{ name: '01-ankunft.md', inhalt }], sprache).kapitel).toEqual([{ titel: 'Ankunft', text: '\r\n' + body }]);
  });

  it.each(['de', 'en'] as const)('verwendet nur die Anfangsüberschrift und meldet Dateinamen-Titel (%s)', (sprache) => {
    const text = 'Text.\n\n# Später\n';
    const ergebnis = importiereOrdner([{ name: '002_Ebbe.markdown', inhalt: text }], sprache);
    expect(ergebnis.kapitel).toEqual([{ titel: 'Ebbe', text }]);
    expect(ergebnis.hinweise).toHaveLength(1);
    expect(ergebnis.hinweise[0]!.erklaerung).toContain('002_Ebbe.markdown');
    expect(ergebnis.hinweise[0]!.titel).toBe(sprache === 'de' ? 'Keine Titelüberschrift' : 'No title heading');
  });

  it('erhält Leerzeilen vor einer Titelüberschrift und entfernt auch einen Titel ohne abschließenden Umbruch', () => {
    expect(importiereOrdner([{ name: '1.md', inhalt: '\n \n# Flut\n\nText.\n' }]).kapitel[0]).toEqual({ titel: 'Flut', text: '\n \n\nText.\n' });
    expect(importiereOrdner([{ name: '1.md', inhalt: '# Flut' }]).kapitel).toEqual([{ titel: 'Flut', text: '' }]);
  });

  it('behandelt ungeschlossenes Frontmatter als Text und lässt spätere Metadaten-Trenner stehen', () => {
    for (const text of ['---\ntitel: Ebbe\nText.', 'Text.\n---\n# Ebbe']) {
      expect(importiereOrdner([{ name: 'ebbe.md', inhalt: text }]).kapitel[0]!.text).toBe(text);
    }
  });

  it('übernimmt .txt zeichengleich; Leerzeilen bilden Absätze', () => {
    const text = 'Erste Zeile\nzweite Zeile\n\nZweiter Absatz.\n';
    const ergebnis = importiereOrdner([{ name: '01-ebbe.txt', inhalt: text }]);
    expect(ergebnis.kapitel[0]!.text).toBe(text);
    expect(leseMarkdown(ergebnis.kapitel[0]!.text).filter((b) => b.art === 'absatz')).toHaveLength(2);
  });

  it.each(['de', 'en'] as const)('meldet leere, nicht lesbare und nicht UTF-8-Dateien, importiert den Rest (%s)', (sprache) => {
    const ergebnis = importiereOrdner([
      { name: 'leer.md', inhalt: '\uFEFF \r\n' },
      { name: 'metadaten.md', inhalt: '---\nid: x\n---\n' },
      { name: 'fehler.txt', fehler: 'lesen' },
      { name: 'ansi.md', fehler: 'kodierung' },
      { name: 'ebbe.md', inhalt: '# Ebbe\nText.' },
    ], sprache);
    expect(ergebnis.kapitel).toEqual([{ titel: 'Ebbe', text: 'Text.' }]);
    expect(ergebnis.hinweise).toHaveLength(4);
    expect(new Set(ergebnis.hinweise.map((h) => h.schluessel)).size).toBe(4);
    expect(ergebnis.hinweise.map((h) => h.erklaerung).join(' ')).toContain('UTF-8');
  });

  it('meldet ein Kapitel mit Titel aber ohne Body als geplantes Kapitel', () => {
    const ergebnis = importiereOrdner([{ name: 'flut.md', inhalt: '# Flut\n\n' }]);
    expect(ergebnis.kapitel).toEqual([{ titel: 'Flut', text: '\n' }]);
    expect(ergebnis.hinweise).toHaveLength(1);
  });
});
