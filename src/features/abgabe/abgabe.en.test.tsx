import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import type { Backend } from '../../backend';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import AbgabeDialog from './AbgabeDialog';
import RueckimportDialog from './RueckimportDialog';

function fakeBackend(): Backend {
  return {
    art: 'demo',
    projektOeffnen: vi.fn(async () => null),
    neuesProjekt: vi.fn(async () => null),
    letztesProjekt: vi.fn(async () => null),
    dateiWaehlen: vi.fn(async () => null),
    dateiSpeichern: vi.fn(async () => true),
    ki: { senden: vi.fn(), tokenZaehlen: vi.fn(), bereit: vi.fn(async () => false) } as unknown as Backend['ki'],
    indexSpeicher: { laden: async () => null, speichern: async () => undefined, leeren: async () => undefined },
    schluessel: { setzen: async () => undefined, vorhanden: async () => false, loeschen: async () => undefined },
    beimBeenden: () => undefined,
    aufExterneAenderung: () => undefined,
  };
}

beforeEach(async () => {
  useStore.setState({ dialog: null, daten: null, fs: null, backend: fakeBackend() });
  await useStore.getState().projektLaden(demoFs());
  festeSprache('en');
});

describe('Abgabe auf Englisch', () => {
  it('Export-Dialog: Formate, Normseiten, Angaben zum Buch mit Erklärung der Buchsprache', () => {
    render(<AbgabeDialog schliessen={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Export for submission' })).toBeInTheDocument();
    for (const name of ['Standard manuscript', 'Synopsis', 'EPUB', 'Editing report']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByText('Standard pages')).toBeInTheDocument();
    expect(screen.getByText('Book details')).toBeInTheDocument();
    expect(screen.getByLabelText('File name')).toBeInTheDocument();
    const sprache = screen.getByLabelText('Language');
    expect(sprache).toHaveAccessibleDescription(/controls typography, hyphenation and the AI/);
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const wort of ['Normseiten', 'Angaben zum Buch', 'Exportieren', 'Abbrechen', 'Umfang', 'Wörter', 'Anschläge', 'Titelseite']) expect(text).not.toContain(wort);

    fireEvent.click(screen.getByRole('button', { name: 'Editing report' }));
    expect(screen.getByText(/The open notes as a PDF/)).toBeInTheDocument();
  });

  it('Lektorat aus Word: englische Tastaturhilfe, R lehnt ab, L tut nichts', async () => {
    render(<RueckimportDialog schliessen={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Edits from Word' })).toBeInTheDocument();
    const liste = screen.getByRole('listbox', { name: 'Editor’s changes' });
    const hilfe = document.querySelector('.pw-ab-tasten')!;
    expect(hilfe.textContent).toContain('A accept');
    expect(hilfe.textContent).toContain('R reject');
    expect(within(liste).getAllByRole('button', { name: 'Accept' }).length).toBeGreaterThan(0);
    expect(within(liste).getAllByRole('button', { name: 'Reject' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Open \(/ })).toBeInTheDocument();

    const karte = within(liste).getAllByRole('option')[0]!;
    const id = useStore.getState().daten!.lektorat!.find((a) => a.status === 'offen')!.id;
    await act(async () => {
      fireEvent.keyDown(karte, { key: 'l' });
    });
    expect(useStore.getState().daten!.lektorat!.find((a) => a.id === id)!.status).toBe('offen');
    await act(async () => {
      fireEvent.keyDown(karte, { key: 'r' });
    });
    await waitFor(() => expect(useStore.getState().daten!.lektorat!.find((a) => a.id === id)!.status).toBe('abgelehnt'));
    expect(screen.queryByText(/annehmen|ablehnen|Änderungen/)).toBeNull();
  });
});
