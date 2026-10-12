/**
 * Bereich „Fäden“ (G2 Plot-Struktur): lose Enden als Karten in vier Spalten (offen, Auflösung geplant, erledigt,
 * bewusst offen), Mini-Kapitelstreifen, geplante Auflösung, Notiz und Warnung bei Ruhe ≥ Schwelle. Besitzer: G2.
 *
 * Daten: index.faeden (Analysen) + plan/faeden.md (Fadenplanung, Leon) + entscheidungen.faeden (Status).
 * Bedienung: Karten ziehen oder ⌥←/⌥→; Pfeiltasten wandern zwischen Karten; Enter wählt.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { Id, ProjektDaten } from '@core/model/types';
import {
  FADEN_SPALTEN,
  fadenKarten,
  fadenSpalten,
  RUHE_STANDARD,
  type FadenKarte,
  type FadenSpalte,
} from '@core/struktur/faeden';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Abschnittslabel, bestaetigen, Button, Chip, Dialog, Inspektor, klassen, LeerZustand, Segment, StrangPunkt, Werkzeugseite } from '../../ui';
import { EntwurfBereich, EntwurfFeld, strangFarbe, strangKurzname } from '../akte/gemeinsam';
import { fadenFarbe, kapitelDauer as kapitelText, Kapitelstreifen, kapitelVoll, kapNr, StreifenLegende } from './gemeinsam';
import { f, texte, useTexte } from '../../i18n';
import './faeden.css';

function useKarten(): { daten: ProjektDaten | null; karten: FadenKarte[] } {
  const daten = useStore((s) => s.daten);
  const faeden = useStore((s) => s.index.faeden);
  const karten = useMemo(() => (daten ? fadenKarten(daten, faeden) : []), [daten, faeden]);
  return { daten, karten };
}

function fokussiereKarte(id: Id) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-faden="${CSS.escape(id)}"]`)?.focus());
}

// ---------------------------------------------------------------------------
// Karte
// ---------------------------------------------------------------------------

function KartenInhalt({ karte, daten }: { karte: FadenKarte; daten: ProjektDaten }) {
  const strang = karte.strang ? daten.straenge.find((s) => s.id === karte.strang) : undefined;
  const t = useTexte().faeden.karte;
  return (
    <>
      <div className="fd-karte__kopf">
        {strang && <StrangPunkt farbe={strangFarbe(strang.farbe)} groesse={9} title={strang.name} style={{ marginTop: 4 }} />}
        <span className="fd-karte__name">{karte.name}</span>
        {karte.quelle === 'leon' && <span className="fd-etikett fd-etikett--neutral">{t.eigener}</span>}
      </div>
      <div className="fd-karte__meta">
        <span>
          {[
            karte.eroeffnetIn ? f(t.eroeffnet, { kap: kapNr(daten, karte.eroeffnetIn) }) : t.keinKapitel,
            karte.zuletztIn && karte.zuletztIn !== karte.eroeffnetIn ? f(t.zuletzt, { kap: kapNr(daten, karte.zuletztIn) }) : '',
            karte.aufgegriffenIn.length > 0 ? f(t.aufgegriffen, { n: karte.aufgegriffenIn.length }) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <Kapitelstreifen karte={karte} daten={daten} />
      {karte.aufloesungIn && (
        <div className="fd-karte__meta">
          <span className={klassen('fd-etikett', karte.aufloesungVerpasst || karte.aufloesungZuFrueh ? 'fd-etikett--warn' : 'fd-etikett--accent')}>
            {f(t.aufloesung, { kap: kapNr(daten, karte.aufloesungIn) })}
          </span>
        </div>
      )}
      {karte.notiz && <span className="fd-karte__notiz">{karte.notiz}</span>}
      {karte.ruhend && <span className="fd-karte__warnung">{f(t.ruht, { dauer: kapitelText(karte.ruhtSeit), schwelle: karte.schwelle })}</span>}
      {karte.aufloesungVerpasst && <span className="fd-karte__warnung">{f(t.verpasst, { kap: kapNr(daten, karte.aufloesungIn) })}</span>}
      {karte.aufloesungZuFrueh && <span className="fd-karte__warnung">{t.zuFrueh}</span>}
    </>
  );
}

function kartenLabel(karte: FadenKarte, daten: ProjektDaten): string {
  const t = texte().faeden;
  const teile = [karte.name, t.spalten[karte.spalte], f(t.karte.eroeffnet, { kap: kapNr(daten, karte.eroeffnetIn) })];
  if (karte.aufloesungIn) teile.push(f(t.karte.aufloesung, { kap: kapNr(daten, karte.aufloesungIn) }));
  if (karte.ruhend) teile.push(f(t.karte.ruhtKurz, { dauer: kapitelText(karte.ruhtSeit) }));
  return teile.join(', ');
}

function Karte({
  karte,
  daten,
  gewaehlt,
  onTaste,
}: {
  karte: FadenKarte;
  daten: ProjektDaten;
  gewaehlt: boolean;
  onTaste(e: KeyboardEvent<HTMLDivElement>, karte: FadenKarte): void;
}) {
  const waehle = useStore((s) => s.struktur.waehleFaden);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: karte.id, data: { karte } });
  const t = useTexte();
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-faden={karte.id}
      aria-pressed={gewaehlt}
      aria-label={kartenLabel(karte, daten)}
      aria-roledescription={t.faeden.karte.ziehbar}
      className={klassen(
        'fd-karte',
        karte.ruhend && 'fd-karte--ruhend',
        gewaehlt && 'fd-karte--gewaehlt',
        karte.status === 'erledigt' && 'fd-karte--erledigt',
        isDragging && 'fd-karte--ziehend',
      )}
      onClick={() => waehle(karte.id)}
      onKeyDown={(e) => onTaste(e, karte)}
    >
      <KartenInhalt karte={karte} daten={daten} />
    </div>
  );
}

function Spalte({ spalte, anzahl, children, ziel }: { spalte: FadenSpalte; anzahl: number; children: ReactNode; ziel: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: spalte });
  const titel = useTexte().faeden.spalten[spalte];
  return (
    <section ref={setNodeRef} className={klassen('fd-spalte', ziel && isOver && 'fd-spalte--ziel')} aria-label={`${titel}, ${anzahl}`} data-spalte={spalte}>
      <div className="fd-spalte__kopf">
        <span className="fd-label" style={spalte === 'geplant' ? { color: 'var(--accent-dark)' } : undefined}>
          {titel}
        </span>
        <span className="fd-leise">{anzahl}</span>
      </div>
      <div className="fd-spalte__liste">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialoge
// ---------------------------------------------------------------------------

function KapitelAuswahl({
  daten,
  wert,
  onChange,
  leer,
  id,
  label,
  autoFocus,
}: {
  daten: ProjektDaten;
  wert: Id | undefined;
  onChange(id: Id | undefined): void;
  leer: string;
  id?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const t = useTexte();
  return (
    <select
      id={id}
      aria-label={label}
      className="pl-select"
      style={{ width: '100%' }}
      value={wert ?? ''}
      autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{leer}</option>
      {daten.projekt.kapitel.map((k) => (
        <option key={k} value={k}>
          {kapitelVoll(daten, k)}
          {(daten.kapitel[k]?.text ?? '').trim() === '' ? t.faeden.kapitelAuswahl.geplant : ''}
        </option>
      ))}
    </select>
  );
}

function NeuerFadenDialog({ daten }: { daten: ProjektDaten }) {
  const setzeOffen = useStore((s) => s.struktur.setzeFadenNeuOffen);
  const neu = useStore((s) => s.struktur.fadenNeu);
  const vorschlag = useStore((s) => s.auswahl.kapitel);
  const [name, setName] = useState('');
  const [kapitel, setKapitel] = useState<Id | undefined>(vorschlag && daten.projekt.kapitel.includes(vorschlag) ? vorschlag : undefined);
  const t = useTexte();
  const tn = t.faeden.neu;
  const anlegen = async () => {
    if (!name.trim()) return;
    setzeOffen(false);
    const id = await neu(name.trim(), kapitel);
    fokussiereKarte(id);
  };
  return (
    <Dialog
      titel={tn.titel}
      onSchliessen={() => setzeOffen(false)}
      breite={440}
      aktionen={
        <>
          <Button onClick={() => setzeOffen(false)}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!name.trim()} onClick={() => void anlegen()}>
            {tn.anlegen}
          </Button>
        </>
      }
    >
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          void anlegen();
        }}
      >
        <label className="pw-feld">
          <span className="pw-feld__label">{tn.name}</span>
          <input className="pl-eingabe" data-autofocus autoFocus placeholder={tn.namePlatzhalter} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="pw-feld">
          <span className="pw-feld__label">{tn.eroeffnetIn}</span>
          <KapitelAuswahl daten={daten} wert={kapitel} onChange={setKapitel} leer={tn.keinKapitel} />
        </label>
        <span className="fd-leise">{tn.hinweis}</span>
      </form>
    </Dialog>
  );
}

/** Vorschlag fürs Auflösungskapitel: das nächste Kapitel nach dem Schreibstand bzw. der letzten Erwähnung. */
function vorschlagAufloesung(daten: ProjektDaten, karte: FadenKarte): Id | undefined {
  const reihe = daten.projekt.kapitel;
  const zuletzt = karte.zuletztIn ? reihe.indexOf(karte.zuletztIn) : -1;
  const ohneText = reihe.findIndex((k, i) => i > zuletzt && (daten.kapitel[k]?.text ?? '').trim() === '');
  return reihe[ohneText >= 0 ? ohneText : Math.min(reihe.length - 1, zuletzt + 1)];
}

