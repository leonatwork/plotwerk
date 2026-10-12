/** Fortschrittsring (Tagesziel, Zielumfang). Besitzer: G5. */
import { klassen } from '../../ui';

export interface RingProps {
  /** 0 … 1 (wird gedeckelt) */
  anteil: number;
  groesse?: number;
  staerke?: number;
  /** Ziel erreicht: grün statt Akzentfarbe */
  erreicht?: boolean;
  /** barrierefreier Name; ohne Angabe dekorativ */
  label?: string;
}

export function Ring({ anteil, groesse = 44, staerke = 5, erreicht, label }: RingProps) {
  const r = (groesse - staerke) / 2;
  const umfang = 2 * Math.PI * r;
  const wert = Math.max(0, Math.min(1, Number.isFinite(anteil) ? anteil : 0));
  return (
    <svg
      className={klassen('pw-st-ring', erreicht && 'pw-st-ring--erreicht')}
      width={groesse}
      height={groesse}
      viewBox={`0 0 ${groesse} ${groesse}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className="pw-st-ring__spur" cx={groesse / 2} cy={groesse / 2} r={r} fill="none" strokeWidth={staerke} />
      <circle
        className="pw-st-ring__wert"
        cx={groesse / 2}
        cy={groesse / 2}
        r={r}
        fill="none"
        strokeWidth={staerke}
        strokeLinecap="round"
        strokeDasharray={umfang}
        strokeDashoffset={umfang * (1 - wert)}
        transform={`rotate(-90 ${groesse / 2} ${groesse / 2})`}
        style={{ opacity: wert === 0 ? 0 : 1 }}
      />
    </svg>
  );
}
