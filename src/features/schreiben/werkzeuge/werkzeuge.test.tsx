import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../../fixtures/demoProjekt';
import { useStore } from '../../../state/store';
import { SchreibEditor } from '../Editor';
import MarkenDialog from './MarkenDialog';
import { StilTab } from './StilTab';
import { vorlesenAb } from './vorlesen';

class Aeusserung {
  text: string;
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const gesprochen: Aeusserung[] = [];
const synth = {
  speak: vi.fn((u: Aeusserung) => gesprochen.push(u)),
  cancel: vi.fn(),
  getVoices: () => [{ voiceURI: 'lotte', name: 'Lotte', lang: 'de-DE', localService: true, default: false }],
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.assign(globalThis, { speechSynthesis: synth, SpeechSynthesisUtterance: Aeusserung });
});

afterAll(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).speechSynthesis;
  delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  gesprochen.length = 0;
  synth.speak.mockClear();
  synth.cancel.mockClear();
  await useStore.getState().projektLaden(demoFs());
  useStore.getState().waehle({ kapitel: 'flut' });
});

afterEach(() => {
  cleanup();
  const ew = useStore.getState().editorwerkzeuge;
  if (ew.wiederholungen) ew.umschalteWiederholungen();
  if (ew.typewriter) ew.umschalteTypewriter();
});

async function warten(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function schreiben() {
  return render(
    <>
      <SchreibEditor kapitelId="flut" />
      <StilTab kapitelId="flut" />
    </>,
  );
}

describe('Editor-Werkzeuge (G4)', () => {
  it('analysiert das offene Kapitel: Wiederholungen, Satzanfänge, Marken', async () => {
    const { unmount } = schreiben();
    await warten();
    const live = useStore.getState().editorwerkzeuge.live!;
    expect(live.kapitel).toBe('flut');
    expect(live.bericht.nah.map((n) => n.wort)).toContain('zeigt');
    expect(live.marken.map((m) => m.marke.name)).toEqual(expect.arrayContaining(['Volvo', 'Aperol']));
    expect(screen.getByText('Dicht hintereinander · ' + live.bericht.nah.length)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Volvo/ })).toBeTruthy();
    unmount();
  });

  it('markiert Wiederholungen nur als Darstellung, der Text bleibt gleich', async () => {
    const { container, unmount } = schreiben();
    await warten();
    const vorher = useStore.getState().daten!.kapitel['flut']!.text;
    expect(container.querySelector('.pw-w-nah')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Wiederholungen im Text markieren/ }));
    await warten(10);
    const nah = [...container.querySelectorAll('.pw-w-nah')].map((e) => e.textContent);
    expect(nah).toContain('zeigt');
    expect(container.querySelector('.pw-w-anfang')).not.toBeNull();
    // Klick in der Liste springt zur Stelle
    fireEvent.click(screen.getAllByRole('button', { name: /zeigt/ })[0]!);
    await warten(10);
    expect(container.querySelector('.pw-s-markierung')?.textContent).toBe('zeigt');
    // Wort aus „Häufigste Wörter“ hebt alle Vorkommen hervor
    const stunde = screen.getAllByRole('button', { name: /^Stunde/ }).find((b) => b.classList.contains('pw-w-wort'))!;
    fireEvent.click(stunde);
    await warten(10);
    expect(stunde.getAttribute('aria-pressed')).toBe('true');
    expect([...container.querySelectorAll('.pw-w-fokus')].map((e) => e.textContent)).toEqual(['Stunde', 'Stunde', 'Stunde']);
    await warten(3000);
    expect(useStore.getState().daten!.kapitel['flut']!.text).toBe(vorher);
    unmount();
  });

  it('Typewriter: Absatz mit Cursor hell, Papier im Typewriter-Modus', async () => {
    const { container, unmount } = schreiben();
    await warten();
    act(() => useStore.getState().editorwerkzeuge.umschalteTypewriter());
    await warten(10);
    expect(container.querySelector('.pw-s-papier')?.classList.contains('pw-s-papier--typewriter')).toBe(true);
    expect(container.querySelectorAll('.pw-tw-aktiv')).toHaveLength(1);
    act(() => useStore.getState().editorwerkzeuge.umschalteTypewriter());
    await warten(10);
    expect(container.querySelector('.pw-tw-aktiv')).toBeNull();
    unmount();
  });

  it('liest Satz für Satz vor, markiert den Satz, Pause und Stopp', async () => {
    // die Werkzeugleiste steckt in der Statusleiste des Editors
    const { container, unmount } = render(<SchreibEditor kapitelId="flut" />);
    await warten();
    vorlesenAb('anfang');
    act(() => useStore.getState().editorwerkzeuge.setzeVorlesen('laeuft'));
    expect(gesprochen).toHaveLength(1);
    expect(gesprochen[0]!.text).toBe('Ich steige aus dem Volvo, schlage die Tür zu und sehe ihm nach, bis er hinter den Lagerhallen verschwunden ist.');
    expect(gesprochen[0]!.lang).toBe('de-DE');
    expect(container.querySelector('.pw-w-vorlesen')?.textContent).toBe(gesprochen[0]!.text);
    expect(container.querySelector('.pw-w-fortschritt')?.textContent).toMatch(/^Satz 1\/\d+$/);
    act(() => gesprochen[0]!.onend!());
    expect(gesprochen[1]!.text).toMatch(/^Ein Blick auf die Kirchturmuhr/);
    // Pause: Ausgabe abbrechen, Satz merken; Weiter beginnt den Satz neu
    fireEvent.click(screen.getByRole('button', { name: 'Vorlesen pausieren' }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(useStore.getState().editorwerkzeuge.vorlesen).toBe('pausiert');
    act(() => gesprochen[1]!.onend!());
    expect(gesprochen).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Vorlesen fortsetzen' }));
    await warten(100);
    expect(gesprochen).toHaveLength(3);
    expect(gesprochen[2]!.text).toBe(gesprochen[1]!.text);
    fireEvent.click(screen.getByRole('button', { name: 'Stopp' }));
    expect(useStore.getState().editorwerkzeuge.vorlesen).toBe('aus');
    expect(container.querySelector('.pw-w-vorlesen')).toBeNull();
    unmount();
  });
});

