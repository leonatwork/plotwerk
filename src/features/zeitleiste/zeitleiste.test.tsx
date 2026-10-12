import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { useStore } from '../../state/store';
import Ansicht from './index';
import ZeitVorschlagDialog from './ZeitVorschlagDialog';

beforeEach(async () => {
  await act(async () => {
    useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) } });
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
    useStore.getState().zeit.waehle(null);
    useStore.getState().zeit.setzeSzenen(true);
    useStore.getState().zeit.setzeFigur(null);
  });
});

const karte = (name: RegExp) => screen.getByRole('button', { name });

describe('Zeitleiste (G1)', () => {
  it('zeigt Tage, Lücken, unbekannte Abstände, Szenen und Spuren', () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Zeitleiste' })).toBeInTheDocument();
    expect(screen.getByText('Tag 8')).toBeInTheDocument();
    expect(screen.getAllByText('Abstand unbekannt').length).toBeGreaterThan(0);
    expect(screen.getByTitle('4 Tage ohne Szene')).toBeInTheDocument();
    expect(karte(/Szene 2 „Kai bei Nacht“/)).toBeInTheDocument();
    // Zustandsspur der Hauptfigur
    expect(screen.getByText('Paul', { selector: '.zl-beschriftung__figur' })).toBeInTheDocument();
    expect(screen.getAllByText('Gedächtnislücke').length).toBeGreaterThan(0);
    // lokale Zeitprüfung: Kap. 10 Donnerstag passt nicht zu Tag 9
    expect(screen.getByText(/Ein Zeitwiderspruch/)).toBeInTheDocument();
    expect(karte(/Kap\. 10 „Funkstille“.*1 Zeit-Hinweis/)).toBeInTheDocument();
  });

  it('wählt Karten mit der Tastatur und zeigt den Inspektor', () => {
    render(<Ansicht />);
    const erste = karte(/Kap\. 1 „Grundriss“/);
    erste.focus();
    fireEvent.keyDown(erste, { key: 'ArrowRight' });
    expect(useStore.getState().zeit.auswahl).toBe('fassade');
    expect(document.activeElement).toBe(karte(/Kap\. 2 /));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(useStore.getState().zeit.auswahl).toBe('grundriss');
    expect(screen.getByRole('heading', { name: 'Grundriss' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(useStore.getState().zeit.auswahl).not.toBe('grundriss');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(useStore.getState().zeit.auswahl).toBeNull();
    expect(screen.getByRole('heading', { name: 'Überblick' })).toBeInTheDocument();
  });

  it('setzt einen Zeitpunkt relativ („am nächsten Morgen“) und per Feld', async () => {
    render(<Ansicht />);
    fireEvent.click(karte(/Kap\. 8 „Bis bald“/));
    const insp = screen.getByRole('complementary', { name: 'Zeitpunkt und Zustand' });
    await act(async () => {
      fireEvent.click(within(insp).getByRole('button', { name: 'am nächsten Morgen' }));
    });
    await waitFor(() => expect(useStore.getState().daten!.plaene['bis-bald']?.zeit).toMatchObject({ tag: 9, tageszeit: 'morgens', sicherheit: 'ungefaehr' }));
    const uhrzeit = within(insp).getByLabelText('Uhrzeit');
    fireEvent.change(uhrzeit, { target: { value: '7.30' } });
    await act(async () => {
      fireEvent.blur(uhrzeit);
    });
    await waitFor(() => expect(useStore.getState().daten!.plaene['bis-bald']?.zeit?.uhrzeit).toBe('07:30'));
    // ungültige Uhrzeit wird nicht gespeichert
    fireEvent.change(uhrzeit, { target: { value: '7.5' } });
    fireEvent.blur(uhrzeit);
    expect(within(insp).getByText('Bitte als HH:MM eingeben.')).toBeInTheDocument();
    expect(useStore.getState().daten!.plaene['bis-bald']?.zeit?.uhrzeit).toBe('07:30');
  });

  it('setzt einen Beleg nur aus dem Text', async () => {
    render(<Ansicht />);
    fireEvent.click(karte(/Kap\. 8 „Bis bald“/));
    const insp = screen.getByRole('complementary', { name: 'Zeitpunkt und Zustand' });
    const feld = within(insp).getAllByLabelText('Beleg im Text (wörtlich)')[0]!;
    fireEvent.change(feld, { target: { value: 'Er schläft bis Mittag' } });
    fireEvent.click(within(insp).getAllByRole('button', { name: 'Setzen' })[0]!);
    expect(within(insp).getByText('Die Stelle steht so nicht in Kap. 8.')).toBeInTheDocument();
    fireEvent.change(feld, { target: { value: 'An der Theke' } });
    await act(async () => {
      fireEvent.click(within(insp).getAllByRole('button', { name: 'Setzen' })[0]!);
    });
    await waitFor(() => expect(useStore.getState().daten!.plaene['bis-bald']?.zeit?.beleg?.exakt).toBe('An der Theke'));
  });

  it('trägt Pauls Zustand ein und entfernt ihn wieder', async () => {
    render(<Ansicht />);
    fireEvent.click(karte(/Kap\. 1 „Grundriss“/));
    const gruppe = screen.getByRole('group', { name: 'Zustand von Paul' });
    await act(async () => {
      fireEvent.click(within(gruppe).getByRole('button', { name: /verwirrt/ }));
    });
    await waitFor(() =>
      expect(useStore.getState().daten!.zeitleiste!.zustaende.find((z) => z.kapitel === 'grundriss')).toMatchObject({ figur: 'paul', zustand: 'verwirrt' }),
    );
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Zustand von Paul' })).getByRole('button', { name: /verwirrt/ }));
    });
    await waitFor(() => expect(useStore.getState().daten!.zeitleiste!.zustaende.find((z) => z.kapitel === 'grundriss')).toBeUndefined());
  });

  it('Dialog: holt Vorschläge (Demo), übernimmt und verwirft einzeln – nie automatisch', async () => {
    render(<ZeitVorschlagDialog schliessen={() => undefined} param={{ art: 'zeit' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Alle Kapitel mit Text/ }));
    const start = await screen.findByRole('button', { name: 'Vorschläge holen' });
    await waitFor(() => expect(start).toBeEnabled());
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(() => expect(useStore.getState().zeit.ergebnis).not.toBeNull());
    const e = useStore.getState().zeit.ergebnis!;
    expect(useStore.getState().zeit.fehler).toBeNull();
    // erfundenes Zitat, Formulierungsvorschlag, Uhrzeit ≠ Tageszeit
    expect(e.verworfen).toHaveLength(3);
    expect(e.neu).toBeGreaterThan(0);
    // Plan unverändert, bis Leon entscheidet
    expect(useStore.getState().daten!.plaene['bis-bald']?.zeit).toBeUndefined();
    const v = await screen.findByRole('article', { name: 'Vorschlag Zeitpunkt Kap. 8' });
    await act(async () => {
      fireEvent.click(within(v).getByRole('button', { name: 'Kap. 8 übernehmen' }));
    });
    await waitFor(() => expect(useStore.getState().daten!.plaene['bis-bald']?.zeit).toMatchObject({ tag: 9, tageszeit: 'morgens' }));
    expect(useStore.getState().daten!.plaene['bis-bald']?.zeit?.beleg?.exakt).toBe('Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.');
    const funkstille = screen.getByRole('article', { name: 'Vorschlag Zeitpunkt Kap. 10' });
    await act(async () => {
      fireEvent.click(within(funkstille).getByRole('button', { name: 'Kap. 10 verwerfen' }));
    });
    await waitFor(() => expect(useStore.getState().daten!.kiZeitVorschlaege!.eintraege.find((x) => x.schluessel === 'zeit:funkstille')?.status).toBe('verworfen'));
    expect(useStore.getState().daten!.plaene.funkstille?.zeit?.tag).toBe(9);
  });

  it('Dialog: Zustände einer Figur vorschlagen', async () => {
    render(<ZeitVorschlagDialog schliessen={() => undefined} param={{ art: 'zustand', figur: 'paul' }} />);
    const start = await screen.findByRole('button', { name: 'Vorschläge holen' });
    await waitFor(() => expect(start).toBeEnabled());
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(() => expect(useStore.getState().zeit.ergebnis?.art).toBe('zustand'));
    const e = useStore.getState().zeit.ergebnis!;
    expect(e.verworfen.map((x) => x.grund)[0]).toMatch(/Zitat steht nicht wörtlich/);
    // Kap. 10 „schlaflos“ steht schon im Plan
    expect(e.schonEingetragen).toBe(1);
    expect(screen.getByRole('article', { name: /Vorschlag Zustand Paul Kap\. 8/ })).toBeInTheDocument();
  });
});
