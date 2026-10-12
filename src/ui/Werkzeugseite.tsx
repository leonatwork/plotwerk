import type { ReactNode } from 'react';

export interface WerkzeugseiteProps {
  /** Titel oben links (Instrument Serif 34 px, wie „Akte planen“) */
  titel: string;
  /** leiser Text rechts neben dem Titel */
  hinweis?: ReactNode;
  children: ReactNode;
  /** Inspektor rechts (optional, z. B. <Inspektor …>) */
  inspektor?: ReactNode;
  /** Hintergrund der Fläche: canvas (Boards, Raster) oder surface (Listen, Text) */
  hintergrund?: 'canvas' | 'surface';
}

/** Seitengerüst der Werkzeug-Bereiche (Zeitleiste, Fäden, Statistik, Recherche, Fragen). */
export function Werkzeugseite({ titel, hinweis, children, inspektor, hintergrund = 'canvas' }: WerkzeugseiteProps) {
  return (
    <div className="pw-werkzeug">
      <div className="pw-werkzeug__flaeche" style={{ background: `var(--${hintergrund})` }}>
        <div className="pw-werkzeug__kopf">
          <h1 className="pw-werkzeug__titel">{titel}</h1>
          {hinweis && <span className="pw-werkzeug__hinweis">{hinweis}</span>}
        </div>
        <div className="pw-werkzeug__inhalt">{children}</div>
      </div>
      {inspektor}
    </div>
  );
}
