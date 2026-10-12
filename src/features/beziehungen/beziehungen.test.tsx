import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { berechneIndex, LEERER_INDEX, type Index } from '@core/index/index';
import type { ProjektDaten } from '@core/model/types';
import { demoFs, ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import Ansicht from './index';
import {
  aktStufen,
  ALLE_KATEGORIEN,
  belege,
  beziehungGilt,
  figurSichtbar,
  netzBerechnen,
  paarSchluessel,
  standIndex,
  type NetzAnsicht,
} from './logik';

const ids = (a: NetzAnsicht) => a.karten.map((k) => k.figur.id);
const label = (a: NetzAnsicht, x: string, y: string) => a.linien.find((l) => l.id === paarSchluessel(x, y))?.label.text;

describe('Zeitregler (B-02) mit Demo-Projekt und echtem Index', () => {
  let daten: ProjektDaten;
  let index: Index;
  beforeEach(async () => {
    daten = await ladeDemoProjekt();
    index = berechneIndex(daten);
  });

  it('Index liefert erste Vorkommen (sonst ist der Akzeptanztest wertlos)', () => {
    expect(index.erstesVorkommen).toMatchObject({ vera: 'ebbe', 'die-fremde': 'bis-bald', ole: 'grundriss' });
  });

  it('Segmente nach Akt wie im Screen', () => {
    expect(aktStufen(daten).map((s) => s.label)).toEqual(['Akt I · Kap. 1–4', 'Akt II · Kap. 5–8', 'Akt III · Kap. 9–10']);
    expect(standIndex(daten, null)).toBe(9);
  });

  it('Akzeptanz: Akt I zeigt weder Vera noch die Fremde', () => {
    const [akt1] = aktStufen(daten);
    const a = netzBerechnen(daten, index, akt1!.bisIndex, ALLE_KATEGORIEN);
    expect(ids(a)).not.toContain('vera');
    expect(ids(a)).not.toContain('die-fremde');
    expect(ids(a)).toEqual(expect.arrayContaining(['paul', 'ole', 'malte', 'konrad', 'lotte', 'herr-kessler']));
    expect(label(a, 'lotte', 'paul')).toBe('Kleinanzeige, nur Chat');
    expect(a.platzhalter[0]).toMatchObject({ titel: 'noch keine Figur', untertitel: 'Spur? Werfthalle am Nordkai verkauft, Kap. 2' });
  });

  it('Bezeichnungen gelten ab abKapitel; Akt III wie im Screen', () => {
    const [, akt2, akt3] = aktStufen(daten);
    const a2 = netzBerechnen(daten, index, akt2!.bisIndex, ALLE_KATEGORIEN);
    expect(ids(a2)).toEqual(expect.arrayContaining(['vera', 'die-fremde']));
    expect(label(a2, 'die-fremde', 'paul')).toBe('eine Nacht im Fährhaus');
    expect(label(a2, 'lotte', 'paul')).toBe('Kleinanzeige, nur Chat');

    const a3 = netzBerechnen(daten, index, akt3!.bisIndex, ALLE_KATEGORIEN);
    expect(label(a3, 'lotte', 'paul')).toBe('erstes Treffen');
    expect(label(a3, 'die-fremde', 'paul')).toBe('Fährhaus, Postkarten?');
    expect(a3.zentrum).toBe('paul');
    const karte = (id: string) => a3.karten.find((k) => k.figur.id === id)!;
    expect(karte('die-fremde')).toMatchObject({ variante: 'unsicher', untertitel: 'existiert sie?' });
    expect(karte('herr-kessler')).toMatchObject({ variante: 'erwaehnt', untertitel: 'erwähnt · Investor' });
    expect(karte('paul').variante).toBe('zentrum');
    // Platzhalter des Konsortiums mit »Kranich« und Linie „Kontakt“
    expect(a3.platzhalter[0]).toMatchObject({ variante: 'kandidat', titel: '»Kranich«', untertitel: 'Kap. 10 · Zuordnung?' });
    expect(a3.linien.find((l) => l.id === 'spur:konsortium')?.label).toMatchObject({ text: 'Kontakt', x: 270, y: 272 });
    // „Alter Mann am Kai“ ist bekannt, hat aber keine Netzposition
    expect(a3.ohnePosition.map((f) => f.id)).toEqual(['alter-mann-am-kai']);
  });

  it('Linienführung entspricht den Koordinaten aus Beziehungen.dc.html', () => {
    const a = netzBerechnen(daten, index, 9, ALLE_KATEGORIEN);
    const segmente = a.linien.flatMap((l) => l.segmente.map((s) => `${s.x1},${s.y1}-${s.x2},${s.y2}${s.gestrichelt ? ' gestrichelt' : ''}`));
    expect(segmente).toEqual(
      expect.arrayContaining([
        '194,190-686,190',
        '440,270-440,190',
        '194,190-194,108',
        '516,300-704,300 gestrichelt',
        '176,300-364,300 gestrichelt',
        '194,410-686,410',
        '686,410-686,492 gestrichelt',
      ]),
    );
    const ole = a.linien.find((l) => l.id === paarSchluessel('ole', 'paul'))!;
    expect(ole.label).toMatchObject({ x: 206, y: 141 });
    const lotte = a.linien.find((l) => l.id === paarSchluessel('lotte', 'paul'))!;
    expect(lotte.label).toMatchObject({ x: 206, y: 443 });
    expect(a.linien.find((l) => l.id === paarSchluessel('herr-kessler', 'paul'))!.label).toMatchObject({ x: 610, y: 272, zentriert: true });
  });

  it('Belege: Kapitel, in denen beide vorkommen, mit Satz', () => {
    const b = belege(daten, index, 'lotte', 'paul');
    expect(b.map((x) => x.kapitel)).toEqual(['lotte', 'flut']);
    expect(b[1]!.text).toContain('Lotte');
    expect(b[0]!.anker.kapitel).toBe('lotte');
  });
});

describe('Zeitregler-Filter (ohne Erkennung, fester Index)', () => {
  it('Figuren ab erstem Vorkommen, Bezeichnung ab abKapitel, Kategorie-Filter', async () => {
    const daten = await ladeDemoProjekt();
    const index: Index = {
      ...LEERER_INDEX,
      erstesVorkommen: { paul: 'grundriss', ole: 'grundriss', lotte: 'lotte', vera: 'ebbe', malte: 'fassade' },
    };
    expect(figurSichtbar(daten, index, 'lotte', 1)).toBe(false);
    expect(figurSichtbar(daten, index, 'lotte', 2)).toBe(true);
    // ohne Vorkommen (nur geplant): erst am Ende des Buchs
    expect(figurSichtbar(daten, index, 'konrad', 8)).toBe(false);
    expect(figurSichtbar(daten, index, 'konrad', 9)).toBe(true);
    const [match, treffen] = daten.figuren.lotte!.beziehungen;
    expect(beziehungGilt(daten, match!, 1)).toBe(false);
    expect(beziehungGilt(daten, match!, 2)).toBe(true);
    expect(beziehungGilt(daten, treffen!, 7)).toBe(false);

    const ohneDates = netzBerechnen(daten, index, 6, { arbeit: true, dates: false, sonstige: true });
    expect(ids(ohneDates)).not.toContain('lotte');
    expect(ids(ohneDates)).not.toContain('vera');
    expect(ohneDates.ausgeblendet.map((f) => f.id).sort()).toEqual(['lotte', 'vera']);
    expect(ids(ohneDates)).toEqual(expect.arrayContaining(['paul', 'ole', 'malte']));
    expect(ohneDates.paare.every((p) => p.eintrag.beziehung.kategorie !== 'dates')).toBe(true);
  });
});

describe('Beziehung anlegen (B-04)', () => {
  beforeEach(async () => {
    await act(async () => {
      await useStore.getState().projektLaden(demoFs());
    });
    useStore.setState({ netzAuswahl: null, netzStand: null, netzVerbinden: false, bereich: 'beziehungen' });
  });

  it('per Store: neue Beziehung mit Vorschlägen, bestehendes Paar wird nicht verdoppelt', async () => {
    const s = useStore.getState();
    const r = await s.beziehungAnlegen('ole', 'malte');
    expect(r).toEqual({ von: 'ole', index: 1 });
    const neu = useStore.getState().daten!.figuren.ole!.beziehungen[1];
    expect(neu).toMatchObject({ zu: 'malte', art: '', abKapitel: 'fassade', kategorie: 'arbeit', strang: 'nordhaven' });
    expect(await s.beziehungAnlegen('malte', 'ole')).toEqual({ von: 'ole', index: 1 });
    expect(await s.beziehungAnlegen('ole', 'ole')).toBeNull();
    await s.beziehungAendern('ole', 1, { art: 'Kollege', abKapitel: undefined });
    await s.alleSpeichernAbwarten();
    const datei = await useStore.getState().fs!.lesen('figuren/ole.md');
    expect(datei).toContain('  - zu: malte\n    art: Kollege\n    kategorie: arbeit');
    await s.beziehungEntfernen('ole', 1);
    expect(useStore.getState().daten!.figuren.ole!.beziehungen).toHaveLength(1);
  });

  it('per Drag vom Griff einer Karte auf eine andere; Inspektor zeigt die neue Beziehung', async () => {
    render(<Ansicht />);
    const netz = screen.getByTestId('netz');
    const ole = within(netz).getByRole('button', { name: /^Ole,/ });
    const malte = within(netz).getByRole('button', { name: /^Malte,/ });
    const griff = ole.querySelector('.pw-bz-griff')!;
    const vorher = document.elementFromPoint;
    document.elementFromPoint = () => malte;
    try {
      fireEvent.pointerDown(griff, { button: 0, clientX: 270, clientY: 78, pointerId: 1 });
      fireEvent.pointerMove(netz, { clientX: 300, clientY: 78, pointerId: 1 });
      await act(async () => {
        fireEvent.pointerUp(netz, { clientX: 440, clientY: 78, pointerId: 1 });
      });
    } finally {
      document.elementFromPoint = vorher;
    }
    expect(useStore.getState().daten!.figuren.ole!.beziehungen.map((b) => b.zu)).toEqual(['paul', 'malte']);
    expect(useStore.getState().netzAuswahl).toMatchObject({ typ: 'beziehung', paar: paarSchluessel('ole', 'malte') });
    expect(await screen.findByText('Ole – Malte')).toBeInTheDocument();
    // neue Bezeichnung im Inspektor eintragen
    const art = screen.getByLabelText('Art');
    fireEvent.change(art, { target: { value: 'Kollege' } });
    await act(async () => {
      fireEvent.blur(art);
    });
    expect(useStore.getState().daten!.figuren.ole!.beziehungen[1]!.art).toBe('Kollege');
  });

  it('„+ Beziehung“: ausgewählte Figur ist die Quelle, Klick auf eine zweite Karte verbindet', async () => {
    useStore.getState().indexNeuBerechnen();
    useStore.getState().waehleImNetz({ typ: 'figur', id: 'vera' });
    render(<Ansicht />);
    const netz = screen.getByTestId('netz');
    act(() => useStore.getState().setzeNetzVerbinden(true));
    expect(screen.getByText(/Esc bricht ab/)).toBeInTheDocument();
    const lotte = within(netz).getByRole('button', { name: /^Lotte,/ });
    fireEvent.pointerDown(lotte, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    await act(async () => {
      fireEvent.pointerUp(netz, { clientX: 10, clientY: 10, pointerId: 2 });
    });
    expect(useStore.getState().daten!.figuren.vera!.beziehungen.map((b) => b.zu)).toEqual(['paul', 'lotte']);
    expect(useStore.getState().netzVerbinden).toBe(false);
    expect(await screen.findByText('Vera – Lotte')).toBeInTheDocument();
  });

  it('Karte per Tastatur verschieben speichert die Position', async () => {
    useStore.getState().indexNeuBerechnen();
    render(<Ansicht />);
    const paul = within(screen.getByTestId('netz')).getByRole('button', { name: /^Paul,/ });
    await act(async () => {
      fireEvent.keyDown(paul, { key: 'ArrowRight', shiftKey: true });
    });
    expect(useStore.getState().daten!.figuren.paul!.netz).toEqual({ x: 384, y: 270 });
  });

  it('Klick auf Akt I blendet Vera und die Fremde aus', async () => {
    useStore.getState().indexNeuBerechnen();
    render(<Ansicht />);
    const netz = screen.getByTestId('netz');
    expect(within(netz).getByRole('button', { name: /^Vera,/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Akt I · Kap. 1–4' }));
    expect(screen.getByText('Stand Ende Kap. 4: was der Leser bis hierhin weiß')).toBeInTheDocument();
    expect(within(netz).queryByRole('button', { name: /^Vera,/ })).toBeNull();
    expect(within(netz).queryByRole('button', { name: /^Die Fremde/ })).toBeNull();
    expect(within(netz).getByRole('button', { name: /^Lotte/ })).toBeInTheDocument();
  });
});
