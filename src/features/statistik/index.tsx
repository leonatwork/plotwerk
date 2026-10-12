/**
 * Bereich „Statistik“ (G5): Schreibziele, Wörter pro Tag als Kalender, Schreibstrecke, Fortschritt je Akt und
 * benannte Fassungen. Besitzer: G5.
 */
import { BLOCK_WOERTER, PUFFER_MINUTEN, woerterAm } from '@core/statistik';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { f, prozent, sprache, texte, useTexte } from '../../i18n';
import type { StatistikAnsicht } from '../../state/slices/statistik';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Feld, Inspektor, Segment, Textfeld, Werkzeugseite } from '../../ui';
import { useGesamtWoerter } from '../schreiben/Statusleiste';
import { Fassungen } from './Fassungen';
import { tagAnzeige, useHeute, useSchreibstatistik, woerterText, zahl } from './hooks';
import { Ueberblick } from './Ueberblick';
import './statistik.css';
import { useFunktion } from '../../state/funktionen';

const ANSICHTEN: StatistikAnsicht[] = ['ueberblick', 'fassungen'];

/** Zahl aus einem Eingabefeld („80.000“, „80 000“, engl. „80,000“); leer = undefined, ungültig = NaN. */
function zahlLesen(s: string): number | undefined {
  const t = s.replace(sprache() === 'en' ? /[\s,’']/g : /[\s.’']/g, '').trim();
  if (!t) return undefined;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

function ZieleFormular({ fokusAnfrage }: { fokusAnfrage: number }) {
  const st = useSchreibstatistik();
  const zielSetzen = useStore((s) => s.statistik.zielSetzen);
  const [tag, setTag] = useState('');
  const [buch, setBuch] = useState('');
  const [abgabe, setAbgabe] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const erstes = useRef<HTMLInputElement>(null);
  const t = useTexte().statistik.ziele;

  const ausSpeicher = () => {
    setTag(st.ziel.tagWoerter > 0 ? String(st.ziel.tagWoerter) : '');
    setBuch(st.ziel.buchWoerter ? String(st.ziel.buchWoerter) : '');
    setAbgabe(st.ziel.abgabe ?? '');
  };
  useEffect(ausSpeicher, [st.ziel.tagWoerter, st.ziel.buchWoerter, st.ziel.abgabe]);

  useEffect(() => {
    if (fokusAnfrage > 0) {
      erstes.current?.focus();
      erstes.current?.select();
    }
  }, [fokusAnfrage]);

  const geaendert =
    tag !== (st.ziel.tagWoerter > 0 ? String(st.ziel.tagWoerter) : '') || buch !== (st.ziel.buchWoerter ? String(st.ziel.buchWoerter) : '') || abgabe !== (st.ziel.abgabe ?? '');

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    const tw = zahlLesen(tag);
    const b = zahlLesen(buch);
    if (Number.isNaN(tw) || Number.isNaN(b)) {
      setFehler(t.fehlerZahlen);
      return;
    }
    if (abgabe && !/^\d{4}-\d{2}-\d{2}$/.test(abgabe)) {
      setFehler(t.fehlerDatum);
      return;
    }
    setFehler(null);
    try {
      await zielSetzen({ tagWoerter: tw ?? 0, buchWoerter: b || undefined, abgabe: abgabe || undefined });
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 1800);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="pw-st-insp__abschnitt" onSubmit={absenden} aria-labelledby="pw-st-ziele-titel">
      <Abschnittslabel as="h2" id="pw-st-ziele-titel">
        {t.titel}
      </Abschnittslabel>
      <Feld label={t.tagesziel}>
        {(id) => <Textfeld ref={erstes} id={id} inputMode="numeric" placeholder={t.tageszielPlatzhalter} value={tag} onChange={(e) => setTag(e.target.value)} />}
      </Feld>
      <Feld label={t.zielumfang}>
        {(id) => <Textfeld id={id} inputMode="numeric" placeholder={t.zielumfangPlatzhalter} value={buch} onChange={(e) => setBuch(e.target.value)} />}
      </Feld>
      <Feld label={t.abgabe}>{(id) => <Textfeld id={id} type="date" value={abgabe} onChange={(e) => setAbgabe(e.target.value)} />}</Feld>
      {fehler && <span className="pw-st-fehler">{fehler}</span>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {gespeichert && !geaendert && <span className="pw-st-leise">{t.gesichert}</span>}
        {geaendert && (
          <Button klein onClick={ausSpeicher}>
            {t.zuruecksetzen}
          </Button>
        )}
        <Button klein variante="primaer" type="submit" disabled={!geaendert}>
          {t.sichern}
        </Button>
      </div>
    </form>
  );
}

function TagDetails({ tag, heute }: { tag: string; heute: string }) {
  const st = useSchreibstatistik();
  const gesamt = useGesamtWoerter();
  const eintrag = st.tage[tag];
  const geschrieben = woerterAm(st, tag);
  const ziel = st.ziel.tagWoerter;
  const stand = tag === heute ? gesamt : eintrag?.stand;
  const t = useTexte().statistik.tag;
  return (
    <section className="pw-st-insp__abschnitt" aria-labelledby="pw-st-tag-titel" aria-live="polite">
      <Abschnittslabel>{tag === heute ? t.heute : t.ausgewaehlt}</Abschnittslabel>
      <span className="pw-st-insp__tag" id="pw-st-tag-titel">
        {tagAnzeige(tag)}
      </span>
      <dl>
        <dt>{t.geschrieben}</dt>
        <dd>{woerterText(geschrieben)}</dd>
        {ziel > 0 && (
          <>
            <dt>{t.tagesziel}</dt>
            <dd>{geschrieben >= ziel ? t.erreicht : prozent(geschrieben / ziel)}</dd>
          </>
        )}
        {stand !== undefined && eintrag && (
          <>
            <dt>{tag === heute ? t.buchJetzt : t.buchAbend}</dt>
            <dd>{woerterText(stand)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function Zaehlregel() {
  const t = useTexte().statistik.regel;
  return (
    <section className="pw-st-insp__abschnitt" aria-labelledby="pw-st-regel-titel">
      <Abschnittslabel as="h2" id="pw-st-regel-titel">
        {t.titel}
      </Abschnittslabel>
      <ul className="pw-st-regel">
        <li>{t.tag}</li>
        <li>{t.loeschen}</li>
        <li>{f(t.verschieben, { woerter: BLOCK_WOERTER, minuten: PUFFER_MINUTEN })}</li>
        <li>{t.import}</li>
      </ul>
    </section>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const gewaehlteAnsicht = useStore((s) => s.statistik.ansicht);
  // ohne Fassungen (E16) nur der Überblick
  const mitFassungen = useFunktion('fassungen');
  const ansicht: StatistikAnsicht = mitFassungen ? gewaehlteAnsicht : 'ueberblick';
  const setzeAnsicht = useStore((s) => s.statistik.setzeAnsicht);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const anzahlFassungen = useStore((s) => s.daten?.fassungen?.length ?? 0);
  const st = useSchreibstatistik();
  const heute = useHeute();
  const gesamt = useGesamtWoerter();
  const [tag, setTag] = useState(heute);
  const [zielFokus, setZielFokus] = useState(0);
  const tt = useTexte().statistik;
  const t = tt.ansicht;

  useEffect(() => setTag(heute), [heute]);
  if (!daten) return null;

  const ziel = st.ziel.tagWoerter;
  const hinweis = ziel ? f(t.hinweisZiel, { woerter: woerterText(gesamt), ziel: zahl.format(ziel) }) : woerterText(gesamt);

  return (
    <Werkzeugseite
      titel={tt.titel}
      hinweis={hinweis}
      inspektor={
        <Inspektor label={t.inspektor} breite={320}>
          <div className="pw-st-insp">
            <TagDetails tag={tag} heute={heute} />
            <ZieleFormular fokusAnfrage={zielFokus} />
            <Zaehlregel />
          </div>
        </Inspektor>
      }
    >
      <div className="pw-st-seite">
        {mitFassungen && (
          <div className="pw-st-leiste">
            <Segment<StatistikAnsicht>
              label={t.label}
              rolle="tablist"
              voll={false}
              optionen={ANSICHTEN.map((wert) => ({
                wert,
                label: wert === 'ueberblick' ? t.ueberblick : anzahlFassungen ? f(t.fassungenAnzahl, { n: anzahlFassungen }) : t.fassungen,
                steuert: 'pw-st-ansicht',
              }))}
              wert={ansicht}
              onChange={setzeAnsicht}
            />
            <span style={{ display: 'flex', gap: 8 }}>
              <Button klein onClick={() => oeffneDialog('versionsvergleich')}>
                {t.vergleichen}
              </Button>
              <Button klein variante="primaer" onClick={() => oeffneDialog('fassung')}>
                {t.sichern}
              </Button>
            </span>
          </div>
        )}
        <div id="pw-st-ansicht" role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ansicht === 'ueberblick' ? (
            <Ueberblick st={st} heute={heute} tag={tag} onTag={setTag} onZielBearbeiten={() => setZielFokus((n) => n + 1)} />
          ) : (
            <Fassungen />
          )}
        </div>
      </div>
    </Werkzeugseite>
  );
}

export function kontext(state: Store): string {
  const t = texte().statistik;
  return state.statistik.ansicht === 'fassungen' ? t.fassungenTitel : t.titel;
}
