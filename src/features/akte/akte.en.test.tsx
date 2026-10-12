import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Akte, { kontext, Seitenleiste, Titelaktionen } from './index';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  useStore.getState().planung.waehleIdee(null);
  useStore.getState().waehle({ plan: undefined, kapitel: undefined });
  festeSprache('en');
});

describe('Plan acts in English', () => {
  it('board, columns, idea shelf and chapter inspector', () => {
    const { container } = render(<Akte />);
    expect(screen.getByRole('heading', { name: 'Plan acts' })).toBeInTheDocument();
    expect(screen.getByText('Idea shelf')).toBeInTheDocument();
    expect(screen.getAllByText('+ Plan scene').length).toBeGreaterThan(0);
    expect(screen.getByText('1 deviation from the plan')).toBeInTheDocument();
    expect(screen.getAllByText('ESSENCE').length).toBeGreaterThan(0);
    expect(screen.getByText('Select a chapter or idea card to plan it here.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Chapter 4 Regatta/));
    expect(screen.getByText('CHAPTER 4 · PLANNED')).toBeInTheDocument();
    expect(screen.getByText('What should happen here?')).toBeInTheDocument();
    expect(screen.getByText('Context from the text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start writing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete planned chapter' })).toBeInTheDocument();

    const text = container.textContent ?? '';
    for (const wort of ['Akte planen', 'Ideen-Ablage', 'Szene planen', 'Was soll hier passieren', 'Kontext aus dem Text', 'GEPLANT', 'Abweichung', 'QUINTESSENZ'])
      expect(text).not.toContain(wort);
  });

  it('title bar, legend and window context', () => {
    render(
      <>
        <Titelaktionen />
        <Seitenleiste />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Plan only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plot lines' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Act' })).toBeInTheDocument();
    expect(screen.getByText('differs from the plan')).toBeInTheDocument();
    expect(screen.queryByText('STRÄNGE')).not.toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Plan acts');
  });

  it('idea inspector', () => {
    const idee = useStore.getState().daten!.ideen[0]!;
    useStore.getState().planung.waehleIdee(idee.id);
    render(<Akte />);
    expect(screen.getByText('IDEA · NO PLACE YET')).toBeInTheDocument();
    expect(screen.getByText('Add as planned chapter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete idea' })).toBeInTheDocument();
    expect(screen.queryByText(/Idee löschen|NOCH OHNE PLATZ/)).not.toBeInTheDocument();
  });
});
