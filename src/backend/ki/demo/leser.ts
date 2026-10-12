/**
 * Demo-Antwort für die Aufgabe „leser“ (G6 Leser-Simulation). Besitzer: G6 KI-Leser.
 * Registriert in ../demoAntworten/leser.ts.
 *
 * Alles wird aus dem mitgeschickten Kontext abgeleitet: Die Leser-Simulation sieht nur Kapitel 1..n und nennt nur
 * Einträge, deren Zitat wörtlich im Text dieser Kapitel steht (Fixture-Zitate). Absichtlich enthalten: eine Vermutung
 * mit erfundenem Zitat und ein Spannungspunkt mit Formulierungsvorschlag – die Prüfung in core/ki muss beide verwerfen.
 */
import type { DemoAntwort } from '../demoAntworten/typen';
import type { GelesenerKontext } from '@core/ki/index';

type Kap = GelesenerKontext['kapitel'][number];

interface Eintrag {
  text: string;
  kapitel: string;
  zitat: string;
}

interface DemoFrage extends Eintrag {
  /** in diesem Kapitel beantwortet (nur, wenn es mitgeschickt wurde) */
  beantwortetIn?: string;
}

/** Was eine Leserin nach dem jeweiligen Kapitel des Demo-Projekts weiß, fragt, ahnt. */
const WEISS: Eintrag[] = [
  { kapitel: 'grundriss', text: 'Paul und Ole arbeiten im selben Büro; Paul baut jedes Gebäude zuerst als Modell aus Pappe.', zitat: 'Paul erklärt, warum er jedes Gebäude zuerst aus Pappe baut' },
  { kapitel: 'fassade', text: 'Beim Nordhaven-Auftrag geht es um zwölf Millionen; Paul übernimmt die Glasfassade.', zitat: 'Paul sagt, er kümmert sich darum' },
  { kapitel: 'lotte', text: 'Paul trifft sich mit Lotte, die ihm einen Zeichentisch verkauft hat.', zitat: 'den er vor zwei Wochen über Kleinanzeigen gekauft hat' },
  { kapitel: 'staub', text: 'Paul lässt Nachrichten von Konrad und Nordhaven unbeantwortet.', zitat: 'vier davon von Konrad, eine von Nordhaven mit dem Betreff »Fassade, kurze Rückfrage«' },
  { kapitel: 'weissraum', text: 'Der Entwurf für Nordhaven ist noch ein leeres Blatt.', zitat: 'legt ein leeres Blatt vor sich' },
  { kapitel: 'ebbe', text: 'Paul belügt Vera: Einen Termin in Kopenhagen gibt es nicht.', zitat: 'Zu Hause schreibt er Vera, dass es keinen Termin in Kopenhagen gibt' },
  { kapitel: 'bis-bald', text: 'Paul wacht im Fährhaus auf und weiß nicht, wie er dorthin gekommen ist.', zitat: 'Er weiß nicht, wie er hierhergekommen ist' },
  { kapitel: 'bis-bald', text: 'In der Manteltasche findet Paul einen Messingschlüssel und eine Postkarte mit dem Leuchtturm.', zitat: 'findet er in der Manteltasche einen Messingschlüssel und eine Postkarte' },
  { kapitel: 'flut', text: 'Paul trifft Lotte; er ist zu früh dran und hat seine Bleistifte vergessen.', zitat: 'sehe Lotte lachend vor mir' },
  { kapitel: 'funkstille', text: 'Paul schläft seit zwei Nächten nicht mehr.', zitat: 'Er hat seit zwei Nächten nicht geschlafen' },
];

