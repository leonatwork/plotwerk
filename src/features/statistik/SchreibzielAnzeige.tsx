/**
 * Tagesziel in der Statusleiste des Editors: kleiner Fortschrittsring + „312 / 500 heute“. Besitzer: G5.
 * Rendert nichts, solange kein Tagesziel gesetzt ist. Klick öffnet den Bereich „Statistik“.
 */
import { woerterAm } from '@core/statistik';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';
import { useHeute, useSchreibstatistik, zahl } from './hooks';
import { Ring } from './Ring';
import './statistik.css';

export function SchreibzielAnzeige() {
  const st = useSchreibstatistik();
  const heute = useHeute();
  const setzeBereich = useStore((s) => s.setzeBereich);
  const t = useTexte().statistik.ziel;
  const ziel = st.ziel.tagWoerter;
  if (!ziel || ziel <= 0) return null;
  const geschrieben = woerterAm(st, heute);
  const erreicht = geschrieben >= ziel;
  const text = f(erreicht ? t.textErreicht : t.text, { geschrieben: zahl.format(geschrieben), ziel: zahl.format(ziel) });
  const label = f(t.oeffnen, { text });
  return (
    <button
      type="button"
      className={klassen('pw-st-ziel', erreicht && 'pw-st-ziel--erreicht')}
      title={label}
      aria-label={label}
      onClick={() => setzeBereich('statistik')}
    >
      <Ring anteil={geschrieben / ziel} groesse={14} staerke={2.5} erreicht={erreicht} />
      <span aria-hidden="true">
        {zahl.format(geschrieben)} / {zahl.format(ziel)}
      </span>
    </button>
  );
}
