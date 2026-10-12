import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import { SchreibEditor } from './Editor';
import { BLASE_VERZOEGERUNG_MS } from './Blase';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function editorVon(container: HTMLElement): Editor {
  const el = container.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('Editor nicht gefunden');
  return el.editor;
}

/** Position direkt vor `text` im Dokument */
function posVor(ed: Editor, text: string): number {
  let gefunden = -1;
  ed.state.doc.descendants((k, pos) => {
    if (gefunden >= 0 || !k.isText) return;
    const i = k.text!.indexOf(text);
    if (i >= 0) gefunden = pos + i;
  });
  if (gefunden < 0) throw new Error(`„${text}“ nicht gefunden`);
  return gefunden;
}

describe('Editor (Integration)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    await useStore.getState().projektLaden(demoFs());
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('lädt das Kapitel, speichert spätestens nach 2 s und setzt den Inhalt dabei nicht neu', async () => {
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    expect(ed.state.doc.textContent).toContain('aus dem Volvo');

    const pos = posVor(ed, 'Ein Blick');
    act(() => {
      const tr = ed.state.tr.insertText('Kurz danach: ', pos);
      ed.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 5)));
    });
    const docVorher = ed.state.doc;
    const auswahlVorher = ed.state.selection.from;

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    const text = useStore.getState().daten!.kapitel['flut']!.text;
    expect(text).toContain('\n\nKurz danach: Ein Blick auf die Kirchturmuhr');
    // eigener Speichervorgang lädt nicht neu: gleiches Dokument, Cursor bleibt
    expect(ed.state.doc).toBe(docVorher);
    expect(ed.state.selection.from).toBe(auswahlVorher);
    // nur die geänderte Stelle unterscheidet sich vom Original
    expect(text.replace('Kurz danach: ', '')).toBe((await demoFs().lesen('manuskript/flut.md'))!.split('---\n\n')[1]!.trimEnd());
    unmount();
  });

  it('führt den Anker einer Notiz mit, wenn sich der Text davor ändert', async () => {
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText('silbernen ', posVor(ed, 'Bleistifte zu Hause')));
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const bleistifte = useStore.getState().daten!.anmerkungen.find((a) => a.id === 'bleistift-motiv')!;
    expect(bleistifte.anker.exakt).toBe('Bleistifte');
    expect(bleistifte.anker.davor.endsWith('meine silbernen ')).toBe(true);
    unmount();
  });

  it('sichert beim Kapitelwechsel sofort und legt einen Schnappschuss an', async () => {
    const { container, rerender, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText('Neu. ', posVor(ed, 'Ich drehe mich um')));
    });
    rerender(<SchreibEditor kapitelId="lotte" />);
    expect(useStore.getState().daten!.kapitel['flut']!.text).toContain('Neu. Ich drehe mich um');
    expect(ed.state.doc.textContent).toContain('Terpentin');
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await useStore.getState().alleSpeichernAbwarten();
    });
    await vi.waitFor(async () => {
      const fs = useStore.getState().fs!;
      const versionen = await fs.auflisten('.versionen/manuskript/flut.md');
      // Stand vor der ersten Änderung dieser Sitzung + Schnappschuss beim Kapitelwechsel
      expect(versionen.length).toBe(2);
      const inhalte = await Promise.all(versionen.map((p) => fs.lesen(p)));
      expect(inhalte.filter((t) => t?.includes('Neu. Ich drehe mich um'))).toHaveLength(1);
    });
    unmount();
  });

  it('Änderung von außen bei ungespeicherten Eingaben: Eingaben bleiben, die andere Fassung landet im Versionsverlauf', async () => {
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText('Lokal. ', posVor(ed, 'Ich drehe mich um')));
    });
    const fs = useStore.getState().fs!;
    const extern = '---\nid: flut\ntitel: Flut\n---\n\nVon außen geschrieben.\n';
    await act(async () => {
      await fs.schreiben('manuskript/flut.md', extern);
      useStore.getState().externGeaendert('manuskript/flut.md');
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {
      await vi.waitFor(() => expect(useStore.getState().externeAenderung).not.toBeNull());
      await vi.runOnlyPendingTimersAsync();
      await useStore.getState().alleSpeichernAbwarten();
    });
    expect(ed.state.doc.textContent).toContain('Lokal. Ich drehe mich um');
    expect(useStore.getState().daten!.kapitel['flut']!.text).toContain('Lokal. Ich drehe mich um');
    expect(await fs.lesen('manuskript/flut.md')).toContain('Lokal. Ich drehe mich um');
    const versionen = await fs.auflisten('.versionen/manuskript/flut.md');
    const inhalte = await Promise.all(versionen.map((p) => fs.lesen(p)));
    expect(inhalte).toContain(extern);
    unmount();
  });

  it('Änderung von außen ohne ungespeicherte Eingaben wird geladen', async () => {
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    const fs = useStore.getState().fs!;
    await act(async () => {
      await fs.schreiben('manuskript/flut.md', '---\nid: flut\ntitel: Flut\n---\n\nVon außen geschrieben.\n');
      useStore.getState().externGeaendert('manuskript/flut.md');
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {
      await vi.waitFor(() => expect(useStore.getState().externeAenderung).not.toBeNull());
    });
    expect(ed.state.doc.textContent).toBe('Von außen geschrieben.');
    unmount();
  });

  it('Blase: Überschrift/Absatz umschalten und Gewissheit einer Stelle festlegen', async () => {
    // jsdom kennt keine Layout-Koordinaten; die Blase misst im nächsten Frame
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    const ed = editorVon(container);
    ed.view.coordsAtPos = () => ({ left: 100, right: 100, top: 100, bottom: 120 });
    const von = posVor(ed, 'dass ich eine halbe Stunde zu früh bin');
    act(() => {
      ed.chain().focus().setTextSelection({ from: von, to: von + 'dass ich eine halbe Stunde zu früh bin'.length }).run();
    });
    // Tastatur-Auswahl: Leiste erst kurz nach der letzten Änderung
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.queryByRole('toolbar', { name: 'Auswahl' })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gewissheit' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bewusst vage/ }));
      await vi.advanceTimersByTimeAsync(10);
      await useStore.getState().alleSpeichernAbwarten();
    });
    const stellen = useStore.getState().daten!.entscheidungen.realitaet;
    expect(stellen).toEqual([{ anker: expect.objectContaining({ kapitel: 'flut', exakt: 'dass ich eine halbe Stunde zu früh bin' }), stufe: 'bewusst_vage' }]);
    expect(container.querySelector('.pw-s-ebene--bewusst_vage')?.textContent).toBe('dass ich eine halbe Stunde zu früh bin');

    // Maus-Auswahl: während des Ziehens keine Leiste, nach dem Loslassen sofort
    // (jsdom kennt elementFromPoint nicht, ProseMirror fragt es beim Mausklick ab)
    vi.stubGlobal('document', Object.assign(document, { elementFromPoint: () => null }));
    fireEvent.mouseDown(ed.view.dom, { button: 0 });
    act(() => {
      ed.chain().focus().setTextSelection({ from: von, to: von + 4 }).run();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 50);
    });
    expect(screen.queryByRole('toolbar', { name: 'Auswahl' })).toBeNull();
    fireEvent.mouseUp(document);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Überschrift' }));
    expect(ed.state.selection.$from.parent.type.name).toBe('heading');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Absatz' }));
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph');
    unmount();
    vi.unstubAllGlobals();
  });
});
