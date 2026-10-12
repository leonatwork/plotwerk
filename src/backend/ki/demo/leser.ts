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
  const ids = new Set(ctx.kapitel.map((k) => k.id));
  const bekannt = (e: Eintrag) => imKontext(ctx, e);
  const weiss = WEISS.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));
  // Kapitel ohne Tabelleneintrag (z. B. neu geschriebene): erster Satz als Leserwissen
  for (const k of ctx.kapitel) {
    if (WEISS.some((e) => e.kapitel === k.id) || !k.text.trim()) continue;
    const erster = saetze(k.text)[0];
    if (erster) weiss.push({ text: `In Kap. ${k.nr} geht es weiter mit ${k.titel}.`, belege: [{ kapitel: k.id, text: erster }] });
  }
  const fragen = FRAGEN.filter(bekannt).map((e) => ({
    frage: e.text,
    belege: beleg(e),
    beantwortetIn: e.beantwortetIn && ids.has(e.beantwortetIn) ? e.beantwortetIn : '',
  }));
  const vermutungen = VERMUTUNGEN.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));
  const spannung = SPANNUNG.filter(bekannt).map((e) => ({ text: e.text, belege: beleg(e) }));

  const n = letztes(ctx);
  if (n) {
    // absichtlich ungültig: erfundenes Zitat und Formulierungsvorschlag (werden verworfen)
    vermutungen.push({ text: 'Paul kennt Lotte schon länger.', belege: [{ kapitel: n.id, text: 'Paul kennt Lotte seit der Schulzeit' }] });
    const s = saetze(n.text)[0];
    if (s) spannung.push({ text: 'Der Einstieg wäre besser mit einem Dialog.', belege: [{ kapitel: n.id, text: s }] });
  }

  const plan: unknown[] = [];
  for (const k of ctx.kapitel) {
    const planText = [k.plan.szene, k.plan.notiz].filter(Boolean).join(' ');
    if (!planText) continue;
    const bekannterPlan = PLAN[k.id];
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
        ? { kapitel: k.id, aussage, status: 'teilweise', erklaerung: 'Der Text deutet es an, sagt es aber nicht ausdrücklich.', belege: [{ kapitel: k.id, text: satz }] }
        : { kapitel: k.id, aussage, status: 'nicht_belegt', erklaerung: k.text.trim() ? 'Im Text des Kapitels findet die Leserin dazu nichts.' : 'Das Kapitel hat noch keinen Text.', belege: [] },
    );
    if (plan.length >= 12) break;
  }

  return { weiss: weiss.slice(-12), fragen: fragen.slice(-10), vermutungen: vermutungen.slice(-7), spannung: spannung.slice(-7), plan };
};
