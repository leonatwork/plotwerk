import { describe, expect, it } from 'vitest';
import { MemoryFs, serializeProjekt } from '@core/projekt';
import { baueBuchKontext } from '@core/ki';
import { importiereScrivener } from '@core/scrivener';
import { scrivenerMini } from '../../../fixtures/scrivener-mini';
import { erstelleStore } from '../store';

describe('Scrivener-Metadaten übernehmen', () => {
  it('persistiert Synopsis und Klartextnotizen unverändert, bildet neue Akte ab und reserviert IDs', async () => {
    const store = erstelleStore();
    const fs = new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel: 'Hafenlichter', kapitel: [], notiz: '' }) });
    await store.getState().projektLaden(fs);
    await store.getState().speichereAkte([{ nummer: 4, titel: 'Hafenlichter', quintessenz: 'Bestand', wendepunkt: '', antagonisten: [] }]);
    await store.getState().speicherePlan({ id: 'lotte', titel: 'Lotte', akt: 4, status: 'geplant', szene: '', notiz: '', straenge: [], figuren: [], orte: [], abweichungen: [], realitaet: [] });
    const ergebnis = {
      vorspann: 'Grundriss.', hinweise: [],
      akte: [{ nummer: 1, titel: 'Ebbe' }, { nummer: 2, titel: 'Ebbe' }, { nummer: 3, titel: 'Flut' }],
      kapitel: [
        { titel: 'Lotte', text: 'Lotte.', szene: '  Hafen\r\nLicht.  ', notiz: '  *Notiz*\n\nHafen.', notizPrivat: true, akt: 1 },
        { titel: 'Lotte', text: '', szene: 'Ebbe.', notiz: 'Leerer Text.', akt: 2 },
        { titel: 'Funkstille', text: 'Funkstille.', akt: null },
      ],
    };
    const r = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell', vorspannAlsKapitel: true });
    await store.getState().alleSpeichernAbwarten();
    expect(r.ids).toEqual(['vorspann', 'lotte-2', 'lotte-3', 'funkstille']);
    expect(r.geplant).toBe(1);
    const neu = erstelleStore();
    await neu.getState().projektLaden(fs);
    const d = neu.getState().daten!;
    expect(d.akte.map((a) => [a.nummer, a.titel, a.quintessenz])).toEqual([[4, 'Hafenlichter', 'Bestand'], [5, 'Ebbe', ''], [6, 'Ebbe', ''], [7, 'Flut', '']]);
    expect(d.plaene['lotte-2']).toMatchObject({ akt: 5, szene: '  Hafen\r\nLicht.  ', notiz: '  *Notiz*\n\nHafen.' });
    expect(d.plaene['lotte-3']).toMatchObject({ akt: 6, status: 'geplant', szene: 'Ebbe.', notiz: 'Leerer Text.' });
    expect(d.plaene.funkstille!.akt).toBeNull();
    expect(d.plaene.vorspann!.akt).toBeNull();
    expect(await fs.lesen('plan/kapitel/lotte-2.md')).toContain('  *Notiz*\n\nHafen.');
    const kontext = baueBuchKontext(d);
    expect(kontext.kapitel.find((k) => k.id === 'lotte-2')!.plan).toEqual({ szene: 'Hafen Licht.', notiz: '' });
    expect(kontext.text).not.toContain('*Notiz*');
    // Bestehende, freigegebene Planung bleibt laut E12 im Kontext.
    expect(baueBuchKontext({ ...d, plaene: { ...d.plaene, 'lotte-2': { ...d.plaene['lotte-2']!, notizPrivat: false } } }).text).toContain('*Notiz*');
  });

  it('importiert das Mini-Paket bis zum erneuten Laden ohne Notiz-Leak in den KI-Kontext', async () => {
    const store = erstelleStore();
    const fs = new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel: 'Hafenlichter', kapitel: [], notiz: '' }) });
    await store.getState().projektLaden(fs);
    const r = await store.getState().importUebernehmen(importiereScrivener(scrivenerMini(true)), { ziel: 'aktuell' });
    await store.getState().alleSpeichernAbwarten();
    const neu = erstelleStore();
    await neu.getState().projektLaden(fs);
    const d = neu.getState().daten!;
    expect(d.projekt.kapitel).toEqual(r.ids);
    expect(d.plaene.lotte).toMatchObject({ szene: 'Lotte am Hafen.\r\nEbbe.', notiz: 'Hafenlichter.\n\nNotiz.', notizPrivat: true });
    const kontext = baueBuchKontext(d);
    expect(kontext.text).toContain('Lotte am Hafen. Ebbe.');
    expect(kontext.text).not.toContain('Notiz.');
    expect(kontext.kapitel.find((k) => k.id === 'lotte')!.plan.notiz).toBe('');
  });
});
