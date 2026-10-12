import { beforeAll, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { berechneIndex } from '../index/index';
import type { Figur, ProjektDaten } from '../model/types';
import { ladeProjekt } from '../projekt';
import { klartext } from '../text';
import { figurenHinweise, ruhendeStrecken, satzUm } from './index';

let demo: ProjektDaten;
beforeAll(async () => {
  demo = await ladeProjekt(demoFs());
});

const figur = (id: string, name: string, teil: Partial<Figur> = {}): Figur => ({
  id,
  name,
  aliase: [],
  rolle: 'neben',
  existenz: 'gesichert',
  gruppe: null,
  beziehungen: [],
  plan: {},
  wahrheit: '',
  notizen: '',
  ...teil,
});

/** Kleines Projekt aus Kapiteltexten (k1, k2, …) und Figuren, auf Basis der Demo-Struktur. */
function projekt(texte: string[], figuren: Figur[]): ProjektDaten {
  const ids = texte.map((_, i) => `k${i + 1}`);
  return {
    ...demo,
    projekt: { ...demo.projekt, kapitel: ids },
    kapitel: Object.fromEntries(ids.map((id, i) => [id, { id, titel: id, text: texte[i]! }])),
    plaene: {},
    figuren: Object.fromEntries(figuren.map((f) => [f.id, f])),
    gruppen: {},
    orte: {},
    kiHinweise: [],
  };
}

function hinweise(d: ProjektDaten, art: string) {
  return figurenHinweise(d, berechneIndex(d).erwaehnungen).filter((h) => h.schluessel.startsWith(`figuren:${art}:`));
}

describe('Satz um eine Stelle', () => {
  it('liefert den ganzen Satz, wörtlich', () => {
    const t = 'Erster Satz. Paul geht zum Kai. Dritter Satz.';
    const i = t.indexOf('Paul');
    expect(satzUm(t, i, i + 4)).toBe('Paul geht zum Kai.');
  });
});

describe('F-11 Spitzname vor dem Namen', () => {
  it('meldet den ersten Spitznamen vor dem ersten Namen, mit beiden Sätzen als Zitat', () => {
    const d = projekt(['Der Alte stand am Fenster.', 'Später sagte Marian nichts.'], [figur('marian', 'Marian', { aliase: ['Alte'] })]);
    const h = hinweise(d, 'vorher');
    expect(h).toHaveLength(1);
    expect(h[0]!.schluessel).toBe('figuren:vorher:marian|alte');
    expect(h[0]!.zitate).toEqual([
      { kapitel: 'k1', text: 'Der Alte stand am Fenster.' },
      { kapitel: 'k2', text: 'Später sagte Marian nichts.' },
    ]);
    for (const z of h[0]!.zitate) expect(klartext(d.kapitel[z.kapitel]!.text)).toContain(z.text);
  });

  it('nicht, wenn der Name zuerst fällt (auch im Genitiv), ohne Namen im Text oder bei „bewusst vage“', () => {
    expect(hinweise(projekt(['Marians Hut lag da. Der Alte kam.'], [figur('marian', 'Marian', { aliase: ['Alte'] })]), 'vorher')).toEqual([]);
    expect(hinweise(projekt(['Der Alte kam.'], [figur('marian', 'Marian', { aliase: ['Alte'] })]), 'vorher')).toEqual([]);
    expect(
      hinweise(projekt(['Der Alte kam.', 'Marian ging.'], [figur('marian', 'Marian', { aliase: ['Alte'], existenz: 'bewusst_vage' })]), 'vorher'),
    ).toEqual([]);
  });
});

describe('F-12 verwechselbare Namen', () => {
  it('ein Buchstabe Unterschied, gleicher Anfang bei gleicher Länge', () => {
    const d = projekt(
      ['Marian kam mit Marion. Sabine und Sabina lachten.'],
      [figur('marian', 'Marian'), figur('marion', 'Marion'), figur('sabine', 'Sabine'), figur('sabina', 'Sabina')],
    );
    expect(hinweise(d, 'aehnlich').map((h) => h.schluessel)).toEqual([
      'figuren:aehnlich:marian|marion|Marian|Marion',
      'figuren:aehnlich:sabina|sabine|Sabina|Sabine',
    ]);
    const anfang = projekt(['Marina und Marlis kamen.'], [figur('marina', 'Marina'), figur('marlis', 'Marlis')]);
    expect(hinweise(anfang, 'aehnlich')).toHaveLength(1);
  });

  it('nicht bei deutlich verschiedenen Namen oder wenn eine Figur nicht im Text vorkommt', () => {
    expect(hinweise(projekt(['Paul und Vera.'], [figur('paul', 'Paul'), figur('vera', 'Vera')]), 'aehnlich')).toEqual([]);
    expect(hinweise(projekt(['Marian kam.'], [figur('marian', 'Marian'), figur('marion', 'Marion')]), 'aehnlich')).toEqual([]);
  });
});

describe('F-13 ruhende Figuren', () => {
  const texte = ['Ole kam.', 'Leer eins.', 'Leer zwei.', 'Leer drei.', 'Ole ging.', 'Leer vier.'];

  it('Lücke ab der Schwelle (Hauptfigur 3), Hinweis mit Schlüssel an Figur und letztem Kapitel', () => {
    const d = projekt(texte, [figur('ole', 'Ole', { rolle: 'haupt' })]);
    const h = hinweise(d, 'ruht');
    expect(h.map((x) => x.schluessel)).toEqual(['figuren:ruht:ole@k1']);
    expect(h[0]!.zitate).toEqual([{ kapitel: 'k1', text: 'Ole kam.' }]);
  });

  it('Nebenfigur erst ab 6; eigene Schwelle; null = nie', () => {
    const f = figur('ole', 'Ole');
    const d = projekt(texte, [f]);
    const { erwaehnungen } = berechneIndex(d);
    expect(ruhendeStrecken(d, erwaehnungen, f)).toEqual([]);
    expect(ruhendeStrecken(d, erwaehnungen, { ...f, ruheSchwelle: 1 })).toEqual([
      { nach: 'k1', kapitel: ['k2', 'k3', 'k4'] },
      { nach: 'k5', kapitel: ['k6'] },
    ]);
    expect(ruhendeStrecken(d, erwaehnungen, { ...f, rolle: 'haupt', ruheSchwelle: null })).toEqual([]);
  });

  it('Kapitelplan zählt als Vorkommen (Ich-Erzähler ohne Namen)', () => {
    const f = figur('ole', 'Ole', { rolle: 'haupt' });
    const d = projekt(texte, [f]);
    d.plaene = { k3: { ...Object.values(demo.plaene)[0]!, id: 'k3', figuren: ['ole'] } };
    expect(ruhendeStrecken(d, berechneIndex(d).erwaehnungen, f)).toEqual([]);
  });
});

describe('F-14 Statist in vielen Kapiteln', () => {
  it('ab drei Kapiteln „zur Nebenfigur machen?“; nicht für Nebenfiguren', () => {
    const texte = ['Die Kellnerin Uta kam.', 'Uta brachte Kaffee.', 'Uta lachte.'];
    expect(hinweise(projekt(texte, [figur('uta', 'Uta', { rolle: 'statist' })]), 'aufsteigen').map((h) => h.schluessel)).toEqual(['figuren:aufsteigen:uta']);
    expect(hinweise(projekt(texte.slice(0, 2), [figur('uta', 'Uta', { rolle: 'statist' })]), 'aufsteigen')).toEqual([]);
    expect(hinweise(projekt(texte, [figur('uta', 'Uta')]), 'aufsteigen')).toEqual([]);
  });

  it('Statisten ruhen nie und zählen nicht als verwechselbar', () => {
    const d = projekt(
      ['Sabine kam.', 'a.', 'b.', 'c.', 'd.', 'e.', 'f.', 'Sabine ging. Sabina auch.'],
      [figur('sabine', 'Sabine', { rolle: 'statist', ruheSchwelle: undefined }), figur('sabina', 'Sabina')],
    );
    expect(hinweise(d, 'ruht').filter((h) => h.schluessel.includes('sabine'))).toEqual([]);
    expect(hinweise(d, 'aehnlich')).toEqual([]);
  });
});

describe('F-15 Besetzung', () => {
  it('Figuren × Kapitel mit wichtigster Art, Kapitelplan als „plan“, Summen je Kapitel', async () => {
    const { besetzung } = await import('./besetzung');
    const d = projekt(['Ole kam. Paul sah ihn.', 'Paul schrieb.', 'Leer.'], [figur('ole', 'Ole', { rolle: 'haupt' }), figur('paul', 'Paul', { rolle: 'haupt' }), figur('uta', 'Uta', { rolle: 'statist' })]);
    d.plaene = { k3: { ...Object.values(demo.plaene)[0]!, id: 'k3', figuren: ['ole'] } };
    const b = besetzung(d, berechneIndex(d).erwaehnungen);
    expect(b.kapitel).toEqual(['k1', 'k2', 'k3']);
    expect(b.zeilen.map((z) => z.figur.id)).toEqual(['ole', 'paul', 'uta']);
    const ole = b.zeilen[0]!;
    expect(ole.zellen[0]).toBeTruthy();
    expect(ole.zellen[1]).toBeNull();
    expect(ole.zellen[2]).toBe('plan');
    expect(ole.anzahl).toBe(1);
    expect(b.summen).toEqual([2, 1, 0]);
    expect(ole.erste[0]?.treffer).toBe('Ole');
  });
});

describe('F-16 Spitzname vor seinem geplanten Kapitel', () => {
  it('meldet die erste Stelle vor „ab Kapitel“; ab dort nicht', () => {
    const d = projekt(['Der Alte kam.', 'Marian lachte.', 'Der Alte ging.'], [
      figur('marian', 'Marian', { aliase: ['Alte'], spitznamen: [{ name: 'Alte', abKapitel: 'k3' }] }),
    ]);
    const h = hinweise(d, 'frueh');
    expect(h.map((x) => x.schluessel)).toEqual(['figuren:frueh:marian|alte']);
    expect(h[0]!.zitate).toEqual([{ kapitel: 'k1', text: 'Der Alte kam.' }]);
    d.figuren.marian = { ...d.figuren.marian!, spitznamen: [{ name: 'Alte', abKapitel: 'k1' }] };
    expect(hinweise(d, 'frueh')).toEqual([]);
  });

  it('Kontext: setzen, leeren, beim Entfernen des Namens weg; übersteht Speichern', async () => {
    const { mitAliasen, mitSpitznameKontext } = await import('./namen');
    const { parseFigur, serializeFigur } = await import('../projekt');
    let f = figur('ole', 'Ole', { aliase: ['Olli'] });
    f = mitSpitznameKontext(f, { name: 'Olli', von: ['paul', 'paul'], notiz: ' Kosename ' });
    expect(f.spitznamen).toEqual([{ name: 'Olli', von: ['paul'], notiz: 'Kosename' }]);
    expect(parseFigur(serializeFigur(f), 'ole').spitznamen).toEqual(f.spitznamen);
    expect(mitSpitznameKontext(f, { name: 'Olli' }).spitznamen).toBeUndefined();
    expect(mitAliasen(f, ['Fenster-Ole']).spitznamen).toBeUndefined();
    expect(mitAliasen(f, ['Olli', 'olli', 'Ole', ' ']).aliase).toEqual(['Olli']);
  });
});
