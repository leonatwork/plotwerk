/**
 * Inspektor rechts (350 px): Segment „Plan | Erkannt | Hinweise · n | Stil“ (Stil: G4, werkzeuge/StilTab).
 * Plan (S-08, S-09), Erkannt (S-10, KI-Vorschläge aus src/features/ki), Hinweise (S-13).
 */
import type { MotivTreffer } from '@core/erkennung/index';
import type { AbweichungsEntscheidung, Erwaehnung, Figur, Hinweis, Id, Motiv, Ort, ProjektDaten } from '@core/model/types';
import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { datum, f, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Chip, Inspektor, Karte, Radio, Segment, StrangPunkt } from '../../ui';
import { SzenenKarte } from '../faeden/Szenen';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { markiereZitat } from './bruecke';
import { VerweisFeld, VerweisText } from './VerweisFeld';
import { StilTab } from './werkzeuge';
import { verweiseAlsText } from './verweise';
import { fokusFiguren } from './ziele';
import { NurMit } from '../../app/NurMit';
import { useFunktion } from '../../state/funktionen';

type Tab = 'plan' | 'erkannt' | 'hinweise' | 'stil';
let gemerkterTab: Tab = 'plan';

const KiVorschlaege = lazy(() => import('../ki/ErwaehnungsVorschlaege').then((m) => ({ default: m.ErwaehnungsVorschlaege })));

