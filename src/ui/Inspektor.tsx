import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../state/store';
import { klassen } from './klassen';

export interface InspektorProps {
  children: ReactNode;
  /** 300–350 px, Standard 350 */
  breite?: number;
  /** inspector (#FAF9F7, Schreiben) oder weiss (Akte, Beziehungen: weiß, 18 px Innenabstand) */
  hintergrund?: 'inspector' | 'weiss';
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Rechte Spalte für das ausgewählte Element. Im Fokus-Modus ausgeblendet. */
export function Inspektor({ children, breite = 350, hintergrund = 'inspector', label = 'Inspektor', className, style }: InspektorProps) {
  const fokus = useStore((s) => s.fokusModus);
  if (fokus) return null;
  return (
    <aside
      aria-label={label}
      className={klassen('pw-inspektor', hintergrund === 'weiss' && 'pw-inspektor--weiss', className)}
      style={{ width: breite, flexBasis: breite, ...style }}
    >
      {children}
    </aside>
  );
}
