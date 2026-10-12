import { describe, expect, it } from 'vitest';
import type { KiTransport } from '@core/ki/index';
import type { KiVorschlaege } from '@core/model/types';
import { MemoryFs, parseFigur, parseKiVorschlaege, parseOrt, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { KARTE, type Rechteck } from '../../features/beziehungen/logik';
import { belegteFlaechen, kreisPositionen } from '../../features/beziehungen/vorschlagLogik';
import { erstelleStore } from '../store';

function dateien(ohneFiguren = false): Record<string, string> {
  const d = demoDateien();
  if (ohneFiguren) for (const p of Object.keys(d)) if (/^(figuren|orte|gruppen)\//.test(p)) delete d[p];
  return d;
}

async function laden(opt: { ohneFiguren?: boolean; ki?: KiTransport } = {}) {
  const store = erstelleStore();
  const fs = new MemoryFs(dateien(opt.ohneFiguren));
  store.setState({ backend: { ...erstelleDemoBackend(), ki: opt.ki ?? erstelleDemoKiTransport({ verzoegerungMs: 0 }) } });
  await store.getState().projektLaden(fs);
  return { store, fs };
}

async function ablageAufPlatte(fs: MemoryFs): Promise<KiVorschlaege> {
  return parseKiVorschlaege((await fs.lesen(PFADE.vorschlaege))!);
}

function ueberlappungsfrei(r: Rechteck[]): boolean {
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i]!;
      const b = r[j]!;
      if (a.x < b.x + b.breite && b.x < a.x + a.breite && a.y < b.y + b.hoehe && b.y < a.y + a.hoehe) return false;
    }
  return true;
}

const karte = (p: { x: number; y: number }): Rechteck => ({ ...p, breite: KARTE.breite, hoehe: KARTE.hoehe });

/** Neue Karten überlappen weder einander noch Vorhandenes (Vorhandenes darf sich überlappen, z. B. Karten in Gruppenflächen). */
function frei(neu: Rechteck[], belegt: Rechteck[]): boolean {
  return ueberlappungsfrei(neu) && neu.every((n) => belegt.every((b) => ueberlappungsfrei([n, b])));
}

describe('Netzpositionen für übernommene Figuren', () => {
  it('leeres Netz: erste Karte in der Mitte, Rest auf Ringen, alles im Bild und ohne Überlappung', () => {
    for (const n of [1, 5, 7, 12, 19, 30]) {
      const p = kreisPositionen([], n);
      expect(p).toHaveLength(n);
      expect(p.every((x) => x.x >= 24 && x.y >= 24)).toBe(true);
      expect(ueberlappungsfrei(p.map(karte))).toBe(true);
    }
    const [mitte, ...rest] = kreisPositionen([], 7);
    // sechs Karten um die Mitte herum
    expect(rest.filter((r) => r.x < mitte!.x).length).toBe(2);
    expect(rest.filter((r) => r.x > mitte!.x).length).toBe(2);
  });

  it('mit vorhandenen Karten und Gruppenflächen: keine Überlappung', async () => {
    const { store } = await laden();
    const belegt = belegteFlaechen(store.getState().daten!);
    expect(belegt.length).toBe(10);
    const p = kreisPositionen(belegt, 15).map(karte);
    expect(p).toHaveLength(15);
    expect(frei(p, belegt)).toBe(true);
  });
});

