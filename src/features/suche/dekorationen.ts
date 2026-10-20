import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
const key = new PluginKey<DecorationSet>('pw-volltext');
export const SuchDekorationen = Extension.create({
  name: 'volltext',
  addProseMirrorPlugins() {
    return [new Plugin({ key, state: {
      init: () => DecorationSet.empty,
      apply: (tr, alt) => tr.getMeta(key) ? DecorationSet.create(tr.doc, tr.getMeta(key)) : alt.map(tr.mapping, tr.doc),
    }, props: { decorations: state => key.getState(state) } })];
  },
});
export function setzeSuchtreffer(view: EditorView, stellen: { from: number; to: number }[], aktiv: number) {
  view.dispatch(view.state.tr.setMeta(key, stellen.filter(x => x.to > x.from).map((x, i) => Decoration.inline(x.from, x.to, { class: `pw-s-suchtreffer${i === aktiv ? ' pw-s-suchtreffer--aktiv' : ''}` }))));
}
