/**
 * Inspektor rechts (350 px): Segment „Plan | Erkannt | Hinweise · n | Stil“ (Stil: G4, werkzeuge/StilTab).
 * Plan (S-08, S-09), Erkannt (S-10, KI-Vorschläge aus src/features/ki), Hinweise (S-13).
 */
import type { MotivTreffer } from '@core/erkennung/index';
import type { AbweichungsEntscheidung, Erwaehnung, Figur, Hinweis, HinweisTyp, Id, Motiv, Ort, ProjektDaten } from '@core/model/types';
import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Chip, Inspektor, Karte, Radio, Segment, StrangPunkt } from '../../ui';
import { SzenenKarte } from '../faeden/Szenen';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { markiereZitat } from './bruecke';
import { VerweisFeld, VerweisText } from './VerweisFeld';
import { StilTab } from './werkzeuge';
import { verweiseAlsText } from './verweise';
import { fokusFiguren } from './ziele';

type Tab = 'plan' | 'erkannt' | 'hinweise' | 'stil';
let gemerkterTab: Tab = 'plan';

const KiVorschlaege = lazy(() => import('../ki/ErwaehnungsVorschlaege').then((m) => ({ default: m.ErwaehnungsVorschlaege })));

const ENTSCHEIDUNG: Record<AbweichungsEntscheidung, string> = {
  plan_anpassen: 'Plan angepasst',
  alternative: 'Als Alternative gemerkt',
  spaeter: 'Später entscheiden',
};

const HINWEIS_TYP: Record<HinweisTyp, string> = {
  pruefen: 'Prüfen',
  schreibweise: 'Schreibweise',
  offener_faden: 'Offener Faden',
  unbekannt: 'Unbekannt',
  struktur: 'Struktur',
  zeitleiste: 'Zeitleiste',
  sprache: 'Sprache',
};

const datumFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function datumText(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : datumFormat.format(d);
}

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
  return ergebnis.sort((a, b) => a.anzahl === b.anzahl ? a.name.localeCompare(b.name, 'de') : b.anzahl - a.anzahl);
}

