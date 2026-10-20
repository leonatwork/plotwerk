import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { useStore } from '../../state/store';
import { BestaetigungHost } from '../../ui';
import { useTastenkuerzel } from '../../app/tastenkuerzel';
import { befehlAusfuehren } from '../../app/befehle';
import EintragDialog from './EintragDialog';
import Ansicht, { kontext } from './index';
import { RechercheLeiste } from './RechercheLeiste';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function laden() {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
  });
  useStore.setState({ bereich: 'recherche', auswahl: {}, dialog: null });
  useStore.getState().recherche.filterZuruecksetzen();
  useStore.getState().recherche.waehle(null);
  useStore.getState().recherche.setzeDarstellung('raster');
}

/** jsdom: DataTransfer mit Dateien bzw. Text */
function uebergabe(dateien: File[], text = ''): DataTransfer {
  return {
    files: dateien as unknown as FileList,
    types: dateien.length ? ['Files'] : ['text/uri-list', 'text/plain'],
    getData: (t: string) => (t === 'text/uri-list' || t === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
}

function pngDatei(name: string): File {
  const f = new File([PNG], name, { type: 'image/png' });
  // jsdom kennt File.arrayBuffer nicht überall
  Object.defineProperty(f, 'arrayBuffer', { value: async () => PNG.slice().buffer });
  return f;
}

beforeEach(async () => {
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test-${++n}`), revokeObjectURL: vi.fn() }));
  await laden();
});
afterEach(() => vi.restoreAllMocks());

const optionen = () => within(screen.getByRole('listbox')).getAllByRole('option');
const titelDer = (el: HTMLElement) => el.querySelector('.rc-kachel__titel, .rc-zeile__titel')?.textContent;

describe('Bereich Recherche', () => {
  it('⌘F und der native Suchen-Befehl fokussieren weiter nur die Recherche-Suche', async () => {
    function Kuerzel() { useTastenkuerzel(); return null; }
    render(<><Ansicht /><Kuerzel /></>);
    const suche = screen.getByRole('searchbox', { name: 'Recherche durchsuchen' });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(suche).toHaveFocus();
    expect(useStore.getState().volltext.kapitelOffen).toBe(false);
    suche.blur();
    await act(async () => { await befehlAusfuehren('suchen'); });
    expect(suche).toHaveFocus();
    expect(useStore.getState().dialog).toBeNull();
  });
  it('zeigt die Einträge (neueste zuerst), filtert nach Art und Suche', async () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Recherche' })).toBeInTheDocument();
    expect(optionen().map(titelDer)).toEqual(['Handschrift der Postkarten', 'Saab 900 (Wikipedia)', 'Lindenhof (Skizze)']);

    fireEvent.click(screen.getByRole('button', { name: /Links/ }));
    expect(optionen().map(titelDer)).toEqual(['Saab 900 (Wikipedia)']);

    fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Recherche durchsuchen' }), { target: { value: 'fremde' } });
    expect(optionen().map(titelDer)).toEqual(['Handschrift der Postkarten']);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Recherche durchsuchen' }), { target: { value: 'gibt es nicht' } });
    expect(screen.getByText('Nichts gefunden')).toBeInTheDocument();
    const knoepfe = screen.getAllByRole('button', { name: 'Filter zurücksetzen' });
    expect(knoepfe).toHaveLength(2); // Filterleiste und Leerzustand
    fireEvent.click(knoepfe[1]!);
    expect(optionen()).toHaveLength(3);
  });

  it('filtert nach Ziel (Kapitel zählt seine Szenen mit) und nach Schlagwort', () => {
    render(<Ansicht />);
    const ziel = screen.getByRole('combobox', { name: 'Geheftet an' });
    fireEvent.change(ziel, { target: { value: 'figur:paul' } });
    expect(optionen().map(titelDer)).toEqual(['Saab 900 (Wikipedia)']);
    expect(kontext(useStore.getState())).toBe('Recherche · Figur Paul');
    fireEvent.change(ziel, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Schlagwort' }), { target: { value: 'Hafen' } });
    expect(optionen().map(titelDer)).toEqual(['Lindenhof (Skizze)']);
  });

  it('Tastatur: Pfeile wählen, Inspektor zeigt den Eintrag, ↩ öffnet den Dialog, Escape hebt die Wahl auf', () => {
    render(<Ansicht />);
    const liste = screen.getByRole('listbox');
    optionen()[0]!.focus();
    fireEvent.keyDown(liste, { key: 'ArrowDown' });
    expect(useStore.getState().recherche.gewaehlt).toBe('postkarten-handschrift');
    fireEvent.keyDown(liste, { key: 'ArrowDown' });
    expect(useStore.getState().recherche.gewaehlt).toBe('saab-900');
    const insp = screen.getByRole('complementary', { name: 'Recherche-Eintrag' });
    expect(within(insp).getByRole('heading', { name: 'Saab 900 (Wikipedia)' })).toBeInTheDocument();
    expect(within(insp).getByRole('button', { name: /Im Browser öffnen/ })).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Recherche · Saab 900 (Wikipedia)');

    fireEvent.keyDown(liste, { key: 'End' });
    expect(useStore.getState().recherche.gewaehlt).toBe('lindenhof-skizze');
    fireEvent.keyDown(liste, { key: 'Enter' });
    expect(useStore.getState().dialog).toEqual({ id: 'recherche-eintrag', param: { id: 'lindenhof-skizze' } });
    fireEvent.keyDown(liste, { key: 'Escape' });
    expect(useStore.getState().recherche.gewaehlt).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Recherche' })).toHaveTextContent('Tastatur');
  });

  it('Liste statt Raster; Leertaste zeigt ein Bild groß', async () => {
    render(<Ansicht />);
    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    expect(screen.getByRole('listbox')).toHaveClass('rc-sammlung--liste');
    act(() => useStore.getState().recherche.waehle('lindenhof-skizze'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: ' ' });
    const lupe = await screen.findByRole('dialog', { name: 'Lindenhof (Skizze)' });
    await waitFor(() => expect(within(lupe).getByRole('img', { name: 'Lindenhof (Skizze)' })).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
  });

  it('Heften und Lösen im Inspektor schreibt recherche.json', async () => {
    render(<Ansicht />);
    act(() => useStore.getState().recherche.waehle('saab-900'));
    const insp = screen.getByRole('complementary', { name: 'Recherche-Eintrag' });
    fireEvent.click(within(insp).getByRole('button', { name: 'Von Paul lösen' }));
    await waitFor(() => expect(useStore.getState().daten!.recherche!.eintraege.find((e) => e.id === 'saab-900')!.verweise).toEqual([{ typ: 'kapitel', id: 'lotte' }]));

    fireEvent.click(within(insp).getByRole('button', { name: '+ Heften' }));
    const feld = within(insp).getByRole('combobox', { name: 'Heften an' });
    fireEvent.change(feld, { target: { value: 'Linden' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    await act(() => useStore.getState().alleSpeichernAbwarten());
    const json = JSON.parse((await useStore.getState().fs!.lesen('recherche/recherche.json'))!);
    expect(json.eintraege.find((e: { id: string }) => e.id === 'saab-900').verweise).toEqual([
      { typ: 'kapitel', id: 'lotte' },
      { typ: 'ort', id: 'lindenhof' },
    ]);
  });

  it('Bild per Drag & Drop: wird nach recherche/dateien/ kopiert und an das gefilterte Ziel geheftet', async () => {
    render(<Ansicht />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Geheftet an' }), { target: { value: 'figur:paul' } });
    const bereich = document.querySelector('.rc-bereich')!;
    await act(async () => {
      fireEvent.drop(bereich, { dataTransfer: uebergabe([pngDatei('Pauls Wohnung.PNG')]) });
    });
    await waitFor(() => expect(useStore.getState().daten!.recherche!.eintraege).toHaveLength(4));
    const neu = useStore.getState().daten!.recherche!.eintraege[0]!;
    expect(neu).toMatchObject({ art: 'bild', titel: 'Pauls Wohnung', datei: 'recherche/dateien/pauls-wohnung.png', verweise: [{ typ: 'figur', id: 'paul' }] });
    expect(await useStore.getState().fs!.lesenBinaer!('recherche/dateien/pauls-wohnung.png')).toEqual(PNG);
    expect(useStore.getState().recherche.gewaehlt).toBe(neu.id);
  });

  it('Adresse per Drop wird Link-Eintrag, ohne die Seite zu laden', async () => {
    const holen = vi.fn();
    vi.stubGlobal('fetch', holen);
    render(<Ansicht />);
    await act(async () => {
      fireEvent.drop(document.querySelector('.rc-bereich')!, { dataTransfer: uebergabe([], 'https://de.wikipedia.org/wiki/Speicherstadt') });
    });
    await waitFor(() => expect(useStore.getState().daten!.recherche!.eintraege[0]).toMatchObject({ art: 'link', titel: 'Speicherstadt (de.wikipedia.org)' }));
    expect(holen).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Entfernen fragt nach und entfernt die Bilddatei (Kopie unter .versionen/)', async () => {
    render(
      <>
        <Ansicht />
        <BestaetigungHost />
      </>,
    );
    act(() => useStore.getState().recherche.waehle('lindenhof-skizze'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Backspace' });
    const frage = await screen.findByRole('dialog', { name: 'Eintrag entfernen' });
    fireEvent.click(within(frage).getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(useStore.getState().daten!.recherche!.eintraege.map((e) => e.id)).toEqual(['saab-900', 'postkarten-handschrift']));
    await act(() => useStore.getState().alleSpeichernAbwarten());
    const fs = useStore.getState().fs!;
    await waitFor(async () => expect(await fs.existiert('recherche/dateien/lindenhof.svg')).toBe(false));
    expect((await fs.auflisten('.versionen/recherche')).length).toBeGreaterThan(0);
  });

  it('Leerzustand ohne Einträge; freie Bilder im Ordner lassen sich übernehmen', async () => {
    await act(() => useStore.getState().speichereRecherche({ version: 1, eintraege: [] }));
    render(<Ansicht />);
    expect(screen.getByText('Noch keine Recherche')).toBeInTheDocument();
    const knopf = await screen.findByRole('button', { name: 'Als Einträge übernehmen' });
    fireEvent.click(knopf);
    await waitFor(() => expect(useStore.getState().daten!.recherche!.eintraege).toMatchObject([{ art: 'bild', datei: 'recherche/dateien/lindenhof.svg', titel: 'lindenhof' }]));
  });
});

describe('Dialog Recherche-Eintrag', () => {
  const props = (param?: unknown): DialogKomponentenProps => ({ param, schliessen: vi.fn() }) as unknown as DialogKomponentenProps;

  it('legt eine Notiz mit Ziel aus dem Aufruf an', async () => {
    const p = props({ art: 'notiz', verweis: { typ: 'ort', id: 'lindenhof' } });
    render(<EintragDialog {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Neuer Recherche-Eintrag' });
    expect(within(dialog).getByText('Lindenhof', { exact: false })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Titel'), { target: { value: 'Öffnungszeiten' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(p.schliessen).toHaveBeenCalled());
    expect(useStore.getState().daten!.recherche!.eintraege[0]).toMatchObject({ art: 'notiz', titel: 'Öffnungszeiten', verweise: [{ typ: 'ort', id: 'lindenhof' }] });
  });

  it('lehnt ungültige Adressen ab', async () => {
    const p = props({ art: 'link' });
    render(<EintragDialog {...p} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Adresse'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    expect(await within(dialog).findAllByText(/gültige/)).not.toHaveLength(0);
    expect(p.schliessen).not.toHaveBeenCalled();
    expect(useStore.getState().daten!.recherche!.eintraege).toHaveLength(3);
  });

  it('Bild ersetzen gibt die alte Datei frei', async () => {
    const p = props({ id: 'lindenhof-skizze' });
    render(<EintragDialog {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Recherche-Eintrag bearbeiten' });
    await act(async () => {
      fireEvent.drop(dialog.querySelector('.rc-ablage')!, { dataTransfer: uebergabe([pngDatei('kontor-foto.png')]) });
    });
    await within(dialog).findByText(/kontor-foto\.png/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(p.schliessen).toHaveBeenCalled());
    await act(() => useStore.getState().alleSpeichernAbwarten());
    const fs = useStore.getState().fs!;
    expect(useStore.getState().daten!.recherche!.eintraege.find((e) => e.id === 'lindenhof-skizze')!.datei).toBe('recherche/dateien/kontor-foto.png');
    await waitFor(async () => expect(await fs.existiert('recherche/dateien/lindenhof.svg')).toBe(false));
  });
});

describe('RechercheLeiste', () => {
  it('zeigt geheftete und erwähnte Einträge eines Ziels; Klick öffnet den Bereich', () => {
    useStore.setState({ bereich: 'figuren' });
    render(<RechercheLeiste ziel={{ typ: 'figur', id: 'die-fremde' }} />);
    const leiste = screen.getByRole('region', { name: 'Recherche' });
    fireEvent.click(within(leiste).getByRole('button', { name: /Handschrift der Postkarten/ }));
    expect(useStore.getState().bereich).toBe('recherche');
    expect(useStore.getState().recherche.gewaehlt).toBe('postkarten-handschrift');
  });

  it('Kapitel: Leerzustand lädt zum Hinzufügen ein', () => {
    render(<RechercheLeiste ziel={{ typ: 'kapitel', id: 'fassade' }} />);
    fireEvent.click(screen.getByRole('button', { name: /hierher ziehen oder hinzufügen/ }));
    expect(useStore.getState().dialog).toEqual({ id: 'recherche-eintrag', param: { verweis: { typ: 'kapitel', id: 'fassade' } } });
  });
});
