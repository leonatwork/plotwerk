import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import Akte from './index';
import Kapitel from '../kapitel/index';
import Figuren from '../figuren/index';
import Orte from '../orte/index';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().indexNeuBerechnen();
  });
});

describe('Planungs-Ansichten rendern mit dem Demo-Projekt', () => {
  it('Akte: Spalten, Kopfkarten, Ideen, Inspektor', () => {
    render(<Akte />);
    expect(screen.getByRole('heading', { name: 'Akte planen' })).toBeInTheDocument();
    expect(screen.getByText('Akt I')).toBeInTheDocument();
    expect(screen.getByText('Ideen-Ablage')).toBeInTheDocument();
    expect(screen.getByText('Wohin führt der Nordhaven-Auftrag?')).toBeInTheDocument();
    expect(screen.getByText('1 Abweichung vom Plan')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Kapitel 4 Regatta/));
    expect(screen.getByText('KAPITEL 4 · GEPLANT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mit dem Schreiben beginnen' })).toBeInTheDocument();
  });

  it('Kapitel-Überblick: Zusammenfassung, lose Enden, Realitätsebene', () => {
    useStore.getState().waehle({ kapitel: 'bis-bald' });
    render(<Kapitel />);
    expect(screen.getByText(/KAPITEL 8/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Was in der Nacht passiert ist')).toBeInTheDocument();
    expect(screen.getByText('LOSE ENDEN BIS HIER')).toBeInTheDocument();
    expect(screen.getAllByText(/ruhend|in diesem Kapitel/).length).toBeGreaterThan(0);
  });

  it('Figuren: Bereiche und Karte', () => {
    useStore.getState().waehle({ figur: 'lotte' });
    render(<Figuren />);
    expect(screen.getByText('REALITÄT OFFEN')).toBeInTheDocument();
    expect(screen.getByText('Aus dem Text')).toBeInTheDocument();
    expect(screen.getByText('Wahrheit hinter den Kulissen')).toBeInTheDocument();
    expect(screen.getByText(/angeheftet an Kap\. 9/)).toBeInTheDocument();
  });

  it('Orte: Liste, Schreibweisen, Pauls Weg', () => {
    useStore.getState().waehle({ ort: 'lindenhof' });
    render(<Orte />);
    expect(screen.getByText(/Derselbe Ort steht in 3 Schreibweisen/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pauls Weg'));
    expect(screen.getByRole('heading', { name: 'Pauls Weg' })).toBeInTheDocument();
  });

  it('S-06: an Ort, Kapitel oder Plan-Karte geheftete Notizen erscheinen dort und springen zur Stelle', async () => {
    const d = useStore.getState().daten!;
    const [bleistifte] = d.anmerkungen;
    await act(async () => {
      await useStore.getState().speichereAnmerkungen([
        { ...bleistifte!, id: 'an-ort', notiz: 'Notiz am Lindenhof', ziel: { typ: 'ort', id: 'lindenhof' } },
        { ...bleistifte!, id: 'an-plan', notiz: 'Notiz an der Plan-Karte', ziel: { typ: 'plan', id: 'lotte' } },
      ]);
    });
    useStore.getState().waehle({ ort: 'lindenhof', kapitel: 'lotte' });
    useStore.getState().planung.setzeOrteAnsicht('ort');
    const orte = render(<Orte />);
    expect(screen.getByText('Notiz am Lindenhof')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/angeheftet an Kap\. 9/));
    expect(useStore.getState().markierung?.anker).toEqual(bleistifte!.anker);
    orte.unmount();
    useStore.getState().waehle({ plan: 'lotte' });
    render(<Akte />);
    expect(screen.getByText('Notiz an der Plan-Karte')).toBeInTheDocument();
  });
});