function ErkanntChips({ kapitelId, mitAnzahl }: { kapitelId: Id; mitAnzahl?: boolean }) {
  const daten = useStore((s) => s.daten);
  const live = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.erwaehnungen : null));
  const oeffne = useStore((s) => s.oeffne);
  const figuren = useMemo(() => (daten && live ? erkanntListe(live, 'figur', daten) : []), [daten, live]);
  const orte = useMemo(() => (daten && live ? erkanntListe(live, 'ort', daten) : []), [daten, live]);
  if (!daten) return null;
  const fokus = fokusFiguren(daten.plaene[kapitelId], daten.figuren);
  if (!figuren.length && !orte.length) return <span className="pw-s-leise">Noch keine Figuren oder Orte im Text erkannt.</span>;
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
                title={`${f.anzahl}× im Text · Karte öffnen`}
                onClick={() => oeffne('figuren', { figur: f.id })}
              >
                {f.variante ?? f.name}
                {f.nurErwaehnt && ' · erwähnt'}
                {mitAnzahl && <span style={{ color: 'var(--ink-quiet)' }}>{f.anzahl}</span>}
                {f.variante && <b className="pw-s-schreibweise">· Schreibweise?</b>}
              </Chip>
            );
          })}
        </div>
      )}
      {orte.length > 0 && (
        <div className="pw-s-chips">
          {orte.map((o) => (
            <Chip key={o.id} variante="umrandet" title={`${o.anzahl}× im Text · Ort öffnen`} onClick={() => oeffne('orte', { ort: o.id })}>
              {o.variante ?? o.name}
              {mitAnzahl && <span style={{ color: 'var(--ink-quiet)' }}>{o.anzahl}</span>}
              {o.variante && <b className="pw-s-schreibweise">· Schreibweise?</b>}
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
    .sort((a, b) => b.anzahl - a.anzahl || a.motiv.name.localeCompare(b.motiv.name, 'de'));
}

function MotiveAbschnitt({ kapitelId }: { kapitelId: Id }) {
  const motive = useStore((s) => s.daten?.motive ?? KEINE_MOTIVE);
  const treffer = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.motive : undefined));
  const speichern = useStore((s) => s.speichereMotive);
  const neueId = useStore((s) => s.neueId);
  const [neu, setNeu] = useState('');
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
    <section className="pw-s-abschnitt" aria-label="Motive">
      <Abschnittslabel>Motive</Abschnittslabel>
      {im.length > 0 ? (
        <div className="pw-s-chips">
          {im.map((z) => (
            <Chip key={z.motiv.id} variante="umrandet" title={`${z.anzahl}× im Text · erste Stelle zeigen`} onClick={() => z.erster && markiereZitat(kapitelId, z.erster)}>
              {z.motiv.name}
              <span style={{ color: 'var(--ink-quiet)' }}>{z.anzahl}</span>
            </Chip>
          ))}
        </div>
      ) : (
        <span className="pw-s-leise">{motive.length ? 'Keines deiner Motive kommt in diesem Kapitel vor.' : 'Noch keine Motive angelegt.'}</span>
      )}
      {nicht.length > 0 && (
        <div className="pw-s-chips">
          {nicht.map((z) => (
            <Chip key={z.motiv.id} variante="gestrichelt" title="Kommt in diesem Kapitel nicht vor">
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
          aria-label="Neues Motiv"
          placeholder="Motiv hinzufügen, z. B. Bleistifte …"
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
        />
        <Button type="submit" klein disabled={!neu.trim()}>
          Hinzufügen
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
  if (entwurf !== null)
    return (
      <VerweisFeld
        label="Plan-Notiz"
        wert={entwurf}
        zeilen={3}
        autoFocus
        kontext={{ typ: 'plan', id: kapitelId }}
        placeholder="Was soll hier passieren? ([[ für Verweise)"
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
      title="Plan-Notiz bearbeiten"
      onClick={() => setEntwurf(notiz)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEntwurf(notiz);
        }
      }}
    >
      {notiz.trim() ? <VerweisText text={notiz} /> : '[Deine Notiz aus der Planung]'}
    </div>
  );
}

function Abweichungen({ kapitelId }: { kapitelId: Id }) {
  const abweichungen = useStore((s) => s.daten?.plaene[kapitelId]?.abweichungen);
  const entscheiden = useStore((s) => s.abweichungEntscheiden);
  if (!abweichungen?.length) return null;
  return (
    <>
      {abweichungen.map((a) => (
        <div key={a.id} className="pw-s-abweichung">
          <span className="pw-s-abweichung__kopf">
            <span>Abweichung · {datumText(a.datum)}</span>
            <span>{ENTSCHEIDUNG[a.entscheidung]}</span>
          </span>
          <span style={{ lineHeight: 1.45 }}>
            <VerweisText text={a.notiz} />
          </span>
          {a.entscheidung === 'plan_anpassen' && a.alterPlan && (
            <span className="pw-s-leise">
              Alter Plan: <span className="pw-s-abweichung__alt">{verweiseAlsText(a.alterPlan)}</span>
            </span>
          )}
          {a.entscheidung === 'spaeter' && (
            <div className="pw-s-abweichung__aktionen">
              <Button klein onClick={() => void entscheiden(kapitelId, a.id, 'plan_anpassen', true)}>
                Plan anpassen
              </Button>
              <Button klein onClick={() => void entscheiden(kapitelId, a.id, 'alternative')}>
                Als Alternative merken
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
        Ich weiche hier ab
      </Button>
    );

  return (
    <Karte akzent aria-label="Ich weiche hier ab">
      <strong className="pw-s-abw-titel">Ich weiche hier ab</strong>
      <label htmlFor={feldId} className="pw-feld__label">
        Was läuft anders als geplant?
      </label>
      <VerweisFeld
        id={feldId}
        className="pw-s-abw-feld"
        label="Was läuft anders als geplant?"
        wert={notiz}
        zeilen={3}
        autoFocus
        kontext={{ typ: 'plan', id: kapitelId }}
        placeholder="Kurz notieren, was dir gerade eingefallen ist …"
        onChange={setNotiz}
        onKeyDown={(e) => {
          if (e.key === 'Escape') zuruecksetzen();
        }}
      />
      <fieldset className="pw-s-fieldset">
        <legend>Was passiert mit dem Plan?</legend>
        <Radio name={name} checked={entscheidung === 'plan_anpassen'} onChange={() => setEntscheidung('plan_anpassen')}>
          Plan anpassen
        </Radio>
        <Radio name={name} checked={entscheidung === 'alternative'} onChange={() => setEntscheidung('alternative')}>
          Als Alternative merken
        </Radio>
        <Radio name={name} checked={entscheidung === 'spaeter'} onChange={() => setEntscheidung('spaeter')}>
          Später entscheiden
        </Radio>
      </fieldset>
      {entscheidung === 'plan_anpassen' && (
        <Checkbox checked={uebernehmen} onChange={(e) => setUebernehmen(e.target.checked)}>
          Notiz als neue Plan-Notiz übernehmen
        </Checkbox>
      )}
      {fehler && <span className="pw-s-status__fehler">{fehler}</span>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={zuruecksetzen}>Abbrechen</Button>
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
          Speichern
        </Button>
      </div>
    </Karte>
  );
}

function PlanTab({ kapitelId }: { kapitelId: Id }) {
  const daten = useStore((s) => s.daten);
  const oeffne = useStore((s) => s.oeffne);
  if (!daten) return null;
  const plan = daten.plaene[kapitelId];
  if (!plan)
    return (
      <>
        <span className="pw-s-leise">Für dieses Kapitel gibt es noch keinen Plan.</span>
        {/* Szenen lassen sich auch ohne Plan anlegen; der Store legt den Plan beim ersten Speichern an. */}
        <SzenenKarte kapitelId={kapitelId} />
        <RechercheLeiste ziel={{ typ: 'kapitel', id: kapitelId }} />
      </>
    );
  const fokus = fokusFiguren(plan, daten.figuren);
  const straenge = plan.straenge.map((id) => daten.straenge.find((s) => s.id === id)).filter((s) => !!s);
  return (
    <>
      <Karte>
        <Abschnittslabel>Geplante Szene</Abschnittslabel>
        <strong className="pw-s-szene">{plan.szene || <span style={{ color: 'var(--ink-quiet)' }}>Noch keine Szene geplant</span>}</strong>
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
      <SzenenKarte kapitelId={kapitelId} />
      <RechercheLeiste ziel={{ typ: 'kapitel', id: kapitelId }} />
      <Abweichungen kapitelId={kapitelId} />
      <AbweichungFormular kapitelId={kapitelId} />
      <section className="pw-s-abschnitt">
        <Abschnittslabel>Erkannt in diesem Kapitel</Abschnittslabel>
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
        <Abschnittslabel>Figuren und Orte im Text</Abschnittslabel>
        <ErkanntChips kapitelId={kapitelId} mitAnzahl />
        <span className="pw-s-leise">Gestrichelt: nur erwähnt oder Existenz unsicher. Im Text unterstrichen; ⌘-Klick öffnet die Karte.</span>
      </section>
      <MotiveAbschnitt kapitelId={kapitelId} />
      {plan && (nichtImPlan.length > 0 || orteNichtImPlan.length > 0) && (
        <section className="pw-s-abschnitt">
          <Abschnittslabel>Im Text, aber nicht im Plan</Abschnittslabel>
          <div className="pw-s-chips">
            {nichtImPlan.map((id) => (
              <Chip key={id} variante="gestrichelt" title="Zum Kapitelplan hinzufügen" onClick={() => void speicherePlan({ ...plan, figuren: [...plan.figuren, id] })}>
                + {daten.figuren[id]!.name}
              </Chip>
            ))}
            {orteNichtImPlan.map((id) => (
              <Chip key={id} variante="gestrichelt" title="Zum Kapitelplan hinzufügen" onClick={() => void speicherePlan({ ...plan, orte: [...plan.orte, id] })}>
                + {daten.orte[id]!.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
      {nichtErkannt.length > 0 && (
        <section className="pw-s-abschnitt">
          <Abschnittslabel>Geplant, aber nicht im Text</Abschnittslabel>
          <div className="pw-s-chips">
            {nichtErkannt.map((id) => (
              <Chip key={id} variante="gestrichelt" onClick={() => oeffne('figuren', { figur: id })}>
                {daten.figuren[id]!.name}
              </Chip>
            ))}
          </div>
          <span className="pw-s-leise">Ich-Erzähler und indirekte Erwähnungen findet die exakte Erkennung nicht.</span>
        </section>
      )}
      <Suspense fallback={null}>
        <KiVorschlaege kapitel={kapitelId} />
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
        {HINWEIS_TYP[hinweis.typ]}
        {hinweis.offen && <span style={{ color: 'var(--real-offen)' }}>· offen</span>}
        {hinweis.quelle === 'ki' && <span style={{ marginLeft: 'auto', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>KI</span>}
      </span>
      <span className="pw-s-hinweis__titel">{hinweis.titel}</span>
      {hier.map((z, i) => (
        <span key={i} className="pw-s-hinweis__zitat">
          „{z.text}“
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
          → Kap. {(daten?.projekt.kapitel.indexOf(z.kapitel) ?? -1) + 1} · {daten?.kapitel[z.kapitel]?.titel ?? z.kapitel}
        </button>
      ))}
      {nichtGefunden && <span className="pw-s-status__fehler">Die Stelle steht so nicht mehr im Text.</span>}
      <span className="pw-s-hinweis__aktionen">
        <button
          type="button"
          className="pw-s-notizkarte__link"
          onClick={(e) => {
            e.stopPropagation();
            void hinweisEntscheiden(hinweis.schluessel, 'absicht');
          }}
        >
          Ist Absicht
        </button>
        <button
          type="button"
          className="pw-s-notizkarte__link"
          onClick={(e) => {
            e.stopPropagation();
            void hinweisEntscheiden(hinweis.schluessel, 'erledigt');
          }}
        >
          Erledigt
        </button>
        <button
          type="button"
          className="pw-s-notizkarte__link pw-s-hinweis__mehr"
          onClick={(e) => {
            e.stopPropagation();
            oeffne('hinweise', { hinweis: hinweis.schluessel });
          }}
        >
          In Hinweisen öffnen
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
  if (!hinweise.length) return <span className="pw-s-leise">Keine offenen Hinweise zu diesem Kapitel.</span>;
  return (
    <>
      {hinweise.map((h) => (
        <HinweisKarte key={h.schluessel} hinweis={h} kapitelId={kapitelId} />
      ))}
      <span className="pw-s-leise">Klick markiert die Stelle im Text.</span>
    </>
  );
}

// ---------------------------------------------------------------------------

export function SchreibInspektor({ kapitelId }: { kapitelId: Id }) {
  const [tab, setTab] = useState<Tab>(gemerkterTab);
  const anzahl = useKapitelHinweise(kapitelId).length;
  const tabId = useId();
  const wechseln = (t: Tab) => {
    gemerkterTab = t;
    setTab(t);
  };
  return (
    <Inspektor label="Seitenleiste">
      <Segment<Tab>
        label="Seitenleiste"
        wert={tab}
        onChange={wechseln}
        optionen={[
          { wert: 'plan', label: 'Plan', steuert: `${tabId}-plan` },
          { wert: 'erkannt', label: 'Erkannt', steuert: `${tabId}-erkannt` },
          { wert: 'hinweise', label: anzahl ? `Hinweise · ${anzahl}` : 'Hinweise', steuert: `${tabId}-hinweise` },
          { wert: 'stil', label: 'Stil', steuert: `${tabId}-stil` },
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
