/**
 * Kleine Leiste über markiertem Text: Fett, Kursiv, Überschrift/Absatz (S-02), Notiz (S-06) und
 * Realitätsebene der Stelle (gesichert, noch offen, bewusst vage).
 *
 * Verhalten:
 * - erscheint nach dem Loslassen der Maus sofort, bei Auswahl per Tastatur kurz nach der letzten Änderung;
 * - bleibt im sichtbaren Teil des Papiers: waagerecht geklemmt (gemessene Breite), klappt unter die Auswahl,
 *   wenn oben kein Platz ist, und misst bei Größenänderung, Fokus-Modus und Scrollen neu;
 * - Escape schließt erst ein offenes Panel, dann die Leiste (bis zur nächsten Auswahländerung);
 * - ⌥F10 holt den Fokus in die Leiste, ←/→ wandern, Escape kehrt in den Text zurück;
 * - Panels (z. B. „Gewissheit“) klappen unter der Leiste auf und dürfen eigene Eingabefelder haben.
 */
import type { Realitaet } from '@core/model/types';
import { AllSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTexte } from '../../i18n';
import { REALITAET_FARBE } from '../../ui';

interface Lage {
  /** Mitte der Leiste, in Koordinaten des Papier-Inhalts */
  x: number;
  /** oben: Unterkante der Leiste; unten: Oberkante der Leiste */
  y: number;
  /** Leiste steht unter der Auswahl (oben kein Platz) */
  unten: boolean;
  /** ganze Auswahl (⌘A): nur Fett und Kursiv */
  alles: boolean;
  fett: boolean;
  kursiv: boolean;
  ueberschrift: boolean;
  /** Breite, mit der geklemmt wurde (stimmt sie nicht, wird neu gemessen) */
  breite: number;
}

const STUFEN: Realitaet[] = ['gesichert', 'offen', 'bewusst_vage'];

/** Wartezeit nach der letzten Auswahländerung per Tastatur (Shift+Pfeil), bevor die Leiste erscheint. */
export const BLASE_VERZOEGERUNG_MS = 350;

/** Abstand der Leiste zur Auswahl und zum Rand des Papiers */
const ABSTAND = 8;
/** Annahmen, solange die Leiste noch nicht gemessen ist */
const BREITE_ANNAHME = 260;
const HOEHE_ANNAHME = 32;

/** Event am Papier: Kapitel neu geladen o. Ä. – Leiste schließen (der Editor lädt ohne Transaktion). */
export const BLASE_SCHLIESSEN = 'pw-blase-schliessen';

/** Zusätzliches Panel der Leiste (Phase 2: Figur/Spitzname). */
export interface BlasenPanel {
  id: string;
  knopf: string;
  titel: string;
  /** nicht bei ganzer Auswahl (⌘A) */
  nurStelle?: boolean;
  /** Knopf nur zeigen, wenn die Auswahl passt (wird bei jeder Anzeige neu gefragt) */
  zeigen?(): boolean;
  inhalt(schliessen: () => void): ReactNode;
}

function lageGleich(a: Lage | null, b: Lage): boolean {
  return !!a && (Object.keys(b) as (keyof Lage)[]).every((k) => a[k] === b[k]);
}

