/**
 * Buchkontext für das Modell (E12 Allowlist, E13 gecachter Prefix).
 *
 * Es werden ausschließlich Felder einzeln übernommen, nie ganze Objekte: Kapiteltitel und
 * Klartext, Figuren (name, aliase, rolle, existenz, Plan-Felder), Kapitelpläne (szene, notiz),
 * Orte (name, aliase), Gruppen (name, typ, status) und Realitätseinträge (stufe, text, Zitat).
 * Nie: wahrheit, notizen, kurz, beschreibung, Anmerkungen, Ideen, Abweichungen, Akte, Stränge. (Stränge gehen nur im
 * Aufgabentext von „Stränge vorschlagen“ mit, siehe straenge.ts – freigegeben 2026-10-12.)
 * Plan-Felder sind seit Leons Entscheidung vom 2026-10-09 freigegeben (F-05).
 *
 * Buchsprache (angaben.sprache, nur als Sprache der Beschriftungen, nicht als Feld): Für englische Bücher sind die
 * Beschriftungen im Prefix englisch („Characters:“, „Existence: …“, „Planned scene: …“); Tags und Attribute
 * (<angaben>, <buch>, <kapitel nr id titel>, <text>, <realitaetsebene>, <plan>) bleiben gleich.
 */
import type { FigurRolle, GruppenTyp, Id, ProjektDaten, Realitaet, TextAnker } from '../model/types';
import { klartext, textHash } from '../text';
import { kiSprache, type Sprache } from './sprache';

export interface KontextKapitel {
  id: Id;
  /** 1-basiert, Reihenfolge laut projekt.kapitel */
  nr: number;
  titel: string;
  /** Klartext (core/text) – exakt dieser Text geht an das Modell und dient der Zitatprüfung */
  text: string;
  /** textHash des Markdown-Bodys (Ergebnis-Cache) */
  hash: string;
  /** Kapitelplan: geplante Szene und „Was soll hier passieren?“ (Verweise als Anzeigetext) */
  plan: { szene: string; notiz: string };
}

export interface KontextFigur {
  id: Id;
  name: string;
  aliase: string[];
  rolle: FigurRolle;
  existenz: Realitaet;
  /** nur lokal für die Prüfung (Genitiv-/Wortformen), wird nicht gesendet */
  formen: string[];
  /** „Deine Planung“ – nur ausgefüllte Felder */
  plan: { feld: string; wert: string }[];
}

export interface KontextOrt {
  id: Id;
  name: string;
  aliase: string[];
}

export interface KontextGruppe {
  id: Id;
  name: string;
  typ: GruppenTyp;
  status: 'im_text' | 'geplant';
}

export interface KontextRealitaet {
  kapitel: Id;
  stufe: Realitaet;
  /** Beschreibung aus dem Kapitelplan (leer bei reinen Textstellen) */
  text: string;
  /** verankerte Textstelle, falls vorhanden */
  anker?: TextAnker;
}

export interface BuchKontext {
  kapitel: KontextKapitel[];
  figuren: KontextFigur[];
  orte: KontextOrt[];
  gruppen: KontextGruppe[];
  realitaet: KontextRealitaet[];
  /** gerenderter, stabiler Prefix (geht mit cache_control an das Modell) */
  text: string;
  /** Buchsprache: Sprache der Prompts und der Antworten (fehlt = Deutsch) */
  sprache?: Sprache;
}

const STUFE_TEXT: Record<Realitaet, string> = {
  gesichert: 'gesichert',
  offen: 'noch offen',
  bewusst_vage: 'bewusst vage – absichtlich mehrdeutig, nie als Widerspruch melden',
};

const GRUPPEN_TYP: Record<GruppenTyp, string> = {
  antagonist: 'Antagonist',
  firma: 'Firma',
  familie: 'Familie',
  sonstige: 'Gruppe',
};