describe('Dialog „Markennamen“', () => {
  it('zeigt Vorkommen je Kapitel, nimmt Vorschläge auf und bearbeitet die Liste', async () => {
    const schliessen = vi.fn();
    render(<MarkenDialog schliessen={schliessen} />);
    const dialog = screen.getByRole('dialog');
    const tabelle = within(dialog).getByRole('table');
    expect(within(tabelle).getByText('Volvo')).toBeTruthy();
    expect(within(tabelle).getByText(/Schreibweisen: .*Carl Hansen/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('tab', { name: /Vorschläge/ }));
    const vorschlaege = within(dialog).getByRole('table');
    const zeile = within(vorschlaege).getAllByRole('row')[1]!;
    const name = zeile.querySelector('b')!.textContent!;
    await act(async () => {
      fireEvent.click(within(zeile).getByRole('button', { name: 'Aufnehmen' }));
    });
    expect(useStore.getState().daten!.marken!.marken.map((m) => m.name)).toContain(name);

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Liste' }));
    const feld = within(dialog).getByRole('combobox', { name: 'Kategorie von Kleinanzeigen' }) as HTMLInputElement;
    fireEvent.change(feld, { target: { value: 'Marktplatz' } });
    await act(async () => {
      fireEvent.blur(feld);
    });
    expect(useStore.getState().daten!.marken!.marken.find((m) => m.name === 'Kleinanzeigen')?.kategorie).toBe('Marktplatz');
  });

  it('springt aus der Übersicht in das Kapitel', () => {
    const schliessen = vi.fn();
    render(<MarkenDialog schliessen={schliessen} />);
    fireEvent.click(screen.getByRole('tab', { name: /Im Buch/ }));
    const zeile = screen.getByText('Volvo').closest('tr')!;
    fireEvent.click(within(zeile).getAllByRole('button')[0]!);
    expect(schliessen).toHaveBeenCalled();
    const s = useStore.getState();
    expect(s.bereich).toBe('schreiben');
    expect(s.markierung?.anker.exakt).toMatch(/^Volvo/);
  });
});
