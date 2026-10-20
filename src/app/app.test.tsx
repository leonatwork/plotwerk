import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { demoFs, ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { useStore } from '../state/store';
import { App } from './App';
import { befehlFuerTaste } from './befehle';
import { useTastenkuerzel } from './tastenkuerzel';
import { suche } from './suche';

const taste = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  befehlFuerTaste({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key, code: '', ...extra });

describe('Tastenkürzel', () => {
  it('öffnet ⌥⌘F als Dialog und lässt ⌘⇧F sowie ⌘K unverändert', async () => {
    await useStore.getState().initialisieren();
    await useStore.getState().projektLaden(demoFs());
    function Kuerzel() { useTastenkuerzel(); return null; }
    render(<Kuerzel />);
    await act(async () => { fireEvent.keyDown(window, { key: 'ƒ', code: 'KeyF', metaKey: true, altKey: true }); });
    expect(useStore.getState().dialog?.id).toBe('projektsuche');
    expect(useStore.getState().fokusModus).toBe(false);
    act(() => useStore.getState().schliesseDialog());
    await act(async () => { fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true }); });
    expect(useStore.getState().fokusModus).toBe(true);
    await act(async () => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
    expect(useStore.getState().dialog?.id).toBe('schnellsuche');
    act(() => { useStore.getState().schliesseDialog(); useStore.getState().umschalteFokus(); });
  });
  it('⌥⌘F ist Projektsuche, ⌘F Kapitelsuche, ⌘⇧F bleibt Fokus', () => {
    expect(taste('f', { altKey: true })).toBe('projektsuche');
    expect(befehlFuerTaste({ metaKey: true, ctrlKey: false, altKey: true, shiftKey: false, key: 'ƒ', code: 'KeyF' })).toBe('projektsuche');
    expect(taste('f')).toBe('suchen');
    expect(taste('F', { shiftKey: true })).toBe('fokus');
    expect(taste('f', { altKey: true, shiftKey: true })).toBeNull();
  });
  it('⌘1–⌘0, ⌘K, ⌘⇧F, ⌘⇧T, ⌘E, ⌘,', () => {
    expect(taste('1')).toBe('schreiben');
    expect(taste('7')).toBe('hinweise');
    expect(taste('k')).toBe('schnellsuche');
    expect(taste('F', { shiftKey: true })).toBe('fokus');
    expect(taste('e')).toBe('export');
    expect(taste(',')).toBe('einstellungen');
    expect(taste('k', { metaKey: false })).toBeNull();
    expect(taste('8')).toBe('zeitleiste');
    expect(taste('9')).toBe('faeden');
    expect(taste('0')).toBe('recherche');
    expect(taste('T', { shiftKey: true })).toBe('typewriter');
    expect(taste('j')).toBeNull();
  });
});

describe('Schnellsuche', () => {
  it('findet Kapitel, Figuren und Orte', async () => {
    const daten = await ladeDemoProjekt();
    expect(suche(daten, 'lotte').map((t) => `${t.art}:${t.id}`)).toEqual(expect.arrayContaining(['kapitel:lotte', 'figur:lotte']));
    expect(suche(daten, 'buero')[0]).toMatchObject({ art: 'ort', id: 'buero', bereich: 'orte' });
    expect(suche(daten, 'linden')[0]).toMatchObject({ art: 'ort', id: 'lindenhof' });
    expect(suche(daten, 'li')[0]).toMatchObject({ art: 'ort', id: 'lindenhof' });
    expect(suche(daten, 'kap. 3')[0]).toMatchObject({ art: 'kapitel', id: 'lotte' });
    expect(suche(daten, '9')[0]).toMatchObject({ art: 'kapitel', id: 'flut' });
    expect(suche(daten, 'xyz')).toEqual([]);
  });

  it('findet Werkzeug-Bereiche und -Befehle', async () => {
    const daten = await ladeDemoProjekt();
    expect(suche(daten, 'zeitleiste')[0]).toMatchObject({ art: 'bereich', id: 'zeitleiste', bereich: 'zeitleiste' });
    expect(suche(daten, 'normseite')[0]).toMatchObject({ art: 'befehl', befehl: 'abgabe' });
    expect(suche(daten, 'fragen an das buch')[0]).toMatchObject({ art: 'bereich', id: 'fragen' });
    expect(suche(daten, '').some((t) => t.art === 'bereich')).toBe(false);
  });
});

describe('App im Browser-Demo', () => {
  it('lädt das Demo-Projekt und zeigt Rahmen, Navigation und Bereiche', async () => {
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Bereiche' });
    const eintraege = within(nav).getAllByRole('button');
    expect(eintraege.map((e) => e.textContent?.replace(/\d+.*$/, ''))).toEqual([
      'Schreiben', 'Kapitel-Überblick', 'Akte planen', 'Figuren', 'Beziehungen', 'Orte', 'Hinweise', 'Werkzeuge',
    ]);
    expect(screen.getByText('Hafenlichter')).toBeInTheDocument();
    expect(await screen.findByText('Kap. 1 · Grundriss', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Kapitel prüfen' }, { timeout: 5000 })).toBeInTheDocument();
    // Gruppe „Werkzeuge“ ist eingeklappt; aufklappen zeigt die Werkzeug-Bereiche
    const gruppe = within(nav).getByRole('button', { name: 'Werkzeuge' });
    expect(gruppe).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(gruppe);
    expect(gruppe).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getAllByRole('button').slice(8).map((e) => e.textContent)).toEqual(['Zeitleiste', 'Lose Enden', 'Recherche', 'Statistik', 'Fragen']);
    fireEvent.click(within(nav).getByText('Zeitleiste'));
    expect(useStore.getState().bereich).toBe('zeitleiste');
    expect(await screen.findByRole('heading', { name: 'Zeitleiste', level: 1 })).toBeInTheDocument();
    fireEvent.click(gruppe);
    // eingeklappt bleibt das aktive Werkzeug sichtbar
    expect(within(nav).getByText('Zeitleiste')).toBeInTheDocument();
    expect(within(nav).queryByText('Statistik')).toBeNull();

    fireEvent.click(within(nav).getByText('Figuren'));
    expect(useStore.getState().bereich).toBe('figuren');
    expect(within(nav).getByText('Figuren').closest('button')).toHaveAttribute('aria-current', 'page');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    const eingabe = await screen.findByRole('searchbox', { name: /suchen/ });
    fireEvent.change(eingabe, { target: { value: 'Vera' } });
    fireEvent.keyDown(eingabe, { key: 'Enter' });
    expect(useStore.getState().auswahl.figur).toBe('vera');
    expect(useStore.getState().dialog).toBeNull();
    expect(await screen.findByText('Figuren · Vera')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true });
    });
    expect(screen.queryByRole('navigation', { name: 'Bereiche' })).toBeNull();
  }, 15_000);
});
