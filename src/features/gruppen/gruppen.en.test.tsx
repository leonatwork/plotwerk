/** Antagonisten/Gruppen auf Englisch: Karte, Inspektor und Präsenz pro Akt. */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { GruppenInspektor, GruppenKarte, praesenzProAkt } from './index';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
  });
  useStore.getState().indexNeuBerechnen();
  festeSprache('en');
});

const s = () => useStore.getState();

describe('Antagonisten auf Englisch', () => {
  it('Karte und Inspektor zeigen englische Beschriftungen', () => {
    const { container } = render(
      <>
        <GruppenKarte gruppe="nordhaven" />
        <GruppenInspektor gruppe="konsortium" />
      </>,
    );
    expect(screen.getByText('Herr Kessler')).toBeInTheDocument();
    expect(screen.getByText(/Traces in the text · 3 suggestions/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Discard' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Confirm' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Type' })).toHaveTextContent(/Antagonist.*Company.*Family.*Group/);
    expect(screen.getByText('Presence per chapter')).toBeInTheDocument();
    expect(screen.getByText('Presence per act')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('(only for you)')).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: /^Presence of .* per chapter$/ }).length).toBeGreaterThan(0);
    const text = container.textContent ?? '';
    for (const wort of ['Spuren', 'Vorschl', '+ Mitglied', 'Präsenz', 'Verwerfen', 'Bestätigen', 'nur für dich', 'geplant']) expect(text, wort).not.toContain(wort);
  });

  it('Präsenz pro Akt wird in der Oberflächensprache beschrieben', () => {
    const d = s().daten!;
    const akte = praesenzProAkt(d, s().index, d.gruppen.nordhaven!);
    expect(akte[0]!.imText).toContain('in the text: Ch. 2');
    festeSprache('de');
    expect(praesenzProAkt(d, s().index, d.gruppen.nordhaven!)[0]!.imText).toContain('im Text: Kap. 2');
  });
});
