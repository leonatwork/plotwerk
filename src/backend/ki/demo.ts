/**
 * KI-Transport für die Browser-Demo (ohne Netz). Besitzer: KI.
 *
 * Antwortet deterministisch im echten Messages-API-Format. Alles wird aus dem Request abgeleitet
 * (Buchkontext + Aufgabe), alle Zitate sind wörtliche Ausschnitte der mitgeschickten Kapiteltexte.
 * Absichtlich enthalten: je ein Hinweis mit erfundenem Zitat, einer mit Ersatztext und ein
 * Widerspruch zu einer bewusst vagen Figur – die Antwortprüfung in core/ki muss sie verwerfen.
 * Die Antworten folgen der Buchsprache (Deutsch oder Englisch, siehe ./demo/sprachen.ts).
 */
import { KiFehler, leseAufgabenKopf, leseBuchKontext, type GelesenerKontext, type KiTransport } from '@core/ki/index';
import { texte } from '../../i18n';
import { demoSprache, type DemoBeleg, type DemoSprache } from './demo/sprachen';
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
  /** am letzten „ und “ / „ and “ vor der Fundstelle beginnen */
  undVorne?: boolean;
  /** am nächsten „ und “ / „ and “ nach der Fundstelle enden */
  undHinten?: boolean;
  /** einleitendes „Beim …“ weglassen */
  ohneEinleitung?: boolean;
}

/** Satzteil um eine Fundstelle (Grenzen: Komma, Semikolon, Doppelpunkt, Gedankenstrich). */
function teilsatz(sp: DemoSprache, satz: string, pos: number, laenge: number, opt: TeilsatzOptionen = {}): string {
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
    const u = satz.lastIndexOf(sp.und, pos);
    if (u >= a) a = u + sp.und.length;
  }
  if (opt.undHinten) {
    const u = satz.indexOf(sp.und, pos + laenge);
    if (u >= 0 && u < e) e = u;
  }
  if (opt.ohneEinleitung) {
    const m = sp.einleitung.exec(satz.slice(a));
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
  return new RegExp(`(?<![\\p{L}])${escape(wort)}(?:s|’s|'s)?(?![\\p{L}])`, flags);
}

function kuerze(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')} …`;
}

