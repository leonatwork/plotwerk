/**
 * Bereich „Hinweise“: alle Hinweise (lokal + KI) nach Typ, Filter, Entscheidungen (Ist Absicht / Erledigt).
 * Kein Mac-Screen im Mockup: Liste + Inspektor im Stil von Kapitel.dc.html und Akte.dc.html.
 * Wiederverwendbar (z. B. Tab „Hinweise“ im Editor): <HinweisDetail hinweis={h} />.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Hinweis, HinweisEntscheidung, HinweisTyp } from '@core/model/types';
import { einheitenAusZeitHinweis } from '@core/zeit';
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
  STATUS_LABEL,
  TYP_FARBE,
  TYP_LABEL,
  unbekannterName,
  zaehleStatus,
  type HinweisStatus,
} from './logik';
import './hinweise.css';

export { HINWEIS_TYPEN, TYP_LABEL, hinweisStatus } from './logik';

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
            <h1>Hinweise</h1>
            <span className="pw-hw-kopf__notiz">
              {alle.length === 0
                ? 'Noch keine Hinweise'
                : `${gesamt.neu} neu · ${entschieden} entschieden · Zitate stehen wörtlich im Text, die KI ändert nie etwas`}
            </span>
          </div>
          {alle.length > 0 && (
            <Segment<HinweisStatus | 'alle'>
              rolle="group"
              label="Status"
              groesse="hoch"
              hintergrund="selected"
              voll={false}
              wert={filter.status}
              onChange={(status) => setzeHinweisFilter({ status })}
              optionen={STATUS_FOLGE.map((s) => ({
                wert: s,
                label: `${s === 'alle' ? 'Alle' : STATUS_LABEL[s]} · ${statusZaehler[s]}`,
              }))}
            />
          )}
        </div>

        {alle.length === 0 ? (
          <LeerZustand
            titel="Keine Hinweise"
            aktionen={
              <Button variante="primaer" onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>
                Buch prüfen
              </Button>
            }
          >
            Struktur-Hinweise und Schreibweisen erscheinen automatisch beim Speichern. Widersprüche, offene Fäden und die
            Zeitleiste findet die Prüfung, die du bewusst startest.
          </LeerZustand>
        ) : (
          <>
            <div className="pw-hw-filter" role="group" aria-label="Filter nach Typ und Kapitel">
              <Chip variante="knopf" aktiv={filter.typ === 'alle'} onClick={() => setzeHinweisFilter({ typ: 'alle' })}>
                Alle Typen <span className="pw-hw-filter__zahl">{typZaehler.summe}</span>
              </Chip>
              {HINWEIS_TYPEN.filter((t) => typZaehler.z[t.typ] > 0 || filter.typ === t.typ).map((t) => (
                <Chip
                  key={t.typ}
                  variante="knopf"
                  punkt={t.farbe}
                  aktiv={filter.typ === t.typ}
                  onClick={() => setzeHinweisFilter({ typ: filter.typ === t.typ ? 'alle' : t.typ })}
                >
                  {t.label} <span className="pw-hw-filter__zahl">{typZaehler.z[t.typ]}</span>
                </Chip>
              ))}
              <select
                className="pw-hw-select"
                aria-label="Kapitel"
                value={filter.kapitel}
                onChange={(e) => setzeHinweisFilter({ kapitel: e.target.value })}
              >
                <option value="alle">Alle Kapitel</option>
                {daten.projekt.kapitel.map((k) => (
                  <option key={k} value={k}>
                    {kapitelTitel(daten, k)}
                  </option>
                ))}
              </select>
              {gefiltert && (
                <Button variante="text" klein onClick={() => setzeHinweisFilter(STANDARD_FILTER)}>
                  Filter zurücksetzen
                </Button>
              )}
            </div>

            <div className="pw-hw-liste" ref={liste} onKeyDown={pfeile}>
              {gruppen.length === 0 && (
                <div className="pw-hw-leer">
                  {filter.status === 'neu' ? 'Keine neuen Hinweise für diesen Filter.' : 'Keine Hinweise für diesen Filter.'}
                  {gefiltert && (
                    <Button klein onClick={() => setzeHinweisFilter(STANDARD_FILTER)}>
                      Filter zurücksetzen
                    </Button>
                  )}
                </div>
              )}
              {gruppen.map((g) => {
                const typ = HINWEIS_TYPEN.find((t) => t.typ === g.typ)!;
                return (
                  <section key={g.typ} className="pw-hw-gruppe" aria-label={typ.label}>
                    <div className="pw-hw-gruppe__kopf">
                      <Abschnittslabel as="h2" farbe={typ.farbe}>
                        {typ.label} · {g.hinweise.length}
                      </Abschnittslabel>
                      <span className="pw-hw-gruppe__beschreibung">{typ.beschreibung}</span>
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
                                offen
                              </span>
                            )}
                            {h.status !== 'neu' && <span>{STATUS_LABEL[h.status]}</span>}
                            {h.plan && <span>Plan</span>}
                            <span>{h.quelle === 'ki' ? 'KI' : 'lokal'}</span>
                          </span>
                        </span>
                        <span className="pw-hw-eintrag__zitate">
                          {h.zitate.map((z) => `${kapLabel(daten, z.kapitel)}: »${z.text}«`).join('  ·  ')}
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

      <Inspektor key={ausgewaehlt?.schluessel ?? 'leer'} breite={330} hintergrund="weiss" label="Inspektor Hinweis">
        {ausgewaehlt ? (
          <HinweisDetail hinweis={ausgewaehlt} onEntscheiden={(e) => void entscheide(ausgewaehlt, e)} />
        ) : (
          <>
            <Abschnittslabel>Hinweise</Abschnittslabel>
            <span className="pw-hw-text">
              Wähle links einen Hinweis. „Stelle öffnen“ springt im Editor zum Zitat. „Ist Absicht“ und „Erledigt“ werden in
              entscheidungen.json gespeichert; entschiedene Hinweise meldet die Prüfung nicht erneut.
            </span>
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
  const datum = daten?.entscheidungen.hinweise.find((x) => x.schluessel === h.schluessel)?.datum;
  if (!daten) return null;
  const entscheiden = onEntscheiden ?? ((e: HinweisEntscheidung | null) => void hinweisEntscheiden(h.schluessel, e));

  return (
    <>
      <Abschnittslabel farbe={TYP_FARBE[h.typ]}>
        {TYP_LABEL[h.typ]} · {h.quelle === 'ki' ? 'KI-Prüfung' : 'lokal erkannt'}
      </Abschnittslabel>
      <strong className="pw-hw-titel">{h.titel}</strong>
      {(h.offen || h.status !== 'neu') && (
        <div className="pw-hw-etiketten">
          {h.offen && (
            <span className="pw-hw-etikett" style={{ color: 'var(--real-offen)' }} title="Betrifft etwas mit Realitätsebene „noch offen“">
              offen
            </span>
          )}
          {h.status !== 'neu' && (
            <span className="pw-hw-etikett" style={{ color: h.status === 'erledigt' ? 'var(--real-gesichert)' : 'var(--real-vage)' }}>
              {STATUS_LABEL[h.status]}
              {datum ? ` · ${new Date(datum).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="pw-hw-abschnitt">
        {h.zitate.map((z, i) => (
          <div key={`${z.kapitel}-${i}`} className="pw-hw-zitat">
            <span className="pw-hw-zitat__kap">{kapitelTitel(daten, z.kapitel)}</span>
            <p className="pw-hw-zitat__text">»{z.text}«</p>
            <Button klein style={{ alignSelf: 'flex-start' }} onClick={() => hinweisStelleOeffnen(z)}>
              Stelle öffnen
            </Button>
          </div>
        ))}
      </div>
      {h.erklaerung && <span className="pw-hw-text">{h.erklaerung}</span>}

      {h.plan && (h.plan.figur || h.plan.kapitel) && (
        <div className="pw-hw-abschnitt">
          <span className="pw-hw-zitat__kap">Weicht von der Planung ab</span>
          <span className="pw-hw-text">
            {h.plan.figur ? (daten.figuren[h.plan.figur]?.name ?? h.plan.figur) : kapitelTitel(daten, h.plan.kapitel ?? '')}
            {h.plan.feld ? ` · ${h.plan.feld}` : ''}
          </span>
          <Button
            klein
            style={{ alignSelf: 'flex-start' }}
            onClick={() => (h.plan?.figur ? oeffne('figuren', { figur: h.plan.figur }) : oeffne('akte', { plan: h.plan?.kapitel }))}
          >
            Planung öffnen
          </Button>
        </div>
      )}

      <WerkzeugVerweis hinweis={h} />

      {h.typ === 'schreibweise' && h.status === 'neu' && <SchreibweiseFestlegen hinweis={h} />}
      {h.typ === 'unbekannt' && h.status === 'neu' && <UnbekanntZuordnen hinweis={h} />}

      <span style={{ flexGrow: 1 }} />
      {h.status === 'neu' ? (
        <div className="pw-hw-aktionen">
          <Button onClick={() => entscheiden('absicht')}>Ist Absicht</Button>
          <Button variante="primaer" onClick={() => entscheiden('erledigt')}>
            Erledigt
          </Button>
        </div>
      ) : (
        <Button breit onClick={() => entscheiden(null)}>
          Zurücksetzen (wieder melden)
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
        In der Zeitleiste zeigen
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
        Stimme auf der Figurenkarte ansehen
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
  if (varianten.length < 2) return null;
  return (
    <div className="pw-hw-abschnitt" role="radiogroup" aria-label="Gültige Schreibweise">
      <span className="pw-hw-feldlabel">Gültige Schreibweise</span>
      <div className="pw-hw-varianten">
        {varianten.map((v) => (
          <Radio key={v} name={`sw-${hinweis.schluessel}`} checked={gueltig === v} onChange={() => setGueltig(v)}>
            {v}
          </Radio>
        ))}
      </div>
      <Button disabled={!gueltig} onClick={() => void schreibweiseFestlegen(hinweis, gueltig, varianten)}>
        Schreibweise festlegen
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
  const figuren = Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <div className="pw-hw-abschnitt">
      <label className="pw-hw-feldlabel" htmlFor={`name-${hinweis.schluessel}`}>
        Name im Text
      </label>
      <Textfeld id={`name-${hinweis.schluessel}`} value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        disabled={!name.trim()}
        title="Legt die Figur an und öffnet ihre Karte"
        onClick={async () => oeffne('figuren', { figur: await unbekannteFigurAnlegen(hinweis, name) })}
      >
        Figur anlegen
      </Button>
      <div className="pw-hw-zeile">
        <select
          className="pw-hw-select"
          style={{ marginLeft: 0, borderRadius: 6, height: 30 }}
          aria-label="Figur zuordnen"
          value={figur}
          onChange={(e) => setFigur(e.target.value)}
        >
          <option value="">Vorhandene Figur …</option>
          {figuren.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <Button disabled={!figur || !name.trim()} onClick={() => void unbekanntZuordnen(hinweis, figur, name)}>
          Zuordnen
        </Button>
      </div>
    </div>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const bereit = useStore((s) => !!s.daten);
  return (
    <Button variante="primaer" disabled={!bereit} onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>
      Buch prüfen
    </Button>
  );
}

export function kontext(state: Store): string {
  const neu = state.index.hinweise.filter((h) => h.status === 'neu').length;
  return neu > 0 ? `Hinweise · ${neu} neu` : 'Hinweise';
}
