/**
 * Buchsprache Englisch in core/ki: englische Prompts und Kontext-Beschriftungen, Sprachanweisung,
 * Zitatprüfung mit englischen Anführungszeichen/Apostrophen, englischer Ersatztext-Filter.
 */
import { describe, expect, it } from 'vitest';
import { demoDateien } from '../../fixtures/demoProjekt';
import { MemoryFs } from '../projekt';
import { ladeProjekt } from '../projekt/lesen';
import { SYSTEM_PRUEFUNG, SYSTEM_PRUEFUNG_EN } from './anfrage';
import { erstelleAufgabenPruefung } from './aufgabe';
import { schreibAuftrag } from './fragen';
import {
  aufgabenAnfrage,
  baueBuchKontext,
  ersatztextGrund,
  frageAufgabe,
  leseBuchKontext,
  leserBasisHash,
  leserSimulationAufgabe,
  pruefe,
  STANDARD_KI,
  stimmeDefinition,
  zeitDefinition,
  type AufgabenDefinition,
  type KiTransport,
} from './index';
import { fremdesZitat } from './pruefung';
import { ANTWORTSPRACHE_EN, SPRACHANWEISUNG_EN } from './sprache';
import { leseZeitAngaben, zeitUhrzeit } from './zeit';

const ENGLISCH = `---
id: fassade
titel: Fassade
---

Everyone is already sitting in the drawing office when Paul comes in. “Don’t start without me,” he says. Malte has opened the presentation; Ole isn’t here today.

Paul sits down on a chair and opens a Schwip Schwap with the pencil behind his ear. ‘It’s the ’90s again,’ Malte mutters.
`;

function englischeDateien(): Record<string, string> {
  const d = demoDateien();
  d['projekt.md'] = d['projekt.md']!.replace('titel: Hafenlichter\n', 'titel: Hafenlichter\nangaben:\n  sprache: en-US\n');
  d['manuskript/fassade.md'] = ENGLISCH;
  return d;
}