export function Blase({
  editor,
  papierRef,
  onNotiz,
  onEbene,
  panels = [],
}: {
  editor: Editor;
  papierRef: RefObject<HTMLDivElement | null>;
  onNotiz(): void;
  onEbene(stufe: Realitaet): void;
  panels?: BlasenPanel[];
}) {
  const [lage, setLage] = useState<Lage | null>(null);
  /** offenes Panel: 'ebene' oder die id eines zusätzlichen Panels */
  const [panel, setPanel] = useState<string | null>(null);
  const [versatz, setVersatz] = useState(0);
  const t = useTexte();
  const T = t.schreiben.blase;
  const blaseRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const neuMessen = useRef<() => void>(() => {});
  const sichtbar = useRef(false);
  sichtbar.current = lage !== null;

  useEffect(() => {
    let rahmen = 0;
    let warten = 0;
    /** Maustaste gedrückt: Auswahl ist noch nicht fertig, Leiste bleibt weg (erst nach dem Loslassen). */
    let maus = false;
    /** mit Escape geschlossen: bleibt zu bis zur nächsten Auswahländerung */
    let zu = false;
    const timerWeg = () => {
      if (warten) window.clearTimeout(warten);
      warten = 0;
    };
    const verstecken = () => {
      timerWeg();
      setLage(null);
      setPanel(null);
    };
    const fokusInBlase = () => !!blaseRef.current && blaseRef.current.contains(document.activeElement);
    const messen = (nachFokuswechsel = false) => {
      rahmen = 0;
      const papier = papierRef.current;
      const { selection } = editor.state;
      const alles = selection instanceof AllSelection;
      // Während eines Fokuswechsels (Text → Leiste) ist kurz keins von beiden fokussiert: danach noch einmal prüfen
      if (!nachFokuswechsel && sichtbar.current && !editor.isFocused && !fokusInBlase()) {
        queueMicrotask(() => messen(true));
        return;
      }
      if (
        maus ||
        zu ||
        !papier ||
        editor.isDestroyed ||
        selection.empty ||
        !(editor.isFocused || fokusInBlase()) ||
        (!alles && !selection.$from.parent.inlineContent)
      ) {
        setLage(null);
        setPanel(null);
        return;
      }
      try {
        const von = alles ? Math.min(1, selection.to) : selection.from;
        const bis = alles ? von : selection.to;
        const start = editor.view.coordsAtPos(von);
        const ende = editor.view.coordsAtPos(bis);
        const r = papier.getBoundingClientRect();
        const breite = blaseRef.current?.offsetWidth || BREITE_ANNAHME;
        const hoehe = blaseRef.current?.offsetHeight || HOEHE_ANNAHME;
        const gleicheZeile = Math.abs(start.top - ende.top) < 4;
        const mitte = (gleicheZeile ? (start.left + ende.left) / 2 : start.left + 60) - r.left;
        // waagerecht: ganz im Papier (Papier schneidet seitlich ab)
        const innen = papier.clientWidth || r.width;
        const min = breite / 2 + ABSTAND;
        const max = innen - breite / 2 - ABSTAND;
        const x = max >= min ? Math.max(min, Math.min(mitte, max)) : innen / 2;
        // senkrecht: über der Auswahl; sonst darunter; Auswahl beginnt oberhalb des sichtbaren Teils → oben im Bild
        let y: number;
        let unten: boolean;
        if (start.top < r.top) {
          y = papier.scrollTop + ABSTAND;
          unten = true;
        } else if (start.top - r.top >= hoehe + 2 * ABSTAND) {
          y = start.top - r.top + papier.scrollTop - ABSTAND;
          unten = false;
        } else {
          y = (gleicheZeile ? ende.bottom : start.bottom) - r.top + papier.scrollTop + ABSTAND;
          unten = true;
        }
        const neu: Lage = {
          x,
          y,
          unten,
          alles,
          fett: editor.isActive('bold'),
          kursiv: editor.isActive('italic'),
          ueberschrift: editor.isActive('heading'),
          breite,
        };
        setLage((alt) => (lageGleich(alt, neu) ? alt : neu));
      } catch {
        setLage(null);
      }
    };
    const planen = () => {
      if (!rahmen) rahmen = requestAnimationFrame(() => messen());
    };
    neuMessen.current = planen;
    const spaeter = () => {
      timerWeg();
      warten = window.setTimeout(() => {
        warten = 0;
        planen();
      }, BLASE_VERZOEGERUNG_MS);
    };
    const verbergen = ({ event }: { event: FocusEvent }) => {
      const ziel = event.relatedTarget as Node | null;
      if (ziel && blaseRef.current?.contains(ziel)) return;
      // relatedTarget fehlt nicht selten (z. B. bei focus() aus Code): erst nach dem Fokuswechsel entscheiden
      queueMicrotask(() => {
        if (!fokusInBlase() && !editor.isFocused) verstecken();
      });
    };
    // Auswahl ändert sich: Leiste ausblenden und erst zeigen, wenn die Auswahl fertig ist
    // (Maus losgelassen bzw. kurz nach der letzten Tastatur-Änderung).
    const neueAuswahl = () => {
      zu = false;
      verstecken();
      if (!maus) spaeter();
    };
    // Formatieren (fett, kursiv …) oder neue Dekorationen bei sichtbarer Leiste: nur neu ausrichten
    const nachTransaktion = () => {
      if (sichtbar.current && !maus) planen();
    };
    const imBlase = (e: Event) => !!blaseRef.current && e.target instanceof Node && blaseRef.current.contains(e.target);
    const mausRunter = (e: MouseEvent) => {
      if (e.button !== 0 || imBlase(e)) return;
      maus = true;
      verstecken();
    };
    const mausHoch = () => {
      if (!maus) return;
      maus = false;
      planen();
    };
    // Maustaste außerhalb des Fensters losgelassen: Merker beim nächsten Bewegen ohne Taste lösen
    const mausBewegt = (e: MouseEvent) => {
      if (maus && e.buttons === 0) mausHoch();
    };
    const fensterWeg = () => {
      maus = false;
    };
    const tasteHoch = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && warten) {
        timerWeg();
        planen();
      }
    };
    const tasteRunter = (e: KeyboardEvent) => {
      // ⌥F10: in die Leiste (übliche Taste für Werkzeugleisten von Editoren)
      if (e.altKey && e.key === 'F10' && sichtbar.current) {
        e.preventDefault();
        blaseRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    // Escape vor allen anderen (z. B. Fokus-Modus beenden): erst Panel, dann Leiste
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sichtbar.current || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (panelRef.current) {
        const imPanel = panelRef.current.contains(document.activeElement);
        setPanel(null);
        if (imPanel) editor.commands.focus();
        return;
      }
      zu = true;
      verstecken();
      if (fokusInBlase()) editor.commands.focus();
    };
    const schliessen = () => {
      zu = false;
      verstecken();
    };
    const papier = papierRef.current;
    const dom = editor.view.dom as HTMLElement;
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sichtbar.current && planen());
    beobachter?.observe(dom);
    if (papier) beobachter?.observe(papier);
    const beiGroesse = () => sichtbar.current && planen();
    papier?.addEventListener('mousedown', mausRunter);
    papier?.addEventListener('scroll', beiGroesse, { passive: true });
    papier?.addEventListener(BLASE_SCHLIESSEN, schliessen);
    dom.addEventListener('keyup', tasteHoch);
    dom.addEventListener('keydown', tasteRunter);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('mouseup', mausHoch);
    window.addEventListener('mousemove', mausBewegt);
    window.addEventListener('blur', fensterWeg);
    window.addEventListener('resize', beiGroesse);
    editor.on('selectionUpdate', neueAuswahl);
    editor.on('focus', spaeter);
    editor.on('blur', verbergen);
    editor.on('transaction', nachTransaktion);
    return () => {
      beobachter?.disconnect();
      papier?.removeEventListener('mousedown', mausRunter);
      papier?.removeEventListener('scroll', beiGroesse);
      papier?.removeEventListener(BLASE_SCHLIESSEN, schliessen);
      dom.removeEventListener('keyup', tasteHoch);
      dom.removeEventListener('keydown', tasteRunter);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('mouseup', mausHoch);
      window.removeEventListener('mousemove', mausBewegt);
      window.removeEventListener('blur', fensterWeg);
      window.removeEventListener('resize', beiGroesse);
      editor.off('selectionUpdate', neueAuswahl);
      editor.off('focus', spaeter);
      editor.off('blur', verbergen);
      editor.off('transaction', nachTransaktion);
      if (rahmen) cancelAnimationFrame(rahmen);
      timerWeg();
    };
  }, [editor, papierRef]);

  // Erste Anzeige mit angenommener Breite: gemessene Breite weicht ab → neu klemmen
  useLayoutEffect(() => {
    const b = blaseRef.current?.offsetWidth;
    if (lage && b && Math.abs(b - lage.breite) > 1) neuMessen.current();
  }, [lage]);

  // Panel mit Eingabefeld: Fokus hinein, sonst landet Getipptes im Text und ersetzt die Markierung
  useEffect(() => {
    if (!panel || panel === 'ebene') return;
    const feld = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>('input, select, textarea');
    feld?.focus();
  }, [panel]);

  // Panel im Papier halten (es ist oft breiter als die Leiste)
  useLayoutEffect(() => {
    const p = panelRef.current;
    const papier = papierRef.current;
    if (!p || !papier || !lage) {
      setVersatz(0);
      return;
    }
    const breite = p.offsetWidth;
    const innen = papier.clientWidth;
    if (!breite || !innen) return;
    const links = lage.x - breite / 2;
    const rechts = lage.x + breite / 2;
    setVersatz(links < ABSTAND ? ABSTAND - links : rechts > innen - ABSTAND ? innen - ABSTAND - rechts : 0);
  }, [panel, lage, papierRef]);

  if (!lage) return null;

  const knoepfe = () => Array.from(blaseRef.current?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? []);
  const tasten = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    const liste = knoepfe();
    const i = liste.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      liste[(i + (e.key === 'ArrowRight' ? 1 : liste.length - 1)) % liste.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      liste[e.key === 'Home' ? 0 : liste.length - 1]?.focus();
    }
  };
  // Klicks in die Leiste nehmen dem Text den Fokus nicht – außer in Eingabefelder eines Panels
  const mausRunter = (e: ReactMouseEvent) => {
    const ziel = e.target as HTMLElement;
    if (!ziel.closest('input, textarea, select')) e.preventDefault();
  };
  const umschalten = (id: string) => setPanel((x) => (x === id ? null : id));
  const schliessen = () => setPanel(null);
  const sichtbarePanels = panels.filter((p) => !(lage.alles && p.nurStelle) && (p.zeigen?.() ?? true));
  const zusatz = sichtbarePanels.find((p) => p.id === panel);

  return (
    <div
      ref={blaseRef}
      className={`pw-s-blase${lage.unten ? ' pw-s-blase--unten' : ''}`}
      role="toolbar"
      aria-label={T.label}
      aria-keyshortcuts="Alt+F10"
      style={{ top: lage.y, left: lage.x }}
      onMouseDown={mausRunter}
      onKeyDown={tasten}
    >
      <button type="button" aria-pressed={lage.fett} title={T.fett} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>{T.fettZeichen}</strong>
      </button>
      <button type="button" aria-pressed={lage.kursiv} title={T.kursiv} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em style={{ fontFamily: 'var(--schrift-text)' }}>{T.kursivZeichen}</em>
      </button>
      {!lage.alles && (
        <>
          <button
            type="button"
            aria-pressed={lage.ueberschrift}
            aria-label={T.ueberschrift}
            title={lage.ueberschrift ? T.absatzTitel : T.ueberschriftTitel}
            onClick={() => (lage.ueberschrift ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: 2 }).run())}
          >
            {T.ueberschriftZeichen}
          </button>
          <span className="pw-s-blase__trenner" aria-hidden="true" />
          <button type="button" title={T.notizTitel} onClick={onNotiz}>
            {T.notiz}
          </button>
          <button type="button" aria-expanded={panel === 'ebene'} title={T.ebeneTitel} onClick={() => umschalten('ebene')}>
            {T.ebene}
          </button>
        </>
      )}
      {sichtbarePanels.map((p) => (
        <button key={p.id} type="button" aria-expanded={panel === p.id} title={p.titel} onClick={() => umschalten(p.id)}>
          {p.knopf}
        </button>
      ))}
      {panel === 'ebene' && !lage.alles && (
        <div ref={panelRef} className="pw-s-blase__panel" role="group" aria-label={T.ebenenLabel} style={{ ['--versatz' as string]: `${versatz}px` }}>
          {STUFEN.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPanel(null);
                onEbene(s);
              }}
            >
              <span className="pw-s-blase__punkt" style={{ background: REALITAET_FARBE[s] }} aria-hidden="true" />
              {t.gemeinsam.realitaet[s]}
            </button>
          ))}
        </div>
      )}
      {zusatz && (
        <div ref={panelRef} className="pw-s-blase__panel pw-s-blase__panel--spalte" role="group" aria-label={zusatz.titel} style={{ ['--versatz' as string]: `${versatz}px` }}>
          {zusatz.inhalt(schliessen)}
        </div>
      )}
    </div>
  );
}
