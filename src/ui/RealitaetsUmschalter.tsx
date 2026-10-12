import type { Realitaet } from '@core/model/types';
import { Segment } from './Segment';

export const REALITAET_LABEL: Record<Realitaet, string> = {
  gesichert: 'gesichert',
  offen: 'noch offen',
  bewusst_vage: 'bewusst vage',
};

export const REALITAET_FARBE: Record<Realitaet, string> = {
  gesichert: 'var(--real-gesichert)',
  offen: 'var(--real-offen)',
  bewusst_vage: 'var(--real-vage)',
};

const STUFEN: Realitaet[] = ['gesichert', 'offen', 'bewusst_vage'];

export interface RealitaetsUmschalterProps {
  wert: Realitaet;
  onChange(wert: Realitaet): void;
  /** chips: einzelne Chips (Kapitel-Überblick) · segment: Umschalter (Figurenkarte, Netz) */
  variante?: 'chips' | 'segment';
  /** Segmenthöhe: normal 28 px (Figurenkarte), hoch 30 px (Netz-Inspektor) */
  groesse?: 'normal' | 'hoch';
  label?: string;
}

export function RealitaetsUmschalter({ wert, onChange, variante = 'chips', groesse = 'normal', label = 'Realitätsebene' }: RealitaetsUmschalterProps) {
  if (variante === 'segment')
    return (
      <Segment
        rolle="group"
        label={label}
        voll
        groesse={groesse}
        wert={wert}
        onChange={onChange}
        optionen={STUFEN.map((s) => ({ wert: s, label: REALITAET_LABEL[s], farbe: REALITAET_FARBE[s] }))}
      />
    );
  return (
    <div role="group" aria-label={label} className="pw-realitaet">
      {STUFEN.map((s) => {
        const aktiv = s === wert;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={aktiv}
            className="pw-realitaet__knopf"
            style={aktiv ? { background: REALITAET_FARBE[s], borderColor: REALITAET_FARBE[s] } : undefined}
            onClick={() => onChange(s)}
          >
            {REALITAET_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
