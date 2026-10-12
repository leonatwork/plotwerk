import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type { Figur, ProjektDaten } from '../model/types';
import { ladeProjekt } from '../projekt';
import { figurenZusammenfuehren } from './index';

let daten: ProjektDaten;

/** Demo-Projekt mit einer doppelt angelegten Vera („die Nachbarin“), auf die überall verwiesen wird. */
beforeEach(async () => {
  daten = await ladeProjekt(demoFs());
  const doppelt: Figur = {
    id: 'nachbarin',
    name: 'die Nachbarin',
    aliase: ['Vera', 'Frau von oben'],
    formen: ['Nachbarin'],
    rolle: 'haupt',
    kurz: 'wohnt über Paul',
    existenz: 'offen',
    gruppe: 'nordhaven',
    beziehungen: [
      { zu: 'paul', art: 'Verabredung', abKapitel: 'ebbe', kategorie: 'dates' },
      { zu: 'ole', art: 'Bekannte', kategorie: 'sonstige' },
      { zu: 'vera', art: 'selbst', kategorie: 'sonstige' },
    ],
    plan: { Alter: '34', Hobby: 'Segeln' },
    wahrheit: 'Kennt Kessler.',
    notizen: 'Siehe [[figur:paul|Paul]].',
  };
  daten.figuren.nachbarin = doppelt;
  daten.figuren.ole = {
    ...daten.figuren.ole!,
    beziehungen: [...daten.figuren.ole!.beziehungen, { zu: 'nachbarin', art: 'Bekannte', kategorie: 'sonstige' }],
    notizen: 'Trifft [[figur:nachbarin|die Nachbarin]] im Treppenhaus.',
  };
  daten.gruppen.nordhaven = { ...daten.gruppen.nordhaven!, mitglieder: [...daten.gruppen.nordhaven!.mitglieder, 'nachbarin'] };
  const plan = daten.plaene.ebbe!;
  daten.plaene.ebbe = { ...plan, figuren: [...plan.figuren, 'vera', 'nachbarin'] };
  daten.zeitleiste = {
    ...daten.zeitleiste!,
    zustaende: [
      ...daten.zeitleiste!.zustaende,
      { id: 'z-n1', figur: 'nachbarin', kapitel: 'ebbe', zustand: 'nuechtern' },
      { id: 'z-v1', figur: 'vera', kapitel: 'ebbe', zustand: 'betrunken' },
      { id: 'z-n2', figur: 'nachbarin', kapitel: 'funkstille', zustand: 'nuechtern' },
    ],
  };
  daten.boegen = [...(daten.boegen ?? []), { figur: 'nachbarin', stufen: [{ id: 's1', titel: 'zieht ein', belege: [] }] }];
  daten.anmerkungen = [{ id: 'a1', anker: { kapitel: 'ebbe', start: 0, ende: 1, davor: '', text: 'x', danach: '' } as never, notiz: '', ziel: { typ: 'figur', id: 'nachbarin' }, erstellt: '' }];
});

describe('Figuren zusammenführen', () => {
  it('bleibende Figur übernimmt Namen, Formen, Beziehungen, Plan, Notizen; Leeres wird ergänzt', () => {
    const vorher = daten.figuren.vera!;
    const d = figurenZusammenfuehren(daten, 'vera', 'nachbarin');
    expect(d.figuren.nachbarin).toBeUndefined();
    const v = d.figuren.vera!;
    expect(v.name).toBe('Vera');
    expect(v.existenz).toBe(vorher.existenz);
    expect(v.aliase).toEqual([...vorher.aliase, 'die Nachbarin', 'Frau von oben']);
    expect(v.formen).toEqual(['Nachbarin']);
    expect(v.rolle).toBe('haupt');
    expect(v.gruppe).toBe(vorher.gruppe ?? 'nordhaven');
    // doppelte Beziehung (Verabredung mit Paul) nur einmal, Beziehung zu sich selbst fällt weg
    expect(v.beziehungen.map((b) => `${b.zu}:${b.art}`)).toEqual(['paul:Verabredung', 'ole:Bekannte']);
    expect(v.plan.Hobby).toBe('Segeln');
    expect(v.plan.Alter).toBe(vorher.plan.Alter ? `${vorher.plan.Alter}\n\n34` : '34');
    expect(v.wahrheit).toContain('Kennt Kessler.');
    expect(v.notizen).toContain('[[figur:paul|Paul]]');
  });

  it('alle Verweise zeigen danach auf die bleibende Figur', () => {
    const d = figurenZusammenfuehren(daten, 'vera', 'nachbarin');
    expect(d.figuren.ole!.beziehungen.filter((b) => b.zu === 'nachbarin')).toEqual([]);
    expect(d.figuren.ole!.beziehungen.some((b) => b.zu === 'vera' && b.art === 'Bekannte')).toBe(true);
    expect(d.figuren.ole!.notizen).toBe('Trifft [[figur:vera|die Nachbarin]] im Treppenhaus.');
    expect(d.gruppen.nordhaven!.mitglieder).not.toContain('nachbarin');
    expect(d.gruppen.nordhaven!.mitglieder.filter((m) => m === 'vera').length).toBe(1);
    expect(d.plaene.ebbe!.figuren.filter((f) => f === 'vera').length).toBe(1);
    expect(d.plaene.ebbe!.figuren).not.toContain('nachbarin');
    // Zustand: bei Überschneidung gilt der der bleibenden Figur
    const zustaende = d.zeitleiste!.zustaende.filter((z) => ['z-n1', 'z-v1', 'z-n2'].includes(z.id));
    expect(zustaende.map((z) => [z.id, z.figur])).toEqual([
      ['z-v1', 'vera'],
      ['z-n2', 'vera'],
    ]);
    expect(d.boegen!.find((b) => b.figur === 'vera')!.stufen.map((s) => s.id)).toContain('s1');
    expect(d.boegen!.some((b) => b.figur === 'nachbarin')).toBe(false);
    expect(d.anmerkungen[0]!.ziel).toEqual({ typ: 'figur', id: 'vera' });
  });

  it('unbeteiligte Teile behalten ihre Referenz (nur geänderte Dateien werden geschrieben)', () => {
    const d = figurenZusammenfuehren(daten, 'vera', 'nachbarin');
    expect(d.figuren.paul).toBe(daten.figuren.paul);
    expect(d.kapitel).toBe(daten.kapitel);
    expect(d.plaene.grundriss).toBe(daten.plaene.grundriss);
    expect(d.orte).toBe(daten.orte);
    expect(d.figuren.ole).not.toBe(daten.figuren.ole);
  });

  it('dieselbe oder eine unbekannte Figur: unverändert', () => {
    expect(figurenZusammenfuehren(daten, 'vera', 'vera')).toBe(daten);
    expect(figurenZusammenfuehren(daten, 'vera', 'gibt-es-nicht')).toBe(daten);
  });
});
