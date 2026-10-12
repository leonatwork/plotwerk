/**
 * Demo-Antworten für die Aufgaben „zeit“ und „zustand“ (G1 Zeit & Zustand). Besitzer: G1.
 * Registriert in ../demoAntworten/zeit.ts. Alle echten Zitate sind wörtliche Ausschnitte der Fixture-Kapitel;
 * sie werden nur geliefert, wenn sie im mitgeschickten Kontext stehen und das Kapitel zum Auftrag gehört.
 * Absichtlich enthalten: ein erfundenes Zitat, ein Formulierungsvorschlag und eine Uhrzeit, die nicht zur
 * Tageszeit passt – die Auswertung in core/ki/zeit.ts muss alle drei verwerfen.
 */
import type { DemoAnfrage, DemoAntwort } from '../demoAntworten/typen';

interface Zitat {
  kapitel: string;
  text: string;
}

interface ZeitEintrag {
  kapitel: string;
  /** Szene (1-basiert), nur wenn der Auftrag das Kapitel in Szenen teilt */
  szene?: number;
  tag?: string;
  wochentag?: string;
  datum?: string;
  tageszeit?: string;
  uhrzeit?: string;
  dauer?: number;
  sicherheit: 'fest' | 'ungefaehr';
  belege: Zitat[];
  begruendung: string;
  /** absichtlich ungültig (Test der Antwortprüfung) – wird ohne Fundprüfung geliefert */
  ungueltig?: boolean;
}

interface ZustandEintrag {
  kapitel: string;
  szene?: number;
  zustand: string;
  belege: Zitat[];
  begruendung: string;
  ungueltig?: boolean;
}

const z = (kapitel: string, text: string): Zitat => ({ kapitel, text });

const ZEITPUNKTE: ZeitEintrag[] = [
  {
    kapitel: 'grundriss',
    tag: '1',
    tageszeit: 'vormittags',
    sicherheit: 'ungefaehr',
    belege: [z('grundriss', 'Paul schneidet mit dem Skalpell das letzte Fenster aus.')],
    begruendung: 'Kap. 1 eröffnet die Handlung in der Teeküche des Büros; der Arbeitstag hat gerade begonnen.',
  },
  {
    kapitel: 'fassade',
    tag: '1',
    tageszeit: 'vormittags',
    sicherheit: 'ungefaehr',
    belege: [z('fassade', 'Im Zeichensaal hängen die Pläne schon an der Glaswand, als Paul hereinkommt.')],
    begruendung: 'Die Besprechung im Büro schließt an Oles Frage nach Nordhaven aus Kap. 1 an; ein Tageswechsel wird nicht erwähnt.',
  },
  {
    kapitel: 'lotte',
    tageszeit: 'abends',
    sicherheit: 'ungefaehr',
    belege: [z('lotte', 'um halb acht am Lindenhof')],
    begruendung: 'Paul ist mit Lotte um halb acht verabredet.',
  },
  {
    kapitel: 'staub',
    tag: '5',
    wochentag: 'samstag',
    sicherheit: 'fest',
    belege: [z('staub', 'Es ist Samstagmorgen im Kornspeicher.')],
    begruendung: 'Der Text nennt den Samstag.',
    ungueltig: true,
  },
  {
    kapitel: 'ebbe',
    szene: 1,
    tag: '8',
    tageszeit: 'nachts',
    uhrzeit: '23:00',
    sicherheit: 'fest',
    belege: [z('ebbe', 'Gegen elf sagt er, er müsse morgen früh für Ole nach Kopenhagen.')],
    begruendung: 'Der Text nennt die Uhrzeit; das Abendessen liegt am Abend nach dem Bürotag aus Kap. 6.',
  },
  {
    kapitel: 'ebbe',
    szene: 2,
    tag: '8',
    tageszeit: 'nachts',
    sicherheit: 'ungefaehr',
    belege: [z('ebbe', 'Gegen elf sagt er'), z('ebbe', 'Am Kai ist Ebbe, die Boote liegen schief im Schlick.')],
    begruendung: 'Die Szene am Kai folgt unmittelbar auf das Ende des Abendessens gegen elf.',
  },
  {
    kapitel: 'ebbe',
    szene: 3,
    tageszeit: 'morgens',
    uhrzeit: '23:30',
    sicherheit: 'ungefaehr',
    belege: [z('ebbe', 'Zu Hause schreibt er Vera, dass es keinen Termin in Kopenhagen gibt.')],
    begruendung: 'Paul ist nach dem Kai zu Hause.',
    ungueltig: true,
  },
  {
    kapitel: 'bis-bald',
    tag: '9',
    tageszeit: 'morgens',
    sicherheit: 'ungefaehr',
    belege: [z('bis-bald', 'Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.'), z('bis-bald', 'An der Theke bestellt er einen Earl Grey.')],
    begruendung: 'Paul wacht nach der Nacht aus Kap. 7 auf, die erste Fähre läuft aus – der Morgen danach.',
  },
  {
    kapitel: 'funkstille',
    tag: '11',
    wochentag: 'donnerstag',
    sicherheit: 'fest',
    belege: [z('funkstille', 'Heute ist Donnerstag.'), z('weissraum', 'Am Montag ist im Büro jeder Zeichentisch voller Papierrollen und Kaffeebecher')],
    begruendung: 'Der Text nennt den Donnerstag. Spielt Kap. 6 an einem Montag (Tag 8), ist der Donnerstag danach Tag 11.',
  },
  {
    kapitel: 'flut',
    tageszeit: 'nachmittags',
    sicherheit: 'ungefaehr',
    belege: [z('flut', 'Am Bootsverleih gegenüber verhandelt ein Vater mit seiner Tochter')],
    begruendung: 'Besser wäre hier ein Satz mit Uhrzeit, etwa: „Es ist drei Uhr nachmittags.“',
    ungueltig: true,
  },
];

