/**
 * TipTap-Erweiterung der Editor-Werkzeuge (G4). Alles hier ist Darstellung, nichts landet im Dokument:
 *  - Wiederholungen: Unterstreichungen (gleiches Wort in kurzer Distanz, Satzanfänge) und das
 *    hervorgehobene Wort aus der Liste „Häufigste Wörter“
 *  - Vorlesen: der gerade gelesene Satz
 *  - Typewriter: Absatz mit dem Cursor bleibt hell, die Zeile mit dem Cursor wandert in die Mitte
 * Die Bereiche werden bei jeder Eingabe mitgeführt (DecorationSet.map) und entprellt neu gesetzt.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

export interface WiederholungsStelle {
  from: number;
  to: number;
  art: 'nah' | 'anfang' | 'fokus';
  titel: string;
}

export const wiederholungKey = new PluginKey<DecorationSet>('pw-wiederholungen');
export const vorlesenKey = new PluginKey<DecorationSet>('pw-vorlesen');
export const typewriterKey = new PluginKey<boolean>('pw-typewriter');

function gemappt(key: PluginKey<DecorationSet>) {
  return {
    init: () => DecorationSet.empty,
    apply(tr: Transaction, alt: DecorationSet): DecorationSet {
      const meta = tr.getMeta(key) as Decoration[] | undefined;
      if (meta) return DecorationSet.create(tr.doc, meta);
      return tr.docChanged ? alt.map(tr.mapping, tr.doc) : alt;
    },
  };
}

export function setzeWiederholungen(view: EditorView, stellen: WiederholungsStelle[]): void {
  const decos = stellen
    .filter((s) => s.to > s.from)
    .map((s) => Decoration.inline(s.from, s.to, { class: `pw-w-${s.art}`, title: s.titel }));
  view.dispatch(view.state.tr.setMeta(wiederholungKey, decos).setMeta('addToHistory', false));
}

export function setzeVorlesen(view: EditorView, bereich: { from: number; to: number } | null): void {
  const decos = bereich && bereich.to > bereich.from ? [Decoration.inline(bereich.from, bereich.to, { class: 'pw-w-vorlesen' })] : [];
  view.dispatch(view.state.tr.setMeta(vorlesenKey, decos).setMeta('addToHistory', false));
}

export function setzeTypewriter(view: EditorView, an: boolean): void {
  if (typewriterKey.getState(view.state) === an) return;
  view.dispatch(view.state.tr.setMeta(typewriterKey, an).setMeta('addToHistory', false));
}

/** Oberster Block, in dem der Cursor steht (Absatz, Überschrift, Zitat …). */
function aktuellerBlock(state: EditorState): { from: number; to: number } | null {
  const $kopf = state.selection.$head;
  if ($kopf.depth < 1) {
    const knoten = state.doc.nodeAt(state.selection.from);
    return knoten ? { from: state.selection.from, to: state.selection.from + knoten.nodeSize } : null;
  }
  const from = $kopf.before(1);
  return { from, to: from + $kopf.node(1).nodeSize };
}

const reduziert = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Scrollt den Papierbereich so, dass die Zeile mit dem Cursor in der Mitte steht. */
export function zeileMittig(view: EditorView, sanft = true): void {
  const papier = view.dom.closest<HTMLElement>('.pw-s-papier');
  if (!papier) return;
  let y: number;
  try {
    const c = view.coordsAtPos(view.state.selection.head);
    y = (c.top + c.bottom) / 2;
  } catch {
    return;
  }
  const r = papier.getBoundingClientRect();
  const ziel = papier.scrollTop + (y - r.top) - papier.clientHeight / 2;
  if (Math.abs(ziel - papier.scrollTop) < 2) return;
  papier.scrollTo({ top: Math.max(0, ziel), behavior: sanft && !reduziert() ? 'smooth' : 'auto' });
}

function typewriterPlugin(): Plugin<boolean> {
  return new Plugin<boolean>({
    key: typewriterKey,
    state: {
      init: () => false,
      apply: (tr, an) => {
        const meta = tr.getMeta(typewriterKey) as boolean | undefined;
        return meta === undefined ? an : meta;
      },
    },
    props: {
      decorations(state) {
        if (!typewriterKey.getState(state)) return null;
        const b = aktuellerBlock(state);
        return b ? DecorationSet.create(state.doc, [Decoration.node(b.from, b.to, { class: 'pw-tw-aktiv' })]) : null;
      },
    },
    view(view) {
      let maus = false;
      let rahmen = 0;
      const planen = () => {
        cancelAnimationFrame(rahmen);
        rahmen = requestAnimationFrame(() => zeileMittig(view));
      };
      const runter = () => {
        maus = true;
      };
      const hoch = () => {
        if (!maus) return;
        maus = false;
        if (typewriterKey.getState(view.state)) planen();
      };
      view.dom.addEventListener('mousedown', runter);
      window.addEventListener('mouseup', hoch);
      return {
        update(v, vorher) {
          const an = typewriterKey.getState(v.state);
          if (!an || maus) return;
          const eingeschaltet = !typewriterKey.getState(vorher);
          if (eingeschaltet || !v.state.selection.eq(vorher.selection) || v.state.doc !== vorher.doc) planen();
        },
        destroy() {
          cancelAnimationFrame(rahmen);
          view.dom.removeEventListener('mousedown', runter);
          window.removeEventListener('mouseup', hoch);
        },
      };
    },
  });
}

export const EditorWerkzeugErweiterung = Extension.create({
  name: 'editorwerkzeuge',
  addProseMirrorPlugins() {
    return [
      new Plugin({ key: wiederholungKey, state: gemappt(wiederholungKey), props: { decorations: (s) => wiederholungKey.getState(s) } }),
      new Plugin({ key: vorlesenKey, state: gemappt(vorlesenKey), props: { decorations: (s) => vorlesenKey.getState(s) } }),
      typewriterPlugin(),
    ];
  },
});
