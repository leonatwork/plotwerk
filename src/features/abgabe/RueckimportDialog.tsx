/**
 * Dialog „rueckimport“ (G7): Kommentare und nachverfolgte Änderungen aus einer zurückgeschickten .docx.
 * Kommentare werden Anmerkungen, Änderungen offene Vorschläge (lektorat/aenderungen.json). Leon nimmt jede
 * Änderung einzeln an oder lehnt sie ab; Annehmen ändert den Text über die normale Speicherung (Schnappschuss davor).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { aenderungAnsicht, lektoratZaehlen } from '@core/abgabe/index';
import { kapitelZuordnen, leseRueckimport, type KapitelZuordnung, type Rueckimport } from '@core/docx/rueckimport';
import type { Id, LektoratsAenderung } from '@core/model/types';
import { klartext } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { datum, f, liste as listeText, sprache, texte, useTexte } from '../../i18n';
import type { RueckimportBericht } from '../../state/slices/abgabe';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, Segment } from '../../ui';
import '../importexport/importexport.css';
import './abgabe.css';

function datumKurz(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : datum(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Ansicht = { art: 'liste' } | { art: 'einlesen' } | { art: 'vorschau'; name: string; r: Rueckimport };

// ---------------------------------------------------------------------------
// Einlesen und Zuordnen
// ---------------------------------------------------------------------------

function Vorschau({
  name,
  r,
  zurueck,
  fertig,
}: {
  name: string;
  r: Rueckimport;
  zurueck(): void;
  fertig(bericht: RueckimportBericht): void;
}) {
  const t = useTexte();
  const tr = t.abgabe.rueckimport;
  const daten = useStore((s) => s.daten)!;
  const uebernehmen = useStore((s) => s.abgabe.rueckimportUebernehmen);
  const projektKapitel = useMemo(() => daten.projekt.kapitel.map((id) => ({ id, titel: daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id, text: daten.kapitel[id]?.text ?? '' })), [daten]);
  const [zuordnung, setZuordnung] = useState<KapitelZuordnung[]>(() => kapitelZuordnen(r, projektKapitel));
  const [kommentare, setKommentare] = useState(r.kommentare.length > 0);
  const [aenderungen, setAenderungen] = useState(r.kapitel.some((k) => k.aenderungen.length > 0));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const anzahlAenderungen = r.kapitel.reduce((s, k) => s + k.aenderungen.length, 0);
  const zugeordnet = r.kapitel.filter((_, i) => zuordnung[i]?.kapitel);
  const uebernehmbar = zugeordnet.reduce((s, k) => s + k.aenderungen.length, 0);
  const vergeben = new Map<Id, number>();
  zuordnung.forEach((z) => z.kapitel && vergeben.set(z.kapitel, (vergeben.get(z.kapitel) ?? 0) + 1));
  const doppelt = [...vergeben.values()].some((n) => n > 1);
  const nichts = (!kommentare || r.kommentare.length === 0) && (!aenderungen || uebernehmbar === 0);

  async function los() {
    setLaeuft(true);
    setFehler(null);
    try {
      fertig(await uebernehmen(r, zuordnung.map((z) => z.kapitel), { quelle: name, kommentare, aenderungen }));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(false);
    }
  }

  return (
    <Dialog
      titel={tr.titel}
      breite={600}
      onSchliessen={laeuft ? () => undefined : zurueck}
      modalFest={laeuft}
      aktionen={
        <>
          <Button onClick={zurueck} disabled={laeuft}>
            {t.gemeinsam.zurueck}
          </Button>
          <Button variante="primaer" onClick={los} disabled={laeuft || doppelt || nichts}>
            {laeuft ? tr.wirdUebernommen : tr.uebernehmen}
          </Button>
        </>
      }
    >
      <div className="pw-ab-datei">
        <div className="pw-ab-datei__text">
          <span className="pw-ab-datei__name">{name}</span>
          <span className="pw-ab-datei__zahlen">
            {[
              f(t.abgabe.kapitelAnzahl, { n: r.kapitel.length }),
              f(tr.aenderungen, { n: anzahlAenderungen }),
              f(tr.kommentare, { n: r.kommentare.length }),
              r.autoren.length > 0 && f(tr.vonAutoren, { namen: r.autoren.join(', ') }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>

      {r.kapitel.length === 0 ? (
        <p className="pw-ie-text">{tr.keineKapitel}</p>
      ) : (
        <section className="pw-ie-abschnitt" aria-label={tr.zuordnen}>
          <div className="pw-ie-abschnitt__kopf">
            <Abschnittslabel>{tr.zuordnen}</Abschnittslabel>
            <span className="pw-ie-abschnitt__zusatz">{tr.zuordnenHilfe}</span>
          </div>
          <div className="pw-ab-zuordnung" role="group" aria-label={tr.zuordnungLabel}>
            <span className="pw-ab-zuordnung__kopf">{tr.inDatei}</span>
            <span />
            <span className="pw-ab-zuordnung__kopf">{tr.imProjekt}</span>
            {r.kapitel.map((k, i) => (
              <ZuordnungsZeile
                key={i}
                titel={k.titelNeu !== k.titel ? `${k.titel} → ${k.titelNeu}` : k.titel}
                zusatz={[f(tr.aenderungen, { n: k.aenderungen.length }), f(tr.kommentare, { n: k.kommentare }), zuordnung[i]?.art === 'reihenfolge' && tr.nachReihenfolge]
                  .filter(Boolean)
                  .join(' · ')}
                wert={zuordnung[i]?.kapitel ?? null}
                optionen={projektKapitel}
                doppelt={!!zuordnung[i]?.kapitel && (vergeben.get(zuordnung[i]!.kapitel!) ?? 0) > 1}
                setze={(id) => setZuordnung((alt) => alt.map((z, j) => (j === i ? { kapitel: id, art: id ? 'manuell' : 'keine' } : z)))}
              />
            ))}
          </div>
          {doppelt && (
            <p className="pw-ie-meldung pw-ie-meldung--fehler" role="alert">
              {tr.doppelt}
            </p>
          )}
        </section>
      )}

      <section className="pw-ie-abschnitt" aria-label={tr.uebernehmen}>
        <Abschnittslabel>{tr.uebernehmen}</Abschnittslabel>
        <Checkbox checked={aenderungen} disabled={anzahlAenderungen === 0} onChange={(e) => setAenderungen(e.target.checked)}>
          {f(tr.alsVorschlaege, { n: uebernehmbar })}
        </Checkbox>
        <Checkbox checked={kommentare} disabled={r.kommentare.length === 0} onChange={(e) => setKommentare(e.target.checked)}>
          {f(tr.alsAnmerkungen, { n: r.kommentare.length })}
        </Checkbox>
        {(r.formatierungen > 0 || r.aenderungenOhneKapitel > 0) && (
          <p className="pw-ie-text" style={{ fontSize: 12 }}>
            {f(tr.nichtUebernommen, {
              teile: listeText(
                [
                  r.formatierungen > 0 && f(tr.formatierungen, { n: r.formatierungen }),
                  r.aenderungenOhneKapitel > 0 && f(tr.vorKapitel, { n: r.aenderungenOhneKapitel }),
                ].filter((x): x is string => !!x),
              ),
            })}
          </p>
        )}
        <p className="pw-ie-text" style={{ fontSize: 12 }}>
          {tr.nochNicht}
        </p>
      </section>
      {fehler && (
        <p className="pw-ie-meldung pw-ie-meldung--fehler" role="alert">
          {fehler}
        </p>
      )}
    </Dialog>
  );
}

function ZuordnungsZeile({
  titel,
  zusatz,
  wert,
  optionen,
  doppelt,
  setze,
}: {
  titel: string;
  zusatz: string;
  wert: Id | null;
  optionen: { id: Id; titel: string }[];
  doppelt: boolean;
  setze(id: Id | null): void;
}) {
  const tr = useTexte().abgabe.rueckimport;
  return (
    <>
      <span className="pw-ab-zuordnung__word">
        <span className="pw-ab-zuordnung__titel" title={titel}>
          {titel}
        </span>
        <span className="pw-ab-zuordnung__zahl">{zusatz}</span>
      </span>
      <span className="pw-ab-zuordnung__pfeil" aria-hidden="true">
        →
      </span>
      <select
        className="pw-ab-select"
        aria-label={f(tr.projektkapitelFuer, { titel })}
        aria-invalid={doppelt || undefined}
        value={wert ?? ''}
        onChange={(e) => setze(e.target.value || null)}
      >
        <option value="">{tr.nichtUebernehmen}</option>
        {optionen.map((k, i) => (
          <option key={k.id} value={k.id}>
            {i + 1}. {k.titel}
          </option>
        ))}
      </select>
    </>
  );
}

// ---------------------------------------------------------------------------
// Änderungen prüfen
// ---------------------------------------------------------------------------

function AenderungsKarte({
  a,
  kt,
  aktiv,
  grund,
  entscheiden,
  zeigen,
  fokus,
  tasten,
  registrieren,
}: {
  a: LektoratsAenderung;
  kt: string;
  aktiv: boolean;
  grund?: string;
  entscheiden(status: LektoratsAenderung['status']): void;
  zeigen(): void;
  fokus(): void;
  tasten(e: KeyboardEvent<HTMLLIElement>): void;
  registrieren(el: HTMLLIElement | null): void;
}) {
  const tr = useTexte().abgabe.rueckimport;
  const ansicht = useMemo(() => aenderungAnsicht(kt, a), [kt, a]);
  const offen = a.status === 'offen';
  const lageText = offen && ansicht.lage !== 'bereit' ? (ansicht.lage === 'verwaist' ? tr.verwaist : tr.geaendert) : null;
  const zitat = (text: string) => f(tr.zitat, { text });
  return (
    <li
      ref={registrieren}
      className={`pw-ab-aenderung${offen ? '' : ' pw-ab-aenderung--erledigt'}`}
      tabIndex={aktiv ? 0 : -1}
      role="option"
      aria-selected={aktiv}
      aria-label={`${tr.art[a.art]}: ${[a.alt && zitat(a.alt), a.neu && `→ ${zitat(a.neu)}`].filter(Boolean).join(' ')}, ${tr.status[a.status]}`}
      onFocus={fokus}
      onKeyDown={tasten}
    >
      <div className="pw-ab-aenderung__kopf">
        <span className="pw-ab-aenderung__art">{tr.art[a.art]}</span>
        {(a.autor || a.datum) && <span>{[a.autor, datumKurz(a.datum)].filter(Boolean).join(', ')}</span>}
        {offen ? (
          lageText && <span className={`pw-ab-aenderung__status pw-ab-aenderung__status--${ansicht.lage}`}>{lageText}</span>
        ) : (
          <span className={`pw-ab-aenderung__status pw-ab-aenderung__status--${a.status}`}>{tr.status[a.status]}</span>
        )}
      </div>
      <p className="pw-ab-aenderung__text">
        {ansicht.davor}
        {ansicht.alt && <del className="pw-ab-alt">{ansicht.alt}</del>}
        {ansicht.neu && <ins className="pw-ab-neu">{ansicht.neu}</ins>}
        {ansicht.danach}
      </p>
      {grund && (
        <span className="pw-ab-aenderung__grund" role="alert">
          {grund}
        </span>
      )}
      <div className="pw-ab-aenderung__fuss">
        {offen ? (
          <>
            <Button klein variante="primaer" tabIndex={aktiv ? 0 : -1} disabled={ansicht.lage !== 'bereit'} onClick={() => entscheiden('angenommen')}>
              {tr.annehmen}
            </Button>
            <Button klein tabIndex={aktiv ? 0 : -1} onClick={() => entscheiden('abgelehnt')}>
              {tr.ablehnen}
            </Button>
          </>
        ) : (
          a.status === 'abgelehnt' && (
            <Button klein variante="leise" tabIndex={aktiv ? 0 : -1} onClick={() => entscheiden('offen')}>
              {tr.wiederOeffnen}
            </Button>
          )
        )}
        <Button klein variante="text" tabIndex={aktiv ? 0 : -1} disabled={ansicht.lage === 'verwaist'} onClick={zeigen} style={{ marginLeft: 'auto' }}>
          {tr.imTextZeigen}
        </Button>
      </div>
    </li>
  );
}

function Liste({ einlesen, schliessen, meldung }: { einlesen(): void; schliessen(): void; meldung: string | null }) {
  const t = useTexte();
  const tr = t.abgabe.rueckimport;
  const daten = useStore((s) => s.daten)!;
  const entscheiden = useStore((s) => s.abgabe.lektoratEntscheiden);
  const markiere = useStore((s) => s.markiere);
  const liste = useMemo(() => daten.lektorat ?? [], [daten.lektorat]);
  const zaehler = lektoratZaehlen(liste);
  const [filter, setFilter] = useState<'offen' | 'alle'>(zaehler.offen > 0 ? 'offen' : 'alle');
  const [aktivId, setAktivId] = useState<Id | null>(null);
  const [gruende, setGruende] = useState<Record<Id, string>>({});
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const elemente = useRef(new Map<Id, HTMLLIElement>());

  const reihe = daten.projekt.kapitel;
  const sichtbar = useMemo(() => {
    const pos = (id: Id) => {
      const i = reihe.indexOf(id);
      return i < 0 ? 1e9 : i;
    };
    return liste
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => filter === 'alle' || a.status === 'offen')
      .sort((x, y) => pos(x.a.anker.kapitel) - pos(y.a.anker.kapitel) || x.i - y.i)
      .map(({ a }) => a);
  }, [liste, filter, reihe]);
  const kts = useMemo(() => {
    const m = new Map<Id, string>();
    for (const a of sichtbar) if (!m.has(a.anker.kapitel)) m.set(a.anker.kapitel, klartext(daten.kapitel[a.anker.kapitel]?.text ?? ''));
    return m;
  }, [sichtbar, daten.kapitel]);

  const aktivIndex = Math.max(0, sichtbar.findIndex((a) => a.id === aktivId));
  const aktiv = sichtbar[aktivIndex];

  // Fokus folgt der aktiven Karte (nach Entscheidung rückt die nächste nach)
  const fokusNach = useRef<Id | null>(null);
  useEffect(() => {
    if (!fokusNach.current) return;
    const el = elemente.current.get(fokusNach.current);
    fokusNach.current = null;
    el?.focus();
  });

  async function entscheide(a: LektoratsAenderung, status: LektoratsAenderung['status']) {
    if (beschaeftigt) return;
    setBeschaeftigt(true);
    const naechste = sichtbar[aktivIndex + 1] ?? sichtbar[aktivIndex - 1];
    try {
      const e = await entscheiden(a.id, status);
      if (!e.ok) {
        setGruende((g) => ({ ...g, [a.id]: e.grund }));
        return;
      }
      setGruende((g) => {
        const { [a.id]: _weg, ...rest } = g;
        void _weg;
        return rest;
      });
      if (filter === 'offen' && status !== 'offen' && naechste) {
        setAktivId(naechste.id);
        fokusNach.current = naechste.id;
      } else fokusNach.current = a.id;
    } finally {
      setBeschaeftigt(false);
    }
  }

  const zeigen = (a: LektoratsAenderung) => {
    markiere({ kapitel: a.anker.kapitel, anker: a.anker });
    schliessen();
  };

  const bewegen = (i: number) => {
    const ziel = sichtbar[Math.max(0, Math.min(sichtbar.length - 1, i))];
    if (!ziel) return;
    setAktivId(ziel.id);
    elemente.current.get(ziel.id)?.focus();
  };

  const tasten = (a: LektoratsAenderung, i: number) => (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    const taste = e.key.toLowerCase();
    // Buchstaben für Annehmen/Ablehnen aus dem Wörterbuch (de: A/L, en: A/R) – wie in der Tastaturhilfe
    if (e.key === 'ArrowDown' || taste === 'j') bewegen(i + 1);
    else if (e.key === 'ArrowUp' || taste === 'k') bewegen(i - 1);
    else if (e.key === 'Home') bewegen(0);
    else if (e.key === 'End') bewegen(sichtbar.length - 1);
    else if (taste === tr.tasten.annehmenTaste.toLowerCase() && a.status === 'offen') void entscheide(a, 'angenommen');
    else if (taste === tr.tasten.ablehnenTaste.toLowerCase() && a.status === 'offen') void entscheide(a, 'abgelehnt');
    else if (e.key === 'Enter') zeigen(a);
    else return;
    e.preventDefault();
  };

  let letztesKapitel: Id | null = null;
  return (
    <Dialog
      titel={tr.listeTitel}
      breite={640}
      onSchliessen={schliessen}
      aktionen={
        <>
          <span className="pw-ie-fuss-links">
            {f(tr.zaehler, { offen: zaehler.offen, angenommen: zaehler.angenommen, abgelehnt: zaehler.abgelehnt })}
          </span>
          <Button onClick={einlesen}>{tr.weitereDatei}</Button>
          <Button variante="primaer" onClick={schliessen}>
            {t.gemeinsam.fertig}
          </Button>
        </>
      }
    >
      {meldung && (
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          {meldung}
        </p>
      )}
      <div className="pw-ab-filter">
        <Segment<'offen' | 'alle'>
          label={tr.filter}
          rolle="group"
          optionen={[
            { wert: 'offen', label: f(tr.filterOffen, { n: zaehler.offen }) },
            { wert: 'alle', label: f(tr.filterAlle, { n: liste.length }) },
          ]}
          wert={filter}
          onChange={setFilter}
        />
        <span className="pw-ab-tasten" style={{ marginLeft: 'auto' }}>
          <kbd>↑</kbd> <kbd>↓</kbd> {tr.tasten.waehlen} · <kbd>{tr.tasten.annehmenTaste}</kbd> {tr.tasten.annehmen} · <kbd>{tr.tasten.ablehnenTaste}</kbd> {tr.tasten.ablehnen} · <kbd>↩</kbd>{' '}
          {tr.tasten.zeigen}
        </span>
      </div>
      {sichtbar.length === 0 ? (
        <p className="pw-ie-text" role="status">
          {liste.length === 0 ? tr.keineAenderungen : tr.alleEntschieden}
        </p>
      ) : (
        <ul className="pw-ab-liste" role="listbox" aria-label={tr.listeLabel}>
          {sichtbar.map((a, i) => {
            const kopf = a.anker.kapitel !== letztesKapitel;
            letztesKapitel = a.anker.kapitel;
            const nr = reihe.indexOf(a.anker.kapitel);
            return [
              kopf && (
                <li key={`k-${a.anker.kapitel}`} role="presentation" className="pw-ab-kapitel">
                  {nr >= 0 ? `${nr + 1}. ` : ''}
                  {daten.kapitel[a.anker.kapitel]?.titel ?? daten.plaene[a.anker.kapitel]?.titel ?? a.anker.kapitel}
                </li>
              ),
              <AenderungsKarte
                key={a.id}
                a={a}
                kt={kts.get(a.anker.kapitel) ?? ''}
                aktiv={a === aktiv}
                grund={gruende[a.id]}
                entscheiden={(s) => {
                  setAktivId(a.id);
                  void entscheide(a, s);
                }}
                zeigen={() => zeigen(a)}
                fokus={() => setAktivId(a.id)}
                tasten={tasten(a, i)}
                registrieren={(el) => {
                  if (el) elemente.current.set(a.id, el);
                  else elemente.current.delete(a.id);
                }}
              />,
            ];
          })}
        </ul>
      )}
      <p className="pw-ie-text" style={{ fontSize: 12 }}>
        {tr.annehmenHilfe}
      </p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export default function RueckimportDialog({ schliessen }: DialogKomponentenProps) {
  const t = useTexte();
  const tr = t.abgabe.rueckimport;
  const daten = useStore((s) => s.daten);
  const backend = useStore((s) => s.backend);
  const hatListe = (daten?.lektorat?.length ?? 0) > 0;
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (hatListe && daten?.lektorat?.some((a) => a.status === 'offen') ? { art: 'liste' } : { art: 'einlesen' }));
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [liest, setLiest] = useState(false);

  if (!daten) {
    return (
      <Dialog titel={tr.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="pw-ie-text">{t.abgabe.keinProjekt}</p>
      </Dialog>
    );
  }

  async function dateiWaehlen() {
    if (!backend) return;
    setFehler(null);
    const datei = await backend.dateiWaehlen(['docx']);
    if (!datei) return;
    setLiest(true);
    try {
      setAnsicht({ art: 'vorschau', name: datei.name, r: await leseRueckimport(datei.daten, sprache()) });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLiest(false);
    }
  }

  if (ansicht.art === 'vorschau') {
    return (
      <Vorschau
        name={ansicht.name}
        r={ansicht.r}
        zurueck={() => setAnsicht({ art: 'einlesen' })}
        fertig={(b) => {
          // Meldung in der Sprache, die beim Abschluss gilt
          const tm = texte().abgabe.rueckimport;
          const teile = listeText([f(tm.aenderungen, { n: b.aenderungen }), f(tm.anmerkungen, { n: b.anmerkungen })]);
          const zusatz = [
            b.notizen > 0 && f(tm.notizen, { n: b.notizen }),
            b.doppelt > 0 && f(tm.schonUebernommen, { n: b.doppelt }),
            b.nichtGefunden > 0 && f(tm.nichtGefunden, { n: b.nichtGefunden }),
          ].filter(Boolean);
          setMeldung(zusatz.length ? f(tm.meldungZusatz, { teile, zusatz: zusatz.join(', ') }) : f(tm.meldung, { teile }));
          setAnsicht({ art: 'liste' });
        }}
      />
    );
  }

  if (ansicht.art === 'liste') return <Liste einlesen={() => setAnsicht({ art: 'einlesen' })} schliessen={schliessen} meldung={meldung} />;

  return (
    <Dialog
      titel={tr.titel}
      breite={560}
      onSchliessen={liest ? () => undefined : schliessen}
      modalFest={liest}
      aktionen={
        <>
          {hatListe && <Button onClick={() => setAnsicht({ art: 'liste' })}>{tr.ansehen}</Button>}
          <Button onClick={schliessen} disabled={liest}>
            {t.gemeinsam.abbrechen}
          </Button>
          <Button variante="primaer" onClick={dateiWaehlen} disabled={liest || !backend} data-autofocus>
            {liest ? tr.liest : tr.dateiWaehlen}
          </Button>
        </>
      }
    >
      <p className="pw-ie-text">{tr.einleitung}</p>
      <p className="pw-ie-text" style={{ fontSize: 12 }}>
        {tr.einleitungKlein}
      </p>
      {fehler && (
        <p className="pw-ie-meldung pw-ie-meldung--fehler" role="alert">
          {fehler}
        </p>
      )}
    </Dialog>
  );
}
