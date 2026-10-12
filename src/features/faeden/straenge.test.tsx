import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { KapitelPlanInspektor } from '../akte/KapitelInspektor';
import { StrangInspektor } from './StrangInspektor';
import { StrangRaster } from './StrangRaster';
import Faeden from './index';
import { fadenKarten } from '@core/struktur/faeden';
import { fadenKapitel, faedenOhneStrang } from '@core/struktur/straenge';

beforeEach(async () => {
  festeSprache('de');
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  useStore.setState((s) => ({
    backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) },
    struktur: { ...s.struktur, strangAuswahl: null, rasterKapitel: false, strangErgebnis: null, strangFehler: null },
  }));
});

const daten = () => useStore.getState().daten!;

async function vorschlagen() {
  await act(async () => {
    await useStore.getState().struktur.strangVorschlagen();
  });
  expect(useStore.getState().struktur.strangFehler).toBeNull();
}

describe('Stränge: Haupt-/Nebenhandlung, Zweck und KI-Vorschläge', () => {
  it('Strang im Raster wählen, als Haupthandlung markieren und beschreiben', async () => {
    function Ansicht() {
      const d = useStore((s) => s.daten)!;
      return (
        <>
          <StrangRaster daten={d} />
          <StrangInspektor daten={d} />
        </>
      );
    }
    render(<Ansicht />);
    fireEvent.click(screen.getByTitle('Antagonist: Nordhaven bearbeiten'));
    const inspektor = screen.getByRole('complementary', { name: 'Strang' });
    await act(async () => {
      fireEvent.click(within(inspektor).getByRole('button', { name: 'Haupthandlung' }));
    });
    expect(daten().straenge.find((s) => s.id === 'nordhaven')?.rolle).toBe('haupt');
    // Haupthandlung steht im Raster oben und ist markiert
    expect(screen.getAllByRole('rowheader')[0]).toHaveTextContent('Antagonist: NordhavenHAUPT');

    const zweck = within(inspektor).getByPlaceholderText(/Worum geht es/);
    fireEvent.change(zweck, { target: { value: 'Paul soll eine Glasfassade liefern.' } });
    await act(async () => {
      fireEvent.blur(zweck);
    });
    expect(daten().straenge.find((s) => s.id === 'nordhaven')?.beschreibung).toBe('Paul soll eine Glasfassade liefern.');
  });

  it('übernimmt einen neuen Strang nur für die gewählten Kapitel und beantwortet eine Rückfrage', async () => {
    await vorschlagen();
    render(<StrangInspektor daten={daten()} />);
    const karte = screen.getByRole('article', { name: 'Neuer Strang: Der alte Speicher' });
    fireEvent.click(within(karte).getByRole('button', { name: 'Kap. 10 übernehmen' }));
    await act(async () => {
      fireEvent.click(within(karte).getByRole('button', { name: 'Strang anlegen' }));
    });
    const speicher = daten().straenge.find((s) => s.name === 'Der alte Speicher')!;
    expect(speicher).toMatchObject({ rolle: 'neben' });
    expect(daten().plaene.grundriss!.straenge).toContain(speicher.id);
    expect(daten().plaene.funkstille!.straenge).not.toContain(speicher.id);

    const frage = daten().kiStrangVorschlaege!.eintraege.find((v) => v.art === 'frage' && v.strang === 'nordhaven')!;
    const { unmount } = render(<StrangInspektor daten={daten()} />);
    const fragen = screen.getAllByRole('article', { name: frage.frage! });
    const fragKarte = fragen[fragen.length - 1]!;
    fireEvent.change(within(fragKarte).getByLabelText('Deine Antwort'), { target: { value: 'Eigener Strang.' } });
    await act(async () => {
      fireEvent.click(within(fragKarte).getByRole('button', { name: 'Antworten' }));
    });
    unmount();
    expect(daten().kiStrangVorschlaege!.eintraege.find((v) => v.schluessel === frage.schluessel)).toMatchObject({ status: 'uebernommen', antwort: 'Eigener Strang.' });
  });

  it('Kapitel-Inspektor: Kurzbeschreibung, Funktion im Buch und Zuordnungs-Vorschlag', async () => {
    await vorschlagen();
    const { rerender } = render(<KapitelPlanInspektor id="funkstille" daten={daten()} index={useStore.getState().index} />);
    expect(screen.getByLabelText('Kurzbeschreibung')).toHaveValue('Die zweite Postkarte');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Funktion wählen' })).getByRole('button', { name: 'Wendepunkt' }));
    });
    expect(daten().plaene.funkstille!.funktion).toBe('Wendepunkt');

    const vorschlag = screen.getByRole('article', { name: 'gehört zu Antagonist: Nordhaven' });
    await act(async () => {
      fireEvent.click(within(vorschlag).getByRole('button', { name: 'Übernehmen' }));
    });
    expect(daten().plaene.funkstille!.straenge).toContain('nordhaven');
    rerender(<KapitelPlanInspektor id="funkstille" daten={daten()} index={useStore.getState().index} />);
    await waitFor(() => expect(screen.queryByRole('article', { name: 'gehört zu Antagonist: Nordhaven' })).toBeNull());

    // Funktion wieder abwählen entfernt das Feld
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Funktion wählen' })).getByRole('button', { name: 'Wendepunkt' }));
    });
    expect(daten().plaene.funkstille!.funktion).toBeUndefined();
  });

  it('englische Oberfläche', async () => {
    festeSprache('en');
    await vorschlagen();
    const { container } = render(<StrangInspektor daten={daten()} />);
    expect(screen.getByText('AI SUGGESTIONS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create plot line' })).toBeInTheDocument();
    const text = container.textContent ?? '';
    for (const wort of ['Vorschläge', 'Strang anlegen', 'Verwerfen', 'Rückfragen', 'Antworten']) expect(text).not.toContain(wort);
    festeSprache('de');
  });
});

