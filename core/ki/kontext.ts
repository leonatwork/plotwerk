/**
 * Buchkontext für das Modell (E12 Allowlist, E13 gecachter Prefix).
 *
 * Es werden ausschließlich Felder einzeln übernommen, nie ganze Objekte: Kapiteltitel und
 * Klartext, Figuren (name, aliase, rolle, existenz, Plan-Felder), Kapitelpläne (szene, notiz),
 * Orte (name, aliase), Gruppen (name, typ, status) und Realitätseinträge (stufe, text, Zitat).
 * Nie: wahrheit, notizen, kurz, beschreibung, Anmerkungen, Ideen, Abweichungen, Akte, Stränge.
 * Plan-Felder sind seit Leons Entscheidung vom 2026-10-09 freigegeben (F-05).
 */
import type { GruppenTyp, Id, ProjektDaten, Realitaet, TextAnker } from '../model/types';
import { klartext, textHash } from '../text';

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
  rolle: 'haupt' | 'neben';
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

export function baueBuchKontext(daten: ProjektDaten): BuchKontext {
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
      rolle: f.rolle === 'haupt' ? ('haupt' as const) : ('neben' as const),
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

  return { kapitel, figuren, orte, gruppen, realitaet, text: renderBuch(kapitel, figuren, orte, gruppen, realitaet) };
}

function renderBuch(
  kapitel: KontextKapitel[],
  figuren: KontextFigur[],
  orte: KontextOrt[],
  gruppen: KontextGruppe[],
  realitaet: KontextRealitaet[],
): string {
  const z: string[] = [];
  z.push('<angaben>');
  z.push('Angaben des Autors zu Figuren, Orten und Gruppen. Alles Weitere erfährst du nur aus dem Text.');
  z.push('Zeilen „Planung“ beschreiben, was der Autor vorhat. Sie gehören nicht zum Buch.');
  z.push('');
  z.push('Figuren:');
  if (figuren.length === 0) z.push('- (keine angelegt)');
  for (const f of figuren) {
    const teile = [`${f.name} (id: ${f.id})`];
    if (f.aliase.length) teile.push(`auch: ${f.aliase.join(', ')}`);
    teile.push(f.rolle === 'haupt' ? 'Hauptfigur' : 'Nebenfigur');
    teile.push(`Existenz: ${STUFE_TEXT[f.existenz]}`);
    z.push(`- ${teile.join(' · ')}`);
    for (const p of f.plan) z.push(`  Planung · ${p.feld}: ${p.wert}`);
  }
  z.push('');
  z.push('Orte:');
  if (orte.length === 0) z.push('- (keine angelegt)');
  for (const o of orte) {
    const teile = [`${o.name} (id: ${o.id})`];
    if (o.aliase.length) teile.push(`auch: ${o.aliase.join(', ')}`);
    z.push(`- ${teile.join(' · ')}`);
  }
  z.push('');
  z.push('Gruppen:');
  if (gruppen.length === 0) z.push('- (keine angelegt)');
  for (const g of gruppen) {
    z.push(`- ${g.name} (id: ${g.id}) · ${GRUPPEN_TYP[g.typ]} · ${g.status === 'im_text' ? 'im Text' : 'geplant, noch nicht im Text'}`);
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
        const was = [r.text.trim(), r.anker?.exakt ? `Textstelle: „${r.anker.exakt}“` : ''].filter(Boolean).join(' – ');
        z.push(`- ${STUFE_TEXT[r.stufe]}: ${was || '(ohne Beschreibung)'}`);
      }
      z.push('</realitaetsebene>');
    }
    if (k.plan.szene || k.plan.notiz) {
      z.push('<plan>');
      if (k.plan.szene) z.push(`Geplante Szene: ${k.plan.szene}`);
      if (k.plan.notiz) z.push(`Was hier passieren soll: ${k.plan.notiz}`);
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
}

/** Liest einen mit baueBuchKontext gerenderten Prefix zurück (für den Demo-Transport und Tests). */
export function leseBuchKontext(prefix: string): GelesenerKontext {
  const ergebnis: GelesenerKontext = { kapitel: [], figuren: [], orte: [], gruppen: [] };
  const angaben = /<angaben>\n([\s\S]*?)\n<\/angaben>/.exec(prefix)?.[1] ?? '';
  let abschnitt = '';
  for (const zeile of angaben.split('\n')) {
    if (/^(Figuren|Orte|Gruppen):$/.test(zeile)) {
      abschnitt = zeile.slice(0, -1);
      continue;
    }
    const planZeile = /^  Planung · ([^:]+): (.*)$/.exec(zeile);
    if (planZeile && abschnitt === 'Figuren') {
      ergebnis.figuren[ergebnis.figuren.length - 1]?.plan.push({ feld: planZeile[1] ?? '', wert: planZeile[2] ?? '' });
      continue;
    }
    const m = /^- (.+?) \(id: ([^)]+)\)(.*)$/.exec(zeile);
    if (!m) continue;
    const [, name = '', id = '', rest = ''] = m;
    const aliase = /· auch: ([^·]+)/.exec(rest)?.[1]?.split(',').map((a) => a.trim()).filter(Boolean) ?? [];
    if (abschnitt === 'Figuren') ergebnis.figuren.push({ id, name, aliase, existenz: /Existenz: ([^·]+)/.exec(rest)?.[1]?.trim() ?? '', plan: [] });
    else if (abschnitt === 'Orte') ergebnis.orte.push({ id, name, aliase });
    else if (abschnitt === 'Gruppen') ergebnis.gruppen.push({ id, name });
  }
  const muster = /<kapitel nr="(\d+)" id="([^"]*)" titel="([^"]*)">\n<text>\n([\s\S]*?)\n<\/text>\n(?:<realitaetsebene>\n([\s\S]*?)\n<\/realitaetsebene>\n)?(?:<plan>\n([\s\S]*?)\n<\/plan>\n)?<\/kapitel>/g;
  for (const m of prefix.matchAll(muster)) {
    const realitaet = (m[5] ?? '')
      .split('\n')
      .map((z) => /^- ([^:]+): (.*)$/.exec(z))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ stufe: x[1] ?? '', text: x[2] ?? '' }));
    const plan = m[6] ?? '';
    ergebnis.kapitel.push({
      id: attrLesen(m[2] ?? ''),
      nr: Number(m[1]),
      titel: attrLesen(m[3] ?? ''),
      text: m[4] ?? '',
      realitaet,
      plan: { szene: /^Geplante Szene: (.*)$/m.exec(plan)?.[1] ?? '', notiz: /^Was hier passieren soll: (.*)$/m.exec(plan)?.[1] ?? '' },
    });
  }
  return ergebnis;
}
