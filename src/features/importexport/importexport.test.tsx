import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importiereDocx } from '@core/docx/index';
import { MemoryFs, serializeProjekt } from '@core/projekt';
import { klartext } from '@core/text/index';
import { demoFs } from '../../../fixtures/demoProjekt';
import type { Backend } from '../../backend';
import { exportDateiname, ImportAbgebrochen } from '../../state/slices/importexport';
import { erstelleStore, useStore } from '../../state/store';
import { ExportDialog } from './ExportDialog';
import { ersterSatz, ImportDialog } from './ImportDialog';
import { unicodeBereiche } from './pdfSchriften';

vi.mock('./pdfSchriften', async (original) => ({ ...(await original<typeof import('./pdfSchriften')>()), ladePdfSchriften: async () => [] }));

const TEST_DOCX = new Uint8Array(readFileSync(join(__dirname, '../../../fixtures/test-manuskript.docx')));

function leeresProjekt(titel = 'Leer'): MemoryFs {
  return new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel, kapitel: [], notiz: '' }) });
}

function fakeBackend(teil: Partial<Backend> = {}): Backend {
  return {
    art: 'demo',
    projektOeffnen: vi.fn(async () => null),
    neuesProjekt: vi.fn(async (titel: string) => leeresProjekt(titel)),
    letztesProjekt: vi.fn(async () => null),
    dateiWaehlen: vi.fn(async () => ({ name: 'test-manuskript.docx', daten: TEST_DOCX })),
    dateiSpeichern: vi.fn(async () => true),
    ki: { senden: vi.fn(), tokenZaehlen: vi.fn(), bereit: vi.fn(async () => false) } as unknown as Backend['ki'],
    indexSpeicher: { laden: async () => null, speichern: async () => undefined, leeren: async () => undefined },
    schluessel: { setzen: async () => undefined, vorhanden: async () => false, loeschen: async () => undefined },
    beimBeenden: () => undefined,
    aufExterneAenderung: () => undefined,
    ...teil,
  };
}

