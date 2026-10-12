/** G6 Leser-Simulation: Kapitel-Begrenzung im Request, Belegprüfung, Allowlist, Speicherform, Fäden-Abgleich. */
import { describe, expect, it } from 'vitest';
import { demoDateien, demoFs } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import type { KiTransport } from './index';
import { ladeProjekt, MemoryFs, parseKiLeser, serializeKiLeser } from '../projekt';
import {
  alsLeserStand,
  aufgabenAnfrage,
  ausLeserStand,
  fadenAbgleich,
  frageKapitel,
  fuehreAufgabeAus,
  leserBasisHash,
  leserSimulationAufgabe,
  leserStandVeraltet,
  aktuellerStand,
  offeneFragen,
  ordneStaende,
  schaetzeAufgabe,
  staendeFuer,
  standId,
  uebernahmenMitnehmen,
  werteAufgabenAntwortAus,
  type LeserSimulation,
} from './index';

type Body = Record<string, unknown>;
const bloecke = (body: Body) => (body.messages as { content: { text: string; cache_control?: unknown }[] }[])[0]!.content;

function aufzeichnend(): { transport: KiTransport; bodies: Body[]; zaehlBodies: Body[] } {
  const basis = erstelleDemoKiTransport({ verzoegerungMs: 0 });
  const bodies: Body[] = [];
  const zaehlBodies: Body[] = [];
  return {
    bodies,
    zaehlBodies,
    transport: {
      bereit: () => basis.bereit(),
      async senden(b) {
        bodies.push(structuredClone(b));
        return basis.senden(b);
      },
      async tokenZaehlen(b) {
        zaehlBodies.push(structuredClone(b));
        return basis.tokenZaehlen(b);
      },
    },
  };
}

describe('Leser-Simulation: Request', () => {
  it('schickt nur Kapitel 1..n (nicht das ganze Buch)', async () => {
    const body = await aufgabenAnfrage(demoFs(), leserSimulationAufgabe('lotte'));
    const [prefix, aufgabe] = bloecke(body);
    expect(prefix!.cache_control).toEqual({ type: 'ephemeral' });
    for (const id of ['grundriss', 'fassade', 'lotte']) expect(prefix!.text).toContain(`id="${id}"`);
    for (const id of ['regatta', 'staub', 'weissraum', 'ebbe', 'bis-bald', 'flut', 'funkstille']) expect(prefix!.text).not.toContain(`id="${id}"`);
    // kein Satz aus späteren Kapiteln, auch nicht in Aufgabe oder Schema
    const json = JSON.stringify(body);
    expect(json).not.toContain('Paul wacht in einem Zimmer auf');
    expect(json).not.toContain('Fiete einkauft');
    expect(aufgabe!.text).toMatch(/^<aufgabe art="leser" kapitel="lotte">\nLies Kapitel 1 bis 3 /);
    // Kapitel-Enum im Schema nur 1..n
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain('"lotte"');
    expect(schema).not.toContain('"ebbe"');
  });

  it('Kostenschätzung zählt nur Kapitel 1..n', async () => {
    const { transport, zaehlBodies } = aufzeichnend();
    const frueh = await schaetzeAufgabe(demoFs(), transport, undefined, leserSimulationAufgabe('fassade'));
    const spaet = await schaetzeAufgabe(demoFs(), transport, undefined, leserSimulationAufgabe('funkstille'));
    expect(frueh.kapitel).toEqual(['grundriss', 'fassade']);
    expect(frueh.anfragen).toBe(1);
    expect(frueh.eingabeTokens).toBeLessThan(spaet.eingabeTokens);
    expect(frueh.kostenUsd).toBeGreaterThan(0);
    for (const b of zaehlBodies.slice(0, 2)) expect(JSON.stringify(b)).not.toContain('id="lotte"');
  });

  it('Tiefencheck nutzt Opus, sonst Sonnet', async () => {
    expect((await aufgabenAnfrage(demoFs(), leserSimulationAufgabe('lotte'))).model).toBe('claude-sonnet-5-5');
    expect((await aufgabenAnfrage(demoFs(), leserSimulationAufgabe('lotte', { tiefencheck: true }))).model).toBe('claude-opus-5-5');
  });

  it('Allowlist (E12): Wahrheit hinter den Kulissen, private Notizen und Anmerkungen gehen nicht mit', async () => {
    const dateien = demoDateien();
    dateien['figuren/paul.md'] = dateien['figuren/paul.md']!.replace('Privat (Testtext): Paul erinnert sich', 'GEHEIM-WAHRHEIT Paul erinnert sich').replace(
      'Privat (Testtext): Bleistift-Motiv',
      'GEHEIM-NOTIZ Bleistift-Motiv',
    );
    dateien['anmerkungen.json'] = dateien['anmerkungen.json']!.replace('Wo setzen sie sich hin? Szene noch ausführen.', 'GEHEIM-ANMERKUNG');
    expect(JSON.stringify(dateien)).toContain('GEHEIM-WAHRHEIT');
    expect(JSON.stringify(dateien)).toContain('GEHEIM-ANMERKUNG');
    const fs = new MemoryFs(dateien);
    const { transport, bodies, zaehlBodies } = aufzeichnend();
    await schaetzeAufgabe(fs, transport, undefined, leserSimulationAufgabe('funkstille'));
    await fuehreAufgabeAus(fs, transport, undefined, leserSimulationAufgabe('funkstille'));
    expect(bodies.length).toBe(1);
    for (const b of [...bodies, ...zaehlBodies]) {
      const json = JSON.stringify(b);
      expect(json).not.toContain('GEHEIM');
      expect(json).not.toContain('Privat (Testtext)');
    }
    // Leons Kapitelpläne gehen mit (für den Plan-Abgleich)
    expect(bloecke(bodies[0]!)[0]!.text).toContain('Am Ende die Frage, was Nordhaven zu den Fenstern sagt');
  });
});

