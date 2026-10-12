import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Ansicht, { kontext, STATUS_LABEL, TYP_LABEL } from './index';
import { HINWEIS_TYPEN, STANDARD_FILTER } from './logik';

describe('Hinweise-Ansicht auf Englisch', () => {
  beforeEach(async () => {
    await act(async () => {
      await useStore.getState().projektLaden(demoFs());
    });
    useStore.getState().indexNeuBerechnen();
    useStore.setState({ hinweisFilter: STANDARD_FILTER, auswahl: {}, bereich: 'hinweise', markierung: null });
    festeSprache('en');
  });

  it('zeigt Titel, Status, Filter, Gruppen und Inspektor auf Englisch', async () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ new · \d+ decided · Quotes appear verbatim in the text/)).toBeInTheDocument();
    const status = screen.getByRole('group', { name: 'Status' });
    expect(within(status).getByRole('button', { name: /^New · \d+$/ })).toBeInTheDocument();
    expect(within(status).getByRole('button', { name: /^Intentional · \d+$/ })).toBeInTheDocument();
    expect(within(status).getByRole('button', { name: /^Done · \d+$/ })).toBeInTheDocument();
    const filter = screen.getByRole('group', { name: 'Filter by type and chapter' });
    expect(within(filter).getByText('All types')).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: 'All chapters' })).toBeInTheDocument();

    const gruppen = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(gruppen).toEqual(expect.arrayContaining(['Check', 'Spelling', 'Loose end', 'Unknown', 'Timeline']));
    expect(screen.getByText('details that might contradict each other')).toBeInTheDocument();

    const inspektor = screen.getByRole('complementary', { name: 'Note inspector' });
    expect(within(inspektor).getByText('open')).toBeInTheDocument();
    expect(within(inspektor).getAllByRole('button', { name: 'Show passage' }).length).toBeGreaterThan(0);
    expect(within(inspektor).getByRole('button', { name: 'Intentional' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(inspektor).getByRole('button', { name: 'Done' }));
    });
    fireEvent.click(within(status).getByRole('button', { name: /^Done · 1$/ }));
    fireEvent.click(document.querySelector<HTMLElement>('.pw-hw-eintrag')!);
    expect(screen.getByRole('button', { name: 'Reset (report again)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filter' })).toBeInTheDocument();

    // KI-Erklärungen sind Daten (im Demo-Projekt deutsch); geprüft wird die Oberfläche
    const text = document.body.textContent ?? '';
    expect(text).toContain('Ch. ');
    for (const wort of ['Hinweis', 'Prüfen', 'Schreibweise', 'Erledigt', 'Absicht', 'Alle Typen', 'Stelle öffnen', 'Zurücksetzen', 'lokal'])
      expect(text).not.toContain(wort);
  });

  it('Typ- und Status-Bezeichnungen sowie der Kontext folgen der Sprache', () => {
    expect(STATUS_LABEL).toMatchObject({ neu: 'New', absicht: 'Intentional', erledigt: 'Done' });
    expect(TYP_LABEL.pruefen).toBe('Check');
    expect(HINWEIS_TYPEN.map((t) => t.label)).toEqual(['Check', 'Spelling', 'Loose end', 'Unknown', 'Structure', 'Timeline', 'Language', 'Characters']);
    expect(kontext(useStore.getState())).toMatch(/^Notes( · \d+ new)?$/);
    festeSprache('de');
    expect(STATUS_LABEL.absicht).toBe('Ist Absicht');
    expect(HINWEIS_TYPEN[0]!.label).toBe('Prüfen');
  });
});
