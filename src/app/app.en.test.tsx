import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../backend/demo';
import { festeSprache } from '../i18n';
import { useStore } from '../state/store';
import { bestaetigen, BestaetigungHost, REALITAET_LABEL, RealitaetsUmschalter } from '../ui';
import { App } from './App';
import { BEREICHE, bereichDefinition } from './bereiche';
import { Startbildschirm } from './Startbildschirm';
import { suche } from './suche';

const DEUTSCH = /Schreiben|Figuren|Orte|Hinweise|Werkzeuge|Kapitel|öffnen|Projekt|Suchen|Abbrechen/;

describe('Oberfläche auf Englisch', () => {
  it('Startbildschirm ohne Projekt', () => {
    festeSprache('en');
    useStore.setState({ backend: erstelleDemoBackend(), fehler: null });
    const { container } = render(<Startbildschirm />);
    expect(screen.getByRole('button', { name: 'Open project folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('textbox', { name: 'Title of the new project' })).toHaveAttribute('placeholder', 'Book title');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(container.textContent).toContain('Write and plan in your own project folder.');
    expect(container.textContent).not.toMatch(DEUTSCH);
  });

  it('Bereichsnamen folgen der Sprache, IDs und Tasten bleiben', () => {
    festeSprache('en');
    expect(BEREICHE.map((b) => b.titel)).toEqual([
      'Write', 'Chapter overview', 'Plan acts', 'Characters', 'Relationships', 'Places', 'Notes',
      'Timeline', 'Loose ends', 'Research', 'Statistics', 'Questions',
    ]);
    expect(bereichDefinition('zeitleiste')).toMatchObject({ id: 'zeitleiste', taste: '8', titel: 'Timeline' });
    festeSprache('de');
    expect(bereichDefinition('zeitleiste').titel).toBe('Zeitleiste');
  });

  it('Schnellsuche findet mit englischen (und deutschen) Begriffen', async () => {
    festeSprache('en');
    const daten = await ladeDemoProjekt();
    expect(suche(daten, 'timeline')[0]).toMatchObject({ art: 'bereich', id: 'zeitleiste', titel: 'Timeline', zusatz: '⌘8' });
    expect(suche(daten, 'questions for the book')[0]).toMatchObject({ art: 'bereich', id: 'fragen', titel: 'Questions', zusatz: 'Tool' });
    expect(suche(daten, 'standard manuscript')[0]).toMatchObject({ art: 'befehl', befehl: 'abgabe', titel: 'Export for submission …' });
    expect(suche(daten, 'synopsis')[0]).toMatchObject({ art: 'befehl', befehl: 'abgabe' });
    expect(suche(daten, 'book preview')[0]).toMatchObject({ art: 'befehl', befehl: 'vorschau', titel: 'Book preview' });
    expect(suche(daten, 'snapshot')[0]).toMatchObject({ art: 'befehl', befehl: 'fassung', titel: 'Save draft version …' });
    // deutsche Begriffe treffen zusätzlich, Titel bleiben englisch
    expect(suche(daten, 'normseite')[0]).toMatchObject({ art: 'befehl', befehl: 'abgabe', titel: 'Export for submission …' });
    expect(suche(daten, 'ch. 3')[0]).toMatchObject({ art: 'kapitel', id: 'lotte', zusatz: 'Ch. 3' });
    expect(suche(daten, 'vera')[0]).toMatchObject({ art: 'figur', zusatz: 'Character' });
    expect(suche(daten, 'buero')[0]).toMatchObject({ art: 'ort', zusatz: 'Place' });
  });

  it('Seitenleiste und Schnellsuche im Fenster', async () => {
    festeSprache('en');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    const eintraege = within(nav).getAllByRole('button');
    expect(eintraege.map((e) => e.textContent?.replace(/\d+.*$/, ''))).toEqual([
      'Write', 'Chapter overview', 'Plan acts', 'Characters', 'Relationships', 'Places', 'Notes', 'Tools',
    ]);
    expect(within(nav).getByRole('button', { name: /^Write/ })).toHaveAttribute('title', 'Write (⌘1)');
    fireEvent.click(within(nav).getByRole('button', { name: 'Tools' }));
    expect(within(nav).getAllByRole('button').slice(8).map((e) => e.textContent)).toEqual(['Timeline', 'Loose ends', 'Research', 'Statistics', 'Questions']);
    expect(nav.textContent).not.toMatch(DEUTSCH);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    const eingabe = await screen.findByRole('searchbox', { name: 'Search characters, places and chapters' }, { timeout: 5000 });
    expect(eingabe).toHaveAttribute('placeholder', 'Characters, places, chapters …');
    fireEvent.change(eingabe, { target: { value: 'xyz' } });
    expect(screen.getByText('No results.')).toBeInTheDocument();
    fireEvent.change(eingabe, { target: { value: 'threads' } });
    const liste = screen.getByRole('listbox', { name: 'Results' });
    expect(within(liste).getAllByRole('option')[0]).toHaveTextContent('Loose ends⌘9');
    fireEvent.keyDown(eingabe, { key: 'Enter' });
    expect(useStore.getState().bereich).toBe('faeden');
    expect(useStore.getState().dialog).toBeNull();
  });

  it('Rückfrage, Dialog und Gewissheit', async () => {
    festeSprache('en');
    render(<BestaetigungHost />);
    let antwort: Promise<boolean> | undefined;
    act(() => {
      antwort = bestaetigen('Delete this?');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await expect(antwort).resolves.toBe(true);

    render(<RealitaetsUmschalter wert="offen" onChange={() => {}} />);
    const gruppe = screen.getByRole('group', { name: 'Certainty' });
    expect(within(gruppe).getAllByRole('button').map((b) => b.textContent)).toEqual(['confirmed', 'open', 'deliberately vague']);
    expect(REALITAET_LABEL.bewusst_vage).toBe('deliberately vague');
  });
});
