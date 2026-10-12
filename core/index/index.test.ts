import { beforeAll, describe, expect, it } from 'vitest';
import type { Hinweis, ProjektDaten } from '../model/types';
import { ankerErzeugen, findeZitat, klartext, textHash } from '../text';
import { ladeDemo } from './demoLeser.testhilfe';
import { berechneIndex, hinweisSchluessel, LEERER_INDEX, ortsfolge, SpeicherIndexSpeicher, type Index } from './index';

let daten: ProjektDaten;
let index: Index;
beforeAll(async () => {
  daten = await ladeDemo();
  index = berechneIndex(daten);
});

const kt = (id: string) => klartext(daten.kapitel[id]!.text);

function kiHinweis(teil: Partial<Hinweis> & Pick<Hinweis, 'zitate'>): Hinweis {
  return { schluessel: 'egal', typ: 'pruefen', titel: 'Test', erklaerung: 'Test', quelle: 'ki', status: 'neu', ...teil };
}

/** KI-Hinweise aus .plotwerk/hinweise.json (ohne die Figurenstimme aus .plotwerk/stimmen.json) */
const ausKiHinweisen = (h: Hinweis) => h.quelle === 'ki' && !h.schluessel.startsWith('stimme:');

describe('berechneIndex (Demo)', () => {
  it('erstes Vorkommen in Kapitelreihenfolge', () => {
    expect(index.erstesVorkommen.vera).toBe('ebbe');
    expect(index.erstesVorkommen['die-fremde']).toBe('bis-bald');
    expect(index.erstesVorkommen.paul).toBe('grundriss');
    expect(index.erstesVorkommen.lindenhof).toBe('lotte');
    expect(index.erstesVorkommen['herr-kessler']).toBe('fassade');
    const aktI = ['grundriss', 'fassade', 'lotte', 'regatta'];
    const inAktI = new Set(index.erwaehnungen.filter((e) => aktI.includes(e.kapitel)).map((e) => e.ziel));
    expect(inAktI.has('vera') || inAktI.has('die-fremde')).toBe(false);
  });

  it('Erwähnungen: Ole nicht in Oleander, Genitive, sortiert nach Kapitel und Position', () => {
    expect(index.erwaehnungen.filter((e) => e.ziel === 'ole').map((e) => e.kapitel)).toEqual(['grundriss', 'grundriss', 'fassade', 'ebbe']);
    expect(index.erwaehnungen.some((e) => e.treffer === 'Pauls' && e.ziel === 'paul' && e.kapitel === 'staub')).toBe(true);
    expect(index.erwaehnungen.some((e) => e.treffer === 'Lottes' && e.ziel === 'lotte')).toBe(true);
    const reihe = daten.projekt.kapitel;
    for (let i = 1; i < index.erwaehnungen.length; i++) {
      const a = index.erwaehnungen[i - 1]!;
      const b = index.erwaehnungen[i]!;
      expect(reihe.indexOf(a.kapitel) * 1e6 + a.start).toBeLessThanOrEqual(reihe.indexOf(b.kapitel) * 1e6 + b.start);
    }
  });

  it('Wortzahlen und Text-Hashes', () => {
    expect(index.wortzahlen.regatta).toBe(0);
    expect(index.wortzahlen.weissraum).toBe(41);
    expect(index.textHashes.grundriss).toBe(textHash(daten.kapitel.grundriss!.text));
    expect(Object.keys(index.textHashes)).toEqual(daten.projekt.kapitel);
    // Die Demo-Analysen sind auf dem aktuellen Text-Stand (fixtures/demo-projekt/.plotwerk/analysen)
    for (const a of Object.values(daten.analysen)) expect(a.textHash, a.kapitel).toBe(index.textHashes[a.kapitel]);
  });

  it('Hinweise: Struktur, Schreibweisen und KI-Hinweise, jedes Zitat steht im Text', () => {
    const titel = index.hinweise.map((h) => `${h.typ}|${h.titel}`);
    expect(titel).toContain('struktur|Kap. 4 ohne Text');
    expect(titel).toContain('struktur|Kap. 9 endet mitten im Satz');
    expect(index.hinweise.filter((h) => h.typ === 'schreibweise')).toHaveLength(2);
    expect(index.hinweise.filter(ausKiHinweisen).map((h) => h.typ)).toEqual(['pruefen', 'offener_faden', 'unbekannt', 'zeitleiste']);
    // Figurenstimme (G3, .plotwerk/stimmen.json) erscheint als Hinweis vom Typ „sprache“ mit dem Schlüssel der Beobachtung
    const stimme = index.hinweise.filter((h) => h.schluessel.startsWith('stimme:'));
    expect(stimme.map((h) => [h.typ, h.quelle])).toEqual([['sprache', 'ki']]);
    expect(stimme[0]!.titel).toMatch(/^Stimme von Paul/);
    for (const h of index.hinweise) {
      if (h.typ !== 'struktur') expect(h.zitate.length, h.titel).toBeGreaterThan(0);
      for (const z of h.zitate) expect(findeZitat(kt(z.kapitel), z.text).length, z.text).toBeGreaterThan(0);
      expect(h.status).toBe('neu');
    }
    expect(new Set(index.hinweise.map((h) => h.schluessel)).size).toBe(index.hinweise.length);
    expect(index.hinweise.find((h) => h.typ === 'pruefen')?.offen).toBe(true);
  });

  it('Fäden aus den Analysen mit eröffnet/aufgegriffen/zuletzt', () => {
    const f = index.faeden.find((x) => x.id === 'glasfassade-bis-monatsende');
    expect(f).toEqual({
      id: 'glasfassade-bis-monatsende',
      name: 'Glasfassade »bis Monatsende«',
      eroeffnetIn: 'grundriss',
      aufgegriffenIn: ['fassade', 'staub'],
      zuletztIn: 'staub',
      status: 'offen',
    });
    const postkarten = index.faeden.find((x) => x.id === 'die-fremde-und-die-postkarten');
    expect(postkarten).toMatchObject({ eroeffnetIn: 'bis-bald', aufgegriffenIn: ['funkstille'], zuletztIn: 'funkstille' });
  });

  it('Pauls Weg (Ortsfolge)', () => {
    const weg = ortsfolge(index, daten, 'paul');
    expect(weg.find((w) => w.kapitel === 'lotte')?.orte).toEqual(['pauls-wohnung', 'lindenhof']);
    expect(weg.find((w) => w.kapitel === 'funkstille')?.orte).toEqual(['fischstand', 'pauls-wohnung']);
    expect(weg.find((w) => w.kapitel === 'flut')?.orte).toEqual(['bootsverleih']);
    expect(weg.map((w) => w.kapitel)).toEqual(daten.projekt.kapitel);
    expect(ortsfolge(index, daten, 'vera')).toEqual([{ kapitel: 'ebbe', orte: [] }]);
  });
});

