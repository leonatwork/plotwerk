import { demoDateien } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import type { KiEinstellungen, KiVorschlaege, ProjektDaten } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import {
  ladeProjekt,
  MemoryFs,
  parseKiVorschlaege,
  PFADE,
  serializeKiVorschlaege,
  speichereKiVorschlaege,
  uebernehmeExterneAenderungen,
} from '../projekt';
import { klartext } from '../text';
import {
  beziehungSchluessel,
  figurSchluessel,
  KiFehler,
  mischeVorschlaege,
  offeneVorschlaege,
  ortSchluessel,
  pruefeVorschlaege,
  schaetzeVorschlaege,
  schlageVorschlaegeVor,
  STANDARD_KI,
  vorschlagsAnfrage,
  werteVorschlagsAntwortAus,
  type KiTransport,
  type VorschlagsErgebnis,
} from './index';

type Body = Record<string, unknown>;

/** Demo-Projekt als Dateien; `aendern` darf Dateien ersetzen oder löschen. */
function fsMit(aendern?: (d: Record<string, string>) => void): MemoryFs {
  const d = demoDateien();
  aendern?.(d);
  return new MemoryFs(d);
}

/** Leons Fall: Manuskript ohne angelegte Figuren und Orte. */
function ohneFigurenUndOrte(): MemoryFs {
  return fsMit((d) => {
    for (const p of Object.keys(d)) if (p.startsWith('figuren/') || p.startsWith('orte/') || p.startsWith('gruppen/')) delete d[p];
  });
}

function aufzeichnend(basis: KiTransport = erstelleDemoKiTransport({ verzoegerungMs: 0 })) {
  const bodies: Body[] = [];
  const zaehlBodies: Body[] = [];
  const transport: KiTransport = {
    bereit: () => basis.bereit(),
    async senden(b) {
      bodies.push(structuredClone(b));
      return basis.senden(b);
    },
    async tokenZaehlen(b) {
      zaehlBodies.push(structuredClone(b));
      return basis.tokenZaehlen(b);
    },
  };
  return { transport, bodies, zaehlBodies };
}

