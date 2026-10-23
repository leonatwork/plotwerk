import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { ExportDialog } from './ExportDialog';
import { ImportDialog, kommentarZeile } from './ImportDialog';

const TEST_DOCX = new Uint8Array(readFileSync(join(__dirname, '../../../fixtures/test-manuskript.docx')));

describe('Import und Export auf Englisch', () => {
  beforeEach(async () => {
    useStore.setState({
      backend: { ...erstelleDemoBackend(), dateiWaehlen: async () => ({ name: 'test-manuskript.docx', daten: TEST_DOCX }) },
      dialog: null,
    });
    await useStore.getState().projektLaden(demoFs());
    festeSprache('en');
  });

  it('Export-Dialog', () => {
    const n = useStore.getState().daten!.projekt.kapitel.length;
    render(<ExportDialog schliessen={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    expect(within(dialog).getByRole('group', { name: 'Format' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: `Whole book (${n} chapters)` })).toBeChecked();
    expect(within(dialog).getByLabelText('Title page “Hafenlichter”')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('File name')).toBeInTheDocument();
    expect(within(dialog).getByText(/^\d+ chapters · [\d,]+ words$/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selection' }));
    expect(within(dialog).getByRole('list', { name: 'Chapters' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'None' })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/Kapitel|Umfang|Schrift|Dateiname|Exportieren|Abbrechen/);
  });

  it('Import-Dialog mit Vorschau', async () => {
    render(<ImportDialog schliessen={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Import' });
    expect(within(dialog).getByText(/Chapters are detected by paragraphs in the “Heading 1” style/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose Word document …' }));
    expect(await within(dialog).findByRole('button', { name: /^Import \d+ chapters$/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Create a new project' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /^Append as new chapters to “Hafenlichter” \(after chapter \d+\)$/ })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Choose another file …' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Zeile für Word-Kommentare', () => {
    const k = (antworten: number, ueberschrift = false) => ({ antworten: Array.from({ length: antworten }), ueberschrift }) as never;
    expect(kommentarZeile({ kommentare: [k(0)] } as never)).toBe('Import the Word comment as a comment');
    expect(kommentarZeile({ kommentare: [k(2, true), k(1)] } as never)).toBe('Import 2 Word comments as comments (3 replies included, 1 as a chapter note)');
  });
});
