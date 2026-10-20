import { lazy, Suspense, useEffect } from 'react';
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
import { useFunktionsStore } from '../state/funktionen';

const Assistent = lazy(() => import('../features/funktionen/Assistent').then((m) => ({ default: m.Assistent })));

export function App() {
  const ladeStatus = useStore((s) => s.ladeStatus);
  const fehler = useStore((s) => s.fehler);
  const sicherungsHinweis = useStore((s) => s.sicherungsHinweis);
  const initialisieren = useStore((s) => s.initialisieren);
  const assistentOffen = useFunktionsStore((s) => s.assistentOffen);
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
      {sicherungsHinweis && <div role="alert" className="pw-fehler"><span>{sicherungsHinweis}</span><Button onClick={() => useStore.setState({ sicherungsHinweis: null })}>{t.gemeinsam.schliessen}</Button></div>}
      {assistentOffen && (
        <Suspense fallback={null}>
          <Assistent />
        </Suspense>
      )}
      <BestaetigungHost />
    </div>
  );
}
