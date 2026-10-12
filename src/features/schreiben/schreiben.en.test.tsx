/** Schreibbereich in der englischen Oberfläche: Statusleiste, Kapitelliste, Inspektor, Formatierungsblase. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { BLASE_VERZOEGERUNG_MS } from './Blase';
import { SchreibEditor } from './Editor';
import { KapitelListe } from './KapitelListe';
import { SchreibInspektor } from './SchreibInspektor';
import { kapitelAnzeige } from './verweise';
import { notizKopf } from './ziele';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  await useStore.getState().projektLaden(demoFs());
  useStore.getState().waehle({ kapitel: 'flut' });
  festeSprache('en');
});

function editorVon(container: HTMLElement): Editor {
  const el = container.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('Editor nicht gefunden');
  return el.editor;
}

const DEUTSCH = /Wörter|Wort |gesamt|Automatisch gespeichert|Speichert|Versionsverlauf|Kapitel planen|geplant|Entwurf|Erkannt|Hinweise|Stil\b|Geplante Szene|Ich weiche/;

describe('Schreiben auf Englisch', () => {
  it('zeigt Statusleiste, Kapitelliste und Inspektor auf Englisch', async () => {
    const { container, unmount } = render(
      <>
        <KapitelListe />
        <SchreibEditor kapitelId="flut" />
        <SchreibInspektor kapitelId="flut" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const status = container.querySelector('.pw-s-status') as HTMLElement;
    expect(status.textContent).toMatch(/[\d,]+ words? in this chapter · [\d,]+ total/);
    expect(within(status).getByRole('button', { name: 'Version history' })).toBeTruthy();
    expect(status.textContent).toMatch(/Saved automatically|Saving …/);

    const liste = container.querySelector('.pw-s-kapitel') as HTMLElement;
    expect(within(liste).getByRole('button', { name: '+ Plan chapter' })).toBeTruthy();
    expect(liste.querySelector('[aria-roledescription="movable chapter"]')).toBeTruthy();

    expect(screen.getByRole('tab', { name: 'Plan' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Detected' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Notes/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    expect(screen.getByText('Planned scene')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I’m deviating here' })).toBeTruthy();

    expect(container.querySelector('.pw-s-kopf-label')?.textContent).toMatch(/^Chapter \d+/);
    expect(container.querySelector('.pw-s-titel')?.getAttribute('aria-label')).toBe('Chapter title');
    expect(container.querySelector('.ProseMirror')?.getAttribute('aria-label')).toBe('Chapter text');

    for (const el of [status.firstElementChild as HTMLElement, liste, container.querySelector('.pw-s-kopf-label')!]) expect(el.textContent).not.toMatch(DEUTSCH);
    expect(screen.queryByRole('tab', { name: /Erkannt|Hinweise|Stil/ })).toBeNull();
    unmount();
  });

  it('zeigt die Formatierungsblase mit englischen Kürzeln', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    ed.view.coordsAtPos = () => ({ left: 100, right: 100, top: 100, bottom: 120 });
    act(() => {
      ed.chain().focus().setTextSelection({ from: 2, to: 8 }).run();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 50);
    });
    const blase = screen.getByRole('toolbar', { name: 'Selection' });
    const knoepfe = within(blase).getAllByRole('button');
    expect(knoepfe.slice(0, 3).map((k) => k.textContent)).toEqual(['B', 'I', 'H']);
    expect(knoepfe[0]!.getAttribute('title')).toBe('Bold (⌘B)');
    expect(knoepfe[1]!.getAttribute('title')).toBe('Italic (⌘I)');
    expect(within(blase).getByRole('button', { name: 'Heading' })).toBeTruthy();
    expect(within(blase).getByRole('button', { name: 'Comment' })).toBeTruthy();
    fireEvent.click(within(blase).getByRole('button', { name: 'Certainty' }));
    const ebenen = within(blase).getByRole('group', { name: 'Certainty of the passage' });
    expect(within(ebenen).getAllByRole('button').map((k) => k.textContent)).toEqual(['confirmed', 'open', 'deliberately vague']);
    expect(blase.textContent).not.toMatch(/Notiz|Ebene|gesichert|bewusst vage|Ü/);
    unmount();
    vi.unstubAllGlobals();
  });

  it('beschriftet Notizen und Kapitelverweise auf Englisch', () => {
    const daten = useStore.getState().daten!;
    expect(notizKopf(daten, { typ: 'figur', id: 'paul' }, 'flut')).toEqual({ praefix: 'Comment for', name: 'Paul' });
    expect(notizKopf(daten, { typ: 'figur', id: 'lotte' }, 'flut', true)).toEqual({ praefix: 'New comment for', name: 'Lotte' });
    expect(notizKopf(daten, { typ: 'kapitel', id: 'flut' }, 'flut')).toEqual({ praefix: 'Comment on the', name: 'chapter' });
    expect(kapitelAnzeige(daten, 'lotte')).toBe('Ch. 3 · Lotte');
  });
});