const FRAGEN: DemoFrage[] = [
  { kapitel: 'grundriss', text: 'Wie weit ist Paul mit dem Entwurf für Nordhaven?', zitat: 'Und was sagt Nordhaven zu so vielen Fenstern?', beantwortetIn: 'weissraum' },
  { kapitel: 'fassade', text: 'Wer hat die Werfthalle am Nordkai gekauft?', zitat: 'Werfthalle am Nordkai verkauft' },
  { kapitel: 'lotte', text: 'Wie verläuft das Treffen mit Lotte?', zitat: 'Bestell dir schon mal was, ich beeil mich.', beantwortetIn: 'flut' },
  { kapitel: 'staub', text: 'Warum zählt Paul die Fenster immer wieder?', zitat: 'Paul zählt sie einmal, dann noch einmal' },
  { kapitel: 'ebbe', text: 'Was ist mit Paul am Kai los?', zitat: 'Die Laterne an der Brücke flackert, geht aus, geht wieder an, und er rührt sich nicht' },
  { kapitel: 'bis-bald', text: 'Wer ist die Fremde?', zitat: 'Die Fremde auf der Bank gegenüber schläft noch' },
  { kapitel: 'bis-bald', text: 'Wozu gehört der Messingschlüssel?', zitat: 'einen Messingschlüssel' },
  { kapitel: 'flut', text: 'Warum hat Paul seine Bleistifte nicht dabei?', zitat: 'dass ich heute alle meine Bleistifte zu Hause gelassen habe' },
  { kapitel: 'funkstille', text: 'Wer steckt Paul die Postkarten in den Mantel?', zitat: 'In der Manteltasche steckt eine neue Postkarte, die er nicht hineingesteckt hat' },
  { kapitel: 'funkstille', text: 'Wer ist Fiete?', zitat: 'ob er die Krabben wieder für Fiete mitnimmt' },
];

const VERMUTUNGEN: Eintrag[] = [
  { kapitel: 'weissraum', text: 'Paul hat mit dem Entwurf noch nicht angefangen.', zitat: 'nur auf Pauls Tisch liegt nichts' },
  { kapitel: 'staub', text: 'Paul weicht dem Druck aus, statt zu reagieren.', zitat: 'Er dreht das Handy um, ohne sie zu öffnen' },
  { kapitel: 'bis-bald', text: 'Paul erinnert sich nicht an die Nacht.', zitat: 'Paul wacht auf einer Holzbank im Fährhaus auf' },
  { kapitel: 'funkstille', text: 'Jemand beobachtet Paul.', zitat: 'Paul hört Möwen und das Klatschen von Wasser, dann ist die Leitung tot' },
];

const SPANNUNG: Eintrag[] = [
  { kapitel: 'grundriss', text: 'Paul weicht der Frage nach Nordhaven aus.', zitat: 'Paul antwortet nicht sofort' },
  { kapitel: 'fassade', text: 'Der Zeitdruck beim Nordhaven-Auftrag ist hoch.', zitat: 'Konrad will die neuen Zeichnungen bis Monatsende sehen' },
  { kapitel: 'lotte', text: 'Paul kommt zum ersten Treffen zu spät.', zitat: 'dass die Brücke oben ist und er zu spät kommt' },
  { kapitel: 'ebbe', text: 'Paul bleibt am Kai wie erstarrt stehen.', zitat: 'und er rührt sich nicht' },
  { kapitel: 'funkstille', text: 'Die Postkarten kommen näher: Jemand wartet auf Paul.', zitat: 'Warum bist du nicht gekommen?' },
];

/** Plan-Abgleich für Kapitel des Demo-Projekts (aussage = Ausschnitt aus <plan>) */
const PLAN: Record<string, { aussage: string; status: 'belegt' | 'teilweise' | 'nicht_belegt'; erklaerung: string; zitat?: string }> = {
  grundriss: { aussage: 'Am Ende die Frage, was Nordhaven zu den Fenstern sagt', status: 'belegt', erklaerung: 'Ole stellt die Frage zum Schluss, Paul bleibt die Antwort schuldig.', zitat: 'Und was sagt Nordhaven zu so vielen Fenstern?' },
  fassade: { aussage: 'die Vorgabe kommt vom Aufsichtsrat', status: 'belegt', erklaerung: 'Konrad nennt den Aufsichtsrat ausdrücklich als Ursprung.', zitat: 'Die Vorgabe kommt vom Aufsichtsrat' },
  lotte: { aussage: 'Paul fährt selbst zum Lindenhof und kommt zu spät', status: 'belegt', erklaerung: 'Die Fahrt im Saab und die hochgeklappte Brücke stehen im Text.', zitat: 'fährt mit seinem alten Saab 900 zum Lindenhof' },
};

