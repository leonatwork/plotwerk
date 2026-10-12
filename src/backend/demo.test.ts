/** Browser-Demo: das Demo-Projekt folgt der Oberflächensprache, Änderungen und „Demo zurücksetzen“ gelten je Sprache. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { festeSprache } from '../i18n';
import { erstelleDemoBackend } from './demo';
import { demoGeaendert, demoZuruecksetzen } from './demoSpeicher';

const titel = async (fs: { lesen(p: string): Promise<string | null> } | null) => /titel: (.+)/.exec((await fs?.lesen('projekt.md')) ?? '')?.[1];

afterEach(() => {
  localStorage.clear();
  festeSprache('de');
});

describe('Browser-Demo je Sprache', () => {
  it('lädt bei Englisch „Harbour Lights“, sonst „Hafenlichter“', async () => {
    festeSprache('en');
    expect(await titel(await erstelleDemoBackend().letztesProjekt())).toBe('Harbour Lights');
    festeSprache('de');
    expect(await titel(await erstelleDemoBackend().letztesProjekt())).toBe('Hafenlichter');
  });

  it('Sprachwechsel liefert das andere Demo-Projekt, ein eigenes Projekt bleibt offen', async () => {
    festeSprache('de');
    const backend = erstelleDemoBackend();
    const de = await backend.letztesProjekt();
    expect(backend.demoFuerSprache?.(de)).toBeNull();
    festeSprache('en');
    const en = backend.demoFuerSprache?.(de) ?? null;
    expect(await titel(en)).toBe('Harbour Lights');
    festeSprache('de');
    expect(backend.demoFuerSprache?.(en)).toBe(de);
    const eigenes = await backend.neuesProjekt('Eigenes');
    festeSprache('en');
    expect(backend.demoFuerSprache?.(eigenes)).toBeNull();
  });

  it('Änderungen und Zurücksetzen getrennt je Sprache', async () => {
    const neuLaden = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: neuLaden });
    try {
      festeSprache('en');
      const en = await erstelleDemoBackend().letztesProjekt();
      await en!.schreiben('manuskript/lotte.md', '---\nid: lotte\ntitel: Lotte\n---\n\nChanged.\n');
      expect(demoGeaendert()).toBe(true);
      festeSprache('de');
      expect(demoGeaendert()).toBe(false);
      festeSprache('en');
      expect(await (await erstelleDemoBackend().letztesProjekt())!.lesen('manuskript/lotte.md')).toContain('Changed.');
      demoZuruecksetzen();
      expect(neuLaden).toHaveBeenCalled();
      expect(demoGeaendert()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