function AufloesungDialog({ daten, karte, onSchliessen }: { daten: ProjektDaten; karte: FadenKarte; onSchliessen(): void }) {
  const verschieben = useStore((s) => s.struktur.fadenVerschieben);
  const [kapitel, setKapitel] = useState<Id | undefined>(() => vorschlagAufloesung(daten, karte));
  const t = useTexte();
  const ta = t.faeden.aufloesung;
  const planen = async () => {
    if (!kapitel) return;
    onSchliessen();
    await verschieben(karte.id, 'geplant', kapitel);
    fokussiereKarte(karte.id);
  };
  return (
    <Dialog
      titel={ta.titel}
      onSchliessen={onSchliessen}
      breite={440}
      aktionen={
        <>
          <Button onClick={onSchliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!kapitel} onClick={() => void planen()}>
            {ta.planen}
          </Button>
        </>
      }
    >
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void planen();
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>
          {ta.frageVor}
          <strong>{karte.name}</strong>
          {ta.frageNach}
        </span>
        <KapitelAuswahl daten={daten} wert={kapitel} onChange={setKapitel} leer={ta.kapitelWaehlen} label={ta.kapitelLabel} autoFocus />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inspektor
// ---------------------------------------------------------------------------

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fd-zeile">
      <span className="fd-zeile__label">{label}</span>
      <span style={{ minWidth: 0, flex: 1 }}>{children}</span>
    </div>
  );
}

