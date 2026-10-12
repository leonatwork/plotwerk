import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { klassen } from './klassen';
import { StrangPunkt } from './Punkte';

export type ChipVariante = 'gefuellt' | 'umrandet' | 'gestrichelt' | 'knopf';

export interface ChipProps {
  /** gefuellt (#EFEBE4) · umrandet (Ort) · gestrichelt (nur erwähnt / geplant) · knopf (Strang-Auswahl, 28 px) */
  variante?: ChipVariante;
  /** accent: Figur im Fokus (rosa Fläche, dunkelrote Schrift) */
  farbe?: 'neutral' | 'accent';
  /** Farbpunkt vor dem Text (z. B. Strangfarbe als CSS-Wert) */
  punkt?: string;
  /** für variante „knopf“: gewählt */
  aktiv?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  href?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Chip({ variante = 'gefuellt', farbe = 'neutral', punkt, aktiv, onClick, href, title, className, style, children }: ChipProps) {
  const cls = klassen('pw-chip', `pw-chip--${variante}`, farbe === 'accent' && 'pw-chip--accent', className);
  const inhalt = (
    <>
      {punkt && <StrangPunkt farbe={punkt} />}
      {children}
    </>
  );
  if (href)
    return (
      <a className={cls} href={href} onClick={onClick} title={title} style={style}>
        {inhalt}
      </a>
    );
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick} title={title} style={style} aria-pressed={variante === 'knopf' ? !!aktiv : undefined}>
        {inhalt}
      </button>
    );
  return (
    <span className={cls} title={title} style={style}>
      {inhalt}
    </span>
  );
}
