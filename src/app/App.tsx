import { useEffect } from 'react';
import { istTauri } from '../backend';
import { useStore } from '../state/store';
import { BestaetigungHost, Button } from '../ui';
import './app.css';
import { DialogHost } from './dialoge';
import { Fehlergrenze } from './Fehlergrenze';
import { Rahmen } from './Rahmen';
import { Startbildschirm } from './Startbildschirm';
import { useTastenkuerzel } from './tastenkuerzel';

export function App() {
  const ladeStatus = useStore((s) => s.ladeStatus);
  const fehler = useStore((s) => s.fehler);
  const initialisieren = useStore((s) => s.initialisieren);
  useTastenkuerzel();
  useEffect(() => {
    void initialisieren();
  }, [initialisieren]);

  return (
    <div className={istTauri() ? 'pw-fenster' : 'pw-fenster pw-fenster--browser'}>
      {ladeStatus === 'bereit' ? (
        <Fehlergrenze bereich="Fenster">
          <Rahmen />
        </Fehlergrenze>
      ) : ladeStatus === 'start' ? (
        <Startbildschirm />
      ) : ladeStatus === 'fehler' ? (
        <div role="alert" className="pw-fehler pw-fehler--voll">
          <strong>Das Projekt konnte nicht geladen werden.</strong>
          <code>{fehler}</code>
          <Button onClick={() => window.location.reload()}>Neu laden</Button>
        </div>
      ) : (
        <div className="pw-laden" aria-busy="true" aria-label="Lädt" />
      )}
      <DialogHost />
      <BestaetigungHost />
    </div>
  );
}
