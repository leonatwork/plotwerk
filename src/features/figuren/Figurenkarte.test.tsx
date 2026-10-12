/** Figurenkarte: Abschnitt „Bogen“ (G3) – Stufen, aktuelle Stufe, Sprung in den Tab „Bögen“. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFs } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { useStore } from '../../state/store';
import Figuren from './index';

beforeEach(async () => {
  useStore.setState({ backend: erstelleDemoBackend(), dialog: null, markierung: null });
  await useStore.getState().projektLaden(new MemoryFs(demoDateien()));
  useStore.setState((s) => ({
    bereich: 'figuren',
    figurenbogen: { ...s.figurenbogen, figurenAnsicht: 'karte', gewaehlteStufe: null, vergleich: [] },
  }));
});

describe('Figurenkarte – Abschnitt „Bogen“', () => {
  it('zeigt die Stufen in Buchreihenfolge mit Kapitel/Akt; die im gewählten Kapitel geltende Stufe ist „aktuell“', () => {
    useStore.getState().waehle({ figur: 'paul', kapitel: 'ebbe' });
    render(<Figuren />);
    const bogen = screen.getByRole('list', { name: 'Bogen von Paul' });
    const zeilen = within(bogen).getAllByRole('listitem');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toHaveTextContent(/^Alles im Lot.*1 Beleg.*Kap\. 3$/);
    expect(zeilen[1]).toHaveTextContent(/^Erste Risse.*aktuell.*Kap\. 7$/);
    expect(zeilen[2]).toHaveTextContent(/^Ohne Schlaf.*Akt III$/);
    expect(within(bogen).getByRole('button', { name: 'Erste Risse' })).toHaveAttribute('aria-current', 'step');
    expect(within(bogen).getByRole('button', { name: 'Alles im Lot' })).not.toHaveAttribute('aria-current');
    expect(within(bogen).getByRole('button', { name: 'Ohne Schlaf' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText(/Aktuell: die Stufe, die in Kap\. 7 gilt\./)).toBeInTheDocument();
  });

  it('aktuelle Stufe folgt dem gewählten Kapitel; vor der ersten Stufe gilt keine', () => {
    useStore.getState().waehle({ figur: 'paul', kapitel: 'funkstille' });
    const { rerender } = render(<Figuren />);
    expect(screen.getByRole('button', { name: 'Ohne Schlaf' })).toHaveAttribute('aria-current', 'step');

    useStore.getState().waehle({ kapitel: 'grundriss' });
    rerender(<Figuren />);
    const bogen = screen.getByRole('list', { name: 'Bogen von Paul' });
    expect(within(bogen).queryByText('aktuell')).toBeNull();
    expect(screen.getByText(/In Kap\. 1 ist noch keine Stufe erreicht\./)).toBeInTheDocument();
  });

  it('Klick auf eine Stufe öffnet den Tab „Bögen“ mit dieser Figur und der Stufe', () => {
    useStore.getState().waehle({ figur: 'paul', kapitel: 'ebbe' });
    render(<Figuren />);
    fireEvent.click(screen.getByRole('button', { name: 'Ohne Schlaf' }));
    const s = useStore.getState();
    expect(s.bereich).toBe('figuren');
    expect(s.auswahl.figur).toBe('paul');
    expect(s.figurenbogen.figurenAnsicht).toBe('boegen');
    expect(s.figurenbogen.gewaehlteStufe).toEqual({ figur: 'paul', stufe: 'schlaflos' });
    expect(screen.getByRole('button', { name: /Stufe „Ohne Schlaf“ von Paul/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Stufe „Ohne Schlaf“ bearbeiten' })).toBeInTheDocument();
  });

  it('ohne Stufen: Link „Bogen anlegen“ öffnet den Tab „Bögen“ mit der Figur', () => {
    useStore.getState().waehle({ figur: 'ole' });
    render(<Figuren />);
    expect(screen.getByText(/Noch keine Entwicklungsstufen geplant/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bogen anlegen' }));
    expect(useStore.getState().figurenbogen.figurenAnsicht).toBe('boegen');
    expect(useStore.getState().figurenbogen.gewaehlteStufe).toBeNull();
    expect(useStore.getState().auswahl.figur).toBe('ole');
    expect(screen.getByRole('button', { name: /Erste Stufe planen/ })).toBeInTheDocument();
  });
});

describe('Figurenkarte – Spitznamen als Chips (F-08/F-16)', () => {
  it('Enter und Komma fügen hinzu, × entfernt; Klick öffnet den Kontext (wer, ab wann)', async () => {
    useStore.getState().waehle({ figur: 'ole' });
    render(<Figuren />);
    const feld = screen.getByLabelText('Auch genannt / Spitzname');
    fireEvent.change(feld, { target: { value: 'Fenster-Ole' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    fireEvent.change(feld, { target: { value: 'der Kollege, Olli,' } });
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.figuren.ole!.aliase).toEqual(['Fenster-Ole', 'der Kollege', 'Olli']);

    fireEvent.click(screen.getByRole('button', { name: 'Olli' }));
    const kontext = screen.getByRole('group', { name: 'Kontext zu Olli' });
    fireEvent.change(within(kontext).getAllByRole('combobox')[0]!, { target: { value: 'paul' } });
    fireEvent.change(within(kontext).getAllByRole('combobox')[1]!, { target: { value: 'ebbe' } });
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.figuren.ole!.spitznamen).toEqual([{ name: 'Olli', von: ['paul'], abKapitel: 'ebbe' }]);

    // Entfernen nimmt den Kontext mit
    fireEvent.click(screen.getByRole('button', { name: 'Olli entfernen' }));
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.figuren.ole!.aliase).toEqual(['Fenster-Ole', 'der Kollege']);
    expect(useStore.getState().daten!.figuren.ole!.spitznamen).toBeUndefined();
  });
});
