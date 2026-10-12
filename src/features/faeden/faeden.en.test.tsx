import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import Faeden from './index';
import { StrangRaster } from './StrangRaster';
import { SzenenKarte, SzenenUebersicht } from './Szenen';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
  useStore.setState((s) => ({ struktur: { ...s.struktur, fadenAuswahl: null, fadenFilter: { strang: null, nurRuhend: false }, szeneOffen: null } }));
  festeSprache('en');
});

describe('Threads, plot line grid and scenes in English', () => {
  it('thread board with columns, idle warnings and inspector', () => {
    const { container } = render(<Faeden />);
    expect(screen.getByRole('heading', { name: 'Threads' })).toBeInTheDocument();
    const geplant = screen.getByRole('region', { name: /^Resolution planned/ });
    expect(within(geplant).getByText('Resolution Ch. 10')).toBeInTheDocument();
    expect(screen.getAllByText(/idle for \d+ chapters/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Idle only/ })).toBeInTheDocument();
    expect(screen.getByText('All plot lines')).toBeInTheDocument();

    fireEvent.click(document.querySelector<HTMLElement>('[data-faden="der-messingschluessel"]')!);
    expect(screen.getByText('Planned resolution')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();

    const text = container.textContent ?? '';
    // „Auflösung“ und „Kap.“ stehen in Notizen des Demo-Projekts (Nutzerdaten), daher nur genauere Wendungen
    for (const wort of ['Fäden', 'Auflösung geplant', 'Auflösung Kap', 'ruht seit', 'Kapiteln', 'Alle Stränge', 'Notiz', 'eröffnet']) expect(text).not.toContain(wort);
  });

  it('plot line grid', () => {
    render(<StrangRaster daten={useStore.getState().daten!} />);
    expect(screen.getByRole('grid', { name: 'Plot lines per chapter' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Begegnungen/ })).toHaveTextContent(/missing in 4–6/);
    expect(screen.getByRole('button', { name: /^Ch\. 4 · .*Begegnungen: missing/ })).toBeInTheDocument();
    expect(screen.getByText('Plot line in chapter plan')).toBeInTheDocument();
    expect(screen.queryByText(/Lücke|fehlt in/)).not.toBeInTheDocument();
  });

  it('scenes in the writing inspector and the chapter overview', async () => {
    useStore.getState().struktur.setzeSzeneOffen({ kapitel: 'ebbe', index: 2 });
    const { unmount } = render(<SzenenKarte kapitelId="ebbe" />);
    expect(screen.getByText('3 scenes · 3 planned')).toBeInTheDocument();
    expect(screen.getByLabelText('Time (HH:MM)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'evening' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Plan scene' })).toBeInTheDocument();
    expect(screen.queryByText(/Szene|geplant|Tageszeit/)).not.toBeInTheDocument();
    unmount();

    render(<SzenenUebersicht kapitelId="ebbe" />);
    expect(screen.getByText('SCENES')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('listitem', { name: /Scene 3:\s*Zu Hause/ }));
    expect(await screen.findByRole('dialog', { name: 'Ch. 7 · Scene 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
