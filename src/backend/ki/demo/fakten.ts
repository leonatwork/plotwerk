/**
 * Demo-Antwort für die Aufgabe „fakten“ (F-17 Figurenfakten). Registriert in ../demoAntworten/figuren.ts.
 * Alle echten Zitate sind wörtliche Ausschnitte der Fixture-Kapitel und werden nur geliefert, wenn sie im
 * mitgeschickten Kontext stehen. Enthalten: Pauls Auto als Saab und als Volvo (Widerspruch) und ein erfundenes
 * Zitat, das die Auswertung verwerfen muss.
 */
import type { DemoAntwort } from '../demoAntworten/typen';

interface Fakt {
  figur: string;
  merkmal: string;
  wert: string;
  kapitel: string;
  zitat: string;
  /** absichtlich ungültig (Test der Antwortprüfung) – wird ohne Fundprüfung geliefert */
  ungueltig?: boolean;
}

const FAKTEN: Fakt[] = [
  { figur: 'paul', merkmal: 'Auto', wert: 'alter Saab 900', kapitel: 'lotte', zitat: 'Dann nimmt er den Schlüssel und fährt mit seinem alten Saab 900 zum Lindenhof.' },
  { figur: 'paul', merkmal: 'Auto', wert: 'Saab', kapitel: 'funkstille', zitat: 'Paul sitzt im Saab auf dem Parkplatz am Linden-Hof, auf dem Beifahrersitz die Papprolle mit den Glasfassaden.' },
  { figur: 'paul', merkmal: 'Auto', wert: 'Volvo', kapitel: 'flut', zitat: 'Ich steige aus dem Volvo, schlage die Tür zu und sehe ihm nach, bis er hinter den Lagerhallen verschwunden ist.' },
  { figur: 'vera', merkmal: 'Beruf', wert: 'restauriert alte Orgeln', kapitel: 'ebbe', zitat: 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.' },
  { figur: 'ole', merkmal: 'Alter', wert: '41', kapitel: 'grundriss', zitat: 'Ole ist einundvierzig und trägt immer denselben Pullover.', ungueltig: true },
];

const FAKTEN_EN: Fakt[] = [
  { figur: 'paul', merkmal: 'Car', wert: 'old Saab 900', kapitel: 'lotte', zitat: 'Then he takes the key and drives his old Saab 900 to the Lindenhof.' },
  { figur: 'paul', merkmal: 'Car', wert: 'Saab', kapitel: 'radio-silence', zitat: 'Paul sits in the Saab in the car park at the Linden-Hof, the cardboard tube with the glass facades on the passenger seat.' },
  { figur: 'paul', merkmal: 'Car', wert: 'Volvo', kapitel: 'high-tide', zitat: 'I get out of the Volvo, slam the door and watch it until it has disappeared behind the warehouses.' },
  { figur: 'vera', merkmal: 'Occupation', wert: 'restores old organs', kapitel: 'low-tide', zitat: 'Vera talks about her workshop, where she restores old organs, Paul is only half listening.' },
  { figur: 'ole', merkmal: 'Age', wert: '41', kapitel: 'floor-plan', zitat: 'Ole is forty-one and always wears the same jumper.', ungueltig: true },
];

export const demoFakten: DemoAntwort = (ctx, anfrage) => {
  const nur = anfrage.attribute.figur;
  const figuren = new Set(ctx.figuren.map((f) => f.id));
  const steht = (f: Fakt) => !!ctx.kapitel.find((k) => k.id === f.kapitel)?.text.includes(f.zitat);
  const liste = (ctx.sprache === 'en' ? FAKTEN_EN : FAKTEN)
    .filter((f) => (!nur || f.figur === nur) && figuren.has(f.figur))
    .filter((f) => f.ungueltig || steht(f));
  return { fakten: liste.map(({ figur, merkmal, wert, kapitel, zitat }) => ({ figur, merkmal, wert, kapitel, zitat })) };
};
