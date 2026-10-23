import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ladeProjekt } from '@core/projekt';
import type { Backend } from '../../backend';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { ImportDialog } from './ImportDialog';

const TEXT = readFileSync(join(__dirname, '../../../fixtures/demo-projekt/manuskript/ebbe.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const texte = {
  de: { quelle: 'Quelle', word: 'Word-Datei', ordner: 'Ordner mit Markdown- oder Textdateien', waehlen: 'Ordner wählen …', leer: 'Dieser Ordner enthält keine importierbaren Markdown- oder Textdateien.', neu: 'Neues Projekt anlegen', uebernehmen: '3 Kapitel übernehmen', hinweis: 'Keine Titelüberschrift' },
  en: { quelle: 'Source', word: 'Word document', ordner: 'Folder with Markdown or text files', waehlen: 'Choose folder …', leer: 'This folder contains no importable Markdown or text files.', neu: 'Create a new project', uebernehmen: 'Import 3 chapters', hinweis: 'No title heading' },
};

describe.each(['de', 'en'] as const)('Ordnerimport UI (%s)', (sprache) => {
  async function start(ordnerWaehlen: Backend['ordnerWaehlen'], bestehend = false) {
    useStore.setState({ backend: { ...erstelleDemoBackend(), ordnerWaehlen }, daten: null, fs: null, dialog: null });
    if (bestehend) await useStore.getState().projektLaden(demoFs());
    festeSprache(sprache);
    render(<ImportDialog schliessen={vi.fn()} />);
    const T = texte[sprache];
    expect(screen.getByRole('radio', { name: T.word })).toBeChecked();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: T.quelle })).getByRole('radio', { name: T.ordner }));
    fireEvent.click(screen.getByRole('button', { name: T.waehlen }));
  }

  it.each([false, true])('Vorschau sortiert, Hinweise und Übernahme zeichengleich (bestehend=%s)', async (bestehend) => {
    const ordnerWaehlen = vi.fn(async () => ({ name: 'Hafenlichter', dateien: [
      { name: '10-flut.txt', inhalt: TEXT },
      { name: '02-ebbe.markdown', inhalt: '# Ebbe\n' + TEXT },
      { name: '01-ankunft.md', inhalt: '# Ankunft\n' + TEXT },
      { name: 'kaputt.md', fehler: 'kodierung' as const },
    ] }));
    await start(ordnerWaehlen, bestehend);
    const liste = await screen.findByRole('list');
    expect(within(liste).getAllByRole('listitem').map((li) => li.querySelector('.pw-ie-zeile__titel')!.textContent)).toEqual(['Ankunft', 'Ebbe', 'flut']);
    expect(screen.getByText(texte[sprache].hinweis)).toBeInTheDocument();
    expect(screen.getByText(/kaputt.md.*UTF-8/)).toBeInTheDocument();
    expect(ordnerWaehlen).toHaveBeenCalledOnce();
    const vorher = bestehend ? useStore.getState().daten!.projekt.kapitel.length : 0;
    if (!bestehend) expect(screen.getByRole('radio', { name: texte[sprache].neu })).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: texte[sprache].uebernehmen }));
      await useStore.getState().alleSpeichernAbwarten();
    });
    const daten = useStore.getState().daten!;
    expect(daten.projekt.kapitel).toHaveLength(vorher + 3);
    const ids = daten.projekt.kapitel.slice(vorher);
    expect(ids.map((id) => daten.kapitel[id]!.text)).toEqual([TEXT, TEXT, TEXT]);
    const geladen = await ladeProjekt(useStore.getState().fs!);
    expect(ids.map((id) => geladen.kapitel[id]!.text)).toEqual([TEXT, TEXT, TEXT]);
    if (bestehend) expect(ids[1]).toBe('ebbe-2');
  });

  it('leerer Ordner zeigt leeren Zustand ohne Vorschau oder Übernahme', async () => {
    await start(vi.fn(async () => ({ name: 'Leer', dateien: [] })));
    expect(await screen.findByRole('status')).toHaveTextContent(texte[sprache].leer);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: texte[sprache].uebernehmen })).toBeNull();
    expect(screen.getByRole('button', { name: texte[sprache].waehlen })).toBeEnabled();
  });

  it('Abbruch bleibt in Quellenwahl; Dialogfehler wird angezeigt und ist erneut versuchbar', async () => {
    const ordnerWaehlen = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Ordnerfehler'));
    await start(ordnerWaehlen);
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: texte[sprache].waehlen }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ordnerfehler');
    expect(screen.getByRole('button', { name: texte[sprache].waehlen })).toBeEnabled();
  });
});
