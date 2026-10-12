import type { CSSProperties } from 'react';

export interface ZaehlerProps {
  wert: number;
  /** Text für Screenreader, z. B. „neue Hinweise“ */
  label?: string;
  style?: CSSProperties;
}

/** Zähler-Badge in Akzentfarbe (Seitenleiste „Hinweise“). */
export function Zaehler({ wert, label, style }: ZaehlerProps) {
  return (
    <span className="pw-zaehler" style={style}>
      {wert}
      {label && <span className="pw-sr"> {label}</span>}
    </span>
  );
}