describe('Entscheidungen und Realitätsebene', () => {
  it('Status aus entscheidungen.hinweise; Fäden-Status', () => {
    const satzende = index.hinweise.find((h) => h.titel === 'Kap. 9 endet mitten im Satz')!;
    const fiete = index.hinweise.find((h) => h.typ === 'unbekannt')!;
    const d: ProjektDaten = {
      ...daten,
      entscheidungen: {
        ...daten.entscheidungen,
        hinweise: [
          { schluessel: satzende.schluessel, entscheidung: 'absicht', datum: '2026-10-08' },
          { schluessel: fiete.schluessel, entscheidung: 'erledigt', datum: '2026-10-08' },
        ],
        faeden: [{ id: 'fiete', status: 'bewusst_offen' }],
      },
    };
    const ix = berechneIndex(d);
    expect(ix.hinweise.find((h) => h.schluessel === satzende.schluessel)?.status).toBe('absicht');
    expect(ix.hinweise.find((h) => h.schluessel === fiete.schluessel)?.status).toBe('erledigt');
    expect(ix.faeden.find((f) => f.id === 'fiete')?.status).toBe('bewusst_offen');
  });

  it('Entscheidung mit dem alten (rohen) Schlüssel eines KI-Hinweises gilt weiter', () => {
    const roh = daten.kiHinweise.find((h) => h.typ === 'zeitleiste')!;
    const d: ProjektDaten = {
      ...daten,
      entscheidungen: { ...daten.entscheidungen, hinweise: [{ schluessel: roh.schluessel, entscheidung: 'absicht', datum: '2026-10-08' }] },
    };
    expect(berechneIndex(d).hinweise.find((h) => h.typ === 'zeitleiste' && h.quelle === 'ki')?.status).toBe('absicht');
  });

  it('KI-Hinweise mit nicht auffindbarem Zitat fallen weg', () => {
    const d: ProjektDaten = {
      ...daten,
      kiHinweise: [
        ...daten.kiHinweise,
        kiHinweis({ typ: 'zeitleiste', zitate: [{ kapitel: 'funkstille', text: 'Es ist schon Freitag.' }] }),
        kiHinweis({ typ: 'sprache', zitate: [] }),
        kiHinweis({ typ: 'pruefen', zitate: [{ kapitel: 'regatta', text: 'irgendwas' }] }),
      ],
    };
    expect(berechneIndex(d).hinweise.filter(ausKiHinweisen)).toHaveLength(4);
  });

  it('bewusst vage Figur: kein „pruefen“ (Name im Titel, in der Erklärung oder im Zitat)', () => {
    const zitat = { kapitel: 'bis-bald', text: 'Die Fremde auf der Bank gegenüber schläft noch' };
    const d: ProjektDaten = {
      ...daten,
      kiHinweise: [
        kiHinweis({ titel: 'Schläft die Fremde wirklich?', zitate: [{ kapitel: 'funkstille', text: 'Paul hört Möwen' }] }),
        kiHinweis({ erklaerung: 'Ob es der Fremden gehört, bleibt unklar.', zitate: [{ kapitel: 'funkstille', text: 'Paul hört Möwen' }] }),
        kiHinweis({ zitate: [zitat] }),
        kiHinweis({ typ: 'offener_faden', zitate: [zitat] }),
      ],
    };
    const h = berechneIndex(d).hinweise.filter(ausKiHinweisen);
    expect(h.map((x) => x.typ)).toEqual(['offener_faden']);
  });

  it('bewusst vage markierte Stelle (Plan-Realität mit Anker oder entscheidungen.realitaet): kein „pruefen“', () => {
    const k = kt('staub');
    const s = k.indexOf('Paul zählt sie einmal, dann noch einmal.');
    const anker = ankerErzeugen('staub', k, s, s + 'Paul zählt sie einmal, dann noch einmal.'.length);
    const hinweis = kiHinweis({ zitate: [{ kapitel: 'staub', text: 'dann noch einmal' }] });
    const imPlan: ProjektDaten = {
      ...daten,
      kiHinweise: [hinweis],
      plaene: {
        ...daten.plaene,
        staub: { ...daten.plaene.staub!, realitaet: [{ id: 'schild', text: 'Schild', stufe: 'bewusst_vage', anker }] },
      },
    };
    expect(berechneIndex(imPlan).hinweise.filter((x) => x.typ === 'pruefen')).toEqual([]);
    const inEntscheidungen: ProjektDaten = {
      ...daten,
      kiHinweise: [hinweis],
      entscheidungen: { ...daten.entscheidungen, realitaet: [{ anker, stufe: 'bewusst_vage' }] },
    };
    expect(berechneIndex(inEntscheidungen).hinweise.filter((x) => x.typ === 'pruefen')).toEqual([]);
    const offen: ProjektDaten = {
      ...daten,
      kiHinweise: [hinweis],
      entscheidungen: { ...daten.entscheidungen, realitaet: [{ anker, stufe: 'offen' }] },
    };
    expect(berechneIndex(offen).hinweise.find((x) => x.typ === 'pruefen')).toMatchObject({ offen: true });
    const ohneMarkierung: ProjektDaten = { ...daten, kiHinweise: [hinweis] };
    const normal = berechneIndex(ohneMarkierung).hinweise.find((x) => x.typ === 'pruefen');
    expect(normal).toBeDefined();
    expect(normal!.offen).toBeUndefined();
  });

  it('Figur mit Existenz „offen“ setzt offen=true', () => {
    const d: ProjektDaten = {
      ...daten,
      kiHinweise: [kiHinweis({ zitate: [{ kapitel: 'ebbe', text: 'Ein alter Mann bleibt neben ihm stehen' }] })],
    };
    expect(berechneIndex(d).hinweise.find((x) => x.typ === 'pruefen')?.offen).toBe(true);
  });
});

