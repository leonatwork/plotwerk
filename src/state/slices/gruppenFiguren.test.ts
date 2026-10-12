import { describe, expect, it } from 'vitest';
import { MemoryFs, parseFigur, parseGruppe, parseKiFakten, figurPfad, gruppePfad, PFADE } from '@core/projekt';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { exposeGeruest } from '@core/abgabe/index';
import { ALLE_KATEGORIEN, KARTE, netzBerechnen } from '../../features/beziehungen/logik';
import { figurenBereiche } from './planung';
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

describe('Statisten (F-14)', () => {
  it('eigener Bereich in der Liste, nicht im Netz (außer auf Wunsch), nicht im Exposé; Rolle übersteht Speichern', async () => {
    const { store, fs } = await laden();
    const s = store.getState();
    await s.planung.figurAendern('malte', { rolle: 'statist' });
    await store.getState().alleSpeichernAbwarten();
    expect(parseFigur((await fs.lesen(figurPfad('malte')))!, 'malte').rolle).toBe('statist');
    const d = store.getState().daten!;
    store.getState().indexNeuBerechnen();
    const index = store.getState().index;
    const b = figurenBereiche(d, index);
    expect(b.statisten.map((f) => f.id)).toEqual(['malte']);
    expect(b.neben.concat(b.haupt).some((f) => f.id === 'malte')).toBe(false);
    const ohne = netzBerechnen(d, index, d.projekt.kapitel.length - 1, ALLE_KATEGORIEN);
    const mit = netzBerechnen(d, index, d.projekt.kapitel.length - 1, ALLE_KATEGORIEN, true);
    expect(ohne.karten.some((k) => k.figur.id === 'malte')).toBe(false);
    expect(mit.karten.some((k) => k.figur.id === 'malte')).toBe(true);
    const expose = exposeGeruest(d, { kapitel: 'keine' });
    expect(JSON.stringify(expose)).not.toContain('Malte');
  });

  it('„Alle Statisten übernehmen“ legt nur die Statisten-Vorschläge an', async () => {
    const { store } = await laden();
    const fig = (name: string, rolle: 'statist' | 'neben') => ({ schluessel: `figur:${name.toLowerCase()}`, name, aliase: [], rolle, kurz: '', belege: [], status: 'neu' as const });
    await store.getState().speichereKiVorschlaege({ version: 1, figuren: [fig('Uta', 'statist'), fig('Ines', 'statist'), fig('Bernd', 'neben')], orte: [], beziehungen: [] });
    expect(await store.getState().alleStatistenUebernehmen()).toBe(2);
    const d = store.getState().daten!;
    expect(Object.values(d.figuren).filter((f) => ['Uta', 'Ines'].includes(f.name)).map((f) => f.rolle)).toEqual(['statist', 'statist']);
    expect(Object.values(d.figuren).some((f) => f.name === 'Bernd')).toBe(false);
  });
});