/** Englisches Demo-Projekt „Harbour Lights“ (fixtures/demo-projekt-en) */
const WEISS_EN: Eintrag[] = [
  { kapitel: 'floor-plan', text: 'Paul and Ole work in the same office, Paul builds every building as a cardboard model first.', zitat: 'Paul explains why he builds every building out of cardboard first' },
  { kapitel: 'facade', text: 'The Nordhaven job is worth twelve million, Paul takes on the glass facade.', zitat: 'Paul says he’ll take care of it' },
  { kapitel: 'lotte', text: 'Paul is meeting Lotte, who sold him a drawing table.', zitat: 'that he bought on Kleinanzeigen two weeks ago' },
  { kapitel: 'dust', text: 'Paul leaves messages from Konrad and Nordhaven unanswered.', zitat: 'four of them from Konrad, one from Nordhaven with the subject “Facade, quick question”' },
  { kapitel: 'white-space', text: 'The design for Nordhaven is still a blank sheet.', zitat: 'puts a blank sheet in front of him' },
  { kapitel: 'low-tide', text: 'Paul lies to Vera: there is no appointment in Copenhagen.', zitat: 'At home he writes to Vera that there is no appointment in Copenhagen' },
  { kapitel: 'see-you-soon', text: 'Paul wakes up in the ferry house and doesn’t know how he got there.', zitat: 'He doesn’t know how he got here' },
  { kapitel: 'see-you-soon', text: 'In his coat pocket Paul finds a brass key and a postcard of the lighthouse.', zitat: 'he finds a brass key and a postcard in his coat pocket' },
  { kapitel: 'high-tide', text: 'Paul meets Lotte, he is early and has forgotten his pencils.', zitat: 'see Lotte in front of me, laughing' },
  { kapitel: 'radio-silence', text: 'Paul hasn’t slept for two nights.', zitat: 'He hasn’t slept for two nights' },
];

const FRAGEN_EN: DemoFrage[] = [
  { kapitel: 'floor-plan', text: 'How far has Paul got with the design for Nordhaven?', zitat: 'And what does Nordhaven say to so many windows?', beantwortetIn: 'white-space' },
  { kapitel: 'facade', text: 'Who bought the shipyard hall on the North Quay?', zitat: 'Shipyard hall on the North Quay sold' },
  { kapitel: 'lotte', text: 'How does the meeting with Lotte go?', zitat: 'Go ahead and order something, I’ll hurry.', beantwortetIn: 'high-tide' },
  { kapitel: 'dust', text: 'Why does Paul keep counting the windows?', zitat: 'Paul counts them once, then once more' },
  { kapitel: 'low-tide', text: 'What is wrong with Paul on the quay?', zitat: 'The lamp on the bridge flickers, goes out, comes on again, and he doesn’t move' },
  { kapitel: 'see-you-soon', text: 'Who is the Stranger?', zitat: 'The Stranger on the bench opposite is still asleep' },
  { kapitel: 'see-you-soon', text: 'What does the brass key belong to?', zitat: 'a brass key' },
  { kapitel: 'high-tide', text: 'Why doesn’t Paul have his pencils with him?', zitat: 'that I’ve left all my pencils at home today' },
  { kapitel: 'radio-silence', text: 'Who keeps putting the postcards in Paul’s coat?', zitat: 'In his coat pocket there is a new postcard, one he didn’t put there' },
  { kapitel: 'radio-silence', text: 'Who is Fiete?', zitat: 'whether the shrimps are for Fiete again' },
];