describe('KI-Zuordnungen', () => {
  it('bestätigte Zuordnung wird Erwähnung (quelle ki), verworfene entfernt exakten Treffer', () => {
    const e = kt('funkstille');
    const s = e.indexOf('Fiete');
    const k = kt('grundriss');
    const t = k.indexOf('Ole');
    const d: ProjektDaten = {
      ...daten,
      entscheidungen: {
        ...daten.entscheidungen,
        zuordnungen: [
          { anker: ankerErzeugen('funkstille', e, s, s + 5), ziel: { typ: 'figur', id: 'malte' }, status: 'bestaetigt' },
          { anker: ankerErzeugen('grundriss', k, t, t + 3), ziel: { typ: 'figur', id: 'ole' }, status: 'verworfen' },
          { anker: { kapitel: 'funkstille', exakt: 'gibt es nicht', davor: '', danach: '' }, ziel: { typ: 'figur', id: 'lotte' }, status: 'bestaetigt' },
        ],
      },
    };
    const ix = berechneIndex(d);
    const ki = ix.erwaehnungen.filter((x) => x.quelle === 'ki');
    expect(ki).toEqual([
      { zielTyp: 'figur', ziel: 'malte', kapitel: 'funkstille', absatz: 2, start: s, ende: s + 5, treffer: 'Fiete', art: 'unbestimmt', quelle: 'ki', bestaetigt: true },
    ]);
    expect(ix.erwaehnungen.filter((x) => x.ziel === 'ole' && x.kapitel === 'grundriss')).toHaveLength(1);
  });
});

