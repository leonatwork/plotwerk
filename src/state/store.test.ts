import { describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { neueId, slug } from './neueId';
import { erstelleStore } from './store';

async function geladen() {
  const store = erstelleStore();
  const fs = demoFs();
  await store.getState().projektLaden(fs);
  return { store, fs };
}

describe('neueId', () => {
  it('Slug mit Umlauten und Eindeutigkeit', () => {
    expect(slug('Teeküche')).toBe('teekueche');
    expect(slug('Straße der Ölmühle')).toBe('strasse-der-oelmuehle');
    expect(slug('  Bis bald!  ')).toBe('bis-bald');
    expect(slug('Café Noël')).toBe('cafe-noel');
    expect(slug('???')).toBe('unbenannt');
    expect(neueId('Lotte', ['lotte', 'lotte-2'])).toBe('lotte-3');
    expect(erstelleStore().getState().neueId('Ältere Dame', [])).toBe('aeltere-dame');
  });
});

describe('Store', () => {
  it('lädt das Demo-Projekt', async () => {
    const { store } = await geladen();
    const s = store.getState();
    expect(s.ladeStatus).toBe('bereit');
    expect(s.daten?.projekt.titel).toBe('Hafenlichter');
    expect(s.auswahl.kapitel).toBe('grundriss');
  });

  it('Navigation, Auswahl, Markierung, Dialoge, Fokus', async () => {
    const { store } = await geladen();
    const s = store.getState();
    s.oeffne('figuren', { figur: 'lotte' });
    expect(store.getState().bereich).toBe('figuren');
    expect(store.getState().auswahl).toMatchObject({ kapitel: 'grundriss', figur: 'lotte' });
    s.waehle({ figur: undefined });
    expect(store.getState().auswahl.figur).toBeUndefined();
    s.markiere({ kapitel: 'ebbe', anker: { kapitel: 'ebbe', exakt: 'Vera', davor: '', danach: '' } });
    expect(store.getState().bereich).toBe('schreiben');
    expect(store.getState().auswahl.kapitel).toBe('ebbe');
    s.oeffneDialog('export', { auswahl: ['ebbe'] });
    expect(store.getState().dialog).toEqual({ id: 'export', param: { auswahl: ['ebbe'] } });
    s.schliesseDialog();
    expect(store.getState().dialog).toBeNull();
    s.umschalteFokus();
    expect(store.getState().fokusModus).toBe(true);
  });

  it('speichert Kapitel sofort im Zustand und atomar über fs; neue Kapitel landen in projekt.md', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    const versprechen = s.speichereKapitel({ id: 'ebbe', titel: 'Ebbe', text: 'Neu.' });
    expect(store.getState().daten?.kapitel.ebbe?.text).toBe('Neu.');
    await versprechen;
    expect(await fs.lesen('manuskript/ebbe.md')).toBe('---\nid: ebbe\ntitel: Ebbe\n---\n\nNeu.\n');
    await s.speichereKapitel({ id: 'epilog', titel: 'Epilog', text: 'Ende.' });
    expect(store.getState().daten?.projekt.kapitel.at(-1)).toBe('epilog');
    expect(store.getState().daten?.plaene.epilog?.status).toBe('entwurf');
    expect(await fs.lesen('projekt.md')).toContain('  - epilog\n');
    expect(store.getState().speichern).toMatchObject({ laufend: 0, fehler: null });
  });

  it('schreibt bei schnellen Änderungen den letzten Stand', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    await Promise.all(['a', 'b', 'c'].map((t) => s.speichereKapitel({ id: 'lotte', titel: 'Lotte', text: t })));
    expect(await fs.lesen('manuskript/lotte.md')).toContain('\nc\n');
  });

  it('neuer Plan ohne Manuskript = nur geplant', async () => {
    const { store, fs } = await geladen();
    const plan = { ...store.getState().daten!.plaene.regatta!, id: 'mojito', titel: 'Mojito' };
    await store.getState().speicherePlan(plan);
    expect(store.getState().daten?.kapitel.mojito).toEqual({ id: 'mojito', titel: 'Mojito', text: '' });
    expect(await fs.existiert('plan/kapitel/mojito.md')).toBe(true);
    expect(await fs.existiert('manuskript/mojito.md')).toBe(false);
  });

  it('entferneFigur: Schnappschuss und Verweise aufräumen', async () => {
    const { store, fs } = await geladen();
    await store.getState().entferneFigur('herr-kessler');
    const d = store.getState().daten!;
    expect(d.figuren['herr-kessler']).toBeUndefined();
    expect(d.gruppen.nordhaven?.mitglieder).toEqual([]);
    expect(await fs.existiert('figuren/herr-kessler.md')).toBe(false);
    expect((await fs.auflisten('.versionen/figuren/herr-kessler.md')).length).toBe(1);
    expect(await fs.lesen('gruppen/nordhaven.md')).toContain('mitglieder: []');
  });

  it('entferneKapitel, entferneOrt, entferneGruppe', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    await expect(s.entferneKapitel('weissraum')).rejects.toThrow('Kapitel mit Text');
    await s.entferneKapitel('regatta');
    expect(store.getState().daten?.projekt.kapitel).not.toContain('regatta');
    expect(await fs.lesen('projekt.md')).not.toContain('regatta');
    await s.entferneOrt('buero');
    expect(store.getState().daten?.orte.zeichensaal?.in).toBeUndefined();
    expect(await fs.lesen('orte/zeichensaal.md')).not.toContain('in: buero');
    await s.entferneGruppe('konsortium');
    expect(store.getState().daten?.akte[2]?.antagonisten).toEqual([]);
    expect(store.getState().daten?.straenge.find((x) => x.id === 'konsortium')?.gruppe).toBeUndefined();
    expect(await fs.lesen('plan/akte.md')).not.toContain('konsortium');
  });

  it('Schnappschuss nur nach Änderungen', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    expect(await s.schnappschuss('manuskript/ebbe.md', 'kapitelwechsel')).toBeNull();
    await s.speichereKapitel({ id: 'ebbe', titel: 'Ebbe', text: 'Geändert.' });
    const pfad = await s.schnappschuss('manuskript/ebbe.md', 'kapitelwechsel');
    expect(pfad).toMatch(/^\.versionen\/manuskript\/ebbe\.md\/.+\.md$/);
    expect(await fs.lesen(pfad!)).toContain('Geändert.');
  });

  it('Analysen je Datei, KI-Hinweise, Anmerkungen, Entscheidungen', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    const analyse = { ...store.getState().daten!.analysen.ebbe!, textHash: 'abc' };
    await s.speichereAnalysen([analyse]);
    expect(await fs.lesen('.plotwerk/analysen/ebbe.json')).toContain('"textHash": "abc"');
    await s.speichereKiHinweise([]);
    expect(await fs.lesen('.plotwerk/hinweise.json')).toBe('[]\n');
    await s.speichereAnmerkungen([]);
    expect(await fs.lesen('anmerkungen.json')).toBe('[]\n');
    const e = store.getState().daten!.entscheidungen;
    await s.speichereEntscheidungen({ ...e, faeden: [{ id: 'fiete', status: 'bewusst_offen' }] });
    expect(await fs.lesen('entscheidungen.json')).toContain('bewusst_offen');
  });

  it('sichert den Stand eines Kapitels vor der ersten Änderung der Sitzung (einmal)', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    const vorher = await fs.lesen('manuskript/ebbe.md');
    await s.speichereKapitel({ id: 'ebbe', titel: 'Ebbe', text: 'Erste Änderung.' });
    await s.speichereKapitel({ id: 'ebbe', titel: 'Ebbe', text: 'Zweite Änderung.' });
    await s.alleSpeichernAbwarten();
    const versionen = await fs.auflisten('.versionen/manuskript/ebbe.md');
    expect(versionen).toHaveLength(1);
    expect(await fs.lesen(versionen[0]!)).toBe(vorher);
    // nach dem Neuladen ist der Stand schon gesichert, wenn ihn der letzte Schnappschuss enthält
    await s.schnappschuss('manuskript/ebbe.md', 'kapitelwechsel');
    await s.projektLaden(fs);
    await store.getState().speichereKapitel({ id: 'ebbe', titel: 'Ebbe', text: 'Dritte Änderung.' });
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.auflisten('.versionen/manuskript/ebbe.md')).toHaveLength(2);
  });

  it('übernimmt Änderungen von außen nur für die geänderte Datei, eigene Echos werden ignoriert', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { store, fs } = await geladen();
      const s = store.getState();
      await s.speichereKapitel({ id: 'lotte', titel: 'Lotte', text: 'Eigene Änderung.' });
      s.externGeaendert('manuskript/lotte.md');
      await fs.schreiben('manuskript/ebbe.md', '---\nid: ebbe\ntitel: Ebbe\n---\n\nVon außen.\n');
      s.externGeaendert('manuskript/ebbe.md');
      await vi.advanceTimersByTimeAsync(600);
      await vi.waitFor(() => expect(store.getState().externeAenderung?.pfade).toEqual(['manuskript/ebbe.md']));
      expect(store.getState().daten!.kapitel.ebbe!.text).toBe('Von außen.');
      expect(store.getState().daten!.kapitel.lotte!.text).toBe('Eigene Änderung.');
    } finally {
      vi.useRealTimers();
    }
  });
});