function FadenInspektor({ daten, karten }: { daten: ProjektDaten; karten: FadenKarte[] }) {
  const auswahl = useStore((s) => s.struktur.fadenAuswahl);
  const aendern = useStore((s) => s.struktur.fadenAendern);
  const loeschen = useStore((s) => s.struktur.fadenLoeschen);
  const verschieben = useStore((s) => s.struktur.fadenVerschieben);
  const waehle = useStore((s) => s.struktur.waehleFaden);
  const oeffne = useStore((s) => s.oeffne);
  const karte = auswahl ? karten.find((k) => k.id === auswahl) : undefined;
  const t = useTexte();
  const ti = t.faeden.inspektor;

  if (!karte) {
    const ruhend = karten.filter((k) => k.ruhend);
    return (
      <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={ti.label}>
        <div className="fd-abschnitt" style={{ gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-quiet)', lineHeight: 1.5 }}>{ti.leer}</span>
          {ruhend.length > 0 && (
            <div className="fd-abschnitt">
              <Abschnittslabel>{ti.ruhenZuLange}</Abschnittslabel>
              {ruhend.map((k) => (
                <button key={k.id} type="button" className="pl-link" style={{ fontSize: 13 }} onClick={() => waehle(k.id)}>
                  {f(ti.seit, { name: k.name, dauer: kapitelText(k.ruhtSeit) })}
                </button>
              ))}
            </div>
          )}
          <div className="fd-abschnitt">
            <Abschnittslabel>{ti.kapitelstreifen}</Abschnittslabel>
            <StreifenLegende />
          </div>
          <span className="fd-leise">{ti.tastatur}</span>
        </div>
      </Inspektor>
    );
  }

  const strang = karte.strang ? daten.straenge.find((s) => s.id === karte.strang) : undefined;
  const status: 'offen' | 'erledigt' | 'bewusst_offen' = karte.status;
  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={ti.label}>
      <div key={karte.id} className="fd-abschnitt" style={{ gap: 16 }}>
        <div className="fd-abschnitt" style={{ gap: 6 }}>
          <span className="fd-label">{karte.quelle === 'leon' ? ti.eigener : ti.ausPruefung}</span>
          {karte.quelle === 'leon' ? (
            <EntwurfFeld
              className="pl-eingabe fd-inspektor-titel"
              style={{ height: 'auto', padding: '2px 6px', marginLeft: -7, border: '1px solid transparent', background: 'transparent' }}
              aria-label={ti.nameLabel}
              wert={karte.name}
              onSpeichern={(name) => name.trim() && void aendern(karte.id, { name: name.trim() })}
            />
          ) : (
            <h2 className="fd-inspektor-titel">{karte.name}</h2>
          )}
          {strang && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
              <StrangPunkt farbe={fadenFarbe(daten, karte.strang)} groesse={9} />
              {strang.name}
            </span>
          )}
        </div>

        <Segment<'offen' | 'erledigt' | 'bewusst_offen'>
          rolle="group"
          label={ti.status}
          voll
          wert={status}
          onChange={(w) => void verschieben(karte.id, w === 'offen' ? (karte.aufloesungIn ? 'geplant' : 'offen') : w)}
          optionen={[
            { wert: 'offen', label: ti.offen },
            { wert: 'erledigt', label: ti.erledigt },
            { wert: 'bewusst_offen', label: ti.bewusstOffen },
          ]}
        />

        {(karte.ruhend || karte.aufloesungVerpasst || karte.aufloesungZuFrueh) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, background: 'var(--ruhend)', color: 'var(--warm-dark)', fontSize: 12, lineHeight: 1.45 }}>
            {karte.ruhend && <span>{f(ti.ruhtWarnung, { dauer: kapitelText(karte.ruhtSeit), schwelle: karte.schwelle })}</span>}
            {karte.aufloesungVerpasst && <span>{f(t.faeden.karte.verpasst, { kap: kapitelVoll(daten, karte.aufloesungIn) })}</span>}
            {karte.aufloesungZuFrueh && <span>{ti.zuFrueh}</span>}
          </div>
        )}

        <div className="fd-abschnitt">
          <Abschnittslabel>{ti.verlauf}</Abschnittslabel>
          <Kapitelstreifen karte={karte} daten={daten} gross onKapitel={(k) => oeffne('kapitel', { kapitel: k })} />
          <StreifenLegende />
        </div>

        <div className="fd-abschnitt">
          <Zeile label={ti.eroeffnetIn}>
            {karte.quelle === 'leon' ? (
              <KapitelAuswahl daten={daten} wert={karte.eroeffnetIn} onChange={(k) => void aendern(karte.id, { eroeffnetIn: k })} leer={t.faeden.neu.keinKapitel} label={ti.eroeffnetIn} />
            ) : (
              kapitelVoll(daten, karte.eroeffnetIn)
            )}
          </Zeile>
          {karte.quelle === 'analyse' && (
            <Zeile label={ti.aufgegriffen}>{karte.aufgegriffenIn.length ? karte.aufgegriffenIn.map((k) => kapNr(daten, k)).join(', ') : ti.nochNicht}</Zeile>
          )}
          {karte.status === 'offen' && karte.zuletztIn && <Zeile label={ti.ruhtSeit}>{karte.ruhtSeit === 0 ? ti.imLetzten : kapitelText(karte.ruhtSeit)}</Zeile>}
        </div>

        <div className="fd-abschnitt">
          <label className="fd-label" htmlFor="fd-aufloesung">
            {ti.geplanteAufloesung}
          </label>
          <KapitelAuswahl
            id="fd-aufloesung"
            daten={daten}
            wert={karte.aufloesungIn}
            onChange={(k) => void aendern(karte.id, { aufloesungIn: k })}
            leer={ti.nochNichtGeplant}
          />
          <label className="fd-label" htmlFor="fd-strang">
            {ti.strang}
          </label>
          <select id="fd-strang" className="pl-select" value={karte.strang ?? ''} onChange={(e) => void aendern(karte.id, { strang: e.target.value || undefined })}>
            <option value="">{ti.keinStrang}</option>
            {daten.straenge.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="fd-label" htmlFor="fd-schwelle">
            {ti.schwelle}
          </label>
          <EntwurfFeld
            id="fd-schwelle"
            className="pl-eingabe"
            inputMode="numeric"
            style={{ width: 130 }}
            placeholder={f(ti.standard, { n: daten.fadenplanung?.ruheSchwelle ?? RUHE_STANDARD })}
            wert={karte.plan?.ruheSchwelle !== undefined ? String(karte.plan.ruheSchwelle) : ''}
            onSpeichern={(w) => {
              const n = Number.parseInt(w.trim(), 10);
              void aendern(karte.id, { ruheSchwelle: w.trim() && Number.isFinite(n) && n > 0 ? n : undefined });
            }}
          />
          <label className="fd-label" htmlFor="fd-notiz">
            {ti.notiz}
          </label>
          <EntwurfBereich
            id="fd-notiz"
            className="pl-bereich"
            rows={3}
            autoHoehe
            placeholder={ti.notizPlatzhalter}
            wert={karte.notiz ?? ''}
            onSpeichern={(notiz) => void aendern(karte.id, { notiz })}
          />
        </div>

        <div className="fd-aktionen">
          {karte.eroeffnetIn && (
            <button type="button" className="pl-link" onClick={() => oeffne('kapitel', { kapitel: karte.eroeffnetIn })}>
              {ti.eroeffnungZeigen}
            </button>
          )}
          {karte.quelle === 'leon' && (
            <button
              type="button"
              className="pl-link"
              style={{ marginLeft: 'auto' }}
              onClick={async () => {
                if (await bestaetigen(f(ti.loeschenFrage, { name: karte.name }), { knopf: t.gemeinsam.loeschen, titel: ti.label })) void loeschen(karte.id);
              }}
            >
              {ti.loeschen}
            </button>
          )}
        </div>
      </div>
    </Inspektor>
  );
}

