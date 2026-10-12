import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import Faeden from './index';
import { StrangRaster } from './StrangRaster';
import { SzenenKarte, SzenenUebersicht } from './Szenen';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  useStore.setState((s) => ({ struktur: { ...s.struktur, fadenAuswahl: null, fadenFilter: { strang: null, nurRuhend: false }, szeneOffen: null } }));
});

const spalte = (name: RegExp) => screen.getByRole('region', { name });
const karte = (id: string) => document.querySelector<HTMLElement>(`[data-faden="${id}"]`);

describe('Fäden-Board', () => {
  it('zeigt Analyse-Fäden und Leons Fäden in den Spalten, mit Ruhe-Warnung', () => {
    render(<Faeden />);
    expect(screen.getByRole('heading', { name: 'Lose Enden' })).toBeInTheDocument();
    const geplant = spalte(/^Auflösung geplant/);
    expect(within(geplant).getByText('Die Fremde und die Postkarten')).toBeInTheDocument();
    expect(within(geplant).getByText('Auflösung Kap. 10')).toBeInTheDocument();
    const offen = spalte(/^Offen/);
    expect(within(offen).getByText('Pauls Bleistifte')).toBeInTheDocument();
    expect(within(offen).getAllByText(/ruht seit \d+ Kapiteln/).length).toBeGreaterThan(0);
  });

  it('⌥→ legt einen Faden in die Nachbarspalte; „geplant“ ohne Kapitel fragt nach dem Kapitel', async () => {
    render(<Faeden />);
    await act(async () => {
      fireEvent.keyDown(karte('die-fremde-und-die-postkarten')!, { key: 'ArrowRight', altKey: true });
    });
    await waitFor(() => expect(useStore.getState().daten!.entscheidungen.faeden).toContainEqual({ id: 'die-fremde-und-die-postkarten', status: 'erledigt' }));

    await act(async () => {
      fireEvent.keyDown(karte('pauls-bleistifte')!, { key: 'ArrowRight', altKey: true });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Auflösung planen' });
    fireEvent.change(within(dialog).getByLabelText('Kapitel der Auflösung'), { target: { value: 'funkstille' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Planen' }));
    });
    await waitFor(() => expect(useStore.getState().daten!.fadenplanung!.faeden.find((f) => f.id === 'pauls-bleistifte')?.aufloesungIn).toBe('funkstille'));
  });

  it('Inspektor: Notiz und Auflösung ändern, eigener Faden anlegen', async () => {
    render(<Faeden />);
    fireEvent.click(karte('der-messingschluessel')!);
    const notiz = screen.getByLabelText('Notiz');
    fireEvent.change(notiz, { target: { value: 'Wer hat sie ihm gegeben?' } });
    await act(async () => {
      fireEvent.blur(notiz);
    });
    expect(useStore.getState().daten!.fadenplanung!.faeden.find((f) => f.id === 'der-messingschluessel')?.notiz).toBe('Wer hat sie ihm gegeben?');

    act(() => useStore.getState().struktur.setzeFadenNeuOffen(true));
    const dialog = await screen.findByRole('dialog', { name: 'Neues loses Ende' });
    fireEvent.change(within(dialog).getByPlaceholderText('z. B. Pauls Bleistifte'), { target: { value: 'Der Schlüssel' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    });
    await waitFor(() => expect(karte('der-schluessel')).not.toBeNull());
    expect(useStore.getState().struktur.fadenAuswahl).toBe('der-schluessel');
  });

  it('Filter „Nur ruhende“ blendet aktive Fäden aus', () => {
    render(<Faeden />);
    fireEvent.click(screen.getByRole('button', { name: /^Nur ruhende/ }));
    expect(karte('die-fremde-und-die-postkarten')).toBeNull();
    expect(karte('pauls-bleistifte')).not.toBeNull();
  });
});

describe('Strang-Raster', () => {
  it('Zeilen je Strang, Lücken benannt; Klick nimmt den Strang in den Kapitelplan', async () => {
    render(<StrangRaster daten={useStore.getState().daten!} />);
    expect(screen.getByRole('grid', { name: 'Stränge je Kapitel' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Begegnungen/ })).toHaveTextContent(/fehlt in 4–6/);
    const zelle = screen.getByRole('button', { name: /^Kap\. 4 · .*Begegnungen: fehlt/ });
    expect(zelle).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(zelle);
    });
    expect(useStore.getState().daten!.plaene[useStore.getState().daten!.projekt.kapitel[3]!]!.straenge).toContain('begegnungen');
  });

  it('Pfeiltasten wandern durch das Raster', () => {
    render(<StrangRaster daten={useStore.getState().daten!} />);
    const erste = screen.getAllByRole('button', { pressed: true })[0]!;
    const start = document.querySelector<HTMLButtonElement>('[data-zelle="0:0"]')!;
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(document.querySelector('[data-zelle="0:1"]'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(document.querySelector('[data-zelle="1:1"]'));
    expect(erste).toBeInTheDocument();
  });
});

describe('Szenen', () => {
  it('Schreiben-Inspektor: drei Szenen in „Ebbe“, Plan aufklappen und Titel ändern', async () => {
    render(<SzenenKarte kapitelId="ebbe" />);
    expect(screen.getByText('Fischrestaurant mit Vera')).toBeInTheDocument();
    expect(screen.getByText('3 Szenen · 3 geplant')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Szene 2:\s*Kai bei Nacht/ }));
    const titel = screen.getByDisplayValue('Kai bei Nacht');
    expect(document.activeElement).toBe(titel);
    fireEvent.change(titel, { target: { value: 'Laterne aus, Laterne an' } });
    await act(async () => {
      fireEvent.keyDown(titel, { key: 'Enter' });
    });
    expect(useStore.getState().daten!.plaene.ebbe!.szenen!.find((s) => s.id === 'ebbe-s2')?.titel).toBe('Laterne aus, Laterne an');
    // Text bleibt unverändert
    expect(useStore.getState().daten!.kapitel.ebbe!.text).toContain('* * *');
  });

  it('Uhrzeit wird geprüft und normalisiert', async () => {
    useStore.getState().struktur.setzeSzeneOffen({ kapitel: 'ebbe', index: 2 });
    render(<SzenenKarte kapitelId="ebbe" />);
    const uhr = screen.getByLabelText('Uhrzeit (HH:MM)');
    fireEvent.change(uhr, { target: { value: '25:00' } });
    await act(async () => {
      fireEvent.blur(uhr);
    });
    expect(uhr).toHaveAttribute('aria-invalid', 'true');
    expect(useStore.getState().daten!.plaene.ebbe!.szenen!.find((s) => s.id === 'ebbe-s3')?.zeit).toBeUndefined();
    fireEvent.change(uhr, { target: { value: '7.05' } });
    await act(async () => {
      fireEvent.blur(uhr);
    });
    expect(useStore.getState().daten!.plaene.ebbe!.szenen!.find((s) => s.id === 'ebbe-s3')?.zeit).toEqual({ sicherheit: 'fest', uhrzeit: '07:05' });
  });

  it('Kapitel ohne Trenner: Hinweis und „+ Szene planen“ legt die erste Szene an', async () => {
    render(<SzenenKarte kapitelId="grundriss" />);
    expect(screen.getByText(/noch eine einzige Szene/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Szene planen' }));
    });
    expect(useStore.getState().daten!.plaene.grundriss!.szenen).toHaveLength(1);
    expect(useStore.getState().daten!.plaene.grundriss!.szenen![0]!.id).toBe('grundriss-s1');
  });

  it('Kapitel-Überblick: Kacheln und Plan-Dialog', async () => {
    render(<SzenenUebersicht kapitelId="ebbe" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('listitem', { name: /Szene 3:\s*Zu Hause/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Kap. 7 · Szene 3' });
    expect(within(dialog).getByDisplayValue('Zu Hause')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