/** Beschriftungen des Prefix je Buchsprache (Tags bleiben gleich). */
const BESCHRIFTUNG = {
  de: {
    einleitung: 'Angaben des Autors zu Figuren, Orten und Gruppen. Alles Weitere erfährst du nur aus dem Text.',
    planHinweis: 'Zeilen „Planung“ beschreiben, was der Autor vorhat. Sie gehören nicht zum Buch.',
    figuren: 'Figuren:',
    orte: 'Orte:',
    gruppen: 'Gruppen:',
    keine: '- (keine angelegt)',
    auch: 'auch',
    haupt: 'Hauptfigur',
    neben: 'Nebenfigur',
    statist: 'Statist',
    existenz: 'Existenz',
    planung: 'Planung',
    imText: 'im Text',
    geplant: 'geplant, noch nicht im Text',
    textstelle: (s: string) => `Textstelle: „${s}“`,
    ohneBeschreibung: '(ohne Beschreibung)',
    szene: 'Geplante Szene',
    notiz: 'Was hier passieren soll',
    stufe: STUFE_TEXT,
    gruppenTyp: GRUPPEN_TYP,
  },
  en: {
    einleitung: "The author's notes on characters, places and groups. Everything else you learn only from the text.",
    planHinweis: 'Lines “Plan” describe what the author intends. They are not part of the book.',
    figuren: 'Characters:',
    orte: 'Places:',
    gruppen: 'Groups:',
    keine: '- (none set up)',
    auch: 'also',
    haupt: 'main character',
    neben: 'minor character',
    statist: 'walk-on character',
    existenz: 'Existence',
    planung: 'Plan',
    imText: 'in the text',
    geplant: 'planned, not yet in the text',
    textstelle: (s: string) => `Passage: “${s}”`,
    ohneBeschreibung: '(no description)',
    szene: 'Planned scene',
    notiz: 'What should happen here',
    stufe: {
      gesichert: 'established',
      offen: 'still open',
      bewusst_vage: 'deliberately vague – intentionally ambiguous, never report as a contradiction',
    } satisfies Record<Realitaet, string>,
    gruppenTyp: { antagonist: 'Antagonist', firma: 'Company', familie: 'Family', sonstige: 'Group' } satisfies Record<GruppenTyp, string>,
  },
};

function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attrLesen(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function nachName<T extends { name: string; id: Id }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id);
}

