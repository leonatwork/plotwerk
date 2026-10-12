import { describe, expect, it } from 'vitest';
import { MemoryFs, parseFigur, parseGruppe, figurPfad, gruppePfad } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { KARTE } from '../../features/beziehungen/logik';
import { erstelleStore } from '../store';

async function laden() {
  const store = erstelleStore();
  const fs = new MemoryFs(demoDateien());
  store.setState({ backend: erstelleDemoBackend() });
  await store.getState().projektLaden(fs);
  return { store, fs };
}

const innen = (k: { x: number; y: number }, f: { x: number; y: number; breite: number; hoehe: number }) =>
  k.x >= f.x && k.y >= f.y && k.x + KARTE.breite <= f.x + f.breite && k.y + KARTE.hoehe <= f.y + f.hoehe;

describe('Gruppen in der App anlegen', () => {
  it('Gruppe um Mitglieder im Netz: Fläche umschließt ihre Karten, Mitgliedschaft auf beiden Seiten', async () => {
    const { store, fs } = await laden();
    const s = store.getState();
    const id = await s.gruppeAnlegen('Architekturbüro', { mitglieder: ['ole', 'malte'] });
    await s.alleSpeichernAbwarten();
    const g = parseGruppe((await fs.lesen(gruppePfad(id)))!, gruppePfad(id));
    expect(g).toMatchObject({ name: 'Architekturbüro', typ: 'sonstige', status: 'im_text', mitglieder: ['ole', 'malte'] });
    const d = store.getState().daten!;
    for (const m of ['ole', 'malte']) {
      expect(d.figuren[m]!.gruppe).toBe(id);
      expect(innen(d.figuren[m]!.netz!, g.netz!)).toBe(true);
    }
    // aus Nordhaven gewechselt? Mitglieder anderer Gruppen verlieren die Figur
    for (const andere of Object.values(d.gruppen)) if (andere.id !== id) expect(andere.mitglieder).not.toContain('ole');
  });

  it('Mitglied ohne Netzposition wird in die neue Fläche gelegt', async () => {
    const { store } = await laden();
    const s = store.getState();
    const fid = await s.planung.figurAnlegen('Hausmeister');
    const id = await s.gruppeAnlegen('Hausverwaltung', { mitglieder: [fid] });
    const d = store.getState().daten!;
    expect(innen(d.figuren[fid]!.netz!, d.gruppen[id]!.netz!)).toBe(true);
  });
});

describe('Figuren zusammenführen (Store)', () => {
  it('löscht die aufgegebene Datei, schreibt die geänderten und wählt die bleibende Figur', async () => {
    const { store, fs } = await laden();
    const s = store.getState();
    const doppelt = await s.planung.figurAnlegen('Ole');
    await s.planung.figurAendern(doppelt, { aliase: ['der Kollege'], notizen: 'Siehe [[figur:paul|Paul]].' });
    await s.beziehungAnlegen('vera', doppelt, { art: 'Nachbarin', kategorie: 'sonstige' });
    s.waehle({ figur: doppelt });
    await store.getState().figurenZusammenfuehren('ole', doppelt);
    await store.getState().alleSpeichernAbwarten();

    expect(await fs.existiert(figurPfad(doppelt))).toBe(false);
    const ole = parseFigur((await fs.lesen(figurPfad('ole')))!, figurPfad('ole'));
    expect(ole.aliase).toContain('der Kollege');
    expect(ole.notizen).toContain('[[figur:paul|Paul]]');
    const vera = parseFigur((await fs.lesen(figurPfad('vera')))!, figurPfad('vera'));
    expect(vera.beziehungen.some((b) => b.zu === 'ole' && b.art === 'Nachbarin')).toBe(true);
    expect(vera.beziehungen.some((b) => b.zu === doppelt)).toBe(false);
    expect(store.getState().auswahl.figur).toBe('ole');
  });
});

describe('KI-Vorschlag als Spitznamen übernehmen (F-10)', () => {
  it('ergänzt die Spitznamen der Zielfigur statt eine Figur anzulegen', async () => {
    const { store } = await laden();
    const s = store.getState();
    const anzahl = Object.keys(s.daten!.figuren).length;
    await s.speichereKiVorschlaege({
      version: 1,
      figuren: [{ schluessel: 'spitzname:ole|der-kollege', name: 'der Kollege', aliase: ['Fenster-Ole'], rolle: 'neben', kurz: '', belege: [], status: 'neu', ziel: 'ole' }],
      orte: [],
      beziehungen: [],
    });
    await store.getState().vorschlagUebernehmen('figur', 'spitzname:ole|der-kollege');
    const d = store.getState().daten!;
    expect(Object.keys(d.figuren)).toHaveLength(anzahl);
    expect(d.figuren.ole!.aliase).toEqual(expect.arrayContaining(['der Kollege', 'Fenster-Ole']));
    expect(d.kiVorschlaege!.figuren[0]).toMatchObject({ status: 'uebernommen', figur: 'ole' });
  });
});
