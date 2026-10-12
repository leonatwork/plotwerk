/**
 * Bereich „Hinweise“: alle Hinweise (lokal + KI) nach Typ, Filter, Entscheidungen (Ist Absicht / Erledigt).
 * Kein Mac-Screen im Mockup: Liste + Inspektor im Stil von Kapitel.dc.html und Akte.dc.html.
 * Wiederverwendbar (z. B. Tab „Hinweise“ im Editor): <HinweisDetail hinweis={h} />.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Hinweis, HinweisEntscheidung, HinweisTyp } from '@core/model/types';
import { einheitenAusZeitHinweis } from '@core/zeit';
import { datum as datumText, f, texte, useTexte, vergleich } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Chip, Inspektor, klassen, LeerZustand, Radio, Segment, Textfeld } from '../../ui';
import { kapitelTitel, kapLabel } from '../beziehungen/gemeinsam';
import {
  filtern,
  gruppieren,
  HINWEIS_TYPEN,
  mitStatus,
  schreibweisenVarianten,
  schreibweisenZiel,
  STANDARD_FILTER,
  TYP_FARBE,
  unbekannterName,
  zaehleStatus,
  type HinweisStatus,
} from './logik';
import './hinweise.css';
import { NurMit } from '../../app/NurMit';

export { HINWEIS_TYPEN, STATUS_LABEL, TYP_LABEL, hinweisStatus } from './logik';

function useHinweise() {
  const roh = useStore((s) => s.index.hinweise);
  const entscheidungen = useStore((s) => s.daten?.entscheidungen);
  return useMemo(() => mitStatus(roh, entscheidungen), [roh, entscheidungen]);
}

const STATUS_FOLGE: (HinweisStatus | 'alle')[] = ['neu', 'absicht', 'erledigt', 'alle'];

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const filter = useStore((s) => s.hinweisFilter);
  const gewaehlt = useStore((s) => s.auswahl.hinweis);
  const waehle = useStore((s) => s.waehle);
  const setzeHinweisFilter = useStore((s) => s.setzeHinweisFilter);
  const hinweisEntscheiden = useStore((s) => s.hinweisEntscheiden);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const alle = useHinweise();
  const liste = useRef<HTMLDivElement>(null);
  const t = useTexte();
  const th = t.hinweise;

  const sichtbar = useMemo(() => filtern(alle, filter), [alle, filter]);
  const gruppen = useMemo(() => (daten ? gruppieren(daten, sichtbar) : []), [daten, sichtbar]);
  const reihenfolge = useMemo(() => gruppen.flatMap((g) => g.hinweise), [gruppen]);
  const statusZaehler = useMemo(() => zaehleStatus(filtern(alle, { ...filter, status: 'alle' })), [alle, filter]);
  const gesamt = useMemo(() => zaehleStatus(alle), [alle]);
  const typZaehler = useMemo(() => {
    const basis = filtern(alle, { ...filter, typ: 'alle' });
    const z = {} as Record<HinweisTyp, number>;
    for (const t of HINWEIS_TYPEN) z[t.typ] = basis.filter((h) => h.typ === t.typ).length;
    return { z, summe: basis.length };
  }, [alle, filter]);
  const ausgewaehlt = alle.find((h) => h.schluessel === gewaehlt) ?? null;

  // Auswahl auf den ersten sichtbaren Hinweis setzen, wenn nichts (Gültiges) gewählt ist
  useEffect(() => {
    if (!ausgewaehlt && reihenfolge[0]) waehle({ hinweis: reihenfolge[0].schluessel });
  }, [ausgewaehlt, reihenfolge, waehle]);

  if (!daten) return null;

  const entscheide = async (h: Hinweis, e: HinweisEntscheidung | null) => {
    const pos = reihenfolge.findIndex((x) => x.schluessel === h.schluessel);
    const bleibt = filter.status === 'alle' || (e ?? 'neu') === filter.status;
    await hinweisEntscheiden(h.schluessel, e);
    if (!bleibt) {
      const naechster = reihenfolge[pos + 1] ?? reihenfolge[pos - 1];
      waehle({ hinweis: naechster?.schluessel });
    }
  };

  const pfeile = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const pos = reihenfolge.findIndex((h) => h.schluessel === gewaehlt);
    const ziel = reihenfolge[Math.min(reihenfolge.length - 1, Math.max(0, pos + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!ziel) return;
    e.preventDefault();
    waehle({ hinweis: ziel.schluessel });
    liste.current?.querySelector<HTMLElement>(`[data-schluessel="${CSS.escape(ziel.schluessel)}"]`)?.focus();
  };

  const gefiltert = filter.typ !== STANDARD_FILTER.typ || filter.kapitel !== STANDARD_FILTER.kapitel || filter.status !== STANDARD_FILTER.status;
  const entschieden = gesamt.absicht + gesamt.erledigt;

  return (
    <div className="pw-hw">
      <div className="pw-hw-haupt">
        <div className="pw-hw-kopf">
          <div className="pw-hw-kopf__titel">
            <h1>{th.titel}</h1>
            <span className="pw-hw-kopf__notiz">
              {alle.length === 0 ? th.nochKeine : f(th.kopfNotiz, { neu: gesamt.neu, entschieden })}
            </span>
          </div>
          {alle.length > 0 && (
            <Segment<HinweisStatus | 'alle'>
              rolle="group"
              label={th.statusLabel}
              groesse="hoch"
              hintergrund="selected"
              voll={false}
              wert={filter.status}
              onChange={(status) => setzeHinweisFilter({ status })}
              optionen={STATUS_FOLGE.map((s) => ({
                wert: s,
                label: f(th.statusOption, { status: s === 'alle' ? th.alle : th.status[s], n: statusZaehler[s] }),
              }))}
            />
          )}
        </div>

        {alle.length === 0 ? (
          <LeerZustand
            titel={th.keine}
            aktionen={
              <NurMit funktion="kiPruefung">
                <Button variante="primaer" onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>
                  {th.buchPruefen}
                </Button>
              </NurMit>
            }
          >
            {th.leerText}
          </LeerZustand>
        ) : (
          <>
            <div className="pw-hw-filter" role="group" aria-label={th.filterLabel}>
              <Chip variante="knopf" aktiv={filter.typ === 'alle'} onClick={() => setzeHinweisFilter({ typ: 'alle' })}>
                {th.alleTypen} <span className="pw-hw-filter__zahl">{typZaehler.summe}</span>
              </Chip>
              {HINWEIS_TYPEN.filter((typ) => typZaehler.z[typ.typ] > 0 || filter.typ === typ.typ).map((typ) => (
                <Chip
                  key={typ.typ}
                  variante="knopf"
                  punkt={typ.farbe}
                  aktiv={filter.typ === typ.typ}
                  onClick={() => setzeHinweisFilter({ typ: filter.typ === typ.typ ? 'alle' : typ.typ })}
                >
                  {th.typ[typ.typ]} <span className="pw-hw-filter__zahl">{typZaehler.z[typ.typ]}</span>
                </Chip>
              ))}
              <select
                className="pw-hw-select"
                aria-label={th.kapitel}
                value={filter.kapitel}
                onChange={(e) => setzeHinweisFilter({ kapitel: e.target.value })}
              >
                <option value="alle">{th.alleKapitel}</option>
                {daten.projekt.kapitel.map((k) => (
                  <option key={k} value={k}>
                    {kapitelTitel(daten, k)}
                  </option>
                ))}
              </select>
              {gefiltert && (
                <Button variante="text" klein onClick={() => setzeHinweisFilter(STANDARD_FILTER)}>
                  {th.filterZuruecksetzen}
                </Button>
              )}
            </div>

            <div className="pw-hw-liste" ref={liste} onKeyDown={pfeile}>
              {gruppen.length === 0 && (
                <div className="pw-hw-leer">
                  {filter.status === 'neu' ? th.keineNeuenFuerFilter : th.keineFuerFilter}
                  {gefiltert && (
                    <Button klein onClick={() => setzeHinweisFilter(STANDARD_FILTER)}>
                      {th.filterZuruecksetzen}
                    </Button>
                  )}
                </div>
              )}
              {gruppen.map((g) => {
                const typ = HINWEIS_TYPEN.find((t) => t.typ === g.typ)!;
                return (
                  <section key={g.typ} className="pw-hw-gruppe" aria-label={th.typ[g.typ]}>
                    <div className="pw-hw-gruppe__kopf">
                      <Abschnittslabel as="h2" farbe={typ.farbe}>
                        {f(th.gruppeKopf, { typ: th.typ[g.typ], n: g.hinweise.length })}
                      </Abschnittslabel>
                      <span className="pw-hw-gruppe__beschreibung">{th.typBeschreibung[g.typ]}</span>
                    </div>
                    {g.hinweise.map((h) => (
                      <button
                        key={h.schluessel}
                        type="button"
                        data-schluessel={h.schluessel}
                        className={klassen(
                          'pw-hw-eintrag',
                          h.schluessel === gewaehlt && 'pw-hw-eintrag--aktiv',
                          h.status !== 'neu' && 'pw-hw-eintrag--entschieden',
                        )}
                        aria-pressed={h.schluessel === gewaehlt}
                        onClick={() => waehle({ hinweis: h.schluessel })}
                      >
                        <span className="pw-hw-eintrag__zeile">
                          <span className="pw-hw-eintrag__titel">{h.titel}</span>
                          <span className="pw-hw-meta">
                            {h.offen && (
                              <span className="pw-hw-etikett" style={{ color: 'var(--real-offen)' }}>
                                {th.offen}
                              </span>
                            )}
                            {h.status !== 'neu' && <span>{th.status[h.status]}</span>}
                            {h.plan && <span>{th.plan}</span>}
                            <span>{h.quelle === 'ki' ? th.quelleKi : th.quelleLokal}</span>
                          </span>
                        </span>
                        <span className="pw-hw-eintrag__zitate">
                          {h.zitate.map((z) => f(th.zitat, { kap: kapLabel(daten, z.kapitel), text: z.text })).join('  ·  ')}
                        </span>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Inspektor key={ausgewaehlt?.schluessel ?? 'leer'} breite={330} hintergrund="weiss" label={th.inspektorLabel}>
        {ausgewaehlt ? (
          <HinweisDetail hinweis={ausgewaehlt} onEntscheiden={(e) => void entscheide(ausgewaehlt, e)} />
        ) : (
          <>
            <Abschnittslabel>{th.titel}</Abschnittslabel>
            <span className="pw-hw-text">{th.inspektorHilfe}</span>
          </>
        )}
      </Inspektor>
    </div>
  );
}

export interface HinweisDetailProps {
  hinweis: Hinweis;
  /** Standard: hinweisEntscheiden aus dem Store */
  onEntscheiden?(e: HinweisEntscheidung | null): void;
}