/** `[[typ:id|Anzeige]]` → „Anzeige“, Zeilenumbrüche → Leerzeichen (eine Zeile im Prompt). */
export function planText(s: string | undefined): string {
  return (s ?? '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `sprache`: Buchsprache (Standard: projekt.angaben.sprache, leer = Deutsch). */
export function baueBuchKontext(daten: ProjektDaten, sprache: Sprache = kiSprache(daten.projekt.angaben)): BuchKontext {
  const kapitel: KontextKapitel[] = daten.projekt.kapitel
    .map((id, i) => {
      const k = daten.kapitel[id];
      return {
        id,
        nr: i + 1,
        titel: k?.titel ?? id,
        text: k ? klartext(k.text) : '',
        hash: textHash(k?.text ?? ''),
        plan: { szene: planText(daten.plaene[id]?.szene), notiz: planText(daten.plaene[id]?.notiz) },
      };
    });

  const figuren: KontextFigur[] = Object.values(daten.figuren)
    .map((f) => ({
      id: f.id,
      name: f.name,
      aliase: [...(f.aliase ?? [])],
      rolle: f.rolle,
      existenz: f.existenz,
      formen: [...(f.formen ?? [])],
      plan: Object.entries(f.plan ?? {})
        .map(([feld, wert]) => ({ feld: planText(feld), wert: planText(wert) }))
        .filter((p) => p.feld && p.wert),
    }))
    .sort(nachName);

  const orte: KontextOrt[] = Object.values(daten.orte)
    .map((o) => ({ id: o.id, name: o.name, aliase: [...(o.aliase ?? [])] }))
    .sort(nachName);

  const gruppen: KontextGruppe[] = Object.values(daten.gruppen)
    .map((g) => ({ id: g.id, name: g.name, typ: g.typ, status: g.status }))
    .sort(nachName);

  const realitaet: KontextRealitaet[] = [];
  for (const k of kapitel) {
    for (const r of daten.plaene[k.id]?.realitaet ?? []) {
      realitaet.push({ kapitel: k.id, stufe: r.stufe, text: r.text ?? '', ...(r.anker ? { anker: r.anker } : {}) });
    }
  }
  for (const r of daten.entscheidungen.realitaet ?? []) {
    if (!r.anker?.kapitel) continue;
    realitaet.push({ kapitel: r.anker.kapitel, stufe: r.stufe, text: '', anker: r.anker });
  }

  const text = renderBuch(kapitel, figuren, orte, gruppen, realitaet, sprache);
  return { kapitel, figuren, orte, gruppen, realitaet, text, sprache };
}

function renderBuch(
  kapitel: KontextKapitel[],
  figuren: KontextFigur[],
  orte: KontextOrt[],
  gruppen: KontextGruppe[],
  realitaet: KontextRealitaet[],
  sprache: Sprache,
): string {
  const B = BESCHRIFTUNG[sprache];
  const z: string[] = [];
  z.push('<angaben>');
  z.push(B.einleitung);
  z.push(B.planHinweis);
  z.push('');
  z.push(B.figuren);
  if (figuren.length === 0) z.push(B.keine);
  for (const f of figuren) {
    const teile = [`${f.name} (id: ${f.id})`];
    if (f.aliase.length) teile.push(`${B.auch}: ${f.aliase.join(', ')}`);
    teile.push(B[f.rolle]);
    teile.push(`${B.existenz}: ${B.stufe[f.existenz]}`);
    z.push(`- ${teile.join(' · ')}`);
    for (const p of f.plan) z.push(`  ${B.planung} · ${p.feld}: ${p.wert}`);
  }
  z.push('');
  z.push(B.orte);
  if (orte.length === 0) z.push(B.keine);
  for (const o of orte) {
    const teile = [`${o.name} (id: ${o.id})`];
    if (o.aliase.length) teile.push(`${B.auch}: ${o.aliase.join(', ')}`);
    z.push(`- ${teile.join(' · ')}`);
  }
  z.push('');
  z.push(B.gruppen);
  if (gruppen.length === 0) z.push(B.keine);
  for (const g of gruppen) {
    z.push(`- ${g.name} (id: ${g.id}) · ${B.gruppenTyp[g.typ]} · ${g.status === 'im_text' ? B.imText : B.geplant}`);
  }
  z.push('</angaben>');
  z.push('');
  z.push('<buch>');
  for (const k of kapitel) {
    const kopf = `<kapitel nr="${k.nr}" id="${attr(k.id)}" titel="${attr(k.titel)}"`;
    if (!k.text.trim()) {
      z.push(`${kopf} ohneText="ja"></kapitel>`);
      continue;
    }
    z.push(`${kopf}>`);
    z.push('<text>');
    z.push(k.text);
    z.push('</text>');
    const eintraege = realitaet.filter((r) => r.kapitel === k.id);
    if (eintraege.length) {
      z.push('<realitaetsebene>');
      for (const r of eintraege) {
        const was = [r.text.trim(), r.anker?.exakt ? B.textstelle(r.anker.exakt) : ''].filter(Boolean).join(' – ');
        z.push(`- ${B.stufe[r.stufe]}: ${was || B.ohneBeschreibung}`);
      }
      z.push('</realitaetsebene>');
    }
    if (k.plan.szene || k.plan.notiz) {
      z.push('<plan>');
      if (k.plan.szene) z.push(`${B.szene}: ${k.plan.szene}`);
      if (k.plan.notiz) z.push(`${B.notiz}: ${k.plan.notiz}`);
      z.push('</plan>');
    }
    z.push('</kapitel>');
  }
  z.push('</buch>');
  return z.join('\n');
}

// ---------------------------------------------------------------------------
// Zurücklesen des gerenderten Kontexts (Demo-Transport, Tests)
// ---------------------------------------------------------------------------

export interface GelesenerKontext {
  kapitel: { id: Id; nr: number; titel: string; text: string; realitaet: { stufe: string; text: string }[]; plan: { szene: string; notiz: string } }[];
  figuren: { id: Id; name: string; aliase: string[]; existenz: string; plan: { feld: string; wert: string }[] }[];
  orte: { id: Id; name: string; aliase: string[] }[];
  gruppen: { id: Id; name: string }[];
  /** 'en', wenn der Prefix englische Beschriftungen hat (englisches Buch); fehlt = Deutsch */
  sprache?: Sprache;
}

/** Englische Stufen-Beschriftung → deutsche (GelesenerKontext nennt Stufen immer deutsch, z. B. „bewusst vage …“). */
function stufeDeutsch(s: string): string {
  const t = s.trim();
  for (const [stufe, text] of Object.entries(BESCHRIFTUNG.en.stufe)) if (text === t) return STUFE_TEXT[stufe as Realitaet];
  return t;
}

const ABSCHNITT: Record<string, string> = { Characters: 'Figuren', Places: 'Orte', Groups: 'Gruppen' };

/**
 * Liest einen mit baueBuchKontext gerenderten Prefix zurück (für den Demo-Transport und Tests). Versteht deutsche
 * und englische Beschriftungen; Stufen kommen immer in der deutschen Form zurück.
 */
export function leseBuchKontext(prefix: string): GelesenerKontext {
  const ergebnis: GelesenerKontext = { kapitel: [], figuren: [], orte: [], gruppen: [] };
  const angaben = /<angaben>\n([\s\S]*?)\n<\/angaben>/.exec(prefix)?.[1] ?? '';
  let abschnitt = '';
  for (const zeile of angaben.split('\n')) {
    if (/^(Figuren|Orte|Gruppen|Characters|Places|Groups):$/.test(zeile)) {
      const name = zeile.slice(0, -1);
      if (ABSCHNITT[name]) ergebnis.sprache = 'en';
      abschnitt = ABSCHNITT[name] ?? name;
      continue;
    }
    const planZeile = /^  (?:Planung|Plan) · ([^:]+): (.*)$/.exec(zeile);
    if (planZeile && abschnitt === 'Figuren') {
      ergebnis.figuren[ergebnis.figuren.length - 1]?.plan.push({ feld: planZeile[1] ?? '', wert: planZeile[2] ?? '' });
      continue;
    }
    const m = /^- (.+?) \(id: ([^)]+)\)(.*)$/.exec(zeile);
    if (!m) continue;
    const [, name = '', id = '', rest = ''] = m;
    const aliase = /· (?:auch|also): ([^·]+)/.exec(rest)?.[1]?.split(',').map((a) => a.trim()).filter(Boolean) ?? [];
    if (abschnitt === 'Figuren')
      ergebnis.figuren.push({ id, name, aliase, existenz: stufeDeutsch(/(?:Existenz|Existence): ([^·]+)/.exec(rest)?.[1] ?? ''), plan: [] });
    else if (abschnitt === 'Orte') ergebnis.orte.push({ id, name, aliase });
    else if (abschnitt === 'Gruppen') ergebnis.gruppen.push({ id, name });
  }
  const muster = /<kapitel nr="(\d+)" id="([^"]*)" titel="([^"]*)">\n<text>\n([\s\S]*?)\n<\/text>\n(?:<realitaetsebene>\n([\s\S]*?)\n<\/realitaetsebene>\n)?(?:<plan>\n([\s\S]*?)\n<\/plan>\n)?<\/kapitel>/g;
  for (const m of prefix.matchAll(muster)) {
    const realitaet = (m[5] ?? '')
      .split('\n')
      .map((z) => /^- ([^:]+): (.*)$/.exec(z))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ stufe: stufeDeutsch(x[1] ?? ''), text: x[2] ?? '' }));
    const plan = m[6] ?? '';
    ergebnis.kapitel.push({
      id: attrLesen(m[2] ?? ''),
      nr: Number(m[1]),
      titel: attrLesen(m[3] ?? ''),
      text: m[4] ?? '',
      realitaet,
      plan: {
        szene: /^(?:Geplante Szene|Planned scene): (.*)$/m.exec(plan)?.[1] ?? '',
        notiz: /^(?:Was hier passieren soll|What should happen here): (.*)$/m.exec(plan)?.[1] ?? '',
      },
    });
  }
  return ergebnis;
}
