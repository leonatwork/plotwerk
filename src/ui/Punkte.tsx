import type { KapitelStatus } from '@core/model/types';
import type { CSSProperties } from 'react';

export interface StrangPunktProps {
  /** CSS-Farbe, z. B. Strang.farbe oder var(--strang-dates) */
  farbe: string;
  /** Durchmesser, Standard 8 (Karten); 10 in Legenden/Plan-Panel */
  groesse?: number;
  /** nur Ring (geplanter Strang, z. B. Konsortium) */
  geplant?: boolean;
  title?: string;
  style?: CSSProperties;
}

export function StrangPunkt({ farbe, groesse = 8, geplant, title, style }: StrangPunktProps) {
  return (
    <span
      className="pw-punkt"
      aria-hidden={title ? undefined : true}
      title={title}
      style={{
        width: groesse,
        height: groesse,
        background: geplant ? 'transparent' : farbe,
        border: geplant ? `2px solid ${farbe}` : undefined,
        ...style,
      }}
    />
  );
}

export type StatusPunktStatus = KapitelStatus | 'aktiv';

export interface StatusPunktProps {
  /** geschrieben: ink gefüllt · entwurf: #B7B1A6 · geplant: gestrichelter Ring · aktiv: accent */
  status: StatusPunktStatus;
  groesse?: number;
  title?: string;
}

export function StatusPunkt({ status, groesse = 8, title }: StatusPunktProps) {
  const stil: CSSProperties =
    status === 'geplant'
      ? { border: '1.5px dashed var(--ink-quiet)' }
      : { background: status === 'aktiv' ? 'var(--accent)' : status === 'entwurf' ? 'var(--status-entwurf)' : 'var(--ink)' };
  return <span className="pw-punkt" aria-hidden={title ? undefined : true} title={title} style={{ width: groesse, height: groesse, ...stil }} />;
}

export interface AvatarProps {
  name: string;
  /** Hintergrund, Standard var(--ink); z. B. var(--accent) für Lotte */
  farbe?: string;
  /** 18 (Notiz), 26 (Beziehung), 28 (Liste), 64 (Kopf der Figurenkarte) */
  groesse?: number;
  /** gestrichelter Ring mit „?“ (Existenz offen/vage) in dieser Farbe */
  unsicher?: string;
  /** Textfarbe bei `unsicher` */
  textfarbe?: string;
}

export function Avatar({ name, farbe = 'var(--ink)', groesse = 28, unsicher, textfarbe }: AvatarProps) {
  const buchstabe = (name.trim()[0] ?? '?').toLocaleUpperCase('de');
  const schrift = groesse >= 48 ? groesse / 2 : groesse >= 26 ? Math.round(groesse * 0.43) : 10;
  return (
    <span
      className="pw-avatar"
      aria-hidden="true"
      style={{
        width: groesse,
        height: groesse,
        fontSize: schrift,
        fontFamily: groesse >= 48 ? 'var(--schrift-titel)' : undefined,
        background: unsicher ? 'transparent' : farbe,
        border: unsicher ? `2px dashed ${unsicher}` : undefined,
        color: unsicher ? (textfarbe ?? unsicher) : undefined,
        fontWeight: unsicher || groesse <= 18 ? 600 : undefined,
      }}
    >
      {unsicher ? '?' : buchstabe}
    </span>
  );
}
