/** Gemeinsame Bausteine für Fäden, Strang-Raster und Szenen (G2). */
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Id, ProjektDaten, Zeitpunkt } from '@core/model/types';
import type { FadenKarte, StreifenZelle } from '@core/struktur/faeden';
import { fadenStreifen } from '@core/struktur/faeden';
import { zeitHatAngaben } from '@core/struktur/szenen';
import { klassen } from '../../ui';
import { strangFarbe } from '../akte/gemeinsam';
import { datum, f, texte, useTexte } from '../../i18n';
import './faeden.css';

/** „Kap. 3“ / „Ch. 3“ (1-basiert laut projekt.kapitel); unbekannt → die ID. */
export function kapNr(daten: ProjektDaten, id: Id | undefined): string {
  if (!id) return '–';
  const i = daten.projekt.kapitel.indexOf(id);
  return i < 0 ? id : f(texte().gemeinsam.kapitelKurz, { nr: i + 1 });
}

/** „3 Kapiteln“ / „3 chapters“ (Dauer, z. B. „ruht seit …“). */
export function kapitelDauer(n: number): string {
  return f(texte().faeden.kapitelDauer, { n });
}

/**
 * Zeitpunkt einer Szene kurz, in der Oberflächensprache: „Tag 8 · Mo · 23:00“, „ca. Tag 3 · abends“;
 * leer, wenn nichts angegeben ist. (Wie zeitKurz aus core/struktur/szenen, aber übersetzt.)
 */
export function zeitText(z: Zeitpunkt | undefined): string {
  if (!z || !zeitHatAngaben(z)) return '';
  const t = texte().faeden.zeit;
  const teile: string[] = [];
  if (z.tag !== undefined) teile.push(f(t.tag, { n: z.tag }));
  if (z.wochentag) teile.push(t.wochentage[z.wochentag]);
  if (z.datum && z.tag === undefined)
    teile.push(/^\d{4}-\d{2}-\d{2}$/.test(z.datum.trim()) ? datum(z.datum.trim(), { day: 'numeric', month: 'numeric', year: 'numeric' }) : z.datum);
  if (z.uhrzeit) teile.push(z.uhrzeit);
  else if (z.tageszeit) teile.push(t.tageszeiten[z.tageszeit]);
  const text = teile.join(' · ');
  return z.sicherheit === 'ungefaehr' ? f(t.ungefaehr, { text }) : z.sicherheit === 'unklar' ? f(t.unklar, { text }) : text;
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
  const t = texte().faeden.streifen;
  const teile: string[] = [];
  if (z.eroeffnet) teile.push(t.eroeffnet);
  if (z.aufgegriffen) teile.push(t.aufgegriffen);
  if (z.aufloesung) teile.push(t.aufloesungGeplant);
  if (z.ruht) teile.push(t.ruht);
  if (z.ohneText) teile.push(t.nochOhneText);
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
  const t = useTexte();
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
      aria-label={
        gross
          ? f(t.faeden.streifen.verlaufVon, { name: karte.name })
          : f(t.faeden.streifen.verlauf, {
              kapitel:
                zellen
                  .filter((z) => z.eroeffnet || z.aufgegriffen)
                  .map((z) => z.nummer)
                  .join(', ') || t.faeden.streifen.keinKapitel,
            })
      }
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
  const t = useTexte().faeden.streifen;
  const m = (stil: CSSProperties, cls = '') => <span className={klassen('fd-legende__muster fd-zelle', cls)} style={{ height: 10, ...stil }} />;
  return (
    <div className="fd-legende" aria-label={t.legende}>
      <span className="fd-legende__eintrag">{m({ background: 'var(--ink)' })}{t.eroeffnet}</span>
      <span className="fd-legende__eintrag">{m({ background: 'var(--ink)', opacity: 0.6 })}{t.aufgegriffen}</span>
      <span className="fd-legende__eintrag">{m({}, 'fd-zelle--ruht')}{t.ruht}</span>
      <span className="fd-legende__eintrag">{m({ background: 'transparent' }, 'fd-zelle--aufloesung')}{t.aufloesungGeplant}</span>
      <span className="fd-legende__eintrag">{m({}, 'fd-zelle--ohnetext')}{t.ohneText}</span>
    </div>
  );
}
