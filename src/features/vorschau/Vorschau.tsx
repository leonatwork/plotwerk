/**
 * Lesevorschau: das Manuskript als gedrucktes Buch (feste Seiten, Doppelseite) oder als E-Book (fließend).
 * Nur lesend. Vollfenster-Ebene über dem App-Rahmen; Esc schließt.
 *
 * Paginierung: jedes Kapitel ist ein Mehrspaltenelement (Spaltenbreite = Satzbreite, feste Höhe); eine
 * Seite ist ein Fenster auf Spalte k. Spaltenzahlen werden im Hintergrund gemessen (messung.ts), die
 * Leseposition hängt am Textanfang der aktuellen Seite (seiten.ts) und übersteht jede Neuberechnung.
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { istTauri } from '../../backend';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, IconKapitel, klassen, Segment } from '../../ui';
import { buchAusProjekt, kapitelHtml, startKapitel, type Buch, type BuchKapitel } from './buch';
import { buchGeometrie, ebookGeometrie, SCHRIFTSTUFEN, zeichenJeSpalte, type BuchGeometrie, type EbookGeometrie, type Fluss, type Geometrie, type Zeilenabstand } from './geometrie';
import { ankerVonSpalte, flussStil, schriftenLaden, spalteVonAnker, vermessen } from './messung';
import {
  anfang,
  blaettern,
  ende,
  erstellePlan,
  fortschritt,
  hauptseite,
  nachNeuberechnung,
  sichtbareSeiten,
  tastenAktion,
  TITELEI,
  type AbschnittEingabe,
  type Anker,
  type Ort,
  type Plan,
} from './seiten';
import { useVorschau, type Hintergrund, type VorschauModus } from './zustand';
import './vorschau.css';

const LEERES_BUCH: Buch = { titel: '', kapitel: [], zeichen: 0 };
const FOKUSSIERBAR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const HINTERGRUENDE: { wert: Hintergrund; label: string }[] = [
  { wert: 'papier', label: 'Papier' },
  { wert: 'sepia', label: 'Sepia' },
  { wert: 'nacht', label: 'Nacht' },
];
const ZEILEN: { wert: Zeilenabstand; label: string }[] = [
  { wert: 'eng', label: 'Eng' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'weit', label: 'Weit' },
];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Größe der Bühne; Änderungen werden entprellt (120 ms), damit beim Ziehen nicht jeder Schritt neu setzt. */
function useFlaeche(ref: RefObject<HTMLDivElement>): { b: number; h: number } | null {
  const [flaeche, setFlaeche] = useState<{ b: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const messen = () => {
      const b = Math.round(el.clientWidth || window.innerWidth);
      const h = Math.round(el.clientHeight || Math.max(320, window.innerHeight - 92));
      setFlaeche((alt) => (alt && alt.b === b && alt.h === h ? alt : { b, h }));
    };
    messen();
    let zeit: ReturnType<typeof setTimeout> | undefined;
    const spaeter = () => {
      clearTimeout(zeit);
      zeit = setTimeout(messen, 120);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(spaeter) : null;
    ro?.observe(el);
    window.addEventListener('resize', spaeter);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', spaeter);
      clearTimeout(zeit);
    };
  }, [ref]);
  return flaeche;
}

/** 0 = Schriften laden noch; jede spätere Nachladung einer Satzschrift zählt hoch (neu messen). */
function useSchriftStand(): number {
  const [stand, setStand] = useState(0);
  useEffect(() => {
    let aktiv = true;
    void schriftenLaden().then(() => aktiv && setStand((s) => Math.max(1, s)));
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const geladen = (e: Event) => {
      const faces = (e as FontFaceSetLoadEvent).fontfaces ?? [];
      if (faces.some((f) => /Newsreader|Instrument/.test(f.family))) setStand((s) => (s > 0 ? s + 1 : s));
    };
    fonts?.addEventListener?.('loadingdone', geladen);
    return () => {
      aktiv = false;
      fonts?.removeEventListener?.('loadingdone', geladen);
    };
  }, []);
  return stand;
}

// ---------------------------------------------------------------------------
// Satz-Fenster und Seiten
// ---------------------------------------------------------------------------

