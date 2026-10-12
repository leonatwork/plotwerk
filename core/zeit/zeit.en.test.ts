/** Zeitprüfung und Zeit-Beschriftungen auf Englisch: gleiche Schlüssel, englische Texte. */
import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import type { KapitelPlan, ProjektDaten, Zeitpunkt } from '../model/types';
import { leereZeitleiste } from '../projekt/lesen';
import {
  einheitName,
  einheitNummer,
  formatiereDatum,
  relativeAngaben,
  tagName,
  tageszeitText,
  wochentagName,
  zeitEinheiten,
  zeitHinweise,
  zeitText,
} from './index';

function plan(id: string, zeit?: Zeitpunkt, extra: Partial<KapitelPlan> = {}): KapitelPlan {
  return {
    id,
    titel: id.toUpperCase(),
    akt: 1,
    status: 'entwurf',
    szene: '',
    straenge: [],
    figuren: [],
    orte: [],
    notiz: '',
    abweichungen: [],
    realitaet: [],
    ...(zeit ? { zeit } : {}),
    ...extra,
  };
}

function projekt(plaene: KapitelPlan[], beginn?: { wochentag?: 'montag' | 'dienstag'; datum?: string }): ProjektDaten {
  const kapitel: ProjektDaten['kapitel'] = {};
  for (const p of plaene) kapitel[p.id] = { id: p.id, titel: p.titel, text: `Text von ${p.id}.` };
  return {
    projekt: { version: 1, titel: 'Test', kapitel: plaene.map((p) => p.id) },
    kapitel,
    plaene: Object.fromEntries(plaene.map((p) => [p.id, p])),
    akte: [],
    straenge: [],
    ideen: [],
    figuren: {},
    gruppen: {},
    orte: {},
    anmerkungen: [],
    entscheidungen: { version: 1, schreibweisen: [], hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] },
    analysen: {},
    kiHinweise: [],
    zeitleiste: { ...leereZeitleiste(), ...(beginn ? { beginn } : {}) },
  } as unknown as ProjektDaten;
}

const z = (teil: Partial<Zeitpunkt>): Zeitpunkt => ({ sicherheit: 'fest', ...teil });

describe('Zeit-Beschriftungen (en)', () => {
  it('Datum, Tag, Wochentag, Tageszeit, Einheit', () => {
    expect(formatiereDatum('2026-03-03', 'en')).toBe('March 3, 2026');
    expect(formatiereDatum('2026-03-03')).toBe('03.03.2026');
    expect(tagName(3, 'en')).toBe('Day 3');
    expect(tagName(-2, 'en')).toBe('Day -2 · flashback');
    expect(wochentagName('donnerstag', 'en')).toBe('Thursday');
    expect(zeitText(z({ tag: 8, tageszeit: 'nachts', uhrzeit: '23:00' }), { wochentag: 'montag' }, {}, 'en')).toBe('Day 8 · Monday · night · 23:00');
    expect(zeitText(z({ tag: 8 }), { wochentag: 'montag' }, { kurz: true }, 'en')).toBe('Day 8 · Mon');
    expect(zeitText(undefined, {}, {}, 'en')).toBe('Time open');
    expect(tageszeitText(z({ tageszeit: 'abends', uhrzeit: '20:15' }), 'en')).toBe('evening · 20:15');
    expect(relativeAngaben('en').map((a) => a.label)[1]).toBe('the next morning');

    const d = projekt([
      plan('a', z({ tag: 1 }), {
        szenen: [
          { id: 'a-s1', kapitel: 'a', index: 0, titel: 'Eins', figuren: [], notiz: '' },
          { id: 'a-s2', kapitel: 'a', index: 1, titel: '', figuren: [], notiz: '' },
        ],
      }),
    ]);
    const [e1, e2] = zeitEinheiten(d);
    expect(einheitNummer(e1!, 'en')).toBe('Ch. 1 · scene 1');
    expect(einheitName(e2!, 'en')).toBe('Ch. 1 “A”, scene 2 “Scene 2”');
    expect(einheitName(e2!)).toBe('Kap. 1 „A“, Szene 2 „Szene 2“');
  });
});

