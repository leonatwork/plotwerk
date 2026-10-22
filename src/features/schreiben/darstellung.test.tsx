import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import { STANDARD_DARSTELLUNG } from '@core/darstellung';
import { initialisiereDarstellung, setzeDarstellung, useDarstellungsStore } from '../../state/darstellung';
import { SchreibEditor } from './Editor';
import { DarstellungAbschnitt } from '../ki/DarstellungAbschnitt';
import { readFileSync } from 'node:fs';
import { zeileMittig } from './werkzeuge/erweiterung';
import type { EditorView } from '@tiptap/pm/view';
import userEvent from '@testing-library/user-event';

const css = readFileSync('src/features/schreiben/schreiben.css', 'utf8');

beforeEach(async () => {
  localStorage.removeItem('plotwerk:darstellung');
  await setzeDarstellung({ ...STANDARD_DARSTELLUNG });
  await useStore.getState().projektLaden(demoFs());
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

describe('Darstellung im Editor', () => {
  it('lässt sich per Tastatur von 17,5 auf 20 ändern und normalisiert ungültige Eingaben beim Verlassen', async () => {
    const user = userEvent.setup();
    render(<DarstellungAbschnitt />);
    const feld = screen.getByLabelText('Schriftgröße (px)');
    await user.clear(feld);
    await user.type(feld, '20');
    expect(useDarstellungsStore.getState().werte.schriftgroesse).toBe(20);
    await user.clear(feld);
    await user.type(feld, '99');
    await user.tab();
    expect(feld).toHaveValue(17.5);
    expect(useDarstellungsStore.getState().werte.schriftgroesse).toBe(17.5);
  });
  it('zentriert die reale Cursorzeilenhöhe auch bei UI-Skalierung in lokalen CSS-Pixeln', async () => {
    await setzeDarstellung({ skalierung: 1.2 });
    const papier = document.createElement('div');
    papier.className = 'pw-s-papier';
    const dom = document.createElement('div');
    papier.append(dom);
    Object.defineProperty(papier, 'clientHeight', { value: 400 });
    papier.scrollTop = 100;
    papier.getBoundingClientRect = () => ({ top: 60 } as DOMRect);
    papier.scrollTo = vi.fn();
    const view = { dom, state: { selection: { head: 1 } }, coordsAtPos: () => ({ top: 420, bottom: 468 }) } as unknown as EditorView;
    zeileMittig(view, false);
    // Zeilenmitte 444; (444 - 60) / 1.2 + 100 - 200 = 220.
    expect(papier.scrollTo).toHaveBeenCalledWith({ top: 220, behavior: 'auto' });
  });
  it('ändert alle Maße sofort, erhält Dokument und Projektdateien sowie Werte beim Projektwechsel', async () => {
    const fs = useStore.getState().fs!;
    const schreiben = vi.spyOn(fs, 'schreiben');
    const { container, unmount } = render(<><DarstellungAbschnitt /><SchreibEditor kapitelId="flut" /></>);
    const article = container.querySelector('article')!;
    const editor = (container.querySelector('.ProseMirror') as HTMLElement & { editor: { state: { doc: unknown } } }).editor;
    const doc = editor.state.doc;
    expect(article.style.getPropertyValue('--editor-schriftgroesse')).toBe('17.5px');
    for (const [name, value] of [['Schriftgröße (px)', '20'], ['Zeilenbreite (px)', '700'], ['Zeilenhöhe', '1.8']]) {
      await act(async () => { fireEvent.change(screen.getByLabelText(name!), { target: { value } }); });
    }
    expect(article.style.getPropertyValue('--editor-schriftgroesse')).toBe('20px');
    expect(article.style.getPropertyValue('--editor-zeilenbreite')).toBe('700px');
    expect(article.style.getPropertyValue('--editor-zeilenhoehe')).toBe('1.8');
    expect(editor.state.doc).toBe(doc);
    expect(schreiben).not.toHaveBeenCalled();
    await act(async () => { useStore.getState().umschalteFokus(); useStore.getState().editorwerkzeuge.umschalteTypewriter(); });
    expect(container.querySelector('.pw-s-papier')).toHaveClass('pw-s-papier--fokus', 'pw-s-papier--typewriter');
    expect(article.style.getPropertyValue('--editor-zeilenhoehe')).toBe('1.8');
    await act(async () => { await useStore.getState().projektLaden(demoFs()); await initialisiereDarstellung(); });
    expect(useDarstellungsStore.getState().werte.schriftgroesse).toBe(20);
    await act(async () => { await setzeDarstellung({ skalierung: 1.2 }); fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' })); });
    expect(useDarstellungsStore.getState().werte).toEqual(STANDARD_DARSTELLUNG);
    expect(article.style.getPropertyValue('--editor-schriftgroesse')).toBe('17.5px');
    unmount();
  });
  it('verwendet CSS-Variablen auch für h4–h6 und Szenentrenner', () => {
    expect(css).toMatch(/flex: 0 1 var\(--editor-zeilenbreite, 530px\)/);
    expect(css).toMatch(/font-size: var\(--editor-schriftgroesse, 17\.5px\)/);
    expect(css).toMatch(/\.pw-s-prosemirror h6\s*\{\s*font-size: var\(--editor-schriftgroesse, 17\.5px\)/);
    expect(css).toMatch(/line-height: var\(--editor-zeilenhoehe, 1\.65\)/);
  });
});
