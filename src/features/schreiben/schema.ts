/**
 * Dokument-Schema des Editors: Absatz, Überschrift (1–6), Zeilenumbruch, Szenentrenner, fett, kursiv.
 * Die nicht dargestellten Attribute merken sich die Schreibweise aus der Datei (`*`/`_`, Form des
 * Szenentrenners und Umbruchs, Leerraum am Rand), damit Laden und Speichern den Text nicht verändern.
 */
import { Extension, getSchema, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const unsichtbar = (standard: unknown) => ({ default: standard, rendered: false, keepOnSplit: false });

export const MarkupAttribut = Extension.create({
  name: 'markupAttribut',
  addGlobalAttributes() {
    return [
      { types: ['bold', 'italic', 'horizontalRule', 'heading', 'hardBreak'], attributes: { markup: unsichtbar(null) } },
      { types: ['paragraph'], attributes: { einzug: unsichtbar(''), auslauf: unsichtbar('') } },
    ];
  },
});

export function basisErweiterungen(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: false,
      trailingNode: false,
      dropcursor: false,
    }),
    MarkupAttribut,
  ];
}

export const schreibSchema = getSchema(basisErweiterungen());