describe('Leser-Simulation: Belegprüfung', () => {
  async function werte(antwort: unknown, kapitel = 'lotte') {
    return werteAufgabenAntwortAus(demoFs(), leserSimulationAufgabe(kapitel), antwort);
  }

  it('behält wörtlich belegte Einträge, verwirft erfundene Zitate, Zitate aus späteren Kapiteln und Schreibvorschläge', async () => {
    const r = await werte({
      weiss: [
        { text: 'Paul hat ein Treffen mit Lotte.', belege: [{ kapitel: 'lotte', text: 'den er vor zwei Wochen über Kleinanzeigen gekauft hat' }] },
        { text: 'Paul kennt Lotte aus der Schule.', belege: [{ kapitel: 'lotte', text: 'Paul kennt Lotte seit der Schulzeit' }] },
        { text: 'Paul wacht im Fährhaus auf.', belege: [{ kapitel: 'bis-bald', text: 'Paul wacht auf einer Holzbank im Fährhaus auf' }] },
        { text: 'Ohne Beleg.', belege: [] },
      ],
      fragen: [
        { frage: 'Wie weit ist Paul mit dem Entwurf?', belege: [{ kapitel: 'grundriss', text: 'Und was sagt Nordhaven zu so vielen Fenstern?' }], beantwortetIn: '' },
        { frage: 'Wie verläuft das Treffen?', belege: [{ kapitel: 'lotte', text: 'Bestell dir schon mal was, ich beeil mich.' }], beantwortetIn: 'flut' },
      ],
      vermutungen: [],
      spannung: [{ text: 'Der Einstieg wäre besser mit einem Dialog.', belege: [{ kapitel: 'lotte', text: 'den er vor zwei Wochen über Kleinanzeigen gekauft hat' }] }],
      plan: [
        { kapitel: 'grundriss', aussage: 'Am Ende die Frage, was Nordhaven zu den Fenstern sagt', status: 'belegt', erklaerung: 'Ole fragt an der Tür.', belege: [{ kapitel: 'grundriss', text: 'Und was sagt Nordhaven zu so vielen Fenstern?' }] },
        { kapitel: 'fassade', aussage: 'erfundener Plan', status: 'nicht_belegt', erklaerung: 'Steht nicht im Text.', belege: [] },
        { kapitel: 'ebbe', aussage: 'Der Abend mit Vera endet', status: 'belegt', erklaerung: 'x', belege: [] },
      ],
    });
    const s = r.ergebnis;
    expect(s.weiss.map((w) => w.text)).toEqual(['Paul hat ein Treffen mit Lotte.']);
    expect(s.fragen.map((f) => f.frage)).toEqual(['Wie weit ist Paul mit dem Entwurf?', 'Wie verläuft das Treffen?']);
    // beantwortetIn nur innerhalb 1..n
    expect(s.fragen.every((f) => f.beantwortetIn === undefined)).toBe(true);
    expect(s.spannung).toEqual([]);
    expect(s.plan).toHaveLength(2);
    expect(s.plan[0]).toMatchObject({ kapitel: 'grundriss', aussage: 'Am Ende die Frage, was Nordhaven zu den Fenstern sagt', status: 'belegt' });
    // unbekannte Plan-Aussage wird auf Leons Plan-Text zurückgeführt (nie Modelltext als „Plan sagt“)
    expect(s.plan[1]).toMatchObject({ kapitel: 'fassade', status: 'nicht_belegt', belege: [] });
    expect(s.plan[1]!.aussage).toContain('Herr Kessler will die Fassade ganz aus Glas');
    const gruende = r.verworfen.map((v) => v.grund).join(' | ');
    expect(r.verworfen.length).toBe(5);
    expect(gruende).toMatch(/Formulierung|Vorschlag|besser/i);
    expect(gruende).toContain('ebbe');
  });

  it('Plan-Abgleich „belegt“ ohne Zitat wird verworfen', async () => {
    const r = await werte({
      weiss: [],
      fragen: [],
      vermutungen: [],
      spannung: [],
      plan: [{ kapitel: 'grundriss', aussage: 'Das Pappmodell in der Teeküche', status: 'belegt', erklaerung: 'steht da', belege: [] }],
    });
    expect(r.ergebnis.plan).toEqual([]);
    expect(r.verworfen[0]!.grund).toContain('ohne wörtliches Zitat');
  });

  it('Demo-Antwort: nur Kapitel 1..n belegt, die absichtlich ungültigen Einträge werden verworfen', async () => {
    const { transport } = aufzeichnend();
    const r = await fuehreAufgabeAus(demoFs(), transport, undefined, leserSimulationAufgabe('bis-bald'));
    const daten = await ladeProjekt(demoFs());
    const erlaubt = new Set(daten.projekt.kapitel.slice(0, daten.projekt.kapitel.indexOf('bis-bald') + 1));
    const s = r.ergebnis;
    const alle = [...s.weiss, ...s.vermutungen, ...s.spannung].flatMap((a) => a.belege).concat(s.fragen.flatMap((f) => f.belege), s.plan.flatMap((p) => p.belege));
    expect(alle.length).toBeGreaterThan(10);
    for (const z of alle) {
      expect(erlaubt.has(z.kapitel)).toBe(true);
      expect(daten.kapitel[z.kapitel]!.text).toContain(z.text);
    }
    expect(s.weiss.some((w) => w.text.includes('Fährhaus'))).toBe(true);
    expect(s.fragen.find((f) => f.frage.startsWith('Wie weit ist Paul'))?.beantwortetIn).toBe('weissraum');
    expect(s.fragen.find((f) => f.frage.startsWith('Wie verläuft das Treffen'))?.beantwortetIn).toBeUndefined();
    expect(s.plan.length).toBeGreaterThan(3);
    expect(r.verworfen.map((v) => v.grund)).toHaveLength(2);
  });
});

