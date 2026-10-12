import type { ReactNode } from 'react';
import type { FunktionId } from '@core/funktionen';
import { useFunktion } from '../state/funktionen';

/** Zeigt den Inhalt nur, solange die Funktion eingeblendet ist (E16). */
export function NurMit({ funktion, children }: { funktion: FunktionId; children: ReactNode }) {
  return useFunktion(funktion) ? <>{children}</> : null;
}