const VERMUTUNGEN_EN: Eintrag[] = [
  { kapitel: 'white-space', text: 'Paul hasn’t started the design yet.', zitat: 'only Paul’s table is empty' },
  { kapitel: 'dust', text: 'Paul dodges the pressure instead of reacting.', zitat: 'He turns the phone over without opening it' },
  { kapitel: 'see-you-soon', text: 'Paul doesn’t remember the night.', zitat: 'Paul wakes up on a wooden bench in the ferry house' },
  { kapitel: 'radio-silence', text: 'Someone is watching Paul.', zitat: 'Paul hears gulls and the slap of water, then the line goes dead' },
];

const SPANNUNG_EN: Eintrag[] = [
  { kapitel: 'floor-plan', text: 'Paul dodges the question about Nordhaven.', zitat: 'Paul doesn’t answer straight away' },
  { kapitel: 'facade', text: 'The time pressure on the Nordhaven job is high.', zitat: 'Konrad wants to see the new drawings by the end of the month' },
  { kapitel: 'lotte', text: 'Paul is late for the first meeting.', zitat: 'that the bridge is up and he’ll be late' },
  { kapitel: 'low-tide', text: 'Paul stands frozen on the quay.', zitat: 'and he doesn’t move' },
  { kapitel: 'radio-silence', text: 'The postcards are coming closer: someone is waiting for Paul.', zitat: 'Why didn’t you come?' },
];

const PLAN_EN: typeof PLAN = {
  'floor-plan': { aussage: 'At the end the question of what Nordhaven says to the windows', status: 'belegt', erklaerung: 'Ole asks the question at the end, Paul owes him the answer.', zitat: 'And what does Nordhaven say to so many windows?' },
  facade: { aussage: 'the requirement comes from the supervisory board', status: 'belegt', erklaerung: 'Konrad explicitly names the supervisory board as the source.', zitat: 'The requirement comes from the supervisory board' },
  lotte: { aussage: 'Paul drives to the Lindenhof himself and is late', status: 'belegt', erklaerung: 'The drive in the Saab and the raised bridge are in the text.', zitat: 'drives his old Saab 900 to the Lindenhof' },
};

const TABELLEN = {
  de: {
    weiss: WEISS,
    fragen: FRAGEN,
    vermutungen: VERMUTUNGEN,
    spannung: SPANNUNG,
    plan: PLAN,
    weiter: (nr: number, titel: string) => `In Kap. ${nr} geht es weiter mit ${titel}.`,
    erfunden: { text: 'Paul kennt Lotte schon länger.', zitat: 'Paul kennt Lotte seit der Schulzeit' },
    dialog: 'Der Einstieg wäre besser mit einem Dialog.',
    teilweise: 'Der Text deutet es an, sagt es aber nicht ausdrücklich.',
    nichts: 'Im Text des Kapitels findet die Leserin dazu nichts.',
    ohneText: 'Das Kapitel hat noch keinen Text.',
  },
  en: {
    weiss: WEISS_EN,
    fragen: FRAGEN_EN,
    vermutungen: VERMUTUNGEN_EN,
    spannung: SPANNUNG_EN,
    plan: PLAN_EN,
    weiter: (nr: number, titel: string) => `Ch. ${nr} continues with ${titel}.`,
    erfunden: { text: 'Paul has known Lotte for longer.', zitat: 'Paul has known Lotte since school' },
    dialog: 'Better: the opening with a dialogue.',
    teilweise: 'The text hints at it but doesn’t say it explicitly.',
    nichts: 'The reader finds nothing about this in the chapter’s text.',
    ohneText: 'The chapter has no text yet.',
  },
};

