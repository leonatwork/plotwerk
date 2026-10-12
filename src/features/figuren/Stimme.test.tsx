import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { offeneStimmen, stimmenDerFigur } from '@core/figuren/index';
import type { KiTransport } from '@core/ki/index';
import { MemoryFs, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { erstelleStore, useStore } from '../../state/store';
import { StimmeKnopf, StimmeSpalte } from './Stimme';
import StimmeDialog from './StimmeDialog';

async function laden(store: typeof useStore, ki: KiTransport = erstelleDemoKiTransport({ verzoegerungMs: 0 })) {
  const fs = new MemoryFs(demoDateien());
  store.setState({ backend: { ...erstelleDemoBackend(), ki } });
  await store.getState().projektLaden(fs);
  return fs;
}

describe('Slice „figurenbogen“ – Figurenstimme', () => {
  it('prüft mit dem Demo-Transport, mischt in .plotwerk/stimmen.json und merkt Entscheidungen', async () => {
    const store = erstelleStore();
    const fs = await laden(store);
    const fb = () => store.getState().figurenbogen;
    const vorher = stimmenDerFigur(store.getState().daten!, 'paul').length;
    expect(vorher).toBe(1);

    await fb().stimmePruefen({ figur: 'paul' });
    expect(fb().stimmeFehler).toBeNull();
    expect(fb().stimmeLauf).toBeNull();
    expect(fb().stimmeErgebnis).toMatchObject({ figur: 'paul', neu: 2, offen: 2, zuWenigRede: false, vage: false });
    expect(fb().stimmeErgebnis!.verworfen).toHaveLength(2);
    await store.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiStimmen))!);
    expect(datei.eintraege.map((b: { titel: string }) => b.titel)).toEqual(['Paul antwortet nur mit einer Zahl', 'Großgeschriebene Anrede gegenüber Vera']);
    expect(datei.lauf.modell).toBe('claude-sonnet-5-5');

    const schluessel = datei.eintraege[0].schluessel as string;
    await fb().stimmeEntscheiden(schluessel, 'absicht');
    await store.getState().alleSpeichernAbwarten();
    const entscheidungen = JSON.parse((await fs.lesen(PFADE.entscheidungen))!);
    expect(entscheidungen.hinweise.some((h: { schluessel: string; entscheidung: string }) => h.schluessel === schluessel && h.entscheidung === 'absicht')).toBe(true);
    expect(offeneStimmen(store.getState().daten!, 'paul')).toBe(1);

    // zweiter Lauf: Entschiedenes kommt nicht wieder
    await fb().stimmePruefen({ figur: 'paul' });
    expect(fb().stimmeErgebnis).toMatchObject({ neu: 0, offen: 1, bereitsEntschieden: 1 });

    await fb().stimmeEntscheiden(schluessel, null);
    expect(offeneStimmen(store.getState().daten!, 'paul')).toBe(2);
  });

  it('Fehler des Transports landen als Anzeige im Slice', async () => {
    const store = erstelleStore();
    const ki = { ...erstelleDemoKiTransport({ verzoegerungMs: 0 }), bereit: async () => false };
    await laden(store, ki);
    await store.getState().figurenbogen.stimmePruefen({ figur: 'paul' });
    expect(store.getState().figurenbogen.stimmeFehler?.art).toBe('nicht_bereit');
    expect(store.getState().figurenbogen.stimmeLauf).toBeNull();
  });
});

describe('Figurenstimme (Ansicht)', () => {
  beforeEach(async () => {
    useStore.setState({ dialog: null });
    await laden(useStore);
    useStore.getState().figurenbogen.stimmeZuruecksetzen();
    useStore.getState().figurenbogen.setzeStimmeSpalte(false);
  });

  it('Dialog: Schätzung, Start, Ergebnis, „Auf der Karte ansehen“ öffnet die Spalte', async () => {
    let geschlossen = 0;
    render(<StimmeDialog param={{ figur: 'paul' }} schliessen={() => geschlossen++} />);
    expect(screen.getByLabelText('Figur')).toHaveValue('paul');
    expect(screen.getByText(/Redestellen von Paul/)).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Prüfung starten' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByText(/Tokens \(ganzes Buch\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(start);
    });
    expect(await screen.findByText('2 Beobachtungen offen')).toBeInTheDocument();
    expect(screen.getByText('Gründe für Verworfenes anzeigen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Auf der Karte ansehen' }));
    expect(geschlossen).toBe(1);
    const s = useStore.getState();
    expect(s.bereich).toBe('figuren');
    expect(s.auswahl.figur).toBe('paul');
    expect(s.figurenbogen.figurenAnsicht).toBe('karte');
    expect(s.figurenbogen.stimmeSpalte).toBe(true);
  });

  it('Dialog: bewusst vage Figur wird angekündigt', async () => {
    render(<StimmeDialog param={{ figur: 'die-fremde' }} schliessen={() => {}} />);
    expect(screen.getByRole('note')).toHaveTextContent('bewusst vage');
  });

  it('Spalte: Beobachtungen mit auffälliger und typischer Stelle, Entscheidungen, Sprung in den Text', async () => {
    await useStore.getState().figurenbogen.stimmePruefen({ figur: 'paul' });
    const Huelle = () => {
      const daten = useStore((s) => s.daten)!;
      return (
        <>
          <StimmeKnopf />
          <StimmeSpalte daten={daten} figur="paul" />
        </>
      );
    };
    useStore.getState().waehle({ figur: 'paul' });
    render(<Huelle />);
    const spalte = screen.getByRole('complementary', { name: 'Figurenstimme' });
    expect(within(spalte).getByText('Stimme von Paul')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stimme/, pressed: false })).toHaveTextContent('2');
    const karte = within(spalte).getByRole('article', { name: 'Paul antwortet nur mit einer Zahl' });
    expect(within(karte).getByText('Auffällig')).toBeInTheDocument();
    expect(within(karte).getByText('Sonst')).toBeInTheDocument();
    fireEvent.click(within(karte).getByRole('button', { name: /Achtzehn auf jeder Seite/ }));
    expect(useStore.getState().markierung?.kapitel).toBe('staub');

    await act(async () => {
      fireEvent.click(within(karte).getByRole('button', { name: 'Erledigt' }));
    });
    await waitFor(() => expect(within(spalte).queryByRole('article', { name: 'Paul antwortet nur mit einer Zahl' })).toBeNull());
    fireEvent.click(within(spalte).getByRole('button', { name: /Entschieden · 1/ }));
    const erledigt = within(spalte).getByRole('article', { name: 'Paul antwortet nur mit einer Zahl' });
    expect(within(erledigt).getByText('Erledigt')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(erledigt).getByRole('button', { name: 'Wieder öffnen' }));
    });
    await waitFor(() => expect(offeneStimmen(useStore.getState().daten!, 'paul')).toBe(2));

    fireEvent.click(within(spalte).getByRole('button', { name: /prüfen …/ }));
    expect(useStore.getState().dialog).toEqual({ id: 'stimme-pruefen', param: { figur: 'paul' } });
  });

  it('Spalte: Leerzustand ohne Prüfung', () => {
    const daten = useStore.getState().daten!;
    render(<StimmeSpalte daten={daten} figur="ole" />);
    expect(screen.getByText('Noch nicht geprüft.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stimme prüfen …' })).toBeEnabled();
  });
});
