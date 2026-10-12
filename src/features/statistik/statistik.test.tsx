/** G5: Tagesstatistik im Store, benannte Fassungen, Statistik-Bereich und Vergleich. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PFADE, parseStatistik } from '@core/projekt';
import { fassungsQuelle, tagSchluessel } from '@core/statistik';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleStore, useStore } from '../../state/store';
import Ansicht from './index';
import { SchreibzielAnzeige } from './SchreibzielAnzeige';
import VersionsvergleichDialog from './VersionsvergleichDialog';
import FassungDialog from './FassungDialog';

async function geladen(store = erstelleStore()) {
  const fs = demoFs();
  await store.getState().projektLaden(fs);
  return { store, fs };
}

const heute = () => tagSchluessel(new Date());

describe('Tagesstatistik im Store', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('zählt neue Wörter, Löschen zieht nichts ab, Sichern schreibt statistik.json', async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 14, 0, 0));
    const { store, fs } = await geladen();
    const k = store.getState().daten!.kapitel.grundriss!;
    await store.getState().speichereKapitel({ ...k, text: `${k.text}\n\nEins zwei drei vier fünf.` });
    expect(store.getState().statistik.offen['2026-10-10']?.geschrieben).toBe(5);

    const k2 = store.getState().daten!.kapitel.grundriss!;
    await store.getState().speichereKapitel({ ...k2, text: k2.text.replace('Eins zwei drei vier fünf.', 'Eins.') });
    expect(store.getState().statistik.offen['2026-10-10']?.geschrieben).toBe(5);

    await store.getState().statistik.sichern();
    const datei = parseStatistik((await fs.lesen(PFADE.statistik))!);
    expect(datei.tage['2026-10-10']?.geschrieben).toBe(5);
    expect(store.getState().statistik.offen).toEqual({});
    // vorhandene Tage bleiben erhalten
    expect(datei.tage['2026-10-08']?.geschrieben).toBe(530);
  });

  it('schreibt nach Mitternacht auf den neuen Tag', async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59, 50));
    const { store } = await geladen();
    const k = store.getState().daten!.kapitel.grundriss!;
    await store.getState().speichereKapitel({ ...k, text: `${k.text} vor Mitternacht` });
    vi.setSystemTime(new Date(2026, 9, 11, 0, 0, 5));
    const k2 = store.getState().daten!.kapitel.grundriss!;
    await store.getState().speichereKapitel({ ...k2, text: `${k2.text} nach Mitternacht drei` });
    const offen = store.getState().statistik.offen;
    expect(offen['2026-10-10']?.geschrieben).toBe(2);
    expect(offen['2026-10-11']?.geschrieben).toBe(3);
  });

  it('Ziele setzen: Tagesziel, Zielumfang, Abgabe entfernen', async () => {
    const { store, fs } = await geladen();
    await store.getState().statistik.zielSetzen({ tagWoerter: 750, buchWoerter: 90000, abgabe: undefined });
    const ziel = parseStatistik((await fs.lesen(PFADE.statistik))!).ziel;
    expect(ziel).toEqual({ tagWoerter: 750, buchWoerter: 90000 });
  });
});

describe('Benannte Fassungen', () => {
  it('sichert alle Kapitel, stellt wieder her und zählt das nicht als geschrieben', async () => {
    const { store, fs } = await geladen();
    const f = await store.getState().statistik.fassungSichern({ name: '  Vor Lektorat ', notiz: 'Test', kapitel: 'buch' });
    expect(f.name).toBe('Vor Lektorat');
    expect(f.dateien.length).toBeGreaterThan(1);
    for (const d of f.dateien) expect(await fs.lesen(d.version)).not.toBeNull();
    expect(JSON.parse((await fs.lesen(PFADE.fassungen))!).map((x: { name: string }) => x.name)).toContain('Vor Lektorat');

    const k = store.getState().daten!.kapitel.grundriss!;
    const alt = k.text;
    await store.getState().speichereKapitel({ ...k, text: `${k.text}\n\nNeuer Absatz mit sieben Wörtern ganz hinten.` });
    const vorher = store.getState().statistik.offen[heute()]?.geschrieben ?? 0;
    const e = await store.getState().statistik.fassungWiederherstellen(f.id);
    expect(e.wiederhergestellt).toEqual(['grundriss']);
    expect(store.getState().daten!.kapitel.grundriss!.text).toBe(alt);
    expect(store.getState().statistik.offen[heute()]?.geschrieben ?? 0).toBe(vorher);

    await store.getState().statistik.fassungAendern(f.id, { name: 'Lektorat 1', notiz: '' });
    expect(store.getState().daten!.fassungen!.find((x) => x.id === f.id)).toMatchObject({ name: 'Lektorat 1' });
    expect(store.getState().daten!.fassungen!.find((x) => x.id === f.id)?.notiz).toBeUndefined();
    await store.getState().statistik.fassungEntfernen(f.id);
    expect(store.getState().daten!.fassungen!.some((x) => x.id === f.id)).toBe(false);
  });

  it('ohne Namen keine Fassung', async () => {
    const { store } = await geladen();
    await expect(store.getState().statistik.fassungSichern({ name: ' ', kapitel: 'buch' })).rejects.toThrow(/Namen/);
  });
});

describe('Oberfläche', () => {
  beforeEach(async () => {
    useStore.setState({ dialog: null });
    await geladen(useStore);
    useStore.setState({ bereich: 'statistik' });
  });

  it('Bereich Statistik: Kennzahlen, Kalender mit Tastatur, Akte, Ziele', async () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Statistik', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Schreibstrecke' })).toBeInTheDocument();
    const kalender = screen.getByRole('group', { name: /Wörter pro Tag/ });
    const zellen = within(kalender).getAllByRole('button');
    expect(zellen.length).toBeGreaterThan(300);
    const fokussiert = zellen.find((z) => z.tabIndex === 0)!;
    expect(fokussiert.getAttribute('aria-label')).toMatch(/^Heute/);
    act(() => fokussiert.focus());
    fireEvent.keyDown(fokussiert, { key: 'ArrowUp' });
    const gestern = zellen.find((z) => z.tabIndex === 0)!;
    expect(gestern).not.toBe(fokussiert);
    expect(gestern).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Wörter je Akt und Kapitel' })).toBeInTheDocument();

    const tagesziel = screen.getByLabelText('Tagesziel (Wörter)');
    expect(tagesziel).toHaveValue('500');
    fireEvent.change(tagesziel, { target: { value: '800' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ziele sichern' }));
    });
    expect(useStore.getState().daten!.statistik!.ziel.tagWoerter).toBe(800);
  });

  it('Fassungen-Ansicht: Liste und Leerzustand', async () => {
    useStore.getState().statistik.setzeAnsicht('fassungen');
    const { unmount } = render(<Ansicht />);
    expect(screen.getByText('Erste Fassung')).toBeInTheDocument();
    unmount();
    await act(async () => {
      await useStore.getState().speichereFassungen([]);
    });
    render(<Ansicht />);
    expect(screen.getByText('Noch keine benannten Fassungen')).toBeInTheDocument();
    useStore.getState().statistik.setzeAnsicht('ueberblick');
  });

  it('Schreibziel in der Statusleiste', () => {
    render(<SchreibzielAnzeige />);
    expect(screen.getByRole('button', { name: /Tagesziel: .* von 500 Wörtern/ })).toBeInTheDocument();
  });

  it('Dialog „Fassung sichern“ legt eine Fassung an', async () => {
    const schliessen = vi.fn();
    render(<FassungDialog schliessen={schliessen} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fassung vor Lektorat' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Kapitel sichern/ }));
    });
    await vi.waitFor(() => expect(schliessen).toHaveBeenCalled());
    expect(useStore.getState().daten!.fassungen!.map((f) => f.name)).toContain('Fassung vor Lektorat');
  });

  it('Vergleich zweier Fassungen nebeneinander', async () => {
    const f = await useStore.getState().statistik.fassungSichern({ name: 'Vorher', kapitel: ['grundriss'] });
    const k = useStore.getState().daten!.kapitel.grundriss!;
    await useStore.getState().speichereKapitel({ ...k, text: `${k.text}\n\nGanz neuer Schluss.` });
    render(<VersionsvergleichDialog param={{ links: fassungsQuelle(f.id), rechts: 'aktuell', kapitel: 'grundriss' }} schliessen={() => undefined} />);
    const rechts = await screen.findByLabelText('Text der rechten Fassung');
    await vi.waitFor(() => expect(rechts.querySelector('.pw-st-diff--neu')?.textContent).toContain('Ganz neuer Schluss.'));
    expect(screen.getByLabelText('Text der linken Fassung').querySelector('.pw-st-diff--neu')).toBeNull();
    expect(document.querySelector('.pw-st-vgl__legende')?.textContent).toContain('neu 3 Wörter');
  });
});
