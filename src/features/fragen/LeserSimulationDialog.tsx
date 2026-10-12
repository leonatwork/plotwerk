/**
 * Dialog „leser-simulation“ (G6): Was weiß die Leserin nach Kapitel n, welche Fragen hat sie offen, was ahnt sie,
 * wo ist Spannung – und passt das zu Leons Plan? Kostenschätzung vor dem Start; das Modell liest nur Kapitel 1..n.
 * Ergebnis in .plotwerk/leser.json. Besitzer: G6.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  aktuellerStand,
  ausLeserStand,
  EFFORT,
  fadenAbgleich,
 
  leserStandVeraltet,
  offeneFragen,
  staendeFuer,
  standId,
  type FadenAbgleich,
  type LeserSimulation,
  type PlanAbgleich,
  type Schaetzung,
} from '@core/ki/index';
import type { Id, LeserAussage, ProjektDaten } from '@core/model/types';
import { fadenKarten } from '@core/struktur/faeden';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, useTexte, zahl as zahlFormat } from '../../i18n';
import { kostenWert } from '../ki/kosten';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Checkbox, Dialog, Segment } from '../../ui';
import { Belege, Etikett, formatiereDatum, kapitelTitel, kapNr, KiFehlerKasten, PlanStatus } from './gemeinsam';
import { FrageUebernahme } from './Uebernahme';

const zahl = (n: number) => zahlFormat(Math.round(n));

type Reiter = 'weiss' | 'fragen' | 'vermutungen' | 'spannung' | 'plan';

function leseParam(param: unknown): { kapitel?: Id; stand?: Id; tiefencheck?: boolean } {
  if (!param || typeof param !== 'object') return {};
  const p = param as Record<string, unknown>;
  return {
    kapitel: typeof p.kapitel === 'string' ? p.kapitel : undefined,
    stand: typeof p.stand === 'string' ? p.stand : undefined,
    tiefencheck: p.tiefencheck === true,
  };
}

/** Standard: gewähltes Kapitel, sonst das letzte Kapitel mit Text. */
export function startKapitel(daten: ProjektDaten, wunsch?: Id): Id | undefined {
  if (wunsch && daten.projekt.kapitel.includes(wunsch)) return wunsch;
  const mitText = daten.projekt.kapitel.filter((id) => daten.kapitel[id]?.text.trim());
  return mitText.at(-1) ?? daten.projekt.kapitel[0];
}

function Abschnitt({ titel, anzahl, children, leer }: { titel: string; anzahl?: number; children: ReactNode; leer?: string }) {
  return (
    <section className="pw-kl-abschnitt">
      <div className="pw-kl-abschnitt__kopf">
        <span className="pw-kl-label">{titel}</span>
        {anzahl !== undefined && <span className="pw-kl-zaehler">{anzahl}</span>}
      </div>
      {anzahl === 0 && leer ? <p className="pw-kl-klein">{leer}</p> : children}
    </section>
  );
}

function Aussagen({ daten, liste, schliessen }: { daten: ProjektDaten; liste: LeserAussage[]; schliessen(): void }) {
  return (
    <ul className="pw-kl-liste">
      {liste.map((a, i) => (
        <li key={`${i}|${a.text}`} className="pw-kl-punkt">
          <div className="pw-kl-punkt__zeile">
            <span>{a.text}</span>
          </div>
          <Belege daten={daten} belege={a.belege} nachOeffnen={schliessen} kompakt />
        </li>
      ))}
    </ul>
  );
}

function PlanListe({ daten, plan, schliessen }: { daten: ProjektDaten; plan: PlanAbgleich[]; schliessen(): void }) {
  const t = useTexte().fragen.simulation;
  return (
    <ul className="pw-kl-liste">
      {plan.map((p, i) => (
        <li key={`${p.kapitel}|${i}`} className="pw-kl-punkt">
          <div className="pw-kl-punkt__zeile">
            <span className="pw-kl-plan">
              <span className="pw-kl-plan__vor">{f(t.planSagt, { kap: kapNr(daten, p.kapitel) })}</span>
              {f(t.planAussage, { aussage: p.aussage })}
            </span>
            <PlanStatus status={p.status} />
          </div>
          {p.erklaerung && <p className="pw-kl-erklaerung">{p.erklaerung}</p>}
          <Belege daten={daten} belege={p.belege} nachOeffnen={schliessen} kompakt />
        </li>
      ))}
    </ul>
  );
}

