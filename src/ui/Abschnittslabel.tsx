import type { CSSProperties, ReactNode } from 'react';
import { klassen } from './klassen';

export interface AbschnittslabelProps {
  children: ReactNode;
  /** Textfarbe als CSS-Wert, Standard var(--ink-quiet); z. B. var(--accent-dark) für „WENDUNG“ */
  farbe?: string;
  /** 12 px statt 11 px (Kopfzeilen wie „KAPITEL 9“) */
  gross?: boolean;
  as?: 'span' | 'h2' | 'h3' | 'div';
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/** 11 px, 600, letter-spacing .06em, Versalien (Text wird per CSS großgeschrieben). */
export function Abschnittslabel({ children, farbe, gross, as: Element = 'span', className, style, id }: AbschnittslabelProps) {
  return (
    <Element
      id={id}
      className={klassen('pw-label', className)}
      style={{ color: farbe, fontSize: gross ? 12 : undefined, letterSpacing: gross ? '0.08em' : undefined, margin: 0, ...style }}
    >
      {children}
    </Element>
  );
}
