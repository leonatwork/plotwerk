import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Hinweis } from '@core/model/types';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import Ansicht from './index';
import { filtern, gruppieren, hinweisStatus, schreibweisenVarianten, STANDARD_FILTER, unbekannterName } from './logik';

async function laden() {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
  });
  useStore.setState({ hinweisFilter: STANDARD_FILTER, auswahl: {}, bereich: 'hinweise', markierung: null });
}

const hinweis = (typ: Hinweis['typ'], teil?: string) =>
  useStore.getState().index.hinweise.find((h) => h.typ === typ && (!teil || h.titel.includes(teil)))!;

describe('Hinweis-Entscheidung', () => {
  beforeEach(laden);

  it('„Ist Absicht“ landet in entscheidungen.json, wird nicht erneut gemeldet und lässt sich zurücksetzen', async () => {
    const h = hinweis('pruefen');
    expect(h.status).toBe('neu');
    await useStore.getState().hinweisEntscheiden(h.schluessel, 'absicht');
    await useStore.getState().alleSpeichernAbwarten();
    const json = JSON.parse((await useStore.getState().fs!.lesen('entscheidungen.json'))!);
    expect(json.hinweise).toEqual([expect.objectContaining({ schluessel: h.schluessel, entscheidung: 'absicht' })]);
    // sofort sichtbar (vor der Neuberechnung) …
    expect(hinweisStatus(h, useStore.getState().daten!.entscheidungen)).toBe('absicht');
    // … und nach der Neuberechnung des Index
    useStore.getState().indexNeuBerechnen();
    const neu = useStore.getState().index.hinweise.find((x) => x.schluessel === h.schluessel)!;
    expect(neu.status).toBe('absicht');
    expect(filtern(useStore.getState().index.hinweise, STANDARD_FILTER).some((x) => x.schluessel === h.schluessel)).toBe(false);

    await useStore.getState().hinweisEntscheiden(h.schluessel, null);
    expect(useStore.getState().daten!.entscheidungen.hinweise).toEqual([]);
  });

  it('Ansicht: gruppiert nach Typ; „Erledigt“ entfernt den Hinweis aus „Neu“ und wählt den nächsten', async () => {
    useStore.getState().indexNeuBerechnen();
    render(<Ansicht />);
    expect(screen.getByRole('heading', { name: 'Hinweise' })).toBeInTheDocument();
    const gruppen = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(gruppen).toEqual(expect.arrayContaining(['Prüfen', 'Schreibweise', 'Offener Faden', 'Unbekannt', 'Zeitleiste']));

    const pruefen = hinweis('pruefen');
    expect(useStore.getState().auswahl.hinweis).toBe(pruefen.schluessel);
    const inspektor = screen.getByRole('complementary', { name: 'Inspektor Hinweis' });
    expect(within(inspektor).getByText('offen')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(inspektor).getByRole('button', { name: 'Erledigt' }));
    });
    expect(useStore.getState().daten!.entscheidungen.hinweise[0]).toMatchObject({ schluessel: pruefen.schluessel, entscheidung: 'erledigt' });
    expect(screen.queryByText(pruefen.titel, { selector: '.pw-hw-eintrag__titel' })).toBeNull();
    expect(useStore.getState().auswahl.hinweis).not.toBe(pruefen.schluessel);
    expect(useStore.getState().auswahl.hinweis).toBeTruthy();

    // Status „Erledigt“ zeigt ihn wieder, mit „Zurücksetzen“
    fireEvent.click(screen.getByRole('button', { name: /^Erledigt · 1/ }));
    fireEvent.click(screen.getByText(pruefen.titel, { selector: '.pw-hw-eintrag__titel' }));
    expect(within(screen.getByRole('complementary', { name: 'Inspektor Hinweis' })).getByRole('button', { name: /Zurücksetzen/ })).toBeInTheDocument();
  });

  it('„Stelle öffnen“ markiert das Zitat im Editor', async () => {
    useStore.getState().indexNeuBerechnen();
    render(<Ansicht />);
    const inspektor = screen.getByRole('complementary', { name: 'Inspektor Hinweis' });
    fireEvent.click(within(inspektor).getAllByRole('button', { name: 'Stelle öffnen' })[1]!);
    const s = useStore.getState();
    expect(s.bereich).toBe('schreiben');
    expect(s.markierung).toMatchObject({ kapitel: 'flut', anker: { exakt: 'dass ich eine halbe Stunde zu früh bin' } });
    expect(s.markierung!.anker.davor.length).toBeGreaterThan(0);
  });

  it('Schreibweise festlegen: gültige Form mit Ziel-Ort, Hinweis erledigt und nicht erneut gemeldet', async () => {
    useStore.getState().indexNeuBerechnen();
    const h = hinweis('schreibweise', 'Linden');
    expect(schreibweisenVarianten(h)).toEqual(['Lindenhof', 'Linden Hof', 'Linden-Hof']);
    await useStore.getState().schreibweiseFestlegen(h, 'Lindenhof', schreibweisenVarianten(h));
    const e = useStore.getState().daten!.entscheidungen;
    expect(e.schreibweisen).toEqual([
      { varianten: ['Lindenhof', 'Linden Hof', 'Linden-Hof'], gueltig: 'Lindenhof', ziel: { typ: 'ort', id: 'lindenhof' } },
    ]);
    expect(e.hinweise[0]).toMatchObject({ schluessel: h.schluessel, entscheidung: 'erledigt' });
    useStore.getState().indexNeuBerechnen();
    const neue = filtern(useStore.getState().index.hinweise, STANDARD_FILTER);
    expect(neue.some((x) => x.typ === 'schreibweise' && x.titel.includes('Linden-Hof'))).toBe(false);
  });

  it('Unbekannt: Name aus dem Titel, Zuordnen macht ihn zum Alias, Figur anlegen legt sie an', async () => {
    useStore.getState().indexNeuBerechnen();
    const h = hinweis('unbekannt');
    expect(unbekannterName(h)).toBe('Fiete');
    await useStore.getState().unbekanntZuordnen(h, 'ole', 'Fiete');
    expect(useStore.getState().daten!.figuren.ole!.aliase).toEqual(['Fiete']);
    const z = useStore.getState().daten!.entscheidungen.zuordnungen[0]!;
    expect(z).toMatchObject({ ziel: { typ: 'figur', id: 'ole' }, status: 'bestaetigt', anker: { kapitel: 'funkstille', exakt: 'Fiete' } });
    await useStore.getState().hinweisEntscheiden(h.schluessel, null);
    const id = await useStore.getState().unbekannteFigurAnlegen(h, 'Fiete');
    expect(id).toBe('fiete');
    expect(useStore.getState().daten!.figuren.fiete).toMatchObject({ name: 'Fiete', rolle: 'neben', existenz: 'gesichert' });
    expect(hinweisStatus(h, useStore.getState().daten!.entscheidungen)).toBe('erledigt');
  });

  it('Filter nach Typ und Kapitel', () => {
    useStore.getState().indexNeuBerechnen();
    const alle = useStore.getState().index.hinweise;
    const funkstille = filtern(alle, { typ: 'alle', kapitel: 'funkstille', status: 'alle' });
    expect(funkstille.length).toBeGreaterThan(0);
    expect(funkstille.every((h) => h.zitate.some((z) => z.kapitel === 'funkstille'))).toBe(true);
    // ein KI-Hinweis aus .plotwerk/hinweise.json und ein lokaler aus der Zeitprüfung (Tag 9 ≠ Donnerstag)
    const zeit = filtern(alle, { typ: 'zeitleiste', kapitel: 'alle', status: 'neu' });
    expect(zeit.map((h) => h.typ)).toEqual(['zeitleiste', 'zeitleiste']);
    expect(zeit.map((h) => h.quelle).sort()).toEqual(['ki', 'lokal']);
    const g = gruppieren(useStore.getState().daten!, alle).map((x) => x.typ);
    expect(g.indexOf('pruefen')).toBeLessThan(g.indexOf('zeitleiste'));
  });
});

describe('Leerzustand', () => {
  it('ohne Hinweise: Hinweis auf „Buch prüfen“', async () => {
    await laden();
    useStore.setState({ index: { ...useStore.getState().index, hinweise: [] } });
    render(<Ansicht />);
    expect(screen.getByText('Keine Hinweise')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buch prüfen' }));
    expect(useStore.getState().dialog).toEqual({ id: 'ki-pruefen', param: { umfang: 'buch' } });
  });
});