function FadenListe({ daten, liste }: { daten: ProjektDaten; liste: FadenAbgleich[] }) {
  const t = useTexte().fragen.simulation;
  return (
    <ul className="pw-kl-liste">
      {liste.map((fa) => (
        <li key={fa.faden.id} className="pw-kl-punkt">
          <div className="pw-kl-punkt__zeile">
            <span>
              <b style={{ fontWeight: 600 }}>{fa.faden.name}</b>
              <span className="pw-kl-klein">
                {fa.soll === 'offen' ? t.planOffen : t.planAufgeloest}
                {fa.faden.aufloesungIn ? f(t.aufloesung, { kap: kapNr(daten, fa.faden.aufloesungIn) }) : ''}
              </span>
            </span>
            {fa.passt === undefined ? (
              <span className="pw-kl-status pw-kl-status--teilweise">{t.keinePassende}</span>
            ) : fa.passt ? (
              <span className="pw-kl-status pw-kl-status--belegt">{t.passt}</span>
            ) : (
              <span className="pw-kl-status pw-kl-status--nicht_belegt">{fa.soll === 'offen' ? t.haeltBeantwortet : t.nochOffen}</span>
            )}
          </div>
          {fa.frage && <p className="pw-kl-erklaerung">{f(t.leserfrage, { frage: fa.frage.frage })}</p>}
        </li>
      ))}
    </ul>
  );
}

