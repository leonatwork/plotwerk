/**
 * Demo-Antwort für die Aufgabe „straenge“ (G2 Stränge vorschlagen). Besitzer: G2 Plot-Struktur.
 * Registriert in ../demoAntworten/struktur.ts. Alle echten Zitate sind wörtliche Ausschnitte der Fixture-Kapitel;
 * sie werden nur geliefert, wenn sie im mitgeschickten Kontext stehen. Zuordnungen nur zu Strängen, die im
 * Aufgabentext stehen. Absichtlich enthalten: eine Zuordnung mit erfundenem Zitat – die Auswertung in
 * core/ki/straenge.ts muss sie verwerfen.
 */
import type { DemoAntwort } from '../demoAntworten/typen';

interface Zitat {
  kapitel: string;
  text: string;
}

interface DemoStraenge {
  zuordnungen: { strang: string; kapitel: string; zitat: string; begruendung: string; ungueltig?: boolean }[];
  neueStraenge: { name: string; rolle: 'haupt' | 'neben'; zweck: string; kapitel: { kapitel: string; zitat: string }[] }[];
  rueckfragen: { frage: string; strang: string; belege: Zitat[] }[];
}

const DE: DemoStraenge = {
  zuordnungen: [
    {
      strang: 'nordhaven',
      kapitel: 'funkstille',
      zitat: 'auf dem Beifahrersitz die Papprolle mit den Glasfassaden',
      begruendung: 'Paul hat die Glasfassaden dabei, die Nordhaven verlangt.',
    },
    {
      strang: 'postkarten',
      kapitel: 'lotte',
      zitat: 'Lotte schiebt ihm eine Postkarte über den Tisch.',
      begruendung: 'Eine weitere Postkarte taucht auf.',
      ungueltig: true,
    },
  ],
  neueStraenge: [
    {
      name: 'Der alte Speicher',
      rolle: 'neben',
      zweck: 'Paul vermisst und plant den alten Kornspeicher, während am Hafen leerstehende Speicher verkauft werden.',
      kapitel: [
        { kapitel: 'grundriss', zitat: 'Auf dem langen Tisch in der Teeküche steht das Modell des alten Speichers, dreißig Zentimeter hoch, aus grauer Pappe.' },
        { kapitel: 'staub', zitat: 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen.' },
        { kapitel: 'funkstille', zitat: 'Im Radio läuft eine Meldung über leerstehende Speicher, die über Nacht den Besitzer wechseln.' },
      ],
    },
  ],
  rueckfragen: [
    {
      frage: 'Gehört der Verkauf der Werfthalle am Nordkai zum Strang um Nordhaven oder ist er ein eigener Strang?',
      strang: 'nordhaven',
      belege: [{ kapitel: 'fassade', text: 'die Schlagzeile quer über der Titelseite: Werfthalle am Nordkai verkauft.' }],
    },
    {
      frage: 'Welcher Strang trägt die Haupthandlung: Pauls Arbeit für Nordhaven oder die Begegnungen?',
      strang: '',
      belege: [],
    },
  ],
};

const EN: DemoStraenge = {
  zuordnungen: [
    {
      strang: 'nordhaven',
      kapitel: 'radio-silence',
      zitat: 'the cardboard tube with the glass facades on the passenger seat',
      begruendung: 'Paul has the glass facades with him that Nordhaven demands.',
    },
    {
      strang: 'postcards',
      kapitel: 'lotte',
      zitat: 'Lotte pushes a postcard across the table to him.',
      begruendung: 'Another postcard turns up.',
      ungueltig: true,
    },
  ],
  neueStraenge: [
    {
      name: 'The old granary',
      rolle: 'neben',
      zweck: 'Paul measures and plans the old granary while empty granaries at the harbour are being sold.',
      kapitel: [
        { kapitel: 'floor-plan', zitat: 'On the long table in the kitchenette stands the model of the old granary, thirty centimetres tall, made of grey cardboard.' },
        { kapitel: 'dust', zitat: 'In the granary the dust of a hundred years lies on the floorboards.' },
        { kapitel: 'radio-silence', zitat: 'The radio is running a report about empty granaries changing hands overnight.' },
      ],
    },
  ],
  rueckfragen: [
    {
      frage: 'Does the sale of the shipyard hall on the North Quay belong to the Nordhaven plot line, or is it a plot line of its own?',
      strang: 'nordhaven',
      belege: [{ kapitel: 'facade', text: 'the headline right across the front page: Shipyard hall on the North Quay sold.' }],
    },
    {
      frage: 'Which plot line carries the main plot: Paul’s work for Nordhaven or the encounters?',
      strang: '',
      belege: [],
    },
  ],
};

export const demoStraenge: DemoAntwort = (ctx, anfrage) => {
  const d = ctx.sprache === 'en' ? EN : DE;
  const steht = (kapitel: string, text: string) => !!ctx.kapitel.find((k) => k.id === kapitel)?.text.includes(text);
  const strangDa = (id: string) => anfrage.aufgabe.includes(`(id: ${id})`);
  return {
    zuordnungen: d.zuordnungen
      .filter((z) => strangDa(z.strang) && (z.ungueltig || steht(z.kapitel, z.zitat)))
      .map(({ strang, kapitel, zitat, begruendung }) => ({ strang, kapitel, zitat, begruendung })),
    neueStraenge: d.neueStraenge
      .map((n) => ({ ...n, kapitel: n.kapitel.filter((k) => steht(k.kapitel, k.zitat)) }))
      .filter((n) => n.kapitel.length > 0),
    rueckfragen: d.rueckfragen
      .filter((f) => !f.strang || strangDa(f.strang))
      .map((f) => ({ ...f, belege: f.belege.filter((b) => steht(b.kapitel, b.text)) })),
  };
};
