/**
 * Dialog „Funktionen“ (Einstellungen → Funktionen anpassen …, E15): Ausgangspunkt wählen, Funktionen ein- und
 * ausblenden, eigene Presets, No-AI-Modus. Übernommen wird erst mit „Übernehmen“.
 */
import { useState } from 'react';
import { PRESET_IDS, profilMitEigenemPreset, profilMitPreset, type FunktionsProfil } from '@core/funktionen';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { useTexte } from '../../i18n';
import { setzeFunktionsProfil, useFunktionsStore } from '../../state/funktionen';
import { Abschnittslabel, Button, Chip, Dialog } from '../../ui';
import { FunktionsAuswahl } from './FunktionsAuswahl';
import { KiWahl } from './KiWahl';
import './funktionen.css';

export function FunktionenDialog({ schliessen }: DialogKomponentenProps) {
  const t = useTexte();
  const T = t.funktionen;
  const [profil, setProfil] = useState<FunktionsProfil>(() => useFunktionsStore.getState().profil);
  const uebernehmen = async () => {
    await setzeFunktionsProfil(profil);
    schliessen();
  };
  return (
    <Dialog
      titel={T.einstellungen.dialogTitel}
      onSchliessen={schliessen}
      breite={720}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" onClick={() => void uebernehmen()}>
            {t.gemeinsam.uebernehmen}
          </Button>
        </>
      }
    >
      <section className="pw-ki-abschnitt" aria-labelledby="pw-fu-ausgang">
        <Abschnittslabel as="h3" id="pw-fu-ausgang">
          {T.einstellungen.presetLabel}
        </Abschnittslabel>
        <div className="pw-fu-chips" role="group" aria-labelledby="pw-fu-ausgang">
          {PRESET_IDS.map((id) => (
            <Chip key={id} variante="knopf" aktiv={profil.basis === id} title={T.presets[id].frage} onClick={() => setProfil(profilMitPreset(profil, id))}>
              {T.presets[id].name}
            </Chip>
          ))}
          {profil.eigenePresets.map((p) => (
            <Chip key={p.id} variante="knopf" aktiv={profil.basis === p.id} onClick={() => setProfil(profilMitEigenemPreset(profil, p.id))}>
              {p.name}
            </Chip>
          ))}
          {profil.basis === 'eigen' && (
            <Chip variante="knopf" aktiv onClick={() => undefined}>
              {T.eigen}
            </Chip>
          )}
        </div>
      </section>
      <section className="pw-ki-abschnitt" aria-label={T.assistent.kiFrage}>
        <KiWahl profil={profil} onChange={setProfil} nachfragen />
      </section>
      <FunktionsAuswahl profil={profil} onChange={setProfil} />
    </Dialog>
  );
}

export default FunktionenDialog;
