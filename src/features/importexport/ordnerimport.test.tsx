import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { ladeProjekt } from '@core/projekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { ImportDialog } from './ImportDialog';

describe.each(['de', 'en'] as const)('Ordnerimport UI (%s)', (sprache) => {
  const en = sprache === 'en';
  const waehlen = en ? 'Choose folder …' : 'Ordner wählen …';
  beforeEach(() => {
    festeSprache(sprache);
    useStore.setState({ backend: erstelleDemoBackend(), daten: null, fs: null, dialog: null });
  });
  function quelle() {
    fireEvent.click(screen.getByRole('radio', { name: en ? 'Folder with Markdown or text files' : 'Ordner mit Markdown- oder Textdateien' }));
  }

  it.each(['neu', 'aktuell'] as const)('zeigt sortierte Vorschau und übernimmt zeichengleich (%s)', async (ziel) => {
    const text = '"Hafenlichter" --\r\n\r\nEbbe.\r\n';
    const ordnerWaehlen = vi.fn(async () => ({ name: 'Hafenlichter', dateien: [
      { name: '10-flut.txt', inhalt: text },
      { name: '02-ebbe.markdown', inhalt: '# Ebbe\nHafenlichter.' },
      { name: '01-ankunft.md', inhalt: '# Ankunft\n' + text },
      { name: '03-leer.md', inhalt: '' },
      { name: '04-lotte.md', fehler: 'lesen' as const },
    ] }));
    useStore.setState({ backend: { ...erstelleDemoBackend(), ordnerWaehlen } });
    if (ziel === 'aktuell') await useStore.getState().projektLaden(demoFs());
    const vorher = useStore.getState().daten?.projekt.kapitel.length ?? 0;
    render(<ImportDialog schliessen={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Word' })).toBeChecked();
    quelle();
    fireEvent.click(screen.getByRole('button', { name: waehlen }));
    const liste = await screen.findByRole('list');
    expect(within(liste).getAllByRole('listitem').map((li) => li.querySelector('.pw-ie-zeile__titel')!.textContent)).toEqual(['Ankunft', 'Ebbe', 'flut']);
    expect(screen.getByText(en ? 'File not readable' : 'Datei nicht lesbar')).toBeInTheDocument();
    expect(screen.getByText(en ? 'Empty file' : 'Leere Datei')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en ? 'Import 3 chapters' : '3 Kapitel übernehmen' })); });
    await useStore.getState().alleSpeichernAbwarten();
    const d = useStore.getState().daten!;
    expect(d.projekt.kapitel).toHaveLength(vorher + 3);
    expect(d.kapitel[d.projekt.kapitel[vorher]!]!.text).toBe(text);
    expect(d.kapitel[d.projekt.kapitel[vorher + 2]!]!.text).toBe(text);
    const geladen = await ladeProjekt(useStore.getState().fs!);
    expect(geladen.kapitel[d.projekt.kapitel[vorher]!]!.text).toBe(text);
    expect(ordnerWaehlen).toHaveBeenCalledOnce();
  });

  it('zeigt einen leeren Zustand ohne Kapitelvorschau oder Übernahme', async () => {
    useStore.setState({ backend: { ...erstelleDemoBackend(), ordnerWaehlen: async () => ({ name: 'Hafenlichter', dateien: [] }) } });
    render(<ImportDialog schliessen={() => {}} />);
    quelle();
    fireEvent.click(screen.getByRole('button', { name: waehlen }));
    expect(await screen.findByRole('status')).toHaveTextContent(en ? 'No Markdown or text files' : 'Keine Markdown- oder Textdateien');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en ? /^Import \d/ : /Kapitel übernehmen/ })).not.toBeInTheDocument();
  });

  it('behandelt Abbruch und Ordnerfehler und erlaubt den Wechsel zurück zu Word', async () => {
    const ordnerWaehlen = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Ordnerfehler'));
    useStore.setState({ backend: { ...erstelleDemoBackend(), ordnerWaehlen } });
    render(<ImportDialog schliessen={() => {}} />);
    quelle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: waehlen })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: waehlen }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ordnerfehler');
    fireEvent.click(screen.getByRole('radio', { name: 'Word' }));
    expect(screen.getByRole('button', { name: en ? 'Choose Word document …' : 'Word-Datei wählen …' })).toBeInTheDocument();
  });
});