function datumText(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : datum(d, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Vorlage mit Anzahl `{n}` (wo `f` als Schleifenvariable belegt ist) */
const fmtText = (vorlage: string, n: number) => f(vorlage, { n });

// ---------------------------------------------------------------------------
// Erkannte Figuren und Orte
// ---------------------------------------------------------------------------

interface ErkanntEintrag {
  id: Id;
  name: string;
  anzahl: number;
  /** nur erwähnt (oder per Nachricht), nie als Auftritt */
  nurErwaehnt: boolean;
  /** abweichende Schreibweise im Text, z. B. „Linden Hof“ */
  variante: string | null;
}

function ohneGenitiv(t: string): string {
  return t.replace(/(?:s|'|’)$/u, '');
}

function namenVon(z: Figur | Ort): string[] {
  return [z.name, ...z.aliase, ...('formen' in z ? (z.formen ?? []) : [])];
}

export function erkanntListe(erwaehnungen: Erwaehnung[], typ: 'figur' | 'ort', daten: ProjektDaten): ErkanntEintrag[] {
  const gruppen = new Map<Id, Erwaehnung[]>();
  for (const e of erwaehnungen) {
    if (e.zielTyp !== typ) continue;
    const liste = gruppen.get(e.ziel) ?? [];
    liste.push(e);
    gruppen.set(e.ziel, liste);
  }
  const ergebnis: ErkanntEintrag[] = [];
  for (const [id, liste] of gruppen) {
    const ziel = typ === 'figur' ? daten.figuren[id] : daten.orte[id];
    if (!ziel) continue;
    const namen = namenVon(ziel);
    const varianten = liste.map((e) => e.treffer).filter((t) => !namen.includes(t) && !namen.includes(ohneGenitiv(t)));
    ergebnis.push({
      id,
      name: ziel.name,
      anzahl: liste.length,
      nurErwaehnt: liste.every((e) => e.art === 'erwaehnt' || e.art === 'nachricht'),
      variante: varianten[0] ?? null,
    });
  }
  return ergebnis.sort((a, b) => a.anzahl === b.anzahl ? vergleich(a.name, b.name) : b.anzahl - a.anzahl);
}

function ErkanntChips({ kapitelId, mitAnzahl }: { kapitelId: Id; mitAnzahl?: boolean }) {
  const daten = useStore((s) => s.daten);
  const live = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.erwaehnungen : null));
  const oeffne = useStore((s) => s.oeffne);
  const figuren = useMemo(() => (daten && live ? erkanntListe(live, 'figur', daten) : []), [daten, live]);
  const orte = useMemo(() => (daten && live ? erkanntListe(live, 'ort', daten) : []), [daten, live]);
  const T = useTexte().schreiben.inspektor;
  if (!daten) return null;
  const fokus = fokusFiguren(daten.plaene[kapitelId], daten.figuren);
  if (!figuren.length && !orte.length) return <span className="pw-s-leise">{T.keineErkannt}</span>;
  return (
    <>
      {figuren.length > 0 && (
        <div className="pw-s-chips">
          {figuren.map((f) => {
            const figur = daten.figuren[f.id]!;
            const unsicher = f.nurErwaehnt || figur.existenz !== 'gesichert';
            return (
              <Chip
                key={f.id}
                variante={unsicher ? 'gestrichelt' : 'gefuellt'}
                farbe={fokus.has(f.id) ? 'accent' : 'neutral'}
                title={fmtText(T.imTextKarte, f.anzahl)}
                onClick={() => oeffne('figuren', { figur: f.id })}
              >
                {f.variante ?? f.name}
                {f.nurErwaehnt && T.erwaehnt}
                {mitAnzahl && <span style={{ color: 'var(--ink-quiet)' }}>{f.anzahl}</span>}
                {f.variante && <b className="pw-s-schreibweise">{T.schreibweise}</b>}
              </Chip>
            );
          })}
        </div>
      )}
      {orte.length > 0 && (
        <div className="pw-s-chips">
          {orte.map((o) => (
            <Chip key={o.id} variante="umrandet" title={fmtText(T.imTextOrt, o.anzahl)} onClick={() => oeffne('orte', { ort: o.id })}>
              {o.variante ?? o.name}
              {mitAnzahl && <span style={{ color: 'var(--ink-quiet)' }}>{o.anzahl}</span>}
              {o.variante && <b className="pw-s-schreibweise">{T.schreibweise}</b>}
            </Chip>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Motive (S-10)
// ---------------------------------------------------------------------------

const KEINE_MOTIVE: Motiv[] = [];

export function motivZaehlung(motive: Motiv[], treffer: MotivTreffer[]): { motiv: Motiv; anzahl: number; erster: string | null }[] {
  return motive
    .map((motiv) => {
      const eigene = treffer.filter((t) => t.motiv === motiv.id);
      return { motiv, anzahl: eigene.length, erster: eigene[0]?.treffer ?? null };
    })
    .sort((a, b) => b.anzahl - a.anzahl || vergleich(a.motiv.name, b.motiv.name));
}

function MotiveAbschnitt({ kapitelId }: { kapitelId: Id }) {
  const motive = useStore((s) => s.daten?.motive ?? KEINE_MOTIVE);
  const treffer = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.motive : undefined));
  const speichern = useStore((s) => s.speichereMotive);
  const neueId = useStore((s) => s.neueId);
  const [neu, setNeu] = useState('');
  const t = useTexte();
  const T = t.schreiben.inspektor;
  const zaehlung = useMemo(() => motivZaehlung(motive, treffer ?? []), [motive, treffer]);
  const im = zaehlung.filter((z) => z.anzahl > 0);
  const nicht = zaehlung.filter((z) => z.anzahl === 0);
  const hinzufuegen = () => {
    const name = neu.trim();
    if (!name) return;
    setNeu('');
    if (motive.some((m) => m.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return;
    void speichern([...motive, { id: neueId(name, motive.map((m) => m.id)), name, aliase: [] }]);
  };
  return (
    <section className="pw-s-abschnitt" aria-label={T.motive}>
      <Abschnittslabel>{T.motive}</Abschnittslabel>
      {im.length > 0 ? (
        <div className="pw-s-chips">
          {im.map((z) => (
            <Chip key={z.motiv.id} variante="umrandet" title={f(T.motivImText, { n: z.anzahl })} onClick={() => z.erster && markiereZitat(kapitelId, z.erster)}>
              {z.motiv.name}
              <span style={{ color: 'var(--ink-quiet)' }}>{z.anzahl}</span>
            </Chip>
          ))}
        </div>
      ) : (
        <span className="pw-s-leise">{motive.length ? T.keinMotivHier : T.keineMotive}</span>
      )}
      {nicht.length > 0 && (
        <div className="pw-s-chips">
          {nicht.map((z) => (
            <Chip key={z.motiv.id} variante="gestrichelt" title={T.motivNichtHier}>
              {z.motiv.name}
            </Chip>
          ))}
        </div>
      )}
      <form
        style={{ display: 'flex', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          hinzufuegen();
        }}
      >
        <input
          className="pw-textfeld"
          style={{ flex: 1, height: 28, fontSize: 12 }}
          aria-label={T.neuesMotiv}
          placeholder={T.motivPlatzhalter}
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
        />
        <Button type="submit" klein disabled={!neu.trim()}>
          {t.gemeinsam.hinzufuegen}
        </Button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function PlanNotiz({ kapitelId, notiz }: { kapitelId: Id; notiz: string }) {
  const speichern = useStore((s) => s.planNotizSpeichern);
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const T = useTexte().schreiben.inspektor;
  if (entwurf !== null)
    return (
      <VerweisFeld
        label={T.planNotiz}
        wert={entwurf}
        zeilen={3}
        autoFocus
        kontext={{ typ: 'plan', id: kapitelId }}
        placeholder={T.planNotizPlatzhalter}
        onChange={setEntwurf}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEntwurf(null);
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
        }}
        onBlur={() => {
          void speichern(kapitelId, entwurf.trim());
          setEntwurf(null);
        }}
      />
    );
  return (
    <div
      role="button"
      tabIndex={0}
      className="pw-s-plannotiz"
      title={T.planNotizBearbeiten}
      onClick={() => setEntwurf(notiz)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEntwurf(notiz);
        }
      }}
    >
      {notiz.trim() ? <VerweisText text={notiz} /> : T.planNotizLeer}
    </div>
  );
}

function Abweichungen({ kapitelId }: { kapitelId: Id }) {
  const abweichungen = useStore((s) => s.daten?.plaene[kapitelId]?.abweichungen);
  const entscheiden = useStore((s) => s.abweichungEntscheiden);
  const T = useTexte().schreiben.inspektor;
  if (!abweichungen?.length) return null;
  return (
    <>
      {abweichungen.map((a) => (
        <div key={a.id} className="pw-s-abweichung">
          <span className="pw-s-abweichung__kopf">
            <span>{f(T.abweichung, { datum: datumText(a.datum) })}</span>
            <span>{T.entscheidung[a.entscheidung]}</span>
          </span>
          <span style={{ lineHeight: 1.45 }}>
            <VerweisText text={a.notiz} />
          </span>
          {a.entscheidung === 'plan_anpassen' && a.alterPlan && (
            <span className="pw-s-leise">
              {T.alterPlan} <span className="pw-s-abweichung__alt">{verweiseAlsText(a.alterPlan)}</span>
            </span>
          )}
          {a.entscheidung === 'spaeter' && (
            <div className="pw-s-abweichung__aktionen">
              <Button klein onClick={() => void entscheiden(kapitelId, a.id, 'plan_anpassen', true)}>
                {T.planAnpassen}
              </Button>
              <Button klein onClick={() => void entscheiden(kapitelId, a.id, 'alternative')}>
                {T.alsAlternative}
              </Button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function AbweichungFormular({ kapitelId }: { kapitelId: Id }) {
  const speichern = useStore((s) => s.abweichungSpeichern);
  const [offen, setOffen] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [entscheidung, setEntscheidung] = useState<AbweichungsEntscheidung>('alternative');
  const [uebernehmen, setUebernehmen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const name = useId();
  const feldId = useId();
  const t = useTexte();
  const T = t.schreiben.inspektor;

  useEffect(() => {
    setOffen(false);
    setNotiz('');
  }, [kapitelId]);

  const zuruecksetzen = () => {
    setOffen(false);
    setNotiz('');
    setEntscheidung('alternative');
    setUebernehmen(true);
    setFehler(null);
  };

  if (!offen)
    return (
      <Button breit onClick={() => setOffen(true)}>
        {T.abweichen}
      </Button>
    );

  return (
    <Karte akzent aria-label={T.abweichen}>
      <strong className="pw-s-abw-titel">{T.abweichen}</strong>
      <label htmlFor={feldId} className="pw-feld__label">
        {T.wasAnders}
      </label>
      <VerweisFeld
        id={feldId}
        className="pw-s-abw-feld"
        label={T.wasAnders}
        wert={notiz}
        zeilen={3}
        autoFocus
        kontext={{ typ: 'plan', id: kapitelId }}
        placeholder={T.abweichungPlatzhalter}
        onChange={setNotiz}
        onKeyDown={(e) => {
          if (e.key === 'Escape') zuruecksetzen();
        }}
      />
      <fieldset className="pw-s-fieldset">
        <legend>{T.wasMitPlan}</legend>
        <Radio name={name} checked={entscheidung === 'plan_anpassen'} onChange={() => setEntscheidung('plan_anpassen')}>
          {T.planAnpassen}
        </Radio>
        <Radio name={name} checked={entscheidung === 'alternative'} onChange={() => setEntscheidung('alternative')}>
          {T.alsAlternative}
        </Radio>
        <Radio name={name} checked={entscheidung === 'spaeter'} onChange={() => setEntscheidung('spaeter')}>
          {T.spaeter}
        </Radio>
      </fieldset>
      {entscheidung === 'plan_anpassen' && (
        <Checkbox checked={uebernehmen} onChange={(e) => setUebernehmen(e.target.checked)}>
          {T.alsPlanNotiz}
        </Checkbox>
      )}
      {fehler && <span className="pw-s-status__fehler">{fehler}</span>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={zuruecksetzen}>{t.gemeinsam.abbrechen}</Button>
        <Button
          variante="primaer"
          disabled={!notiz.trim()}
          onClick={async () => {
            try {
              await speichern(kapitelId, { notiz, entscheidung, planUebernehmen: uebernehmen });
              zuruecksetzen();
            } catch (e) {
              setFehler(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {t.gemeinsam.speichern}
        </Button>
      </div>
    </Karte>
  );
}

function PlanTab({ kapitelId }: { kapitelId: Id }) {
  const daten = useStore((s) => s.daten);
  const oeffne = useStore((s) => s.oeffne);
  const T = useTexte().schreiben.inspektor;
  if (!daten) return null;
  const plan = daten.plaene[kapitelId];
  if (!plan)
    return (
      <>
        <span className="pw-s-leise">{T.keinPlan}</span>
        {/* Szenen lassen sich auch ohne Plan anlegen; der Store legt den Plan beim ersten Speichern an. */}
        <NurMit funktion="faeden">
          <SzenenKarte kapitelId={kapitelId} />
        </NurMit>
        <NurMit funktion="recherche">
          <RechercheLeiste ziel={{ typ: 'kapitel', id: kapitelId }} />
        </NurMit>
      </>
    );
  const fokus = fokusFiguren(plan, daten.figuren);
  const straenge = plan.straenge.map((id) => daten.straenge.find((s) => s.id === id)).filter((s) => !!s);
  return (
    <>
      <Karte>
        <Abschnittslabel>{T.geplanteSzene}</Abschnittslabel>
        <strong className="pw-s-szene">{plan.szene || <span style={{ color: 'var(--ink-quiet)' }}>{T.keineSzene}</span>}</strong>
        {straenge.map((s) => (
          <span key={s.id} className="pw-s-strang">
            <StrangPunkt farbe={s.farbe} groesse={10} />
            {s.name}
          </span>
        ))}
        {(plan.figuren.length > 0 || plan.orte.length > 0) && (
          <div className="pw-s-chips">
            {plan.figuren.map((id) => (
              <Chip key={id} farbe={fokus.has(id) ? 'accent' : 'neutral'} onClick={() => oeffne('figuren', { figur: id })}>
                {daten.figuren[id]?.name ?? id}
              </Chip>
            ))}
            {plan.orte.map((id) => (
              <Chip key={id} variante="umrandet" onClick={() => oeffne('orte', { ort: id })}>
                {daten.orte[id]?.name ?? id}
              </Chip>
            ))}
          </div>
        )}
        <PlanNotiz kapitelId={kapitelId} notiz={plan.notiz} />
      </Karte>
      <NurMit funktion="faeden">
        <SzenenKarte kapitelId={kapitelId} />
      </NurMit>
      <NurMit funktion="recherche">
        <RechercheLeiste ziel={{ typ: 'kapitel', id: kapitelId }} />
      </NurMit>
      <Abweichungen kapitelId={kapitelId} />
      <AbweichungFormular kapitelId={kapitelId} />
      <section className="pw-s-abschnitt">
        <Abschnittslabel>{T.erkanntHier}</Abschnittslabel>
        <ErkanntChips kapitelId={kapitelId} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Erkannt
// ---------------------------------------------------------------------------

function ErkanntTab({ kapitelId }: { kapitelId: Id }) {
  const daten = useStore((s) => s.daten);
  const live = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.erwaehnungen : null));
  const speicherePlan = useStore((s) => s.speicherePlan);
  const oeffne = useStore((s) => s.oeffne);
  const T = useTexte().schreiben.inspektor;
  if (!daten) return null;
  const plan = daten.plaene[kapitelId];
  const erkannteFiguren = new Set((live ?? []).filter((e) => e.zielTyp === 'figur').map((e) => e.ziel));
  const erkannteOrte = new Set((live ?? []).filter((e) => e.zielTyp === 'ort').map((e) => e.ziel));
  const nichtImPlan = [...erkannteFiguren].filter((id) => plan && !plan.figuren.includes(id) && daten.figuren[id]);
  const orteNichtImPlan = [...erkannteOrte].filter((id) => plan && !plan.orte.includes(id) && daten.orte[id]);
  const nichtErkannt = (plan?.figuren ?? []).filter((id) => !erkannteFiguren.has(id) && daten.figuren[id]);
  return (
    <>
      <section className="pw-s-abschnitt">
        <Abschnittslabel>{T.figurenOrteImText}</Abschnittslabel>
        <ErkanntChips kapitelId={kapitelId} mitAnzahl />
        <span className="pw-s-leise">{T.erkanntHilfe}</span>
      </section>
      <MotiveAbschnitt kapitelId={kapitelId} />
      {plan && (nichtImPlan.length > 0 || orteNichtImPlan.length > 0) && (
        <section className="pw-s-abschnitt">
          <Abschnittslabel>{T.nichtImPlan}</Abschnittslabel>
          <div className="pw-s-chips">
            {nichtImPlan.map((id) => (
              <Chip key={id} variante="gestrichelt" title={T.zumPlan} onClick={() => void speicherePlan({ ...plan, figuren: [...plan.figuren, id] })}>
                + {daten.figuren[id]!.name}
              </Chip>
            ))}
            {orteNichtImPlan.map((id) => (
              <Chip key={id} variante="gestrichelt" title={T.zumPlan} onClick={() => void speicherePlan({ ...plan, orte: [...plan.orte, id] })}>
                + {daten.orte[id]!.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
      {nichtErkannt.length > 0 && (
        <section className="pw-s-abschnitt">
          <Abschnittslabel>{T.nichtImText}</Abschnittslabel>
          <div className="pw-s-chips">
            {nichtErkannt.map((id) => (
              <Chip key={id} variante="gestrichelt" onClick={() => oeffne('figuren', { figur: id })}>
                {daten.figuren[id]!.name}
              </Chip>
            ))}
          </div>
          <span className="pw-s-leise">{T.erzaehlerHilfe}</span>
        </section>
      )}
      <Suspense fallback={null}>
        <NurMit funktion="kiErkennung">
          <KiVorschlaege kapitel={kapitelId} />
        </NurMit>
      </Suspense>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hinweise
// ---------------------------------------------------------------------------

function HinweisKarte({ hinweis, kapitelId }: { hinweis: Hinweis; kapitelId: Id }) {
  const daten = useStore((s) => s.daten);
  const markiere = useStore((s) => s.markiere);
  const hinweisEntscheiden = useStore((s) => s.hinweisEntscheiden);
  const oeffne = useStore((s) => s.oeffne);
  const [nichtGefunden, setNichtGefunden] = useState(false);
  const t = useTexte();
  const T = t.schreiben.inspektor;
  const hier = hinweis.zitate.filter((z) => z.kapitel === kapitelId);
  const anderswo = hinweis.zitate.filter((z) => z.kapitel !== kapitelId);
  const zeigen = () => {
    const z = hier[0];
    if (!z) return;
    setNichtGefunden(!markiereZitat(kapitelId, z.text));
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="pw-s-hinweis"
      onClick={zeigen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          zeigen();
        }
      }}
    >
      <span className="pw-s-hinweis__typ">
        {T.hinweisTyp[hinweis.typ]}
        {hinweis.offen && <span style={{ color: 'var(--real-offen)' }}>{T.offen}</span>}
        {hinweis.quelle === 'ki' && <span style={{ marginLeft: 'auto', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>{T.ki}</span>}
      </span>
      <span className="pw-s-hinweis__titel">{hinweis.titel}</span>
      {hier.map((z, i) => (
        <span key={i} className="pw-s-hinweis__zitat">
          {f(t.schreiben.zitat, { text: z.text })}
        </span>
      ))}
      {hinweis.erklaerung && <span className="pw-s-hinweis__text">{hinweis.erklaerung}</span>}
      {anderswo.map((z, i) => (
        <button
          key={i}
          type="button"
          className="pw-s-notizkarte__link"
          onClick={(e) => {
            e.stopPropagation();
            markiere({ kapitel: z.kapitel, anker: { kapitel: z.kapitel, exakt: z.text, davor: '', danach: '' } });
          }}
        >
          → {f(t.gemeinsam.kapitelKurz, { nr: (daten?.projekt.kapitel.indexOf(z.kapitel) ?? -1) + 1 })} · {daten?.kapitel[z.kapitel]?.titel ?? z.kapitel}
        </button>
      ))}
      {nichtGefunden && <span className="pw-s-status__fehler">{T.stelleFehlt}</span>}
      <span className="pw-s-hinweis__aktionen">
        <button
          type="button"
          className="pw-s-notizkarte__link"
          onClick={(e) => {
            e.stopPropagation();
            void hinweisEntscheiden(hinweis.schluessel, 'absicht');
          }}
        >
          {T.istAbsicht}
        </button>
        <button
          type="button"
          className="pw-s-notizkarte__link"
          onClick={(e) => {
            e.stopPropagation();
            void hinweisEntscheiden(hinweis.schluessel, 'erledigt');
          }}
        >
          {T.erledigt}
        </button>
        <button
          type="button"
          className="pw-s-notizkarte__link pw-s-hinweis__mehr"
          onClick={(e) => {
            e.stopPropagation();
            oeffne('hinweise', { hinweis: hinweis.schluessel });
          }}
        >
          {T.inHinweisen}
        </button>
      </span>
    </div>
  );
}

export function useKapitelHinweise(kapitelId: Id): Hinweis[] {
  const alle = useStore((s) => s.index.hinweise);
  const entschieden = useStore((s) => s.daten?.entscheidungen.hinweise);
  return useMemo(() => {
    const weg = new Set((entschieden ?? []).map((e) => e.schluessel));
    return alle.filter((h) => h.status === 'neu' && !weg.has(h.schluessel) && h.zitate.some((z) => z.kapitel === kapitelId));
  }, [alle, entschieden, kapitelId]);
}

function HinweiseTab({ kapitelId }: { kapitelId: Id }) {
  const hinweise = useKapitelHinweise(kapitelId);
  const T = useTexte().schreiben.inspektor;
  if (!hinweise.length) return <span className="pw-s-leise">{T.keineHinweise}</span>;
  return (
    <>
      {hinweise.map((h) => (
        <HinweisKarte key={h.schluessel} hinweis={h} kapitelId={kapitelId} />
      ))}
      <span className="pw-s-leise">{T.hinweisHilfe}</span>
    </>
  );
}

// ---------------------------------------------------------------------------

export function SchreibInspektor({ kapitelId }: { kapitelId: Id }) {
  const [gewaehlt, setTab] = useState<Tab>(gemerkterTab);
  const mitHinweisen = useFunktion('hinweise');
  const mitStil = useFunktion('editorWerkzeuge');
  // ausgeblendete Tabs (E15) fallen auf „Plan“ zurück
  const tab: Tab = (gewaehlt === 'hinweise' && !mitHinweisen) || (gewaehlt === 'stil' && !mitStil) ? 'plan' : gewaehlt;
  const anzahl = useKapitelHinweise(kapitelId).length;
  const tabId = useId();
  const T = useTexte().schreiben.inspektor;
  const wechseln = (neu: Tab) => {
    gemerkterTab = neu;
    setTab(neu);
  };
  return (
    <Inspektor label={T.label}>
      <Segment<Tab>
        label={T.label}
        wert={tab}
        onChange={wechseln}
        optionen={[
          { wert: 'plan', label: T.tabs.plan, steuert: `${tabId}-plan` },
          { wert: 'erkannt', label: T.tabs.erkannt, steuert: `${tabId}-erkannt` },
          ...(mitHinweisen
            ? [{ wert: 'hinweise' as const, label: anzahl ? f(T.tabs.hinweiseAnzahl, { n: anzahl }) : T.tabs.hinweise, steuert: `${tabId}-hinweise` }]
            : []),
          ...(mitStil ? [{ wert: 'stil' as const, label: T.tabs.stil, steuert: `${tabId}-stil` }] : []),
        ]}
      />
      <div id={`${tabId}-${tab}`} role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'plan' && <PlanTab kapitelId={kapitelId} />}
        {tab === 'erkannt' && <ErkanntTab kapitelId={kapitelId} />}
        {tab === 'hinweise' && <HinweiseTab kapitelId={kapitelId} />}
        {tab === 'stil' && <StilTab kapitelId={kapitelId} />}
      </div>
    </Inspektor>
  );
}
