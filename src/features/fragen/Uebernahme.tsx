/**
 * Offene Leserfrage übernehmen (G6): als Faden planen (plan/faeden.md, mit geplanter Auflösung und Notiz, wie sie
 * gelöst wird) oder als Notiz an die Belegstelle heften (anmerkungen.json). Leon legt beides selbst an – die KI
 * schreibt nichts. Besitzer: G6.
 */
import { useState } from 'react';
import { frageKapitel } from '@core/ki/index';
import type { Id, LeserFrage, ProjektDaten } from '@core/model/types';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button, Checkbox, Feld, Textbereich, Textfeld } from '../../ui';
import { ankerFuerZitat, kapitelTitel, kapNr, zitiert } from './gemeinsam';

type Form = 'faden' | 'notiz' | null;

/** Etiketten „Faden · Auflösung Kap. 12“ / „Notiz an der Stelle“ – ein Klick öffnet Faden bzw. Stelle. */
function Uebernommen({ daten, frage, schliessen }: { daten: ProjektDaten; frage: LeserFrage; schliessen(): void }) {
  const t = useTexte().fragen.simulation;
  const faeden = useStore((s) => s.daten?.fadenplanung?.faeden);
  const status = useStore((s) => s.daten?.entscheidungen.faeden);
  const markiere = useStore((s) => s.markiere);
  const faden = frage.faden ? faeden?.find((x) => x.id === frage.faden) : undefined;
  const anmerkung = frage.anmerkung ? daten.anmerkungen.find((a) => a.id === frage.anmerkung) : undefined;
  if (!faden && !anmerkung) return null;
  const bewusst = faden && status?.find((x) => x.id === faden.id)?.status === 'bewusst_offen';
  return (
    <div className="pw-kl-uebernahme__etiketten">
      {faden && (
        <button
          type="button"
          className="pw-kl-uebernahme__etikett"
          title={t.fadenOeffnen}
          onClick={() => {
            const s = useStore.getState();
            s.struktur.waehleFaden(faden.id);
            s.setzeBereich('faeden');
            schliessen();
          }}
        >
          {bewusst ? t.fadenBewusstOffen : faden.aufloesungIn ? f(t.fadenAufloesungIn, { kap: kapNr(daten, faden.aufloesungIn) }) : t.fadenOffen}
        </button>
      )}
      {anmerkung && (
        <button
          type="button"
          className="pw-kl-uebernahme__etikett"
          title={t.notizOeffnen}
          onClick={() => {
            markiere({ kapitel: anmerkung.anker.kapitel, anker: anmerkung.anker });
            schliessen();
          }}
        >
          {t.notizEtikett}
        </button>
      )}
    </div>
  );
}