function aufzeichnend(antwort: unknown = { hinweise: [], analysen: [] }) {
  const bodies: Record<string, unknown>[] = [];
  const transport: KiTransport = {
    bereit: async () => true,
    tokenZaehlen: async () => 1000,
    senden: async (body) => {
      bodies.push(body);
      return { type: 'message', content: [{ type: 'text', text: JSON.stringify(antwort) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    },
  };
  return { transport, bodies };
}

const systemText = (body: Record<string, unknown>) => (body.system as { text: string }[])[0]!.text;
const bloecke = (body: Record<string, unknown>) =>
  ((body.messages as { content: { text: string }[] }[])[0]!.content ?? []).map((c) => c.text);

describe('Buchsprache Englisch: Prüfung', () => {
  it('englischer System-Prompt, englische Aufgabe und Kontext-Beschriftungen', async () => {
    const { transport, bodies } = aufzeichnend();
    await pruefe(new MemoryFs(englischeDateien()), { umfang: 'kapitel', kapitel: 'fassade' }, transport, STANDARD_KI);
    const body = bodies[0]!;
    expect(systemText(body)).toBe(SYSTEM_PRUEFUNG_EN);
    expect(systemText(body)).toContain('English-language novel');
    expect(systemText(body)).toContain(ANTWORTSPRACHE_EN);
    const [prefix, aufgabe] = bloecke(body);
    expect(prefix).toContain('Characters:');
    expect(prefix).toContain('Existence: deliberately vague');
    expect(prefix).not.toContain('Figuren:');
    expect(prefix).toContain('“Don’t start without me,” he says.');
    expect(aufgabe).toContain('<aufgabe art="pruefung" kapitel="fassade">');
    expect(aufgabe).toContain('Check Chapter 2 “Fassade” (id: fassade)');
  });

  it('deutsche Bücher bleiben unverändert', async () => {
    const { transport, bodies } = aufzeichnend();
    await pruefe(new MemoryFs(demoDateien()), { umfang: 'kapitel', kapitel: 'fassade', erzwingen: true }, transport, STANDARD_KI);
    expect(systemText(bodies[0]!)).toBe(SYSTEM_PRUEFUNG);
    expect(bloecke(bodies[0]!)[0]).toContain('Figuren:');
    expect(bloecke(bodies[0]!)[1]).toContain('Prüfe Kapitel 2 „Fassade“');
  });

  it('leseBuchKontext versteht englische Beschriftungen (Stufen in deutscher Form)', async () => {
    const daten = await ladeProjekt(new MemoryFs(englischeDateien()));
    const kontext = baueBuchKontext(daten);
    expect(kontext.sprache).toBe('en');
    const gelesen = leseBuchKontext(kontext.text);
    const de = leseBuchKontext(baueBuchKontext(daten, 'de').text);
    expect(gelesen.figuren.map((f) => [f.id, f.existenz, f.aliase, f.plan])).toEqual(de.figuren.map((f) => [f.id, f.existenz, f.aliase, f.plan]));
    expect(gelesen.figuren.find((f) => f.id === 'die-fremde')?.existenz).toMatch(/^bewusst vage/);
    expect(gelesen.kapitel.map((k) => [k.id, k.realitaet, k.plan])).toEqual(de.kapitel.map((k) => [k.id, k.realitaet, k.plan]));
    expect(gelesen.orte).toEqual(de.orte);
  });
});

describe('Buchsprache Englisch: Werkzeug-Aufgaben', () => {
  const leser = () => new MemoryFs(englischeDateien());

  it.each([
    ['zeit', zeitDefinition()],
    ['stimme', stimmeDefinition({ figur: 'paul' })],
    ['leser', leserSimulationAufgabe('fassade')],
    ['frage', frageAufgabe('Where do I mention Paul’s pencils?')],
  ] as [string, AufgabenDefinition<unknown>][])('%s: englischer System-Prompt und Aufgabentext', async (_art, definition) => {
    const body = await aufgabenAnfrage(leser(), definition);
    expect(systemText(body)).toContain('English-language novel');
    expect(systemText(body)).toContain(ANTWORTSPRACHE_EN);
    const aufgabe = bloecke(body)[1]!;
    expect(aufgabe).not.toMatch(/\b(Kapitel|Figur|Bestimme|Lies|Beantworte)\b/);
  });

  it('Aufgaben ohne englischen Prompt bekommen eine Sprachanweisung', async () => {
    const definition: AufgabenDefinition<null> = {
      name: 'Test',
      art: 'test',
      rolle: 'pruefung',
      system: 'Testsystem',
      aufgabe: () => 'x',
      schema: () => ({ type: 'object' }),
      auswerten: () => null,
    };
    expect(systemText(await aufgabenAnfrage(leser(), definition))).toBe(`Testsystem\n\n${SPRACHANWEISUNG_EN}`);
    expect(systemText(await aufgabenAnfrage(new MemoryFs(demoDateien()), definition))).toBe('Testsystem');
  });

  it('Leser-Stand wird bei einem Wechsel der Buchsprache veraltet', async () => {
    const en = await ladeProjekt(leser());
    const de = { ...en, projekt: { ...en.projekt, angaben: { ...en.projekt.angaben, sprache: 'de' } } };
    expect(leserBasisHash(en, 'fassade')).not.toBe(leserBasisHash(de, 'fassade'));
    const ohne = { ...en, projekt: { ...en.projekt, angaben: {} } };
    expect(leserBasisHash(ohne, 'fassade')).toBe(leserBasisHash(de, 'fassade'));
  });

  it('Zeitangaben: 12-Stunden-Uhr und englische Wochentage', () => {
    expect(zeitUhrzeit('11 pm')).toBe('23:00');
    expect(zeitUhrzeit('7:05 a.m.')).toBe('07:05');
    expect(zeitUhrzeit('12 am')).toBe('00:00');
    expect(zeitUhrzeit('12 pm')).toBe('12:00');
    expect(zeitUhrzeit('13 pm')).toBeNull();
    expect(zeitUhrzeit('23 Uhr')).toBe('23:00');
    expect(leseZeitAngaben({ wochentag: 'Monday', sicherheit: 'fest' })).toMatchObject({ wochentag: 'montag' });
  });
});

describe('Zitatprüfung mit englischem Text (E6)', () => {
  it('findet Zitate mit geraden statt typografischen Anführungszeichen und Apostrophen', async () => {
    const kontext = baueBuchKontext(await ladeProjekt(new MemoryFs(englischeDateien())));
    const p = erstelleAufgabenPruefung(kontext);
    const z = p.zitate(
      [
        { kapitel: 'fassade', text: `"Don't start without me," he says.` },
        { kapitel: 'fassade', text: "Ole isn't here today" },
        { kapitel: 'fassade', text: `'It's the '90s again,'` },
      ],
      {},
    );
    expect(p.verworfen).toEqual([]);
    expect(z?.map((x) => x.text)).toEqual(['“Don’t start without me,” he says.', 'Ole isn’t here today', 'It’s the ’90s again,']);
    expect(p.zitate([{ kapitel: 'fassade', text: 'Ole is not here today' }], {})).toBeNull();
  });

  it('fremdesZitat erkennt englische Anführungszeichen, Apostrophe lösen nichts aus', async () => {
    const kontext = baueBuchKontext(await ladeProjekt(new MemoryFs(englischeDateien())));
    expect(fremdesZitat('Paul says “I will never come back here” although he returns.', kontext)).toBe('I will never come back here');
    expect(fremdesZitat('Paul says “Don’t start without me,” which fits his impatience.', kontext)).toBeNull();
    expect(fremdesZitat('Paul’s pencil and Malte’s presentation don’t match Ole’s absence.', kontext)).toBeNull();
    expect(fremdesZitat('He calls it ‘a whole new world for us’ in Ch. 2.', kontext)).toBe('a whole new world for us');
  });
});

describe('Ersatztext-Filter englisch', () => {
  it.each([
    'Better: “Paul sits down quietly.”',
    'This would read better as a single sentence.',
    'Replace “drawing office” with “studio”.',
    'You could rephrase the opening line.',
    'Consider rewording the dialogue here.',
    'Rewrite it as a question.',
    'Consider cutting the second sentence.',
    'You could write “he mutters” here.',
    'Change it to “Paul sits down”.',
    'The line should read: “Paul sits.”',
    'Suggestion: start with the pencil.',
    'Alternative: “Paul arrives late.”',
    'I suggest moving this to Ch. 3.',
    'Use “said” instead.',
    'Instead, write the scene from Lotte’s view.',
    'Delete the sentence about the headline.',
    'Instead of “mutters”, use “says”.',
    'The tense shifts here.\nAdd a sentence that explains the delay.',
  ])('verwirft: %s', (text) => {
    expect(ersatztextGrund(text)).not.toBeNull();
  });

  it.each([
    'Paul says on Monday that he never smokes; in Ch. 3 he lights a cigarette.',
    'Paul decides to walk home instead of taking the bus, although Ch. 1 says he has no time.',
    'Lotte is introduced as a colleague but later called his sister.',
    'The text says the meeting is on Tuesday, but the previous chapter ends on Friday evening.',
    'Malte replaces Ole in the meeting, but Ole is mentioned as present later.',
    'Paul writes a letter instead of calling her.',
    'Ole feels better after the break, which contradicts the hangover in Ch. 4.',
    'The sudden change to “Sir” is unusual for Paul, who otherwise uses first names.',
    'One could argue the pencil is a motif; it appears three times.',
    'Lotte asks him to rewrite his CV before the interview.',
  ])('lässt durch: %s', (text) => {
    expect(ersatztextGrund(text)).toBeNull();
  });

  it('deutsche Muster gelten weiter', () => {
    expect(ersatztextGrund('Besser: „Paul setzt sich.“')).not.toBeNull();
    expect(ersatztextGrund('Paul raucht in Kap. 3, obwohl er in Kap. 1 sagt, er rauche nie.')).toBeNull();
  });
});

describe('Fragen an das Buch: Schreibaufträge englisch', () => {
  it.each(['Write a scene where Paul meets Lotte.', 'Please rewrite chapter 2.', 'Can you write the ending for me?', 'How should I phrase the opening?', 'Suggest a better wording for the first line.'])(
    'fängt ab: %s',
    (frage) => expect(schreibAuftrag(frage)).toBe(true),
  );

  it.each(['Where do I mention Paul’s pencils?', 'Who is Fiete?', 'Could you find where Paul writes the letter?', 'When does Lotte first appear?'])('lässt durch: %s', (frage) =>
    expect(schreibAuftrag(frage)).toBe(false),
  );
});
