import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kapitel, ProjektDaten } from '@core/model/types';
import { ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { befehlFuerTaste } from '../../app/befehle';
import { suche } from '../../app/suche';
import { useStore } from '../../state/store';
import { buchAusProjekt, buchBloecke, bloeckeHtml, kapitelHtml, startKapitel, TRENNER_ZEICHEN } from './buch';
import { buchGeometrie, ebookGeometrie } from './geometrie';
import { VorschauEbene } from './index';
import {
  blaettern,
  doppelseite,
  erstellePlan,
  hauptseite,
  nachNavigation,
  nachNeuberechnung,
  seitenInfo,
  seiteVon,
  sichtbareSeiten,
  tastenAktion,
  TITELEI,
  type Anker,
  type Lesestand,
  type Plan,
} from './seiten';
import { EINSTELLUNGEN_SCHLUESSEL, ladeEinstellungen, oeffneVorschau, schliesseVorschau, STANDARD_EINSTELLUNGEN, useVorschau } from './zustand';

function projekt(kapitel: Kapitel[], extra: Partial<ProjektDaten> = {}): ProjektDaten {
  return {
    projekt: { version: 1, titel: 'Testbuch', kapitel: kapitel.map((k) => k.id), notiz: '' },
    kapitel: Object.fromEntries(kapitel.map((k) => [k.id, k])),
    plaene: {},
    akte: [],
    straenge: [],
    ideen: [],
    figuren: {},
    gruppen: {},
    orte: {},
    anmerkungen: [],
    entscheidungen: { version: 1, schreibweisen: [], hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] },
    analysen: {},
    kiHinweise: [],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Aufbereitung Markdown → Buchblöcke
// ---------------------------------------------------------------------------

describe('Aufbereitung', () => {
  it('fett, kursiv, harter Umbruch und Maskierung', () => {
    const b = buchBloecke('Ein **fetter** und *kursiver* Satz mit <b> & "Zitat".  \nZweite Zeile.');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ art: 'absatz', einzug: false });
    const html = bloeckeHtml(b);
    expect(html).toContain('<strong>fetter</strong>');
    expect(html).toContain('<em>kursiver</em>');
    expect(html).toContain('&lt;b&gt; &amp; &quot;Zitat&quot;.<br>Zweite Zeile.');
    expect(html).not.toContain('<b>');
  });

  it('Szenentrenner, Überschriften und Erstzeileneinzug nur bei Folgeabsätzen', () => {
    const b = buchBloecke('Erster.\n\nZweiter.\n\n* * *\n\nNach dem Trenner.\n\nFolgt.\n\n## Zwischentitel\n\nNach der Überschrift.');
    expect(b.map((x) => (x.art === 'absatz' ? `p${x.einzug ? '+' : ''}` : x.art))).toEqual(['p', 'p+', 'trenner', 'p', 'p+', 'ueberschrift', 'p']);
    const html = bloeckeHtml(b);
    expect(html).toContain(`>${TRENNER_ZEICHEN}</div>`);
    expect(html).toContain('<h3 data-b class="pw-v-zwischentitel">Zwischentitel</h3>');
    expect(html.match(/data-b/g)).toHaveLength(7);
  });

  it('Trenner am Rand und doppelte Trenner entfallen, Titel-Überschrift wird nicht doppelt gesetzt', () => {
    const b = buchBloecke('# Flut\n\n* * *\n\nText.\n\n* * *\n\n***\n\nMehr.\n\n* * *\n', 'Flut');
    expect(b.map((x) => x.art)).toEqual(['absatz', 'trenner', 'absatz']);
  });

  it('Buch: Projektreihenfolge, leere und nur geplante Kapitel übersprungen, fortlaufend nummeriert, ohne Anmerkungen', () => {
    const daten = projekt(
      [
        { id: 'a', titel: 'Anfang', text: 'Erster Absatz.' },
        { id: 'leer', titel: 'Leer', text: '   \n\n' },
        { id: 'nur-trenner', titel: 'Nur Trenner', text: '* * *' },
        { id: 'b', titel: 'Zweites', text: 'Zweiter Absatz mit Anmerkung.' },
      ],
      {
        anmerkungen: [
          { id: 'n1', anker: { kapitel: 'b', exakt: 'Anmerkung', davor: '', danach: '' }, notiz: 'GEHEIME NOTIZ', ziel: null, erstellt: '2026-01-01' },
        ],
      },
    );
    daten.projekt.kapitel.splice(1, 0, 'nur-geplant');
    const buch = buchAusProjekt(daten);
    expect(buch.titel).toBe('Testbuch');
    expect(buch.kapitel.map((k) => [k.id, k.nummer])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    const html = buch.kapitel.map((k) => kapitelHtml(k, 'buch')).join('');
    expect(html).not.toContain('GEHEIME NOTIZ');
    expect(html).not.toMatch(/<mark|<a |pw-s-/);
    expect(html).toContain('<div class="pw-v-kopf__nummer">2</div><h2 class="pw-v-kopf__titel">Zweites</h2>');
    expect(kapitelHtml(buch.kapitel[0]!, 'ebook')).toContain('Kapitel 1');
  });

  it('Demo-Projekt: alle Kapitel mit Text, Startkapitel', async () => {
    const daten = await ladeDemoProjekt();
    const buch = buchAusProjekt(daten);
    expect(buch.kapitel.length).toBeGreaterThan(5);
    expect(buch.kapitel.every((k) => k.html.includes('data-b'))).toBe(true);
    expect(startKapitel(buch, daten.projekt.kapitel, 'lotte')).toBe('lotte');
    expect(startKapitel(buch, daten.projekt.kapitel, 'gibt-es-nicht')).toBeNull();
    expect(startKapitel(buch, daten.projekt.kapitel, undefined)).toBeNull();
  });

  it('Startkapitel ohne Text → nächstes, sonst vorheriges mit Text', () => {
    const daten = projekt([
      { id: 'a', titel: 'A', text: 'Text.' },
      { id: 'leer', titel: 'Leer', text: '' },
      { id: 'b', titel: 'B', text: 'Text.' },
      { id: 'leer2', titel: 'Leer 2', text: '' },
    ]);
    const buch = buchAusProjekt(daten);
    expect(startKapitel(buch, daten.projekt.kapitel, 'leer')).toBe('b');
    expect(startKapitel(buch, daten.projekt.kapitel, 'leer2')).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Seitenplan, Blättern, Tasten
// ---------------------------------------------------------------------------

const buchPlan = (...spalten: number[]): Plan =>
  erstellePlan([{ id: TITELEI, spalten: 1 }, ...spalten.map((s, i) => ({ id: `k${i + 1}`, spalten: s }))], { rechts: true });

describe('Seitenplan', () => {
  it('Titelseite, Rückseite leer, jedes Kapitel beginnt auf einer rechten (ungeraden) Seite', () => {
    const plan = buchPlan(5, 4, 1);
    // 1 Titel, 2 vakat, 3–7 k1, 8 vakat, 9–12 k2, 13 k3
    expect(plan.abschnitte.map((a) => [a.id, a.start, a.leer])).toEqual([
      [TITELEI, 1, 1],
      ['k1', 3, 1],
      ['k2', 9, 0],
      ['k3', 13, 0],
    ]);
    expect(plan.gesamt).toBe(13);
    for (const a of plan.abschnitte) expect(a.start % 2).toBe(1);
    expect(seitenInfo(plan, 2)).toMatchObject({ art: 'leer' });
    expect(seitenInfo(plan, 8)).toMatchObject({ art: 'leer', ort: { id: 'k1', spalte: 5 } });
    expect(seitenInfo(plan, 9)).toMatchObject({ art: 'inhalt', anfang: true, ort: { id: 'k2', spalte: 0 } });
  });

  it('E-Book: ohne Vakatseiten', () => {
    const plan = erstellePlan(
      [
        { id: 'a', spalten: 3 },
        { id: 'b', spalten: 2 },
      ],
      { rechts: false },
    );
    expect(plan.gesamt).toBe(5);
    expect(plan.abschnitte[1]!.start).toBe(4);
  });

  it('Doppelseiten: links gerade, rechts ungerade, Seite 1 allein rechts', () => {
    expect(doppelseite(1)).toEqual([0, 1]);
    expect(doppelseite(2)).toEqual([2, 3]);
    expect(doppelseite(3)).toEqual([2, 3]);
    const plan = buchPlan(5, 4);
    const [l, r] = sichtbareSeiten(plan, { id: 'k2', spalte: 0 }, true);
    expect(l).toMatchObject({ seite: 8, art: 'leer' });
    expect(r).toMatchObject({ seite: 9, anfang: true });
    // Leseposition ist die erste Inhaltsseite der Doppelseite
    expect(hauptseite(plan, { id: 'k1', spalte: 5 }, true)?.seite).toBe(9);
  });
});

describe('Tastatur-Blättern', () => {
  it('Tasten → Aktionen', () => {
    const t = (key: string, extra: Partial<KeyboardEvent> = {}) => tastenAktion({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...extra });
    expect(['ArrowRight', 'ArrowDown', 'PageDown', ' '].map((k) => t(k))).toEqual(['vor', 'vor', 'vor', 'vor']);
    expect(['ArrowLeft', 'ArrowUp', 'PageUp'].map((k) => t(k))).toEqual(['zurueck', 'zurueck', 'zurueck']);
    expect(t(' ', { shiftKey: true })).toBe('zurueck');
    expect(t('Home')).toBe('anfang');
    expect(t('End')).toBe('ende');
    expect(t('Escape')).toBe('schliessen');
    expect(t('ArrowRight', { metaKey: true })).toBeNull();
    expect(t('a')).toBeNull();
  });

  it('Einzelseiten: weiter/zurück, Vakatseiten werden übersprungen, Ränder bleiben stehen', () => {
    const plan = buchPlan(5, 4);
    let ort = { id: TITELEI, spalte: 0 };
    const seiten: number[] = [seiteVon(plan, ort)];
    for (;;) {
      const neu = blaettern(plan, ort, 1, false);
      if (neu === ort) break;
      ort = neu;
      seiten.push(seiteVon(plan, ort));
    }
    expect(seiten).toEqual([1, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(seiteVon(plan, blaettern(plan, { id: 'k2', spalte: 0 }, -1, false))).toBe(7);
    const anfang = { id: TITELEI, spalte: 0 };
    expect(blaettern(plan, anfang, -1, false)).toBe(anfang);
  });

  it('Doppelseiten: ganze Doppelseite weiter/zurück', () => {
    const plan = buchPlan(5, 4);
    let ort = { id: TITELEI, spalte: 0 };
    const paare: string[] = [];
    for (;;) {
      paare.push(doppelseite(seiteVon(plan, ort)).join('|'));
      const neu = blaettern(plan, ort, 1, true);
      if (neu === ort) break;
      ort = neu;
    }
    expect(paare).toEqual(['0|1', '2|3', '4|5', '6|7', '8|9', '10|11', '12|13']);
    expect(doppelseite(seiteVon(plan, blaettern(plan, { id: 'k1', spalte: 1 }, -1, true)))).toEqual([2, 3]);
    expect(doppelseite(seiteVon(plan, blaettern(plan, { id: 'k1', spalte: 0 }, -1, true)))).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Neuberechnung behält die Leseposition
// ---------------------------------------------------------------------------

describe('Neuberechnung', () => {
  /** Modell eines Satzes: Kapitel mit fester Zeichenzahl je Seite */
  const satz = (zeichenJeSeite: number, laenge = 20_000) => ({
    plan: erstellePlan([{ id: 'k', spalten: Math.ceil(laenge / zeichenJeSeite) }], { rechts: false }),
    seiteVon: (a: Anker) => Math.floor(a.zeichen / zeichenJeSeite),
    textanfang: (spalte: number): Anker => ({ id: 'k', block: 0, zeichen: spalte * zeichenJeSeite }),
  });

  it('nach Größen- oder Schriftänderung liegt der Textanfang der Seite wieder auf der sichtbaren Seite', () => {
    const a = satz(1000);
    // Leser blättert auf Seite 8 (Zeichen 7000–7999); der Anker ist der Textanfang dieser Seite
    let stand: Lesestand = nachNavigation({ id: 'k', spalte: 7 });
    expect(stand.anker).toBeNull();
    stand = { ...stand, anker: a.textanfang(7) };

    const b = satz(600); // kleineres Fenster / größere Schrift
    stand = nachNeuberechnung(stand, b.plan, b.seiteVon);
    expect(stand.ort).toEqual({ id: 'k', spalte: 11 }); // 7000 / 600 = 11,67
    expect(stand.anker).toEqual({ id: 'k', block: 0, zeichen: 7000 });

    const c = satz(1450);
    stand = nachNeuberechnung(stand, c.plan, c.seiteVon);
    expect(stand.ort.spalte).toBe(4);

    // zurück zur ersten Größe: wieder genau die Ausgangsseite (keine Wanderung)
    stand = nachNeuberechnung(stand, a.plan, a.seiteVon);
    expect(stand.ort).toEqual({ id: 'k', spalte: 7 });
  });

  it('viele Neuberechnungen hintereinander verschieben die Position nicht', () => {
    let stand: Lesestand = { ort: { id: 'k', spalte: 13 }, anker: { id: 'k', block: 0, zeichen: 13_000 } };
    for (const n of [900, 700, 1300, 800, 1100, 640, 1000]) {
      const s = satz(n);
      stand = nachNeuberechnung(stand, s.plan, s.seiteVon);
      expect(stand.ort.spalte * n).toBeLessThanOrEqual(13_000);
      expect((stand.ort.spalte + 1) * n).toBeGreaterThan(13_000);
    }
    expect(stand.ort.spalte).toBe(13);
    expect(stand.anker?.zeichen).toBe(13_000);
  });

  it('ohne Anker oder bei unbekanntem Kapitel bleibt der Stand', () => {
    const s = satz(1000);
    const ohne: Lesestand = { ort: { id: 'k', spalte: 3 }, anker: null };
    expect(nachNeuberechnung(ohne, s.plan, s.seiteVon)).toBe(ohne);
    const fremd: Lesestand = { ort: { id: 'k', spalte: 3 }, anker: { id: 'weg', block: 0, zeichen: 0 } };
    expect(nachNeuberechnung(fremd, s.plan, s.seiteVon)).toBe(fremd);
  });
});

// ---------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------

describe('Geometrie', () => {
  it('Buch: Romanformat, Doppelseite auf breiten Flächen, ganze Zeilen', () => {
    const g = buchGeometrie(1440, 812);
    expect(g.doppel).toBe(true);
    expect(g.seiteBreite / g.seiteHoehe).toBeCloseTo(125 / 190, 2);
    expect(g.fluss.hoehe).toBeGreaterThanOrEqual(g.fluss.zeilen * g.fluss.zeile);
    expect(g.fluss.hoehe).toBeLessThan((g.fluss.zeilen + 1) * g.fluss.zeile);
    expect(buchGeometrie(700, 900).doppel).toBe(false);
  });

  it('E-Book: zwei Spalten nur auf breiten Flächen, Schriftstufen', () => {
    expect(ebookGeometrie(1440, 812, 2, 'normal').spalten).toBe(2);
    expect(ebookGeometrie(800, 700, 2, 'normal').spalten).toBe(1);
    expect(ebookGeometrie(1000, 700, 4, 'weit').fluss.schrift).toBeGreaterThan(ebookGeometrie(1000, 700, 0, 'eng').fluss.schrift);
  });
});

// ---------------------------------------------------------------------------
// Einstellungen, Befehle, Öffnen am Kapitel
// ---------------------------------------------------------------------------

describe('Einstellungen', () => {
  beforeEach(() => localStorage.clear());

  it('werden gespeichert und ungültige Werte verworfen', () => {
    expect(ladeEinstellungen()).toEqual(STANDARD_EINSTELLUNGEN);
    localStorage.setItem(EINSTELLUNGEN_SCHLUESSEL, '{kaputt');
    expect(ladeEinstellungen()).toEqual(STANDARD_EINSTELLUNGEN);
    localStorage.setItem(EINSTELLUNGEN_SCHLUESSEL, JSON.stringify({ modus: 'ebook', schriftstufe: 99, zeilenabstand: 'weit', hintergrund: 'lila' }));
    expect(ladeEinstellungen()).toEqual({ ...STANDARD_EINSTELLUNGEN, modus: 'ebook', zeilenabstand: 'weit' });
    act(() => useVorschau.getState().setzeEinstellungen({ hintergrund: 'sepia' }));
    expect(JSON.parse(localStorage.getItem(EINSTELLUNGEN_SCHLUESSEL)!)).toMatchObject({ hintergrund: 'sepia' });
  });
});

describe('Einbindung', () => {
  it('⌘⇧B öffnet die Vorschau, Schnellsuche findet „Buch-Vorschau“', async () => {
    expect(befehlFuerTaste({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: true, key: 'B', code: 'KeyB' })).toBe('vorschau');
    expect(befehlFuerTaste({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: true, key: 'F', code: 'KeyF' })).toBe('fokus');
    const daten = await ladeDemoProjekt();
    expect(suche(daten, 'vorschau')[0]).toMatchObject({ art: 'befehl', befehl: 'vorschau', titel: 'Buch-Vorschau' });
    expect(suche(daten, '').some((t) => t.art === 'befehl')).toBe(false);
  });
});

describe('Vorschau öffnen', () => {
  beforeEach(async () => {
    localStorage.clear();
    useVorschau.setState({ offen: false, letzteStelle: null, einstellungen: { ...STANDARD_EINSTELLUNGEN } });
    useStore.setState({ daten: await ladeDemoProjekt() });
  });
  afterEach(() => act(() => schliesseVorschau()));

  it('öffnet am übergebenen Kapitel, blättert mit der Tastatur, Inhaltsverzeichnis springt, Esc schließt', async () => {
    render(<VorschauEbene />);
    expect(screen.queryByRole('dialog', { name: 'Buch-Vorschau' })).toBeNull();
    act(() => oeffneVorschau('lotte'));
    const dialog = await screen.findByRole('dialog', { name: 'Buch-Vorschau' });
    expect(within(dialog).getByText('Kap. 3 · Lotte')).toBeInTheDocument();
    // Kapitelanfang rechts auf ungerader Seite, mit Kapitelkopf
    const seite = await within(dialog).findByLabelText(/^Seite \d+$/);
    expect(Number(seite.getAttribute('aria-label')!.split(' ')[1]) % 2).toBe(1);
    expect(seite.querySelector('.pw-v-kopf__titel')?.textContent).toBe('Lotte');
    expect(seite.querySelector('.pw-v-kolumne')).toBeNull();
    expect(dialog.querySelector('.pw-v-fuss__text')?.textContent).toMatch(/^Seite \d+–\d+ von/);

    // weiter → nächstes Kapitel mit Text („Regatta“ ist leer und fehlt)
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Kap. 4 · Staub')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByText('Kap. 3 · Lotte')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Home' });
    expect(within(dialog).getByText('Titelseite')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Hafenlichter' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Inhalt/ }));
    const inhalt = within(dialog).getByRole('navigation', { name: 'Inhaltsverzeichnis' });
    fireEvent.click(within(inhalt).getByText('Flut'));
    expect(within(dialog).getByText(/Kap\. \d+ · Flut/)).toBeInTheDocument();

    // erneutes Öffnen mit Kapitel springt dorthin
    act(() => oeffneVorschau('fassade'));
    expect(within(dialog).getByText('Kap. 2 · Fassade')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(useVorschau.getState().offen).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Buch-Vorschau' })).toBeNull();
    expect(useVorschau.getState().letzteStelle?.id).toBe('fassade');
  });

  it('E-Book: Fortschritt im Kapitel und Hintergründe', async () => {
    useVorschau.setState({ einstellungen: { ...STANDARD_EINSTELLUNGEN, modus: 'ebook' } });
    render(<VorschauEbene />);
    act(() => oeffneVorschau('flut'));
    const dialog = await screen.findByRole('dialog', { name: 'Buch-Vorschau' });
    await within(dialog).findByText(/im Kapitel/);
    expect(dialog.querySelector('.pw-v-fuss__text')?.textContent).toMatch(/^Seite 1 von (ca\. )?\d+ im Kapitel$/);
    expect(dialog).toHaveAttribute('data-hintergrund', 'papier');
    fireEvent.click(within(dialog).getByRole('button', { name: /Darstellung/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Nacht/ }));
    expect(dialog).toHaveAttribute('data-hintergrund', 'nacht');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schriftgröße 5 von 5' }));
    expect(useVorschau.getState().einstellungen.schriftstufe).toBe(4);
    // Moduswechsel behält das Kapitel
    fireEvent.click(within(dialog).getByRole('button', { name: 'Buch' }));
    expect(within(dialog).getByText(/Flut$/, { selector: '.pw-v-leiste__kontext' })).toBeInTheDocument();
  });
});