// ---------------------------------------------------------------------------
// Leiste
// ---------------------------------------------------------------------------

function Leiste({ daten, karten }: { daten: ProjektDaten; karten: FadenKarte[] }) {
  const filter = useStore((s) => s.struktur.fadenFilter);
  const setzeFilter = useStore((s) => s.struktur.setzeFadenFilter);
  const setzeSchwelle = useStore((s) => s.struktur.ruheSchwelleSetzen);
  const schwelle = daten.fadenplanung?.ruheSchwelle ?? RUHE_STANDARD;
  const ruhend = karten.filter((k) => k.ruhend).length;
  const mitStrang = daten.straenge.filter((s) => karten.some((k) => k.strang === s.id));
  const t = useTexte().faeden.leiste;
  return (
    <div className="fd-leiste" role="toolbar" aria-label={t.label}>
      <Chip variante="knopf" aktiv={filter.strang === null} onClick={() => setzeFilter({ strang: null })}>
        {t.alleStraenge}
      </Chip>
      {mitStrang.map((s) => (
        <Chip key={s.id} variante="knopf" punkt={strangFarbe(s.farbe)} aktiv={filter.strang === s.id} onClick={() => setzeFilter({ strang: filter.strang === s.id ? null : s.id })}>
          {strangKurzname(s)}
        </Chip>
      ))}
      <span className="fd-leiste__trenner" aria-hidden="true" />
      <Chip variante="knopf" aktiv={filter.nurRuhend} onClick={() => setzeFilter({ nurRuhend: !filter.nurRuhend })}>
        {f(t.nurRuhende, { n: ruhend })}
      </Chip>
      <div className="fd-leiste__rechts">
        <span id="fd-schwelle-label">{t.warnungAb}</span>
        <div role="group" aria-labelledby="fd-schwelle-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="pl-kleinknopf" aria-label={t.verringern} disabled={schwelle <= 1} onClick={() => void setzeSchwelle(schwelle - 1)}>
            −
          </button>
          <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600, color: 'var(--ink)' }} aria-live="polite">
            {schwelle}
          </span>
          <button type="button" className="pl-kleinknopf" aria-label={t.erhoehen} onClick={() => void setzeSchwelle(schwelle + 1)}>
            +
          </button>
        </div>
        <span>{t.kapitelRuhe}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ansicht
