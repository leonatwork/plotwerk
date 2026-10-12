/** Eingabefeld, das lokal bearbeitet und entprellt (sowie beim Verlassen) speichert. */
import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Textbereich, Textfeld } from '../../ui';

export interface EntwurfFeldProps {
  wert: string;
  onSpeichern(wert: string): void;
  mehrzeilig?: boolean;
  zeilen?: number;
  id?: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  'aria-label'?: string;
  /** Verzögerung in ms (Standard 700) */
  verzoegerung?: number;
}

export const EntwurfFeld = forwardRef<HTMLInputElement & HTMLTextAreaElement, EntwurfFeldProps>(function EntwurfFeld(
  { wert, onSpeichern, mehrzeilig, zeilen = 3, verzoegerung = 700, ...rest },
  ref,
) {
  const [lokal, setLokal] = useState(wert);
  const fokus = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offen = useRef<string | null>(null);
  const speichern = useRef(onSpeichern);
  speichern.current = onSpeichern;
  const aktuell = useRef(wert);
  aktuell.current = wert;

  useEffect(() => {
    if (!fokus.current && offen.current === null) setLokal(wert);
  }, [wert]);

  const festschreiben = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (offen.current !== null) {
      const w = offen.current;
      offen.current = null;
      if (w !== aktuell.current) speichern.current(w);
    }
  };

  const festschreibenRef = useRef(festschreiben);
  festschreibenRef.current = festschreiben;
  useEffect(() => () => festschreibenRef.current(), []);

  const props = {
    ...rest,
    value: lokal,
    onFocus: () => (fokus.current = true),
    onBlur: () => {
      fokus.current = false;
      festschreiben();
    },
    onChange: (e: { target: { value: string } }) => {
      setLokal(e.target.value);
      offen.current = e.target.value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(festschreiben, verzoegerung);
    },
  };
  return mehrzeilig ? <Textbereich ref={ref} rows={zeilen} {...props} /> : <Textfeld ref={ref} {...props} />;
});