interface SatzFensterProps {
  slot: string;
  id: string;
  html: string;
  fluss: Fluss;
  /** erste sichtbare Spalte */
  spalte: number;
  /** sichtbare Breite (E-Book mit zwei Spalten: beide Spalten + Abstand) */
  breite: number;
  links: number;
  oben: number;
  klasse: string;
  verborgen?: boolean;
  registrieren(slot: string, el: HTMLElement | null): void;
}

/** Fenster auf eine Spalte des Kapitelsatzes. Beim Blättern ändert sich nur die Verschiebung. */
const SatzFenster = memo(function SatzFenster({ slot, id, html, fluss, spalte, breite, links, oben, klasse, verborgen, registrieren }: SatzFensterProps) {
  const ref = useCallback((el: HTMLDivElement | null) => registrieren(slot, el), [slot, registrieren]);
  const b = fluss.beschnitt;
  const stil = useMemo(() => ({ ...(flussStil(fluss) as CSSProperties), left: b }), [fluss, b]);
  return (
    <div className="pw-v-fenster" style={{ left: links - b, top: oben, width: breite + 2 * b, height: fluss.hoehe + b }} aria-hidden={verborgen || undefined}>
      <div
        ref={ref}
        data-abschnitt={id}
        className={`pw-v-fluss ${klasse}`}
        lang="de"
        style={{ ...stil, transform: `translateX(${-spalte * (fluss.breite + fluss.abstand)}px)` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});

interface BuchSeiteProps {
  slot: string;
  /** globale Seitenzahl; 0 = keine Seite an dieser Stelle */
  seite: number;
  id: string;
  spalte: number;
  leer: boolean;
  anfang: boolean;
  geo: BuchGeometrie;
  buchTitel: string;
  kapitel: BuchKapitel | undefined;
  html: string | undefined;
  verborgen: boolean;
  registrieren(slot: string, el: HTMLElement | null): void;
}

const BuchSeite = memo(function BuchSeite({ slot, seite, id, spalte, leer, anfang, geo, buchTitel, kapitel, html, verborgen, registrieren }: BuchSeiteProps) {
  const { seiteBreite: b, seiteHoehe: h, rand, fluss } = geo;
  if (!seite) return <div className="pw-v-seite pw-v-seite--fehlt" style={{ width: b, height: h }} aria-hidden="true" />;
  const verso = seite % 2 === 0;
  const links = verso ? rand.aussen : rand.innen;
  const stil: CSSProperties = { width: b, height: h, fontSize: fluss.schrift };
  const klasse = klassen('pw-v-seite', verso ? 'pw-v-seite--links' : 'pw-v-seite--rechts', geo.doppel && 'pw-v-seite--doppel');
  if (id === TITELEI)
    return (
      <div className={klasse} style={stil} aria-label={leer ? 'Leere Seite' : 'Titelseite'}>
        {!leer && (
          <div className="pw-v-titelseite" style={{ paddingTop: Math.round(h * 0.27), paddingLeft: links, paddingRight: verso ? rand.innen : rand.aussen }}>
            <h1 className="pw-v-titelseite__titel">{buchTitel}</h1>
            <span className="pw-v-titelseite__linie" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  if (leer || !html || !kapitel) return <div className={klasse} style={stil} aria-label="Leere Seite" />;
  const kolumne = anfang ? null : verso ? buchTitel : kapitel.titel;
  return (
    <div className={klasse} style={stil} aria-label={`Seite ${seite}`}>
      {kolumne && (
        <div className="pw-v-kolumne" style={{ left: links, width: fluss.breite, top: Math.round(rand.oben * 0.36) }}>
          {kolumne}
        </div>
      )}
      <SatzFenster
        slot={slot}
        id={id}
        html={html}
        fluss={fluss}
        spalte={spalte}
        breite={fluss.breite}
        links={links}
        oben={rand.oben}
        klasse="pw-v-fluss--buch"
        verborgen={verborgen}
        registrieren={registrieren}
      />
      <div className="pw-v-folio" style={{ left: links, width: fluss.breite, bottom: Math.round(rand.unten * 0.4) }}>
        {seite}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Inhaltsverzeichnis und Darstellung
// ---------------------------------------------------------------------------

function Inhaltsverzeichnis({
  buch,
  plan,
  aktuell,
  seitenZeigen,
  waehle,
  schliessen,
}: {
  buch: Buch;
  plan: Plan;
  aktuell: string | null;
  seitenZeigen: boolean;
  waehle(id: string): void;
  schliessen(): void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const knopf = ref.current?.querySelector<HTMLButtonElement>('[aria-current="true"]') ?? ref.current?.querySelector<HTMLButtonElement>('button');
    knopf?.focus();
    knopf?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  useAussenKlick(ref, schliessen);
  return (
    <nav
      ref={ref}
      className="pw-v-panel pw-v-panel--inhalt"
      aria-label="Inhaltsverzeichnis"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const knoepfe = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
        knoepfe[Math.min(knoepfe.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }}
    >
      <Abschnittslabel as="h2" className="pw-v-panel__titel">
        Inhalt
      </Abschnittslabel>
      {buch.kapitel.length === 0 ? (
        <p className="pw-v-panel__leer">Noch kein Kapitel mit Text.</p>
      ) : (
        <ul className="pw-v-inhalt">
          {buch.kapitel.map((k) => {
            const a = plan.abschnitte[plan.index.get(k.id) ?? -1];
            return (
              <li key={k.id}>
                <button type="button" className="pw-v-inhalt__eintrag" aria-current={k.id === aktuell ? 'true' : undefined} onClick={() => waehle(k.id)}>
                  <span className="pw-v-inhalt__nummer">{k.nummer}</span>
                  <span className="pw-v-inhalt__titel">{k.titel}</span>
                  {seitenZeigen && a && <span className="pw-v-inhalt__seite">{a.start}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function Darstellung({ schliessen }: { schliessen(): void }) {
  const einstellungen = useVorschau((s) => s.einstellungen);
  const setzen = useVorschau((s) => s.setzeEinstellungen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);
  useAussenKlick(ref, schliessen);
  return (
    <div ref={ref} className="pw-v-panel pw-v-panel--darstellung" role="group" aria-label="Darstellung">
      <div className="pw-v-feld">
        <Abschnittslabel as="h2">Schriftgröße</Abschnittslabel>
        <div className="pw-v-stufen" role="group" aria-label="Schriftgröße">
          {SCHRIFTSTUFEN.map((px, i) => (
            <button
              key={px}
              type="button"
              className="pw-v-stufe"
              aria-pressed={einstellungen.schriftstufe === i}
              aria-label={`Schriftgröße ${i + 1} von ${SCHRIFTSTUFEN.length}`}
              style={{ fontSize: 11 + i * 2.5 }}
              onClick={() => setzen({ schriftstufe: i })}
            >
              A
            </button>
          ))}
        </div>
      </div>
      <div className="pw-v-feld">
        <Abschnittslabel as="h2">Zeilenabstand</Abschnittslabel>
        <Segment rolle="group" label="Zeilenabstand" voll optionen={ZEILEN} wert={einstellungen.zeilenabstand} onChange={(z) => setzen({ zeilenabstand: z })} />
      </div>
      <div className="pw-v-feld">
        <Abschnittslabel as="h2">Hintergrund</Abschnittslabel>
        <div className="pw-v-themen" role="group" aria-label="Hintergrund">
          {HINTERGRUENDE.map((h) => (
            <button key={h.wert} type="button" className="pw-v-thema" data-thema={h.wert} aria-pressed={einstellungen.hintergrund === h.wert} onClick={() => setzen({ hintergrund: h.wert })}>
              <span className="pw-v-thema__muster" aria-hidden="true">
                Aa
              </span>
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Klick außerhalb des Panels schließt es (nicht auf den Knopf, der es umschaltet). */
function useAussenKlick(ref: RefObject<HTMLElement>, schliessen: () => void): void {
  const zu = useRef(schliessen);
  zu.current = schliessen;
  useEffect(() => {
    const unten = (e: MouseEvent) => {
      const ziel = e.target as Element | null;
      if (!ref.current || !ziel || ref.current.contains(ziel) || ziel.closest('[data-panel-knopf]')) return;
      zu.current();
    };
    document.addEventListener('mousedown', unten);
    return () => document.removeEventListener('mousedown', unten);
  }, [ref]);
}

const Pfeil = ({ richtung }: { richtung: 'links' | 'rechts' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={richtung === 'links' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

export default function Vorschau() {
  const daten = useStore((s) => s.daten);
  const einstellungen = useVorschau((s) => s.einstellungen);
  const start = useVorschau((s) => s.start);
  const setzeEinstellungen = useVorschau((s) => s.setzeEinstellungen);
  const schliessen = useVorschau((s) => s.schliessen);
  const merkeStelle = useVorschau((s) => s.merkeStelle);
  const modus = einstellungen.modus;

  const buch = useMemo(() => (daten ? buchAusProjekt(daten) : LEERES_BUCH), [daten]);
  const kapitelNach = useMemo(() => new Map(buch.kapitel.map((k) => [k.id, k])), [buch]);
  const satz = useMemo(() => buch.kapitel.map((k) => ({ id: k.id, html: kapitelHtml(k, modus), hash: `${k.hash}|${k.nummer}|${modus}` })), [buch, modus]);
  const satzNach = useMemo(() => new Map(satz.map((s) => [s.id, s])), [satz]);

  const wurzelRef = useRef<HTMLDivElement>(null);
  const buehneRef = useRef<HTMLDivElement>(null);
  const seitenRef = useRef<HTMLDivElement>(null);
  const messRef = useRef<HTMLDivElement>(null);
  const flaeche = useFlaeche(buehneRef);
  const schriftStand = useSchriftStand();
  const geo = useMemo<Geometrie | null>(() => {
    if (!flaeche) return null;
    return modus === 'buch'
      ? buchGeometrie(flaeche.b, flaeche.h)
      : ebookGeometrie(flaeche.b, flaeche.h, einstellungen.schriftstufe, einstellungen.zeilenabstand);
  }, [flaeche, modus, einstellungen.schriftstufe, einstellungen.zeilenabstand]);
  const doppel = geo?.art === 'buch' && geo.doppel;
  const spaltenJeSeite = geo?.art === 'ebook' ? geo.spalten : 1;
  const bereit = !!geo && schriftStand > 0;

  // --- Leseposition -------------------------------------------------------
  const ankerRef = useRef<Anker | null>(null);
  const [ort, setOrt] = useState<Ort>(() => {
    const id = startKapitel(buch, daten?.projekt.kapitel ?? [], start.kapitel);
    if (id) return { id, spalte: 0 };
    const letzte = useVorschau.getState().letzteStelle;
    if (!start.kapitel && letzte && (letzte.id === TITELEI || kapitelNach.has(letzte.id))) {
      ankerRef.current = letzte;
      return { id: letzte.id, spalte: 0 };
    }
    return { id: TITELEI, spalte: 0 };
  });
  const navigiere = useCallback((neu: Ort) => {
    ankerRef.current = null;
    setOrt(neu);
  }, []);

  // --- Spalten messen -----------------------------------------------------
  const [gemessen, setGemessen] = useState<{ schluessel: string; spalten: Map<string, number>; fertig: boolean } | null>(null);
  const messSchluessel = bereit && geo ? `${geo.schluessel}|${schriftStand}` : null;
  const ortIdRef = useRef(ort.id);
  ortIdRef.current = ankerRef.current?.id ?? ort.id;
  useEffect(() => {
    const host = messRef.current;
    if (!messSchluessel || !geo || !host) return;
    const i = satz.findIndex((s) => s.id === ortIdRef.current);
    const reihenfolge = i < 0 ? satz : [satz[i]!, ...satz.slice(i + 1, i + 2), ...satz.slice(Math.max(0, i - 1), i), ...satz.slice(0, Math.max(0, i - 1)), ...satz.slice(i + 2)];
    return vermessen(host, { schluessel: messSchluessel, fluss: geo.fluss, kapitel: reihenfolge, klasse: `pw-v-fluss--${geo.art}` }, (spalten, fertig) =>
      setGemessen({ schluessel: messSchluessel, spalten, fertig }),
    );
    // geo steckt im Schlüssel
  }, [messSchluessel, satz]);
  const spaltenNach = gemessen && gemessen.schluessel === messSchluessel ? gemessen.spalten : null;
  const messungFertig = !!gemessen?.fertig && gemessen.schluessel === messSchluessel;

  const plan = useMemo(() => {
    const eingaben: AbschnittEingabe[] = [];
    if (modus === 'buch') eingaben.push({ id: TITELEI, spalten: 1 });
    if (geo) {
      const jeSpalte = zeichenJeSpalte(geo.fluss);
      const kopf = modus === 'buch' ? 0.4 : 0.15;
      let korrektur = 1;
      if (spaltenNach) {
        let gem = 0;
        let schaetz = 0;
        for (const k of buch.kapitel) {
          const m = spaltenNach.get(k.id);
          if (m === undefined) continue;
          gem += m;
          schaetz += k.zeichen / jeSpalte + kopf;
        }
        if (gem > 0 && schaetz > 0) korrektur = gem / schaetz;
      }
      for (const k of buch.kapitel) {
        const m = spaltenNach?.get(k.id);
        const sp = m ?? Math.max(1, Math.round((k.zeichen / jeSpalte + kopf) * korrektur));
        eingaben.push({ id: k.id, spalten: Math.ceil(sp / spaltenJeSeite), geschaetzt: m === undefined });
      }
    }
    return erstellePlan(eingaben, { rechts: modus === 'buch' });
  }, [modus, geo, buch, spaltenNach, spaltenJeSeite]);

  const aktuell = useRef({ plan, ort, doppel });
  aktuell.current = { plan, ort, doppel };
  const blaetternNach = useCallback(
    (r: 1 | -1) => {
      const { plan: p, ort: o, doppel: d } = aktuell.current;
      if (p.gesamt === 0) return;
      const neu = blaettern(p, o, r, d);
      if (neu === o) return;
      // sofort fortschreiben: mehrere Tastendrücke vor dem nächsten Zeichnen zählen alle
      aktuell.current = { ...aktuell.current, ort: neu };
      navigiere(neu);
    },
    [navigiere],
  );

  // --- Satz-Elemente der sichtbaren Seiten ---------------------------------
  const fluesse = useRef(new Map<string, HTMLElement>());
  const registrieren = useCallback((slot: string, el: HTMLElement | null) => {
    if (el) fluesse.current.set(slot, el);
    else fluesse.current.delete(slot);
  }, []);
  const flussFuer = (id: string): HTMLElement | null => {
    for (const el of fluesse.current.values()) if (el.dataset.abschnitt === id && el.isConnected) return el;
    return null;
  };

  // Neuberechnung (Größe, Schrift, Modus, Text des Ankerkapitels): Seite mit dem Anker zeigen
  const ankerSatz = ankerRef.current ? satzNach.get(ankerRef.current.id)?.hash : undefined;
  const signatur = bereit && geo ? `${geo.schluessel}|${schriftStand}|${modus}|${ankerRef.current?.id ?? ''}|${ankerSatz ?? ''}` : '';
  const letzteSignatur = useRef('');
  useLayoutEffect(() => {
    if (!signatur || !geo || signatur === letzteSignatur.current) return;
    letzteSignatur.current = signatur;
    if (!ankerRef.current) return;
    const stand = nachNeuberechnung({ ort, anker: ankerRef.current }, plan, (a) => {
      if (a.id === TITELEI) return 0;
      const el = flussFuer(a.id);
      if (!el) return null;
      return Math.floor(spalteVonAnker(el, geo.fluss, a.block, a.zeichen) / spaltenJeSeite);
    });
    if (stand.ort !== ort) setOrt(stand.ort);
  });

  // Nach dem Blättern: Textanfang der Seite als neuen Anker merken
  useLayoutEffect(() => {
    if (!bereit || !geo || ankerRef.current || plan.gesamt === 0) return;
    const haupt = hauptseite(plan, ort, doppel);
    if (!haupt || haupt.art !== 'inhalt') return;
    if (haupt.ort.id === TITELEI) {
      ankerRef.current = { id: TITELEI, block: 0, zeichen: 0 };
      return;
    }
    const el = flussFuer(haupt.ort.id);
    if (!el) return;
    ankerRef.current = { id: haupt.ort.id, ...ankerVonSpalte(el, geo.fluss, haupt.ort.spalte * spaltenJeSeite) };
  });

  // erneuter Aufruf von oeffneVorschau(kapitel) bei offener Vorschau
  const startNr = useRef(start.nr);
  useEffect(() => {
    if (start.nr === startNr.current) return;
    startNr.current = start.nr;
    const id = startKapitel(buch, daten?.projekt.kapitel ?? [], start.kapitel);
    if (id) navigiere({ id, spalte: 0 });
  }, [start, buch, daten, navigiere]);

  // Stelle für das nächste Öffnen merken
  useEffect(() => () => merkeStelle(ankerRef.current), [merkeStelle]);

  // --- Panels, Modus ------------------------------------------------------
  const [panel, setPanel] = useState<null | 'inhalt' | 'darstellung'>(null);
  const panelSchliessen = useCallback(() => {
    setPanel(null);
    wurzelRef.current?.focus();
  }, []);

  const setzeModus = (m: VorschauModus) => {
    if (m === modus) return;
    let a = ankerRef.current;
    if (a?.id === TITELEI && m === 'ebook') a = buch.kapitel[0] ? { id: buch.kapitel[0].id, block: 0, zeichen: 0 } : null;
    ankerRef.current = a;
    if (a) setOrt({ id: a.id, spalte: 0 });
    if (panel === 'darstellung') setPanel(null);
    setzeEinstellungen({ modus: m });
  };

  // --- Fokus, Tastatur, Rad ----------------------------------------------
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    wurzelRef.current?.focus();
    return () => {
      if (vorher && vorher !== document.body && document.contains(vorher)) vorher.focus();
    };
  }, []);

  const panelRef = useRef(panel);
  panelRef.current = panel;
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const wurzel = wurzelRef.current;
      const ziel = e.target instanceof HTMLElement ? e.target : null;
      if (!wurzel || !ziel) return;
      const innen = wurzel.contains(ziel);
      if (!innen && ziel !== document.body && ziel !== document.documentElement) return;
      const aktion = tastenAktion(e);
      if (!aktion) return;
      if (aktion === 'schliessen') {
        e.preventDefault();
        if (panelRef.current) panelSchliessen();
        else schliessen();
        return;
      }
      if (panelRef.current) return;
      if (ziel.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Leertaste auf einem Knopf löst den Knopf aus
      if (e.key === ' ' && ziel.closest('button')) return;
      e.preventDefault();
      const { plan: p } = aktuell.current;
      if (p.gesamt === 0) return;
      if (aktion === 'vor') blaetternNach(1);
      else if (aktion === 'zurueck') blaetternNach(-1);
      else if (aktion === 'anfang') navigiere(anfang(p));
      else if (aktion === 'ende') navigiere(ende(p));
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [blaetternNach, navigiere, panelSchliessen, schliessen]);

  // Trackpad wischen / Mausrad: eine Geste = eine Seite
  useEffect(() => {
    const el = buehneRef.current;
    if (!el) return;
    let summe = 0;
    let gesperrt = false;
    let zeit: ReturnType<typeof setTimeout> | undefined;
    const rad = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      clearTimeout(zeit);
      zeit = setTimeout(() => {
        gesperrt = false;
        summe = 0;
      }, 180);
      if (gesperrt) return;
      summe += e.deltaMode === 1 ? d * 16 : d;
      if (Math.abs(summe) >= 40) {
        blaetternNach(summe > 0 ? 1 : -1);
        gesperrt = true;
        summe = 0;
      }
    };
    el.addEventListener('wheel', rad, { passive: false });
    return () => {
      el.removeEventListener('wheel', rad);
      clearTimeout(zeit);
    };
  }, [blaetternNach]);

  const fokusFalle = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !wurzelRef.current) return;
    const liste = Array.from(wurzelRef.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR)).filter((el) => !el.closest('[aria-hidden="true"]'));
    if (liste.length === 0) return;
    const erstes = liste[0]!;
    const letztes = liste[liste.length - 1]!;
    if (e.shiftKey && (document.activeElement === erstes || document.activeElement === wurzelRef.current)) {
      e.preventDefault();
      letztes.focus();
    } else if (!e.shiftKey && document.activeElement === letztes) {
      e.preventDefault();
      erstes.focus();
    }
  };

  /** Knöpfe der Leisten nehmen beim Klicken keinen Fokus (Leertaste blättert weiter). */
  const ohneFokus = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault();
  };

  const klickRand = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !geo) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const auswahl = window.getSelection?.();
    if (auswahl && !auswahl.isCollapsed) return;
    const box = seitenRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const rand = geo.art === 'buch' ? Math.max(28, geo.rand.aussen) : Math.max(36, Math.min(120, box.width * 0.12));
    if (e.clientX < box.left + rand) blaetternNach(-1);
    else if (e.clientX > box.right - rand) blaetternNach(1);
  };

  // --- Anzeige ------------------------------------------------------------
  const leer = plan.gesamt === 0;
  const haupt = leer ? null : hauptseite(plan, ort, doppel);
  const hauptKapitel = haupt ? kapitelNach.get(haupt.ort.id) : undefined;
  const kontext = haupt?.ort.id === TITELEI ? 'Titelseite' : hauptKapitel ? `Kap. ${hauptKapitel.nummer} · ${hauptKapitel.titel}` : '';
  const sichtbar = leer ? [] : sichtbareSeiten(plan, ort, doppel);
  const amAnfang = leer || blaettern(plan, ort, -1, doppel) === ort;
  const amEnde = leer || blaettern(plan, ort, 1, doppel) === ort;
  const anteil = leer ? 0 : fortschritt(plan, ort, doppel);
  const prozent = Math.round(anteil * 100);
  const ca = plan.geschaetzt || !messungFertig ? 'ca. ' : '';

  let seitenText = '';
  if (!leer && geo?.art === 'buch') {
    const nummern = sichtbar.filter((s) => !!s).map((s) => s!.seite);
    const von = `von ${ca}${plan.gesamt}`;
    seitenText = nummern.length === 2 ? `Seite ${nummern[0]}–${nummern[1]} ${von}` : `Seite ${nummern[0] ?? 1} ${von}`;
  } else if (!leer && haupt) {
    const a = plan.abschnitte[plan.index.get(haupt.ort.id) ?? 0];
    const im = a?.geschaetzt ? 'ca. ' : '';
    seitenText = `Seite ${haupt.ort.spalte + 1} von ${im}${a?.spalten ?? 1} im Kapitel`;
  }

  const seitenBreite = geo?.art === 'buch' ? (geo.doppel ? 2 * geo.seiteBreite : geo.seiteBreite) : geo?.art === 'ebook' ? geo.breite : 0;
  const randBreite = flaeche ? Math.max(44, Math.floor((flaeche.b - seitenBreite) / 2)) : 44;

  const tauri = istTauri();
  return createPortal(
    <div
      ref={wurzelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Buch-Vorschau"
      tabIndex={-1}
      className={klassen('pw-vorschau', `pw-vorschau--${modus}`, !tauri && 'pw-vorschau--browser')}
      data-hintergrund={modus === 'ebook' ? einstellungen.hintergrund : undefined}
      onKeyDown={fokusFalle}
    >
      <header className="pw-v-leiste" data-tauri-drag-region onMouseDown={ohneFokus}>
        {tauri && <span className="pw-v-leiste__ampel" data-tauri-drag-region />}
        <Segment<VorschauModus>
          rolle="group"
          label="Ansicht"
          groesse="klein"
          hintergrund="selected"
          voll={false}
          optionen={[
            { wert: 'buch', label: 'Buch' },
            { wert: 'ebook', label: 'E-Book' },
          ]}
          wert={modus}
          onChange={setzeModus}
        />
        <span className="pw-v-leiste__titel" data-tauri-drag-region>
          {buch.titel}
        </span>
        {kontext && (
          <span className="pw-v-leiste__kontext" data-tauri-drag-region>
            {kontext}
          </span>
        )}
        <span className="pw-v-leiste__fueller" data-tauri-drag-region />
        <Button
          data-panel-knopf
          icon={<IconKapitel size={14} />}
          aria-expanded={panel === 'inhalt'}
          onClick={() => (panel === 'inhalt' ? panelSchliessen() : setPanel('inhalt'))}
        >
          Inhalt
        </Button>
        {modus === 'ebook' && (
          <Button data-panel-knopf aria-expanded={panel === 'darstellung'} onClick={() => (panel === 'darstellung' ? panelSchliessen() : setPanel('darstellung'))}>
            <span className="pw-v-aa" aria-hidden="true">
              Aa
            </span>
            Darstellung
          </Button>
        )}
        <Button onClick={schliessen} title="Schließen (Esc)">
          Schließen
        </Button>
      </header>

      <div className="pw-v-buehne" ref={buehneRef} onClick={klickRand}>
        {bereit && geo && leer && <p className="pw-v-leer">Noch kein Kapitel mit Text – die Vorschau zeigt nur geschriebenen Text.</p>}
        {bereit && geo?.art === 'buch' && !leer && (
          <div ref={seitenRef} className={klassen('pw-v-seiten', geo.doppel && 'pw-v-seiten--doppel')} style={{ width: seitenBreite, height: geo.seiteHoehe }}>
            {sichtbar.map((info, i) => {
              const id = info?.ort.id ?? '';
              const doppelt = i === 1 && !!info && sichtbar[0]?.ort.id === id;
              return (
                <BuchSeite
                  key={geo.doppel ? (i === 0 ? 'l' : 'r') : 'e'}
                  slot={geo.doppel ? (i === 0 ? 'l' : 'r') : 'e'}
                  seite={info?.seite ?? 0}
                  id={id}
                  spalte={info?.ort.spalte ?? 0}
                  leer={info?.art === 'leer'}
                  anfang={!!info?.anfang}
                  geo={geo}
                  buchTitel={buch.titel}
                  kapitel={kapitelNach.get(id)}
                  html={satzNach.get(id)?.html}
                  verborgen={doppelt}
                  registrieren={registrieren}
                />
              );
            })}
          </div>
        )}
        {bereit && geo?.art === 'ebook' && !leer && haupt && (
          <EbookFlaeche refFlaeche={seitenRef} geo={geo} id={haupt.ort.id} spalte={haupt.ort.spalte} html={satzNach.get(haupt.ort.id)?.html} registrieren={registrieren} />
        )}
        {!leer && bereit && (
          <>
            <button type="button" className="pw-v-pfeil pw-v-pfeil--zurueck" style={{ width: randBreite }} aria-label="Vorige Seite" disabled={amAnfang} onMouseDown={ohneFokus} onClick={() => blaetternNach(-1)}>
              <Pfeil richtung="links" />
            </button>
            <button type="button" className="pw-v-pfeil pw-v-pfeil--vor" style={{ width: randBreite }} aria-label="Nächste Seite" disabled={amEnde} onMouseDown={ohneFokus} onClick={() => blaetternNach(1)}>
              <Pfeil richtung="rechts" />
            </button>
          </>
        )}
      </div>

      <footer className="pw-v-fuss">
        <span className="pw-v-fuss__text" aria-live="polite">
          {seitenText}
        </span>
        <span className="pw-v-fortschritt" role="progressbar" aria-label="Fortschritt im Buch" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent}>
          <span style={{ width: `${prozent}%` }} />
        </span>
        <span className="pw-v-fuss__prozent">{leer ? '' : `${prozent} %`}</span>
      </footer>

      {panel === 'inhalt' && (
        <Inhaltsverzeichnis
          buch={buch}
          plan={plan}
          aktuell={hauptKapitel?.id ?? null}
          seitenZeigen={modus === 'buch'}
          waehle={(id) => {
            navigiere({ id, spalte: 0 });
            panelSchliessen();
          }}
          schliessen={panelSchliessen}
        />
      )}
      {panel === 'darstellung' && modus === 'ebook' && <Darstellung schliessen={panelSchliessen} />}
      <div ref={messRef} className="pw-v-messung" aria-hidden="true" />
    </div>,
    document.body,
  );
}

function EbookFlaeche({
  refFlaeche,
  geo,
  id,
  spalte,
  html,
  registrieren,
}: {
  refFlaeche: RefObject<HTMLDivElement>;
  geo: EbookGeometrie;
  id: string;
  spalte: number;
  html: string | undefined;
  registrieren(slot: string, el: HTMLElement | null): void;
}) {
  return (
    <div ref={refFlaeche} className="pw-v-ebook" style={{ width: geo.breite, height: geo.fluss.hoehe }}>
      {html && (
        <SatzFenster slot="e" id={id} html={html} fluss={geo.fluss} spalte={spalte * geo.spalten} breite={geo.breite} links={0} oben={0} klasse="pw-v-fluss--ebook" registrieren={registrieren} />
      )}
    </div>
  );
}