describe('Leser-Simulation: Speicherform und Stand', () => {
  const sim: LeserSimulation = {
    kapitel: 'lotte',
    basisHash: 'h1',
    weiss: [{ text: 'Paul hat ein Date.', belege: [{ kapitel: 'lotte', text: 'Kleinanzeigen' }] }],
    fragen: [
      { id: 'weissraum', frage: 'Konzept?', belege: [{ kapitel: 'grundriss', text: 'Konzept' }] },
      { id: 'date', frage: 'Date?', belege: [{ kapitel: 'lotte', text: 'Date' }], beantwortetIn: 'lotte' },
    ],
    vermutungen: [{ text: 'Vermutung', belege: [{ kapitel: 'fassade', text: 'Aufsichtsrat' }] }],
    spannung: [{ text: 'Spannung', belege: [{ kapitel: 'lotte', text: 'Klappbrücke' }] }],
    plan: [
      { kapitel: 'grundriss', aussage: 'Plan A', status: 'belegt', erklaerung: 'weil', belege: [{ kapitel: 'grundriss', text: 'Konzept' }] },
      { kapitel: 'fassade', aussage: 'Plan B', status: 'nicht_belegt', erklaerung: '', belege: [] },
    ],
    modell: 'demo',
    datum: '2026-10-10T10:00:00.000Z',
  };

  it('übersteht LeserStand und .plotwerk/leser.json verlustfrei', () => {
    const stand = alsLeserStand(sim);
    const datei = serializeKiLeser({ version: 1, eintraege: [stand] });
    // ohne gespeicherte id leitet ausLeserStand sie aus Kapitel und Datum ab
    expect(ausLeserStand(parseKiLeser(datei).eintraege[0]!)).toEqual({ ...sim, id: 'lotte@2026-10-10T10:00:00.000Z' });
    expect(offeneFragen(sim).map((f) => f.id)).toEqual(['weissraum']);
  });

  it('veraltet, wenn sich Text oder Plan bis Kapitel n ändert – nicht bei späteren Kapiteln', async () => {
    const daten = await ladeProjekt(demoFs());
    const stand = { kapitel: 'lotte', basisHash: leserBasisHash(daten, 'lotte') };
    expect(leserStandVeraltet(daten, stand)).toBe(false);
    const spaeter = { ...daten, kapitel: { ...daten.kapitel, ebbe: { ...daten.kapitel.ebbe!, text: 'neu' } } };
    expect(leserStandVeraltet(spaeter, stand)).toBe(false);
    const frueher = { ...daten, kapitel: { ...daten.kapitel, fassade: { ...daten.kapitel.fassade!, text: `${daten.kapitel.fassade!.text} Neu.` } } };
    expect(leserStandVeraltet(frueher, stand)).toBe(true);
    const plan = { ...daten, plaene: { ...daten.plaene, grundriss: { ...daten.plaene.grundriss!, notiz: 'anders' } } };
    expect(leserStandVeraltet(plan, stand)).toBe(true);
    expect(leserStandVeraltet(daten, { kapitel: 'lotte', basisHash: '' })).toBe(true);
  });
});