const ZUSTAENDE: Record<string, ZustandEintrag[]> = {
  paul: [
    {
      kapitel: 'grundriss',
      zustand: 'ausgeruht',
      belege: [z('grundriss', 'Paul erklärt, warum er jedes Gebäude zuerst aus Pappe baut.')],
      begruendung: 'Paul erklärt in der Teeküche ruhig und anschaulich, wie er arbeitet.',
    },
    {
      kapitel: 'ebbe',
      szene: 1,
      zustand: 'erschoepft',
      belege: [z('ebbe', 'Paul gähnt zum dritten Mal.')],
      begruendung: 'Paul ist im Restaurant müde.',
      ungueltig: true,
    },
    {
      kapitel: 'bis-bald',
      zustand: 'verwirrt',
      belege: [z('bis-bald', 'Er weiß nicht, wie er hierhergekommen ist.'), z('bis-bald', 'irgendwo tutet die erste Fähre')],
      begruendung: 'Paul wacht an einem ungewohnten Ort auf und weiß nicht, wie er dorthin gekommen ist.',
    },
    {
      kapitel: 'funkstille',
      zustand: 'schlaflos',
      belege: [z('funkstille', 'Er hat seit zwei Nächten nicht geschlafen.')],
      begruendung: 'Paul hat seit zwei Nächten nicht geschlafen.',
    },
  ],
};

/** Englisches Demo-Projekt „Harbour Lights“ (fixtures/demo-projekt-en) */
const ZEITPUNKTE_EN: ZeitEintrag[] = [
  {
    kapitel: 'floor-plan',
    tag: '1',
    tageszeit: 'vormittags',
    sicherheit: 'ungefaehr',
    belege: [z('floor-plan', 'Paul cuts out the last window with the scalpel.')],
    begruendung: 'Ch. 1 opens the action in the office kitchenette, the working day has just begun.',
  },
  {
    kapitel: 'facade',
    tag: '1',
    tageszeit: 'vormittags',
    sicherheit: 'ungefaehr',
    belege: [z('facade', 'In the drawing studio the plans are already hanging on the glass wall when Paul comes in.')],
    begruendung: 'The meeting at the office follows on from Ole’s question about Nordhaven in Ch. 1, no change of day is mentioned.',
  },
  {
    kapitel: 'lotte',
    tageszeit: 'abends',
    sicherheit: 'ungefaehr',
    belege: [z('lotte', 'half past seven at the Lindenhof')],
    begruendung: 'Paul is meeting Lotte at half past seven.',
  },
  {
    kapitel: 'dust',
    tag: '5',
    wochentag: 'samstag',
    sicherheit: 'fest',
    belege: [z('dust', 'It is Saturday morning in the granary.')],
    begruendung: 'The text names the Saturday.',
    ungueltig: true,
  },
  {
    kapitel: 'low-tide',
    szene: 1,
    tag: '8',
    tageszeit: 'nachts',
    uhrzeit: '23:00',
    sicherheit: 'fest',
    belege: [z('low-tide', 'Around eleven he says he has to go to Copenhagen for Ole early tomorrow morning.')],
    begruendung: 'The text names the time, the dinner is on the evening after the office day from Ch. 6.',
  },
  {
    kapitel: 'low-tide',
    szene: 2,
    tag: '8',
    tageszeit: 'nachts',
    sicherheit: 'ungefaehr',
    belege: [z('low-tide', 'Around eleven he says'), z('low-tide', 'At the quay the tide is out, the boats lie lopsided in the mud.')],
    begruendung: 'The scene on the quay follows immediately after the end of dinner around eleven.',
  },
  {
    kapitel: 'low-tide',
    szene: 3,
    tageszeit: 'morgens',
    uhrzeit: '23:30',
    sicherheit: 'ungefaehr',
    belege: [z('low-tide', 'At home he writes to Vera that there is no appointment in Copenhagen.')],
    begruendung: 'Paul is at home after the quay.',
    ungueltig: true,
  },
  {
    kapitel: 'see-you-soon',
    tag: '9',
    tageszeit: 'morgens',
    sicherheit: 'ungefaehr',
    belege: [z('see-you-soon', 'Paul wakes up on a wooden bench in the ferry house, his head against the cold window.'), z('see-you-soon', 'At the counter he orders an Earl Grey.')],
    begruendung: 'Paul wakes up after the night from Ch. 7, the first ferry is leaving – the morning after.',
  },
  {
    kapitel: 'radio-silence',
    tag: '11',
    wochentag: 'donnerstag',
    sicherheit: 'fest',
    belege: [z('radio-silence', 'Today is Thursday.'), z('white-space', 'On Monday every drawing table in the office is covered in paper rolls and coffee cups')],
    begruendung: 'The text names the Thursday. If Ch. 6 takes place on a Monday (day 8), the following Thursday is day 11.',
  },
  {
    kapitel: 'high-tide',
    tageszeit: 'nachmittags',
    sicherheit: 'ungefaehr',
    belege: [z('high-tide', 'At the boat hire opposite, a father is negotiating with his daughter')],
    begruendung: 'Better: a sentence with a time here, such as “It is three in the afternoon.”',
    ungueltig: true,
  },
];

