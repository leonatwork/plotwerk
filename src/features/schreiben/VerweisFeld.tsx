/** Eingabefeld mit `[[`-Vorschlägen und Anzeige von Text mit Verweisen (S-07). */
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Verweis } from '@core/model/types';
import { useTexte } from '../../i18n';
import { useBuchSprache } from '../../i18n/buch';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';
import './verweisfeld.css';
import { offeneAnfrage, verweisEinsetzen, verweiseZerlegen, verweisOeffnen, verweisVorschlaege, zielName, type VerweisVorschlag } from './verweise';

export interface VerweisFeldProps {
  wert: string;
  onChange(wert: string): void;
  /** Ziel, dessen Verwandtes bei leerer Anfrage zuerst vorgeschlagen wird */
  kontext?: Verweis | null;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Tasten, die nicht von der Vorschlagsliste verbraucht werden */
  onKeyDown?(e: KeyboardEvent<HTMLTextAreaElement>): void;
  onBlur?(): void;
  className?: string;
  /** Mindesthöhe in Zeilen */
  zeilen?: number;
  /** id des Textfelds (für ein sichtbares <label>) */
  id?: string;
  /** eigene Klasse/Stil für das Textfeld (ersetzt die Standard-Optik) */
  feldKlasse?: string;
  feldStil?: CSSProperties;
}

export function VerweisFeld({ wert, onChange, kontext, label, placeholder, autoFocus, onKeyDown, onBlur, className, zeilen = 1, id, feldKlasse, feldStil }: VerweisFeldProps) {
  const daten = useStore((s) => s.daten);
  const t = useTexte();
  const buchLang = useBuchSprache();
  const ref = useRef<HTMLTextAreaElement>(null);
  const listenId = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const [aktiv, setAktiv] = useState(0);
  const [zu, setZu] = useState(false);

  const offen = cursor !== null && !zu ? offeneAnfrage(wert, cursor) : null;
  const anfrage = offen?.anfrage ?? null;
  const vorschlaege = useMemo<VerweisVorschlag[]>(
    () => (anfrage !== null && daten ? verweisVorschlaege(daten, anfrage, kontext, 6) : []),
    [anfrage, daten, kontext],
  );
  const aktiverIndex = Math.min(aktiv, Math.max(0, vorschlaege.length - 1));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [wert]);

  const merkeCursor = () => setCursor(ref.current?.selectionStart ?? null);

  const waehlen = (v: VerweisVorschlag) => {
    if (cursor === null) return;
    const { text, cursor: neu } = verweisEinsetzen(wert, cursor, v);
    onChange(text);
    setAktiv(0);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(neu, neu);
      setCursor(neu);
    });
  };

  const tasten = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (vorschlaege.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = vorschlaege.length;
        setAktiv((aktiverIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        waehlen(vorschlaege[aktiverIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setZu(true);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className={klassen('pw-s-verweisfeld', (feldKlasse || feldStil) && 'pw-s-verweisfeld--eigen', className)}>
      <textarea
        ref={ref}
        id={id}
        className={feldKlasse}
        style={feldStil ? { overflow: 'hidden', ...feldStil } : feldKlasse ? { overflow: 'hidden' } : undefined}
        rows={zeilen}
        value={wert}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={vorschlaege.length > 0}
        aria-controls={vorschlaege.length ? listenId : undefined}
        aria-activedescendant={vorschlaege.length ? `${listenId}-${aktiverIndex}` : undefined}
        spellCheck
        lang={buchLang}
        onChange={(e) => {
          setZu(false);
          setAktiv(0);
          setCursor(e.target.selectionStart);
          onChange(e.target.value);
        }}
        onSelect={merkeCursor}
        onClick={merkeCursor}
        onKeyDown={tasten}
        onBlur={() => {
          setCursor(null);
          onBlur?.();
        }}
      />
      {vorschlaege.length > 0 && (
        <ul id={listenId} role="listbox" aria-label={t.schreiben.verweise.listeLabel} className="pw-s-verweisliste" onMouseDown={(e) => e.preventDefault()}>
          {vorschlaege.map((v, i) => (
            <li
              key={`${v.typ}:${v.id}`}
              id={`${listenId}-${i}`}
              role="option"
              aria-selected={i === aktiverIndex}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => waehlen(v)}
            >
              <span>{v.anzeige}</span>
              <span>{t.schreiben.verweise.art[v.typ]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text mit `[[…]]`-Verweisen als Links (Klick öffnet das Ziel). */
export function VerweisText({ text }: { text: string }) {
  const daten = useStore((s) => s.daten);
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte();
  const teile = useMemo(() => verweiseZerlegen(text), [text]);
  return (
    <>
      {teile.map((teil, i) => {
        if (teil.art === 'text') return <span key={i}>{teil.text}</span>;
        const name = daten ? zielName(daten, teil.verweis) : null;
        if (!name)
          return (
            <span key={i} className="pw-s-verweis pw-s-verweis--fehlt" title={t.schreiben.verweise.fehlt}>
              {teil.anzeige}
            </span>
          );
        return (
          <button
            key={i}
            type="button"
            className="pw-s-verweis"
            onClick={(e) => {
              e.stopPropagation();
              verweisOeffnen({ oeffne }, teil.verweis);
            }}
          >
            {name}
          </button>
        );
      })}
    </>
  );
}
