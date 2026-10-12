/** Zuordnung DialogId → Komponente (lazy). Die Feature-Dialoge gehören ihren Bereichen. */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { f, useTexte } from '../i18n';
import { useStore, type DialogId } from '../state/store';
import { Button, Dialog } from '../ui';
import type { DialogKomponentenProps } from './dialogTypen';
import { Fehlergrenze } from './Fehlergrenze';

type DialogKomponente = LazyExoticComponent<ComponentType<DialogKomponentenProps>>;

export const DIALOGE: Record<DialogId, DialogKomponente> = {
  import: lazy(() => import('../features/importexport/ImportDialog')),
  export: lazy(() => import('../features/importexport/ExportDialog')),
  versionen: lazy(() => import('../features/schreiben/VersionenDialog')),
  'ki-pruefen': lazy(() => import('../features/ki/PruefDialog')),
  'ki-einstellungen': lazy(() => import('../features/ki/EinstellungenDialog')),
  schnellsuche: lazy(() => import('./Schnellsuche')),
  funktionen: lazy(() => import('../features/funktionen/FunktionenDialog')),
  // Werkzeuge G1–G8
  'zeit-vorschlaege': lazy(() => import('../features/zeitleiste/ZeitVorschlagDialog')),
  'stimme-pruefen': lazy(() => import('../features/figuren/StimmeDialog')),
  'straenge-vorschlagen': lazy(() => import('../features/faeden/StraengeDialog')),
  figurenfakten: lazy(() => import('../features/figuren/FaktenDialog')),
  marken: lazy(() => import('../features/schreiben/werkzeuge/MarkenDialog')),
  fassung: lazy(() => import('../features/statistik/FassungDialog')),
  versionsvergleich: lazy(() => import('../features/statistik/VersionsvergleichDialog')),
  'leser-simulation': lazy(() => import('../features/fragen/LeserSimulationDialog')),
  'abgabe-export': lazy(() => import('../features/abgabe/AbgabeDialog')),
  rueckimport: lazy(() => import('../features/abgabe/RueckimportDialog')),
  'recherche-eintrag': lazy(() => import('../features/recherche/EintragDialog')),
};

/** Zeigt den aktiven Dialog aus dem Store (store.dialog). */
export function DialogHost() {
  const dialog = useStore((s) => s.dialog);
  const schliessen = useStore((s) => s.schliesseDialog);
  const t = useTexte();
  if (!dialog) return null;
  const Komponente = DIALOGE[dialog.id];
  return (
    <Fehlergrenze
      bereich={f(t.app.fehlergrenze.dialog, { id: dialog.id })}
      schluessel={dialog.id}
      ersatz={(fehler) => (
        <Dialog
          titel={t.app.dialogFehler.titel}
          onSchliessen={schliessen}
          aktionen={
            <>
              <Button onClick={() => window.location.reload()}>{t.app.dialogFehler.neuLaden}</Button>
              <Button variante="primaer" onClick={schliessen}>
                {t.gemeinsam.schliessen}
              </Button>
            </>
          }
        >
          <code className="pw-fehler__code">{fehler.message}</code>
        </Dialog>
      )}
    >
      <Suspense fallback={null}>
        <Komponente key={dialog.id} param={dialog.param} schliessen={schliessen} />
      </Suspense>
    </Fehlergrenze>
  );
}