function FadenFormular({ daten, stand, standKapitel, frage, fertig }: { daten: ProjektDaten; stand: Id; standKapitel: Id; frage: LeserFrage; fertig(): void }) {
  const tt = useTexte();
  const t = tt.fragen.simulation;
  const alsFaden = useStore((s) => s.kileser.alsFaden);
  const reihe = daten.projekt.kapitel;
  const [name, setName] = useState(frage.frage);
  const [eroeffnetIn, setEroeffnetIn] = useState(() => frageKapitel(frage, reihe, standKapitel));
  const [aufloesungIn, setAufloesungIn] = useState<Id>('');
  const [notiz, setNotiz] = useState('');
  const [bewusstOffen, setBewusstOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  // Auflösung frühestens im Kapitel, in dem die Frage aufkommt
  const ab = Math.max(0, reihe.indexOf(eroeffnetIn));
  return (
    <form
      className="pw-kl-uebernahme__formular"
      aria-label={t.alsFaden}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || laeuft) return;
        setLaeuft(true);
        try {
          await alsFaden(stand, frage.id, { name, eroeffnetIn, aufloesungIn: bewusstOffen ? undefined : aufloesungIn || undefined, notiz, bewusstOffen });
          fertig();
        } finally {
          setLaeuft(false);
        }
      }}
    >
      <Feld label={t.fadenName}>{(id) => <Textfeld id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Feld>
      <div className="pw-kl-uebernahme__reihe">
        <Feld label={t.fadenEroeffnet}>
          {(id) => (
            <select id={id} className="pw-kl-auswahl" value={eroeffnetIn} onChange={(e) => setEroeffnetIn(e.target.value)}>
              {reihe.map((k) => (
                <option key={k} value={k}>
                  {kapitelTitel(daten, k)}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <Feld label={t.fadenAufloesung}>
          {(id) => (
            <select id={id} className="pw-kl-auswahl" value={bewusstOffen ? '' : aufloesungIn} disabled={bewusstOffen} onChange={(e) => setAufloesungIn(e.target.value)}>
              <option value="">{t.fadenAufloesungOffen}</option>
              {reihe.slice(ab).map((k) => (
                <option key={k} value={k}>
                  {kapitelTitel(daten, k)}
                </option>
              ))}
            </select>
          )}
        </Feld>
      </div>
      <Feld label={t.fadenNotiz}>
        {(id) => <Textbereich id={id} rows={2} value={notiz} placeholder={t.fadenNotizPlatzhalter} onChange={(e) => setNotiz(e.target.value)} />}
      </Feld>
      <Checkbox checked={bewusstOffen} onChange={(e) => setBewusstOffen(e.target.checked)}>
        {t.bewusstOffen}
      </Checkbox>
      <div className="pw-kl-uebernahme__knoepfe">
        <Button klein onClick={fertig}>
          {tt.gemeinsam.abbrechen}
        </Button>
        <Button klein variante="primaer" type="submit" disabled={!name.trim() || laeuft}>
          {t.fadenAnlegen}
        </Button>
      </div>
    </form>
  );
}

function NotizFormular({ daten, stand, frage, fertig }: { daten: ProjektDaten; stand: Id; frage: LeserFrage; fertig(): void }) {
  const t = useTexte().fragen.simulation;
  const tt = useTexte();
  const alsNotiz = useStore((s) => s.kileser.alsNotiz);
  const [beleg, setBeleg] = useState(0);
  const [notiz, setNotiz] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const z = frage.belege[beleg] ?? frage.belege[0];
  if (!z) return null;
  return (
    <form
      className="pw-kl-uebernahme__formular"
      aria-label={t.alsNotiz}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!notiz.trim() || laeuft) return;
        setLaeuft(true);
        try {
          await alsNotiz(stand, frage.id, ankerFuerZitat(daten, z.kapitel, z.text), notiz);
          fertig();
        } finally {
          setLaeuft(false);
        }
      }}
    >
      {frage.belege.length > 1 ? (
        <Feld label={t.notizStelle}>
          {(id) => (
            <select id={id} className="pw-kl-auswahl" value={beleg} onChange={(e) => setBeleg(Number(e.target.value))}>
              {frage.belege.map((b, i) => (
                <option key={`${b.kapitel}|${b.text}`} value={i}>
                  {kapNr(daten, b.kapitel)} · {zitiert(b.text)}
                </option>
              ))}
            </select>
          )}
        </Feld>
      ) : (
        <p className="pw-kl-klein">
          {t.notizStelle}: {kapNr(daten, z.kapitel)} · {zitiert(z.text)}
        </p>
      )}
      <Feld label={t.notizText}>
        {(id) => <Textbereich id={id} rows={2} value={notiz} placeholder={t.notizPlatzhalter} onChange={(e) => setNotiz(e.target.value)} autoFocus />}
      </Feld>
      <div className="pw-kl-uebernahme__knoepfe">
        <Button klein onClick={fertig}>
          {tt.gemeinsam.abbrechen}
        </Button>
        <Button klein variante="primaer" type="submit" disabled={!notiz.trim() || laeuft}>
          {t.notizAnheften}
        </Button>
      </div>
    </form>
  );
}

/** Knöpfe, Formulare und Etiketten unter einer offenen Leserfrage im Ergebnis der Simulation. */
export function FrageUebernahme({
  daten,
  stand,
  standKapitel,
  frage,
  schliessen,
}: {
  daten: ProjektDaten;
  /** ID der gespeicherten Simulation (standId) */
  stand: Id;
  standKapitel: Id;
  frage: LeserFrage;
  schliessen(): void;
}) {
  const t = useTexte().fragen.simulation;
  const [form, setForm] = useState<Form>(null);
  // gelöschte Fäden/Notizen gelten nicht mehr als übernommen
  const hatFaden = useStore((s) => !!frage.faden && !!s.daten?.fadenplanung?.faeden.some((x) => x.id === frage.faden));
  const hatNotiz = !!frage.anmerkung && daten.anmerkungen.some((a) => a.id === frage.anmerkung);
  return (
    <div className="pw-kl-uebernahme" aria-label={f(t.uebernahmeLabel, { frage: frage.frage })} role="group">
      <div className="pw-kl-uebernahme__zeile">
        <Uebernommen daten={daten} frage={frage} schliessen={schliessen} />
        {form === null && (
          <span className="pw-kl-uebernahme__aktionen">
            {!hatFaden && (
              <Button klein variante="leise" onClick={() => setForm('faden')}>
                {t.alsFaden}
              </Button>
            )}
            {!hatNotiz && frage.belege.length > 0 && (
              <Button klein variante="leise" onClick={() => setForm('notiz')}>
                {t.alsNotiz}
              </Button>
            )}
          </span>
        )}
      </div>
      {form === 'faden' && <FadenFormular daten={daten} stand={stand} standKapitel={standKapitel} frage={frage} fertig={() => setForm(null)} />}
      {form === 'notiz' && <NotizFormular daten={daten} stand={stand} frage={frage} fertig={() => setForm(null)} />}
    </div>
  );
}
