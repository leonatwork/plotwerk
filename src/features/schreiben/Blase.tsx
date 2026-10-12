/**
 * Kleine Leiste über markiertem Text: Fett, Kursiv, Überschrift/Absatz (S-02), Notiz (S-06) und
 * Realitätsebene der Stelle (gesichert, noch offen, bewusst vage).
 */
import type { Realitaet } from '@core/model/types';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTexte } from '../../i18n';
import { REALITAET_FARBE } from '../../ui';

interface Lage {
  top: number;
  left: number;
  fett: boolean;
  kursiv: boolean;
  ueberschrift: boolean;
}

const STUFEN: Realitaet[] = ['gesichert', 'offen', 'bewusst_vage'];

/** Wartezeit nach der letzten Auswahländerung per Tastatur (Shift+Pfeil), bevor die Leiste erscheint. */
export const BLASE_VERZOEGERUNG_MS = 350;

export function Blase({
  editor,
  papierRef,
  onNotiz,
  onEbene,
}: {
  editor: Editor;
  papierRef: RefObject<HTMLDivElement | null>;
  onNotiz(): void;
  onEbene(stufe: Realitaet): void;
}) {
  const [lage, setLage] = useState<Lage | null>(null);
  const [ebenen, setEbenen] = useState(false);
  const t = useTexte();
  const T = t.schreiben.blase;
  const sichtbar = useRef(false);
  sichtbar.current = lage !== null;

  useEffect(() => {
    let rahmen = 0;
    let warten = 0;
    /** Maustaste gedrückt: Auswahl ist noch nicht fertig, Leiste bleibt weg (erst nach dem Loslassen). */
    let maus = false;
    const verstecken = () => {
      if (warten) window.clearTimeout(warten);
      warten = 0;
      setLage(null);
    };
    const messen = () => {
      rahmen = 0;
      const papier = papierRef.current;
      const { selection } = editor.state;
      if (maus || !papier || selection.empty || !editor.isFocused || editor.isDestroyed || !selection.$from.parent.inlineContent) {
        setLage(null);
        return;
      }
      try {
        const start = editor.view.coordsAtPos(selection.from);
        const ende = editor.view.coordsAtPos(selection.to);
        const r = papier.getBoundingClientRect();
        const gleicheZeile = Math.abs(start.top - ende.top) < 4;
        const mitte = gleicheZeile ? (start.left + ende.left) / 2 : start.left + 60;
        const neu: Lage = {
          top: start.top - r.top + papier.scrollTop,
          left: Math.max(70, Math.min(mitte - r.left, r.width - 90)),
          fett: editor.isActive('bold'),
          kursiv: editor.isActive('italic'),
          ueberschrift: editor.isActive('heading'),
        };
        setLage((alt) =>
          alt && alt.top === neu.top && alt.left === neu.left && alt.fett === neu.fett && alt.kursiv === neu.kursiv && alt.ueberschrift === neu.ueberschrift
            ? alt
            : neu,
        );
      } catch {
        setLage(null);
      }
    };
    const planen = () => {
      if (!rahmen) rahmen = requestAnimationFrame(messen);
    };
    const spaeter = () => {
      if (warten) window.clearTimeout(warten);
      warten = window.setTimeout(() => {
        warten = 0;
        planen();
      }, BLASE_VERZOEGERUNG_MS);
    };
    const verbergen = ({ event }: { event: FocusEvent }) => {
      const ziel = event.relatedTarget as Node | null;
      if (ziel && papierRef.current?.querySelector('.pw-s-blase')?.contains(ziel)) return;
      setLage(null);
    };
    // Auswahl ändert sich: Leiste ausblenden und erst zeigen, wenn die Auswahl fertig ist
    // (Maus losgelassen bzw. kurz nach der letzten Tastatur-Änderung).
    const neueAuswahl = () => {
      setEbenen(false);
      verstecken();
      if (!maus) spaeter();
    };
    // Formatieren (fett, kursiv …) bei sichtbarer Leiste: nur neu ausrichten
    const nachTransaktion = () => {
      if (sichtbar.current && !maus) planen();
    };
    const mausRunter = (e: MouseEvent) => {
      if (e.button !== 0) return;
      maus = true;
      verstecken();
    };
    const mausHoch = () => {
      if (!maus) return;
      maus = false;
      planen();
    };
    const tasteHoch = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && warten) {
        window.clearTimeout(warten);
        warten = 0;
        planen();
      }
    };
    const dom = editor.view.dom as HTMLElement;
    dom.addEventListener('mousedown', mausRunter);
    dom.addEventListener('keyup', tasteHoch);
    document.addEventListener('mouseup', mausHoch);
    editor.on('selectionUpdate', neueAuswahl);
    editor.on('focus', spaeter);
    editor.on('blur', verbergen);
    editor.on('transaction', nachTransaktion);
    return () => {
      dom.removeEventListener('mousedown', mausRunter);
      dom.removeEventListener('keyup', tasteHoch);
      document.removeEventListener('mouseup', mausHoch);
      editor.off('selectionUpdate', neueAuswahl);
      editor.off('focus', spaeter);
      editor.off('blur', verbergen);
      editor.off('transaction', nachTransaktion);
      if (rahmen) cancelAnimationFrame(rahmen);
      if (warten) window.clearTimeout(warten);
    };
  }, [editor, papierRef]);

  if (!lage) return null;
  return (
    <div className="pw-s-blase" role="toolbar" aria-label={T.label} style={{ top: lage.top, left: lage.left }} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" aria-pressed={lage.fett} title={T.fett} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>{T.fettZeichen}</strong>
      </button>
      <button type="button" aria-pressed={lage.kursiv} title={T.kursiv} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em style={{ fontFamily: 'var(--schrift-text)' }}>{T.kursivZeichen}</em>
      </button>
      <button
        type="button"
        aria-pressed={lage.ueberschrift}
        aria-label={lage.ueberschrift ? T.absatz : T.ueberschrift}
        title={lage.ueberschrift ? T.absatzTitel : T.ueberschriftTitel}
        onClick={() => (lage.ueberschrift ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: 2 }).run())}
      >
        {T.ueberschriftZeichen}
      </button>
      <span className="pw-s-blase__trenner" aria-hidden="true" />
      <button type="button" title={T.notizTitel} onClick={onNotiz}>
        {T.notiz}
      </button>
      <button type="button" aria-expanded={ebenen} title={T.ebeneTitel} onClick={() => setEbenen((x) => !x)}>
        {T.ebene}
      </button>
      {ebenen && (
        <div className="pw-s-blase__ebenen" role="group" aria-label={T.ebenenLabel}>
          {STUFEN.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setEbenen(false);
                onEbene(s);
              }}
            >
              <span className="pw-s-blase__punkt" style={{ background: REALITAET_FARBE[s] }} aria-hidden="true" />
              {t.gemeinsam.realitaet[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