describe('Fäden-Planung neben den Leserfragen (lokal)', () => {
  const reihe = ['a', 'b', 'c', 'd'];
  it('erwartet „offen“ vor der geplanten Auflösung und „aufgelöst“ danach', () => {
    const fragen = [
      { id: 'bleistifte', frage: 'Warum hat Paul seine Bleistifte nicht dabei?', belege: [] },
      { id: 'postkarten', frage: 'Wer schreibt die Postkarten?', belege: [], beantwortetIn: 'c' },
    ];
    const faeden = [
      { id: 'pauls-bleistifte', name: 'Pauls Bleistifte', eroeffnetIn: 'a', aufloesungIn: 'd' },
      { id: 'postkarten', name: 'Die Postkarten', eroeffnetIn: 'b', aufloesungIn: 'c' },
      { id: 'spaeter', name: 'Später', eroeffnetIn: 'd' },
      { id: 'schluessel', name: 'Messingschlüssel', eroeffnetIn: 'a' },
    ];
    const r = fadenAbgleich(reihe, 'c', faeden, fragen);
    expect(r.map((x) => x.faden.id)).toEqual(['pauls-bleistifte', 'postkarten', 'schluessel']);
    expect(r[0]).toMatchObject({ soll: 'offen', passt: true, frage: { id: 'bleistifte' } });
    expect(r[1]).toMatchObject({ soll: 'aufgeloest', passt: true, frage: { id: 'postkarten' } });
    expect(r[2]!.frage).toBeUndefined();
    expect(fadenAbgleich(reihe, 'b', faeden, fragen)[1]).toMatchObject({ soll: 'offen', passt: false });
  });
});

