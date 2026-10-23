import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import { KapitelListe } from './KapitelListe';
import { KapitelPlanInspektor } from '../akte/KapitelInspektor';
import { festeSprache } from '../../i18n';
import { verweisOeffnen } from './verweise';
import Akte from '../akte';

afterEach(async () => { await act(async () => { festeSprache('de'); }); });

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.setState({ speichern: { laufend: 0, fehler: null, zuletzt: null } });
    useStore.getState().waehle({ kapitel: 'ebbe' });
    useStore.getState().indexNeuBerechnen();
  });
});

describe('Archivbefehle', () => {
  it('öffnet einen Verweis auf ein archiviertes Kapitel im Archiv-Inspektor', async () => {
    await act(async () => { await useStore.getState().kapitelArchivieren('ebbe'); });
    verweisOeffnen(useStore.getState(), { typ: 'kapitel', id: 'ebbe' });
    expect(useStore.getState().bereich).toBe('akte');
    render(<Akte />);
    expect(screen.getByRole('button', { name: 'Kapitel wiederherstellen' })).toBeInTheDocument();
  });

  it.each(['de', 'en'] as const)('zeigt den Sicherungsfehler in %s und erhält die aktive Kapitelliste', async sprache => {
    const fs = demoFs();
    const schreiben = fs.schreiben.bind(fs);
    fs.schreiben = async () => { throw new Error('disk full'); };
    await act(async () => { await useStore.getState().projektLaden(fs); festeSprache(sprache); });
    render(<KapitelListe />);
    fireEvent.click(screen.getByRole('button', { name: sprache === 'de' ? 'Kapitel archivieren' : 'Archive chapter' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(sprache === 'de' ? 'Schnappschuss' : 'snapshot'));
    expect(useStore.getState().daten!.projekt.kapitel).toContain('ebbe');
    fs.schreiben = schreiben;
    await act(async () => { await useStore.getState().kapitelArchivieren('ebbe'); });
    expect(useStore.getState().daten!.projekt.kapitel).not.toContain('ebbe');
    fireEvent.click(screen.getByRole('button', { name: sprache === 'de' ? 'Wiederherstellen: Ebbe' : 'Restore: Ebbe' }));
    await waitFor(() => expect(useStore.getState().daten!.projekt.kapitel).toContain('ebbe'));
  });
  it('Kapitelliste archiviert das gewählte Kapitel und bietet es separat zur Wiederherstellung an', async () => {
    render(<KapitelListe />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapitel archivieren' }));
    await waitFor(() => expect(useStore.getState().daten!.projekt.kapitel).not.toContain('ebbe'));
    expect(screen.queryByRole('button', { name: /^7 Ebbe/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellen: Ebbe' }));
    await waitFor(() => expect(useStore.getState().daten!.projekt.kapitel[6]).toBe('ebbe'));
    await act(async () => { await useStore.getState().kapitelArchivieren('ebbe'); });
    let neu = '';
    await act(async () => { neu = await useStore.getState().kapitelPlanen('Ebbe'); });
    expect(neu).not.toBe('ebbe');
    await act(async () => { await useStore.getState().kapitelWiederherstellen('ebbe'); });
    const ids = useStore.getState().daten!.projekt.kapitel;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(neu);
  });

  it('Inspektor bietet Archivieren und nach Auswahl eines Archivkapitels Wiederherstellen ohne editierbare Felder', async () => {
    const s = useStore.getState();
    const { rerender } = render(<KapitelPlanInspektor id="ebbe" daten={s.daten!} index={s.index} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapitel archivieren' }));
    await waitFor(() => expect(useStore.getState().daten!.archiv?.ebbe).toBeDefined());
    rerender(<KapitelPlanInspektor id="ebbe" daten={useStore.getState().daten!} index={s.index} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kapitel wiederherstellen' }));
    await waitFor(() => expect(useStore.getState().daten!.projekt.kapitel[6]).toBe('ebbe'));
  });
});
