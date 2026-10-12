/**
 * Einrichtungs-Assistent beim ersten Start (E16): Schreibertyp → Funktionen (mit Beispielen aus dem Demo-Roman) →
 * mit oder ohne KI → Fertig. Überspringen zeigt alles. Erneut starten: Einstellungen → Funktionen.
 */
import { useState } from 'react';
import {
  FUNKTION_IDS,
  PRESET_IDS,
  profilMitEigenemPreset,
  profilMitPreset,
  type FunktionsProfil,
  type PresetId,
} from '@core/funktionen';
import { f, useTexte } from '../../i18n';
import { schliesseAssistent, useFunktionsStore } from '../../state/funktionen';
import { Button, Dialog, klassen } from '../../ui';
import { FunktionsAuswahl, profilZusammenfassung } from './FunktionsAuswahl';
import { KiWahl } from './KiWahl';
import './funktionen.css';

const SCHRITTE = ['typ', 'funktionen', 'ki', 'fertig'] as const;
type Schritt = (typeof SCHRITTE)[number];

function TypKarte({ titel, text, aktiv, onClick }: { titel: string; text: string; aktiv: boolean; onClick(): void }) {
  return (
    <button type="button" className={klassen('pw-fu-karte', aktiv && 'pw-fu-karte--aktiv')} aria-pressed={aktiv} onClick={onClick}>
      <span className="pw-fu-karte__text">
        <span className="pw-fu-karte__titel">{titel}</span>
        <span className="pw-fu-karte__kurz">{text}</span>
      </span>
    </button>
  );
}

export function Assistent() {
  const offen = useFunktionsStore((s) => s.assistentOffen);
  const gespeichert = useFunktionsStore((s) => s.profil);
  if (!offen) return null;
  return <AssistentInhalt start={gespeichert} />;
}

function AssistentInhalt({ start }: { start: FunktionsProfil }) {
  const t = useTexte().funktionen;
  const T = t.assistent;
  const [profil, setProfil] = useState(start);
  // beim ersten Start ist noch kein Typ gewählt; beim erneuten Start der bisherige
  const [typ, setTyp] = useState<string | null>(start.eingerichtet ? start.basis : null);
  const [schritt, setSchritt] = useState<Schritt>('typ');
  const nr = SCHRITTE.indexOf(schritt);

  const fertig = (p: FunktionsProfil) => void schliesseAssistent(p);
  const typWaehlen = (p: FunktionsProfil) => {
    setProfil(p);
    setTyp(p.basis);
    setSchritt('funktionen');
  };
  const preset = (id: PresetId) => typWaehlen(profilMitPreset(profil, id));

  const aktionen =
    schritt === 'typ' ? (
      <Button variante="text" onClick={() => fertig({ ...profil, basis: 'autor', funktionen: [...FUNKTION_IDS] })}>
        {T.ueberspringen}
      </Button>
    ) : (
      <>
        <Button onClick={() => setSchritt(SCHRITTE[nr - 1]!)}>{T.zurueck}</Button>
        {schritt === 'fertig' ? (
          <Button variante="primaer" data-autofocus onClick={() => fertig(profil)}>
            {T.los}
          </Button>
        ) : (
          <Button variante="primaer" onClick={() => setSchritt(SCHRITTE[nr + 1]!)}>
            {T.weiter}
          </Button>
        )}
      </>
    );

  return (
    <Dialog titel={T.titel} onSchliessen={() => fertig(profil)} breite={720} modalFest seite={schritt} aktionen={aktionen} className="pw-fu-assistent">
      <ol className="pw-fu-schritte" aria-label={f(T.schritt, { nr: nr + 1, gesamt: SCHRITTE.length })}>
        {SCHRITTE.map((s, i) => (
          <li key={s} className={klassen('pw-fu-schritte__punkt', i === nr && 'pw-fu-schritte__punkt--aktiv', i < nr && 'pw-fu-schritte__punkt--fertig')} aria-current={i === nr ? 'step' : undefined}>
            {T.schritte[s]}
          </li>
        ))}
      </ol>

      {schritt === 'typ' && (
        <>
          <h3 className="pw-fu-frage">{T.typFrage}</h3>
          <p className="pw-fu-klein">{T.typText}</p>
          <div className="pw-fu-karten">
            {PRESET_IDS.map((id) => (
              <TypKarte key={id} titel={t.presets[id].name} text={t.presets[id].frage} aktiv={typ === id} onClick={() => preset(id)} />
            ))}
            <TypKarte
              titel={T.eigenText}
              text={T.eigenKurz}
              aktiv={typ === 'eigen'}
              onClick={() => typWaehlen({ ...profil, basis: 'eigen', funktionen: [...FUNKTION_IDS] })}
            />
          </div>
          {profil.eigenePresets.length > 0 && (
            <>
              <h4 className="pw-fu-unterfrage">{T.eigenePresets}</h4>
              <div className="pw-fu-karten">
                {profil.eigenePresets.map((p) => (
                  <TypKarte
                    key={p.id}
                    titel={p.name}
                    text={profilZusammenfassung(profilMitEigenemPreset(profil, p.id), t)}
                    aktiv={typ === p.id}
                    onClick={() => typWaehlen(profilMitEigenemPreset(profil, p.id))}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {schritt === 'funktionen' && (
        <>
          <h3 className="pw-fu-frage">{T.funktionenFrage}</h3>
          <p className="pw-fu-klein">{T.funktionenText}</p>
          <FunktionsAuswahl profil={profil} onChange={setProfil} />
        </>
      )}

      {schritt === 'ki' && (
        <>
          <h3 className="pw-fu-frage">{T.kiFrage}</h3>
          <p className="pw-fu-klein">{T.kiText}</p>
          <KiWahl profil={profil} onChange={setProfil} />
        </>
      )}

      {schritt === 'fertig' && (
        <>
          <h3 className="pw-fu-frage">{T.fertigTitel}</h3>
          <p className="pw-fu-zusammenfassung">{profilZusammenfassung(profil, t)}</p>
          <p className="pw-fu-klein">{T.fertigText}</p>
        </>
      )}
    </Dialog>
  );
}
