/**
 * KI-Transport für die Browser-Demo (ohne Netz). Besitzer: KI.
 *
 * Antwortet deterministisch im echten Messages-API-Format. Alles wird aus dem Request abgeleitet
 * (Buchkontext + Aufgabe), alle Zitate sind wörtliche Ausschnitte der mitgeschickten Kapiteltexte.
 * Absichtlich enthalten: je ein Hinweis mit erfundenem Zitat, einer mit Ersatztext und ein
 * Widerspruch zu einer bewusst vagen Figur – die Antwortprüfung in core/ki muss sie verwerfen.
 */
import { KiFehler, leseAufgabenKopf, leseBuchKontext, type GelesenerKontext, type KiTransport } from '@core/ki/index';
import { texte } from '../../i18n';
import { demoAntwortFuer } from './demoAntworten/index';

type Kap = GelesenerKontext['kapitel'][number];

interface RohZitat {
  kapitel: string;
  text: string;
}

interface RohHinweis {
  typ: string;
  titel: string;
  zitate: RohZitat[];
  erklaerung: string;
  plan?: { figur: string; kapitel: string; feld: string };
}

interface Regel {
  hinweis: RohHinweis;
  /** lose Enden, die dieser Hinweis in Kapiteln eröffnet/aufgreift */
  faeden?: { kapitel: string; name: string; eroeffnet: boolean }[];
}

export interface DemoKiOptionen {
  /** künstliche Wartezeit je Anfrage (Fortschrittsanzeige sichtbar machen), Standard 350 ms */
  verzoegerungMs?: number;
}

// ---------------------------------------------------------------------------
// Text-Hilfen
// ---------------------------------------------------------------------------