describe('inkrementell und Neuaufbau', () => {
  it('mit vorherigem Index identisch zur Vollberechnung; nach Leeren identisch', async () => {
    expect(berechneIndex(daten, index)).toEqual(index);
    expect(berechneIndex(daten, LEERER_INDEX)).toEqual(index);
    const speicher = new SpeicherIndexSpeicher();
    await speicher.speichern(index);
    expect(await speicher.laden()).toEqual(index);
    await speicher.leeren();
    expect(await speicher.laden()).toBeNull();
    expect(berechneIndex(daten, await speicher.laden())).toEqual(index);
  });

  it('nur geänderte Kapitel werden neu erkannt', () => {
    const geaendert: ProjektDaten = {
      ...daten,
      kapitel: { ...daten.kapitel, weissraum: { ...daten.kapitel.weissraum!, text: `${daten.kapitel.weissraum!.text}\n\nVera ruft an.` } },
    };
    // Manipulierter Vorgänger: ein unveränderter Kapitel-Eintrag wird wiederverwendet, nicht neu erkannt
    const markiert: Index = {
      ...index,
      erwaehnungen: index.erwaehnungen.map((e) => (e.kapitel === 'ebbe' ? { ...e, treffer: `${e.treffer}*` } : e)),
    };
    const ix = berechneIndex(geaendert, markiert);
    expect(ix.erwaehnungen.filter((e) => e.kapitel === 'ebbe').every((e) => e.treffer.endsWith('*'))).toBe(true);
    expect(ix.erwaehnungen.some((e) => e.kapitel === 'weissraum' && e.ziel === 'vera')).toBe(true);
    expect(ix.erstesVorkommen.vera).toBe('weissraum');
    expect(ix.wortzahlen.weissraum).toBe(44);
    // Vollberechnung liefert für das geänderte Kapitel dasselbe
    expect(ix.erwaehnungen.filter((e) => e.kapitel === 'weissraum')).toEqual(berechneIndex(geaendert).erwaehnungen.filter((e) => e.kapitel === 'weissraum'));
  });

  it('neuer Alias erzwingt Neuerkennung aller Kapitel', () => {
    const d: ProjektDaten = {
      ...daten,
      figuren: { ...daten.figuren, konrad: { ...daten.figuren.konrad!, aliase: ['Chef'] } },
    };
    const ix = berechneIndex(d, index);
    expect(ix.erkennungsHash).not.toBe(index.erkennungsHash);
    expect(ix).toEqual(berechneIndex(d));
  });
});

describe('hinweisSchluessel', () => {
  it('normalisiert und unabhängig von der Reihenfolge', () => {
    expect(hinweisSchluessel('pruefen', [{ kapitel: 'b', text: '„x“' }, { kapitel: 'a', text: 'y …' }])).toBe(
      hinweisSchluessel('pruefen', [{ kapitel: 'a', text: 'y' }, { kapitel: 'b', text: '"x"' }]),
    );
    expect(hinweisSchluessel('pruefen', [{ kapitel: 'a', text: 'y' }])).not.toBe(hinweisSchluessel('sprache', [{ kapitel: 'a', text: 'y' }]));
  });
});
