export interface Darstellung {
  schriftgroesse: number;
  zeilenbreite: number;
  zeilenhoehe: number;
  skalierung: number;
}

export const STANDARD_DARSTELLUNG: Readonly<Darstellung> = {
  schriftgroesse: 17.5, zeilenbreite: 530, zeilenhoehe: 1.65, skalierung: 1,
};

/** Diskrete Stufen verhindern Rundungsdrift beim Vergrößern/Verkleinern. */
export const SKALIERUNGEN = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;

export const DARSTELLUNGS_BEREICHE = {
  schriftgroesse: { min: 14, max: 26, step: 0.5 },
  zeilenbreite: { min: 420, max: 800, step: 10 },
  zeilenhoehe: { min: 1.4, max: 2, step: 0.05 },
} as const;

/** Fehlende oder ungültige Felder fallen einzeln zurück; gültige Nachbarfelder bleiben erhalten. */
export function darstellungAusJson(wert: unknown): Darstellung {
  const neu = { ...STANDARD_DARSTELLUNG };
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return neu;
  const daten = wert as Record<string, unknown>;
  for (const feld of Object.keys(DARSTELLUNGS_BEREICHE) as (keyof typeof DARSTELLUNGS_BEREICHE)[]) {
    const v = daten[feld];
    const { min, max } = DARSTELLUNGS_BEREICHE[feld];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) neu[feld] = v;
  }
  if (typeof daten.skalierung === 'number' && SKALIERUNGEN.some((s) => s === daten.skalierung)) neu.skalierung = daten.skalierung;
  return neu;
}