describe('Slice „vorschlaege“', () => {
  it('holt Vorschläge, speichert sie in .plotwerk/vorschlaege.json und öffnet das Panel', async () => {
    const { store, fs } = await laden();
    await store.getState().vorschlaegeHolen();
    const s = store.getState();
    expect(s.vorschlagFehler).toBeNull();
    expect(s.vorschlagLaeuft).toBe(false);
    expect(s.vorschlagPanel).toBe(true);
    expect(s.vorschlagErgebnis).toMatchObject({ neu: 9, aktualisiert: 0, bereitsAngelegt: 7, tiefencheck: false, modell: 'claude-sonnet-5-5' });
    expect(s.vorschlagErgebnis!.verworfen).toHaveLength(4);
    await s.alleSpeichernAbwarten();
    const ablage = await ablageAufPlatte(fs);
    expect(ablage).toEqual(s.daten!.kiVorschlaege);
    expect(ablage.figuren.map((f) => f.name)).toEqual(['Fiete', 'Der Mann am Fischstand']);
    expect(ablage.lauf?.modell).toBe('claude-sonnet-5-5');
    // zweiter Lauf: nichts Neues, die offenen werden nur aktualisiert
    await store.getState().vorschlaegeHolen();
    expect(store.getState().vorschlagErgebnis).toMatchObject({ neu: 0, aktualisiert: 9 });
  });

  it('Figur übernehmen: Figur-Datei mit Rolle, Aliasen, Existenz gesichert, kurz, leerem Plan und freier Netzposition', async () => {
    const { store, fs } = await laden();
    await store.getState().vorschlaegeHolen();
    const belegtVorher = belegteFlaechen(store.getState().daten!);
    await store.getState().vorschlagUebernehmen('figur', 'figur:der-mann-am-fischstand');
    await store.getState().alleSpeichernAbwarten();
    const f = parseFigur((await fs.lesen('figuren/der-mann-am-fischstand.md'))!);
    expect(f).toMatchObject({
      id: 'der-mann-am-fischstand',
      name: 'Der Mann am Fischstand',
      aliase: [],
      rolle: 'neben',
      kurz: 'Verkäufer am Fischstand',
      existenz: 'gesichert',
      gruppe: null,
      beziehungen: [],
      plan: {},
      wahrheit: '',
      notizen: '',
    });
    expect(f.netz).toBeDefined();
    expect(frei([karte(f.netz!)], belegtVorher)).toBe(true);
    const v = (await ablageAufPlatte(fs)).figuren.find((x) => x.schluessel === 'figur:der-mann-am-fischstand');
    expect(v).toMatchObject({ status: 'uebernommen', figur: 'der-mann-am-fischstand' });
  });

  it('Beziehung übernehmen: legt die vorgeschlagene Figur mit an und speichert die Beziehung an „von“', async () => {
    const { store, fs } = await laden();
    await store.getState().vorschlaegeHolen();
    await store.getState().vorschlagUebernehmen('beziehung', 'beziehung:fiete|paul@funkstille');
    await store.getState().alleSpeichernAbwarten();
    const d = store.getState().daten!;
    expect(d.figuren.fiete).toMatchObject({ name: 'Fiete', existenz: 'gesichert' });
    expect(d.figuren.paul!.beziehungen).toEqual([{ zu: 'fiete', art: 'kauft für ihn ein', abKapitel: 'funkstille', kategorie: 'sonstige', unsicher: true }]);
    expect(await fs.lesen('figuren/paul.md')).toContain('  - zu: fiete\n    art: kauft für ihn ein\n    abKapitel: funkstille\n    kategorie: sonstige\n    unsicher: true');
    const ablage = await ablageAufPlatte(fs);
    expect(ablage.figuren.find((f) => f.name === 'Fiete')).toMatchObject({ status: 'uebernommen', figur: 'fiete' });
    expect(ablage.beziehungen.find((b) => b.schluessel === 'beziehung:fiete|paul@funkstille')?.status).toBe('uebernommen');
    // Beziehung zwischen angelegten Figuren (Herr Kessler → Konrad)
    await store.getState().vorschlagUebernehmen('beziehung', 'beziehung:herr-kessler|konrad@fassade');
    expect(store.getState().daten!.figuren['herr-kessler']!.beziehungen.at(-1)).toEqual({ zu: 'konrad', art: 'Kunde', abKapitel: 'fassade', kategorie: 'arbeit' });
  });

  it('Ort übernehmen: übergeordneter Ort wird aufgelöst, auch wenn er erst später übernommen wird', async () => {
    const { store, fs } = await laden({ ohneFiguren: true });
    await store.getState().vorschlaegeHolen();
    await store.getState().vorschlagUebernehmen('ort', 'ort:zeichensaal');
    expect(store.getState().daten!.orte.zeichensaal).toMatchObject({ name: 'Zeichensaal', beschreibung: '', notizen: '' });
    expect(store.getState().daten!.orte.zeichensaal!.in).toBeUndefined();
    await store.getState().vorschlagUebernehmen('ort', 'ort:buero');
    await store.getState().vorschlagUebernehmen('ort', 'ort:teekueche');
    await store.getState().alleSpeichernAbwarten();
    const orte = store.getState().daten!.orte;
    expect(orte.buero!.in).toBeUndefined();
    expect(orte.zeichensaal!.in).toBe('buero');
    expect(orte.teekueche!.in).toBe('buero');
    expect(parseOrt((await fs.lesen('orte/zeichensaal.md'))!).in).toBe('buero');
  });

  it('Leons Fall: „Alle übernehmen“ ohne Figuren legt Figuren, Orte und Beziehungen an; ein neuer Lauf bringt nichts wieder', async () => {
    const { store, fs } = await laden({ ohneFiguren: true });
    await store.getState().vorschlaegeHolen();
    const r = await store.getState().alleVorschlaegeUebernehmen();
    expect(r).toEqual({ figuren: 11, orte: 10, beziehungen: 12 });
    await store.getState().alleSpeichernAbwarten();
    const d = store.getState().daten!;
    expect(Object.keys(d.figuren)).toHaveLength(11);
    expect(Object.keys(d.orte)).toHaveLength(10);
    expect(d.orte.teekueche!.in).toBe('buero');
    // Paul (die meisten Beziehungen) liegt in der Mitte, alle Karten ohne Überlappung
    const karten = Object.values(d.figuren).map((f) => karte(f.netz!));
    expect(ueberlappungsfrei(karten)).toBe(true);
    expect(d.figuren.paul!.netz).toEqual(kreisPositionen([], 11)[0]);
    // Beziehungen an „von“, inkl. Beziehungen zwischen vorgeschlagenen Figuren
    expect(d.figuren.ole!.beziehungen).toEqual([{ zu: 'paul', art: 'Kollege', abKapitel: 'grundriss', kategorie: 'arbeit' }]);
    expect(d.figuren['herr-kessler']!.beziehungen.map((b) => b.zu).sort()).toEqual(['konrad', 'paul']);
    expect(d.figuren['die-fremde']!.beziehungen).toEqual([{ zu: 'paul', art: 'Nacht im Fährhaus', abKapitel: 'bis-bald', kategorie: 'dates' }]);
    const ablage = await ablageAufPlatte(fs);
    expect([...ablage.figuren, ...ablage.orte, ...ablage.beziehungen].every((v) => v.status === 'uebernommen')).toBe(true);
    expect(parseFigur((await fs.lesen('figuren/lotte.md'))!)).toMatchObject({ name: 'Lotte', rolle: 'haupt', kurz: 'Kleinanzeige', existenz: 'gesichert' });

    await store.getState().vorschlaegeHolen();
    expect(store.getState().vorschlagErgebnis).toMatchObject({ neu: 0, aktualisiert: 0 });
    expect(store.getState().vorschlagErgebnis!.bereitsAngelegt).toBe(12);
  });

  it('Verwerfen: eine Figur nimmt ihre Beziehungen mit; Verworfenes kommt im nächsten Lauf nicht wieder', async () => {
    const { store, fs } = await laden();
    await store.getState().vorschlaegeHolen();
    await store.getState().vorschlagVerwerfen('figur', 'figur:fiete');
    await store.getState().vorschlagVerwerfen('beziehung', 'beziehung:malte|ole@fassade');
    await store.getState().vorschlagVerwerfen('ort', 'ort:fischrestaurant');
    await store.getState().alleSpeichernAbwarten();
    const ablage = await ablageAufPlatte(fs);
    expect(ablage.figuren.find((f) => f.name === 'Fiete')?.status).toBe('verworfen');
    expect(ablage.beziehungen.find((b) => b.schluessel === 'beziehung:fiete|paul@funkstille')?.status).toBe('verworfen');
    expect(ablage.orte.find((o) => o.name === 'Fischrestaurant')?.status).toBe('verworfen');
    expect(store.getState().daten!.figuren.fiete).toBeUndefined();

    await store.getState().vorschlaegeHolen();
    expect(store.getState().vorschlagErgebnis).toMatchObject({ neu: 0, aktualisiert: 5, bereitsEntschieden: 4 });
    const danach = store.getState().daten!.kiVorschlaege!;
    expect(danach.figuren.find((f) => f.name === 'Fiete')?.status).toBe('verworfen');
    // „Alle übernehmen“ legt Verworfenes nicht an
    await store.getState().alleVorschlaegeUebernehmen();
    expect(store.getState().daten!.figuren.fiete).toBeUndefined();
    expect(store.getState().daten!.orte.bar).toBeUndefined();
    expect(store.getState().daten!.figuren['der-mann-am-fischstand']).toBeDefined();
  });

  it('Fehler: ohne Schlüssel → „nicht_bereit“ (Einstellungen öffnen), nichts gespeichert', async () => {
    const basis = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    const { store, fs } = await laden({ ki: { ...basis, bereit: async () => false } });
    await store.getState().vorschlaegeHolen();
    expect(store.getState().vorschlagFehler).toMatchObject({ art: 'nicht_bereit' });
    expect(store.getState().vorschlagLaeuft).toBe(false);
    expect(await fs.existiert(PFADE.vorschlaege)).toBe(false);
    expect(store.getState().daten!.kiVorschlaege).toBeUndefined();
  });

  it('oeffneVorschlaege wechselt zu „Beziehungen“ und öffnet Panel bzw. Dialog', async () => {
    const { store } = await laden();
    store.getState().oeffneVorschlaege();
    expect(store.getState()).toMatchObject({ bereich: 'beziehungen', vorschlagPanel: true, vorschlagDialog: false });
    store.getState().oeffneVorschlaege({ dialog: true });
    expect(store.getState().vorschlagDialog).toBe(true);
    store.getState().schliesseVorschlagsDialog();
    store.getState().schliesseVorschlagsPanel();
    expect(store.getState()).toMatchObject({ vorschlagPanel: false, vorschlagDialog: false });
  });
});
