import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFs, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { EinstellungenDialog, endpointFehler } from './EinstellungenDialog';
import { PruefDialog } from './PruefDialog';

const DEUTSCH = /Prüf|Kapitel|Schlüssel|Einstellungen|Abbrechen|Sichern|Anbieter|Umfang|Kosten|Eingabe|Ausgabe/;

describe('KI-Dialoge auf Englisch', () => {
  beforeEach(async () => {
    const d = demoDateien();
    for (const p of Object.keys(d)) if (p.startsWith(`${PFADE.analysen}/`)) delete d[p];
    useStore.setState({
      backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) },
      kiErgebnis: null,
      kiFehler: null,
      kiLauf: null,
      kiVorschlaege: {},
      dialog: null,
    });
    await useStore.getState().projektLaden(new MemoryFs(d));
    festeSprache('en');
  });

  it('Prüf-Dialog: Schätzung und Ergebnis', async () => {
    const schliessen = vi.fn();
    render(<PruefDialog param={{ umfang: 'kapitel', kapitel: 'funkstille' }} schliessen={schliessen} />);
    expect(screen.getByRole('heading', { name: 'Check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ch. 10 “Funkstille”' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('1 chapter')).toBeInTheDocument();
    expect(screen.getByText(/≈ \$\d+\.\d+ \(rough, list price\)/)).toBeInTheDocument();
    expect(screen.getByText(/tokens \(including thinking, generous\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Deep check with Opus/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(DEUTSCH);

    fireEvent.click(screen.getByRole('button', { name: /Whole book · \d+ chapters/ }));
    expect(await screen.findByText('9 chapters')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start check' }));
    expect(await screen.findByRole('heading', { name: 'Check complete' })).toBeInTheDocument();
    expect(screen.getByText(/new notes?$/)).toBeInTheDocument();
    expect(screen.getByText('9 checked')).toBeInTheDocument();
    expect(screen.getByText('Show reasons for discarded items')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View notes' }));
    expect(useStore.getState().bereich).toBe('hinweise');
  });

  it('Einstellungen: Anbieter, Schlüssel, Endpoint-Prüfung', async () => {
    render(<EinstellungenDialog schliessen={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByText('No key stored')).toBeInTheDocument();
    expect(screen.getByLabelText('Enter key')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Store' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'AI provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('Check (Sonnet)')).toBeInTheDocument();
    expect(screen.getByText('API key · Microsoft Foundry')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://falsch' } });
    expect(screen.getByText('The endpoint must start with https://.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(endpointFehler('kein url')).toBe('That isn’t a valid address.');
  });
});