describe('Slice importexport', () => {
  it('übernimmt in ein leeres Projekt: Manuskripte, Pläne, Reihenfolge, leere Kapitel geplant', async () => {
    const store = erstelleStore();
    const fs = leeresProjekt();
    store.setState({ backend: fakeBackend() });
    await store.getState().projektLaden(fs);
    const ergebnis = await importiereDocx(TEST_DOCX);
    const bericht = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell' });
    await store.getState().alleSpeichernAbwarten();

    expect(bericht.ids).toEqual([
      'grundriss', 'fassade', 'lotte', 'regatta', 'staub', 'das-leere-blatt', 'ebbe', 'bis-bald', 'flut', 'funkstille',
    ]);
    expect(bericht.geplant).toBe(1);
    const d = store.getState().daten!;
    expect(d.projekt.kapitel).toEqual(bericht.ids);
    expect(d.plaene.regatta!.status).toBe('geplant');
    expect(d.plaene.lotte!.status).toBe('geschrieben');
    expect(await fs.existiert('manuskript/regatta.md')).toBe(false);
    expect(await fs.lesen('plan/kapitel/regatta.md')).toContain('status: geplant');
    expect(await fs.lesen('manuskript/lotte.md')).toContain('\\*Sternchen\\*');
    expect(await fs.lesen('projekt.md')).toContain('  - flut');
    // neu geladen: gleiche Daten
    const neu = erstelleStore();
    await neu.getState().projektLaden(fs);
    expect(neu.getState().daten!.projekt.kapitel).toEqual(bericht.ids);
    expect(klartext(neu.getState().daten!.kapitel.lotte!.text)).toBe(klartext(ergebnis.kapitel[2]!.text));
  });

  it('hängt an ein bestehendes Projekt an, mit eindeutigen IDs und Vorspann als Kapitel', async () => {
    const store = erstelleStore();
    store.setState({ backend: fakeBackend() });
    await store.getState().projektLaden(demoFs());
    const vorher = store.getState().daten!.projekt.kapitel.length;
    const ergebnis = { ...(await importiereDocx(TEST_DOCX)), vorspann: 'Für A.' };
    const bericht = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell', vorspannAlsKapitel: true });
    const d = store.getState().daten!;
    expect(bericht.ids[0]).toBe('vorspann');
    expect(bericht.ids).toContain('lotte-2');
    expect(d.projekt.kapitel).toHaveLength(vorher + 11);
    expect(d.projekt.kapitel.slice(vorher)).toEqual(bericht.ids);
    expect(d.kapitel.lotte!.titel).toBe('Lotte');
  });

  it('bricht ab, wenn kein neues Projekt angelegt wird, und schreibt nichts', async () => {
    const store = erstelleStore();
    const fs = demoFs();
    store.setState({ backend: fakeBackend({ neuesProjekt: vi.fn(async () => null) }) });
    await store.getState().projektLaden(fs);
    const vorher = store.getState().daten!.projekt.kapitel.length;
    await expect(store.getState().importUebernehmen(await importiereDocx(TEST_DOCX), { ziel: 'neu', projektTitel: 'X' })).rejects.toBeInstanceOf(
      ImportAbgebrochen,
    );
    expect(store.getState().daten!.projekt.kapitel).toHaveLength(vorher);
  });

  it('exportiert eine Auswahl in Projektreihenfolge (docx und PDF)', async () => {
    const store = erstelleStore();
    store.setState({ backend: fakeBackend() });
    await store.getState().projektLaden(demoFs());
    const docx = await store.getState().exportErstellen({ format: 'docx', kapitel: ['ebbe', 'lotte'] });
    const wieder = await importiereDocx(docx);
    expect(wieder.kapitel.map((k) => k.titel)).toEqual(['Lotte', 'Ebbe']);
    expect(klartext(wieder.kapitel[1]!.text)).toBe(klartext(store.getState().daten!.kapitel.ebbe!.text));
    const pdf = await store.getState().exportErstellen({ format: 'pdf', kapitel: ['ebbe', 'lotte'] });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('Dateiname aus dem Titel', () => {
    expect(exportDateiname('Hafenlichter', 'docx')).toBe('Hafenlichter.docx');
    expect(exportDateiname('A/B: „C“?', 'pdf')).toBe('A-B- „C“-.pdf');
    expect(exportDateiname('  ', 'pdf')).toBe('Manuskript.pdf');
  });
});

describe('Hilfen', () => {
  it('erster Satz und Unicode-Bereiche', () => {
    expect(ersterSatz('## Montag\n\nDas Blatt liegt auf dem Tisch. Niemand will es sehen.')).toBe('Montag');
    expect(ersterSatz('„Hallo!“ Sie lacht.')).toBe('„Hallo!“');
    expect(ersterSatz('')).toBe('');
    expect(unicodeBereiche('U+0000-00FF,U+0131,U+2000-206F')).toEqual([
      [0, 255],
      [0x131, 0x131],
      [0x2000, 0x206f],
    ]);
  });
});

describe('ImportDialog', () => {
  beforeEach(() => {
    useStore.setState({ dialog: null, daten: null, fs: null });
  });

  it('Datei wählen → Vorschau mit Hinweisen → Übernahme → zum ersten Kapitel', async () => {
    const backend = fakeBackend();
    const fs = leeresProjekt('Hafenlichter');
    useStore.setState({ backend });
    await useStore.getState().projektLaden(fs);
    const schliessen = vi.fn();
    render(<ImportDialog schliessen={schliessen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Word-Datei wählen …' }));
    expect(await screen.findByText('test-manuskript.docx')).toBeInTheDocument();
    expect(backend.dateiWaehlen).toHaveBeenCalledWith(['docx']);
    const liste = screen.getByRole('list');
    expect(within(liste).getAllByRole('listitem')).toHaveLength(10);
    expect(within(liste).getByText('Regatta').closest('li')).toHaveTextContent('geplant');
    expect(within(liste).getByText('Der Wecker klingelt um 6:12 Uhr, und ich drücke ihn weg – zweimal.')).toBeInTheDocument();
    expect(screen.getByText('Leere Überschrift am Ende')).toBeInTheDocument();
    expect(screen.getByText('Endet mitten im Satz')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'In dieses Projekt „Hafenlichter“' })).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '10 Kapitel übernehmen' }));
    });
    expect(await screen.findByText('10 Kapitel übernommen, davon 1 ohne Text (als geplant).')).toBeInTheDocument();
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.projekt.kapitel).toHaveLength(10);
    expect(await fs.existiert('manuskript/flut.md')).toBe(true);

    // Kapitel ohne Text, Satzende in Kap. 9, leere Überschrift nach Kap. 10
    expect(screen.getAllByRole('button', { name: 'Kapitel öffnen' })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button', { name: 'Kapitel öffnen' })[0]!);
    expect(useStore.getState().auswahl.kapitel).toBe('regatta');
    expect(useStore.getState().bereich).toBe('schreiben');
    expect(schliessen).toHaveBeenCalled();
  });

  it('ohne Projekt: neues Projekt mit Titel aus der Datei; Fehler bei kaputter Datei', async () => {
    const backend = fakeBackend({ dateiWaehlen: vi.fn(async () => ({ name: 'kaputt.docx', daten: new Uint8Array([1, 2, 3]) })) });
    useStore.setState({ backend, daten: null, fs: null });
    render(<ImportDialog schliessen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Word-Datei wählen …' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('keine gültige Word-Datei');

    backend.dateiWaehlen = vi.fn(async () => ({ name: 'test-manuskript.docx', daten: TEST_DOCX }));
    fireEvent.click(screen.getByRole('button', { name: 'Word-Datei wählen …' }));
    expect(await screen.findByRole('textbox', { name: 'Titel des neuen Projekts' })).toHaveValue('Hafenlichter');
    expect(screen.queryByRole('radio', { name: /In dieses Projekt/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '10 Kapitel übernehmen' }));
    });
    expect(await screen.findByText(/10 Kapitel übernommen/)).toBeInTheDocument();
    expect(backend.neuesProjekt).toHaveBeenCalledWith('Hafenlichter');
    expect(useStore.getState().daten!.projekt.titel).toBe('Hafenlichter');
  });
});