/** erster Satz mit dem Muster → Satzteil um den Treffer */
function stelle(sp: DemoSprache, k: Kap, muster: RegExp, opt: TeilsatzOptionen = {}): { zitat: string; treffer: string } | null {
  for (const s of saetze(k.text)) {
    const m = muster.exec(s);
    if (m) return { zitat: teilsatz(sp, s, m.index, m[0].length, opt), treffer: m[0] };
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

function unbekannteNamen(ctx: GelesenerKontext, sp: DemoSprache): { kapitel: Kap; name: string; zitat: string }[] {
  const bekannt = bekannteWoerter(ctx);
  const ergebnis: { kapitel: Kap; name: string; zitat: string }[] = [];
  for (const k of ctx.kapitel) {
    for (const s of saetze(k.text)) {
      for (const m of s.matchAll(sp.unbekannt)) {
        const name = m[1] ?? '';
        if (bekannt.has(name.toLocaleLowerCase('de')) || ergebnis.some((e) => e.name === name)) continue;
        ergebnis.push({ kapitel: k, name, zitat: teilsatz(sp, s, m.index ?? 0, m[0].length) });
      }
    }
  }
  return ergebnis;
}

function regeln(ctx: GelesenerKontext): Regel[] {
  const sp = demoSprache(ctx);
  const t = sp.t;
  const liste: Regel[] = [];
  const buch = ctx.kapitel.map((k) => k.text).join('\n');

  for (const u of unbekannteNamen(ctx, sp)) {
    const anzahl = buch.match(new RegExp(wortRegex(u.name).source, 'gu'))?.length ?? 1;
    liste.push({
      hinweis: {
        typ: 'unbekannt',
        titel: t.unbekanntTitel(u.name),
        zitate: [{ kapitel: u.kapitel.id, text: u.zitat }],
        erklaerung: t.unbekanntErklaerung(u.name, anzahl),
      },
      faeden: [{ kapitel: u.kapitel.id, name: t.unbekanntFaden(u.name), eroeffnet: true }],
    });
  }

  const karten = ctx.kapitel
    .map((k) => ({ k, st: stelle(sp, k, sp.postkarte, { ohneEinleitung: true }) }))
    .filter((x) => x.st && sp.manteltasche.test(x.st.zitat));
  const erster = karten[0];
  const letzter = karten[karten.length - 1];
  if (erster && letzter && erster !== letzter && erster.st && letzter.st) {
    liste.push({
      hinweis: {
        typ: 'offener_faden',
        titel: t.postkartenTitel,
        zitate: [
          { kapitel: erster.k.id, text: erster.st.zitat },
          { kapitel: letzter.k.id, text: letzter.st.zitat },
        ],
        erklaerung: t.postkartenErklaerung(erster.k.nr, letzter.k.nr),
      },
      faeden: karten.map((z, i) => ({ kapitel: z.k.id, name: t.postkartenFaden, eroeffnet: i === 0 })),
    });
  }

  const spaet = ctx.kapitel.map((k) => ({ k, st: stelle(sp, k, sp.spaet, { undHinten: true }) })).filter((x) => x.st);
  const frueh = ctx.kapitel.map((k) => ({ k, st: stelle(sp, k, sp.frueh, { undHinten: true }) })).filter((x) => x.st);
  for (const a of spaet) {
    for (const b of frueh) {
      if (a.k.id === b.k.id || !a.st || !b.st) continue;
      const figur = ctx.figuren.find((f) => nenntFigur(a.k, f) && nenntFigur(b.k, f) && !/bewusst vage/.test(f.existenz));
      if (!figur) continue;
      const fa = stelle(sp, a.k, sp.fahrzeug, { undVorne: true });
      const fb = stelle(sp, b.k, sp.fahrzeug, { undVorne: true });
      const zitate: RohZitat[] = [
        { kapitel: a.k.id, text: fa?.zitat ?? a.st.zitat },
        { kapitel: b.k.id, text: b.st.zitat },
      ];
      const wagen = fa && fb ? t.wagen(a.k.nr, fa.treffer, b.k.nr, fb.treffer) : '';
      liste.push({
        hinweis: {
          typ: 'pruefen',
          titel: t.treffenTitel(figur.name),
          zitate,
          erklaerung: t.treffenErklaerung(a.k.nr, b.k.nr, figur.name, wagen),
        },
      });
    }
  }

  const tage = ctx.kapitel.map((k) => ({ k, st: stelle(sp, k, sp.wochentag) })).filter((x) => x.st);
  if (tage.length > 0) {
    liste.push({
      hinweis: {
        typ: 'zeitleiste',
        titel: t.tageTitel(tage.map((x) => x.st!.treffer)),
        zitate: tage.map((x) => ({ kapitel: x.k.id, text: x.st!.zitat })),
        erklaerung: t.tageErklaerung(tage.map((x) => x.k.nr)),
      },
    });
  }

  for (const k of ctx.kapitel) {
    const st = stelle(sp, k, sp.anrede);
    if (!st) continue;
    liste.push({
      hinweis: {
        typ: 'sprache',
        titel: t.anredeTitel(st.treffer),
        zitate: [{ kapitel: k.id, text: st.zitat }],
        erklaerung: t.anredeErklaerung(k.nr, st.treffer),
      },
    });
  }

  // F-05: Planung einer Figur gegen den Text (geplant ohne Alkohol, im Text ein Aperol Spritz).
  for (const f of ctx.figuren.filter((x) => !/bewusst vage/.test(x.existenz))) {
    const feld = f.plan.find((p) => sp.alkoholFeld.test(p.feld) && sp.verneinung.test(p.wert));
    if (!feld) continue;
    for (const k of ctx.kapitel) {
      const st = stelle(sp, k, sp.getraenk, { undHinten: true });
      if (!st) continue;
      liste.push({
        hinweis: {
          typ: 'pruefen',
          titel: t.alkoholTitel(f.name),
          zitate: [{ kapitel: k.id, text: st.zitat }],
          erklaerung: t.alkoholErklaerung(f.name, feld.feld, feld.wert, k.nr),
          plan: { figur: f.id, kapitel: '', feld: feld.feld },
        },
      });
      break;
    }
  }

  // Absichtlich ungültig: Widerspruch zu einer bewusst vagen Figur (harte Regel 4).
  for (const f of ctx.figuren.filter((x) => /bewusst vage/.test(x.existenz))) {
    const k = ctx.kapitel.find((x) => nenntFigur(x, f));
    const st = k ? stelle(sp, k, new RegExp(escape(f.name), 'iu')) : null;
    if (!k || !st) continue;
    liste.push({
      hinweis: {
        typ: 'pruefen',
        titel: t.vageTitel(f.name),
        zitate: [{ kapitel: k.id, text: st.zitat }],
        erklaerung: t.vageErklaerung(f.name),
      },
    });
  }

  // Absichtlich ungültig: erfundenes Zitat und Ersatztext (harte Regeln 2 und 3).
  const dialog = ctx.kapitel.map((k) => ({ k, m: sp.dialog.exec(k.text) })).find((x) => x.m && ctx.figuren.some((f) => nenntFigur(x.k, f)));
  if (dialog?.m) {
    const figur = ctx.figuren.find((f) => nenntFigur(dialog.k, f));
    const name = figur?.name ?? (ctx.sprache === 'en' ? 'He' : 'Er');
    liste.push({
      hinweis: {
        typ: 'pruefen',
        titel: t.raumTitel(figur?.name ?? (ctx.sprache === 'en' ? 'the character' : 'die Figur')),
        zitate: [{ kapitel: dialog.k.id, text: t.raumZitat(name) }],
        erklaerung: t.raumErklaerung,
      },
    });
    liste.push({
      hinweis: {
        typ: 'sprache',
        titel: t.hoelzernTitel,
        zitate: [{ kapitel: dialog.k.id, text: dialog.m[1] ?? '' }],
        erklaerung: t.hoelzernErklaerung,
      },
    });
  }
  return liste;
}

function analyse(k: Kap, ctx: GelesenerKontext, alle: Regel[]) {
  const t = demoSprache(ctx).t;
  const s = saetze(k.text);
  const vage = k.realitaet.some((r) => /bewusst vage/.test(r.stufe));
  const gruppen = ctx.gruppen.filter((g) => wortRegex(g.name).test(k.text)).map((g) => g.name);
  const loseEnden = alle.flatMap((r) => r.faeden ?? []).filter((f) => f.kapitel === k.id).map(({ name, eroeffnet }) => ({ name, eroeffnet }));
  return {
    kapitel: k.id,
    zusammenfassung: [s.slice(0, 2).join(' '), vage ? t.schwebe : ''].filter(Boolean).join(' '),
    kurz: kuerze(s[0] ?? '', 90),
    wendung: s.length > 2 ? (s[s.length - 1] ?? t.keine) : t.keine,
    antagonistenBezug: gruppen.length ? t.gruppenBezug(gruppen) : '–',
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
  const sp = demoSprache(ctx);
  const k = ctx.kapitel.find((x) => x.id === id);
  const vorschlaege: { text: string; zitat: string; zielTyp: string; zielId: string; begruendung: string }[] = [];
  if (!k) return { vorschlaege };
  for (const u of unbekannteNamen(ctx, sp).filter((x) => x.kapitel.id === id)) {
    vorschlaege.push({ text: u.name, zitat: u.zitat, zielTyp: 'unbekannte_figur', zielId: '', begruendung: sp.t.unbekanntVorschlag(u.name) });
  }
  for (const s of saetze(k.text)) {
    for (const m of s.matchAll(sp.personen)) {
      vorschlaege.push({
        text: m[0],
        zitat: teilsatz(sp, s, m.index ?? 0, m[0].length),
        zielTyp: 'unbekannte_figur',
        zielId: '',
        begruendung: sp.t.personVorschlag,
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
          zitat: teilsatz(sp, s, m.index ?? 0, m[0].length),
          zielTyp: z.typ,
          zielId: z.id,
          begruendung: sp.t.schreibweiseVorschlag(z.name),
        });
      }
    }
  }
  return { vorschlaege };
}

// ---------------------------------------------------------------------------
// Vorschläge für Figuren, Orte, Beziehungen (ganzes Buch, Sonnet/Opus)
// ---------------------------------------------------------------------------

function vorschlagsAntwort(ctx: GelesenerKontext) {
  const sp = demoSprache(ctx);
  const form = (s: string) => s.toLocaleLowerCase('de').replace(sp.artikel, '');
  const angelegteFigur = (name: string) => ctx.figuren.find((f) => [f.name, ...f.aliase].some((n) => form(n) === form(name)));
  const angelegterOrt = (name: string) => ctx.orte.find((o) => [o.name, ...o.aliase].some((n) => form(n) === form(name)));
  const kapitel = new Map(ctx.kapitel.map((k) => [k.id, k]));
  // wie ein Modell: nur, was im mitgeschickten Text steht (die absichtlich falschen Zitate bleiben drin)
  const imText = (belege: DemoBeleg[]) => belege.some(([k]) => kapitel.has(k));
  const belege = (b: DemoBeleg[]) => b.filter(([k]) => kapitel.has(k)).map(([k, zitat]) => ({ kapitel: k, zitat }));

  const figuren = sp.figuren
    .filter((f) => imText(f.belege) && !angelegteFigur(f.name))
    .map((f) => ({ name: f.name, aliase: f.aliase, rolle: f.rolle, kurz: f.kurz, belege: belege(f.belege) }));
  const orte = sp.orte.filter((o) => imText(o.belege) && !angelegterOrt(o.name)).map((o) => ({ name: o.name, aliase: o.aliase, in: o.in, belege: belege(o.belege) }));
  const ref = (name: string) => angelegteFigur(name)?.id ?? name;
  const beziehungen = sp.beziehungen
    .filter((b) => imText(b.belege))
    .map((b) => {
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
