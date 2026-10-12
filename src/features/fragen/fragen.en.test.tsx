/** Fragen an das Buch und Leser-Simulation auf Englisch. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFs } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { formatiereKosten, kapNr } from './gemeinsam';
import Ansicht, { kontext } from './index';
import LeserSimulationDialog from './LeserSimulationDialog';

beforeEach(async () => {
  useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) }, dialog: null, markierung: null });
  await useStore.getState().projektLaden(new MemoryFs(demoDateien()));
  useStore.setState((s) => ({
    bereich: 'fragen',
    kileser: { ...s.kileser, entwurf: '', frageFehler: null, simFehler: null, frageHinweise: {}, simVerworfen: {}, fragenSchaetzung: null },
  }));
  festeSprache('en');
});

describe('Questions for the book (English)', () => {
  it('shows history, input and sidebar in English', async () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Questions for the book', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question for the book' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(await screen.findByText(/per question · then/)).toBeInTheDocument();
    expect(screen.getByText('How the AI answers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Ch\. \d+ · / }).length).toBeGreaterThan(0);
    // Der Verlauf selbst (Frage, Antwort, Zitate) ist Nutzerinhalt und bleibt deutsch
    const text = document.body.textContent ?? '';
    for (const deutsch of ['Frage an das Buch', 'Verlauf', 'Belege', 'Kosten', 'Entfernen', 'Gründlich', 'So antwortet']) expect(text).not.toContain(deutsch);
    expect(kontext(useStore.getState())).toMatch(/^Questions for the book · \d+$/);
  });

  it('formats cost and chapter numbers the English way', () => {
    expect(formatiereKosten(1.5)).toBe('$1.50');
    expect(formatiereKosten(0.004)).toBe('< $0.01');
    expect(kapNr(useStore.getState().daten!, 'fassade')).toBe('Ch. 2');
  });

  it('reader simulation: estimate, result and plan comparison in English', async () => {
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={vi.fn()} />);
    expect(await screen.findByText(/claude-sonnet-5-5 · Effort medium/)).toBeInTheDocument();
    expect(screen.getByText('Ch. 1–2 · 2 chapters with text · 1 request')).toBeInTheDocument();
    expect(screen.getByLabelText(/In-depth check with Opus/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start simulation' }));
    });
    expect(await screen.findByRole('heading', { name: 'What does the reader know after Ch. 2?' })).toBeInTheDocument();
    expect(screen.getByText(/2 entries discarded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^Plan/ }));
    expect(screen.getByText('“die Vorgabe kommt vom Aufsichtsrat”')).toBeInTheDocument();
    expect(screen.getAllByText('supported by the text').length).toBeGreaterThan(0);
    expect(screen.getByText('Chapter plans: supported by the text?')).toBeInTheDocument();
  });
});
