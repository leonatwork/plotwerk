import { beforeAll, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { berechneIndex } from '../index/index';
import type { ProjektDaten } from '../model/types';
import { ladeProjekt } from '../projekt';
import { exposeMarkdown } from './expose';
import { personenAuswahl, personenKapitel, personenverzeichnis } from './personen';

let daten: ProjektDaten;
let erst: Record<string, string>;
beforeAll(async () => {
  daten = await ladeProjekt(demoFs());
  erst = berechneIndex(daten).erstesVorkommen;
});

describe('Personenverzeichnis', () => {
  it('nach Gruppen: Hauptgruppen als Abschnitte, Rest unter „Weitere Figuren“; nie private Felder', () => {
    const d: ProjektDaten = {
      ...daten,
      figuren: { ...daten.figuren, ole: { ...daten.figuren.ole!, aliase: ['Fenster-Ole'], wahrheit: 'GEHEIM', notizen: 'PRIVAT' } },
    };
    const md = exposeMarkdown(personenverzeichnis(d, erst, { gliederung: 'gruppen' }));
    expect(md).toMatch(/^# Personen/);
    expect(md).toContain('## Nordhaven');
    expect(md).toContain('## Weitere Figuren');
    expect(md).toContain('**Ole**');
    expect(md).toContain('auch „Fenster-Ole“');
    expect(md).not.toContain('GEHEIM');
    expect(md).not.toContain('PRIVAT');
    // bewusst vage Figuren bleiben draußen, geplante (noch nicht im Text) auch
    const vage = Object.values(d.figuren).find((f) => f.existenz === 'bewusst_vage');
    if (vage) expect(md).not.toContain(vage.name);
  });

  it('nach Rolle; Spitznamen abschaltbar; Statisten nur auf Wunsch', () => {
    const d: ProjektDaten = { ...daten, figuren: { ...daten.figuren, malte: { ...daten.figuren.malte!, rolle: 'statist', aliase: ['M.'] } } };
    const ohne = exposeMarkdown(personenverzeichnis(d, erst, { gliederung: 'rolle', spitznamen: false }));
    expect(ohne).toContain('## Hauptfiguren');
    expect(ohne).not.toContain('Malte');
    const mit = exposeMarkdown(personenverzeichnis(d, erst, { gliederung: 'rolle', statisten: true, spitznamen: false }));
    expect(mit).toContain('**Malte**');
    expect(mit).not.toContain('„M.“');
  });

  it('nur bis Kapitel X: keine Figuren, die erst später auftauchen', () => {
    const erstes = daten.projekt.kapitel[0]!;
    const bis = personenAuswahl(daten, erst, { gliederung: 'rolle', bisKapitel: erstes });
    expect(bis.every((f) => erst[f.id] === erstes)).toBe(true);
    expect(bis.length).toBeLessThan(personenAuswahl(daten, erst, { gliederung: 'rolle' }).length);
  });

  it('als Vorspann-Kapitel (Markdown mit fett/kursiv)', () => {
    const k = personenKapitel(personenverzeichnis(daten, erst, { gliederung: 'rolle' }));
    expect(k.titel).toBe('Personen');
    expect(k.text).toContain('## Hauptfiguren');
    expect(k.text).toMatch(/\*\*Paul\*\*/);
  });
});
