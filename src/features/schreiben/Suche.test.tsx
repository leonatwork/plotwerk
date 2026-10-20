import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import { useSprachStore } from '../../i18n';
import { SchreibEditor } from './Editor';
import Projektsuche from '../suche/Projektsuche';
import { BestaetigungHost } from '../../ui';

describe('Suchoberfläche', () => {
  beforeEach(async () => {
    await useStore.getState().projektLaden(demoFs());
    useStore.getState().suche.setzeKapitelOffen(true);
  });
  it('markiert alle Kapitel-Treffer, zählt sie und navigiert mit Enter; ersetzt wörtlich', async () => {
    const {container} = render(<SchreibEditor kapitelId="flut" />);
    const eingabe = screen.getByRole('searchbox', {name: 'Text suchen'});
    fireEvent.change(eingabe, {target: {value: 'Bleistift'}});
    expect(container.querySelectorAll('.pw-s-suchtreffer').length).toBeGreaterThan(0);
    const vorher = container.querySelector('.pw-s-suchtreffer--aktiv')?.textContent;
    fireEvent.keyDown(eingabe, {key: 'Enter'});
    expect(screen.getByText(/von/)).toBeInTheDocument();
    expect(vorher).toContain('Bleistift');
    fireEvent.change(eingabe, {target: {value: 'Volvo'}});
    fireEvent.change(screen.getByRole('textbox', {name:'Ersetzen durch'}), {target: {value:'"Auto"'}});
    await act(async () => fireEvent.click(screen.getByRole('button', {name:'Ersetzen'})));
    await waitFor(() => expect(useStore.getState().daten!.kapitel.flut!.text).toContain('"Auto"'));
    expect(screen.getByRole('button', {name:'Alle ersetzen'})).toBeDisabled();
  });
  it.each(['de','en'] as const)('zeigt leere Zustände und deaktivierte Ersetzung auf %s', async sprache => {
    act(() => useSprachStore.setState({sprache}));
    render(<SchreibEditor kapitelId="flut" />);
    expect(screen.getByText(sprache === 'de' ? 'Suchbegriff eingeben.' : 'Enter a search term.')).toBeInTheDocument();
    expect(screen.getByRole('button', {name:sprache === 'de' ? 'Alle ersetzen' : 'Replace all'})).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'keintrefferxyz'}});
    expect(screen.getByText(sprache === 'de' ? 'Keine Treffer.' : 'No matches.')).toBeInTheDocument();
  });
  it.each(['de','en'] as const)('deaktiviert auch in der Projektsuche leere Ersetzungen auf %s', sprache => {
    act(() => useSprachStore.setState({sprache}));
    render(<Projektsuche schliessen={() => {}} />);
    expect(screen.getByText(sprache === 'de' ? 'Suchbegriff eingeben.' : 'Enter a search term.')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:sprache === 'de' ? 'Ersetzen' : 'Replace'})).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'keintrefferxyz'}});
    expect(screen.getByText(sprache === 'de' ? 'Keine Treffer.' : 'No matches.')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:sprache === 'de' ? 'Alle ersetzen' : 'Replace all'})).toBeDisabled();
  });
  it('gruppiert private Treffer, fragt vor Alle ersetzen und nimmt die ganze Plan-/Notizaktion zurück', async () => {
    const d = useStore.getState().daten!;
    await useStore.getState().speichereFigur({...d.figuren.lotte!,notizen:'Suchprobe privat',plan:{...d.figuren.lotte!.plan,Eigenes:'Suchprobe Plan'}});
    await useStore.getState().speichereOrt({...d.orte.lindenhof!,notizen:'Suchprobe Ort'});
    render(<><Projektsuche schliessen={() => {}} /><BestaetigungHost /></>);
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'Suchprobe'}});
    expect(screen.getByRole('heading', {name:'Plan'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name:'Notizen (auch private)'})).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', {name:'Ersetzen durch'}), {target:{value:'Neu'}});
    fireEvent.click(screen.getByRole('button', {name:'Alle ersetzen'}));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    const frage = screen.getByRole('dialog', {name:'Bist du sicher?'});
    expect(useStore.getState().daten!.figuren.lotte!.notizen).toBe('Suchprobe privat');
    await act(async () => fireEvent.click(within(frage).getByRole('button', {name:'Alle ersetzen'})));
    await waitFor(() => expect(useStore.getState().daten!.figuren.lotte!.notizen).toBe('Neu privat'));
    await act(async () => fireEvent.click(screen.getByRole('button', {name:'Ersetzen in Plan und Notizen rückgängig'})));
    expect(useStore.getState().daten!.figuren.lotte!.plan.Eigenes).toBe('Suchprobe Plan');
    expect(useStore.getState().daten!.orte.lindenhof!.notizen).toBe('Suchprobe Ort');
  });
  it('öffnet einen Manuskripttreffer mit Kapitelnummer, Titel und exaktem Textanker', async () => {
    let geschlossen = false;
    render(<Projektsuche schliessen={() => {geschlossen = true;}} />);
    fireEvent.change(screen.getByRole('searchbox'), {target:{value:'Volvo'}});
    const treffer = screen.getByRole('button', {name:/Kap. 9 · Flut/});
    fireEvent.click(treffer);
    expect(geschlossen).toBe(true);
    expect(useStore.getState().auswahl.kapitel).toBe('flut');
    expect(useStore.getState().markierung?.anker.exakt).toBe('Volvo');
  });
});
