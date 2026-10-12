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
