/** Bereich „Zeitleiste“ (G1 Zeit & Zustand): Kapitel/Szenen auf Tages- und Uhrzeit-Achse, Zustandsspuren. Besitzer: G1. */
import { SICHERHEIT_FARBE, SICHERHEIT_NAME, WOCHENTAG_NAME } from '@core/zeit/index';
import type { ZeitSicherheit } from '@core/model/types';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, Checkbox, LeerZustand, Segment, Werkzeugseite } from '../../ui';
import { farbe, SicherheitPunkt, useZeitDaten } from './gemeinsam';
import { ZeitInspektor } from './Inspektor';
import { Leiste } from './Leiste';
import './zeitleiste.css';

function Werkzeugzeile({ figur }: { figur?: string }) {
  const daten = useStore((s) => s.daten)!;
  const szenen = useStore((s) => s.zeit.szenen);
  const setzeSzenen = useStore((s) => s.zeit.setzeSzenen);
  const spuren = useStore((s) => s.zeit.spuren);
  const setzeSpur = useStore((s) => s.zeit.setzeSpur);
  const setzeFigur = useStore((s) => s.zeit.setzeFigur);
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? a.name.localeCompare(b.name, 'de') : a.rolle === 'haupt' ? -1 : 1));
  const hatSzenen = Object.values(daten.plaene).some((p) => (p.szenen?.length ?? 0) >= 2);
  return (
    <div className="zl-werkzeuge">
      <Segment<'kapitel' | 'szenen'>
        label="Einheit"
        rolle="group"
        groesse="klein"
        hintergrund="selected"
        wert={szenen && hatSzenen ? 'szenen' : 'kapitel'}
        onChange={(w) => setzeSzenen(w === 'szenen')}
        optionen={[
          { wert: 'kapitel', label: 'Kapitel' },
          { wert: 'szenen', label: hatSzenen ? 'Szenen' : 'Szenen (keine geplant)' },
        ]}
      />
      <Checkbox checked={spuren.ort} onChange={(e) => setzeSpur('ort', e.target.checked)}>
        Ort
      </Checkbox>
      <Checkbox checked={spuren.zustand} disabled={!figuren.length} onChange={(e) => setzeSpur('zustand', e.target.checked)}>
        Zustand von
      </Checkbox>
      {figuren.length > 0 && (
        <select className="zl-select" aria-label="Figur für die Zustandsspur" value={figur ?? ''} disabled={!spuren.zustand} onChange={(e) => setzeFigur(e.target.value || null)}>
          {figuren.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.rolle === 'haupt' ? '' : ' (Nebenfigur)'}
            </option>
          ))}
        </select>
      )}
      <div className="zl-werkzeuge__rechts zl-legende" aria-label="Sicherheit">
        {(['fest', 'ungefaehr', 'unklar'] as ZeitSicherheit[]).map((s) => (
          <span key={s} className="zl-legende__eintrag" style={farbe(SICHERHEIT_FARBE[s])}>
            <SicherheitPunkt sicherheit={s} />
            {SICHERHEIT_NAME[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const zd = useZeitDaten();
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const setzeBereich = useStore((s) => s.setzeBereich);
  if (!daten || !zd) return null;

  if (!daten.projekt.kapitel.length) {
    return (
      <Werkzeugseite titel="Zeitleiste">
        <LeerZustand titel="Noch keine Kapitel" aktionen={<Button onClick={() => setzeBereich('akte')}>Kapitel planen</Button>}>
          Sobald es Kapitel gibt, stehen sie hier auf einer Tages- und Uhrzeit-Achse – mit Ort und Zustand der Hauptfigur darunter.
        </LeerZustand>
      </Werkzeugseite>
    );
  }

  const mitTag = zd.einheiten.filter((e) => e.tag !== undefined).length;
  const hinweise = new Set([...zd.hinweise.values()].flat().map((h) => h.schluessel)).size;
  const offeneVorschlaege = zd.zeitVorschlaege.length + zd.zustandVorschlaege.length;
  const kopf = [
    `${mitTag} von ${zd.einheiten.length} ${zd.einheiten.some((e) => e.szene) ? 'Karten' : 'Kapiteln'} mit Tag`,
    zd.beginn.wochentag ? `Tag 1 = ${WOCHENTAG_NAME[zd.beginn.wochentag]}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Werkzeugseite titel="Zeitleiste" hinweis={kopf} inspektor={<ZeitInspektor zd={zd} />}>
      <div className="zl-seite">
        <Werkzeugzeile figur={zd.figur} />
        {mitTag === 0 && (
          <div className="zl-banner" role="status">
            <span>
              Noch kein Kapitel hat einen Tag. Wähle eine Karte und trag im Inspektor Tag und Tageszeit ein – oder lass dir Zeitpunkte mit Beleg vorschlagen.
            </span>
            <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
              Zeitpunkte vorschlagen …
            </Button>
          </div>
        )}
        {hinweise > 0 && (
          <div className="zl-banner zl-banner--warn" role="status">
            <span>
              {hinweise === 1 ? 'Ein Zeitwiderspruch' : `${hinweise} Zeitwidersprüche`} – Karten mit „!“ zeigen, wo. Die Prüfung läuft lokal, ohne KI.
            </span>
            <Button klein onClick={() => setzeBereich('hinweise')}>
              Hinweise ansehen
            </Button>
          </div>
        )}
        {offeneVorschlaege > 0 && mitTag > 0 && (
          <div className="zl-banner" role="status">
            <span>
              {offeneVorschlaege === 1 ? 'Ein Vorschlag der KI wartet' : `${offeneVorschlaege} Vorschläge der KI warten`} auf deine Entscheidung (Karten mit „KI“).
            </span>
            <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
              Alle ansehen
            </Button>
          </div>
        )}
        <Leiste zd={zd} />
      </div>
    </Werkzeugseite>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const bereit = useStore((s) => !!s.daten);
  return (
    <Button disabled={!bereit} onClick={() => oeffneDialog('zeit-vorschlaege')}>
      Vorschlagen …
    </Button>
  );
}

export function kontext(state: Store): string {
  const auswahl = state.zeit.auswahl;
  if (!auswahl || !state.daten) return 'Zeitleiste';
  const kapitel = auswahl.includes('#') ? auswahl.slice(0, auswahl.indexOf('#')) : auswahl;
  const nr = state.daten.projekt.kapitel.indexOf(kapitel) + 1;
  return nr > 0 ? `Zeitleiste · Kap. ${nr}` : 'Zeitleiste';
}