// ---------------------------------------------------------------------------

export default function Ansicht() {
  const { daten, karten } = useKarten();
  const filter = useStore((s) => s.struktur.fadenFilter);
  const auswahl = useStore((s) => s.struktur.fadenAuswahl);
  const waehle = useStore((s) => s.struktur.waehleFaden);
  const neuOffen = useStore((s) => s.struktur.fadenNeuOffen);
  const setzeNeuOffen = useStore((s) => s.struktur.setzeFadenNeuOffen);
  const verschieben = useStore((s) => s.struktur.fadenVerschieben);
  const [ziehend, setZiehend] = useState<FadenKarte | null>(null);
  const [aufloesungFuer, setAufloesungFuer] = useState<Id | null>(null);
  const sensoren = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const t = useTexte();
  const ta = t.faeden.ansicht;

  const sichtbar = useMemo(
    () => karten.filter((k) => (filter.strang === null || k.strang === filter.strang) && (!filter.nurRuhend || k.ruhend)),
    [karten, filter],
  );
  const spalten = useMemo(() => fadenSpalten(sichtbar), [sichtbar]);

  // Auswahl aufheben, wenn der Faden verschwindet
  useEffect(() => {
    if (auswahl && karten.length && !karten.some((k) => k.id === auswahl)) waehle(null);
  }, [auswahl, karten, waehle]);

  if (!daten) return null;

  const legen = async (karte: FadenKarte, ziel: FadenSpalte) => {
    if (ziel === karte.spalte) return;
    if (ziel === 'geplant' && !karte.aufloesungIn) {
      setAufloesungFuer(karte.id);
      return;
    }
    await verschieben(karte.id, ziel);
    fokussiereKarte(karte.id);
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>, karte: FadenKarte) => {
    if (e.target !== e.currentTarget) return;
    const s = FADEN_SPALTEN.indexOf(karte.spalte);
    const liste = spalten[karte.spalte];
    const i = liste.findIndex((k) => k.id === karte.id);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      waehle(auswahl === karte.id && e.key === ' ' ? null : karte.id);
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const ziel = FADEN_SPALTEN[s + (e.key === 'ArrowRight' ? 1 : -1)];
      if (ziel) void legen(karte, ziel);
      return;
    }
    let ziel: FadenKarte | undefined;
    if (e.key === 'ArrowDown') ziel = liste[i + 1];
    else if (e.key === 'ArrowUp') ziel = liste[i - 1];
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const schritt = e.key === 'ArrowRight' ? 1 : -1;
      for (let j = s + schritt; j >= 0 && j < FADEN_SPALTEN.length && !ziel; j += schritt) {
        const andere = spalten[FADEN_SPALTEN[j]!];
        ziel = andere[Math.min(i, andere.length - 1)];
      }
    } else return;
    e.preventDefault();
    if (ziel) fokussiereKarte(ziel.id);
  };

  const start = (e: DragStartEvent) => setZiehend(karten.find((k) => k.id === e.active.id) ?? null);
  const ende = (e: DragEndEvent) => {
    setZiehend(null);
    const karte = karten.find((k) => k.id === e.active.id);
    const ziel = e.over?.id as FadenSpalte | undefined;
    if (karte && ziel && FADEN_SPALTEN.includes(ziel)) void legen(karte, ziel);
  };

  const offen = karten.filter((k) => k.status === 'offen').length;
  const ruhend = karten.filter((k) => k.ruhend).length;
  const aufloesungKarte = aufloesungFuer ? karten.find((k) => k.id === aufloesungFuer) : undefined;

  return (
    <Werkzeugseite
      titel={ta.titel}
      hinweis={
        karten.length
          ? [f(ta.anzahl, { n: karten.length }), f(ta.offen, { n: offen }), ruhend ? f(ta.ruhend, { n: ruhend }) : ''].filter(Boolean).join(' · ')
          : ta.leerHinweis
      }
      inspektor={karten.length ? <FadenInspektor daten={daten} karten={karten} /> : undefined}
    >
      {karten.length === 0 ? (
        <LeerZustand titel={ta.leerTitel} aktionen={<Button onClick={() => setzeNeuOffen(true)}>{ta.plusFaden}</Button>}>
          {ta.leerText}
        </LeerZustand>
      ) : (
        <>
          <Leiste daten={daten} karten={karten} />
          <DndContext sensors={sensoren} onDragStart={start} onDragEnd={ende} onDragCancel={() => setZiehend(null)}>
            <div className="fd-board">
              {FADEN_SPALTEN.map((sp) => (
                <Spalte key={sp} spalte={sp} anzahl={spalten[sp].length} ziel={!!ziehend && ziehend.spalte !== sp}>
                  {spalten[sp].length === 0 ? (
                    <div className="fd-spalte__leer">{filter.strang || filter.nurRuhend ? ta.keineFuerFilter : t.faeden.leer[sp]}</div>
                  ) : (
                    spalten[sp].map((k) => <Karte key={k.id} karte={k} daten={daten} gewaehlt={auswahl === k.id} onTaste={taste} />)
                  )}
                </Spalte>
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {ziehend && (
                <div className="fd-karte fd-karte--overlay">
                  <KartenInhalt karte={ziehend} daten={daten} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}
      {neuOffen && <NeuerFadenDialog daten={daten} />}
      {aufloesungKarte && <AufloesungDialog daten={daten} karte={aufloesungKarte} onSchliessen={() => setAufloesungFuer(null)} />}
    </Werkzeugseite>
  );
}

export function Titelaktionen() {
  const setzeNeuOffen = useStore((s) => s.struktur.setzeFadenNeuOffen);
  const t = useTexte();
  return <Button onClick={() => setzeNeuOffen(true)}>{t.faeden.ansicht.plusFaden}</Button>;
}

export function kontext(state: Store): string {
  void state;
  return texte().faeden.ansicht.titel;
}
