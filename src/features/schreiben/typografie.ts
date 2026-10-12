/**
 * Typografie beim Tippen (E7, S-03) über core/typografie, je Buchsprache (Deutsch „ “, Englisch “ ”).
 * Nur bei einzeln getippten Zeichen, nie beim Laden oder Einfügen. Die Ersetzung ist ein eigener Schritt
 * im Verlauf: ⌘Z direkt danach stellt das getippte Zeichen wieder her.
 * Die Buchsprache wird bei jedem Zeichen gelesen (Projektwechsel oder geänderte Angabe wirken sofort).
 */
import { Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Sprache } from '@core/i18n';
import { typografieBeimTippen } from '@core/typografie/index';
import { aktuelleBuchSprache } from '../../i18n/buch';

export const typografieKey = new PluginKey('pw-typografie');

export function typografieAnwenden(view: EditorView, from: number, to: number, text: string, sprache: Sprache = 'de'): boolean {
  if (view.composing || [...text].length !== 1) return false;
  const { state } = view;
  const $from = state.doc.resolve(from);
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  const davor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\n');
  const ersetzung = typografieBeimTippen(davor, text, sprache);
  if (!ersetzung) return false;
  const loeschen = Math.min(ersetzung.loeschen, $from.parentOffset);
  view.dispatch(state.tr.insertText(text, from, to).scrollIntoView());
  const ende = from + text.length;
  view.dispatch(closeHistory(view.state.tr.insertText(ersetzung.einfuegen, from - loeschen, ende)).scrollIntoView());
  // Weiteres Tippen beginnt einen neuen Schritt, damit ⌘Z nur die Ersetzung zurücknimmt
  view.dispatch(closeHistory(view.state.tr));
  return true;
}

export interface TypografieOptionen {
  /** Buchsprache zur Tippzeit (Standard: aus dem Store, projekt.md → angaben.sprache) */
  sprache: () => Sprache;
}

export const Typografie = Extension.create<TypografieOptionen>({
  name: 'typografie',
  priority: 1000,
  addOptions() {
    return { sprache: aktuelleBuchSprache };
  },
  addProseMirrorPlugins() {
    const sprache = () => this.options.sprache();
    return [
      new Plugin({
        key: typografieKey,
        props: { handleTextInput: (view, from, to, text) => typografieAnwenden(view, from, to, text, sprache()) },
      }),
    ];
  },
});