/** Sätze als wörtliche Ausschnitte (Absätze getrennt). */
function saetze(text: string): string[] {
  const ergebnis: string[] = [];
  for (const absatz of text.split(/\n+/)) {
    for (const m of absatz.matchAll(/[^.!?…]+(?:[.!?…]+[“”"«»]?|$)/g)) {
      const s = m[0].trim();
      if (s) ergebnis.push(s);
    }
  }
  return ergebnis;
}

interface TeilsatzOptionen {
  /** am letzten „ und “ vor der Fundstelle beginnen */
  undVorne?: boolean;
  /** am nächsten „ und “ nach der Fundstelle enden */
  undHinten?: boolean;
  /** einleitendes „Beim …“ weglassen */
  ohneEinleitung?: boolean;
}

/** Satzteil um eine Fundstelle (Grenzen: Komma, Semikolon, Doppelpunkt, Gedankenstrich). */
function teilsatz(satz: string, pos: number, laenge: number, opt: TeilsatzOptionen = {}): string {
  let a = 0;
  let e = satz.length;
  for (const m of satz.matchAll(/[,;:]\s+|\s[–—]\s+/g)) {
    const i = m.index ?? 0;
    if (i + m[0].length <= pos) a = i + m[0].length;
    else if (i >= pos + laenge) {
      e = i;
      break;
    }
  }
  if (opt.undVorne) {
    const u = satz.lastIndexOf(' und ', pos);
    if (u >= a) a = u + 5;
  }
  if (opt.undHinten) {
    const u = satz.indexOf(' und ', pos + laenge);
    if (u >= 0 && u < e) e = u;
  }
  if (opt.ohneEinleitung) {
    const m = /^Beim \p{Lu}\p{Ll}+ /u.exec(satz.slice(a));
    if (m && a + m[0].length <= pos) a += m[0].length;
  }
  const ganz = a === 0 && e === satz.length;
  const s = satz.slice(a, e).replace(/^[\s„“”"«»]+/u, '');
  return ganz ? s.trim() : s.replace(/[\s.!?…„“”"«»]+$/u, '');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wortRegex(wort: string, flags = 'u'): RegExp {
  return new RegExp(`(?<![\\p{L}])${escape(wort)}(?:s)?(?![\\p{L}])`, flags);
}

function kuerze(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')} …`;
}

/** erster Satz mit dem Muster → Satzteil um den Treffer */
function stelle(k: Kap, muster: RegExp, opt: TeilsatzOptionen = {}): { zitat: string; treffer: string } | null {
  for (const s of saetze(k.text)) {
    const m = muster.exec(s);
    if (m) return { zitat: teilsatz(s, m.index, m[0].length, opt), treffer: m[0] };
  }
  return null;
}

function bekannteWoerter(ctx: GelesenerKontext): Set<string> {
  const namen = [
    ...ctx.figuren.flatMap((f) => [f.name, ...f.aliase]),
    ...ctx.orte.flatMap((o) => [o.name, ...o.aliase]),
    ...ctx.gruppen.map((g) => g.name),
  ];
  return new Set(namen.flatMap((n) => n.split(/\s+/)).map((w) => w.toLocaleLowerCase('de')));
}

function nenntFigur(k: Kap, f: GelesenerKontext['figuren'][number]): boolean {
  return [f.name, ...f.aliase].some((n) => wortRegex(n, 'iu').test(k.text));
}

// ---------------------------------------------------------------------------
// Regeln für die Prüfung
// ---------------------------------------------------------------------------

function unbekannteNamen(ctx: GelesenerKontext): { kapitel: Kap; name: string; zitat: string }[] {
  const bekannt = bekannteWoerter(ctx);
  const ergebnis: { kapitel: Kap; name: string; zitat: string }[] = [];
  for (const k of ctx.kapitel) {
    for (const s of saetze(k.text)) {
      for (const m of s.matchAll(/(?<![\p{L}])für (\p{Lu}\p{Ll}+)(?![\p{L}])/gu)) {
        const name = m[1] ?? '';
        if (bekannt.has(name.toLocaleLowerCase('de')) || ergebnis.some((e) => e.name === name)) continue;
        ergebnis.push({ kapitel: k, name, zitat: teilsatz(s, m.index ?? 0, m[0].length) });
      }
    }
  }
  return ergebnis;
}

function regeln(ctx: GelesenerKontext): Regel[] {
  const liste: Regel[] = [];
  const buch = ctx.kapitel.map((k) => k.text).join('\n');

  for (const u of unbekannteNamen(ctx)) {
    const anzahl = buch.match(new RegExp(wortRegex(u.name).source, 'gu'))?.length ?? 1;
    liste.push({
      hinweis: {
        typ: 'unbekannt',
        titel: `»${u.name}« ist keiner Figur zugeordnet`,
        zitate: [{ kapitel: u.kapitel.id, text: u.zitat }],
        erklaerung:
          anzahl === 1
            ? `Der Name ${u.name} kommt nur hier vor und gehört zu keiner angelegten Figur.`
            : `Der Name ${u.name} kommt ${anzahl}-mal vor und gehört zu keiner angelegten Figur.`,
      },
      faeden: [{ kapitel: u.kapitel.id, name: `»${u.name}«`, eroeffnet: true }],
    });
  }

  const karten = ctx.kapitel
    .map((k) => ({ k, st: stelle(k, /Postkarte/, { ohneEinleitung: true }) }))
    .filter((x) => x.st && /Manteltasche/.test(x.st.zitat));
  const erster = karten[0];
  const letzter = karten[karten.length - 1];
  if (erster && letzter && erster !== letzter && erster.st && letzter.st) {
    liste.push({
      hinweis: {
        typ: 'offener_faden',
        titel: 'Wer steckt die zweite Postkarte in Pauls Mantel?',
        zitate: [
          { kapitel: erster.k.id, text: erster.st.zitat },
          { kapitel: letzter.k.id, text: letzter.st.zitat },
        ],
        erklaerung: `Die erste Postkarte taucht in Kap. ${erster.k.nr} auf, eine weitere in Kap. ${letzter.k.nr}. Woher die zweite kommt, bleibt bisher unbeantwortet.`,
      },
      faeden: karten.map((z, i) => ({ kapitel: z.k.id, name: 'Die Postkarten in der Manteltasche', eroeffnet: i === 0 })),
    });
  }

  const fahrzeug = /(?<![\p{L}])(Saab|Volvo|Auto|Wagen)(?![\p{L}])/u;
  const spaet = ctx.kapitel.map((k) => ({ k, st: stelle(k, /zu spät/, { undHinten: true }) })).filter((x) => x.st);
  const frueh = ctx.kapitel.map((k) => ({ k, st: stelle(k, /zu früh/, { undHinten: true }) })).filter((x) => x.st);
  for (const a of spaet) {
    for (const b of frueh) {
      if (a.k.id === b.k.id || !a.st || !b.st) continue;
      const figur = ctx.figuren.find((f) => nenntFigur(a.k, f) && nenntFigur(b.k, f) && !/bewusst vage/.test(f.existenz));
      if (!figur) continue;
      const fa = stelle(a.k, fahrzeug, { undVorne: true });
      const fb = stelle(b.k, fahrzeug, { undVorne: true });
      const zitate: RohZitat[] = [
        { kapitel: a.k.id, text: fa?.zitat ?? a.st.zitat },
        { kapitel: b.k.id, text: b.st.zitat },
      ];
      const wagen = fa && fb ? ` (Kap. ${a.k.nr}: ${fa.treffer}, Kap. ${b.k.nr}: ${fb.treffer})` : '';
      liste.push({
        hinweis: {
          typ: 'pruefen',
          titel: `Treffen mit ${figur.name}: zu spät oder zu früh?`,
          zitate,
          erklaerung: `In Kap. ${a.k.nr} kommt der Erzähler zu spät zum Treffen mit ${figur.name}, in Kap. ${b.k.nr} ist er viel zu früh da, und er kommt jeweils anders an${wagen}. Wenn beide Kapitel dasselbe Treffen meinen, widersprechen sich die Angaben.`,
        },
      });
    }
  }

  const tage = ctx.kapitel
    .map((k) => ({ k, st: stelle(k, /(?<![\p{L}])(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(?![\p{L}])/u) }))
    .filter((x) => x.st);
  if (tage.length > 0) {
    const namen = tage.map((t) => t.st!.treffer);
    liste.push({
      hinweis: {
        typ: 'zeitleiste',
        titel: `Nur ${namen.join(' und ')} ${namen.length === 1 ? 'ist' : 'sind'} verankert`,
        zitate: tage.map((t) => ({ kapitel: t.k.id, text: t.st!.zitat })),
        erklaerung: `Nur ${tage.map((t) => `Kap. ${t.k.nr}`).join(' und ')} ${tage.length === 1 ? 'nennt' : 'nennen'} einen Wochentag. Die Abstände zwischen den übrigen Kapiteln sind offen.`,
      },
    });
  }

  for (const k of ctx.kapitel) {
    const st = stelle(k, /(?<=\p{Ll}\s)Sie(?![\p{L}])/u);
    if (!st) continue;
    liste.push({
      hinweis: {
        typ: 'sprache',
        titel: 'Großgeschriebenes „Sie“ mitten im Satz',
        zitate: [{ kapitel: k.id, text: st.zitat }],
        erklaerung: `In Kap. ${k.nr} steht „Sie“ großgeschrieben mitten im Satz. Gemeint ist offenbar eine dritte Person, keine Anrede.`,
      },
    });
  }

  // F-05: Planung einer Figur gegen den Text (geplant ohne Alkohol, im Text ein Aperol Spritz).
  for (const f of ctx.figuren.filter((x) => !/bewusst vage/.test(x.existenz))) {
    const feld = f.plan.find((p) => /alkohol/i.test(p.feld) && /(?<![\p{L}])(nein|kein|keinen|nicht)(?![\p{L}])/iu.test(p.wert));
    if (!feld) continue;
    for (const k of ctx.kapitel) {
      const st = stelle(k, /(?<![\p{L}])(Aperol|Wein|Bier|Sekt|Schnaps)(?![\p{L}])/u, { undHinten: true });
      if (!st) continue;
      liste.push({
        hinweis: {
          typ: 'pruefen',
          titel: `${f.name} trinkt Alkohol – laut Planung nicht`,
          zitate: [{ kapitel: k.id, text: st.zitat }],
          erklaerung: `In der Planung von ${f.name} steht unter „${feld.feld}“: ${feld.wert}. In Kap. ${k.nr} bestellt der Erzähler ein alkoholisches Getränk.`,
          plan: { figur: f.id, kapitel: '', feld: feld.feld },
        },
      });
      break;
    }
  }

  // Absichtlich ungültig: Widerspruch zu einer bewusst vagen Figur (harte Regel 4).
  for (const f of ctx.figuren.filter((x) => /bewusst vage/.test(x.existenz))) {
    const k = ctx.kapitel.find((x) => nenntFigur(x, f));
    const st = k ? stelle(k, new RegExp(escape(f.name), 'iu')) : null;
    if (!k || !st) continue;
    liste.push({
      hinweis: {
        typ: 'pruefen',
        titel: `${f.name}: widersprüchliche Angaben?`,
        zitate: [{ kapitel: k.id, text: st.zitat }],
        erklaerung: `Es bleibt widersprüchlich, wer ${f.name} ist und was in dieser Nacht passiert.`,
      },
    });
  }

  // Absichtlich ungültig: erfundenes Zitat und Ersatztext (harte Regeln 2 und 3).
  const dialog = ctx.kapitel
    .map((k) => ({ k, m: /„([^“"„]{8,})[“"]/.exec(k.text) }))
    .find((x) => x.m && ctx.figuren.some((f) => nenntFigur(x.k, f)));
  if (dialog?.m) {
    const figur = ctx.figuren.find((f) => nenntFigur(dialog.k, f));
    liste.push({
      hinweis: {
        typ: 'pruefen',
        titel: `Verlässt ${figur?.name ?? 'die Figur'} den Raum zweimal?`,
        zitate: [{ kapitel: dialog.k.id, text: `${figur?.name ?? 'Er'} lacht laut und verlässt den Raum` }],
        erklaerung: 'Die Figur verlässt den Raum, ist im nächsten Absatz aber noch da.',
      },
    });
    liste.push({
      hinweis: {
        typ: 'sprache',
        titel: 'Frage wirkt hölzern',
        zitate: [{ kapitel: dialog.k.id, text: dialog.m[1] ?? '' }],
        erklaerung: 'Besser: „Und, wie läuft es so?“ – formuliere die Frage stattdessen beiläufiger.',
      },
    });
  }
  return liste;
}

function analyse(k: Kap, ctx: GelesenerKontext, alle: Regel[]) {
  const s = saetze(k.text);
  const vage = k.realitaet.some((r) => /bewusst vage/.test(r.stufe));
  const gruppen = ctx.gruppen.filter((g) => wortRegex(g.name).test(k.text)).map((g) => g.name);
  const loseEnden = alle.flatMap((r) => r.faeden ?? []).filter((f) => f.kapitel === k.id).map(({ name, eroeffnet }) => ({ name, eroeffnet }));
  return {
    kapitel: k.id,
    zusammenfassung: [s.slice(0, 2).join(' '), vage ? 'Was genau geschieht, bleibt bewusst in der Schwebe.' : ''].filter(Boolean).join(' '),
    kurz: kuerze(s[0] ?? '', 90),
    wendung: s.length > 2 ? (s[s.length - 1] ?? 'Keine.') : 'Keine.',
    antagonistenBezug: gruppen.length ? `${gruppen.join(', ')} ${gruppen.length === 1 ? 'taucht' : 'tauchen'} im Kapitel auf.` : '–',
    loseEnden,
  };
}

function pruefAntwort(ctx: GelesenerKontext, ids: string[]) {
  const alle = regeln(ctx);
  const hinweise = alle.filter((r) => r.hinweis.zitate.some((z) => ids.includes(z.kapitel))).map((r) => r.hinweis);
  const analysen = ctx.kapitel.filter((k) => ids.includes(k.id)).map((k) => analyse(k, ctx, alle));
  return { hinweise, analysen };
}

// ---------------------------------------------------------------------------
// Erwähnungen (Haiku)
// ---------------------------------------------------------------------------

function erwaehnungsAntwort(ctx: GelesenerKontext, id: string) {
  const k = ctx.kapitel.find((x) => x.id === id);
  const vorschlaege: { text: string; zitat: string; zielTyp: string; zielId: string; begruendung: string }[] = [];
  if (!k) return { vorschlaege };
  for (const u of unbekannteNamen(ctx).filter((x) => x.kapitel.id === id)) {
    vorschlaege.push({ text: u.name, zitat: u.zitat, zielTyp: 'unbekannte_figur', zielId: '', begruendung: `»${u.name}« wird genannt, gehört aber zu keiner angelegten Figur.` });
  }
  const personen = /(?<![\p{L}])(?:[Dd]er|[Dd]ie) (?:Mann|Frau|Kollege|Kollegin|Chef|Chefin|Kunde|Kundin|Kellner|Kellnerin|Fahrer|Fahrerin)(?: am \p{Lu}\p{Ll}+)?(?![\p{L}])/gu;
  for (const s of saetze(k.text)) {
    for (const m of s.matchAll(personen)) {
      vorschlaege.push({
        text: m[0],
        zitat: teilsatz(s, m.index ?? 0, m[0].length),
        zielTyp: 'unbekannte_figur',
        zielId: '',
        begruendung: 'Eine Person ohne Namen, die keiner angelegten Figur entspricht.',
      });
    }
  }
  const ziele = [...ctx.orte.map((o) => ({ ...o, typ: 'ort' })), ...ctx.figuren.map((f) => ({ ...f, typ: 'figur' }))];
  for (const z of ziele) {
    if (z.name.length < 6 || /\s/.test(z.name)) continue;
    const muster = new RegExp(`(?<![\\p{L}])${[...z.name].map(escape).join('[ -]?')}(?![\\p{L}])`, 'giu');
    for (const s of saetze(k.text)) {
      for (const m of s.matchAll(muster)) {
        if (m[0] === z.name || [z.name, ...z.aliase].includes(m[0])) continue;
        vorschlaege.push({
          text: m[0],
          zitat: teilsatz(s, m.index ?? 0, m[0].length),
          zielTyp: z.typ,
          zielId: z.id,
          begruendung: `Andere Schreibweise von „${z.name}“.`,
        });
      }
    }
  }
  return { vorschlaege };
}

// ---------------------------------------------------------------------------
// Vorschläge für Figuren, Orte, Beziehungen (ganzes Buch, Sonnet/Opus)
// ---------------------------------------------------------------------------

type DemoBeleg = [kapitel: string, zitat: string];

/** Was die Demo-KI im Demo-Projekt „findet“. Alle Zitate stehen wörtlich in fixtures/demo-projekt. */
const DEMO_FIGUREN: { name: string; aliase: string[]; rolle: 'haupt' | 'neben'; kurz: string; belege: DemoBeleg[] }[] = [
  { name: 'Paul', aliase: [], rolle: 'haupt', kurz: 'Architekt, Hauptfigur', belege: [['grundriss', 'Paul schneidet mit dem Skalpell das letzte Fenster aus.'], ['fassade', 'Paul sagt, er kümmert sich darum.']] },
  { name: 'Ole', aliase: [], rolle: 'neben', kurz: 'Kollege von Paul', belege: [['grundriss', 'Ole sitzt auf der Fensterbank neben dem Oleander und isst einen Apfel.']] },
  { name: 'Malte', aliase: [], rolle: 'neben', kurz: 'Kollege, zeigt Ansichten', belege: [['fassade', 'Malte zeigt die Ansichten für Nordhaven.']] },
  { name: 'Konrad', aliase: [], rolle: 'neben', kurz: 'leitet das Meeting', belege: [['fassade', 'Konrad kommt als Letzter und schließt die Tür hinter sich.']] },
  { name: 'Herr Kessler', aliase: ['Herrn Kessler'], rolle: 'neben', kurz: 'Investor von Nordhaven', belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']] },
  { name: 'Lotte', aliase: [], rolle: 'haupt', kurz: 'Kleinanzeige', belege: [['lotte', 'Die Verkäuferin hieß Lotte und hat ihm geholfen, ihn die vier Stockwerke hinaufzutragen.']] },
  { name: 'Vera', aliase: [], rolle: 'neben', kurz: 'Verabredung im Restaurant', belege: [['ebbe', 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.']] },
  { name: 'Die Fremde', aliase: [], rolle: 'neben', kurz: 'im Fährhaus', belege: [['bis-bald', 'Die Fremde auf der Bank gegenüber schläft noch, eingewickelt in einen gelben Regenmantel.']] },
  { name: 'Alter Mann am Kai', aliase: ['alter Mann'], rolle: 'neben', kurz: 'am Kai', belege: [['ebbe', 'Ein alter Mann bleibt neben ihm stehen und fragt, ob er sich verlaufen habe.']] },
  { name: 'Fiete', aliase: [], rolle: 'neben', kurz: 'nur erwähnt', belege: [['funkstille', 'ob er die Krabben wieder für Fiete mitnimmt']] },
  { name: 'Der Mann am Fischstand', aliase: [], rolle: 'neben', kurz: 'Verkäufer am Fischstand', belege: [['funkstille', 'Der Mann am Fischstand fragt, ob er die Krabben wieder für Fiete mitnimmt.']] },
  // absichtlich ungültig: erfundenes Zitat
  { name: 'Oles Schwester', aliase: [], rolle: 'neben', kurz: 'ruft Ole an', belege: [['grundriss', 'Oles Schwester ruft an und fragt nach dem Schlüssel.']] },
];

const DEMO_ORTE: { name: string; aliase: string[]; in: string; belege: DemoBeleg[] }[] = [
  { name: 'Büro', aliase: [], in: '', belege: [['weissraum', 'Am Montag ist im Büro jeder Zeichentisch voller Papierrollen und Kaffeebecher, nur auf Pauls Tisch liegt nichts.']] },
  { name: 'Teeküche', aliase: [], in: 'Büro', belege: [['grundriss', 'Auf dem langen Tisch in der Teeküche steht das Modell des alten Speichers, dreißig Zentimeter hoch, aus grauer Pappe.']] },
  { name: 'Zeichensaal', aliase: [], in: 'Büro', belege: [['fassade', 'Im Zeichensaal hängen die Pläne schon an der Glaswand, als Paul hereinkommt.']] },
  { name: 'Pauls Wohnung', aliase: [], in: '', belege: [['lotte', 'In Pauls Wohnung riecht es nach Terpentin und frischem Kaffee.']] },
  { name: 'Lindenhof', aliase: ['Linden-Hof'], in: '', belege: [['lotte', 'fährt mit seinem alten Saab 900 zum Lindenhof']] },
  { name: 'Fährhaus', aliase: [], in: '', belege: [['bis-bald', 'Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.']] },
  { name: 'Kornspeicher', aliase: [], in: '', belege: [['staub', 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen.']] },
  { name: 'Fischstand', aliase: [], in: '', belege: [['funkstille', 'Erst am Fischstand dreht er sie um']] },
  { name: 'Fischrestaurant', aliase: [], in: '', belege: [['ebbe', 'Das Fischrestaurant liegt zwei Straßen hinter dem Linden Hof.']] },
  { name: 'Nordkai', aliase: [], in: '', belege: [['fassade', 'Auf dem Tisch liegt die Morgenzeitung, die Schlagzeile quer über der Titelseite: Werfthalle am Nordkai verkauft.']] },
];

const DEMO_BEZIEHUNGEN: {
  von: string;
  zu: string;
  art: string;
  kategorie: 'arbeit' | 'dates' | 'sonstige';
  unsicher: boolean;
  belege: DemoBeleg[];
  begruendung: string;
}[] = [
  { von: 'Ole', zu: 'Paul', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['grundriss', 'Ole sitzt auf der Fensterbank neben dem Oleander und isst einen Apfel.']], begruendung: 'Beide sind in der Teeküche, Ole fragt, was Nordhaven zu den Fenstern sagt.' },
  { von: 'Malte', zu: 'Paul', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Malte zeigt die Ansichten für Nordhaven.']], begruendung: 'Malte und Paul sitzen im selben Meeting zum Nordhaven-Auftrag.' },
  { von: 'Konrad', zu: 'Paul', art: 'Chef', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Konrad will die neuen Zeichnungen bis Monatsende sehen.']], begruendung: 'Konrad verteilt im Meeting die Aufgaben, Paul übernimmt die Glasfassade.' },
  { von: 'Herr Kessler', zu: 'Paul', art: 'Kunde', kategorie: 'arbeit', unsicher: true, belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']], begruendung: 'Herr Kessler tritt nicht auf, seine Forderung wird im Meeting weitergegeben.' },
  { von: 'Lotte', zu: 'Paul', art: 'Kleinanzeige', kategorie: 'dates', unsicher: false, belege: [['lotte', 'Die Verkäuferin hieß Lotte und hat ihm geholfen, ihn die vier Stockwerke hinaufzutragen.']], begruendung: 'Lotte hat Paul über Kleinanzeigen einen Zeichentisch verkauft, seitdem schreiben sie sich.' },
  { von: 'Vera', zu: 'Paul', art: 'Verabredung', kategorie: 'dates', unsicher: false, belege: [['ebbe', 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.']], begruendung: 'Paul und Vera essen gemeinsam im Fischrestaurant.' },
  { von: 'Die Fremde', zu: 'Paul', art: 'Nacht im Fährhaus', kategorie: 'dates', unsicher: false, belege: [['bis-bald', 'Die Fremde auf der Bank gegenüber schläft noch, eingewickelt in einen gelben Regenmantel.']], begruendung: 'Paul wacht im Fährhaus auf, sie schläft auf der Bank gegenüber.' },
  { von: 'Herr Kessler', zu: 'Konrad', art: 'Kunde', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Er berichtet, dass Herr Kessler die ganze Fassade aus Glas haben will, ohne einen einzigen Backstein.']], begruendung: 'Konrad gibt die Forderung von Herrn Kessler weiter.' },
  { von: 'Malte', zu: 'Ole', art: 'Kollege', kategorie: 'arbeit', unsicher: false, belege: [['fassade', 'Malte hat den Beamer angeschlossen, Ole ist heute auf der Baustelle.']], begruendung: 'Beide gehören zum Team im Zeichensaal.' },
  { von: 'Paul', zu: 'Fiete', art: 'kauft für ihn ein', kategorie: 'sonstige', unsicher: true, belege: [['funkstille', 'ob er die Krabben wieder für Fiete mitnimmt']], begruendung: 'Der Mann am Fischstand fragt, ob Paul die Krabben wieder für Fiete mitnimmt; Fiete selbst tritt nicht auf.' },
  { von: 'Der Mann am Fischstand', zu: 'Paul', art: 'kennt ihn vom Fischstand', kategorie: 'sonstige', unsicher: false, belege: [['funkstille', 'Der Mann am Fischstand fragt, ob er die Krabben wieder für Fiete mitnimmt.']], begruendung: 'Der Mann am Fischstand spricht Paul auf frühere Einkäufe an.' },
  { von: 'Alter Mann am Kai', zu: 'Paul', art: 'Passant', kategorie: 'sonstige', unsicher: true, belege: [['ebbe', 'Ein alter Mann bleibt neben ihm stehen und fragt, ob er sich verlaufen habe.']], begruendung: 'Er spricht Paul am Kai an; Paul hat ihn vorher nicht kommen hören.' },
  // absichtlich ungültig: erfundenes Zitat, Ersatztext, unbekannte Figur
  { von: 'Vera', zu: 'Ole', art: 'Ex-Freundin', kategorie: 'dates', unsicher: false, belege: [['ebbe', 'Vera war früher mit Ole zusammen.']], begruendung: 'Vera kennt Ole von früher.' },
  { von: 'Lotte', zu: 'Vera', art: 'Freundin', kategorie: 'sonstige', unsicher: false, belege: [['ebbe', 'Vera nickt, und er verspricht']], begruendung: 'Besser: „Lotte kennt Vera aus der Schule“ – formuliere die Szene stattdessen deutlicher.' },
  { von: 'Paul', zu: 'Hafenmeister', art: 'Bekannter', kategorie: 'sonstige', unsicher: true, belege: [['funkstille', 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.']], begruendung: 'Der Hafenmeister kennt Paul.' },
];

function vorschlagsAntwort(ctx: GelesenerKontext) {
  const form = (s: string) => s.toLocaleLowerCase('de').replace(/^(der|die|das)\s+/, '');
  const angelegteFigur = (name: string) =>
    ctx.figuren.find((f) => [f.name, ...f.aliase].some((n) => form(n) === form(name)));
  const angelegterOrt = (name: string) => ctx.orte.find((o) => [o.name, ...o.aliase].some((n) => form(n) === form(name)));
  const kapitel = new Map(ctx.kapitel.map((k) => [k.id, k]));
  // wie ein Modell: nur, was im mitgeschickten Text steht (die absichtlich falschen Zitate bleiben drin)
  const imText = (belege: DemoBeleg[]) => belege.some(([k]) => kapitel.has(k));
  const belege = (b: DemoBeleg[]) => b.filter(([k]) => kapitel.has(k)).map(([k, zitat]) => ({ kapitel: k, zitat }));

  const figuren = DEMO_FIGUREN.filter((f) => imText(f.belege) && !angelegteFigur(f.name)).map((f) => ({
    name: f.name,
    aliase: f.aliase,
    rolle: f.rolle,
    kurz: f.kurz,
    belege: belege(f.belege),
  }));
  const orte = DEMO_ORTE.filter((o) => imText(o.belege) && !angelegterOrt(o.name)).map((o) => ({
    name: o.name,
    aliase: o.aliase,
    in: o.in,
    belege: belege(o.belege),
  }));
  const ref = (name: string) => angelegteFigur(name)?.id ?? name;
  const beziehungen = DEMO_BEZIEHUNGEN.filter((b) => imText(b.belege)).map((b) => {
    const bb = belege(b.belege);
    return {
      von: ref(b.von),
      zu: ref(b.zu),
      art: b.art,
      kategorie: b.kategorie,
      abKapitel: bb[0]?.kapitel ?? '',
      unsicher: b.unsicher,
      belege: bb,
      begruendung: b.begruendung,
    };
  });
  return { figuren, orte, beziehungen };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function textBloecke(body: Record<string, unknown>): string[] {
  const nachrichten = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];
  const inhalt = nachrichten[0]?.content;
  if (typeof inhalt === 'string') return [inhalt];
  return Array.isArray(inhalt) ? (inhalt as Record<string, unknown>[]).map((b) => (typeof b?.text === 'string' ? b.text : '')) : [];
}

function zeichen(body: Record<string, unknown>): number {
  return JSON.stringify(body).length;
}

export function erstelleDemoKiTransport(optionen: DemoKiOptionen = {}): KiTransport {
  const verzoegerung = optionen.verzoegerungMs ?? 350;
  const gecacht = new Set<string>();
  let zaehler = 0;

  return {
    async bereit() {
      return true;
    },
    async senden(body, optionen = {}) {
      const { signal } = optionen;
      if (signal?.aborted) throw new KiFehler('abgebrochen', texte().backend.anfrageAbgebrochen);
      if (verzoegerung > 0) {
        // Wartezeit abbrechbar (wie eine echte Anfrage, die unterwegs abgebrochen wird)
        await new Promise<void>((erfuellt, verworfen) => {
          const fertig = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abbruch);
            erfuellt();
          };
          const abbruch = () => {
            clearTimeout(timer);
            verworfen(new KiFehler('abgebrochen', texte().backend.anfrageAbgebrochen));
          };
          const timer = setTimeout(fertig, verzoegerung);
          signal?.addEventListener('abort', abbruch, { once: true });
        });
      }
      const [prefix = '', aufgabe = ''] = textBloecke(body);
      const ctx = leseBuchKontext(prefix);
      const art = /<aufgabe art="([^"]+)" kapitel="([^"]+)">/.exec(aufgabe);
      const kopf = leseAufgabenKopf(aufgabe);
      const registriert = kopf ? demoAntwortFuer(kopf.art) : undefined;
      const daten = registriert
        ? registriert(ctx, { art: kopf!.art, attribute: kopf!.attribute, aufgabe, body })
        : /<aufgabe art="vorschlaege">/.test(aufgabe)
        ? vorschlagsAntwort(ctx)
        : art?.[1] === 'erwaehnungen'
          ? erwaehnungsAntwort(ctx, art[2] ?? '')
          : art?.[1] === 'pruefung'
            ? pruefAntwort(ctx, [art[2] ?? ''])
            : { hinweise: [], analysen: [] };
      const text = JSON.stringify(daten);
      const schluessel = `${String(body.model)}\n${prefix}`;
      const prefixTokens = Math.ceil(prefix.length / 3);
      const ausCache = gecacht.has(schluessel);
      gecacht.add(schluessel);
      zaehler += 1;
      return {
        id: `msg_demo_${zaehler}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        stop_details: null,
        usage: {
          input_tokens: Math.max(1, Math.ceil((zeichen(body) - prefix.length) / 3)),
          output_tokens: Math.ceil(text.length / 3),
          cache_read_input_tokens: ausCache ? prefixTokens : 0,
          cache_creation_input_tokens: ausCache ? 0 : prefixTokens,
        },
      };
    },
    async tokenZaehlen(body) {
      return Math.ceil(zeichen(body) / 3);
    },
  };
}
