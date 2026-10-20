import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestandsProfil, profilMitPreset, standardProfil, type FunktionsProfil } from '@core/funktionen';
import { KiFehler, type KiTransport } from '@core/ki/index';
import { ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { App } from '../../app/App';
import { befehlAusfuehren } from '../../app/befehle';
import { suche } from '../../app/suche';
import { festesFunktionsProfil, initialisiereFunktionen, mitKiSperre, setzeFunktionsProfil, useFunktionsStore } from '../../state/funktionen';
import { useStore } from '../../state/store';
import { Assistent } from './Assistent';
import { FunktionsAuswahl } from './FunktionsAuswahl';

const SPEICHER = 'plotwerk:funktionen';

beforeEach(() => {
  localStorage.removeItem(SPEICHER);
});

describe('Einrichtungs-Assistent', () => {
  it('Anfänger ohne KI: Auswahl, Beispiel, Warnung, Zusammenfassung, gespeichert', async () => {
    festesFunktionsProfil(standardProfil(), true);
    render(<Assistent />);
    expect(screen.getByRole('heading', { name: 'Was für ein Schreiber bist du?' })).toBeInTheDocument();
    // beim ersten Start ist kein Typ vorausgewählt
    expect(screen.getByRole('button', { name: /Schriftsteller/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /Anfänger/ }));

    expect(screen.getByRole('heading', { name: 'Das ist für dich drin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Figuren' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Recherche' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Schreiben & Kapitel' })).toBeDisabled();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('8 von 22 Funktionen sichtbar');
    const orte = screen.getByRole('checkbox', { name: 'Orte' }).closest('li')!;
    fireEvent.click(within(orte).getByRole('button', { name: 'Beispiel' }));
    expect(within(orte).getByText(/Linden-Hof/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    fireEvent.click(screen.getByRole('radio', { name: /Ohne KI arbeiten/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Diese 2 Funktionen sind dann nicht verfügbar: KI-Prüfung und KI-Erkennung.');

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Anfänger · 6 von 22 Funktionen sichtbar · KI aus')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Los geht’s' }));
    });

    const { profil, assistentOffen, aktiv } = useFunktionsStore.getState();
    expect(assistentOffen).toBe(false);
    expect(profil).toMatchObject({ basis: 'einsteiger', kiAus: true, eingerichtet: true });
    expect(aktiv.has('kiPruefung')).toBe(false);
    expect(aktiv.has('figuren')).toBe(true);
    expect(JSON.parse(localStorage.getItem(SPEICHER)!)).toMatchObject({ basis: 'einsteiger', kiAus: true, eingerichtet: true });
  });

  it('Überspringen zeigt alles und gilt als eingerichtet', async () => {
    festesFunktionsProfil(standardProfil(), true);
    render(<Assistent />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Überspringen – alles anzeigen' }));
    });
    const { profil, aktiv } = useFunktionsStore.getState();
    expect(profil.eingerichtet).toBe(true);
    expect(aktiv.size).toBe(22);
  });
});

function Steuerung({ start }: { start: FunktionsProfil }) {
  const [profil, setProfil] = useState(start);
  return <FunktionsAuswahl profil={profil} onChange={setProfil} />;
}

describe('Funktionsauswahl', () => {
  it('löst Abhängigkeiten auf und speichert eigene Presets', () => {
    render(<Steuerung start={bestandsProfil()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Figuren' }));
    for (const name of ['Figuren', 'Figurenbögen', 'Beziehungen & Gruppen', 'Figurenstimme'])
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Figurenbögen' }));
    expect(screen.getByRole('checkbox', { name: 'Figuren' })).toBeChecked();
    const boegen = screen.getByRole('checkbox', { name: 'Figurenbögen' }).closest('li')!;
    expect(within(boegen).getByText('braucht Figuren')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Als eigenes Preset speichern' }), { target: { value: 'Krimi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Preset „Krimi“ gespeichert.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preset „Krimi“ löschen' })).toBeInTheDocument();
  });
});

describe('No-AI-Modus', () => {
  it('sperrt Senden und Token-Zählung am Transport', async () => {
    const basis: KiTransport = { bereit: vi.fn(async () => true), senden: vi.fn(async () => ({})), tokenZaehlen: vi.fn(async () => 1) };
    const transport = mitKiSperre(basis);
    festesFunktionsProfil({ ...bestandsProfil(), kiAus: true });
    await expect(transport.senden({})).rejects.toBeInstanceOf(KiFehler);
    await expect(transport.tokenZaehlen({})).rejects.toThrow('No-AI-Modus');
    expect(basis.senden).not.toHaveBeenCalled();
    expect(basis.tokenZaehlen).not.toHaveBeenCalled();
    festesFunktionsProfil(bestandsProfil());
    await transport.senden({});
    expect(basis.senden).toHaveBeenCalledTimes(1);
  });
});

describe('Laden', () => {
  it('erster Start: Assistent; gespeichertes Profil: ohne Assistent', async () => {
    festesFunktionsProfil(bestandsProfil());
    await initialisiereFunktionen();
    expect(useFunktionsStore.getState().assistentOffen).toBe(true);

    localStorage.setItem(SPEICHER, JSON.stringify({ ...profilMitPreset(standardProfil(), 'profi'), eingerichtet: true }));
    await initialisiereFunktionen();
    expect(useFunktionsStore.getState()).toMatchObject({ assistentOffen: false, profil: { basis: 'profi' } });
  });
});

describe('Ausgeblendete Funktionen in der App', () => {
  it('fehlen in Seitenleiste, Titelleiste und Schnellsuche; ein Aufruf fragt nach und blendet ein', async () => {
    festesFunktionsProfil({ ...profilMitPreset(standardProfil(), 'einsteiger'), eingerichtet: true });
    await useStore.getState().initialisieren();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Bereiche' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Werkzeuge' }));
    expect(within(nav).getAllByRole('button').map((e) => e.textContent?.replace(/\d+.*$/, ''))).toEqual([
      'Schreiben', 'Kapitel-Überblick', 'Figuren', 'Orte', 'Hinweise', 'Werkzeuge', 'Statistik',
    ]);
    expect(await screen.findByRole('button', { name: 'Kapitel prüfen' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Typewriter' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Stil' })).toBeNull();

    const daten = await ladeDemoProjekt();
    expect(suche(daten, 'zeitleiste')).toEqual([]);
    expect(suche(daten, 'normseite')).toEqual([]);

    // ⌘8 bzw. Menü: Rückfrage, dann eingeblendet
    let fertig!: Promise<void>;
    act(() => {
      fertig = befehlAusfuehren('zeitleiste');
    });
    const frage = await screen.findByRole('dialog', { name: '„Zeitleiste“ ist ausgeblendet' });
    await act(async () => {
      fireEvent.click(within(frage).getByRole('button', { name: 'Einblenden' }));
      await fertig;
    });
    expect(useStore.getState().bereich).toBe('zeitleiste');
    expect(within(nav).getByText('Zeitleiste')).toBeInTheDocument();

    // No-AI-Modus: KI-Knöpfe verschwinden, der Rest bleibt
    await act(async () => {
      await setzeFunktionsProfil({ ...useFunktionsStore.getState().profil, kiAus: true });
      useStore.getState().setzeBereich('schreiben');
    });
    expect(screen.queryByRole('button', { name: 'Kapitel prüfen' })).toBeNull();
    expect(within(nav).getByText('Figuren')).toBeInTheDocument();
  });
});
