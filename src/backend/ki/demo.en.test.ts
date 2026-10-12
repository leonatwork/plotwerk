/**
 * Demo-KI mit dem englischen Demo-Projekt „Harbour Lights“: Antworten auf Englisch, alle angenommenen Zitate
 * stehen wörtlich im englischen Text, die absichtlich ungültigen Einträge werden verworfen.
 */
import { describe, expect, it } from 'vitest';
import {
  frageAufgabe,
  fuehreAufgabeAus,
  leserSimulationAufgabe,
  pruefe,
  schlageErwaehnungenVor,
  schlageVorschlaegeVor,
  STANDARD_KI,
  stimmeDefinition,
  zeitDefinition,
  zustandDefinition,
} from '@core/ki/index';
import { PFADE } from '@core/projekt';
import { MemoryFs } from '@core/projekt';
import { findeZitat, klartext } from '@core/text';
import { demoDateienEn, ladeDemoProjektEn } from '../../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from './demo';

const transport = () => erstelleDemoKiTransport({ verzoegerungMs: 0 });

/** englisches Demo-Projekt ohne gespeicherte KI-Analysen */
function fsEn(): MemoryFs {
  const d = demoDateienEn();
  for (const p of Object.keys(d)) if (p.startsWith(`${PFADE.analysen}/`)) delete d[p];
  return new MemoryFs(d);
}

async function wörtlich(zitate: { kapitel: string; text: string }[]) {
  const daten = await ladeDemoProjektEn();
  for (const z of zitate) expect(findeZitat(klartext(daten.kapitel[z.kapitel]?.text ?? ''), z.text).length, `${z.kapitel}: ${z.text}`).toBeGreaterThan(0);
}

const DEUTSCH = /[äöüß„]|\b(und|nicht|der|die|das|ist|Kap\.)\b/;

