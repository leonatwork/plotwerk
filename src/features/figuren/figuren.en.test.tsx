/** Figurenliste, Figurenkarte, Bögen und Figurenstimme auf Englisch. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFs } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Figuren, { kontext, Titelaktionen } from './index';
import StimmeDialog from './StimmeDialog';

beforeEach(async () => {
  useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) }, dialog: null, markierung: null });
  await useStore.getState().projektLaden(new MemoryFs(demoDateien()));
  useStore.getState().indexNeuBerechnen();
  useStore.getState().figurenbogen.stimmeZuruecksetzen();
  useStore.setState((s) => ({
    bereich: 'figuren',
    figurenbogen: { ...s.figurenbogen, figurenAnsicht: 'karte', gewaehlteStufe: null, vergleich: [], stimmeSpalte: false },
  }));
  festeSprache('en');
});

/** Sichtbarer Text plus Beschriftungen (aria-label, title, placeholder). */
function alleTexte(el: HTMLElement): string {
  const attribute = [...el.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((e) =>
    ['aria-label', 'title', 'placeholder'].map((a) => e.getAttribute(a) ?? ''),
  );
  return [el.textContent ?? '', ...attribute].join('\n');
}

const DEUTSCH = [
  'Deine Planung',
  'Hauptfigur',
  'Nebenfigur',
  'HAUPTFIGUREN',
  'Wahrheit hinter',
  'Beziehungen',
  'Auftritte',
  'Notizen',
  // „Kap. 2“ steht auch in den Demo-Notizen (Nutzerdaten) – nur die Oberflächenformen prüfen
  'seit Kap.',
  'angeheftet',
  'Bögen',
  'Stufe',
  'Belege',
  'Figur löschen',
  'Im Text zeigen',
  'noch nicht',
  'Suchen',
];

describe('Figuren auf Englisch', () => {
  it('Liste und Karte: Abschnitte, Rollen, Bogen und Kapitelkürzel', () => {
    useStore.getState().waehle({ figur: 'paul', kapitel: 'ebbe' });
    const { container } = render(
      <>
        <Titelaktionen />
        <Figuren />
      </>,
    );
    expect(screen.getByRole('navigation', { name: 'Characters' })).toHaveTextContent('MAIN CHARACTERS');
    expect(screen.getByRole('region', { name: 'From the text' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your plan' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Role' })).toHaveTextContent('Main character');
    expect(screen.getByRole('region', { name: 'Truth behind the scenes' })).toHaveTextContent('Only for you – never sent to the AI.');
    expect(screen.getByRole('region', { name: 'Relationships' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Appearances' })).toHaveTextContent(/Filled: appears/);
    const bogen = screen.getByRole('list', { name: 'Arc of Paul' });
    const zeilen = within(bogen).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent(/^Alles im Lot.*1 citation.*Ch\. 3$/);
    expect(zeilen[1]).toHaveTextContent(/current.*Ch\. 7$/);
    expect(screen.getByText(/Current: the stage that applies in Ch\. 7\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show in text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete character' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New character' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Characters · Paul');

    const text = alleTexte(container);
    for (const wort of DEUTSCH) expect(text, wort).not.toContain(wort);
  });

  it('Bögen: Raster, Legende und Stufenbearbeitung', () => {
    useStore.getState().waehle({ figur: 'paul' });
    useStore.setState((s) => ({ figurenbogen: { ...s.figurenbogen, figurenAnsicht: 'boegen', gewaehlteStufe: { figur: 'paul', stufe: 'schlaflos' } } }));
    const { container } = render(<Figuren />);
    expect(screen.getByRole('heading', { name: 'Arcs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Legend')).toHaveTextContent(/appears.*by message.*only mentioned/);
    expect(screen.getByRole('button', { name: /^Stage “Ohne Schlaf” of Paul/ })).toHaveAttribute('aria-pressed', 'true');
    const bearbeitung = screen.getByRole('region', { name: 'Edit stage “Ohne Schlaf”' });
    expect(within(bearbeitung).getByText('Citations from the text')).toBeInTheDocument();
    expect(within(bearbeitung).getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(within(bearbeitung).getByLabelText('Reached in')).toBeInTheDocument();

    const text = alleTexte(container);
    for (const wort of DEUTSCH) expect(text, wort).not.toContain(wort);
  });

  it('Figurenstimme: Dialog und Spalte', async () => {
    render(<StimmeDialog param={{ figur: 'paul' }} schliessen={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Check character voice' })).toBeInTheDocument();
    expect(screen.getByText(/lines of dialogue by Paul \(estimated attribution\)/)).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start check' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByText(/tokens \(whole book\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(start);
    });
    expect(await screen.findByText('2 observations open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View on card' }));

    render(<Figuren />);
    const spalte = screen.getByRole('complementary', { name: 'Character voice' });
    expect(within(spalte).getByText('Paul’s voice')).toBeInTheDocument();
    const karte = within(spalte).getByRole('article', { name: 'Paul antwortet nur mit einer Zahl' });
    expect(within(karte).getByText('Notable')).toBeInTheDocument();
    expect(within(karte).getByRole('button', { name: 'Intentional' })).toBeInTheDocument();
    expect(within(spalte).getByRole('button', { name: /Decided · 0/ })).toBeInTheDocument();
    expect(within(spalte).queryByText(/Stimme von|Auffällig|Ist Absicht/)).toBeNull();
  });
});
