import type { Realitaet } from '@core/model/types';
import { texte, useTexte } from '../i18n';
import { Segment } from './Segment';

/**
 * Beschriftung der Realitätsebenen in der aktuellen Oberflächensprache (liest bei jedem Zugriff
 * t.gemeinsam.realitaet). Für Komponenten besser direkt `t.gemeinsam.realitaet[wert]` nutzen.
 */
export const REALITAET_LABEL: Readonly<Record<Realitaet, string>> = {
  get gesichert() {
    return texte().gemeinsam.realitaet.gesichert;
  },
  get offen() {
    return texte().gemeinsam.realitaet.offen;
  },
  get bewusst_vage() {
    return texte().gemeinsam.realitaet.bewusst_vage;
  },
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

export function RealitaetsUmschalter({ wert, onChange, variante = 'chips', groesse = 'normal', label }: RealitaetsUmschalterProps) {
  const t = useTexte();
  const name = label ?? t.ui.realitaet.label;
  if (variante === 'segment')
    return (
      <Segment
        rolle="group"
        label={name}
        voll
        groesse={groesse}
        wert={wert}
        onChange={onChange}
        optionen={STUFEN.map((s) => ({ wert: s, label: t.gemeinsam.realitaet[s], farbe: REALITAET_FARBE[s] }))}
      />
    );
  return (
    <div role="group" aria-label={name} className="pw-realitaet">
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
            {t.gemeinsam.realitaet[s]}
          </button>
        );
      })}
    </div>
  );
}
