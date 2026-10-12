import { useEffect } from 'react';
import { VorschauEbene } from '../features/vorschau';
import { useSprache } from '../i18n';
import { useStore } from '../state/store';
import { bereichDefinition, bereicheVorladen, useBereichModul } from './bereiche';
import { deepLinkAnwenden } from './deeplink';
import { Fehlergrenze } from './Fehlergrenze';
import { Seitenleiste } from './Seitenleiste';
import { Titelleiste } from './Titelleiste';

function BereichInhalt() {
  const bereich = useStore((s) => s.bereich);
  const modul = useBereichModul(bereich);
  if (!modul) return <div className="pw-laden" aria-busy="true" />;
  const Ansicht = modul.default;
  return <Ansicht />;
}

/** Fenster mit Titelleiste, Seitenleiste und Inhalt des aktiven Bereichs. */
export function Rahmen() {
  const bereich = useStore((s) => s.bereich);
  const fokus = useStore((s) => s.fokusModus);
  const modul = useBereichModul(bereich);
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