/** Inhalt eines Hinweises mit Zitaten, Erklärung und Aktionen. */
export function HinweisDetail({ hinweis: h, onEntscheiden }: HinweisDetailProps) {
  const daten = useStore((s) => s.daten);
  const hinweisEntscheiden = useStore((s) => s.hinweisEntscheiden);
  const hinweisStelleOeffnen = useStore((s) => s.hinweisStelleOeffnen);
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte();
  const th = t.hinweise;
  const td = th.detail;
  const datum = daten?.entscheidungen.hinweise.find((x) => x.schluessel === h.schluessel)?.datum;
  if (!daten) return null;
  const entscheiden = onEntscheiden ?? ((e: HinweisEntscheidung | null) => void hinweisEntscheiden(h.schluessel, e));

  return (
    <>
      <Abschnittslabel farbe={TYP_FARBE[h.typ]}>
        {f(td.kopf, { typ: th.typ[h.typ], quelle: h.quelle === 'ki' ? td.quelleKi : td.quelleLokal })}
      </Abschnittslabel>
      <strong className="pw-hw-titel">{h.titel}</strong>
      {(h.offen || h.status !== 'neu') && (
        <div className="pw-hw-etiketten">
          {h.offen && (
            <span className="pw-hw-etikett" style={{ color: 'var(--real-offen)' }} title={td.offenTitel}>
              {th.offen}
            </span>
          )}
          {h.status !== 'neu' && (
            <span className="pw-hw-etikett" style={{ color: h.status === 'erledigt' ? 'var(--real-gesichert)' : 'var(--real-vage)' }}>
              {th.status[h.status]}
              {datum ? ` · ${datumText(new Date(datum), { day: 'numeric', month: 'short' })}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="pw-hw-abschnitt">
        {h.zitate.map((z, i) => (
          <div key={`${z.kapitel}-${i}`} className="pw-hw-zitat">
            <span className="pw-hw-zitat__kap">{kapitelTitel(daten, z.kapitel)}</span>
            <p className="pw-hw-zitat__text">{f(td.zitat, { text: z.text })}</p>
            <Button klein style={{ alignSelf: 'flex-start' }} onClick={() => hinweisStelleOeffnen(z)}>
              {td.stelleOeffnen}
            </Button>
          </div>
        ))}
      </div>
      {h.erklaerung && <span className="pw-hw-text">{h.erklaerung}</span>}

      {h.plan && (h.plan.figur || h.plan.kapitel) && (
        <div className="pw-hw-abschnitt">
          <span className="pw-hw-zitat__kap">{td.weichtAb}</span>
          <span className="pw-hw-text">
            {h.plan.figur ? (daten.figuren[h.plan.figur]?.name ?? h.plan.figur) : kapitelTitel(daten, h.plan.kapitel ?? '')}
            {h.plan.feld ? ` · ${h.plan.feld}` : ''}
          </span>
          <Button
            klein
            style={{ alignSelf: 'flex-start' }}
            onClick={() => (h.plan?.figur ? oeffne('figuren', { figur: h.plan.figur }) : oeffne('akte', { plan: h.plan?.kapitel }))}
          >
            {td.planungOeffnen}
          </Button>
        </div>
      )}

      <WerkzeugVerweis hinweis={h} />

      {h.typ === 'schreibweise' && h.status === 'neu' && <SchreibweiseFestlegen hinweis={h} />}
      {h.typ === 'unbekannt' && h.status === 'neu' && <UnbekanntZuordnen hinweis={h} />}

      <span style={{ flexGrow: 1 }} />
      {h.status === 'neu' ? (
        <div className="pw-hw-aktionen">
          <Button onClick={() => entscheiden('absicht')}>{td.istAbsicht}</Button>
          <Button variante="primaer" onClick={() => entscheiden('erledigt')}>
            {td.erledigt}
          </Button>
        </div>
      ) : (
        <Button breit onClick={() => entscheiden(null)}>
          {td.zuruecksetzen}
        </Button>
      )}
    </>
  );
}

/** Sprung in das Werkzeug, aus dem der Hinweis stammt (Zeitleiste, Figurenstimme). */
function WerkzeugVerweis({ hinweis: h }: { hinweis: Hinweis }) {
  const oeffne = useStore((s) => s.oeffne);
  const zeit = useStore((s) => s.zeit);
  const fb = useStore((s) => s.figurenbogen);
  const stimme = useStore((s) => (h.schluessel.startsWith('stimme:') ? s.daten?.kiStimmen?.eintraege.find((b) => b.schluessel === h.schluessel) : undefined));
  const td = useTexte().hinweise.detail;
  if (h.typ === 'zeitleiste') {
    const einheiten = einheitenAusZeitHinweis(h.schluessel);
    const ziel = einheiten[0] ?? h.zitate[0]?.kapitel;
    if (!ziel) return null;
    return (
      <Button
        klein
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          if (ziel.includes('#')) zeit.setzeSzenen(true);
          zeit.waehle(ziel);
          oeffne('zeitleiste');
        }}
      >
        {td.inZeitleiste}
      </Button>
    );
  }
  if (stimme) {
    return (
      <Button
        klein
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          oeffne('figuren', { figur: stimme.figur });
          fb.setzeFigurenAnsicht('karte');
          fb.setzeStimmeSpalte(true);
        }}
      >
        {td.stimmeAnsehen}
      </Button>
    );
  }
  return null;
}

function SchreibweiseFestlegen({ hinweis }: { hinweis: Hinweis }) {
  const daten = useStore((s) => s.daten)!;
  const schreibweiseFestlegen = useStore((s) => s.schreibweiseFestlegen);
  const varianten = useMemo(() => schreibweisenVarianten(hinweis), [hinweis]);
  const vorschlag = useMemo(() => {
    const ziel = schreibweisenZiel(daten, varianten);
    const name = ziel ? (ziel.typ === 'ort' ? daten.orte[ziel.id]?.name : daten.figuren[ziel.id]?.name) : undefined;
    return varianten.find((v) => v === name) ?? varianten[0] ?? '';
  }, [daten, varianten]);
  const [gueltig, setGueltig] = useState(vorschlag);
  const td = useTexte().hinweise.detail;
  if (varianten.length < 2) return null;
  return (
    <div className="pw-hw-abschnitt" role="radiogroup" aria-label={td.gueltigeSchreibweise}>
      <span className="pw-hw-feldlabel">{td.gueltigeSchreibweise}</span>
      <div className="pw-hw-varianten">
        {varianten.map((v) => (
          <Radio key={v} name={`sw-${hinweis.schluessel}`} checked={gueltig === v} onChange={() => setGueltig(v)}>
            {v}
          </Radio>
        ))}
      </div>
      <Button disabled={!gueltig} onClick={() => void schreibweiseFestlegen(hinweis, gueltig, varianten)}>
        {td.schreibweiseFestlegen}
      </Button>
    </div>
  );
}

function UnbekanntZuordnen({ hinweis }: { hinweis: Hinweis }) {
  const daten = useStore((s) => s.daten)!;
  const unbekannteFigurAnlegen = useStore((s) => s.unbekannteFigurAnlegen);
  const unbekanntZuordnen = useStore((s) => s.unbekanntZuordnen);
  const oeffne = useStore((s) => s.oeffne);
  const [name, setName] = useState(() => unbekannterName(hinweis));
  const [figur, setFigur] = useState('');
  const td = useTexte().hinweise.detail;
  const figuren = Object.values(daten.figuren).sort((a, b) => vergleich(a.name, b.name));
  return (
    <div className="pw-hw-abschnitt">
      <label className="pw-hw-feldlabel" htmlFor={`name-${hinweis.schluessel}`}>
        {td.nameImText}
      </label>
      <Textfeld id={`name-${hinweis.schluessel}`} value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        disabled={!name.trim()}
        title={td.figurAnlegenTitel}
        onClick={async () => oeffne('figuren', { figur: await unbekannteFigurAnlegen(hinweis, name) })}
      >
        {td.figurAnlegen}
      </Button>
      <div className="pw-hw-zeile">
        <select
          className="pw-hw-select"
          style={{ marginLeft: 0, borderRadius: 6, height: 30 }}
          aria-label={td.figurZuordnen}
          value={figur}
          onChange={(e) => setFigur(e.target.value)}
        >
          <option value="">{td.vorhandeneFigur}</option>
          {figuren.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button disabled={!figur || !name.trim()} onClick={() => void unbekanntZuordnen(hinweis, figur, name)}>
          {td.zuordnen}
        </Button>
      </div>
    </div>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const bereit = useStore((s) => !!s.daten);
  const t = useTexte();
  return (
    <NurMit funktion="kiPruefung">
      <Button variante="primaer" disabled={!bereit} onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>
        {t.hinweise.buchPruefen}
      </Button>
    </NurMit>
  );
}

export function kontext(state: Store): string {
  const neu = state.index.hinweise.filter((h) => h.status === 'neu').length;
  const th = texte().hinweise;
  return neu > 0 ? f(th.kontextNeu, { n: neu }) : th.titel;
}
