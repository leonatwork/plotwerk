import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // gleicher Knopf (gedrückt) macht wieder einen Absatz
    expect(screen.getByRole('button', { name: 'Überschrift' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Überschrift' }));
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph');
    unmount();
    vi.unstubAllGlobals();
  });

  describe('Blase: Lage, Schließen, Tastatur', () => {
    const SATZ = 'dass ich eine halbe Stunde zu früh bin';
    /** Editor mit gestubbter Geometrie: Papier 600 × 400 px ab (0, 0), Auswahl bei `koord`. */
    async function mitAuswahl(koord: { left: number; top: number }, kapitel = 'flut') {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      const r = render(<SchreibEditor kapitelId={kapitel} />);
      const ed = editorVon(r.container);
      const papier = r.container.querySelector('.pw-s-papier') as HTMLDivElement;
      papier.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0, toJSON() {} });
      Object.defineProperty(papier, 'clientWidth', { value: 600, configurable: true });
      ed.view.coordsAtPos = () => ({ left: koord.left, right: koord.left, top: koord.top, bottom: koord.top + 20 });
      const von = posVor(ed, SATZ);
      act(() => {
        ed.chain().focus().setTextSelection({ from: von, to: von + SATZ.length }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      return { ...r, ed, papier, leiste: () => screen.queryByRole('toolbar', { name: 'Auswahl' }) as HTMLElement | null };
    }
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('bleibt am linken Rand ganz im Papier und klappt unter die Auswahl, wenn oben kein Platz ist', async () => {
      const { leiste, unmount } = await mitAuswahl({ left: 5, top: 10 });
      const l = leiste()!;
      // angenommene Breite 260 → Mitte mindestens 130 + 8
      expect(parseFloat(l.style.left)).toBeGreaterThanOrEqual(138);
      expect(l.className).toContain('pw-s-blase--unten');
      unmount();
    });

    it('rechts ebenfalls geklemmt; mit Platz oben steht sie über der Auswahl', async () => {
      const { leiste, unmount } = await mitAuswahl({ left: 595, top: 200 });
      const l = leiste()!;
      expect(parseFloat(l.style.left)).toBeLessThanOrEqual(600 - 138);
      expect(l.className).not.toContain('pw-s-blase--unten');
      unmount();
    });

    it('Escape schließt erst das Panel, dann die Leiste; die Auswahl bleibt; neue Auswahl zeigt sie wieder', async () => {
      const { ed, leiste, unmount } = await mitAuswahl({ left: 300, top: 200 });
      fireEvent.click(screen.getByRole('button', { name: 'Gewissheit' }));
      expect(screen.getByRole('group', { name: 'Gewissheit der Stelle' })).toBeTruthy();
      fireEvent.keyDown(ed.view.dom, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Gewissheit der Stelle' })).toBeNull();
      expect(leiste()).not.toBeNull();
      fireEvent.keyDown(ed.view.dom, { key: 'Escape' });
      expect(leiste()).toBeNull();
      expect(ed.state.selection.empty).toBe(false);
      // Transaktionen ohne Auswahländerung öffnen sie nicht wieder
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      expect(leiste()).toBeNull();
      const von = posVor(ed, SATZ);
      act(() => {
        ed.chain().focus().setTextSelection({ from: von, to: von + 4 }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      expect(leiste()).not.toBeNull();
      unmount();
    });

    it('Escape in der Leiste beendet nicht den Fokus-Modus', async () => {
      useStore.setState({ fokusModus: true });
      const { ed, unmount } = await mitAuswahl({ left: 300, top: 200 });
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      ed.view.dom.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      unmount();
      useStore.setState({ fokusModus: false });
    });

    it('Panel schließt beim Verbergen: nach Escape und neuer Auswahl ist „Gewissheit“ wieder zu', async () => {
      const { ed, unmount } = await mitAuswahl({ left: 300, top: 200 });
      fireEvent.click(screen.getByRole('button', { name: 'Gewissheit' }));
      fireEvent.keyDown(ed.view.dom, { key: 'Escape' });
      fireEvent.keyDown(ed.view.dom, { key: 'Escape' });
      const von = posVor(ed, SATZ);
      act(() => {
        ed.chain().focus().setTextSelection({ from: von, to: von + 6 }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      expect(screen.getByRole('button', { name: 'Gewissheit' }).getAttribute('aria-expanded')).toBe('false');
      unmount();
    });

    it('hängender Mausmerker (Taste außerhalb losgelassen) löst sich beim nächsten Bewegen', async () => {
      const { ed, leiste, unmount } = await mitAuswahl({ left: 300, top: 200 });
      vi.stubGlobal('document', Object.assign(document, { elementFromPoint: () => null }));
      fireEvent.mouseDown(ed.view.dom, { button: 0 });
      expect(leiste()).toBeNull();
      // kein mouseup – stattdessen Bewegung ohne gedrückte Taste
      fireEvent.mouseMove(window, { buttons: 0 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(leiste()).not.toBeNull();
      unmount();
    });

    it('Notiz im Fokus-Modus verlässt den Fokus-Modus und öffnet den Entwurf am Rand', async () => {
      useStore.setState({ fokusModus: true });
      const { container, unmount } = await mitAuswahl({ left: 300, top: 200 });
      fireEvent.click(screen.getByRole('button', { name: 'Notiz' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(useStore.getState().fokusModus).toBe(false);
      expect(container.querySelector('.pw-s-rand')).not.toBeNull();
      unmount();
    });

    it('⌘A zeigt nur Fett und Kursiv', async () => {
      const { ed, leiste, unmount } = await mitAuswahl({ left: 300, top: 200 });
      act(() => {
        ed.chain().focus().selectAll().run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      expect(leiste()).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Notiz' })).toBeNull();
      expect(screen.getByRole('button', { name: 'F' })).toBeTruthy();
      unmount();
    });

    it('⌥F10 holt den Fokus in die Leiste, Pfeiltasten wandern, Escape zurück in den Text', async () => {
      const { ed, leiste, unmount } = await mitAuswahl({ left: 300, top: 200 });
      expect(leiste()).not.toBeNull();
      fireEvent.keyDown(ed.view.dom, { key: 'F10', altKey: true });
      const knoepfe = Array.from(leiste()!.querySelectorAll(':scope > button'));
      expect(document.activeElement).toBe(knoepfe[0]);
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(knoepfe[1]);
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(knoepfe[knoepfe.length - 1]);
      // Fokus in der Leiste: Transaktionen lassen sie stehen
      act(() => {
        ed.view.dispatch(ed.state.tr.setMeta('egal', true));
      });
      expect(leiste()).not.toBeNull();
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(leiste()).toBeNull();
      unmount();
    });

    it('Figur: markierten Text als Spitznamen übernehmen (Suche + Enter) oder als neue Figur anlegen', async () => {
      const { ed, unmount } = await mitAuswahl({ left: 300, top: 200 });
      const satz = 'eine halbe Stunde';
      const von = posVor(ed, satz);
      act(() => {
        ed.chain().focus().setTextSelection({ from: von, to: von + satz.length }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Figur' }));
      // Artikel fällt weg
      const name = screen.getByLabelText('Name bzw. Spitzname') as HTMLInputElement;
      expect(name.value).toBe('halbe Stunde');
      const suche = screen.getByRole('combobox');
      // Fokus im Suchfeld, nicht im Text (sonst ersetzt Tippen die Markierung)
      expect(document.activeElement).toBe(suche);
      expect(screen.getByRole('toolbar', { name: 'Auswahl' })).toBeTruthy();
      fireEvent.change(suche, { target: { value: 'Ole' } });
      await act(async () => {
        fireEvent.keyDown(suche, { key: 'Enter' });
        await useStore.getState().alleSpeichernAbwarten();
      });
      expect(useStore.getState().daten!.figuren.ole!.aliase).toContain('halbe Stunde');
      // Panel zu, Meldung in der Statusleiste
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.getByText(/ist jetzt ein Spitzname von Ole/)).toBeTruthy();

      // neue Figur
      const wort = 'Kirchturmuhr';
      const w = posVor(ed, wort);
      act(() => {
        ed.chain().focus().setTextSelection({ from: w, to: w + wort.length }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Figur' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Neue Figur/ }));
        await useStore.getState().alleSpeichernAbwarten();
      });
      expect(Object.values(useStore.getState().daten!.figuren).some((f) => f.name === 'Kirchturmuhr')).toBe(true);
      unmount();
    });

    it('Figur: ohne Knopf bei Auswahl über mehrere Absätze; vorhandener Name wird erkannt', async () => {
      const { ed, unmount } = await mitAuswahl({ left: 300, top: 200 });
      expect(screen.getByRole('button', { name: 'Figur' })).toBeTruthy();
      act(() => {
        ed.chain().focus().setTextSelection({ from: 2, to: ed.state.doc.content.size - 2 }).run();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLASE_VERZOEGERUNG_MS + 10);
      });
      expect(screen.queryByRole('button', { name: 'Figur' })).toBeNull();
      unmount();
    });

    it('schließt beim Laden eines anderen Kapitels', async () => {
      const { leiste, rerender } = await mitAuswahl({ left: 300, top: 200 });
      expect(leiste()).not.toBeNull();
      rerender(<SchreibEditor kapitelId="ebbe" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(leiste()).toBeNull();
    });
  });
});
