/** G6 KI-Leser (UI): Fragen an das Buch, Leser-Simulation-Dialog, Karte im Kapitel-Überblick. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFs, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { useStore } from '../../state/store';
import { LeserSimulationKarte } from '../kapitel/LeserSimulationKarte';
import Ansicht from './index';
import LeserSimulationDialog from './LeserSimulationDialog';
import { SimulationStatus } from './SimulationStatus';
import { BestaetigungHost } from '../../ui';

let fs: MemoryFs;

beforeEach(async () => {
  fs = new MemoryFs(demoDateien());
  useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) }, dialog: null, markierung: null });
  await useStore.getState().projektLaden(fs);
  useStore.setState((s) => ({
    bereich: 'fragen',
    kileser: { ...s.kileser, entwurf: '', frageFehler: null, simFehler: null, simMeldung: null, frageHinweise: {}, simVerworfen: {}, fragenSchaetzung: null },
  }));
});

describe('Fragen an das Buch (UI)', () => {
  it('zeigt den Verlauf, beantwortet eine Frage mit Belegen und öffnet die Stelle', async () => {
    render(<Ansicht />);
    // Fixture-Verlauf
    expect(screen.getByText('Wo erwähne ich Pauls Bleistifte?')).toBeInTheDocument();
    expect(await screen.findByText(/je Frage · danach/)).toBeInTheDocument();

    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Wer ist Fiete?' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    const eintrag = await screen.findByRole('article', { name: 'Frage: Wer ist Fiete?' });
    const beleg = within(eintrag).getByRole('button', { name: /Kap\. 10 · Funkstille/ });
    expect(beleg).toHaveTextContent('ob er die Krabben wieder für Fiete mitnimmt');
    expect(within(eintrag).getByText(/1 Beleg verworfen/)).toBeInTheDocument();
    expect(feld).toHaveValue('');

    await useStore.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiFragen))!);
    expect(datei.eintraege).toHaveLength(2);
    expect(datei.eintraege[1].frage).toBe('Wer ist Fiete?');

    fireEvent.click(beleg);
    expect(useStore.getState().bereich).toBe('schreiben');
    expect(useStore.getState().markierung?.kapitel).toBe('funkstille');
  });

  it('markiert Antworten ohne Beleg', async () => {
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Wo kommt der Zeppelin vor?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));
    const eintrag = await screen.findByRole('article', { name: 'Frage: Wo kommt der Zeppelin vor?' });
    // das Modell sagt „steht nicht im Buch“ (imBuch = false) – unterscheidbar von verworfenen Belegen
    expect(within(eintrag).getByText('nicht im Buch')).toBeInTheDocument();
    expect(useStore.getState().daten!.kiFragen!.eintraege.at(-1)!.imBuch).toBe(false);
  });

  it('lehnt Schreibaufträge lokal ab (ohne Anfrage) und lässt die Frage im Feld', async () => {
    const senden = vi.spyOn(useStore.getState().backend!.ki, 'senden');
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Schreib mir einen Dialog zwischen Paul und Lotte' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Die KI schreibt keinen Text für das Buch');
    expect(senden).not.toHaveBeenCalled();
    await waitFor(() => expect(feld).toHaveValue('Schreib mir einen Dialog zwischen Paul und Lotte'));
  });

  it('↑ holt die letzte Frage zurück, Escape leert das Feld', () => {
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.keyDown(feld, { key: 'ArrowUp' });
    expect(feld).toHaveValue('Wo erwähne ich Pauls Bleistifte?');
    fireEvent.keyDown(feld, { key: 'Escape' });
    expect(feld).toHaveValue('');
  });
});

describe('Leser-Simulation (UI)', () => {
  it('Schätzung vor dem Start, dann Ergebnis mit Fragen, Wissen und Plan-Abgleich', async () => {
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    expect(await screen.findByText(/claude-sonnet-5-5 · Effort medium/)).toBeInTheDocument();
    expect(screen.getByText(/Kap\. 1–2 · 2 Kapitel mit Text · 1 Anfrage/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    expect(await screen.findByText(/claude-opus-5-5 · Effort high/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    await screen.findByText(/claude-sonnet-5-5/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulation starten' }));
    });
    expect(await screen.findByRole('heading', { name: 'Was weiß die Leserin nach Kap. 2?' })).toBeInTheDocument();
    expect(screen.getByText('Wer hat die Werfthalle am Nordkai gekauft?')).toBeInTheDocument();
    expect(screen.getByText(/2 Einträge verworfen/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Plan/ }));
    expect(screen.getByText('„die Vorgabe kommt vom Aufsichtsrat“')).toBeInTheDocument();
    expect(screen.getAllByText('im Text belegt').length).toBeGreaterThan(0);
    expect(screen.getByText('Pauls Bleistifte')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Weiß/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Kap\. 2 · Fassade/ })[0]!);
    expect(schliessen).toHaveBeenCalled();
    expect(useStore.getState().markierung?.kapitel).toBe('fassade');

    await useStore.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(datei.eintraege.map((e: { kapitel: string }) => e.kapitel)).toEqual(['fassade', 'lotte']);
  });

  it('„Abbrechen“ beendet den Lauf: nichts gespeichert, kein Fehler, Fokus bleibt im Dialog', async () => {
    // Demo-Transport mit Wartezeit, damit der Lauf sichtbar ist; er bricht über das Signal ab
    useStore.setState((s) => ({ backend: { ...s.backend!, ki: erstelleDemoKiTransport({ verzoegerungMs: 5000 }) } }));
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    await screen.findByText(/claude-sonnet-5-5 · Effort medium/);
    const start = screen.getByRole('button', { name: 'Simulation starten' });
    start.focus();
    await act(async () => {
      fireEvent.click(start);
    });
    expect(await screen.findByRole('progressbar', { name: 'Leser-Simulation läuft' })).toBeInTheDocument();
    expect(useStore.getState().kileser.simLauf).toMatchObject({ kapitel: 'fassade' });
    // der Startknopf ist weg – der Fokus liegt trotzdem im Dialog
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    });
    expect(await screen.findByRole('button', { name: 'Simulation starten' })).toBeInTheDocument();
    expect(useStore.getState().kileser.simLauf).toBeNull();
    expect(useStore.getState().kileser.simFehler).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.kiLeser!.eintraege.map((e) => e.kapitel)).toEqual(['lotte']);
    const datei = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(datei.eintraege.map((e: { kapitel: string }) => e.kapitel)).toEqual(['lotte']);
    expect(schliessen).not.toHaveBeenCalled();
  });

  it('Ergebnisseite: Fokus kommt in den Dialog, Tab bleibt drin, Escape schließt', async () => {
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    await screen.findByText(/claude-sonnet-5-5 · Effort medium/);
    const start = screen.getByRole('button', { name: 'Simulation starten' });
    start.focus();
    expect(document.activeElement).toBe(start);
    await act(async () => {
      fireEvent.click(start);
    });
    const titel = await screen.findByRole('heading', { name: 'Was weiß die Leserin nach Kap. 2?' });
    const dialog = titel.closest('[role="dialog"]')!;
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(schliessen).toHaveBeenCalledTimes(1);
  });

  it('Karte im Kapitel-Überblick: gespeicherter Stand mit offenen Fragen, sonst Start', () => {
    const { rerender } = render(<LeserSimulationKarte kapitelId="lotte" />);
    expect(screen.getByText('LESERIN NACH KAP. 3')).toBeInTheDocument();
    expect(screen.getByText('veraltet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Was sagt Nordhaven zu Pauls Fenstern?' }));
    expect(useStore.getState().dialog).toEqual({ id: 'leser-simulation', param: { kapitel: 'lotte' } });
    rerender(<LeserSimulationKarte kapitelId="ebbe" />);
    expect(screen.getByRole('button', { name: 'Leserin simulieren …' })).toBeInTheDocument();
  });
});

describe('Leser-Simulation: wiederfinden, Hintergrund, Übernahme', () => {
  it('Seitenspalte listet gespeicherte Simulationen; ein Klick öffnet genau diesen Stand', () => {
    render(<Ansicht />);
    const liste = screen.getByRole('list', { name: 'Gespeicherte Leser-Simulationen' });
    const eintrag = within(liste).getByRole('button', { name: /^Kap\. 3 · / });
    expect(eintrag).toHaveTextContent('2 offene Fragen');
    expect(eintrag).toHaveTextContent('veraltet');
    fireEvent.click(eintrag);
    const stand = useStore.getState().daten!.kiLeser!.eintraege[0]!;
    expect(useStore.getState().dialog).toEqual({ id: 'leser-simulation', param: { kapitel: 'lotte', stand: `lotte@${stand.datum}` } });
  });

  it('Startseite eines Kapitels ohne Stand zeigt die gespeicherten Simulationen zum Wechseln', async () => {
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={vi.fn()} />);
    await screen.findByText(/claude-sonnet-5-5 · Effort medium/);
    fireEvent.click(screen.getByRole('button', { name: 'Kap. 3' }));
    expect(screen.getByRole('heading', { name: 'Was weiß die Leserin nach Kap. 3?' })).toBeInTheDocument();
  });

  it('Lauf im Hintergrund: Laufanzeige, Meldung bei Fertig und bei Fehler', async () => {
    useStore.setState((s) => ({ backend: { ...s.backend!, ki: erstelleDemoKiTransport({ verzoegerungMs: 50 }) } }));
    render(<SimulationStatus />);
    let lauf!: Promise<string | null>;
    act(() => {
      lauf = useStore.getState().kileser.simulieren('fassade', false);
    });
    expect(await screen.findByRole('status', { name: 'Leser-Simulation' })).toHaveTextContent('Leser-Simulation nach Kap. 2 läuft');
    await act(async () => {
      await lauf;
    });
    expect(screen.getByRole('status', { name: 'Leser-Simulation' })).toHaveTextContent('Leser-Simulation nach Kap. 2 ist fertig.');
    const neu = await lauf;
    fireEvent.click(screen.getByRole('button', { name: 'Ansehen' }));
    expect(useStore.getState().dialog).toEqual({ id: 'leser-simulation', param: { kapitel: 'fassade', stand: neu } });
    expect(useStore.getState().kileser.simMeldung).toBeNull();

    // Fehler bei geschlossenem Dialog verschwindet nicht still
    useStore.setState({ dialog: null });
    vi.spyOn(useStore.getState().backend!.ki, 'senden').mockRejectedValueOnce(new Error('Zeitüberschreitung'));
    await act(async () => {
      await useStore.getState().kileser.simulieren('fassade', false);
    });
    const alarm = screen.getByRole('alert');
    expect(alarm).toHaveTextContent('Leser-Simulation nach Kap. 2 fehlgeschlagen');
    expect(alarm).toHaveTextContent('Zeitüberschreitung');
    fireEvent.click(within(alarm).getByRole('button', { name: 'Meldung schließen' }));
    expect(screen.queryByRole('alert')).toBeNull();

    // offener Dialog zeigt das Ergebnis selbst – keine Meldung
    useStore.setState({ dialog: { id: 'leser-simulation', param: { kapitel: 'fassade' } } });
    await act(async () => {
      await useStore.getState().kileser.simulieren('fassade', false);
    });
    expect(useStore.getState().kileser.simMeldung).toBeNull();
  });

  it('offene Frage als Faden planen: Auflösung und Notiz, die Frage merkt sich den Faden', async () => {
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'lotte' }} schliessen={schliessen} />);
    const frage = 'Wer hat die Werfthalle am Nordkai gekauft?';
    const gruppe = screen.getByRole('group', { name: `Frage übernehmen: ${frage}` });
    fireEvent.click(within(gruppe).getByRole('button', { name: 'Als Faden planen' }));
    const form = within(gruppe).getByRole('form', { name: 'Als Faden planen' });
    expect(within(form).getByLabelText('Faden')).toHaveValue(frage);
    expect(within(form).getByLabelText('Kommt auf in')).toHaveValue('fassade');
    fireEvent.change(within(form).getByLabelText('Auflösung geplant in'), { target: { value: 'regatta' } });
    fireEvent.change(within(form).getByLabelText('Wie wird das gelöst?'), { target: { value: 'Fiete erzählt es auf der Regatta.' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Faden anlegen' }));
    });
    await useStore.getState().alleSpeichernAbwarten();

    const faden = useStore.getState().daten!.fadenplanung!.faeden.find((x) => x.name === frage)!;
    expect(faden).toMatchObject({ eroeffnetIn: 'fassade', aufloesungIn: 'regatta', notiz: 'Fiete erzählt es auf der Regatta.' });
    expect(await fs.lesen(PFADE.faeden)).toContain('aufloesungIn: regatta');
    const leser = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(leser.eintraege[0].fragen.find((x: { id: string }) => x.id === 'werfthalle-nordkai').faden).toBe(faden.id);

    expect(within(gruppe).queryByRole('button', { name: 'Als Faden planen' })).toBeNull();
    fireEvent.click(within(gruppe).getByRole('button', { name: 'Faden · Auflösung Kap. 4' }));
    expect(useStore.getState().bereich).toBe('faeden');
    expect(useStore.getState().struktur.fadenAuswahl).toBe(faden.id);
    expect(schliessen).toHaveBeenCalled();
  });

  it('„Bewusst offen lassen“ setzt den Faden-Status', async () => {
    render(<LeserSimulationDialog param={{ kapitel: 'lotte' }} schliessen={vi.fn()} />);
    const gruppe = screen.getByRole('group', { name: 'Frage übernehmen: Was sagt Nordhaven zu Pauls Fenstern?' });
    fireEvent.click(within(gruppe).getByRole('button', { name: 'Als Faden planen' }));
    const form = within(gruppe).getByRole('form', { name: 'Als Faden planen' });
    fireEvent.click(within(form).getByLabelText('Bewusst offen lassen'));
    expect(within(form).getByLabelText('Auflösung geplant in')).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Faden anlegen' }));
    });
    const id = useStore.getState().daten!.kiLeser!.eintraege[0]!.fragen.find((x) => x.id === 'fenster-nordhaven')!.faden!;
    expect(useStore.getState().daten!.entscheidungen.faeden).toContainEqual({ id, status: 'bewusst_offen' });
    expect(within(gruppe).getByRole('button', { name: 'Faden · bewusst offen' })).toBeInTheDocument();
  });

  it('offene Frage als Notiz an die Belegstelle heften', async () => {
    render(<LeserSimulationDialog param={{ kapitel: 'lotte' }} schliessen={vi.fn()} />);
    const gruppe = screen.getByRole('group', { name: 'Frage übernehmen: Was sagt Nordhaven zu Pauls Fenstern?' });
    fireEvent.click(within(gruppe).getByRole('button', { name: 'Notiz an die Stelle' }));
    const form = within(gruppe).getByRole('form', { name: 'Notiz an die Stelle' });
    expect(form).toHaveTextContent('Kap. 1 · „Und was sagt Nordhaven zu so vielen Fenstern?“');
    fireEvent.change(within(form).getByLabelText('Was ist zu tun?'), { target: { value: 'Antwort von Nordhaven nachreichen' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Notiz anheften' }));
    });
    await useStore.getState().alleSpeichernAbwarten();

    const a = useStore.getState().daten!.anmerkungen.at(-1)!;
    expect(a.notiz).toBe('Antwort von Nordhaven nachreichen');
    expect(a.anker).toMatchObject({ kapitel: 'grundriss', exakt: 'Und was sagt Nordhaven zu so vielen Fenstern?' });
    expect(a.anker.davor).not.toBe('');
    expect(await fs.lesen(PFADE.anmerkungen)).toContain('Antwort von Nordhaven nachreichen');
    const leser = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(leser.eintraege[0].fragen.find((x: { id: string }) => x.id === 'fenster-nordhaven').anmerkung).toBe(a.id);

    fireEvent.click(within(gruppe).getByRole('button', { name: 'Notiz an der Stelle' }));
    expect(useStore.getState().markierung).toMatchObject({ kapitel: 'grundriss', anker: a.anker });
  });
});

describe('Leser-Simulation: alle Simulationen bleiben, erledigt und löschen', () => {
  const staende = () => useStore.getState().daten!.kiLeser!.eintraege;

  it('erneutes Simulieren hängt an; der Dialog wechselt zwischen den Simulationen des Kapitels', async () => {
    const erste = await useStore.getState().kileser.simulieren('fassade', false);
    const zweite = await useStore.getState().kileser.simulieren('fassade', false);
    expect(erste).not.toBe(zweite);
    expect(staende().map((e) => e.kapitel)).toEqual(['fassade', 'fassade', 'lotte']);
    await useStore.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(datei.eintraege.map((e: { id?: string }) => e.id)).toEqual([erste, zweite, undefined]);

    render(<LeserSimulationDialog param={{ kapitel: 'fassade', stand: erste }} schliessen={vi.fn()} />);
    const wahl = screen.getByRole('combobox', { name: 'Simulation' });
    expect(wahl).toHaveValue(erste);
    expect(within(wahl).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(wahl, { target: { value: zweite } });
    expect(wahl).toHaveValue(zweite);
  });

  it('als erledigt markieren: wandert in „erledigt“, die Karte zeigt sie nicht mehr; wieder offen geht auch', async () => {
    render(
      <>
        <Ansicht />
        <LeserSimulationKarte kapitelId="lotte" />
      </>,
    );
    const offen = screen.getByRole('list', { name: 'Gespeicherte Leser-Simulationen' });
    fireEvent.click(within(offen).getByRole('button', { name: /^Simulation nach Kap\. 3 vom .* als erledigt markieren$/ }));
    await waitFor(() => expect(staende()[0]!.erledigt).toBeTruthy());
    expect(screen.queryByRole('list', { name: 'Gespeicherte Leser-Simulationen' })).toBeNull();
    const erledigt = screen.getByRole('list', { name: 'Erledigte Leser-Simulationen' });
    expect(screen.getByText('1 erledigt')).toBeInTheDocument();
    expect(screen.getByText('Die letzte Simulation ist erledigt.')).toBeInTheDocument();
    await useStore.getState().alleSpeichernAbwarten();
    expect(JSON.parse((await fs.lesen(PFADE.kiLeser))!).eintraege[0].erledigt).toBeTruthy();

    fireEvent.click(within(erledigt).getByRole('button', { name: /wieder öffnen$/ }));
    await waitFor(() => expect(staende()[0]!.erledigt).toBeUndefined());
    expect(screen.getByRole('list', { name: 'Gespeicherte Leser-Simulationen' })).toBeInTheDocument();
  });

  it('im Dialog: „Erledigt“ markiert die gezeigte Simulation, „Löschen“ fragt nach und löscht nur sie', async () => {
    const neu = (await useStore.getState().kileser.simulieren('lotte', false))!;
    render(
      <>
        <LeserSimulationDialog param={{ kapitel: 'lotte', stand: neu }} schliessen={vi.fn()} />
        <BestaetigungHost />
      </>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erledigt' }));
    });
    expect(staende().find((e) => e.id === neu)!.erledigt).toBeTruthy();
    expect(screen.getByText('erledigt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wieder offen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    const frage = screen.getAllByRole('dialog').at(-1)!;
    expect(frage).toHaveTextContent(/Leser-Simulation nach Kap\. 3 vom .* löschen\?/);
    await act(async () => {
      fireEvent.click(within(frage).getByRole('button', { name: 'Löschen' }));
    });
    await waitFor(() => expect(staende().map((e) => e.id ?? 'alt')).toEqual(['alt']));
    // die ältere Simulation des Kapitels ist jetzt zu sehen
    expect(screen.getByRole('heading', { name: 'Was weiß die Leserin nach Kap. 3?' })).toBeInTheDocument();
  });
});
