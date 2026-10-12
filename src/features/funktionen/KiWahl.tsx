/**
 * Mit oder ohne KI (E17). „Ohne KI“ nennt konkret, welche gewählten Funktionen dann fehlen. In den Einstellungen
 * fragt die App vorher nach (`nachfragen`), im Assistenten steht die Warnung direkt darunter.
 */
import { kiFunktionen, type FunktionsProfil } from '@core/funktionen';
import { f, liste, texte, useTexte } from '../../i18n';
import { bestaetigen, klassen } from '../../ui';
import './funktionen.css';

/** Warnung vor dem No-AI-Modus: welche der gewählten Funktionen wegfallen. */
export function kiAusWarnung(profil: FunktionsProfil): string {
  const t = texte().funktionen;
  const weg = kiFunktionen(profil.funktionen).map((id) => t.liste[id].name);
  return weg.length ? f(t.kiAus.warnung, { n: weg.length, liste: liste(weg) }) : t.kiAus.warnungLeer;
}

export interface KiWahlProps {
  profil: FunktionsProfil;
  onChange(profil: FunktionsProfil): void;
  /** vor dem Ausschalten bestätigen lassen (Einstellungen) */
  nachfragen?: boolean;
}

export function KiWahl({ profil, onChange, nachfragen }: KiWahlProps) {
  const t = useTexte().funktionen;
  const waehle = async (kiAus: boolean) => {
    if (kiAus === profil.kiAus) return;
    if (kiAus && nachfragen) {
      const ok = await bestaetigen(kiAusWarnung(profil), { titel: t.kiAus.warnungTitel, knopf: t.kiAus.bestaetigen });
      if (!ok) return;
    }
    onChange({ ...profil, kiAus });
  };
  const option = (kiAus: boolean, titel: string, text: string) => (
    <label className={klassen('pw-fu-karte', profil.kiAus === kiAus && 'pw-fu-karte--aktiv')}>
      <input type="radio" name="pw-fu-ki" checked={profil.kiAus === kiAus} onChange={() => void waehle(kiAus)} />
      <span className="pw-fu-karte__text">
        <span className="pw-fu-karte__titel">{titel}</span>
        <span className="pw-fu-karte__kurz">{text}</span>
      </span>
    </label>
  );
  return (
    <div className="pw-fu-ki" role="radiogroup" aria-label={t.assistent.kiFrage}>
      {option(false, t.assistent.mitKi, t.assistent.mitKiKurz)}
      {option(true, t.kiAus.schalter, t.kiAus.kurz)}
      {profil.kiAus && !nachfragen && (
        <p className="pw-fu-warnung" role="status">
          {kiAusWarnung(profil)}
        </p>
      )}
    </div>
  );
}
