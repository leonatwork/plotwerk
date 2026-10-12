/**
 * Darstellung im Text, die nicht im Dokument gespeichert wird: Figuren-Unterstreichung (S-10),
 * Hinterlegung der Anmerkungen (S-06), Stellen mit Realitätsebene und die vorübergehende Markierung
 * einer Stelle (Hinweis, Sprung).
 * Bereiche werden bei jeder Änderung mitgeführt (DecorationSet.map); neu berechnet wird entprellt.
 */
import { Extension, nodeInputRule } from '@tiptap/core';
import type { Id, Realitaet } from '@core/model/types';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { f, texte } from '../../i18n';

export interface FigurStelle {
  from: number;
  to: number;
  figur: Id;
  name: string;
  /** Hauptfigur der Szene: Akzent statt gepunktet */
  fokus: boolean;
}

export interface NotizStelle {
  from: number;
  to: number;
  id: Id;
  farbe: 'gelb' | 'rosa';
  aktiv: boolean;
}

export interface EbenenStelle {
  from: number;
  to: number;
  stufe: Realitaet;
}

/** Offene Änderung der Lektorin (G7, lektorat/aenderungen.json) – nur markiert, angenommen wird im Dialog. */
export interface LektoratStelle {
  from: number;
  to: number;
  art: 'einfuegen' | 'loeschen' | 'ersetzen';
  titel: string;
}

export interface DekoHandler {
  /** ⌘-Klick auf eine unterstrichene Figur */
  figurOeffnen?(figur: Id): void;
  /** Klick in den Text: Anmerkung an der Stelle oder null */
  notizGeklickt?(id: Id | null): void;
}

export const figurenKey = new PluginKey<DecorationSet>('pw-figuren');
export const notizenKey = new PluginKey<DecorationSet>('pw-notizen');
export const markierungKey = new PluginKey<DecorationSet>('pw-markierung');
export const ebenenKey = new PluginKey<DecorationSet>('pw-ebenen');
export const lektoratKey = new PluginKey<DecorationSet>('pw-lektorat');


function gemappt(key: PluginKey<DecorationSet>, leeren = false) {
  return {
    init: () => DecorationSet.empty,
    apply(tr: Transaction, alt: DecorationSet): DecorationSet {
      const meta = tr.getMeta(key) as Decoration[] | undefined;
      if (meta) return DecorationSet.create(tr.doc, meta);
      if (!tr.docChanged) return alt;
      return leeren ? DecorationSet.empty : alt.map(tr.mapping, tr.doc);
    },
  };
}

export function figurDekorationen(stellen: FigurStelle[]): Decoration[] {
  const vorlage = texte().schreiben.deko.figur;
  return stellen
    .filter((s) => s.to > s.from)
    .map((s) =>
      Decoration.inline(
        s.from,
        s.to,
        { class: s.fokus ? 'pw-s-figur pw-s-figur--fokus' : 'pw-s-figur', 'data-figur': s.figur, title: f(vorlage, { name: s.name }) },
        { figur: s.figur },
      ),
    );
}

export function notizDekorationen(stellen: NotizStelle[]): Decoration[] {
  return stellen
    .filter((s) => s.to > s.from)
    .map((s) =>
      Decoration.inline(
        s.from,
        s.to,
        { class: `pw-s-notiz pw-s-notiz--${s.farbe}${s.aktiv ? ' pw-s-notiz--aktiv' : ''}`, 'data-anmerkung': s.id },
        { anmerkung: s.id, inclusiveStart: false, inclusiveEnd: false },
      ),
    );
}

export function ebenenDekorationen(stellen: EbenenStelle[]): Decoration[] {
  const titel = texte().schreiben.deko.ebene;
  return stellen
    .filter((s) => s.to > s.from)
    .map((s) => Decoration.inline(s.from, s.to, { class: `pw-s-ebene pw-s-ebene--${s.stufe}`, title: titel[s.stufe] }));
}

export function lektoratDekorationen(stellen: LektoratStelle[]): Decoration[] {
  return stellen
    .filter((s) => s.to > s.from)
    .map((s) => Decoration.inline(s.from, s.to, { class: `pw-s-lektorat pw-s-lektorat--${s.art}`, title: s.titel }));
}