describe('ExportDialog', () => {
  it('exportiert das ganze Buch als .docx ohne leere Kapitel', async () => {
    const backend = fakeBackend();
    useStore.setState({ backend });
    await useStore.getState().projektLaden(demoFs());
    render(<ExportDialog schliessen={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Dateiname' })).toHaveValue('Hafenlichter.docx');
    expect(screen.getByRole('checkbox', { name: 'Kapitel ohne Text weglassen (1)' })).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    });
    expect(await screen.findByText('„Hafenlichter.docx“ wurde gespeichert.')).toBeInTheDocument();
    const [name, daten] = (backend.dateiSpeichern as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, Uint8Array];
    expect(name).toBe('Hafenlichter.docx');
    const wieder = await importiereDocx(daten);
    expect(wieder.buchtitel).toBe('Hafenlichter');
    expect(wieder.kapitel).toHaveLength(9);
    expect(wieder.kapitel.map((k) => k.titel)).not.toContain('Regatta');
  });

  it('Auswahl aus dem Parameter, PDF mit eigenem Dateinamen', async () => {
    const backend = fakeBackend();
    useStore.setState({ backend });
    await useStore.getState().projektLaden(demoFs());
    render(<ExportDialog param={{ auswahl: ['ebbe'] }} schliessen={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Auswahl' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /1\s*Grundriss/ }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    const feld = screen.getByRole('textbox', { name: 'Dateiname' });
    expect(feld).toHaveValue('Hafenlichter.pdf');
    fireEvent.change(feld, { target: { value: 'Lektorat' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    });
    await waitFor(() => expect(backend.dateiSpeichern).toHaveBeenCalled());
    const [name, daten] = (backend.dateiSpeichern as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, Uint8Array];
    expect(name).toBe('Lektorat.pdf');
    expect(new TextDecoder().decode(daten.slice(0, 5))).toBe('%PDF-');
    expect(useStore.getState().exportEinstellungen).toMatchObject({ format: 'pdf', umfang: 'auswahl' });
    expect(new Set(useStore.getState().exportEinstellungen.auswahl)).toEqual(new Set(['ebbe', 'grundriss']));
  });
});

describe('Word-Kommentare beim Übernehmen', () => {
  const ergebnis = {
    kapitel: [
      { titel: 'Eins', text: 'Paul öffnet die Schwip Schwap mit dem Bleistift.' },
      { titel: 'Zwei', text: '' },
    ],
    hinweise: [],
    vorspann: '',
    kommentare: [
      { kapitel: 0, ueberschrift: false, autor: 'Leon Machnik', datum: '2024-01-22T00:14:00Z', text: 'Bleistift-Motiv.', erledigt: false, antworten: [], anker: { kapitel: '#1', exakt: 'Schwip Schwap', davor: 'Paul öffnet die ', danach: ' mit dem Bleistift.' } },
      { kapitel: 0, ueberschrift: true, autor: 'Leon Machnik', datum: '2024-01-22T00:15:00Z', text: 'Straffen?', erledigt: false, antworten: [], anker: { kapitel: '#1', exakt: 'Paul öffnet die Schwip Schwap mit', davor: '', danach: ' dem Bleistift.' } },
      { kapitel: 1, ueberschrift: true, autor: 'Leon Machnik', datum: '2024-01-22T00:16:00Z', text: 'Szene am Pool?', erledigt: false, antworten: [], anker: null },
    ],
  };

  it('legt Anmerkungen an (Überschrift → Notiz zum Kapitel), Kapitel ohne Text bekommen die Notiz im Plan', async () => {
    const store = erstelleStore();
    const fs = leeresProjekt();
    store.setState({ backend: fakeBackend() });
    await store.getState().projektLaden(fs);
    const bericht = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell' });
    await store.getState().alleSpeichernAbwarten();

    expect(bericht).toMatchObject({ ids: ['eins', 'zwei'], geplant: 1, anmerkungen: 2 });
    const d = store.getState().daten!;
    expect(d.anmerkungen.map((a) => [a.anker.kapitel, a.anker.exakt, a.ziel, a.quelle, a.autor])).toEqual([
      ['eins', 'Schwip Schwap', null, 'word', 'Leon Machnik'],
      ['eins', 'Paul öffnet die Schwip Schwap mit', { typ: 'kapitel', id: 'eins' }, 'word', 'Leon Machnik'],
    ]);
    expect(d.plaene.zwei!.notiz).toBe('Word-Kommentar von Leon Machnik (22.01.2024): Szene am Pool?');
    expect(await fs.lesen('anmerkungen.json')).toContain('"quelle": "word"');
    expect(await fs.lesen('plan/kapitel/zwei.md')).toContain('Szene am Pool?');
  });

  it('übernimmt keine Kommentare, wenn abgewählt', async () => {
    const store = erstelleStore();
    store.setState({ backend: fakeBackend() });
    await store.getState().projektLaden(leeresProjekt());
    const bericht = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell', kommentare: false });
    expect(bericht.anmerkungen).toBe(0);
    expect(store.getState().daten!.anmerkungen).toEqual([]);
    expect(store.getState().daten!.plaene.zwei!.notiz).toBe('');
  });
});
