import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { GRUPPENTYP_LABEL, KATEGORIE_LABEL } from './gemeinsam';
import Ansicht, { Titelaktionen } from './index';

describe('Beziehungsnetz auf Englisch', () => {
  beforeEach(async () => {
    await act(async () => {
      await useStore.getState().projektLaden(demoFs());
    });
    useStore.getState().indexNeuBerechnen();
    useStore.setState({ netzAuswahl: null, netzStand: null, netzVerbinden: false, bereich: 'beziehungen' });
    festeSprache('en');
  });

  it('zeigt Kopf, Zeitregler, Filter, Karten und Übersicht auf Englisch', () => {
    render(
      <>
        <Titelaktionen />
        <Ansicht />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Relationship map' })).toBeInTheDocument();
    expect(screen.getByText('As of the end of Ch. 10: what the reader knows so far')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Act I · Ch. 1–4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Relationship' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest relationships' })).toBeInTheDocument();
    const filter = screen.getByRole('group', { name: 'Filter' });
    expect(within(filter).getByText('Work')).toBeInTheDocument();
    expect(within(filter).getByText('Other')).toBeInTheDocument();

    const netz = screen.getByTestId('netz');
    expect(within(netz).getByRole('button', { name: 'Die Fremde, does she exist?' })).toBeInTheDocument();
    expect(within(netz).getByRole('button', { name: /^Herr Kessler, mentioned · / })).toBeInTheDocument();
    expect(within(netz).getByText('Contact')).toBeInTheDocument();

    const inspektor = screen.getByRole('complementary', { name: 'Relationships inspector' });
    expect(within(inspektor).getByText('End of Ch. 10')).toBeInTheDocument();
    expect(within(inspektor).getByText(/characters and \d+ relationships are known up to this point\./)).toBeInTheDocument();
    expect(within(inspektor).getByText('Legend')).toBeInTheDocument();
    expect(within(inspektor).getByText(/area: /)).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    for (const wort of ['Beziehung', 'Stand Ende', 'Legende', 'Kapitel', 'existiert', 'Kontakt', 'erwähnt']) expect(text).not.toContain(wort);
  });

  it('Inspektor einer Beziehung und Zeitregler wechseln auf Englisch', () => {
    render(<Ansicht />);
    fireEvent.click(screen.getByRole('button', { name: 'Act I · Ch. 1–4' }));
    expect(screen.getByText('As of the end of Ch. 4: what the reader knows so far')).toBeInTheDocument();
    act(() => useStore.getState().waehleImNetz({ typ: 'beziehung', paar: 'lotte|paul' }));
    const inspektor = screen.getByRole('complementary', { name: 'Relationships inspector' });
    expect(within(inspektor).getByText('Relationship · Dates')).toBeInTheDocument();
    expect(within(inspektor).getByText('History')).toBeInTheDocument();
    expect(within(inspektor).getByLabelText('Type')).toBeInTheDocument();
    expect(within(inspektor).getByText('Evidence from the text')).toBeInTheDocument();
    expect(within(inspektor).getByRole('button', { name: 'Remove this label' })).toBeInTheDocument();
    expect(within(inspektor).getByRole('group', { name: 'Category' })).toBeInTheDocument();
  });

  it('exportierte Beschriftungen folgen der Sprache', () => {
    expect(KATEGORIE_LABEL.arbeit).toBe('Work');
    expect(GRUPPENTYP_LABEL.firma).toBe('Company');
    festeSprache('de');
    expect(KATEGORIE_LABEL.arbeit).toBe('Arbeit');
    expect(GRUPPENTYP_LABEL.firma).toBe('Firma');
    expect(Object.keys(KATEGORIE_LABEL)).toEqual(['arbeit', 'dates', 'sonstige']);
  });
});