function Ergebnis({ daten, sim, schliessen }: { daten: ProjektDaten; sim: LeserSimulation; schliessen(): void }) {
  const index = useStore((s) => s.index);
  const [reiter, setReiter] = useState<Reiter>('fragen');
  const t = useTexte().fragen.simulation;
  const offen = offeneFragen(sim);
  const beantwortet = sim.fragen.filter((f) => f.beantwortetIn);
  const faeden = useMemo(() => {
    const karten = fadenKarten(daten, index.faeden);
    return fadenAbgleich(daten.projekt.kapitel, sim.kapitel, karten, sim.fragen);
  }, [daten, index.faeden, sim]);

  const optionen: { wert: Reiter; label: string }[] = [
    { wert: 'fragen', label: f(t.reiterFragen, { n: offen.length }) },
    { wert: 'weiss', label: f(t.reiterWeiss, { n: sim.weiss.length }) },
    { wert: 'vermutungen', label: f(t.reiterAhnt, { n: sim.vermutungen.length }) },
    { wert: 'spannung', label: f(t.reiterSpannung, { n: sim.spannung.length }) },
    { wert: 'plan', label: f(t.reiterPlan, { n: sim.plan.length + faeden.length }) },
  ];

  return (
    <>
      <Segment<Reiter> label={t.ergebnisLabel} wert={reiter} onChange={(w) => setReiter(w)} optionen={optionen.map((o) => ({ ...o, steuert: `pw-kl-reiter-${o.wert}` }))} />
      <div id={`pw-kl-reiter-${reiter}`} role="tabpanel" className="pw-kl-abschnitte" aria-label={optionen.find((o) => o.wert === reiter)?.label}>
        {reiter === 'fragen' && (
          <>
            <Abschnitt titel={t.offenTitel} anzahl={offen.length} leer={t.offenLeer}>
              <ul className="pw-kl-liste">
                {offen.map((fr) => (
                  <li key={fr.id} className="pw-kl-punkt">
                    <div className="pw-kl-punkt__zeile">
                      <span>{fr.frage}</span>
                    </div>
                    <Belege daten={daten} belege={fr.belege} nachOeffnen={schliessen} kompakt />
                    <FrageUebernahme daten={daten} stand={sim.id ?? ''} standKapitel={sim.kapitel} frage={fr} schliessen={schliessen} />
                  </li>
                ))}
              </ul>
              {offen.length > 0 && <p className="pw-kl-klein">{t.uebernahmeHinweis}</p>}
            </Abschnitt>
            {beantwortet.length > 0 && (
              <Abschnitt titel={t.beantwortetTitel} anzahl={beantwortet.length}>
                <ul className="pw-kl-liste">
                  {beantwortet.map((fr) => (
                    <li key={fr.id} className="pw-kl-punkt">
                      <div className="pw-kl-punkt__zeile">
                        <span style={{ color: 'var(--ink-soft)' }}>{fr.frage}</span>
                        <Etikett>{f(t.beantwortetIn, { kap: kapNr(daten, fr.beantwortetIn!) })}</Etikett>
                      </div>
                      <Belege daten={daten} belege={fr.belege} nachOeffnen={schliessen} kompakt />
                    </li>
                  ))}
                </ul>
              </Abschnitt>
            )}
          </>
        )}
        {reiter === 'weiss' && (
          <Abschnitt titel={t.weissTitel} anzahl={sim.weiss.length} leer={t.weissLeer}>
            <Aussagen daten={daten} liste={sim.weiss} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'vermutungen' && (
          <Abschnitt titel={t.ahntTitel} anzahl={sim.vermutungen.length} leer={t.ahntLeer}>
            <Aussagen daten={daten} liste={sim.vermutungen} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'spannung' && (
          <Abschnitt titel={t.spannungTitel} anzahl={sim.spannung.length} leer={t.spannungLeer}>
            <Aussagen daten={daten} liste={sim.spannung} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'plan' && (
          <>
            <Abschnitt titel={t.planTitel} anzahl={sim.plan.length} leer={t.planLeer}>
              <PlanListe daten={daten} plan={sim.plan} schliessen={schliessen} />
            </Abschnitt>
            <Abschnitt titel={t.faedenTitel} anzahl={faeden.length} leer={t.faedenLeer}>
              <FadenListe daten={daten} liste={faeden} />
              <p className="pw-kl-klein">{t.faedenLokal}</p>
            </Abschnitt>
          </>
        )}
      </div>
    </>
  );
}

export default function LeserSimulationDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backendArt = useStore((s) => s.backend?.art);
  const k = useStore((s) => s.kileser);
  const p = leseParam(param);
  const [kapitel, setKapitel] = useState<Id | undefined>(() => (daten ? startKapitel(daten, p.kapitel ?? useStore.getState().auswahl.kapitel) : undefined));
  const [tiefencheck, setTiefencheck] = useState(p.tiefencheck ?? false);
  const [neu, setNeu] = useState(false);
  /** gewählte Simulation des Kapitels; sonst die neueste offene, sonst die neueste */
  const [standWahl, setStandWahl] = useState<Id | undefined>(p.stand);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  const staende = useMemo(() => (kapitel ? staendeFuer(daten?.kiLeser?.eintraege ?? [], kapitel) : []), [daten?.kiLeser, kapitel]);
  const stand = staende.find((e) => standId(e) === standWahl) ?? (kapitel ? aktuellerStand(staende, kapitel) : undefined) ?? staende[0];
  const sim = useMemo(() => (stand ? ausLeserStand(stand) : null), [stand]);
  const phase: 'laeuft' | 'ergebnis' | 'start' = k.simLauf ? 'laeuft' : sim && !neu ? 'ergebnis' : 'start';
  const schaetzen = k.schaetzen;
  const tt = useTexte();
  const t = tt.fragen.simulation;

  useEffect(() => {
    if (phase !== 'start' || !kapitel) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    schaetzen(kapitel, tiefencheck).then(
      (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
      (e: unknown) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
    );
    return () => {
      aktiv = false;
    };
  }, [phase, kapitel, tiefencheck, schaetzen]);

  if (!daten || !kapitel) {
    return (
      <Dialog titel={t.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{tt.gemeinsam.schliessen}</Button>}>
        <p className="pw-kl-text">{daten ? t.keineKapitel : t.projektOeffnen}</p>
      </Dialog>
    );
  }

  const nr = daten.projekt.kapitel.indexOf(kapitel) + 1;
  const fehler = k.simFehler && k.simFehler.kapitel === kapitel ? k.simFehler.fehler : null;
  const verworfen = (stand && k.simVerworfen[standId(stand)]) || [];
  const veraltet = stand ? leserStandVeraltet(daten, stand) : false;
  const gespeichert = new Set((daten.kiLeser?.eintraege ?? []).map((e) => e.kapitel));
  const textBisN = daten.projekt.kapitel.slice(0, nr).some((id) => daten.kapitel[id]?.text.trim());

  const kopf = (
    <div className="pw-kl-kopf">
      <label className="pw-kl-klein" htmlFor="pw-kl-kapitel">
        {t.leserinNach}
      </label>
      <select
        id="pw-kl-kapitel"
        className="pw-kl-auswahl"
        value={kapitel}
        disabled={phase === 'laeuft'}
        onChange={(e) => {
          setKapitel(e.target.value);
          setStandWahl(undefined);
          setNeu(false);
        }}
      >
        {daten.projekt.kapitel.map((id) => (
          <option key={id} value={id}>
            {kapitelTitel(daten, id)}
            {gespeichert.has(id) ? ' · ✓' : ''}
          </option>
        ))}
      </select>
      {phase === 'ergebnis' && stand && staende.length > 1 && (
        <select
          className="pw-kl-auswahl"
          aria-label={t.standLabel}
          value={standId(stand)}
          onChange={(e) => {
            setStandWahl(e.target.value);
          }}
        >
          {staende.map((e) => (
            <option key={standId(e)} value={standId(e)}>
              {f(e.erledigt ? t.standOptionErledigt : t.standOption, { datum: formatiereDatum(e.datum), modell: e.modell })}
            </option>
          ))}
        </select>
      )}
      {phase === 'ergebnis' && stand && staende.length <= 1 && (
        <span className="pw-kl-klein">
          {formatiereDatum(stand.datum)} · {stand.modell}
        </span>
      )}
      {phase === 'ergebnis' && stand?.erledigt && (
        <Etikett art="accent" title={f(t.erledigtTitel, { datum: formatiereDatum(stand.erledigt) })}>
          {t.erledigt}
        </Etikett>
      )}
      {phase === 'ergebnis' && veraltet && (
        <Etikett art="warn" title={t.veraltetTitel}>
          {t.veraltet}
        </Etikett>
      )}
    </div>
  );

  if (phase === 'laeuft' && k.simLauf) {
    const lnr = daten.projekt.kapitel.indexOf(k.simLauf.kapitel) + 1;
    return (
      <Dialog
        titel={t.titel}
        breite={680}
        onSchliessen={schliessen}
        className="pw-kl-dialog"
        seite={phase}
        aktionen={
          <>
            <Button onClick={schliessen}>{t.imHintergrund}</Button>
            <Button onClick={k.simAbbrechen}>{tt.gemeinsam.abbrechen}</Button>
          </>
        }
      >
        <div className="pw-kl-abschnitt" aria-live="polite">
          <p className="pw-kl-text">{f(k.simLauf.tiefencheck ? t.liestTief : t.liest, { nr: lnr })}</p>
          <div className="pw-kl-balken" role="progressbar" aria-label={t.laeuft} aria-busy="true">
            <span />
          </div>
          <p className="pw-kl-klein">{t.laeuftHinweis}</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'ergebnis' && sim) {
    return (
      <Dialog
        titel={f(t.ergebnisTitel, { nr })}
        breite={720}
        onSchliessen={schliessen}
        className="pw-kl-dialog"
        seite={phase}
        aktionen={
          <>
            <Button
              variante="leise"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                const id = standId(stand!);
                if (!(await bestaetigen(f(t.entfernenFrage, { nr, datum: formatiereDatum(stand!.datum) }), { knopf: tt.gemeinsam.loeschen }))) return;
                setStandWahl(undefined);
                await k.standEntfernen(id);
              }}
            >
              {tt.gemeinsam.loeschen}
            </Button>
            <Button onClick={() => void k.standErledigt(standId(stand!), !stand!.erledigt)}>{stand?.erledigt ? t.wiederOffen : t.alsErledigt}</Button>
            <Button onClick={() => setNeu(true)}>{veraltet ? t.neuSimulieren : t.erneutSimulieren}</Button>
            <Button variante="primaer" onClick={schliessen}>
              {tt.gemeinsam.schliessen}
            </Button>
          </>
        }
      >
        {kopf}
        {fehler && <KiFehlerKasten fehler={fehler} onSchliessen={k.fehlerZuruecksetzen} />}
        {verworfen.length > 0 && (
          <details>
            <summary className="pw-kl-klein" style={{ cursor: 'pointer' }}>
              {f(t.verworfen, { n: verworfen.length })}
            </summary>
            <ul className="pw-kl-regeln" style={{ marginTop: 6 }}>
              {verworfen.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </details>
        )}
        <Ergebnis daten={daten} sim={sim} schliessen={schliessen} />
      </Dialog>
    );
  }

  const s = schaetzung.wert;
  return (
    <Dialog
      titel={t.titel}
      breite={600}
      onSchliessen={schliessen}
      className="pw-kl-dialog"
      seite={phase}
      aktionen={
        <>
          <Button onClick={sim ? () => setNeu(false) : schliessen}>{sim ? t.zurueck : tt.gemeinsam.abbrechen}</Button>
          <Button
            variante="primaer"
            disabled={!s || schaetzung.laedt || !!schaetzung.fehler || !textBisN}
            onClick={async () => {
              const id = await k.simulieren(kapitel, tiefencheck);
              if (id) {
                setStandWahl(id);
                setNeu(false);
              }
            }}
          >
            {t.starten}
          </Button>
        </>
      }
    >
      <p className="pw-kl-text">{f(t.erklaerung, { nr })}</p>
      {kopf}
      {!sim && gespeichert.size > 0 && (
        <div className="pw-kl-gespeichert">
          <span className="pw-kl-klein">{t.gespeichertListe}</span>
          {daten.projekt.kapitel
            .filter((id) => gespeichert.has(id))
            .map((id) => (
              <button
                key={id}
                type="button"
                className="pw-kl-gespeichert__kap"
                title={f(t.gespeichertTitel, { kap: kapNr(daten, id) })}
                onClick={() => {
                  setKapitel(id);
                  setStandWahl(undefined);
                  setNeu(false);
                }}
              >
                {kapNr(daten, id)}
              </button>
            ))}
        </div>
      )}
      {fehler && <KiFehlerKasten fehler={fehler} onSchliessen={k.fehlerZuruecksetzen} />}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        {t.tiefencheck}
      </Checkbox>
      <div className="pw-kl-kasten" aria-live="polite">
        {!textBisN ? (
          <p className="pw-kl-text">{f(t.keinText, { nr })}</p>
        ) : schaetzung.fehler ? (
          <KiFehlerKasten fehler={schaetzung.fehler} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-kl-klein">{t.schaetzt}</p>
        ) : (
          <>
            <dl className="pw-kl-zeilen">
              <dt>{t.modell}</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>{t.liestLabel}</dt>
              <dd>{f(t.liestWert, { nr, kapitel: f(t.kapitelAnzahl, { n: s.kapitel.length }) })}</dd>
              <dt>{t.eingabe}</dt>
              <dd>{f(t.eingabeWert, { n: zahl(s.eingabeTokens) })}</dd>
              <dt>{t.ausgabe}</dt>
              <dd>{f(t.ausgabeWert, { n: zahl(s.ausgabeTokens) })}</dd>
              <dt>{t.kosten}</dt>
              <dd>{kostenWert(s, t.kostenWert, 'kosten')}</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-kl-klein">{t.nichtGezaehlt}</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-kl-klein">{t.demo}</p>}
    </Dialog>
  );
}
