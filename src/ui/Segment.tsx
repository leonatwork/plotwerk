import type { CSSProperties, ReactNode } from 'react';
import { klassen } from './klassen';

export interface SegmentOption<T extends string> {
  wert: T;
  label: ReactNode;
  /** Hintergrund des aktiven Knopfs (z. B. Realitätsfarbe); Text dann weiß */
  farbe?: string;
  /** aria-controls bei Tabs */
  steuert?: string;
}

export interface SegmentProps<T extends string> {
  optionen: SegmentOption<T>[];
  wert: T;
  onChange(wert: T): void;
  /** Barrierefreier Name, z. B. „Seitenleiste“ */
  label: string;
  /** tablist (Inspektor „Plan | Erkannt | Hinweise“) oder group (Umschalter, aria-pressed) */
  rolle?: 'tablist' | 'group';
  /** normal 28 px · klein 26 px (Titelleiste) · hoch 30 px · gross 34 px (Zeitregler) */
  groesse?: 'normal' | 'klein' | 'hoch' | 'gross';
  /** Hintergrund: segment (#ECE9E4, Inspektor) oder selected (#E3DFD9, Titelleiste/Netz) */
  hintergrund?: 'segment' | 'selected';
  /** Knöpfe teilen sich die volle Breite */
  voll?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Segment<T extends string>({
  optionen,
  wert,
  onChange,
  label,
  rolle = 'tablist',
  groesse = 'normal',
  hintergrund = 'segment',
  voll = rolle === 'tablist',
  className,
  style,
}: SegmentProps<T>) {
  return (
    <div
      role={rolle}
      aria-label={label}
      className={klassen(
        'pw-segment',
        hintergrund === 'selected' && 'pw-segment--selected',
        groesse !== 'normal' && `pw-segment--${groesse}`,
        voll && 'pw-segment--voll',
        className,
      )}
      style={style}
      onKeyDown={(e) => {
        if (rolle !== 'tablist' || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        const i = optionen.findIndex((o) => o.wert === wert);
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + optionen.length) % optionen.length;
        const ziel = optionen[n];
        if (!ziel) return;
        e.preventDefault();
        onChange(ziel.wert);
        const knoepfe = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
        knoepfe[n]?.focus();
      }}
    >
      {optionen.map((o) => {
        const aktiv = o.wert === wert;
        return (
          <button
            key={o.wert}
            type="button"
            role={rolle === 'tablist' ? 'tab' : undefined}
            aria-selected={rolle === 'tablist' ? aktiv : undefined}
            aria-pressed={rolle === 'group' ? aktiv : undefined}
            aria-controls={o.steuert}
            tabIndex={rolle === 'tablist' && !aktiv ? -1 : undefined}
            className={klassen('pw-segment__knopf', aktiv && 'pw-segment__knopf--aktiv', o.farbe && 'pw-segment__knopf--farbig')}
            style={aktiv && o.farbe ? { background: o.farbe } : undefined}
            onClick={() => onChange(o.wert)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
