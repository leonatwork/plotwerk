import { useEffect, useRef } from 'react';
import { VorschauEbene } from '../features/vorschau';
import { useSprache } from '../i18n';
import { useFunktionsStore } from '../state/funktionen';
import { useStore } from '../state/store';
import { bereichDefinition, bereicheVorladen, useBereichModul } from './bereiche';
import { deepLinkAnwenden } from './deeplink';
import { Fehlergrenze } from './Fehlergrenze';
import { BEREICH_FUNKTION, funktionSicherstellen } from './funktionen';
import { Seitenleiste } from './Seitenleiste';
import { Titelleiste } from './Titelleiste';

function BereichInhalt() {
  const bereich = useStore((s) => s.bereich);
  const modul = useBereichModul(bereich);
  if (!modul) return <div className="pw-laden" aria-busy="true" />;
  const Ansicht = modul.default;
  return <Ansicht />;
}

/**
 * Aktiver Bereich ausgeblendet (E16): Kam man per Verweis dorthin, fragt die App, ob sie ihn einblenden soll; wurde
 * er gerade ausgeblendet (Einstellungen), geht es still zurück zum Schreiben.
 */
function useBereichSichtbar() {
  const bereich = useStore((s) => s.bereich);
  const aktiv = useFunktionsStore((s) => s.aktiv);
  const vorher = useRef(bereich);
  useEffect(() => {
    const navigiert = vorher.current !== bereich;
    vorher.current = bereich;
    const id = BEREICH_FUNKTION[bereich];
    if (aktiv.has(id)) return;
    const zurueck = () => {
      if (useStore.getState().bereich === bereich) useStore.getState().setzeBereich('schreiben');
    };
    if (!navigiert) return zurueck();
    void funktionSicherstellen(id).then((ok) => ok || zurueck());
  }, [bereich, aktiv]);
}

/** Fenster mit Titelleiste, Seitenleiste und Inhalt des aktiven Bereichs. */
export function Rahmen() {
  const bereich = useStore((s) => s.bereich);
  const fokus = useStore((s) => s.fokusModus);
  const modul = useBereichModul(bereich);
  useBereichSichtbar();
  // Bereichsnamen folgen der Oberflächensprache: beim Umschalten neu zeichnen
  useSprache();
  useEffect(() => {
    const id = window.setTimeout(bereicheVorladen, 300);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const anwenden = () => deepLinkAnwenden(window.location.hash, useStore.getState());
    anwenden();
    window.addEventListener('hashchange', anwenden);
    return () => window.removeEventListener('hashchange', anwenden);
  }, []);
  return (
    <>
      <Titelleiste modul={modul} />
      <div className="pw-koerper">
        {!fokus && <Seitenleiste modul={modul} />}
        <main className="pw-inhalt" aria-label={bereichDefinition(bereich).titel}>
          <Fehlergrenze bereich={bereichDefinition(bereich).titel} schluessel={bereich}>
            <BereichInhalt />
          </Fehlergrenze>
        </main>
      </div>
      <VorschauEbene />
    </>
  );
}
