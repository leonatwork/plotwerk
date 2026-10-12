/** Abschnitt „Funktionen“ im Einstellungen-Dialog (E15): aktueller Umfang, anpassen, Assistent erneut starten. */
import { f, useTexte } from '../../i18n';
import { oeffneAssistent, useFunktionsProfil } from '../../state/funktionen';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button } from '../../ui';
import { profilZusammenfassung } from './FunktionsAuswahl';
import './funktionen.css';

export function FunktionenEinstellungen() {
  const T = useTexte().funktionen;
  const profil = useFunktionsProfil();
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const schliesseDialog = useStore((s) => s.schliesseDialog);
  return (
    <section className="pw-ki-abschnitt" aria-labelledby="einstellungen-funktionen">
      <Abschnittslabel as="h3" id="einstellungen-funktionen">
        {T.einstellungen.abschnitt}
      </Abschnittslabel>
      <p className="pw-ki-klein">{f(T.einstellungen.aktuell, { zusammenfassung: profilZusammenfassung(profil, T) })}</p>
      {profil.kiAus && <p className="pw-ki-klein">{T.kiAus.aktiv}</p>}
      <div className="pw-fu-chips">
        <Button onClick={() => oeffneDialog('funktionen')}>{T.einstellungen.anpassen}</Button>
        <Button
          variante="text"
          onClick={() => {
            schliesseDialog();
            oeffneAssistent();
          }}
        >
          {T.einstellungen.assistent}
        </Button>
      </div>
    </section>
  );
}
