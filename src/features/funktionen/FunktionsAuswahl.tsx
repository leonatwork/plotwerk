/**
 * Funktionsauswahl (E16): Funktionen nach Gruppen mit Kurzbeschreibung, Abhängigkeiten, KI-Kennzeichen und einem
 * Beispiel aus dem Demo-Roman; darunter „Als eigenes Preset speichern“. Gemeinsam für Assistent und Einstellungen.
 */
import { useState, type FormEvent } from 'react';
import {
  ausschalten,
  eigenesPresetLoeschen,
  eigenesPresetSpeichern,
  einschalten,
  FUNKTIONEN,
  FUNKTIONS_GRUPPEN,
  istPresetId,
  kiStufe,
  normalisiere,
  type FunktionDefinition,
  type FunktionsProfil,
  profilMitAuswahl,
} from '@core/funktionen';
import { f, liste, useTexte, type Woerterbuch } from '../../i18n';
import { Abschnittslabel, Button, Chip, Textfeld } from '../../ui';
import './funktionen.css';

type T = Woerterbuch['funktionen'];

/** Name des Ausgangspunkts: Schreibertyp, eigenes Preset oder „Eigene Auswahl“. */
export function basisName(profil: FunktionsProfil, t: T): string {
  if (istPresetId(profil.basis)) return t.presets[profil.basis].name;
  return profil.eigenePresets.find((p) => p.id === profil.basis)?.name ?? t.eigen;
}

/** „{an} von {gesamt} Funktionen sichtbar“ (ohne KI-Funktionen im No-AI-Modus). */
export function zaehlerText(profil: FunktionsProfil, t: T): string {
  const an = normalisiere(profil.funktionen).filter((id) => !(profil.kiAus && FUNKTIONEN.find((x) => x.id === id)?.ki)).length;
  return f(t.zaehler, { an, gesamt: FUNKTIONEN.length });
}

/** Eine Zeile für Einstellungen und Assistent: „Profi · 17 von 22 Funktionen sichtbar · KI-Nutzung: mittel“. */
export function profilZusammenfassung(profil: FunktionsProfil, t: T): string {
  return f(t.assistent.zusammenfassung, {
    typ: basisName(profil, t),
    zaehler: zaehlerText(profil, t),
    ki: t.kiStufe[kiStufe(profil.funktionen, profil.kiAus)],
  });
}

function Zeile({
  def,
  an,
  kiGesperrt,
  onUmschalten,
}: {
  def: FunktionDefinition;
  an: boolean;
  kiGesperrt: boolean;
  onUmschalten(an: boolean): void;
}) {
  const t = useTexte().funktionen;
  const [beispiel, setBeispiel] = useState(false);
  const text = t.liste[def.id];
  const gesperrt = !!def.pflicht || (kiGesperrt && !!def.ki);
  const braucht = (def.braucht ?? []).map((b) => t.liste[b].name);
  const beispielId = `pw-fu-beispiel-${def.id}`;
  return (
    <li className={gesperrt && !def.pflicht ? 'pw-fu-zeile pw-fu-zeile--gesperrt' : 'pw-fu-zeile'}>
      <div className="pw-fu-zeile__kopf">
        <label className="pw-fu-zeile__label">
          <input type="checkbox" checked={an && !(kiGesperrt && def.ki)} disabled={gesperrt} onChange={(e) => onUmschalten(e.target.checked)} />
          <span className="pw-fu-zeile__name">{text.name}</span>
        </label>
        {def.pflicht && <span className="pw-fu-marke">{t.pflicht}</span>}
        {def.ki && def.kiModell && (
          <span className="pw-fu-marke pw-fu-marke--ki">{kiGesperrt ? t.kiStufe.aus : f(t.kiMarke, { modell: t.modell[def.kiModell] })}</span>
        )}
        <Button variante="text" klein aria-expanded={beispiel} aria-controls={beispielId} onClick={() => setBeispiel(!beispiel)} style={{ marginLeft: 'auto' }}>
          {t.beispielZeigen}
        </Button>
      </div>
      <p className="pw-fu-zeile__kurz">{text.kurz}</p>
      {braucht.length > 0 && <p className="pw-fu-zeile__braucht">{f(t.braucht, { liste: liste(braucht) })}</p>}
      {beispiel && (
        <div id={beispielId} className="pw-fu-beispiel">
          <span className="pw-fu-beispiel__titel">{t.beispielTitel}</span>
          {text.beispiel}
        </div>
      )}
    </li>
  );
}

