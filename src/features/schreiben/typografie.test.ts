import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { basisErweiterungen } from './schema';
import { Typografie } from './typografie';
import { useStore } from '../../state/store';
import { demoFs } from '../../../fixtures/demoProjekt';

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
  useStore.setState({ daten: null, fs: null });
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

describe('Typografie im Editor – Buchsprache', () => {
  it.each([
    ['de', '„Hallo“ ‚ja‘'],
    ['verlag', '»Hallo« ›ja‹'],
    ['schweiz', '«Hallo» ‹ja›'],
  ] as const)('liest %s zur Tippzeit aus dem Store und erhält Undo', async (anfuehrung, erwartet) => {
    await useStore.getState().projektLaden(demoFs());
    await useStore.getState().abgabe.angabenSpeichern({ sprache: 'de-CH', anfuehrung });
    const ed = neuerEditor('<p>"Bestand"</p>');
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    tippe(ed, ' "Hallo" \'ja\'');
    expect(ed.state.doc.textContent).toBe(`"Bestand" ${erwartet}`);
    ed.commands.undo();
    expect(ed.state.doc.textContent).toBe(`"Bestand" ${erwartet.slice(0, -1)}'`);
    const vorher = ed.state.doc.textContent;
    await useStore.getState().abgabe.angabenSpeichern({ sprache: 'de', anfuehrung: 'schweiz' });
    expect(ed.state.doc.textContent).toBe(vorher);
    tippe(ed, ' "Neu"');
    expect(ed.state.doc.textContent).toBe(`${vorher} «Neu»`);
    await useStore.getState().abgabe.angabenSpeichern({ sprache: 'en', anfuehrung: 'schweiz' });
    tippe(ed, ' "Hello"');
    expect(ed.state.doc.textContent).toBe(`${vorher} «Neu» “Hello”`);
  });

  it('de-CH wählt ohne Stil nicht automatisch Schweizer Zeichen', async () => {
    await useStore.getState().projektLaden(demoFs());
    await useStore.getState().abgabe.angabenSpeichern({ sprache: 'de-CH' });
    const ed = neuerEditor();
    tippe(ed, '"Hallo"');
    expect(ed.state.doc.textContent).toBe('„Hallo“');
  });

  it('setzt bei englischer Buchsprache englische Anführungszeichen und Geviertstrich', () => {
    let sprache: 'de' | 'en' = 'en';
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [...basisErweiterungen(), Typografie.configure({ sprache: () => sprache })],
      content: '<p></p>',
    });
    tippe(editor, '"Don\'t," she said -- and left...');
    expect(editor.state.doc.textContent).toBe('“Don’t,” she said — and left…');
    // Die Sprache wird zur Tippzeit gelesen (geänderte Angabe wirkt ohne Neustart)
    sprache = 'de';
    tippe(editor, ' "Ja"');
    expect(editor.state.doc.textContent).toBe('“Don’t,” she said — and left… „Ja“');
  });

  it('liest ohne Einstellung die Buchsprache aus dem Store (kein Projekt = Deutsch)', () => {
    const ed = neuerEditor();
    tippe(ed, '"a"');
    expect(ed.state.doc.textContent).toBe('„a“');
  });
});
