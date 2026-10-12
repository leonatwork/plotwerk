import { beforeAll, describe, expect, it } from 'vitest';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { ProjektDaten } from '../model/types';
import { findeZitat, klartext } from '../text';
import { ersteWoerter, letzteWoerter, strukturHinweise } from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemo();
});

function mit(kapitel: Record<string, string>, titel: Record<string, string> = {}): ProjektDaten {
  return {
    ...daten,
    projekt: { ...daten.projekt, kapitel: Object.keys(kapitel) },
    kapitel: Object.fromEntries(Object.entries(kapitel).map(([id, text]) => [id, { id, titel: titel[id] ?? id, text }])),
  };
}

describe('strukturHinweise (Demo)', () => {
  it('Kap. 4 ohne Text, ohne Zitat (dokumentierte Ausnahme)', () => {
    const h = strukturHinweise(daten).find((x) => x.titel === 'Kap. 4 ohne Text');
    expect(h).toMatchObject({ typ: 'struktur', quelle: 'lokal', status: 'neu', zitate: [] });
    expect(h!.erklaerung).toContain('Regatta');
  });

  it('Kap. 9 endet mitten im Satz, Zitat = letzte Wörter wörtlich', () => {
    const h = strukturHinweise(daten).find((x) => x.titel === 'Kap. 9 endet mitten im Satz');
    expect(h?.zitate).toEqual([{ kapitel: 'flut', text: 'ich nach einem freien Tisch suche' }]);
    expect(findeZitat(klartext(daten.kapitel['flut']!.text), h!.zitate[0]!.text)).toHaveLength(1);
  });

  it('sonst keine Struktur-Hinweise; Schlüssel eindeutig', () => {
    const alle = strukturHinweise(daten);
    expect(alle.map((h) => h.titel)).toEqual(['Kap. 4 ohne Text', 'Kap. 9 endet mitten im Satz']);
    expect(new Set(alle.map((h) => h.schluessel)).size).toBe(alle.length);
  });
});

describe('strukturHinweise (Regeln)', () => {
  it.each([
    ['Er geht.', false],
    ['Er geht!', false],
    ['„Komm“', false],
    ['Er wartet …', false],
    ['»Nein«', false],
    ['(leise)', false],
    ['Ich wollte gerade –', false],
    ['„Schön, dass du da bist" sage ich', true],
    ['Er geht', true],
    ['Er sagt:', true],
  ])('Satzende: %s → Hinweis %s', (text, erwartet) => {
    const h = strukturHinweise(mit({ a: text })).filter((x) => x.schluessel.endsWith('#satzende'));
    expect(h.length > 0).toBe(erwartet);
  });

  it('Szenentrenner oder Überschrift am Ende sind kein Satzabbruch', () => {
    expect(strukturHinweise(mit({ a: 'Er geht\n\n* * *' })).filter((x) => x.schluessel.endsWith('#satzende'))).toEqual([]);
    expect(strukturHinweise(mit({ a: 'Er geht\n\n## Teil 2' })).filter((x) => x.schluessel.endsWith('#satzende'))).toEqual([]);
  });

  it('doppelte Leerzeichen mit Nachbarwörtern als Zitat', () => {
    const d = mit({ a: 'Er öffnet die Tür  und geht. Dann  bleibt er stehen.' });
    const h = strukturHinweise(d).find((x) => x.schluessel.endsWith('#leerzeichen'));
    expect(h?.titel).toBe('Doppelte Leerzeichen in Kap. 1');
    expect(h?.zitate.map((z) => z.text)).toEqual(['Tür  und', 'Dann  bleibt']);
    expect(h?.erklaerung).toContain('2 Stellen');
    for (const z of h!.zitate) expect(findeZitat(klartext(d.kapitel.a!.text), z.text).length).toBeGreaterThan(0);
  });

  it('leere Überschrift am Ende (Import) mit Zitat davor', () => {
    const h = strukturHinweise(mit({ a: 'Er sieht auf den Kalender. Heute ist Donnerstag.\n\n#' }));
    const u = h.find((x) => x.titel.startsWith('Leere Überschrift'));
    expect(u?.titel).toBe('Leere Überschrift am Ende von Kap. 1');
    expect(u?.zitate).toEqual([{ kapitel: 'a', text: 'Heute ist Donnerstag.' }]);
    expect(h.some((x) => x.schluessel.endsWith('#satzende'))).toBe(false);
  });

  it('leere Überschrift mitten im Kapitel und Kapitel ohne Titel', () => {
    const h = strukturHinweise(mit({ a: 'Erster Absatz endet hier.\n\n##\n\nZweiter Absatz.' }, { a: '' }));
    expect(h.map((x) => x.titel)).toEqual(['Kap. 1 ohne Überschrift', 'Leere Überschrift in Kap. 1']);
    expect(h[0]!.zitate[0]!.text).toBe('Erster Absatz endet hier.');
  });

  it('letzteWoerter / ersteWoerter', () => {
    expect(letzteWoerter('„Schön, dass du da bist" sage ich ihr, während ich nach einem freien Tisch suche')).toBe('ich nach einem freien Tisch suche');
    expect(letzteWoerter('eins zwei drei vier fünf sechs sieben acht')).toBe('drei vier fünf sechs sieben acht');
    expect(letzteWoerter('Ende')).toBe('Ende');
    expect(ersteWoerter('Paul sitzt im Auto, auf dem Parkplatz am Linden-Hof')).toBe('Paul sitzt im Auto');
  });
});