/** Transport, der genau `daten` als Antwort-JSON liefert. */
function festerTransport(daten: unknown, sonder?: Body): KiTransport & { bodies: Body[] } {
  const bodies: Body[] = [];
  return {
    bodies,
    async bereit() {
      return true;
    },
    async senden(body) {
      bodies.push(body);
      return (
        sonder ?? {
          type: 'message',
          content: [{ type: 'text', text: JSON.stringify(daten) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000 },
        }
      );
    },
    async tokenZaehlen() {
      return 5000;
    },
  };
}

const beleg = (kapitel: string, zitat: string) => ({ kapitel, zitat });

async function pruefe(daten: unknown, fs: MemoryFs = fsMit()) {
  return pruefeVorschlaege(await ladeProjekt(fs), daten);
}

// ---------------------------------------------------------------------------

describe('Vorschläge (Demo-Transport)', () => {
  it('Demo-Projekt: schlägt nur Neues vor und verwirft die absichtlich falschen', async () => {
    const e = await schlageVorschlaegeVor(fsMit(), erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI, {
      jetzt: () => new Date('2026-10-09T12:00:00Z'),
    });
    expect(e.figuren.map((f) => f.name)).toEqual(['Fiete', 'Der Mann am Fischstand']);
    expect(e.orte.map((o) => o.name)).toEqual(['Fischrestaurant', 'Nordkai']);
    const paare = e.beziehungen.map((b) => `${b.von.name} – ${b.zu.name}: ${b.art}`);
    expect(paare).toEqual([
      'Herr Kessler – Konrad: Kunde',
      'Malte – Ole: Kollege',
      'Paul – Fiete: kauft für ihn ein',
      'Der Mann am Fischstand – Paul: kennt ihn vom Fischstand',
      'Alter Mann am Kai – Paul: Passant',
    ]);
    const fiete = e.beziehungen.find((b) => b.zu.name === 'Fiete')!;
    expect(fiete.von).toEqual({ typ: 'angelegt', id: 'paul', name: 'Paul' });
    expect(fiete.zu).toEqual({ typ: 'vorschlag', id: 'figur:fiete', name: 'Fiete' });
    expect(fiete).toMatchObject({ kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: true, status: 'neu' });
    expect(fiete.schluessel).toBe('beziehung:fiete|paul@funkstille');

    const gruende = e.verworfen.map((v) => v.grund);
    expect(gruende).toHaveLength(4);
    expect(gruende.some((g) => g.startsWith('Figur „Oles Schwester“: Zitat steht nicht wörtlich'))).toBe(true);
    expect(gruende.some((g) => g.includes('„Vera“ – „Ole“') && g.includes('Zitat steht nicht wörtlich'))).toBe(true);
    expect(gruende.some((g) => g.includes('Formulierungsvorschlag'))).toBe(true);
    expect(gruende.some((g) => g.includes('unbekannte Figur „Hafenmeister“'))).toBe(true);
    // angelegte Figuren/Orte lässt die Demo-KI wie ein Modell weg; die 7 schon angelegten Beziehungen (z. B. Lotte–Paul) filtert die App
    expect(e.bereitsAngelegt).toBe(7);
    expect(e.bereitsEntschieden).toBe(0);
    expect(e.modell).toBe('claude-sonnet-5-5');
    expect(e.datum).toBe('2026-10-09T12:00:00.000Z');
    expect(e.tokens.eingabe).toBeGreaterThan(0);
    expect(e.kostenUsd).toBeGreaterThan(0);
  });

  it('Leons Fall ohne Figuren und Orte: schlägt alle vor, Beziehungen verweisen auf vorgeschlagene Figuren', async () => {
    const e = await schlageVorschlaegeVor(ohneFigurenUndOrte(), erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    expect(e.figuren.map((f) => f.name)).toEqual([
      'Paul',
      'Ole',
      'Malte',
      'Konrad',
      'Herr Kessler',
      'Lotte',
      'Vera',
      'Die Fremde',
      'Alter Mann am Kai',
      'Fiete',
      'Der Mann am Fischstand',
    ]);
    expect(e.figuren.find((f) => f.name === 'Paul')).toMatchObject({ schluessel: 'figur:paul', rolle: 'haupt', kurz: 'Architekt, Hauptfigur', status: 'neu' });
    expect(e.figuren.find((f) => f.name === 'Herr Kessler')?.aliase).toEqual(['Herrn Kessler']);
    expect(e.orte.map((o) => o.name)).toEqual(['Büro', 'Teeküche', 'Zeichensaal', 'Pauls Wohnung', 'Lindenhof', 'Fährhaus', 'Kornspeicher', 'Fischstand', 'Fischrestaurant', 'Nordkai']);
    expect(e.orte.find((o) => o.name === 'Zeichensaal')?.in).toEqual({ typ: 'vorschlag', id: 'ort:buero', name: 'Büro' });
    expect(e.orte.find((o) => o.name === 'Teeküche')?.in).toEqual({ typ: 'vorschlag', id: 'ort:buero', name: 'Büro' });
    expect(e.beziehungen).toHaveLength(12);
    for (const b of e.beziehungen) {
      expect(b.von.typ).toBe('vorschlag');
      expect(b.zu.typ).toBe('vorschlag');
      expect(b.belege.length).toBeGreaterThan(0);
    }
    expect(e.bereitsAngelegt).toBe(0);
  });

  it('jedes Zitat steht wörtlich im Kapiteltext', async () => {
    const daten = await ladeProjekt(ohneFigurenUndOrte());
    const e = await schlageVorschlaegeVor(ohneFigurenUndOrte(), erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const alle = [...e.figuren, ...e.orte, ...e.beziehungen].flatMap((v) => v.belege);
    expect(alle.length).toBeGreaterThan(20);
    for (const z of alle) expect(klartext(daten.kapitel[z.kapitel]!.text)).toContain(z.text);
  });
});

describe('Antwortprüfung', () => {
  it('Zitate nach E6: andere Anführungszeichen und Leerraum gehen, erfundene und falsch zugeordnete nicht', async () => {
    const r = await pruefe({
      figuren: [
        { name: 'Fiete', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'ob er die Krabben  wieder für Fiete mitnimmt')] },
        { name: 'Anrufer', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'Auf dem Display steht "Nummer unterdrückt".')] },
        { name: 'Erfunden', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'Erfunden steht im Flur.')] },
        { name: 'Falsch', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('ebbe', 'ob er die Krabben wieder für Fiete mitnimmt')] },
        { name: 'Ohne', aliase: [], rolle: 'neben', kurz: '', belege: [] },
        { name: 'Kapitel', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('gibt-es-nicht', 'ob er die Krabben wieder für Fiete mitnimmt')] },
      ],
      orte: [],
      beziehungen: [],
    });
    expect(r.figuren.map((f) => f.name)).toEqual(['Fiete', 'Anrufer']);
    expect(r.figuren[0]!.belege).toEqual([{ kapitel: 'funkstille', text: 'ob er die Krabben wieder für Fiete mitnimmt' }]);
    expect(r.figuren[1]!.belege).toEqual([{ kapitel: 'funkstille', text: 'Auf dem Display steht „Nummer unterdrückt“.' }]);
    const gruende = r.verworfen.map((v) => v.grund);
    expect(gruende).toEqual([
      expect.stringContaining('Figur „Erfunden“: Zitat steht nicht wörtlich'),
      expect.stringContaining('Figur „Falsch“: Zitat steht nicht wörtlich in Kap. 7'),
      'Figur „Ohne“: ohne Beleg',
      expect.stringContaining('Zitat aus unbekanntem Kapitel „gibt-es-nicht“'),
    ]);
  });

  it('Referenzen: ID, Name/Alias einer angelegten Figur, Name einer vorgeschlagenen; Unbekanntes und Verworfenes fliegt raus', async () => {
    const r = await pruefe({
      figuren: [
        { name: 'Fiete', aliase: ['Fietje'], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'ob er die Krabben wieder für Fiete mitnimmt')] },
        { name: 'Geist', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'Der Geist im Flur.')] },
      ],
      orte: [],
      beziehungen: [
        { von: 'paul', zu: 'Fiete', art: 'Kunde', kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: false, belege: [beleg('funkstille', 'ob er die Krabben wieder für Fiete mitnimmt')], begruendung: '' },
        { von: 'fietje', zu: 'alter Mann', art: 'Bekannter', kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: false, belege: [beleg('funkstille', 'ob er die Krabben wieder für Fiete mitnimmt')], begruendung: '' },
        { von: 'Paul', zu: 'Hafenmeister', art: 'Bekannter', kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: false, belege: [beleg('funkstille', 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.')], begruendung: '' },
        { von: 'Geist', zu: 'paul', art: 'Spuk', kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: false, belege: [beleg('funkstille', 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.')], begruendung: '' },
        { von: 'paul', zu: 'Paul', art: 'selbst', kategorie: 'sonstige', abKapitel: 'funkstille', unsicher: false, belege: [beleg('funkstille', 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.')], begruendung: '' },
        { von: 'ole', zu: 'paul', art: 'Freund', kategorie: 'sonstige', abKapitel: 'grundriss', unsicher: false, belege: [beleg('grundriss', 'Ole sitzt auf der Fensterbank neben dem Oleander und isst einen Apfel.')], begruendung: '' },
      ],
    });
    expect(r.beziehungen.map((b) => [b.von, b.zu])).toEqual([
      [{ typ: 'angelegt', id: 'paul', name: 'Paul' }, { typ: 'vorschlag', id: 'figur:fiete', name: 'Fiete' }],
      [{ typ: 'vorschlag', id: 'figur:fiete', name: 'Fiete' }, { typ: 'angelegt', id: 'alter-mann-am-kai', name: 'Alter Mann am Kai' }],
    ]);
    const gruende = r.verworfen.map((v) => v.grund);
    expect(gruende).toEqual([
      expect.stringContaining('Figur „Geist“: Zitat steht nicht wörtlich'),
      expect.stringContaining('unbekannte Figur „Hafenmeister“'),
      expect.stringContaining('verweist auf eine verworfene Figur'),
      expect.stringContaining('Beziehung einer Figur zu sich selbst'),
    ]);
    // Ole–Paul gibt es schon (Kollege): nicht erneut vorschlagen
    expect(r.bereitsAngelegt).toBe(1);
  });

  it('Ersatztext-Filter auf kurz, art und begruendung; art höchstens vier Wörter; abKapitel und Kategorie werden geprüft', async () => {
    const z = beleg('funkstille', 'ob er die Krabben wieder für Fiete mitnimmt');
    const r = await pruefe({
      figuren: [
        { name: 'Fiete', aliase: [], rolle: 'haupt', kurz: 'Freund, besser: „guter Bekannter“', belege: [z] },
        { name: 'Hinnerk', aliase: [], rolle: 'unsinn', kurz: 'nur erwähnt', belege: [z] },
      ],
      orte: [],
      beziehungen: [
        { von: 'paul', zu: 'Hinnerk', art: 'Kunde', kategorie: 'arbeit', abKapitel: 'funkstille', unsicher: false, belege: [z], begruendung: 'Schreib lieber, dass Paul für ihn einkauft.' },
        { von: 'paul', zu: 'Hinnerk', art: 'der beste Freund von früher', kategorie: 'arbeit', abKapitel: 'funkstille', unsicher: false, belege: [z], begruendung: '' },
        { von: 'paul', zu: 'Hinnerk', art: 'Freund', kategorie: 'arbeit', abKapitel: 'funkstille', unsicher: false, belege: [z], begruendung: 'Paul sagt „ich kenne ihn seit der Schulzeit gut“.' },
        { von: 'paul', zu: 'Hinnerk', art: 'Bekannter', kategorie: 'unsinn', abKapitel: 'gibt-es-nicht', unsicher: false, belege: [z, beleg('lotte', 'Er stellt den Motor ab')], begruendung: 'Der Fischstandmann fragt nach Einkäufen.' },
      ],
    });
    expect(r.figuren.map((f) => [f.name, f.rolle])).toEqual([['Hinnerk', 'neben']]);
    expect(r.beziehungen).toHaveLength(1);
    // Belege in Buchreihenfolge, abKapitel = erster Beleg, unbekannte Kategorie → sonstige
    expect(r.beziehungen[0]).toMatchObject({ art: 'Bekannter', kategorie: 'sonstige', abKapitel: 'lotte' });
    expect(r.beziehungen[0]!.belege.map((b) => b.kapitel)).toEqual(['lotte', 'funkstille']);
    const gruende = r.verworfen.map((v) => v.grund);
    expect(gruende[0]).toMatch(/^Figur „Fiete“: Kurzbeschreibung Formulierungsvorschlag/);
    expect(gruende[1]).toMatch(/Formulierungsvorschlag \(„schreib lieber“\)/);
    expect(gruende[2]).toMatch(/hat mehr als 4 Wörter/);
    expect(gruende[3]).toMatch(/zitiert Text, der nicht im Buch steht/);
  });

  it('Beziehungen zu bewusst vagen Figuren sind immer unsicher', async () => {
    const r = await pruefe({
      figuren: [],
      orte: [],
      beziehungen: [
        { von: 'die-fremde', zu: 'vera', art: 'Fremde', kategorie: 'dates', abKapitel: 'bis-bald', unsicher: false, belege: [beleg('bis-bald', 'Die Fremde auf der Bank gegenüber schläft noch')], begruendung: '' },
        { von: 'lotte', zu: 'vera', art: 'Rivalin', kategorie: 'dates', abKapitel: 'ebbe', unsicher: false, belege: [beleg('ebbe', 'Vera erzählt von ihrer Werkstatt')], begruendung: '' },
      ],
    });
    expect(r.beziehungen.map((b) => [b.art, b.unsicher])).toEqual([
      ['Fremde', true],
      ['Rivalin', false],
    ]);
  });

  it('nichts zu privaten Feldern: Schema ohne Ersatz-/Privatfelder, Übernahme-Daten nur aus dem Schema', async () => {
    const body = await vorschlagsAnfrage(fsMit());
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    for (const verboten of ['wahrheit', 'notizen', 'beschreibung', 'ersatz', 'vorschlagText', 'formulierung']) expect(schema).not.toContain(verboten);
    const r = await pruefe({
      figuren: [{ name: 'Fiete', aliase: [], rolle: 'neben', kurz: '', belege: [beleg('funkstille', 'ob er die Krabben wieder für Fiete mitnimmt')], wahrheit: 'x', notizen: 'y' }],
      orte: [],
      beziehungen: [],
    });
    expect(Object.keys(r.figuren[0]!).sort()).toEqual(['aliase', 'belege', 'kurz', 'name', 'rolle', 'schluessel', 'status']);
  });

  it('Antwort, die nicht zum Schema passt → KiFehler', async () => {
    await expect(pruefe(null)).rejects.toThrow(KiFehler);
    await expect(pruefe({ irgendwas: [] })).rejects.toThrow('Die Antwort passt nicht zum Schema.');
  });
});

describe('Ablage: Merge, „nicht erneut vorschlagen“, offene Vorschläge', () => {
  it('Schlüssel sind stabil und unabhängig von der Richtung', () => {
    expect(figurSchluessel('Der Mann am Fischstand')).toBe('figur:der-mann-am-fischstand');
    expect(ortSchluessel('Teeküche')).toBe('ort:teekueche');
    expect(beziehungSchluessel('Paul', 'Alter Mann', 'ebbe')).toBe(beziehungSchluessel('Alter Mann', 'Paul', 'ebbe'));
    expect(beziehungSchluessel('Paul', 'Fiete')).toBe('beziehung:fiete|paul');
  });

  it('mischt neue Läufe ein: Entschiedenes bleibt, Offenes wird aktualisiert, Neues angehängt', async () => {
    const e = await schlageVorschlaegeVor(fsMit(), erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const erst = mischeVorschlaege(undefined, e, { datum: 'd1', modell: 'm' });
    expect(erst.neu).toBe(9);
    // Leon entscheidet: Fiete verworfen (nimmt Paul–Fiete mit), Malte–Ole verworfen, Fischrestaurant übernommen
    const entschieden: KiVorschlaege = {
      ...erst.ablage,
      figuren: erst.ablage.figuren.map((f) => (f.name === 'Fiete' ? { ...f, status: 'verworfen' } : f)),
      orte: erst.ablage.orte.map((o) => (o.name === 'Fischrestaurant' ? { ...o, status: 'uebernommen', ort: 'fischrestaurant' } : o)),
      beziehungen: erst.ablage.beziehungen.map((b) =>
        b.zu.name === 'Fiete' || (b.von.name === 'Malte' && b.zu.name === 'Ole') ? { ...b, status: 'verworfen' } : b,
      ),
    };
    const zweit = mischeVorschlaege(entschieden, e, { datum: 'd2', modell: 'm' });
    expect(zweit.neu).toBe(0);
    expect(zweit.aktualisiert).toBe(5);
    expect(zweit.ablage.lauf).toEqual({ datum: 'd2', modell: 'm' });
    expect(zweit.ablage.figuren.find((f) => f.name === 'Fiete')?.status).toBe('verworfen');
    expect(zweit.ablage.orte.find((o) => o.name === 'Fischrestaurant')).toMatchObject({ status: 'uebernommen', ort: 'fischrestaurant' });
    // ein anderes abKapitel desselben verworfenen Paars und eine neue Beziehung zur verworfenen Figur kommen nicht wieder
    const malteOle = e.beziehungen.find((b) => b.von.name === 'Malte')!;
    const paulFiete = e.beziehungen.find((b) => b.zu.name === 'Fiete')!;
    const dritt = mischeVorschlaege(zweit.ablage, {
      figuren: [],
      orte: [],
      beziehungen: [
        { ...malteOle, schluessel: beziehungSchluessel('Malte', 'Ole', 'weissraum'), abKapitel: 'weissraum' },
        { ...paulFiete, schluessel: beziehungSchluessel('Fiete', 'Konrad', 'funkstille'), von: { typ: 'angelegt', id: 'konrad', name: 'Konrad' } },
      ],
    });
    expect(dritt.neu).toBe(0);
  });

  it('ein zweiter Lauf bringt Verworfenes und Übernommenes nicht wieder (bereitsEntschieden)', async () => {
    const fs = fsMit();
    const transport = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    const e = await schlageVorschlaegeVor(fs, transport, STANDARD_KI);
    const { ablage } = mischeVorschlaege(undefined, e);
    await speichereKiVorschlaege(fs, {
      ...ablage,
      figuren: ablage.figuren.map((f) => ({ ...f, status: f.name === 'Fiete' ? 'verworfen' : 'neu' })),
      beziehungen: ablage.beziehungen.map((b) => ({ ...b, status: b.von.name === 'Malte' || b.zu.name === 'Fiete' ? 'verworfen' : 'neu' })),
    });
    const zweit = await schlageVorschlaegeVor(fs, transport, STANDARD_KI);
    expect(zweit.figuren.map((f) => f.name)).toEqual(['Der Mann am Fischstand']);
    expect(zweit.beziehungen.map((b) => b.art)).not.toContain('kauft für ihn ein');
    expect(zweit.beziehungen.map((b) => `${b.von.name}–${b.zu.name}`)).not.toContain('Malte–Ole');
    expect(zweit.bereitsEntschieden).toBe(3);
  });

  it('offene Vorschläge: ohne inzwischen angelegte Gegenstücke und ohne Beziehungen zu gelöschten oder verworfenen Figuren', async () => {
    const fs = fsMit();
    const e = await schlageVorschlaegeVor(fs, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const { ablage } = mischeVorschlaege(undefined, e);
    const daten = await ladeProjekt(fs);
    expect(offeneVorschlaege(ablage, daten).anzahl).toBe(9);
    expect(offeneVorschlaege(undefined, daten).anzahl).toBe(0);

    // Leon legt „Fiete“ selbst an → Figurvorschlag erledigt, Paul–Fiete zeigt auf die angelegte Figur
    const mitFiete: ProjektDaten = {
      ...daten,
      figuren: {
        ...daten.figuren,
        fiete: { id: 'fiete', name: 'Fiete', aliase: [], rolle: 'neben', existenz: 'gesichert', gruppe: null, beziehungen: [], plan: {}, wahrheit: '', notizen: '' },
      },
    };
    const o1 = offeneVorschlaege(ablage, mitFiete);
    expect(o1.figuren.map((f) => f.name)).toEqual(['Der Mann am Fischstand']);
    expect(o1.beziehungen.some((b) => b.zu.name === 'Fiete')).toBe(true);

    // Figur „Konrad“ gelöscht → Herr Kessler–Konrad ist nicht mehr offen
    const ohneKonrad = { ...daten, figuren: { ...daten.figuren } };
    delete ohneKonrad.figuren.konrad;
    expect(offeneVorschlaege(ablage, ohneKonrad).beziehungen.some((b) => b.zu.name === 'Konrad')).toBe(false);

    // Beziehung inzwischen angelegt (gleiches abKapitel)
    const ole = daten.figuren.ole!;
    const mitPhilip = { ...daten, figuren: { ...daten.figuren, ole: { ...ole, beziehungen: [...ole.beziehungen, { zu: 'malte', art: 'Kollege', abKapitel: 'fassade', kategorie: 'arbeit' as const }] } } };
    expect(offeneVorschlaege(ablage, mitPhilip).beziehungen.some((b) => b.von.name === 'Malte')).toBe(false);

    // verworfene Figur → ihre Beziehungen sind nicht offen
    const verworfen = { ...ablage, figuren: ablage.figuren.map((f) => (f.name === 'Fiete' ? { ...f, status: 'verworfen' as const } : f)) };
    expect(offeneVorschlaege(verworfen, daten).beziehungen.some((b) => b.zu.name === 'Fiete')).toBe(false);
  });

  it('Persistenz: .plotwerk/vorschlaege.json Roundtrip, ladeProjekt liest sie, externe Änderungen werden übernommen', async () => {
    const fs = fsMit();
    const e = await schlageVorschlaegeVor(fs, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const { ablage } = mischeVorschlaege(undefined, e, { datum: '2026-10-09T12:00:00.000Z', modell: 'claude-sonnet-5-5' });
    const text = serializeKiVorschlaege(ablage);
    expect(parseKiVorschlaege(text)).toEqual(ablage);
    expect(serializeKiVorschlaege(parseKiVorschlaege(text))).toBe(text);
    expect(await ladeProjekt(fs)).not.toHaveProperty('kiVorschlaege');
    expect(await speichereKiVorschlaege(fs, ablage)).toBe(true);
    expect(await speichereKiVorschlaege(fs, ablage)).toBe(false);
    expect(PFADE.vorschlaege).toBe('.plotwerk/vorschlaege.json');
    const geladen = await ladeProjekt(fs);
    expect(geladen.kiVorschlaege).toEqual(ablage);
    const alt = { ...geladen };
    delete alt.kiVorschlaege;
    expect(uebernehmeExterneAenderungen(alt, geladen, [PFADE.vorschlaege]).kiVorschlaege).toEqual(ablage);
    expect(uebernehmeExterneAenderungen(geladen, alt, [PFADE.vorschlaege])).not.toHaveProperty('kiVorschlaege');
    // tolerant gegenüber Handbearbeitung
    expect(parseKiVorschlaege('{"figuren":[{"schluessel":"figur:x","name":"X","status":"quatsch"}],"beziehungen":[{"schluessel":"b"}]}')).toEqual({
      version: 1,
      figuren: [{ schluessel: 'figur:x', name: 'X', aliase: [], rolle: 'neben', kurz: '', belege: [], status: 'neu' }],
      orte: [],
      beziehungen: [],
    });
  });
});

describe('Request, Allowlist, harte Regel 1', () => {
  it('Request: ein Body, Deployment, max_tokens, Effort, Structured Outputs, Cache-Prefix wie bei der Prüfung, kein thinking/tool_choice', async () => {
    const einstellungen: KiEinstellungen = { endpoint: 'https://x/anthropic', deployments: { erkennung: 'h', pruefung: 'mein-sonnet', tiefencheck: 'mein-opus' } };
    const { transport, bodies } = aufzeichnend();
    await schlageVorschlaegeVor(fsMit(), transport, einstellungen);
    await schlageVorschlaegeVor(fsMit(), transport, einstellungen, { tiefencheck: true });
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.model)).toEqual(['mein-sonnet', 'mein-opus']);
    expect(bodies.map((b) => (b.output_config as { effort: string }).effort)).toEqual(['medium', 'high']);
    for (const b of bodies) {
      expect(b.max_tokens).toBe(32000);
      expect(b).not.toHaveProperty('thinking');
      expect(b).not.toHaveProperty('tool_choice');
      expect(b).not.toHaveProperty('tools');
      const inhalt = (b.messages as { role: string; content: { text: string; cache_control?: unknown }[] }[])[0]!;
      expect(inhalt.role).toBe('user');
      expect(inhalt.content[0]!.cache_control).toEqual({ type: 'ephemeral' });
      expect(inhalt.content[1]!.text).toMatch(/^<aufgabe art="vorschlaege">/);
      const format = (b.output_config as { format: { type: string; schema: { properties: Record<string, { items: { properties: object } }> } } }).format;
      expect(format.type).toBe('json_schema');
      expect(Object.keys(format.schema.properties)).toEqual(['figuren', 'orte', 'beziehungen']);
      expect(Object.keys(format.schema.properties.beziehungen!.items.properties)).toEqual(['von', 'zu', 'art', 'kategorie', 'abKapitel', 'unsicher', 'belege', 'begruendung']);
      const objekte: Record<string, unknown>[] = [];
      const sammle = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(sammle);
        else if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (o.type === 'object') objekte.push(o);
          Object.values(o).forEach(sammle);
        }
      };
      sammle(format.schema);
      expect(objekte.length).toBeGreaterThan(5);
      for (const o of objekte) {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
    }
    // gleicher Buchkontext wie die Prüfung (Prefix-Text identisch)
    const prefix = (bodies[0]!.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(prefix).toMatch(/^<angaben>/);
    expect(prefix).toContain('Paul (id: paul)');
  });

  it('Allowlist (E12): wahrheit, notizen, kurz, Beziehungen, Beschreibungen und gespeicherte Vorschläge gehen nie an das Modell', async () => {
    const MARKER = 'GEHEIM';
    const fs = fsMit((d) => {
      d['figuren/paul.md'] = d['figuren/paul.md']!.replace('Privat (Testtext): Paul erinnert sich', `${MARKER}-WAHRHEIT`).replace('kurz: Ich-Erzähler', `kurz: ${MARKER}-KURZ`);
      d['figuren/lotte.md'] = d['figuren/lotte.md']!.replace('art: Match, nur Chat', `art: ${MARKER}-BEZIEHUNG`);
      d['figuren/vera.md'] = d['figuren/vera.md']!.replace('Privat (Testtext): Taucht sie', `${MARKER}-NOTIZ`);
      d['orte/lindenhof.md'] = d['orte/lindenhof.md']!.replace('Café, Treffpunkt mit Lotte.', `${MARKER}-ORT`);
      d[PFADE.vorschlaege] = JSON.stringify({ version: 1, figuren: [{ schluessel: 'figur:x', name: `${MARKER}-VORSCHLAG`, kurz: `${MARKER}-VKURZ`, status: 'neu' }], orte: [], beziehungen: [] });
    });
    const { transport, bodies, zaehlBodies } = aufzeichnend();
    await schaetzeVorschlaege(fs, transport, STANDARD_KI);
    await schlageVorschlaegeVor(fs, transport, STANDARD_KI);
    await schlageVorschlaegeVor(fs, transport, STANDARD_KI, { tiefencheck: true });
    expect(bodies).toHaveLength(2);
    expect(zaehlBodies.length).toBeGreaterThanOrEqual(2);
    for (const b of [...bodies, ...zaehlBodies]) {
      const json = JSON.stringify(b);
      expect(json).not.toContain(MARKER);
      expect(json).not.toContain('Privat (Testtext)');
    }
  });

  it('harte Regel 1: Lauf, Schätzung und vorbereitete Antwort gegen ein Dateisystem, das bei jedem Schreibversuch wirft', async () => {
    const innen = fsMit();
    const protokoll: string[] = [];
    const wachhund = {
      lesen: (p: string) => (protokoll.push(`lesen ${p}`), innen.lesen(p)),
      auflisten: (o: string) => (protokoll.push(`auflisten ${o}`), innen.auflisten(o)),
      existiert: (p: string) => (protokoll.push(`existiert ${p}`), innen.existiert(p)),
      async schreiben(p: string) {
        protokoll.push(`schreiben ${p}`);
        throw new Error(`Schreibversuch auf ${p}`);
      },
      async entfernen(p: string) {
        protokoll.push(`entfernen ${p}`);
        throw new Error(`Löschversuch auf ${p}`);
      },
    };
    const leser: ProjektLeser = wachhund;
    const transport = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    await schaetzeVorschlaege(leser, transport, STANDARD_KI);
    const e = await schlageVorschlaegeVor(leser, transport, STANDARD_KI);
    await werteVorschlagsAntwortAus(leser, { figuren: [], orte: [], beziehungen: [] });
    expect(e.figuren.length).toBeGreaterThan(0);
    expect(protokoll.some((z) => z === `lesen ${PFADE.vorschlaege}`)).toBe(true);
    expect(protokoll.filter((z) => z.startsWith('schreiben') || z.startsWith('entfernen'))).toEqual([]);
  });
});

describe('Lauf mit vorbereiteter Antwort, Fehler, Schätzung', () => {
  it('werteVorschlagsAntwortAus: Objekt, JSON-Text und vollständige Messages-Antwort ergeben dasselbe wie ein Lauf', async () => {
    const roh = (await (await erstelleDemoKiTransport({ verzoegerungMs: 0 })).senden(await vorschlagsAnfrage(ohneFigurenUndOrte()))) as Body;
    const text = (roh.content as { text: string }[])[0]!.text;
    const jetzt = () => new Date('2026-10-09T12:00:00Z');
    const lauf = await schlageVorschlaegeVor(ohneFigurenUndOrte(), festerTransport(JSON.parse(text)), STANDARD_KI, { jetzt });
    const ohneNutzung = (e: VorschlagsErgebnis) => ({ ...e, tokens: undefined, kostenUsd: undefined });
    for (const antwort of [JSON.parse(text), text, roh]) {
      const e = await werteVorschlagsAntwortAus(ohneFigurenUndOrte(), antwort, { jetzt });
      expect(ohneNutzung(e)).toEqual(ohneNutzung(lauf));
    }
    const mitNutzung = await werteVorschlagsAntwortAus(ohneFigurenUndOrte(), roh, { jetzt });
    expect(mitNutzung.tokens.ausgabe).toBeGreaterThan(0);
    await expect(werteVorschlagsAntwortAus(ohneFigurenUndOrte(), '{kaputt')).rejects.toThrow('kein gültiges JSON');
    await expect(
      werteVorschlagsAntwortAus(ohneFigurenUndOrte(), { type: 'message', content: [], stop_reason: 'max_tokens', usage: {} }),
    ).rejects.toThrow('Token-Limit');
  });

  it('nicht bereit → KiFehler „nicht_bereit“ ohne Anfrage; refusal/max_tokens/API-Fehler → KiFehler; ohne Text → „auftrag“', async () => {
    const t = festerTransport({});
    const nicht: KiTransport = { ...t, bereit: async () => false };
    await expect(schlageVorschlaegeVor(fsMit(), nicht, STANDARD_KI)).rejects.toMatchObject({ art: 'nicht_bereit' });
    expect(t.bodies).toHaveLength(0);

    const abgeschnitten = festerTransport(null, { type: 'message', content: [], stop_reason: 'max_tokens', usage: {} });
    await expect(schlageVorschlaegeVor(fsMit(), abgeschnitten, STANDARD_KI)).rejects.toMatchObject({ art: 'antwort' });
    const abgelehnt = festerTransport(null, { type: 'message', content: [], stop_reason: 'refusal', stop_details: { category: 'cyber' }, usage: {} });
    await expect(schlageVorschlaegeVor(fsMit(), abgelehnt, STANDARD_KI)).rejects.toThrow('refusal, Kategorie cyber');
    const fehler = festerTransport(null, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    await expect(schlageVorschlaegeVor(fsMit(), fehler, STANDARD_KI)).rejects.toMatchObject({ art: 'api' });
    const wirft: KiTransport = { ...t, senden: async () => Promise.reject(new Error('HTTP 401: invalid x-api-key')) };
    await expect(schlageVorschlaegeVor(fsMit(), wirft, STANDARD_KI)).rejects.toThrow('HTTP 401');

    const leer = fsMit((d) => {
      for (const p of Object.keys(d)) if (p.startsWith('manuskript/')) delete d[p];
    });
    await expect(schlageVorschlaegeVor(leer, t, STANDARD_KI)).rejects.toMatchObject({ art: 'auftrag' });
    const abbruch = new AbortController();
    abbruch.abort();
    await expect(schlageVorschlaegeVor(fsMit(), t, STANDARD_KI, { signal: abbruch.signal })).rejects.toMatchObject({ art: 'abgebrochen' });
    expect(t.bodies).toHaveLength(0);
  });

  it('Schätzung: eine Anfrage, count_tokens für Body und Prefix, Kosten mit Cache-Schreiben; ohne count_tokens Zeichen/3', async () => {
    const { transport, zaehlBodies } = aufzeichnend();
    const s = await schaetzeVorschlaege(fsMit(), transport, STANDARD_KI);
    expect(s).toMatchObject({ rolle: 'pruefung', modell: 'claude-sonnet-5-5', anfragen: 1, uebersprungen: [], gezaehlt: true, ausgabeTokens: 8000 });
    expect(s.kapitel).toHaveLength(9);
    expect(zaehlBodies).toHaveLength(2);
    for (const b of zaehlBodies) expect(Object.keys(b).sort()).toEqual(['messages', 'model', 'system']);
    expect(s.prefixTokens).toBeGreaterThan(0);
    expect(s.prefixTokens).toBeLessThan(s.eingabeTokens);
    expect(s.kostenUsd).toBeGreaterThan(0);
    const opus = await schaetzeVorschlaege(fsMit(), transport, STANDARD_KI, { tiefencheck: true });
    expect(opus).toMatchObject({ rolle: 'tiefencheck', modell: 'claude-opus-5-5', ausgabeTokens: 14000 });
    expect(opus.kostenUsd).toBeGreaterThan(s.kostenUsd);
    const ohne: KiTransport = { ...transport, tokenZaehlen: async () => Promise.reject(new Error('404')) };
    const grob = await schaetzeVorschlaege(fsMit(), ohne, STANDARD_KI);
    expect(grob.gezaehlt).toBe(false);
    expect(grob.eingabeTokens).toBeGreaterThan(1000);
  });
});

describe('Vorschläge: Modell des gewählten Anbieters', () => {
  it('nimmt bei der Claude API die Claude-Modelle, nicht die Foundry-Deployments', async () => {
    const { vorschlagsAnfrage } = await import('./vorschlaege');
    const { demoFs } = await import('../../fixtures/demoProjekt');
    const einstellungen = {
      endpoint: 'https://x.services.ai.azure.com/anthropic',
      deployments: { erkennung: 'foundry-haiku', pruefung: 'foundry-sonnet', tiefencheck: 'foundry-opus' },
      anbieter: 'claude' as const,
      claude: { endpoint: 'https://api.anthropic.com', modelle: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' } },
    };
    expect((await vorschlagsAnfrage(demoFs(), einstellungen, { tiefencheck: false })).model).toBe('claude-sonnet-5-5');
    expect((await vorschlagsAnfrage(demoFs(), { ...einstellungen, anbieter: 'foundry' }, { tiefencheck: true })).model).toBe('foundry-opus');
  });
});