/** Sätze eines Kapiteltexts (wörtliche Ausschnitte) */
export function saetze(text: string): string[] {
  const ergebnis: string[] = [];
  for (const absatz of text.split(/\n+/)) {
    for (const m of absatz.matchAll(/[^.!?…]+(?:[.!?…]+[“”"«»]?|$)/g)) {
      const s = m[0].trim();
      if (s.length > 3) ergebnis.push(s);
    }
  }
  return ergebnis;
}

function imKontext(ctx: GelesenerKontext, e: Eintrag): boolean {
  const k = ctx.kapitel.find((x) => x.id === e.kapitel);
  return !!k && k.text.includes(e.zitat);
}

const beleg = (e: Eintrag) => [{ kapitel: e.kapitel, text: e.zitat }];

function letztes(ctx: GelesenerKontext): Kap | undefined {
  return ctx.kapitel[ctx.kapitel.length - 1];
}

export const demoLeser: DemoAntwort = (ctx) => {
  const T = TABELLEN[ctx.sprache === 'en' ? 'en' : 'de'];
  const ids = new Set(ctx.kapitel.map((k) => k.id));
  const bekannt = (e: Eintrag) => imKontext(ctx, e);
  const weiss = T.weiss.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));
  // Kapitel ohne Tabelleneintrag (z. B. neu geschriebene): erster Satz als Leserwissen
  for (const k of ctx.kapitel) {
    if (T.weiss.some((e) => e.kapitel === k.id) || !k.text.trim()) continue;
    const erster = saetze(k.text)[0];
    if (erster) weiss.push({ text: T.weiter(k.nr, k.titel), belege: [{ kapitel: k.id, text: erster }] });
  }
  const fragen = T.fragen.filter(bekannt).map((e) => ({
    frage: e.text,
    belege: beleg(e),
    beantwortetIn: e.beantwortetIn && ids.has(e.beantwortetIn) ? e.beantwortetIn : '',
  }));
  const vermutungen = T.vermutungen.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));
  const spannung = T.spannung.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));

  const n = letztes(ctx);
  if (n) {
    // absichtlich ungültig: erfundenes Zitat und Formulierungsvorschlag (werden verworfen)
    vermutungen.push({ text: T.erfunden.text, belege: [{ kapitel: n.id, text: T.erfunden.zitat }] });
    const s = saetze(n.text)[0];
    if (s) spannung.push({ text: T.dialog, belege: [{ kapitel: n.id, text: s }] });
  }

  const plan: unknown[] = [];
  for (const k of ctx.kapitel) {
    const planText = [k.plan.szene, k.plan.notiz].filter(Boolean).join(' ');
    if (!planText) continue;
    const bekannterPlan = T.plan[k.id];
    if (bekannterPlan && planText.includes(bekannterPlan.aussage) && (!bekannterPlan.zitat || k.text.includes(bekannterPlan.zitat))) {
      plan.push({
        kapitel: k.id,
        aussage: bekannterPlan.aussage,
        status: bekannterPlan.status,
        erklaerung: bekannterPlan.erklaerung,
        belege: bekannterPlan.zitat ? [{ kapitel: k.id, text: bekannterPlan.zitat }] : [],
      });
      continue;
    }
    // sonst: Szene aus dem Plan; ein längeres Wort daraus im Text = teilweise belegt
    const aussage = k.plan.szene || k.plan.notiz;
    const woerter = aussage.split(/[^\p{L}]+/u).filter((w) => w.length >= 6);
    const satz = saetze(k.text).find((x) => woerter.some((w) => x.toLocaleLowerCase('de').includes(w.toLocaleLowerCase('de'))));
    plan.push(
      satz
        ? { kapitel: k.id, aussage, status: 'teilweise', erklaerung: T.teilweise, belege: [{ kapitel: k.id, text: satz }] }
        : { kapitel: k.id, aussage, status: 'nicht_belegt', erklaerung: k.text.trim() ? T.nichts : T.ohneText, belege: [] },
    );
    if (plan.length >= 12) break;
  }

  return { weiss: weiss.slice(-12), fragen: fragen.slice(-10), vermutungen: vermutungen.slice(-7), spannung: spannung.slice(-7), plan };
};