export function setzeLektorat(view: EditorView, stellen: LektoratStelle[]): void {
  view.dispatch(view.state.tr.setMeta(lektoratKey, lektoratDekorationen(stellen)).setMeta('addToHistory', false));
}

export function setzeEbenen(view: EditorView, stellen: EbenenStelle[]): void {
  view.dispatch(view.state.tr.setMeta(ebenenKey, ebenenDekorationen(stellen)).setMeta('addToHistory', false));
}

export function setzeFiguren(view: EditorView, stellen: FigurStelle[]): void {
  view.dispatch(view.state.tr.setMeta(figurenKey, figurDekorationen(stellen)).setMeta('addToHistory', false));
}

export function setzeNotizen(view: EditorView, stellen: NotizStelle[]): void {
  view.dispatch(view.state.tr.setMeta(notizenKey, notizDekorationen(stellen)).setMeta('addToHistory', false));
}

/** Hebt eine Stelle hervor, bis wieder getippt wird (null = aufheben). */
export function setzeMarkierung(view: EditorView, bereich: { from: number; to: number } | null): void {
  const decos = bereich && bereich.to > bereich.from ? [Decoration.inline(bereich.from, bereich.to, { class: 'pw-s-markierung' })] : [];
  view.dispatch(view.state.tr.setMeta(markierungKey, decos).setMeta('addToHistory', false));
}

/** Aktuelle (mitgeführte) Bereiche der Anmerkungen im Text. */
export function notizBereiche(state: EditorState): Map<Id, { from: number; to: number }> {
  const ergebnis = new Map<Id, { from: number; to: number }>();
  const set = notizenKey.getState(state);
  if (!set) return ergebnis;
  for (const d of set.find()) {
    const id = (d.spec as { anmerkung?: Id }).anmerkung;
    if (id && d.to > d.from) ergebnis.set(id, { from: d.from, to: d.to });
  }
  return ergebnis;
}

/** Figuren-Stellen, die den Bereich berühren (für das Ziel einer neuen Notiz). */
export function figurenBei(state: EditorState, from: number, to: number): { figur: Id; from: number; to: number }[] {
  const set = figurenKey.getState(state);
  if (!set) return [];
  return set.find(from, to).map((d) => ({ figur: (d.spec as { figur: Id }).figur, from: d.from, to: d.to }));
}

export const Dekorationen = Extension.create<{ handler: DekoHandler }>({
  name: 'dekorationen',
  addOptions() {
    return { handler: {} };
  },
  addInputRules() {
    const typ = this.editor.schema.nodes.horizontalRule;
    return typ ? [nodeInputRule({ find: /^\* \* \*$/, type: typ })] : [];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-Enter': () => this.editor.chain().focus().setHorizontalRule().run(),
    };
  },
  addProseMirrorPlugins() {
    const handler = this.options.handler;
    return [
      new Plugin({
        key: figurenKey,
        state: gemappt(figurenKey),
        props: {
          decorations: (state) => figurenKey.getState(state),
          handleClick(view, pos, event) {
            if (!(event.metaKey || event.ctrlKey) || !handler.figurOeffnen) return false;
            const treffer = figurenKey.getState(view.state)?.find(pos, pos)[0];
            if (!treffer) return false;
            handler.figurOeffnen((treffer.spec as { figur: Id }).figur);
            return true;
          },
        },
      }),
      new Plugin({
        key: notizenKey,
        state: gemappt(notizenKey),
        props: {
          decorations: (state) => notizenKey.getState(state),
          handleClick(view, pos) {
            const treffer = notizenKey.getState(view.state)?.find(pos, pos)[0];
            handler.notizGeklickt?.(treffer ? (treffer.spec as { anmerkung: Id }).anmerkung : null);
            return false;
          },
        },
      }),
      new Plugin({
        key: ebenenKey,
        state: gemappt(ebenenKey),
        props: { decorations: (state) => ebenenKey.getState(state) },
      }),
      new Plugin({
        key: lektoratKey,
        state: gemappt(lektoratKey),
        props: { decorations: (state) => lektoratKey.getState(state) },
      }),
      new Plugin({
        key: markierungKey,
        state: gemappt(markierungKey, true),
        props: { decorations: (state) => markierungKey.getState(state) },
      }),
    ];
  },
});
