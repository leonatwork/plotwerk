/**
 * Kalender-Heatmap „Wörter pro Tag“ (G5). Spalten = Wochen (Mo–So), Farbe = Stufe relativ zum Tagesziel.
 * Tastatur: Pfeil hoch/runter = Tag, links/rechts = Woche, Pos1/Ende = erster/letzter Tag, Enter wählt.
 */
import { kalender, tagVerschieben, type KalenderTag } from '@core/statistik';
import type { Schreibstatistik } from '@core/model/types';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { klassen } from '../../ui';
import { tagAnzeige, woerterText, zahl } from './hooks';

const WOCHENTAGE = ['Mo', '', 'Mi', '', 'Fr', '', 'So'];
const monatKurz = new Intl.DateTimeFormat('de-DE', { month: 'short' });

export interface KalenderProps {
  st: Schreibstatistik;
  heute: string;
  wochen?: number;
  gewaehlt: string;
  onWaehlen(tag: string): void;
}

function zellenLabel(t: KalenderTag, heute: string, ziel: number): string {
  const teile = [t.tag === heute ? `Heute, ${tagAnzeige(t.tag)}` : tagAnzeige(t.tag), t.woerter > 0 ? `${woerterText(t.woerter)} geschrieben` : 'nichts geschrieben'];
  if (ziel > 0 && t.zielErreicht) teile.push('Tagesziel erreicht');
  return teile.join(', ');
}

export function Kalender({ st, heute, wochen = 53, gewaehlt, onWaehlen }: KalenderProps) {
  const daten = useMemo(() => kalender(st, heute, wochen), [st, heute, wochen]);
  const erster = daten[0]?.tage[0]?.tag ?? heute;
  const [fokus, setFokus] = useState(gewaehlt);
  const raster = useRef<HTMLDivElement>(null);
  const tastatur = useRef(false);

  useEffect(() => setFokus(gewaehlt), [gewaehlt]);

  useEffect(() => {
    if (!tastatur.current) return;
    tastatur.current = false;
    raster.current?.querySelector<HTMLButtonElement>(`[data-tag="${fokus}"]`)?.focus();
  }, [fokus]);

  // Heute ins Bild scrollen (rechts), wenn der Kalender breiter ist als der Platz
  useEffect(() => {
    const el = raster.current?.parentElement;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const bewegen = (e: KeyboardEvent<HTMLDivElement>) => {
    const schritte: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let ziel: string | null = null;
    if (e.key in schritte) ziel = tagVerschieben(fokus, schritte[e.key]!);
    else if (e.key === 'Home') ziel = erster;
    else if (e.key === 'End') ziel = heute;
    else if (e.key === 'PageUp') ziel = tagVerschieben(fokus, -28);
    else if (e.key === 'PageDown') ziel = tagVerschieben(fokus, 28);
    if (ziel === null) return;
    e.preventDefault();
    if (ziel < erster) ziel = erster;
    if (ziel > heute) ziel = heute;
    tastatur.current = true;
    setFokus(ziel);
    onWaehlen(ziel);
  };

  return (
    <div className="pw-st-kalender">
      <div className="pw-st-kalender__wochentage" aria-hidden="true">
        <span />
        {WOCHENTAGE.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div ref={raster} className="pw-st-kalender__raster" role="group" aria-label="Wörter pro Tag, letzte 12 Monate" onKeyDown={bewegen}>
        {daten.map((w, wi) => {
          const monatsErster = w.tage.find((t) => t.tag.endsWith('-01'));
          const naechsteBeginnt = daten[1]?.tage.some((t) => t.tag.endsWith('-01')) ?? false;
          const zeigeMonat = monatsErster ?? (wi === 0 && !naechsteBeginnt ? w.tage[0] : undefined);
          const [j, m] = (zeigeMonat?.tag ?? '').split('-').map(Number);
          return [
            <span key={`m-${w.beginn}`} className="pw-st-kalender__monat" aria-hidden="true">
              {zeigeMonat && wi < daten.length - 1 ? monatKurz.format(new Date(j!, m! - 1, 1)) : ''}
            </span>,
            ...w.tage.map((t) =>
              t.zukunft ? (
                <span key={t.tag} className="pw-st-zelle pw-st-zelle--zukunft" aria-hidden="true" />
              ) : (
                <button
                  key={t.tag}
                  type="button"
                  data-tag={t.tag}
                  data-stufe={t.stufe}
                  className={klassen('pw-st-zelle', t.tag === heute && 'pw-st-zelle--heute')}
                  aria-pressed={t.tag === gewaehlt}
                  aria-label={zellenLabel(t, heute, st.ziel.tagWoerter)}
                  title={`${tagAnzeige(t.tag)}: ${t.woerter > 0 ? zahl.format(t.woerter) : 'keine'} Wörter`}
                  tabIndex={t.tag === fokus ? 0 : -1}
                  onClick={() => {
                    setFokus(t.tag);
                    onWaehlen(t.tag);
                  }}
                />
              ),
            ),
          ];
        })}
      </div>
    </div>
  );
}

/** Legende „weniger … mehr“ unter dem Kalender. */
export function KalenderLegende({ ziel }: { ziel: number }) {
  return (
    <div className="pw-st-legende" aria-hidden="true">
      <span>{ziel > 0 ? 'unter ½ Ziel' : 'weniger'}</span>
      {[0, 1, 2, 3, 4].map((s) => (
        <span key={s} className="pw-st-zelle" data-stufe={s} />
      ))}
      <span>{ziel > 0 ? 'ab 1½ × Ziel' : 'mehr'}</span>
    </div>
  );
}
