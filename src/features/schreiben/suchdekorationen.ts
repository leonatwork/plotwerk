import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
const key = new PluginKey<DecorationSet>('pw-suche');
export const SuchDekorationen = Extension.create({
  name: 'suchdekorationen',
  addProseMirrorPlugins() { return [new Plugin({
    key,
    state: {init:() => DecorationSet.empty, apply:(tr,alt) => {
      const stellen = tr.getMeta(key) as Decoration[] | undefined;
      return stellen ? DecorationSet.create(tr.doc,stellen) : alt.map(tr.mapping,tr.doc);
    }},
    props: {decorations:state => key.getState(state)},
  })]; },
});
export function markiereSuchtreffer(editor: Editor, stellen: {from:number;to:number}[], aktiv: number) {
  editor.view.dispatch(editor.state.tr.setMeta(key,stellen.map((b,i) => Decoration.inline(b.from,b.to,{class:`pw-s-suchtreffer${i === aktiv ? ' pw-s-suchtreffer--aktiv' : ''}`}))).setMeta('addToHistory',false));
}