describe('Übernahmen aus der Leser-Simulation', () => {
  const stand = (fragen: { id: string; frage: string; faden?: string; anmerkung?: string }[]) => ({
    kapitel: 'c',
    basisHash: 'x',
    weiss: [],
    fragen: fragen.map((f) => ({ ...f, belege: [] })),
    modell: 'm',
    datum: '2026-10-12T10:00:00.000Z',
  });

  it('nimmt Faden und Notiz gleicher Fragen in den neuen Stand mit', () => {
    const alt = stand([
      { id: 'wer-kauft', frage: 'Wer kauft?', faden: 'wer-kauft' },
      { id: 'wer-spricht', frage: 'Wer spricht?', anmerkung: 'wer-spricht-hier' },
      { id: 'weg', frage: 'Weg?', faden: 'weg' },
    ]);
    const neu = uebernahmenMitnehmen(alt, stand([{ id: 'wer-kauft', frage: 'Wer kauft?' }, { id: 'wer-spricht', frage: 'Wer spricht?' }, { id: 'neu', frage: 'Neu?' }]));
    expect(neu.fragen).toEqual([
      { id: 'wer-kauft', frage: 'Wer kauft?', belege: [], faden: 'wer-kauft' },
      { id: 'wer-spricht', frage: 'Wer spricht?', belege: [], anmerkung: 'wer-spricht-hier' },
      { id: 'neu', frage: 'Neu?', belege: [] },
    ]);
    expect(uebernahmenMitnehmen(undefined, neu)).toBe(neu);
  });

  it('Faden und Notiz überstehen Speichern und Laden', () => {
    const s = stand([{ id: 'wer-kauft', frage: 'Wer kauft?', faden: 'wer-kauft', anmerkung: 'notiz-1' }]);
    expect(parseKiLeser(serializeKiLeser({ version: 1, eintraege: [s] })).eintraege[0]!.fragen[0]).toEqual(s.fragen[0]);
  });

  it('eine Frage kommt im frühesten Belegkapitel auf', () => {
    const reihe = ['a', 'b', 'c'];
    const z = (kapitel: string) => ({ kapitel, text: 'x' });
    expect(frageKapitel({ belege: [z('c'), z('b')] }, reihe, 'c')).toBe('b');
    expect(frageKapitel({ belege: [] }, reihe, 'c')).toBe('c');
    expect(frageKapitel({ belege: [z('fremd')] }, reihe, 'c')).toBe('c');
  });
});

describe('Mehrere Simulationen je Kapitel', () => {
  const st = (kapitel: string, datum: string, extra: { id?: string; erledigt?: string } = {}) => ({
    ...extra,
    kapitel,
    basisHash: 'x',
    weiss: [],
    fragen: [],
    modell: 'm',
    datum,
  });

  it('ID: gespeichert oder aus Kapitel und Datum abgeleitet', () => {
    expect(standId(st('a', '2026-10-01T10:00:00.000Z', { id: 'a-1' }))).toBe('a-1');
    expect(standId(st('a', '2026-10-01T10:00:00.000Z'))).toBe('a@2026-10-01T10:00:00.000Z');
  });

  it('neueste zuerst; aktuell ist die neueste nicht erledigte; gespeichert nach Kapitel und Datum', () => {
    const alt = st('b', '2026-10-01T10:00:00.000Z', { id: 'b-alt' });
    const neu = st('b', '2026-10-05T10:00:00.000Z', { id: 'b-neu', erledigt: '2026-10-06T10:00:00.000Z' });
    const a = st('a', '2026-10-03T10:00:00.000Z', { id: 'a' });
    expect(staendeFuer([alt, a, neu], 'b').map((e) => e.id)).toEqual(['b-neu', 'b-alt']);
    expect(aktuellerStand([alt, a, neu], 'b')?.id).toBe('b-alt');
    expect(aktuellerStand([neu], 'b')).toBeUndefined();
    expect(ordneStaende([neu, a, alt], ['a', 'b']).map((e) => e.id)).toEqual(['a', 'b-alt', 'b-neu']);
  });

  it('id und erledigt überstehen Speichern und Laden; ältere Dateien bleiben unverändert', () => {
    const s = st('a', '2026-10-01T10:00:00.000Z', { id: 'a-1', erledigt: '2026-10-02T10:00:00.000Z' });
    expect(parseKiLeser(serializeKiLeser({ version: 1, eintraege: [s] })).eintraege[0]).toEqual(s);
    const ohne = serializeKiLeser({ version: 1, eintraege: [st('a', '2026-10-01T10:00:00.000Z')] });
    expect(serializeKiLeser(parseKiLeser(ohne))).toBe(ohne);
    expect(ohne).not.toContain('"id"');
  });
});
