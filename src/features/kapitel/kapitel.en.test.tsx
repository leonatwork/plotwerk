import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Kapitel, { kontext, Titelaktionen } from './index';
import { LeserSimulationKarte } from './LeserSimulationKarte';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  festeSprache('en');
});

describe('Kapitel-Überblick auf Englisch', () => {
  it('zeigt Kopf, Zusammenfassung, lose Enden und Gewissheit auf Englisch', () => {
    useStore.getState().waehle({ kapitel: 'bis-bald' });
    render(
      <>
        <Titelaktionen />
        <Kapitel />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Chapter overview' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Choose chapter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update summaries' })).toBeInTheDocument();
    expect(screen.getByText(/^CHAPTER 8 · /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in editor' })).toBeInTheDocument();
    expect(screen.getByText('TURNING POINT')).toBeInTheDocument();
    expect(screen.getByText('ANTAGONISTS')).toBeInTheDocument();
    expect(screen.getByText('WHAT HAS HAPPENED SO FAR')).toBeInTheDocument();
    expect(screen.getAllByText(/^Ch\. \d+$/).length).toBe(7);
    expect(screen.getByText('LOOSE ENDS SO FAR')).toBeInTheDocument();
    expect(screen.getByText(/^\d+ open$/)).toBeInTheDocument();
    expect(screen.getAllByText(/dormant for \d+ chapters?|in this chapter/).length).toBeGreaterThan(0);
    expect(screen.getByText('WHAT IS CERTAIN?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add event or passage …')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByText(/^READER AFTER CH\. 8$/)).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Chapter overview');

    const text = document.body.textContent ?? '';
    for (const wort of ['KAPITEL', 'WENDUNG', 'LOSE ENDEN', 'eröffnet', 'ruhend', 'Kap.', 'Hinzufügen', 'LESERIN', 'Im Editor'])
      expect(text).not.toContain(wort);
  });

  it('Karte Leser-Simulation: gespeicherter Stand und Start auf Englisch', () => {
    const { rerender } = render(<LeserSimulationKarte kapitelId="lotte" />);
    expect(screen.getByText('READER AFTER CH. 3')).toBeInTheDocument();
    expect(screen.getByText('outdated')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Reader’s open questions' })).toBeInTheDocument();
    expect(screen.getByText(/open questions?/)).toBeInTheDocument();
    rerender(<LeserSimulationKarte kapitelId="ebbe" />);
    expect(screen.getByRole('button', { name: 'Simulate reader …' })).toBeInTheDocument();
    expect(screen.getByText(/The AI only reads chapters 1 to \d+ for this\./)).toBeInTheDocument();
  });
});
