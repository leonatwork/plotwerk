/** Gemeinsame Bausteine für Fäden, Strang-Raster und Szenen (G2). */
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Id, ProjektDaten } from '@core/model/types';
import type { FadenKarte, StreifenZelle } from '@core/struktur/faeden';
import { fadenStreifen } from '@core/struktur/faeden';
import { klassen } from '../../ui';
import { strangFarbe } from '../akte/gemeinsam';
import './faeden.css';

/** „Kap. 3“ (1-basiert laut projekt.kapitel); unbekannt → die ID. */
export function kapNr(daten: ProjektDaten, id: Id | undefined): string {
  if (!id) return '–';
  const i = daten.projekt.kapitel.indexOf(id);
  return i < 0 ? id : `Kap. ${i + 1}`;
}

export function kapitelTitel(daten: ProjektDaten, id: Id): string {
  return daten.plaene[id]?.titel || daten.kapitel[id]?.titel || id;
}

/** „Kap. 3 · Titel“ */
export function kapitelVoll(daten: ProjektDaten, id: Id | undefined): string {
  if (!id) return '–';
  return `${kapNr(daten, id)} · ${kapitelTitel(daten, id)}`;
}

/** Farbe eines Fadens: Strangfarbe (als Token) oder Tinte. */
export function fadenFarbe(daten: ProjektDaten, strang: Id | undefined): string {
  const s = strang ? daten.straenge.find((x) => x.id === strang) : undefined;
  return s ? strangFarbe(s.farbe) : 'var(--ink)';
}

const ROEMISCH = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roemisch = (n: number) => ROEMISCH[n] ?? String(n);

function zellenText(daten: ProjektDaten, z: StreifenZelle): string {
  const teile: string[] = [];
  if (z.eroeffnet) teile.push('eröffnet');
  if (z.aufgegriffen) teile.push('aufgegriffen');
  if (z.aufloesung) teile.push('Auflösung geplant');
  if (z.ruht) teile.push('ruht');
  if (z.ohneText) teile.push('noch ohne Text');
  return `${kapitelVoll(daten, z.kapitel)}${teile.length ? `: ${teile.join(', ')}` : ''}`;
}

/**
 * Mini-Kapitelstreifen eines Fadens: gefüllt = eröffnet/aufgegriffen, warm = ruht, Akzentrand = geplante Auflösung,
 * schraffiert = Kapitel ohne Text. `gross`: mit Nummern, Zellen klickbar (Pfeiltasten wandern).
 */
export function Kapitelstreifen({
  karte,
  daten,
  gross,
  onKapitel,
}: {
  karte: FadenKarte;
  daten: ProjektDaten;
  gross?: boolean;
  onKapitel?(kapitel: Id): void;
}) {
  const zellen = fadenStreifen(karte, daten);
  const farbe = fadenFarbe(daten, karte.strang);
  const stil = (z: StreifenZelle): CSSProperties | undefined => (z.eroeffnet || z.aufgegriffen ? { background: farbe } : undefined);
  const klasse = (z: StreifenZelle) =>
    klassen(
      'fd-zelle',
      z.eroeffnet && 'fd-zelle--eroeffnet',
      !z.eroeffnet && z.aufgegriffen && 'fd-zelle--aufgegriffen',
      z.ruht && 'fd-zelle--ruht',
      z.aufloesung && 'fd-zelle--aufloesung',
      z.ohneText && !z.eroeffnet && !z.aufgegriffen && 'fd-zelle--ohnetext',
    );
  const tasten = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const knoepfe = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    const n = knoepfe[Math.max(0, Math.min(knoepfe.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
    if (n) {
      e.preventDefault();
      n.focus();
    }
  };
  return (
    <div
      className={klassen('fd-streifen', gross && 'fd-streifen--gross')}
      style={{ gridTemplateColumns: `repeat(${zellen.length}, minmax(0, 1fr))` }}
      role={gross ? 'group' : 'img'}
      aria-label={gross ? `Verlauf von ${karte.name}` : `Verlauf: ${zellen.filter((z) => z.eroeffnet || z.aufgegriffen).map((z) => z.nummer).join(', ') || 'kein Kapitel'}`}
      onKeyDown={gross ? tasten : undefined}
    >
      {zellen.map((z) =>
        gross ? (
          <button
            key={z.kapitel}
            type="button"
            className={klasse(z)}
            style={stil(z)}
            title={zellenText(daten, z)}
            aria-label={zellenText(daten, z)}
            onClick={() => onKapitel?.(z.kapitel)}
          >
            {z.nummer}
          </button>
        ) : (
          <span key={z.kapitel} className={klasse(z)} style={stil(z)} title={zellenText(daten, z)} />
        ),
      )}
    </div>
  );
}

/** Legende zum Kapitelstreifen. */
export function StreifenLegende() {
  const m = (stil: CSSProperties, cls = '') => <span className={klassen('fd-legende__muster fd-zelle', cls)} style={{ height: 10, ...stil }} />;
  return (
    <div className="fd-legende" aria-label="Legende Kapitelstreifen">
      <span className="fd-legende__eintrag">{m({ background: 'var(--ink)' })}eröffnet</span>
      <span className="fd-legende__eintrag">{m({ background: 'var(--ink)', opacity: 0.6 })}aufgegriffen</span>
      <span className="fd-legende__eintrag">{m({}, 'fd-zelle--ruht')}ruht</span>
      <span className="fd-legende__eintrag">{m({ background: 'transparent' }, 'fd-zelle--aufloesung')}Auflösung geplant</span>
      <span className="fd-legende__eintrag">{m({}, 'fd-zelle--ohnetext')}ohne Text</span>
    </div>
  );
}
