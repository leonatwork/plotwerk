/** Zeitleiste auf Englisch: Beschriftungen, Wochentage, Tageszeiten, Datumsformat. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { datumKurz, zeitBeschriftung } from './gemeinsam';
import Ansicht, { kontext } from './index';
import ZeitVorschlagDialog from './ZeitVorschlagDialog';

beforeEach(async () => {
  await act(async () => {
    useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) } });
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
    useStore.getState().zeit.waehle(null);
    useStore.getState().zeit.setzeSzenen(true);
    useStore.getState().zeit.setzeFigur(null);
  });
  festeSprache('en');
});

const karte = (name: RegExp) => screen.getByRole('button', { name });

describe('Timeline (English)', () => {
  it('shows days, gaps, scenes and the overview in English', () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByText('Day 8')).toBeInTheDocument();
    expect(screen.getAllByText('Gap unknown').length).toBeGreaterThan(0);
    expect(screen.getByTitle('4 days without a scene')).toBeInTheDocument();
    expect(screen.getByText(/Day 1 = Monday/)).toBeInTheDocument();
    expect(karte(/Ch\. 7 “Ebbe”, Scene 2 “Kai bei Nacht”, Day 8 · Monday/)).toBeInTheDocument();
    expect(karte(/Ch\. 10 “Funkstille”.*Thursday.*1 timing note/)).toBeInTheDocument();
    expect(screen.getByText(/One timing conflict/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const deutsch of ['Abstand unbekannt', 'Zeitleiste', 'Kapitel', 'Zustand', 'Überblick', 'Tag 8', 'Vorschläge der KI']) expect(text).not.toContain(deutsch);
  });

  it('inspector: relative times, weekdays, times of day and certainty in English', async () => {
    render(<Ansicht />);
    fireEvent.click(karte(/Ch\. 8 “Bis bald”/));
    const insp = screen.getByRole('complementary', { name: 'Point in time and state' });
    expect(within(insp).getByRole('button', { name: 'next morning' })).toBeInTheDocument();
    expect(within(insp).getByLabelText('Time')).toBeInTheDocument();
    const wochentag = within(insp).getByLabelText('Weekday') as HTMLSelectElement;
    expect([...wochentag.options].map((o) => o.text)).toContain('Wednesday');
    const tageszeit = within(insp).getByLabelText('Time of day') as HTMLSelectElement;
    expect([...tageszeit.options].map((o) => o.text)).toEqual(['–', 'early morning', 'morning', 'late morning', 'midday', 'afternoon', 'evening', 'night']);
    // Beleg aus dem Text: Fehlermeldung auf Englisch
    const feld = within(insp).getAllByLabelText('Evidence in the text (verbatim)')[0]!;
    fireEvent.change(feld, { target: { value: 'Er schläft bis Mittag' } });
    fireEvent.click(within(insp).getAllByRole('button', { name: 'Set' })[0]!);
    expect(within(insp).getByText('This passage doesn’t appear in Ch. 8 as written.')).toBeInTheDocument();
    expect(kontext(useStore.getState())).toBe('Timeline · Ch. 8');
  });

  it('formats points in time with English dates and weekdays', () => {
    expect(datumKurz('2026-10-05')).toBe('10/05/2026');
    expect(zeitBeschriftung({ tag: 3, wochentag: 'freitag', datum: '2026-10-05', tageszeit: 'abends', uhrzeit: '23:00', sicherheit: 'fest' })).toBe(
      'Day 3 · Friday · 10/05/2026 · evening · 23:00',
    );
    expect(zeitBeschriftung({ tag: 3, wochentag: 'freitag', sicherheit: 'fest' }, {}, { kurz: true })).toBe('Day 3 · Fri');
    expect(zeitBeschriftung(undefined)).toBe('Point in time open');
  });

  it('suggestion dialog in English', async () => {
    render(<ZeitVorschlagDialog schliessen={() => undefined} param={{ art: 'zeit' }} />);
    expect(screen.getByRole('heading', { name: 'Suggest points in time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All chapters with text/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Get suggestions' })).toBeInTheDocument();
    expect(screen.getByText(/In-depth check with Opus/)).toBeInTheDocument();
  });
});