describe('Lose Enden und Stränge verbinden', () => {
  it('übernimmt ein loses Ende als Strang mit seinen Kapiteln und verknüpft es', async () => {
    const karten = fadenKarten(daten(), useStore.getState().index.faeden);
    const ohne = faedenOhneStrang(daten(), karten);
    expect(ohne.length).toBeGreaterThan(0);
    const faden = ohne[0]!;
    const kapitel = fadenKapitel(daten(), faden);
    expect(kapitel.length).toBeGreaterThan(0);

    render(<KapitelPlanInspektor id={kapitel[0]!} daten={daten()} index={useStore.getState().index} />);
    const bereich = screen.getByRole('region', { name: 'Lose Enden in diesem Kapitel' });
    const zeile = within(bereich).getByText(faden.name).closest('li')!;
    await act(async () => {
      fireEvent.click(within(zeile).getByRole('button', { name: 'Als Strang übernehmen' }));
    });

    const strang = daten().straenge.find((s) => s.name === faden.name)!;
    expect(strang).toBeDefined();
    for (const k of kapitel) expect(daten().plaene[k]!.straenge).toContain(strang.id);
    expect(daten().fadenplanung!.faeden.find((f) => f.id === faden.id)?.strang).toBe(strang.id);
    expect(faedenOhneStrang(daten(), fadenKarten(daten(), useStore.getState().index.faeden)).some((k) => k.id === faden.id)).toBe(false);
  });

  it('Tabelle: lose Enden × Kapitel, gruppiert nach Strang', async () => {
    act(() => useStore.getState().struktur.setzeFadenDarstellung('tabelle'));
    render(<Faeden />);
    const tabelle = screen.getByRole('table', { name: 'Lose Enden je Kapitel' });
    const kopf = within(tabelle).getAllByRole('columnheader').map((c) => c.textContent);
    expect(kopf).toEqual(expect.arrayContaining(['1', '10']));
    expect(within(tabelle).getByRole('rowheader', { name: /Ohne Strang/ })).toBeInTheDocument();
    const name = fadenKarten(daten(), useStore.getState().index.faeden)[0]!.name;
    fireEvent.click(within(tabelle).getByRole('button', { name }));
    expect(useStore.getState().struktur.fadenAuswahl).toBe(fadenKarten(daten(), useStore.getState().index.faeden)[0]!.id);
    act(() => useStore.getState().struktur.setzeFadenDarstellung('board'));
  });
});
