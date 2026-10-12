/**
 * Kalender-Heatmap „Wörter pro Tag“ (G5). Spalten = Wochen (Mo–So), Farbe = Stufe relativ zum Tagesziel.
 * Tastatur: Pfeil hoch/runter = Tag, links/rechts = Woche, Pos1/Ende = erster/letzter Tag, Enter wählt.
 */
import { kalender, tagVerschieben, type KalenderTag } from '@core/statistik';
import type { Schreibstatistik } from '@core/model/types';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { f, texte, useTexte } from '../../i18n';
import { klassen } from '../../ui';
import { datumsFormat, mitZahl, tagAnzeige, woerterText } from './hooks';

/** Zeilenköpfe Mo, Mi, Fr, So (Montag = 1. Januar 2024); die übrigen Zeilen bleiben leer. */
function wochentage(): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => (i % 2 === 0 ? datumsFormat('wochentag').format(new Date(2024, 0, 1 + i)) : ''));
}

export interface KalenderProps {
  st: Schreibstatistik;
  heute: string;
  wochen?: number;
  gewaehlt: string;
  onWaehlen(tag: string): void;
}

function zellenLabel(t: KalenderTag, heute: string, ziel: number): string {
  const k = texte().statistik.kalender;
  const teile = [
    t.tag === heute ? f(k.heute, { tag: tagAnzeige(t.tag) }) : tagAnzeige(t.tag),
    t.woerter > 0 ? f(k.geschrieben, { woerter: woerterText(t.woerter) }) : k.nichts,
  ];
  if (ziel > 0 && t.zielErreicht) teile.push(k.zielErreicht);
  return teile.join(', ');
}

export function Kalender({ st, heute, wochen = 53, gewaehlt, onWaehlen }: KalenderProps) {
  const k = useTexte().statistik.kalender;
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
        {wochentage().map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div ref={raster} className="pw-st-kalender__raster" role="group" aria-label={k.raster} onKeyDown={bewegen}>
        {daten.map((w, wi) => {
          const monatsErster = w.tage.find((t) => t.tag.endsWith('-01'));
          const naechsteBeginnt = daten[1]?.tage.some((t) => t.tag.endsWith('-01')) ?? false;
          const zeigeMonat = monatsErster ?? (wi === 0 && !naechsteBeginnt ? w.tage[0] : undefined);
          const [j, m] = (zeigeMonat?.tag ?? '').split('-').map(Number);
          return [
            <span key={`m-${w.beginn}`} className="pw-st-kalender__monat" aria-hidden="true">
              {zeigeMonat && wi < daten.length - 1 ? datumsFormat('monat').format(new Date(j!, m! - 1, 1)) : ''}
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
                  title={mitZahl(k.zelle, t.woerter, { tag: tagAnzeige(t.tag) })}
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
  const k = useTexte().statistik.kalender;
  return (
    <div className="pw-st-legende" aria-hidden="true">
      <span>{ziel > 0 ? k.unterHalb : k.weniger}</span>
      {[0, 1, 2, 3, 4].map((s) => (
        <span key={s} className="pw-st-zelle" data-stufe={s} />
      ))}
      <span>{ziel > 0 ? k.abAnderthalb : k.mehr}</span>
    </div>
  );
}
