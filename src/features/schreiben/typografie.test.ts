import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { basisErweiterungen } from './schema';
import { Typografie } from './typografie';

let editor: Editor | null = null;

function neuerEditor(inhalt = '<p></p>'): Editor {
  editor = new Editor({ element: document.createElement('div'), extensions: [...basisErweiterungen(), Typografie], content: inhalt });
  return editor;
}

/** Simuliert das Tippen eines Zeichens wie ProseMirror (handleTextInput, sonst Standard-Einfügen). */
function tippe(ed: Editor, zeichen: string) {
  for (const c of zeichen) {
    const { from, to } = ed.state.selection;
    const view = ed.view;
    const behandelt = view.someProp('handleTextInput', (f) => f(view, from, to, c, () => view.state.tr.insertText(c, from, to)));
    if (!behandelt) view.dispatch(view.state.tr.insertText(c, from, to));
  }
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('Typografie im Editor', () => {
  it('setzt deutsche Anführungszeichen, Gedankenstrich und Auslassungspunkte', () => {
    const ed = neuerEditor();
    tippe(ed, '"Hallo", sagte sie -- und ging...');
    expect(ed.state.doc.textContent).toBe('„Hallo“, sagte sie – und ging…');
  });

  it('setzt einfache Anführungszeichen und Apostroph', () => {
    const ed = neuerEditor();
    tippe(ed, "Er sagt 'ja' und geht's an.");
    expect(ed.state.doc.textContent).toBe('Er sagt ‚ja‘ und geht’s an.');
  });

  it('⌘Z direkt nach der Ersetzung stellt das getippte Zeichen wieder her', () => {
    const ed = neuerEditor();
    tippe(ed, 'Wort "');
    expect(ed.state.doc.textContent).toBe('Wort „');
    ed.commands.undo();
    expect(ed.state.doc.textContent).toBe('Wort "');
    tippe(ed, 'x');
    expect(ed.state.doc.textContent).toBe('Wort "x');
  });

  it('nimmt mit ⌘Z nach weiterem Tippen erst den neuen Text zurück', () => {
    const ed = neuerEditor();
    tippe(ed, 'a--');
    expect(ed.state.doc.textContent).toBe('a–');
    tippe(ed, 'b');
    ed.commands.undo();
    expect(ed.state.doc.textContent).toBe('a–');
    ed.commands.undo();
    expect(ed.state.doc.textContent).toBe('a--');
  });

  it('ändert beim Laden und Einfügen nichts', () => {
    const ed = neuerEditor('<p>"Gerade" -- Zeichen...</p>');
    expect(ed.state.doc.textContent).toBe('"Gerade" -- Zeichen...');
    ed.commands.insertContent('"eingefügt"');
    expect(ed.state.doc.textContent).toContain('"eingefügt"');
  });

  it('behält die Auszeichnung an der Stelle', () => {
    const ed = neuerEditor('<p><em>kursiv</em></p>');
    ed.commands.setTextSelection(7);
    tippe(ed, '"');
    const letzter = ed.state.doc.firstChild!.lastChild!;
    expect(letzter.text).toBe('kursiv“');
    expect(letzter.marks.map((m) => m.type.name)).toEqual(['italic']);
  });
});
