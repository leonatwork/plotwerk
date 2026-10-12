/**
 * Tagesziel in der Statusleiste des Editors: kleiner Fortschrittsring + „312 / 500 heute“. Besitzer: G5.
 * Rendert nichts, solange kein Tagesziel gesetzt ist. Klick öffnet den Bereich „Statistik“.
 */
import { woerterAm } from '@core/statistik';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';
import { useHeute, useSchreibstatistik, zahl } from './hooks';
import { Ring } from './Ring';
import './statistik.css';

export function SchreibzielAnzeige() {
  const st = useSchreibstatistik();
  const heute = useHeute();
  const setzeBereich = useStore((s) => s.setzeBereich);
  const ziel = st.ziel.tagWoerter;
  if (!ziel || ziel <= 0) return null;
  const geschrieben = woerterAm(st, heute);
  const erreicht = geschrieben >= ziel;
  const text = `Tagesziel: ${zahl.format(geschrieben)} von ${zahl.format(ziel)} Wörtern${erreicht ? ' – erreicht' : ''}`;
  return (
    <button
      type="button"
      className={klassen('pw-st-ziel', erreicht && 'pw-st-ziel--erreicht')}
      title={`${text}. Statistik öffnen`}
      aria-label={`${text}. Statistik öffnen`}
      onClick={() => setzeBereich('statistik')}
    >
      <Ring anteil={geschrieben / ziel} groesse={14} staerke={2.5} erreicht={erreicht} />
      <span aria-hidden="true">
        {zahl.format(geschrieben)} / {zahl.format(ziel)}
      </span>
    </button>
  );
}
