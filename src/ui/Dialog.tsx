import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconSchliessen } from './Icons';
import { klassen } from './klassen';

export interface DialogProps {
  titel: ReactNode;
  onSchliessen(): void;
  children: ReactNode;
  /** Knöpfe unten rechts */
  aktionen?: ReactNode;
  /** Breite in px, Standard 520 */
  breite?: number;
  /** oben statt mittig (Schnellsuche) */
  oben?: boolean;
  /** Titel nur für Screenreader (eigener Kopf im Inhalt) */
  titelVersteckt?: boolean;
  /** Klick auf den Hintergrund schließt nicht (z. B. während eines Imports) */
  modalFest?: boolean;
  /**
   * Kennung der gezeigten Dialogseite (z. B. „start“ | „laeuft“ | „ergebnis“). Wechselt sie, kommt der Fokus zurück
   * in den Dialog ([data-autofocus], sonst der Dialog selbst) – sonst ginge er mit dem verschwundenen Knopf an den
   * Hintergrund verloren und Tab begänne außerhalb.
   */
  seite?: string;
  className?: string;
}

const FOKUSSIERBAR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modaler Dialog (Radius 12). Escape schließt, Fokus bleibt im Dialog und kehrt danach zurück. */
export function Dialog({ titel, onSchliessen, children, aktionen, breite = 520, oben, titelVersteckt, modalFest, seite, className }: DialogProps) {
  const titelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const schliessen = useRef(onSchliessen);
  schliessen.current = onSchliessen;

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const erstes = el?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? el?.querySelector<HTMLElement>(FOKUSSIERBAR);
    (erstes ?? el)?.focus();
    return () => {
      if (vorher && document.contains(vorher)) vorher.focus();
    };
  }, []);

  // Seitenwechsel im Dialog: der fokussierte Knopf der alten Seite ist weg (Fokus am Hintergrund) oder React hat
  // den Knoten mit anderer Bedeutung weiterverwendet („Simulation starten“ → „Abbrechen“) → Fokus neu auf den Dialog.
  const ersteSeite = useRef(seite);
  useEffect(() => {
    if (seite === undefined || seite === ersteSeite.current) return;
    ersteSeite.current = seite;
    const el = ref.current;
    if (!el) return;
    (el.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? el).focus();
  }, [seite]);

  // Escape auch dann, wenn der Fokus verloren ging (z. B. der fokussierte Knopf verschwand beim Wechsel der
  // Dialogseite) – nur für den obersten Dialog.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || e.defaultPrevented || !el || el.contains(document.activeElement)) return;
      const dialoge = document.querySelectorAll('.pw-dialog');
      if (dialoge[dialoge.length - 1] !== el) return;
      const aktiv = document.activeElement;
      if (aktiv && aktiv !== document.body && aktiv.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      schliessen.current();
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, []);

  return createPortal(
    <div
      className={klassen('pw-dialog-hintergrund', oben && 'pw-dialog-hintergrund--oben')}
      onMouseDown={(e) => {
        if (!modalFest && e.target === e.currentTarget) schliessen.current();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        className={klassen('pw-dialog', className)}
        style={{ width: breite }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            schliessen.current();
            return;
          }
          if (e.key !== 'Tab' || !ref.current) return;
          const liste = [...ref.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR)];
          if (liste.length === 0) return;
          const erstes = liste[0]!;
          const letztes = liste[liste.length - 1]!;
          if (e.shiftKey && document.activeElement === erstes) {
            e.preventDefault();
            letztes.focus();
          } else if (!e.shiftKey && document.activeElement === letztes) {
            e.preventDefault();
            erstes.focus();
          }
        }}
      >
        {titelVersteckt ? (
          <h2 id={titelId} className="pw-sr">
            {titel}
          </h2>
        ) : (
          <div className="pw-dialog__kopf">
            <h2 id={titelId} className="pw-dialog__titel">
              {titel}
            </h2>
            <button type="button" className="pw-dialog__schliessen" aria-label="Schließen" onClick={() => schliessen.current()}>
              <IconSchliessen size={14} />
            </button>
          </div>
        )}
        <div className="pw-dialog__inhalt">{children}</div>
        {aktionen && <div className="pw-dialog__fuss">{aktionen}</div>}
      </div>
    </div>,
    document.body,
  );
}
