import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Orte, { kontext } from './index';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  festeSprache('en');
});

describe('Places in English', () => {
  it('place card, list and spellings', () => {
    useStore.getState().waehle({ ort: 'lindenhof' });
    useStore.getState().planung.setzeOrteAnsicht('ort');
    const { container } = render(<Orte />);
    expect(screen.getByText(/The same place is spelled 3 ways in the text/)).toBeInTheDocument();
    expect(screen.getByText('From the text')).toBeInTheDocument();
    expect(screen.getByText('Your planning')).toBeInTheDocument();
    expect(screen.getByText('Sub-places')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set as valid' })).toBeInTheDocument();
    expect(screen.getByText('Paul’s route')).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Places · Lindenhof');

    const text = container.textContent ?? '';
    for (const wort of ['Aus dem Text', 'Deine Planung', 'Schreibweisen', 'Unterorte', 'Als gültig festlegen', 'Pauls Weg', 'Kap.']) expect(text).not.toContain(wort);
  });

  it('Paul’s route and the spelling overview', () => {
    useStore.getState().planung.setzeOrteAnsicht('weg');
    render(<Orte />);
    expect(screen.getByRole('heading', { name: 'Paul’s route' })).toBeInTheDocument();
    expect(screen.getByText(/Sequence of places across all chapters, detected in the text/)).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Places · Paul’s route');

    fireEvent.click(screen.getByText('Spellings'));
    expect(screen.getByRole('heading', { name: 'Spellings' })).toBeInTheDocument();
    expect(screen.getByText('Chosen')).toBeInTheDocument();
    expect(screen.queryByText(/Festgelegt|Offene Schreibweisen/)).not.toBeInTheDocument();
  });
});
