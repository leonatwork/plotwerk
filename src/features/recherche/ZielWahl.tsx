/** Auswahl, woran ein Eintrag geheftet wird: Suchfeld mit Vorschlagsliste (Figuren, Orte, Kapitel, Szenen). */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Verweis } from '@core/model/types';
import { heftZielVorschlaege } from '@core/recherche/index';
import { sprache, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';

export interface ZielWahlProps {
  /** bereits geheftete Ziele (werden nicht vorgeschlagen) */
  gewaehlt: Verweis[];
  onWaehlen(v: Verweis): void;
  /** Escape im leeren Feld */
  onAbbrechen?(): void;
  autoFocus?: boolean;
  placeholder?: string;
}

export function ZielWahl({ gewaehlt, onWaehlen, onAbbrechen, autoFocus, placeholder }: ZielWahlProps) {
  const t = useTexte();
  const tz = t.recherche.zielWahl;
  const daten = useStore((s) => s.daten);
  const [anfrage, setAnfrage] = useState('');
  const [offen, setOffen] = useState(!!autoFocus);
  const [aktiv, setAktiv] = useState(0);
  const listenId = useId();
  const feld = useRef<HTMLInputElement>(null);
  const vorschlaege = useMemo(() => (daten && offen ? heftZielVorschlaege(daten, anfrage, gewaehlt, 8, sprache()) : []), [daten, offen, anfrage, gewaehlt]);
  const i = Math.min(aktiv, Math.max(0, vorschlaege.length - 1));

  const waehlen = (v: Verweis) => {
    onWaehlen(v);
    setAnfrage('');
    setAktiv(0);
    feld.current?.focus();
  };

  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOffen(true);
      setAktiv((n) => Math.min(n + 1, vorschlaege.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv((n) => Math.max(n - 1, 0));
    } else if (e.key === 'Enter' && !e.metaKey) {
      const z = vorschlaege[i];
      if (z) {
        e.preventDefault();
        e.stopPropagation();
        waehlen(z.verweis);
      }
    } else if (e.key === 'Escape') {
      if (offen && anfrage) {
        e.preventDefault();
        e.stopPropagation();
        setAnfrage('');
      } else if (onAbbrechen) {
        e.preventDefault();
        e.stopPropagation();
        onAbbrechen();
      } else if (offen) {
        e.stopPropagation();
        setOffen(false);
      }
    }
  };

  return (
    <div className="rc-zielwahl">
      <input
        ref={feld}
        className="pw-textfeld rc-zielwahl__feld"
        role="combobox"
        aria-expanded={vorschlaege.length > 0}
        aria-controls={listenId}
        aria-autocomplete="list"
        aria-activedescendant={vorschlaege.length ? `${listenId}-${i}` : undefined}
        aria-label={tz.label}
        placeholder={placeholder ?? tz.platzhalter}
        value={anfrage}
        autoFocus={autoFocus}
        onChange={(e) => {
          setAnfrage(e.target.value);
          setAktiv(0);
          setOffen(true);
        }}
        onFocus={() => setOffen(true)}
        onBlur={() => window.setTimeout(() => setOffen(false), 120)}
        onKeyDown={taste}
      />
      {vorschlaege.length > 0 && (
        <ul id={listenId} role="listbox" className="rc-zielwahl__liste" aria-label={tz.ziele}>
          {vorschlaege.map((z, n) => (
            <li
              key={`${z.verweis.typ}:${z.verweis.id}`}
              id={`${listenId}-${n}`}
              role="option"
              aria-selected={n === i}
              className={klassen('rc-zielwahl__eintrag', n === i && 'rc-zielwahl__eintrag--aktiv')}
              onMouseDown={(e) => {
                e.preventDefault();
                waehlen(z.verweis);
              }}
              onMouseEnter={() => setAktiv(n)}
            >
              <span className="rc-zielwahl__name">{z.name}</span>
              <span className="rc-zielwahl__art">{t.recherche.zielArt[z.art]}</span>
            </li>
          ))}
        </ul>
      )}
      {offen && anfrage.trim() && vorschlaege.length === 0 && <div className="rc-zielwahl__leer">{tz.nichtsGefunden}</div>}
    </div>
  );
}