describe('Demo-KI mit „Harbour Lights“', () => {
  it('Prüfung des ganzen Buchs: englische Hinweise und Analysen, ungültige verworfen', async () => {
    const r = await pruefe(fsEn(), { umfang: 'buch' }, transport(), STANDARD_KI, { oberflaeche: 'en' });
    expect(r.fehler).toBeUndefined();
    const titel = r.hinweise.map((h) => h.titel);
    expect(titel).toEqual(
      expect.arrayContaining([
        '“Fiete” isn’t assigned to any character',
        'Who put the second postcard in Paul’s coat?',
        'Meeting with Lotte: late or early?',
        'Only Monday and Thursday are anchored',
        'Capitalised “Her” mid-sentence',
        'Paul drinks alcohol – not according to the plan',
      ]),
    );
    for (const h of r.hinweise) expect(`${h.titel} ${h.erklaerung}`, h.titel).not.toMatch(DEUTSCH);
    await wörtlich(r.hinweise.flatMap((h) => h.zitate));
    // erfundenes Zitat, Ersatztext und Widerspruch zur bewusst vagen Figur
    expect(titel.some((t) => /leave the room twice|wooden|The Stranger: contradictory/.test(t))).toBe(false);
    expect(r.verworfen.length).toBeGreaterThanOrEqual(3);
    expect(r.analysen.length).toBe(9);
    for (const a of r.analysen) expect(`${a.zusammenfassung} ${a.kurz}`, a.kapitel).not.toMatch(DEUTSCH);
    const treffen = r.hinweise.find((h) => h.titel.startsWith('Meeting with Lotte'))!;
    expect(treffen.zitate).toEqual([
      { kapitel: 'lotte', text: 'drives his old Saab 900 to the Lindenhof' },
      { kapitel: 'high-tide', text: 'I’m half an hour early' },
    ]);
    expect(treffen.erklaerung).toContain('(Ch. 3: Saab, Ch. 9: Volvo)');
  });

  it('Erwähnungen: unbekannter Name, namenlose Person, andere Schreibweise', async () => {
    const fs = fsEn();
    const funk = await schlageErwaehnungenVor(fs, 'radio-silence', transport(), STANDARD_KI, 'en');
    expect(funk.map((v) => v.text)).toEqual(expect.arrayContaining(['Fiete', 'The man at the fish stall', 'Linden-Hof']));
    const ebbe = await schlageErwaehnungenVor(fs, 'low-tide', transport(), STANDARD_KI, 'en');
    expect(ebbe.map((v) => v.text)).toContain('Linden Hof');
    for (const v of [...funk, ...ebbe]) expect(v.begruendung).not.toMatch(DEUTSCH);
  });

  it('Vorschläge für Figuren, Orte und Beziehungen', async () => {
    const e = await schlageVorschlaegeVor(fsEn(), transport(), STANDARD_KI, { oberflaeche: 'en' });
    expect(e.figuren.map((f) => f.name)).toEqual(['Fiete', 'The Man at the Fish Stall']);
    expect(e.orte.map((o) => o.name)).toEqual(['Fish Restaurant', 'North Quay']);
    expect(e.beziehungen.map((b) => `${b.von.name} – ${b.zu.name}: ${b.art}`)).toEqual(
      expect.arrayContaining(['Mr Kessler – Konrad: Client', 'Malte – Ole: Colleague', 'Paul – Fiete: shops for him']),
    );
    expect(e.beziehungen.some((b) => b.art === 'Ex-girlfriend' || b.zu.name === 'Harbour master' || b.art === 'Friend')).toBe(false);
    await wörtlich([...e.figuren, ...e.orte, ...e.beziehungen].flatMap((x) => x.belege));
  });

  it('Zeitpunkte und Zustände', async () => {
    const zeit = await fuehreAufgabeAus(fsEn(), transport(), undefined, zeitDefinition(), { oberflaeche: 'en' });
    const kapitel = zeit.ergebnis.vorschlaege.map((v) => v.kapitel);
    expect(kapitel).toEqual(expect.arrayContaining(['floor-plan', 'lotte', 'see-you-soon', 'radio-silence']));
    expect(kapitel).not.toContain('dust');
    expect(kapitel).not.toContain('high-tide');
    for (const v of zeit.ergebnis.vorschlaege) expect(v.begruendung, v.kapitel).not.toMatch(DEUTSCH);
    await wörtlich(zeit.ergebnis.vorschlaege.flatMap((v) => v.belege));
    const zustand = await fuehreAufgabeAus(fsEn(), transport(), undefined, zustandDefinition({ figur: 'paul', arten: (await ladeDemoProjektEn()).zeitleiste!.zustandsarten }), { oberflaeche: 'en' });
    expect(zustand.ergebnis.vorschlaege.map((v) => [v.kapitel, v.zustand])).toEqual([
      ['floor-plan', 'rested'],
      ['see-you-soon', 'confused'],
      ['radio-silence', 'sleepless'],
    ]);
  });

  it('Figurenstimme, Leser-Simulation und Fragen an das Buch', async () => {
    const stimme = await fuehreAufgabeAus(fsEn(), transport(), undefined, stimmeDefinition({ figur: 'paul' }), { oberflaeche: 'en' });
    expect(stimme.ergebnis.beobachtungen.map((b) => b.titel)).toEqual(['Paul only answers with a number', 'An exclamation towards Vera']);
    await wörtlich(stimme.ergebnis.beobachtungen.flatMap((b) => [...b.zitate, ...b.vergleich]));

    const leser = await fuehreAufgabeAus(fsEn(), transport(), undefined, leserSimulationAufgabe('facade'), { oberflaeche: 'en' });
    expect(leser.ergebnis.fragen.map((f) => f.frage)).toContain('Who bought the shipyard hall on the North Quay?');
    expect(leser.ergebnis.plan.find((p) => p.kapitel === 'facade')).toMatchObject({ aussage: 'the requirement comes from the supervisory board', status: 'belegt' });
    expect(JSON.stringify(leser.ergebnis)).not.toMatch(DEUTSCH);

    const frage = await fuehreAufgabeAus(fsEn(), transport(), undefined, frageAufgabe('Where do I mention Paul’s pencils?'), { oberflaeche: 'en' });
    expect(frage.ergebnis.imBuch).toBe(true);
    expect(frage.ergebnis.antwort).toMatch(/^\d+ passages in 2 chapters: Ch\. 2 \(Facade\), Ch\. 9 \(High Tide\)\.$/);
    await wörtlich(frage.ergebnis.belege);
    const auftrag = await fuehreAufgabeAus(fsEn(), transport(), undefined, frageAufgabe('Please write the ending for me.'), { oberflaeche: 'en' });
    expect(auftrag.ergebnis.antwort).toBe('I don’t write text for the book.');
  });
});