describe('Zeitprüfung (en)', () => {
  it('Demo: Kap. 10 auf Englisch, gleicher Schlüssel wie auf Deutsch', async () => {
    const daten = await ladeDemoProjekt();
    const de = zeitHinweise(daten);
    const en = zeitHinweise(daten, 'en');
    expect(en.map((h) => h.schluessel)).toEqual(de.map((h) => h.schluessel));
    expect(en.map((h) => h.zitate)).toEqual(de.map((h) => h.zitate));
    const wt = en.find((h) => h.schluessel.startsWith('zeitleiste:wochentag:funkstille'))!;
    expect(wt.titel).toMatch(/^Weekday doesn’t match: Ch\. 10 “/);
    expect(wt.erklaerung).toMatch(/takes place on Day \d+\. If Day 1 is a \w+day, Day \d+ is a Tuesday – but Thursday is entered\./);
  });

  it('alle Arten englisch, Schlüssel unverändert', () => {
    const d = projekt([
      plan('a', z({ tag: 5 })),
      plan('b', z({ tag: 3 })),
      plan('c', z({ tag: 3, tageszeit: 'morgens', uhrzeit: '23:00' })),
      plan('d', z({ tag: 4, datum: '2026-10-10', wochentag: 'montag', uhrzeit: '25:99' })),
      plan('e', z({ tag: 6, uhrzeit: '20:00', dauer: 120 })),
      plan('f', z({ tag: 6, uhrzeit: '21:00' })),
    ]);
    const de = zeitHinweise(d);
    const en = zeitHinweise(d, 'en');
    expect(en.map((h) => h.schluessel)).toEqual(de.map((h) => h.schluessel));
    const titel = en.map((h) => h.titel);
    expect(titel).toContain('Jump back in time: Ch. 2 “B”');
    expect(titel).toContain('Time doesn’t match the time of day: Ch. 3 “C”');
    expect(titel).toContain('Date and weekday don’t match: Ch. 4 “D”');
    expect(titel).toContain('Invalid time: Ch. 4 “D”');
    expect(titel).toContain('Overlap: Ch. 6 “F”');
    const datum = en.find((h) => h.titel.startsWith('Date and weekday'))!;
    expect(datum.erklaerung).toBe('October 10, 2026 is a Saturday, but Monday is entered.');
    const ueber = en.find((h) => h.titel.startsWith('Overlap'))!;
    expect(ueber.erklaerung).toBe('Ch. 5 “E” starts at 20:00 and lasts 120 minutes (until 22:00), but Ch. 6 “F” already starts at 21:00.');
    for (const h of en) expect(`${h.titel} ${h.erklaerung}`).not.toMatch(/Kap\.|Tag \d|Uhrzeit|Wochentag/);
  });

  it('Datum gegen Beginn und Wochentage untereinander', () => {
    const mitBeginn = projekt([plan('a', z({ tag: 3, datum: '2026-10-15' }))], { datum: '2026-10-12' });
    expect(zeitHinweise(mitBeginn, 'en')[0]?.erklaerung).toBe('Day 1 is October 12, 2026, so Day 3 would be October 14, 2026 – but October 15, 2026 is entered.');
    const paar = projekt([plan('a', z({ tag: 1, wochentag: 'montag' })), plan('b', z({ tag: 4, wochentag: 'freitag' }))]);
    const [h] = zeitHinweise(paar, 'en');
    expect(h?.schluessel).toBe('zeitleiste:wochentag:a|b:tag1=montag|tag4=freitag');
    expect(h?.erklaerung).toBe('Ch. 1 “A” takes place on Day 1 (Monday), Ch. 2 “B” on Day 4 (Friday). 3 days later would be a Thursday.');
  });
});
