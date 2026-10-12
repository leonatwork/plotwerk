import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { KiTransport } from '@core/ki/index';
import { MemoryFs } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { useStore } from '../../state/store';
import { FigurenListe } from '../figuren/Liste';
import Ansicht, { Titelaktionen } from './index';

async function laden(opt: { ohneFiguren?: boolean; ki?: KiTransport } = {}) {
  const d = demoDateien();
  if (opt.ohneFiguren) for (const p of Object.keys(d)) if (/^(figuren|orte|gruppen)\//.test(p)) delete d[p];
  useStore.setState({ backend: { ...erstelleDemoBackend(), ki: opt.ki ?? erstelleDemoKiTransport({ verzoegerungMs: 0 }) } });
  await act(async () => {
    await useStore.getState().projektLaden(new MemoryFs(d));
  });
  useStore.setState({
    bereich: 'beziehungen',
    netzAuswahl: null,
    netzStand: null,
    netzVerbinden: false,
    vorschlagPanel: false,
    vorschlagDialog: false,
    vorschlagErgebnis: null,
    vorschlagFehler: null,
    dialog: null,
  });
}

function Bereich() {
  return (
    <>
      <Titelaktionen />
      <Ansicht />
    </>
  );
}

describe('Vorschläge im Bereich „Beziehungen“', () => {
  beforeEach(() => {
    useStore.setState({ auswahl: {} });
  });

  it('Leons Fall: leeres Netz → „Figuren und Beziehungen vorschlagen“ → Schätzung → Lauf → Panel → übernehmen', async () => {
    await laden({ ohneFiguren: true });
    render(<Bereich />);
    expect(screen.getByText(/Die KI kann Figuren, Orte und Beziehungen aus dem Text vorschlagen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Figuren und Beziehungen vorschlagen' }));

    const dialog = await screen.findByRole('dialog', { name: 'Figuren und Beziehungen vorschlagen' });
    expect(await within(dialog).findByText(/1 für das ganze Buch · 9 Kapitel mit Text/)).toBeInTheDocument();
    expect(within(dialog).getByText('claude-sonnet-5-5 · Effort medium')).toBeInTheDocument();
    expect(within(dialog).getByText(/\$ \(grob, Listenpreis\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vorschläge holen' }));
    });
    const fertig = await screen.findByRole('dialog', { name: 'Vorschläge sind da' });
    expect(within(fertig).getByText('33 Vorschläge neu')).toBeInTheDocument();
    expect(within(fertig).getByText(/^4 verworfen/)).toBeInTheDocument();
    fireEvent.click(within(fertig).getByRole('button', { name: 'Vorschläge ansehen' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    const panel = screen.getByRole('complementary', { name: 'Vorschläge der KI' });
    expect(within(panel).getByText('33 Vorschläge')).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Figuren' })).toBeInTheDocument();
    const beziehungen = within(panel).getByRole('region', { name: 'Beziehungen' });
    const fiete = within(beziehungen).getByText('Paul – Fiete').closest('article')!;
    expect(within(fiete as HTMLElement).getByText('+ neue Figur: Paul, Fiete')).toBeInTheDocument();
    expect(within(fiete as HTMLElement).getByText('„ob er die Krabben wieder für Fiete mitnimmt“')).toBeInTheDocument();

    // eine Beziehung übernehmen: legt Paul und Fiete mit an
    await act(async () => {
      fireEvent.click(within(fiete as HTMLElement).getByRole('button', { name: 'Übernehmen' }));
    });
    const d = useStore.getState().daten!;
    expect(Object.keys(d.figuren).sort()).toEqual(['fiete', 'paul']);
    expect(d.figuren.paul!.beziehungen).toEqual([{ zu: 'fiete', art: 'kauft für ihn ein', abKapitel: 'funkstille', kategorie: 'sonstige', unsicher: true }]);

    // jetzt mit Netz: Panel bleibt offen, „Alle übernehmen“
    const panel2 = screen.getByRole('complementary', { name: 'Vorschläge der KI' });
    expect(within(panel2).getByText('30 Vorschläge')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel2).getByRole('button', { name: 'Alle übernehmen' }));
    });
    expect(await within(panel2).findByText('Übernommen: 9 Figuren, 10 Orte, 11 Beziehungen.')).toBeInTheDocument();
    expect(within(panel2).getByText('Nichts offen')).toBeInTheDocument();
    expect(Object.keys(useStore.getState().daten!.figuren)).toHaveLength(11);
    const netz = screen.getByTestId('netz');
    expect(within(netz).getByRole('button', { name: /^Lotte,/ })).toBeInTheDocument();

    // Panel schließen → Inspektor des Netzes
    fireEvent.click(within(panel2).getByRole('button', { name: 'Vorschläge schließen' }));
    expect(screen.getByRole('complementary', { name: 'Inspektor Beziehungen' })).toBeInTheDocument();
  });

  it('Beleg anklicken springt zur Stelle im Text; Verwerfen entfernt den Vorschlag', async () => {
    await laden();
    await act(async () => {
      await useStore.getState().vorschlaegeHolen();
    });
    render(<Bereich />);
    const panel = screen.getByRole('complementary', { name: 'Vorschläge der KI' });
    expect(within(panel).getByText('9 Vorschläge')).toBeInTheDocument();
    const orte = within(panel).getByRole('region', { name: 'Orte' });
    const restaurant = within(orte).getByText('Fischrestaurant').closest('article') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(restaurant).getByRole('button', { name: 'Verwerfen' }));
    });
    expect(within(panel).getByText('8 Vorschläge')).toBeInTheDocument();
    expect(useStore.getState().daten!.kiVorschlaege!.orte.find((o) => o.name === 'Fischrestaurant')?.status).toBe('verworfen');

    const figuren = within(panel).getByRole('region', { name: 'Figuren' });
    const fiete = within(figuren).getByText('Fiete').closest('article') as HTMLElement;
    fireEvent.click(within(fiete).getByRole('button', { name: /Kap\. 10 · Funkstille/ }));
    const m = useStore.getState().markierung;
    expect(m?.kapitel).toBe('funkstille');
    expect(m?.anker.exakt).toBe('ob er die Krabben wieder für Fiete mitnimmt');
    expect(useStore.getState().bereich).toBe('schreiben');
  });

  it('Titelaktion „Beziehungen vorschlagen“; ohne Schlüssel → Fehler mit „Einstellungen öffnen“', async () => {
    const basis = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    await laden({ ki: { ...basis, bereit: async () => false } });
    render(<Bereich />);
    fireEvent.click(screen.getByRole('button', { name: 'Beziehungen vorschlagen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Figuren und Beziehungen vorschlagen' });
    await within(dialog).findByText(/Kosten/);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vorschläge holen' }));
    });
    expect(await within(dialog).findByText(/API-Schlüssel oder Endpoint fehlt/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(useStore.getState().vorschlagDialog).toBe(false);
    expect(useStore.getState().dialog).toEqual({ id: 'ki-einstellungen', param: undefined });
  });

  it('Auswahl einer Karte im Netz zeigt wieder den Inspektor; Hinweis in der Leiste öffnet das Panel', async () => {
    await laden();
    await act(async () => {
      await useStore.getState().vorschlaegeHolen();
    });
    useStore.getState().indexNeuBerechnen();
    render(<Bereich />);
    expect(screen.getByRole('complementary', { name: 'Vorschläge der KI' })).toBeInTheDocument();
    const netz = screen.getByTestId('netz');
    const ole = within(netz).getByRole('button', { name: /^Ole,/ });
    fireEvent.pointerDown(ole, { button: 0, clientX: 10, clientY: 10, pointerId: 3 });
    await act(async () => {
      fireEvent.pointerUp(netz, { clientX: 10, clientY: 10, pointerId: 3 });
    });
    expect(screen.queryByRole('complementary', { name: 'Vorschläge der KI' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '9 Vorschläge der KI' }));
    expect(screen.getByRole('complementary', { name: 'Vorschläge der KI' })).toBeInTheDocument();
  });
});

describe('Figurenliste', () => {
  it('zeigt dezent „n Vorschläge der KI“ und öffnet damit das Panel in „Beziehungen“', async () => {
    await laden({ ohneFiguren: true });
    useStore.setState({ bereich: 'figuren' });
    const { rerender } = render(<FigurenListe daten={useStore.getState().daten!} index={useStore.getState().index} />);
    expect(screen.queryByText(/Vorschläge der KI/)).toBeNull();
    await act(async () => {
      await useStore.getState().vorschlaegeHolen();
    });
    rerender(<FigurenListe daten={useStore.getState().daten!} index={useStore.getState().index} />);
    fireEvent.click(screen.getByRole('button', { name: '33 Vorschläge der KI' }));
    expect(useStore.getState()).toMatchObject({ bereich: 'beziehungen', vorschlagPanel: true });
  });
});