function PresetSpeichern({ profil, onChange }: { profil: FunktionsProfil; onChange(p: FunktionsProfil): void }) {
  const t = useTexte().funktionen;
  const [name, setName] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);
  const speichern = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onChange(eigenesPresetSpeichern(profil, name));
    setMeldung(f(t.presetSpeichern.gespeichert, { name: name.trim() }));
    setName('');
  };
  return (
    <section className="pw-fu-preset" aria-labelledby="pw-fu-preset-titel">
      <Abschnittslabel as="h3" id="pw-fu-preset-titel">
        {t.presetSpeichern.label}
      </Abschnittslabel>
      <form className="pw-fu-preset__form" onSubmit={speichern}>
        <Textfeld
          aria-labelledby="pw-fu-preset-titel"
          placeholder={t.presetSpeichern.platzhalter}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMeldung(null);
          }}
        />
        <Button type="submit" disabled={!name.trim()}>
          {t.presetSpeichern.knopf}
        </Button>
      </form>
      {meldung && (
        <p className="pw-fu-klein" role="status">
          {meldung}
        </p>
      )}
      {profil.eigenePresets.length > 0 && (
        <div className="pw-fu-preset__liste">
          <span className="pw-fu-klein">{t.presetSpeichern.eigene}</span>
          {profil.eigenePresets.map((p) => (
            <Chip key={p.id} variante="umrandet">
              {p.name}
              <button
                type="button"
                className="pw-fu-preset__loeschen"
                aria-label={f(t.presetSpeichern.loeschen, { name: p.name })}
                onClick={() => onChange(eigenesPresetLoeschen(profil, p.id))}
              >
                ×
              </button>
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

export interface FunktionsAuswahlProps {
  profil: FunktionsProfil;
  onChange(profil: FunktionsProfil): void;
  /** Preset-Speichern anbieten (Standard: ja) */
  presetSpeichern?: boolean;
}

export function FunktionsAuswahl({ profil, onChange, presetSpeichern = true }: FunktionsAuswahlProps) {
  const t = useTexte().funktionen;
  const auswahl = new Set(normalisiere(profil.funktionen));
  const umschalten = (def: FunktionDefinition, an: boolean) =>
    onChange(profilMitAuswahl(profil, an ? einschalten(auswahl, def.id) : ausschalten(auswahl, def.id)));
  return (
    <div className="pw-fu-auswahl">
      <div className="pw-fu-auswahl__kopf" role="status">
        <span>{zaehlerText(profil, t)}</span>
        <span className="pw-fu-marke pw-fu-marke--ki">{t.kiStufe[kiStufe(profil.funktionen, profil.kiAus)]}</span>
      </div>
      {FUNKTIONS_GRUPPEN.map((g) => (
        <section key={g} className="pw-fu-gruppe" aria-labelledby={`pw-fu-gruppe-${g}`}>
          <Abschnittslabel as="h3" id={`pw-fu-gruppe-${g}`}>
            {t.gruppen[g]}
          </Abschnittslabel>
          <ul className="pw-fu-liste">
            {FUNKTIONEN.filter((d) => d.gruppe === g).map((d) => (
              <Zeile key={d.id} def={d} an={auswahl.has(d.id)} kiGesperrt={profil.kiAus} onUmschalten={(an) => umschalten(d, an)} />
            ))}
          </ul>
        </section>
      ))}
      <p className="pw-fu-klein">{t.ausgeblendetHinweis}</p>
      <p className="pw-fu-klein">{t.tokenHinweis}</p>
      {presetSpeichern && <PresetSpeichern profil={profil} onChange={onChange} />}
    </div>
  );
}
