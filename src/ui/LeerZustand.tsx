import type { ReactNode } from 'react';

export interface LeerZustandProps {
  titel: ReactNode;
  children?: ReactNode;
  aktionen?: ReactNode;
}

/** Platzhalter für leere Bereiche (Instrument Serif, ruhig). */
export function LeerZustand({ titel, children, aktionen }: LeerZustandProps) {
  return (
    <div className="pw-leer">
      <h2 className="pw-leer__titel">{titel}</h2>
      {children && <div className="pw-leer__text">{children}</div>}
      {aktionen && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{aktionen}</div>}
    </div>
  );
}
