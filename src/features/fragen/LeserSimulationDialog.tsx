/**
 * Dialog „leser-simulation“ (G6): Was weiß die Leserin nach Kapitel n, welche Fragen hat sie offen, was ahnt sie,
 * wo ist Spannung – und passt das zu Leons Plan? Kostenschätzung vor dem Start; das Modell liest nur Kapitel 1..n.
 * Ergebnis in .plotwerk/leser.json. Besitzer: G6.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ausLeserStand,
  EFFORT,
  fadenAbgleich,
  formatiereUsd,
  leserStandVeraltet,
  offeneFragen,
  type FadenAbgleich,
  type LeserSimulation,
  type PlanAbgleich,
  type Schaetzung,
} from '@core/ki/index';
import type { Id, LeserAussage, ProjektDaten } from '@core/model/types';
import { fadenKarten } from '@core/struktur/faeden';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Checkbox, Dialog, Segment } from '../../ui';
import { Belege, Etikett, formatiereDatum, kapitelTitel, kapNr, KiFehlerKasten, PlanStatus } from './gemeinsam';

const zahl = (n: number) => Math.round(n).toLocaleString('de-DE');

type Reiter = 'weiss' | 'fragen' | 'vermutungen' | 'spannung' | 'plan';

function leseParam(param: unknown): { kapitel?: Id; tiefencheck?: boolean } {
  if (!param || typeof param !== 'object') return {};
  const p = param as Record<string, unknown>;
  return { kapitel: typeof p.kapitel === 'string' ? p.kapitel : undefined, tiefencheck: p.tiefencheck === true };
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
  return (
    <ul className="pw-kl-liste">
      {plan.map((p, i) => (
        <li key={`${p.kapitel}|${i}`} className="pw-kl-punkt">
          <div className="pw-kl-punkt__zeile">
            <span className="pw-kl-plan">
              <span className="pw-kl-plan__vor">{kapNr(daten, p.kapitel)} · Plan sagt:</span>„{p.aussage}“
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
  return (
    <ul className="pw-kl-liste">
      {liste.map((f) => (
        <li key={f.faden.id} className="pw-kl-punkt">
          <div className="pw-kl-punkt__zeile">
            <span>
              <b style={{ fontWeight: 600 }}>{f.faden.name}</b>
              <span className="pw-kl-klein">
                {' '}
                · Plan: {f.soll === 'offen' ? 'für die Leserin noch offen' : 'aufgelöst'}
                {f.faden.aufloesungIn ? ` (Auflösung ${kapNr(daten, f.faden.aufloesungIn)})` : ''}
              </span>
            </span>
            {f.passt === undefined ? (
              <span className="pw-kl-status pw-kl-status--teilweise">keine passende Leserfrage</span>
            ) : f.passt ? (
              <span className="pw-kl-status pw-kl-status--belegt">passt</span>
            ) : (
              <span className="pw-kl-status pw-kl-status--nicht_belegt">{f.soll === 'offen' ? 'Leserin hält es für beantwortet' : 'für die Leserin noch offen'}</span>
            )}
          </div>
          {f.frage && <p className="pw-kl-erklaerung">Leserfrage: „{f.frage.frage}“</p>}
        </li>
      ))}
    </ul>
  );
}

function Ergebnis({ daten, sim, schliessen }: { daten: ProjektDaten; sim: LeserSimulation; schliessen(): void }) {
  const index = useStore((s) => s.index);
  const [reiter, setReiter] = useState<Reiter>('fragen');
  const offen = offeneFragen(sim);
  const beantwortet = sim.fragen.filter((f) => f.beantwortetIn);
  const faeden = useMemo(() => {
    const karten = fadenKarten(daten, index.faeden);
    return fadenAbgleich(daten.projekt.kapitel, sim.kapitel, karten, sim.fragen);
  }, [daten, index.faeden, sim]);

  const optionen: { wert: Reiter; label: string }[] = [
    { wert: 'fragen', label: `Offene Fragen ${offen.length}` },
    { wert: 'weiss', label: `Weiß ${sim.weiss.length}` },
    { wert: 'vermutungen', label: `Ahnt ${sim.vermutungen.length}` },
    { wert: 'spannung', label: `Spannung ${sim.spannung.length}` },
    { wert: 'plan', label: `Plan ${sim.plan.length + faeden.length}` },
  ];

  return (
    <>
      <Segment<Reiter> label="Ergebnis der Leser-Simulation" wert={reiter} onChange={(w) => setReiter(w)} optionen={optionen.map((o) => ({ ...o, steuert: `pw-kl-reiter-${o.wert}` }))} />
      <div id={`pw-kl-reiter-${reiter}`} role="tabpanel" className="pw-kl-abschnitte" aria-label={optionen.find((o) => o.wert === reiter)?.label}>
        {reiter === 'fragen' && (
          <>
            <Abschnitt titel="Fragen, die die Leserin offen hat" anzahl={offen.length} leer="Keine offenen Fragen.">
              <ul className="pw-kl-liste">
                {offen.map((f) => (
                  <li key={f.id} className="pw-kl-punkt">
                    <div className="pw-kl-punkt__zeile">
                      <span>{f.frage}</span>
                    </div>
                    <Belege daten={daten} belege={f.belege} nachOeffnen={schliessen} kompakt />
                  </li>
                ))}
              </ul>
            </Abschnitt>
            {beantwortet.length > 0 && (
              <Abschnitt titel="Bis hier schon beantwortet" anzahl={beantwortet.length}>
                <ul className="pw-kl-liste">
                  {beantwortet.map((f) => (
                    <li key={f.id} className="pw-kl-punkt">
                      <div className="pw-kl-punkt__zeile">
                        <span style={{ color: 'var(--ink-soft)' }}>{f.frage}</span>
                        <Etikett>beantwortet in {kapNr(daten, f.beantwortetIn!)}</Etikett>
                      </div>
                      <Belege daten={daten} belege={f.belege} nachOeffnen={schliessen} kompakt />
                    </li>
                  ))}
                </ul>
              </Abschnitt>
            )}
          </>
        )}
        {reiter === 'weiss' && (
          <Abschnitt titel="Was die Leserin sicher weiß" anzahl={sim.weiss.length} leer="Nichts mit Beleg.">
            <Aussagen daten={daten} liste={sim.weiss} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'vermutungen' && (
          <Abschnitt titel="Was sie ahnt oder vermutet" anzahl={sim.vermutungen.length} leer="Keine Vermutungen mit Beleg.">
            <Aussagen daten={daten} liste={sim.vermutungen} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'spannung' && (
          <Abschnitt titel="Wo Spannung entsteht" anzahl={sim.spannung.length} leer="Keine Spannungspunkte mit Beleg.">
            <Aussagen daten={daten} liste={sim.spannung} schliessen={schliessen} />
          </Abschnitt>
        )}
        {reiter === 'plan' && (
          <>
            <Abschnitt titel="Kapitelpläne: im Text belegt?" anzahl={sim.plan.length} leer="Für Kapitel 1 bis hier gibt es keine Kapitelpläne – oder die KI hat nichts mit Beleg gefunden.">
              <PlanListe daten={daten} plan={sim.plan} schliessen={schliessen} />
            </Abschnitt>
            <Abschnitt titel="Fäden-Planung neben den Leserfragen" anzahl={faeden.length} leer="Bis hier ist kein Faden eröffnet.">
              <FadenListe daten={daten} liste={faeden} />
              <p className="pw-kl-klein">Lokaler Abgleich: Die Fäden-Planung geht nicht an die KI. Zugeordnet wird über gemeinsame Wörter.</p>
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
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  const stand = kapitel ? daten?.kiLeser?.eintraege.find((e) => e.kapitel === kapitel) : undefined;
  const sim = useMemo(() => (stand ? ausLeserStand(stand) : null), [stand]);
  const phase: 'laeuft' | 'ergebnis' | 'start' = k.simLauf ? 'laeuft' : sim && !neu ? 'ergebnis' : 'start';
  const schaetzen = k.schaetzen;

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
      <Dialog titel="Leser-Simulation" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-kl-text">{daten ? 'Das Buch hat noch keine Kapitel.' : 'Öffne zuerst ein Projekt.'}</p>
      </Dialog>
    );
  }

  const nr = daten.projekt.kapitel.indexOf(kapitel) + 1;
  const fehler = k.simFehler && k.simFehler.kapitel === kapitel ? k.simFehler.fehler : null;
  const verworfen = k.simVerworfen[kapitel] ?? [];
  const veraltet = stand ? leserStandVeraltet(daten, stand) : false;
  const gespeichert = new Set((daten.kiLeser?.eintraege ?? []).map((e) => e.kapitel));
  const textBisN = daten.projekt.kapitel.slice(0, nr).some((id) => daten.kapitel[id]?.text.trim());

  const kopf = (
    <div className="pw-kl-kopf">
      <label className="pw-kl-klein" htmlFor="pw-kl-kapitel">
        Leserin nach
      </label>
      <select
        id="pw-kl-kapitel"
        className="pw-kl-auswahl"
        value={kapitel}
        disabled={phase === 'laeuft'}
        onChange={(e) => {
          setKapitel(e.target.value);
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
      {phase === 'ergebnis' && stand && (
        <span className="pw-kl-klein">
          {formatiereDatum(stand.datum)} · {stand.modell}
        </span>
      )}
      {phase === 'ergebnis' && veraltet && (
        <Etikett art="warn" title="Text oder Plan eines Kapitels bis hier hat sich seit der Simulation geändert">
          veraltet
        </Etikett>
      )}
    </div>
  );

  if (phase === 'laeuft' && k.simLauf) {
    const lnr = daten.projekt.kapitel.indexOf(k.simLauf.kapitel) + 1;
    return (
      <Dialog
        titel="Leser-Simulation"
        breite={680}
        onSchliessen={schliessen}
        className="pw-kl-dialog"
        seite={phase}
        aktionen={
          <>
            <Button onClick={schliessen}>Im Hintergrund weiter</Button>
            <Button onClick={k.simAbbrechen}>Abbrechen</Button>
          </>
        }
      >
        <div className="pw-kl-abschnitt" aria-live="polite">
          <p className="pw-kl-text">
            Die KI liest Kapitel 1 bis {lnr} wie eine Erstleserin{k.simLauf.tiefencheck ? ' (Tiefencheck mit Opus)' : ''} …
          </p>
          <div className="pw-kl-balken" role="progressbar" aria-label="Leser-Simulation läuft" aria-busy="true">
            <span />
          </div>
          <p className="pw-kl-klein">
            Was danach kommt, bekommt sie nicht zu sehen. Das Ergebnis wird im Projektordner gespeichert, auch wenn du den Dialog schließt. „Abbrechen“ verwirft den
            Lauf – es wird nichts gespeichert.
          </p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'ergebnis' && sim) {
    return (
      <Dialog
        titel={`Was weiß die Leserin nach Kap. ${nr}?`}
        breite={720}
        onSchliessen={schliessen}
        className="pw-kl-dialog"
        seite={phase}
        aktionen={
          <>
            <Button
              variante="leise"
              style={{ marginRight: 'auto' }}
              onClick={async () => (await bestaetigen(`Leser-Simulation nach Kap. ${nr} entfernen?`, { knopf: 'Entfernen' })) && void k.standEntfernen(kapitel)}
            >
              Entfernen
            </Button>
            <Button onClick={() => setNeu(true)}>{veraltet ? 'Neu simulieren …' : 'Erneut simulieren …'}</Button>
            <Button variante="primaer" onClick={schliessen}>
              Schließen
            </Button>
          </>
        }
      >
        {kopf}
        {fehler && <KiFehlerKasten fehler={fehler} onSchliessen={k.fehlerZuruecksetzen} />}
        {verworfen.length > 0 && (
          <details>
            <summary className="pw-kl-klein" style={{ cursor: 'pointer' }}>
              {verworfen.length === 1 ? '1 Eintrag verworfen' : `${verworfen.length} Einträge verworfen`} – ohne wörtlichen Beleg oder mit Schreibvorschlag
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
      titel="Leser-Simulation"
      breite={600}
      onSchliessen={schliessen}
      className="pw-kl-dialog"
      seite={phase}
      aktionen={
        <>
          <Button onClick={sim ? () => setNeu(false) : schliessen}>{sim ? 'Zurück zum Ergebnis' : 'Abbrechen'}</Button>
          <Button
            variante="primaer"
            disabled={!s || schaetzung.laedt || !!schaetzung.fehler || !textBisN}
            onClick={async () => {
              const ok = await k.simulieren(kapitel, tiefencheck);
              if (ok) setNeu(false);
            }}
          >
            Simulation starten
          </Button>
        </>
      }
    >
      <p className="pw-kl-text">
        Die KI liest nur Kapitel 1 bis {nr} – wie eine Erstleserin, die nicht weiß, was danach kommt. Sie beschreibt, was die Leserin weiß, welche Fragen sie offen
        hat, was sie ahnt und wo Spannung entsteht, und gleicht das mit deinen Kapitelplänen ab. Jede Aussage braucht ein wörtliches Zitat. Die KI schreibt keinen
        Text.
      </p>
      {kopf}
      {fehler && <KiFehlerKasten fehler={fehler} onSchliessen={k.fehlerZuruecksetzen} />}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        Tiefencheck mit Opus – gründlicher, teurer
      </Checkbox>
      <div className="pw-kl-kasten" aria-live="polite">
        {!textBisN ? (
          <p className="pw-kl-text">Bis Kap. {nr} gibt es noch keinen Text.</p>
        ) : schaetzung.fehler ? (
          <KiFehlerKasten fehler={schaetzung.fehler} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-kl-klein">Tokens werden geschätzt …</p>
        ) : (
          <>
            <dl className="pw-kl-zeilen">
              <dt>Modell</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>Liest</dt>
              <dd>
                Kap. 1–{nr} · {s.kapitel.length === 1 ? '1 Kapitel mit Text' : `${s.kapitel.length} Kapitel mit Text`} · 1 Anfrage
              </dd>
              <dt>Eingabe</dt>
              <dd>≈ {zahl(s.eingabeTokens)} Tokens</dd>
              <dt>Ausgabe</dt>
              <dd>≈ {zahl(s.ausgabeTokens)} Tokens (mit Denken, großzügig)</dd>
              <dt>Kosten</dt>
              <dd>{formatiereUsd(s.kostenUsd)} (grob, Listenpreis)</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-kl-klein">count_tokens war nicht erreichbar, geschätzt über die Zeichenzahl.</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-kl-klein">Browser-Demo: Die Antworten kommen vom Demo-Transport, es gehen keine Daten ins Netz.</p>}
    </Dialog>
  );
}