const ZUSTAENDE_EN: Record<string, ZustandEintrag[]> = {
  paul: [
    {
      kapitel: 'floor-plan',
      zustand: 'rested',
      belege: [z('floor-plan', 'Paul explains why he builds every building out of cardboard first.')],
      begruendung: 'Paul explains calmly and vividly in the kitchenette how he works.',
    },
    {
      kapitel: 'low-tide',
      szene: 1,
      zustand: 'exhausted',
      belege: [z('low-tide', 'Paul yawns for the third time.')],
      begruendung: 'Paul is tired at the restaurant.',
      ungueltig: true,
    },
    {
      kapitel: 'see-you-soon',
      zustand: 'confused',
      belege: [z('see-you-soon', 'He doesn’t know how he got here.'), z('see-you-soon', 'somewhere the first ferry sounds its horn')],
      begruendung: 'Paul wakes up in an unfamiliar place and doesn’t know how he got there.',
    },
    {
      kapitel: 'radio-silence',
      zustand: 'sleepless',
      belege: [z('radio-silence', 'He hasn’t slept for two nights.')],
      begruendung: 'Paul hasn’t slept for two nights.',
    },
  ],
};

/** Kapitel-IDs und Szenen-Teilung aus dem Aufgabentext („- Kap. 7 (id: ebbe) · 3 Szenen …“ / „- Ch. 7 (id: low-tide) · 3 scenes …“) */
function auftragAus(anfrage: DemoAnfrage): { kapitel: Set<string>; geteilt: Set<string> } {
  const kapitel = new Set<string>();
  const geteilt = new Set<string>();
  for (const m of anfrage.aufgabe.matchAll(/^- (?:Kap|Ch)\. \d+ \(id: ([^)]+)\) · (.*)$/gm)) {
    kapitel.add(m[1]!);
    if (/Szenen|scenes/.test(m[2] ?? '')) geteilt.add(m[1]!);
  }
  return { kapitel, geteilt };
}

function passend<T extends { kapitel: string; szene?: number; belege: Zitat[]; ungueltig?: boolean }>(
  liste: T[],
  ctx: Parameters<DemoAntwort>[0],
  anfrage: DemoAnfrage,
): T[] {
  const { kapitel, geteilt } = auftragAus(anfrage);
  const steht = (q: Zitat) => !!ctx.kapitel.find((k) => k.id === q.kapitel)?.text.includes(q.text);
  return liste.filter(
    (e) => kapitel.has(e.kapitel) && (e.szene === undefined || geteilt.has(e.kapitel)) && (e.ungueltig || e.belege.every(steht)),
  );
}

export const demoZeit: DemoAntwort = (ctx, anfrage) => ({
  zeitpunkte: passend(ctx.sprache === 'en' ? ZEITPUNKTE_EN : ZEITPUNKTE, ctx, anfrage).map((e) => ({
    kapitel: e.kapitel,
    szene: e.szene ?? 0,
    tag: e.tag ?? '',
    wochentag: e.wochentag ?? '',
    datum: e.datum ?? '',
    tageszeit: e.tageszeit ?? '',
    uhrzeit: e.uhrzeit ?? '',
    dauer: e.dauer ?? 0,
    sicherheit: e.sicherheit,
    belege: e.belege,
    begruendung: e.begruendung,
  })),
});

export const demoZustand: DemoAntwort = (ctx, anfrage) => ({
  zustaende: passend((ctx.sprache === 'en' ? ZUSTAENDE_EN : ZUSTAENDE)[anfrage.attribute.figur ?? ''] ?? [], ctx, anfrage).map((e) => ({
    kapitel: e.kapitel,
    szene: e.szene ?? 0,
    zustand: e.zustand,
    belege: e.belege,
    begruendung: e.begruendung,
  })),
});
