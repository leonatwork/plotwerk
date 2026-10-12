import { describe, expect, it } from 'vitest';
import { demoFs, demoFsEn, ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import { ladeProjekt, MemoryFs, parseKiStrangVorschlaege, serializeKiStrangVorschlaege } from '../projekt';
import { offeneStrangVorschlaege, strangFrageBeantworten, strangVorschlagUebernehmen, strangVorschlagVerwerfen } from '../struktur/straenge';
import { aufgabenAnfrage, mischeStrangVorschlaege, schlageStraengeVor, straengeDefinition, strangAuftrag } from './index';

const demo = () => erstelleDemoKiTransport({ verzoegerungMs: 0 });

/** Text des zweiten Blocks (Aufgabe) aus einem Messages-API-Body */
function aufgabeAus(body: Record<string, unknown>): string {
  const inhalt = (body.messages as { content: { text?: string }[] }[])[0]!.content;
  return inhalt.map((c) => c.text ?? '').join('\n');
}

describe('Stränge vorschlagen (G2)', () => {
  it('schickt Name, Rolle, Zweck und Plan-Kapitel der Stränge nur in der Aufgabe, nicht im Prefix', async () => {
    const fs = demoFs();
    const d = await ladeProjekt(fs);
    const nordhaven = d.straenge.find((s) => s.id === 'nordhaven')!;
    d.straenge = d.straenge.map((s) => (s.id === 'nordhaven' ? { ...nordhaven, rolle: 'haupt' as const, beschreibung: 'Der Auftrag für den [[figur:konrad|Konrad]]-Kunden' } : s));
    const auftrag = strangAuftrag(d);
    expect(auftrag.straenge.find((s) => s.id === 'nordhaven')).toEqual({
      id: 'nordhaven',
      name: 'Antagonist: Nordhaven',
      rolle: 'haupt',
      beschreibung: 'Der Auftrag für den Konrad-Kunden',
      kapitel: ['grundriss', 'fassade', 'staub', 'weissraum'],
    });
    const body = await aufgabenAnfrage(fs, straengeDefinition(auftrag));
    const text = aufgabeAus(body);
    expect(text).toContain('Antagonist: Nordhaven (id: nordhaven) · Haupthandlung · Zweck: Der Auftrag für den Konrad-Kunden');
    const prefix = (body.messages as { content: { text?: string }[] }[])[0]!.content[0]!.text ?? '';
    expect(prefix).not.toContain('Zweck:');
  });

  it('prüft die Demo-Antwort: Zitate wörtlich, Erfundenes verworfen, schon Geplantes nicht', async () => {
    const r = await schlageStraengeVor(demoFs(), demo(), undefined);
    const arten = r.ergebnis.vorschlaege.map((v) => `${v.art}:${v.schluessel}`);
    expect(arten).toEqual([
      'neu:strang:der-alte-speicher',
      'zuordnung:zuordnung:nordhaven|funkstille',
      expect.stringMatching(/^frage:frage:gehoert-der-verkauf/),
      expect.stringMatching(/^frage:frage:welcher-strang/),
    ]);
    const neu = r.ergebnis.vorschlaege[0]!;
    expect(neu).toMatchObject({ name: 'Der alte Speicher', rolle: 'neben', kapitel: ['grundriss', 'staub', 'funkstille'] });
    expect(neu.belege).toHaveLength(3);
    // erfundenes Postkarten-Zitat
    expect(r.verworfen.some((v) => /nicht wörtlich/.test(v.grund))).toBe(true);
  });

  it('beantwortet englische Bücher auf Englisch', async () => {
    const r = await schlageStraengeVor(demoFsEn(), demo(), undefined, { oberflaeche: 'en' });
    expect(r.ergebnis.vorschlaege.find((v) => v.art === 'neu')?.name).toBe('The old granary');
  });

  it('übernimmt, verwirft und beantwortet – Entschiedenes kommt nicht wieder', async () => {
    const d = await ladeDemoProjekt();
    const r = await schlageStraengeVor(demoFs(), demo(), undefined);
    const gemischt = mischeStrangVorschlaege(undefined, r.ergebnis.vorschlaege, { datum: r.datum, modell: r.modell });
    expect(gemischt.neu).toBe(4);
    d.kiStrangVorschlaege = gemischt.ablage;
    expect(offeneStrangVorschlaege(d, 'funkstille').map((v) => v.art)).toEqual(['neu', 'zuordnung']);

    // neuer Strang nur für zwei der drei Kapitel
    const u = strangVorschlagUebernehmen(d, 'strang:der-alte-speicher', ['grundriss', 'staub'])!;
    const speicher = u.straenge.find((s) => s.id === 'der-alte-speicher')!;
    expect(speicher).toMatchObject({ name: 'Der alte Speicher', rolle: 'neben', farbe: '#2F6B45' });
    expect(speicher.beschreibung).toMatch(/Kornspeicher/);
    expect(u.plaene.map((p) => [p.id, p.straenge.includes('der-alte-speicher')])).toEqual([
      ['grundriss', true],
      ['staub', true],
    ]);

    const zuordnung = strangVorschlagUebernehmen(d, 'zuordnung:nordhaven|funkstille')!;
    expect(zuordnung.plaene[0]!.straenge).toContain('nordhaven');

    const frage = gemischt.ablage.eintraege.find((v) => v.art === 'frage')!;
    let ablage = strangFrageBeantworten(u.ablage, frage.schluessel, 'Eigener Strang, gehört aber zum Hafen.');
    ablage = strangVorschlagVerwerfen(ablage, 'zuordnung:nordhaven|funkstille');
    d.kiStrangVorschlaege = ablage;
    expect(strangAuftrag(d).antworten).toEqual([{ frage: frage.frage, antwort: 'Eigener Strang, gehört aber zum Hafen.' }]);

    // zweiter Lauf: alles Entschiedene bleibt draußen
    const nochmal = mischeStrangVorschlaege(ablage, r.ergebnis.vorschlaege);
    expect(nochmal.bereitsEntschieden).toBe(3);
    expect(nochmal.ablage.eintraege.filter((v) => v.status === 'neu')).toHaveLength(1);

    // Ablage übersteht Speichern und Lesen
    expect(parseKiStrangVorschlaege(serializeKiStrangVorschlaege(nochmal.ablage))).toEqual(nochmal.ablage);
  });

  it('liest und schreibt Rolle, Beschreibung und Funktion', async () => {
    const fs = new MemoryFs({
      'projekt.md': '---\nversion: 1\ntitel: T\nkapitel: [eins]\n---\n',
      'plan/straenge.md': '---\nstraenge:\n  - id: fall\n    name: Der Fall\n    farbe: "#3D5A75"\n    rolle: haupt\n    beschreibung: Jan wird ausgenutzt\n  - id: x\n    name: X\n    farbe: "#C2405C"\n    rolle: quatsch\n---\n',
      'plan/kapitel/eins.md': '---\nid: eins\ntitel: Eins\nakt: null\nstatus: geplant\nszene: Opening\nfunktion: Wendepunkt\nstraenge: []\nfiguren: []\norte: []\n---\nNotiz\n',
    });
    const d = await ladeProjekt(fs);
    expect(d.straenge).toEqual([
      { id: 'fall', name: 'Der Fall', farbe: '#3D5A75', rolle: 'haupt', beschreibung: 'Jan wird ausgenutzt' },
      { id: 'x', name: 'X', farbe: '#C2405C' },
    ]);
    expect(d.plaene.eins).toMatchObject({ szene: 'Opening', funktion: 'Wendepunkt', notiz: 'Notiz' });
  });
});