describe('Mehrere Gruppen und Rollen (A-05, A-06)', () => {
  it('Rollen werden gespeichert, stehen im Netz auf der Karte; Mitglied außerhalb der Fläche wird als Verweis gezeigt', async () => {
    const { store, fs } = await laden();
    const s = store.getState();
    const id = await s.gruppeAnlegen('Büro', { mitglieder: ['ole', 'malte'] });
    await store.getState().gruppenRolleSetzen(id, 'ole', 'Bauleiter');
    // Paul zusätzlich in die Gruppe – seine Karte liegt woanders
    await store.getState().mitgliedHinzufuegen(id, 'paul');
    await store.getState().alleSpeichernAbwarten();
    expect(parseGruppe((await fs.lesen(gruppePfad(id)))!, id).rollen).toEqual({ ole: 'Bauleiter' });
    const d = store.getState().daten!;
    // Hauptgruppe von Ole ist das Büro (vorher keine) → Rolle als Untertitel
    expect(d.figuren.ole!.gruppe).toBe(id);
    store.getState().indexNeuBerechnen();
    const ansicht = netzBerechnen(d, store.getState().index, d.projekt.kapitel.length - 1, ALLE_KATEGORIEN);
    expect(ansicht.karten.find((k) => k.figur.id === 'ole')!.untertitel).toBe('Bauleiter');
    const flaeche = ansicht.flaechen.find((f) => f.gruppe.id === id)!;
    expect(flaeche.aussen.map((m) => m.id)).toEqual(['paul']);
  });

  it('Mitglied mit Karte in anderer Hauptgruppe: Verweis in der Fläche, Spur-Platzhalter bleibt', async () => {
    const { store } = await laden();
    await store.getState().mitgliedHinzufuegen('konsortium', 'herr-kessler');
    const d = store.getState().daten!;
    expect(d.figuren['herr-kessler']!.gruppe).toBe('nordhaven');
    store.getState().indexNeuBerechnen();
    const ansicht = netzBerechnen(d, store.getState().index, d.projekt.kapitel.length - 1, ALLE_KATEGORIEN);
    expect(ansicht.flaechen.find((f) => f.gruppe.id === 'konsortium')!.aussen.map((m) => m.id)).toEqual(['herr-kessler']);
    expect(ansicht.platzhalter.some((p) => p.gruppe.id === 'konsortium')).toBe(true);
  });

  it('Zusammenführen hängt Rollen um', async () => {
    const { store } = await laden();
    const s = store.getState();
    const doppelt = await s.planung.figurAnlegen('Ole');
    const id = await store.getState().gruppeAnlegen('Büro', { mitglieder: [doppelt] });
    await store.getState().gruppenRolleSetzen(id, doppelt, 'Bauleiter');
    await store.getState().figurenZusammenfuehren('ole', doppelt);
    const g = store.getState().daten!.gruppen[id]!;
    expect(g.mitglieder).toEqual(['ole']);
    expect(g.rollen).toEqual({ ole: 'Bauleiter' });
  });
});

describe('Personenverzeichnis (Abgabe)', () => {
  it('als Markdown-Datei und als Vorspann der Normseite', async () => {
    const { store } = await laden();
    const md = new TextDecoder().decode(
      await store.getState().abgabe.erstellen({ format: 'personen', ziel: 'md', optionen: { gliederung: 'rolle' } }),
    );
    expect(md).toContain('# Personen');
    expect(md).toContain('**Paul**');
    const mit = await store.getState().abgabe.erstellen({ format: 'normseite', kapitel: ['grundriss'], titelseite: false, personen: { gliederung: 'rolle' } });
    const ohne = await store.getState().abgabe.erstellen({ format: 'normseite', kapitel: ['grundriss'], titelseite: false });
    expect(mit.length).toBeGreaterThan(ohne.length);
  });
});

describe('Figurenfakten (F-17, Store)', () => {
  it('Lauf mit Demo-KI speichert die Ablage; Widerspruch erscheint als Hinweis; Verwerfen wirkt', async () => {
    const { store, fs } = await laden();
    store.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) } });
    await store.getState().figurenbogen.faktenSammeln({});
    const s = store.getState();
    expect(s.figurenbogen.faktenFehler).toBeNull();
    expect(s.figurenbogen.faktenErgebnis!.angaben).toBeGreaterThanOrEqual(4);
    await s.alleSpeichernAbwarten();
    expect(parseKiFakten((await fs.lesen(PFADE.kiFakten))!).eintraege.length).toBe(s.figurenbogen.faktenErgebnis!.angaben);
    s.indexNeuBerechnen();
    expect(store.getState().index.hinweise.some((h) => h.schluessel === 'fakt:widerspruch:paul|auto')).toBe(true);
    const volvo = store.getState().daten!.kiFakten!.eintraege.find((f) => f.wert === 'Volvo')!;
    await store.getState().figurenbogen.faktVerwerfen(volvo.schluessel);
    store.getState().indexNeuBerechnen();
    expect(store.getState().index.hinweise.some((h) => h.schluessel === 'fakt:widerspruch:paul|auto')).toBe(false);
  });
});
