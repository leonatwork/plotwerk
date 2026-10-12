import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { klassen } from './klassen';

export interface KarteProps extends HTMLAttributes<HTMLElement> {
  /** 8 (Board-Karten), 10 (Standard), 12 (große Panels) */
  radius?: 8 | 10 | 12;
  /** CSS-Padding, Standard 14px */
  padding?: CSSProperties['padding'];
  gap?: CSSProperties['gap'];
  /** 1,5 px Akzentrand (z. B. „Ich weiche hier ab“) */
  akzent?: boolean;
  as?: 'section' | 'div' | 'article' | 'li';
  children?: ReactNode;
}

export function Karte({ radius = 10, padding, gap, akzent, as: Element = 'section', className, style, children, ...rest }: KarteProps) {
  return (
    <Element
      className={klassen('pw-karte', akzent && 'pw-karte--akzent', className)}
      style={{ borderRadius: radius, padding, gap, ...style }}
      {...rest}
    >
      {children}
    </Element>
  );
}
