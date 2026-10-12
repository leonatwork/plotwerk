/**
 * Bereich „Statistik“ (G5): Schreibziele, Wörter pro Tag als Kalender, Schreibstrecke, Fortschritt je Akt und
 * benannte Fassungen. Besitzer: G5.
 */
import { BLOCK_WOERTER, PUFFER_MINUTEN, woerterAm } from '@core/statistik';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { StatistikAnsicht } from '../../state/slices/statistik';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Feld, Inspektor, Segment, Textfeld, Werkzeugseite } from '../../ui';
import { useGesamtWoerter } from '../schreiben/Statusleiste';
import { Fassungen } from './Fassungen';
import { tagAnzeige, useHeute, useSchreibstatistik, woerterText, zahl } from './hooks';
import { Ueberblick } from './Ueberblick';
import './statistik.css';

const ANSICHTEN: { wert: StatistikAnsicht; label: string }[] = [
  { wert: 'ueberblick', label: 'Überblick' },
  { wert: 'fassungen', label: 'Fassungen' },
];

/** Zahl aus einem Eingabefeld („80.000“, „80 000“); leer = undefined, ungültig = NaN. */
function zahlLesen(s: string): number | undefined {
  const t = s.replace(/[\s.’']/g, '').trim();
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
    const t = zahlLesen(tag);
    const b = zahlLesen(buch);
    if (Number.isNaN(t) || Number.isNaN(b)) {
      setFehler('Bitte nur ganze Zahlen eingeben.');
      return;
    }
    if (abgabe && !/^\d{4}-\d{2}-\d{2}$/.test(abgabe)) {
      setFehler('Bitte ein gültiges Datum wählen.');
      return;
    }
    setFehler(null);
    try {
      await zielSetzen({ tagWoerter: t ?? 0, buchWoerter: b || undefined, abgabe: abgabe || undefined });
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 1800);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="pw-st-insp__abschnitt" onSubmit={absenden} aria-labelledby="pw-st-ziele-titel">
      <Abschnittslabel as="h2" id="pw-st-ziele-titel">
        Ziele
      </Abschnittslabel>
      <Feld label="Tagesziel (Wörter)">
        {(id) => <Textfeld ref={erstes} id={id} inputMode="numeric" placeholder="z. B. 500" value={tag} onChange={(e) => setTag(e.target.value)} />}
      </Feld>
      <Feld label="Zielumfang des Buchs (Wörter)">
        {(id) => <Textfeld id={id} inputMode="numeric" placeholder="z. B. 80000" value={buch} onChange={(e) => setBuch(e.target.value)} />}
      </Feld>
      <Feld label="Abgabe (optional)">{(id) => <Textfeld id={id} type="date" value={abgabe} onChange={(e) => setAbgabe(e.target.value)} />}</Feld>
      {fehler && <span className="pw-st-fehler">{fehler}</span>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {gespeichert && !geaendert && <span className="pw-st-leise">Gesichert</span>}
        {geaendert && (
          <Button klein onClick={ausSpeicher}>
            Zurücksetzen
          </Button>
        )}
        <Button klein variante="primaer" type="submit" disabled={!geaendert}>
          Ziele sichern
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
  return (
    <section className="pw-st-insp__abschnitt" aria-labelledby="pw-st-tag-titel" aria-live="polite">
      <Abschnittslabel>{tag === heute ? 'Heute' : 'Ausgewählter Tag'}</Abschnittslabel>
      <span className="pw-st-insp__tag" id="pw-st-tag-titel">
        {tagAnzeige(tag)}
      </span>
      <dl>
        <dt>Geschrieben</dt>
        <dd>{woerterText(geschrieben)}</dd>
        {ziel > 0 && (
          <>
            <dt>Tagesziel</dt>
            <dd>{geschrieben >= ziel ? 'erreicht' : `${zahl.format(Math.round((geschrieben / ziel) * 100))} %`}</dd>
          </>
        )}
        {stand !== undefined && eintrag && (
          <>
            <dt>{tag === heute ? 'Buch jetzt' : 'Buch am Abend'}</dt>
            <dd>{woerterText(stand)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function Zaehlregel() {
  return (
    <section className="pw-st-insp__abschnitt" aria-labelledby="pw-st-regel-titel">
      <Abschnittslabel as="h2" id="pw-st-regel-titel">
        So wird gezählt
      </Abschnittslabel>
      <ul className="pw-st-regel">
        <li>Neue Wörter zählen an dem Tag, an dem du sie speicherst (Mitternacht nach der Uhr deines Macs).</li>
        <li>Löschen und Kürzen ziehen nichts ab – dein Tagesziel kann nicht sinken.</li>
        <li>
          Verschobene Absätze zählen nicht doppelt: Ein eingefügter Block ab {BLOCK_WOERTER} Wörtern wird mit dem verrechnet, was du in den {PUFFER_MINUTEN} Minuten davor gelöscht hast.
        </li>
        <li>Import, Wiederherstellen von Versionen und Änderungen von außen zählen nicht als geschrieben.</li>
      </ul>
    </section>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const ansicht = useStore((s) => s.statistik.ansicht);
  const setzeAnsicht = useStore((s) => s.statistik.setzeAnsicht);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const anzahlFassungen = useStore((s) => s.daten?.fassungen?.length ?? 0);
  const st = useSchreibstatistik();
  const heute = useHeute();
  const gesamt = useGesamtWoerter();
  const [tag, setTag] = useState(heute);
  const [zielFokus, setZielFokus] = useState(0);

  useEffect(() => setTag(heute), [heute]);
  if (!daten) return null;

  const ziel = st.ziel.tagWoerter;
  const hinweis = `${woerterText(gesamt)}${ziel ? ` · Tagesziel ${zahl.format(ziel)}` : ''}`;

  return (
    <Werkzeugseite
      titel="Statistik"
      hinweis={hinweis}
      inspektor={
        <Inspektor label="Ziele und Tagesdetails" breite={320}>
          <div className="pw-st-insp">
            <TagDetails tag={tag} heute={heute} />
            <ZieleFormular fokusAnfrage={zielFokus} />
            <Zaehlregel />
          </div>
        </Inspektor>
      }
    >
      <div className="pw-st-seite">
        <div className="pw-st-leiste">
          <Segment<StatistikAnsicht>
            label="Ansicht"
            rolle="tablist"
            voll={false}
            optionen={ANSICHTEN.map((a) => ({ ...a, label: a.wert === 'fassungen' && anzahlFassungen ? `Fassungen (${anzahlFassungen})` : a.label, steuert: 'pw-st-ansicht' }))}
            wert={ansicht}
            onChange={setzeAnsicht}
          />
          <span style={{ display: 'flex', gap: 8 }}>
            <Button klein onClick={() => oeffneDialog('versionsvergleich')}>
              Fassungen vergleichen …
            </Button>
            <Button klein variante="primaer" onClick={() => oeffneDialog('fassung')}>
              Fassung sichern …
            </Button>
          </span>
        </div>
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
  return state.statistik.ansicht === 'fassungen' ? 'Fassungen' : 'Statistik';
}
