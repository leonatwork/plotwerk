import { useEffect } from 'react';
import { istTauri } from '../backend';
import { useTexte } from '../i18n';
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
  const t = useTexte();
  useTastenkuerzel();
  useEffect(() => {
    void initialisieren();
  }, [initialisieren]);

  return (
    <div className={istTauri() ? 'pw-fenster' : 'pw-fenster pw-fenster--browser'}>
      {ladeStatus === 'bereit' ? (
        <Fehlergrenze bereich={t.app.fehlergrenze.fenster}>
          <Rahmen />
        </Fehlergrenze>
      ) : ladeStatus === 'start' ? (
        <Startbildschirm />
      ) : ladeStatus === 'fehler' ? (
        <div role="alert" className="pw-fehler pw-fehler--voll">
          <strong>{t.app.laden.fehler}</strong>
          <code>{fehler}</code>
          <Button onClick={() => window.location.reload()}>{t.app.laden.neuLaden}</Button>
        </div>
      ) : (
        <div className="pw-laden" aria-busy="true" aria-label={t.app.laden.laedt} />
      )}
      <DialogHost />
      <BestaetigungHost />
    </div>
  );
}
