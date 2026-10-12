/** Statistik und Fassungen auf Englisch: Beschriftungen, Zahlen- und Datumsformat. */
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import FassungDialog from './FassungDialog';
import { tagAnzeige, woerterText, zeitpunktAnzeige } from './hooks';
import Ansicht, { kontext } from './index';
import { SchreibzielAnzeige } from './SchreibzielAnzeige';

beforeEach(async () => {
  useStore.setState({ dialog: null });
  await useStore.getState().projektLaden(demoFs());
  useStore.setState({ bereich: 'statistik' });
  useStore.getState().statistik.setzeAnsicht('ueberblick');
  festeSprache('en');
});

describe('Statistics (English)', () => {
  it('overview: tiles, calendar and goals in English', () => {
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Statistics', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Writing streak' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Words per act and chapter' })).toBeInTheDocument();
    const kalender = screen.getByRole('group', { name: 'Words per day, last 12 months' });
    const heute = within(kalender)
      .getAllByRole('button')
      .find((z) => z.tabIndex === 0)!;
    // „Today, Mon, October 12, 2026, …“
    expect(heute.getAttribute('aria-label')).toMatch(/^Today, [A-Z][a-z]{2}, [A-Z][a-z]+ \d{1,2}, \d{4}, /);
    expect(screen.getByLabelText('Daily goal (words)')).toHaveValue('500');
    expect(screen.getByRole('button', { name: 'Save goals' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Draft versions/ })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const deutsch of ['Wörter', 'Tagesziel', 'Heute', 'Fassung', 'Serie', 'Kapitel']) expect(text).not.toContain(deutsch);
    expect(kontext(useStore.getState())).toBe('Statistics');
  });

  it('formats numbers and dates the English way', () => {
    expect(woerterText(1234)).toBe('1,234 words');
    expect(woerterText(1)).toBe('1 word');
    expect(tagAnzeige('2026-10-08')).toBe('Thu, October 8, 2026');
    expect(zeitpunktAnzeige(new Date(2026, 9, 1, 20, 0).toISOString())).toMatch(/^Oct 1, 2026, 0?8:00\sPM$/);
  });

  it('status bar goal and draft version dialog in English', async () => {
    render(<SchreibzielAnzeige />);
    expect(screen.getByRole('button', { name: /^Daily goal: [\d,]+ of 500 words.*Open Statistics$/ })).toBeInTheDocument();
    const schliessen = vi.fn();
    await act(async () => {
      render(<FassungDialog schliessen={schliessen} />);
    });
    expect(screen.getByRole('heading', { name: 'Save draft version' })).toBeInTheDocument();
    expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument();
    expect(screen.getByText(/^Whole book \(\d+ chapters with text\)$/)).toBeInTheDocument();
  });
});
