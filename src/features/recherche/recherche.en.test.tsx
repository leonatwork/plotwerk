import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import EintragDialog from './EintragDialog';
import Ansicht, { kontext } from './index';
import { RechercheLeiste } from './RechercheLeiste';

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }));
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
  });
  useStore.setState({ bereich: 'recherche', auswahl: {}, dialog: null });
  useStore.getState().recherche.filterZuruecksetzen();
  useStore.getState().recherche.waehle(null);
  useStore.getState().recherche.setzeDarstellung('raster');
  festeSprache('en');
});
afterEach(() => vi.restoreAllMocks());

/** sichtbare Oberflächentexte ohne Nutzerdaten (Titel, Notizen der Demo bleiben deutsch) */
const DEUTSCH = ['Neuer Eintrag', 'Filter zurücksetzen', 'Tastatur', 'Ablegen', 'Geheftet an', 'Alle Ziele', 'Schlagwort', 'Bearbeiten', 'Entfernen', 'Notizen'];

describe('Recherche auf Englisch', () => {
  it('Bereich: Filter, Art-Namen, Inspektor und Kontext', () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Research' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search research' })).toHaveAttribute('placeholder', 'Search (⌘F)');
    expect(screen.getByRole('button', { name: /^Images/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Notes/ })).toBeInTheDocument();
    expect(screen.getByText('Research collection')).toBeInTheDocument();
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Attached to' })).toBeInTheDocument();
    for (const wort of DEUTSCH) expect(screen.queryByText(wort, { exact: false })).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Attached to' }), { target: { value: 'figur:paul' } });
    expect(kontext(useStore.getState())).toBe('Research · Character Paul');
    expect(screen.getByText(/^1 of 3 entries$/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search research' }), { target: { value: 'gibt es nicht' } });
    expect(screen.getByText('Nothing found')).toBeInTheDocument();
    expect(screen.getByText('No entry matches “gibt es nicht”.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reset filters' })).toHaveLength(2);
  });

  it('Inspektor eines Eintrags und Leiste an einer Figur', () => {
    const { unmount } = render(<Ansicht />);
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[1]!);
    expect(screen.getByRole('button', { name: 'Open in browser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getAllByText('Character').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Attached to' })).toBeInTheDocument();
    unmount();

    render(<RechercheLeiste ziel={{ typ: 'figur', id: 'paul' }} />);
    const leiste = screen.getByRole('region', { name: 'Research' });
    expect(within(leiste).getByRole('button', { name: 'Research: add entry' })).toHaveTextContent('+ Add');
    expect(within(leiste).getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('Dialog „Neuer Eintrag“', () => {
    render(<EintragDialog param={{ art: 'link' }} schliessen={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'New research entry' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Image/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    expect(screen.getByText(/Plotwerk doesn’t load the page/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. harbor, night (separate with commas)')).toBeInTheDocument();
    expect(screen.queryByText(/Geheftet|Schlagworte|Anlegen|Abbrechen/)).toBeNull();
  });
});
