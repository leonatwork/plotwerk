/** Bereich „Zeitleiste“ (G1 Zeit & Zustand): Kapitel/Szenen auf Tages- und Uhrzeit-Achse, Zustandsspuren. Besitzer: G1. */
import { SICHERHEIT_FARBE } from '@core/zeit/index';
import type { ZeitSicherheit } from '@core/model/types';
import { f, texte, useTexte, vergleich } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, Checkbox, LeerZustand, Segment, Werkzeugseite } from '../../ui';
import { farbe, SicherheitPunkt, sicherheitName, useZeitDaten, wochentagName } from './gemeinsam';
import { ZeitInspektor } from './Inspektor';
import { Leiste } from './Leiste';
import './zeitleiste.css';
import { NurMit } from '../../app/NurMit';
import { useFunktion } from '../../state/funktionen';

function Werkzeugzeile({ figur }: { figur?: string }) {
  const daten = useStore((s) => s.daten)!;
  const szenen = useStore((s) => s.zeit.szenen);
  const setzeSzenen = useStore((s) => s.zeit.setzeSzenen);
  const spuren = useStore((s) => s.zeit.spuren);
  const setzeSpur = useStore((s) => s.zeit.setzeSpur);
  const setzeFigur = useStore((s) => s.zeit.setzeFigur);
  const t = useTexte().zeitleiste.ansicht;
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? vergleich(a.name, b.name) : a.rolle === 'haupt' ? -1 : 1));
  const hatSzenen = Object.values(daten.plaene).some((p) => (p.szenen?.length ?? 0) >= 2);
  return (
    <div className="zl-werkzeuge">
      <Segment<'kapitel' | 'szenen'>
        label={t.einheit}
        rolle="group"
        groesse="klein"
        hintergrund="selected"
        wert={szenen && hatSzenen ? 'szenen' : 'kapitel'}
        onChange={(w) => setzeSzenen(w === 'szenen')}
        optionen={[
          { wert: 'kapitel', label: t.kapitel },
          { wert: 'szenen', label: hatSzenen ? t.szenen : t.szenenKeine },
        ]}
      />
      <Checkbox checked={spuren.ort} onChange={(e) => setzeSpur('ort', e.target.checked)}>
        {t.ort}
      </Checkbox>
      <Checkbox checked={spuren.zustand} disabled={!figuren.length} onChange={(e) => setzeSpur('zustand', e.target.checked)}>
        {t.zustandVon}
      </Checkbox>
      {figuren.length > 0 && (
        <select className="zl-select" aria-label={t.figurFuerSpur} value={figur ?? ''} disabled={!spuren.zustand} onChange={(e) => setzeFigur(e.target.value || null)}>
          {figuren.map((fig) => (
            <option key={fig.id} value={fig.id}>
              {fig.rolle === 'haupt' ? fig.name : f(t.nebenfigur, { name: fig.name })}
            </option>
          ))}
        </select>
      )}
      <div className="zl-werkzeuge__rechts zl-legende" aria-label={t.sicherheit}>
        {(['fest', 'ungefaehr', 'unklar'] as ZeitSicherheit[]).map((s) => (
          <span key={s} className="zl-legende__eintrag" style={farbe(SICHERHEIT_FARBE[s])}>
            <SicherheitPunkt sicherheit={s} />
            {sicherheitName(s)}
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
  const tz = useTexte().zeitleiste;
  const t = tz.ansicht;
  const mitKi = useFunktion('kiZeit');
  if (!daten || !zd) return null;

  if (!daten.projekt.kapitel.length) {
    return (
      <Werkzeugseite titel={tz.titel}>
        <LeerZustand titel={t.leerTitel} aktionen={<Button onClick={() => setzeBereich('akte')}>{t.leerAktion}</Button>}>
          {t.leerText}
        </LeerZustand>
      </Werkzeugseite>
    );
  }

  const mitTag = zd.einheiten.filter((e) => e.tag !== undefined).length;
  const hinweise = new Set([...zd.hinweise.values()].flat().map((h) => h.schluessel)).size;
  const offeneVorschlaege = zd.zeitVorschlaege.length + zd.zustandVorschlaege.length;
  const kopf = [
    f(zd.einheiten.some((e) => e.szene) ? t.kopfKarten : t.kopfKapitel, { mit: mitTag, n: zd.einheiten.length }),
    zd.beginn.wochentag ? f(t.tag1, { wochentag: wochentagName(zd.beginn.wochentag) }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Werkzeugseite titel={tz.titel} hinweis={kopf} inspektor={<ZeitInspektor zd={zd} />}>
      <div className="zl-seite">
        <Werkzeugzeile figur={zd.figur} />
        {mitTag === 0 && (
          <div className="zl-banner" role="status">
            <span>{t.ohneTag}</span>
            <NurMit funktion="kiZeit">
              <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
                {t.zeitpunkteVorschlagen}
              </Button>
            </NurMit>
          </div>
        )}
        {hinweise > 0 && (
          <div className="zl-banner zl-banner--warn" role="status">
            <span>{f(t.widersprueche, { n: hinweise })}</span>
            <Button klein onClick={() => setzeBereich('hinweise')}>
              {t.hinweiseAnsehen}
            </Button>
          </div>
        )}
        {mitKi && offeneVorschlaege > 0 && mitTag > 0 && (
          <div className="zl-banner" role="status">
            <span>{f(t.vorschlaegeWarten, { n: offeneVorschlaege })}</span>
            <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
              {t.alleAnsehen}
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
  const t = useTexte().zeitleiste.ansicht;
  return (
    <NurMit funktion="kiZeit">
      <Button disabled={!bereit} onClick={() => oeffneDialog('zeit-vorschlaege')}>
        {t.vorschlagen}
      </Button>
    </NurMit>
  );
}

export function kontext(state: Store): string {
  const t = texte().zeitleiste;
  const auswahl = state.zeit.auswahl;
  if (!auswahl || !state.daten) return t.titel;
  const kapitel = auswahl.includes('#') ? auswahl.slice(0, auswahl.indexOf('#')) : auswahl;
  const nr = state.daten.projekt.kapitel.indexOf(kapitel) + 1;
  return nr > 0 ? f(t.kontextKap, { nr }) : t.titel;
}
