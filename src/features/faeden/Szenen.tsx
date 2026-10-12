/**
 * Szenen eines Kapitels (Szenentrenner „* * *“, Plan-Daten in KapitelPlan.szenen). Besitzer: G2.
 * SzenenKarte: im Schreiben-Inspektor (Tab „Plan“) · SzenenUebersicht: im Kapitel-Überblick.
 *
 * Die Szenen ergeben sich aus dem Text (Trenner); Leon plant je Szene Titel, Ort, Figuren, Zeit und Notiz.
 * Der Kapiteltext wird hier nie verändert.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Id, ProjektDaten, Tageszeit, Zeitpunkt } from '@core/model/types';
import {
  hatSzenen,
  szenenSprungBereich,
  szenenZeilen,
  TAGESZEIT_LABEL,
  uhrzeitNormalisieren,
  zeitHatAngaben,
  type SzenenTeil,
  type SzenenZeile,
} from '@core/struktur/szenen';
import { szenenVerweis } from '@core/recherche/index';
import { ankerErzeugen, klartext } from '@core/text/index';
import { einheitSchluessel } from '@core/zeit';
import { useStore } from '../../state/store';
import { Abschnittslabel, bestaetigen, Button, Dialog, Karte, klassen } from '../../ui';
import { AuswahlMenue, EntfernbarerChip, EntwurfBereich, EntwurfFeld } from '../akte/gemeinsam';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { f, texte, useTexte, vergleich } from '../../i18n';
import { zeitText as zeitKurz } from './gemeinsam';
import './faeden.css';

// ---------------------------------------------------------------------------
// Daten
// ---------------------------------------------------------------------------

function useSzenen(kapitelId: Id) {
  const daten = useStore((s) => s.daten);
  const text = daten?.kapitel[kapitelId]?.text;
  const szenen = daten?.plaene[kapitelId]?.szenen;
  const zeilen = useMemo(() => szenenZeilen(text, szenen), [text, szenen]);
  return { daten, zeilen };
}

/** „Fischrestaurant · Paul, Vera · Tag 8 · 23:00“ */
function szenenMeta(daten: ProjektDaten, zeile: SzenenZeile): string {
  const sz = zeile.szene;
  if (!sz) return '';
  const teile: string[] = [];
  if (sz.ort) teile.push(daten.orte[sz.ort]?.name ?? sz.ort);
  if (sz.figuren.length) teile.push(sz.figuren.map((f) => daten.figuren[f]?.name ?? f).join(', '));
  const zeit = zeitKurz(sz.zeit);
  if (zeit) teile.push(zeit);
  return teile.join(' · ');
}

function szenenTitel(zeile: SzenenZeile): string {
  return zeile.szene?.titel.trim() || f(texte().faeden.szenen.szene, { nr: zeile.index + 1 });
}

function woerterText(zeile: SzenenZeile): string {
  const t = texte();
  if (!zeile.abschnitt) return t.faeden.szenen.nochKeinText;
  return f(t.gemeinsam.woerter, { n: zeile.woerter });
}

/** „3 Szenen · 2 geplant“ */
function anzahlText(anzahl: number, geplant: number): string {
  const t = texte().faeden.szenen;
  return `${f(t.anzahl, { n: anzahl })} · ${f(t.geplant, { n: geplant })}`;
}

/** Springt im Editor an den Anfang der Szene (nur wenn der Abschnitt Text hat). */
function useSzeneZeigen(kapitelId: Id) {
  const markiere = useStore((s) => s.markiere);
  const daten = useStore((s) => s.daten);
  return (zeile: SzenenZeile) => {
    const md = daten?.kapitel[kapitelId]?.text;
    if (!zeile.abschnitt || !md) return;
    const b = szenenSprungBereich(zeile.abschnitt);
    if (!b) return;
    markiere({ kapitel: kapitelId, anker: ankerErzeugen(kapitelId, klartext(md), b.start, b.ende) });
  };
}

// ---------------------------------------------------------------------------
// Formular einer Szene
// ---------------------------------------------------------------------------

const TAGESZEITEN = Object.keys(TAGESZEIT_LABEL) as Tageszeit[];

function SzenenFormular({
  kapitelId,
  zeile,
  anzahl,
  autoFokus,
  eingerueckt = true,
}: {
  kapitelId: Id;
  zeile: SzenenZeile;
  anzahl: number;
  autoFokus?: boolean;
  /** in der Liste unter der Nummer eingerückt; im Dialog bündig */
  eingerueckt?: boolean;
}) {
  const daten = useStore((s) => s.daten);
  const aendern = useStore((s) => s.struktur.szeneAendern);
  const entfernen = useStore((s) => s.struktur.szeneEntfernen);
  const verschieben = useStore((s) => s.struktur.szeneVerschieben);
  const oeffne = useStore((s) => s.oeffne);
  const zeitWaehle = useStore((s) => s.zeit.waehle);
  const zeitSzenen = useStore((s) => s.zeit.setzeSzenen);
  const zeigen = useSzeneZeigen(kapitelId);
  const [uhrFehler, setUhrFehler] = useState(false);
  const t = useTexte();
  const ts = t.faeden.szenen;
  if (!daten) return null;
  const sz = zeile.szene;
  const idx = zeile.index;
  const nr = idx + 1;
  const setze = (teil: SzenenTeil) => void aendern(kapitelId, idx, teil);
  const zeit: Zeitpunkt = sz?.zeit ?? { sicherheit: 'fest' };
  const setzeZeit = (teil: Partial<Zeitpunkt>) => {
    const neu: Zeitpunkt = { ...zeit, ...teil };
    for (const k of Object.keys(teil) as (keyof Zeitpunkt)[]) if (neu[k] === undefined || neu[k] === '') delete neu[k];
    setze({ zeit: neu });
  };
  const figuren = sz?.figuren ?? [];
  const orte = Object.values(daten.orte).sort((a, b) => vergleich(a.name, b.name));
  const freieFiguren = Object.values(daten.figuren)
    .filter((x) => !figuren.includes(x.id))
    .sort((a, b) => vergleich(a.name, b.name));
  const fid = `fd-szene-${kapitelId}-${idx}`;

  return (
    <div className={klassen('fd-szene__formular', !eingerueckt && 'fd-szene__formular--buendig')} aria-label={f(ts.planen, { nr })} role="group">
      <div className="fd-felder">
        <label htmlFor={`${fid}-titel`}>{ts.titel}</label>
        <EntwurfFeld
          id={`${fid}-titel`}
          className="pl-eingabe"
          wert={sz?.titel ?? ''}
          placeholder={f(ts.titelPlatzhalter, { nr })}
          autoFocus={autoFokus}
          data-autofocus={autoFokus || undefined}
          onSpeichern={(titel) => setze({ titel: titel.trim() })}
        />
        <label htmlFor={`${fid}-ort`}>{ts.ort}</label>
        <select id={`${fid}-ort`} className="pl-select" value={sz?.ort ?? ''} onChange={(e) => setze({ ort: e.target.value || undefined })}>
          <option value="">{ts.keinOrt}</option>
          {orte.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          {sz?.ort && !daten.orte[sz.ort] && <option value={sz.ort}>{f(ts.unbekannt, { id: sz.ort })}</option>}
        </select>
        <span className="fd-feldlabel" id={`${fid}-figuren`}>
          {ts.figuren}
        </span>
        <div className="fd-chips" role="group" aria-labelledby={`${fid}-figuren`}>
          {figuren.map((fig) => (
            <EntfernbarerChip key={fig} onEntfernen={() => setze({ figuren: figuren.filter((x) => x !== fig) })}>
              {daten.figuren[fig]?.name ?? fig}
            </EntfernbarerChip>
          ))}
          <AuswahlMenue
            knopf={ts.plusFigur}
            optionen={freieFiguren.map((x) => ({ wert: x.id, label: x.name, suche: x.aliase.join(' ') }))}
            leer={ts.keineWeitereFigur}
            onWaehle={(fig) => setze({ figuren: [...figuren, fig] })}
          />
        </div>
        <span className="fd-feldlabel" id={`${fid}-zeit`}>
          {ts.zeit}
        </span>
        <div className="fd-zeitfelder" role="group" aria-labelledby={`${fid}-zeit`}>
          <EntwurfFeld
            className="pl-eingabe"
            aria-label={ts.tagLabel}
            inputMode="numeric"
            placeholder={ts.tag}
            style={{ padding: '0 6px' }}
            wert={zeit.tag !== undefined ? String(zeit.tag) : ''}
            onSpeichern={(w) => {
              const n = Number.parseInt(w.trim(), 10);
              setzeZeit({ tag: w.trim() === '' || !Number.isFinite(n) ? undefined : n });
            }}
          />
          <select
            className="pl-select"
            aria-label={ts.tageszeit}
            value={zeit.tageszeit ?? ''}
            onChange={(e) => setzeZeit({ tageszeit: (e.target.value || undefined) as Tageszeit | undefined })}
          >
            <option value="">{ts.tageszeit}</option>
            {TAGESZEITEN.map((tz) => (
              <option key={tz} value={tz}>
                {t.faeden.zeit.tageszeiten[tz]}
              </option>
            ))}
          </select>
          <EntwurfFeld
            className="pl-eingabe"
            aria-label={ts.uhrzeitLabel}
            aria-invalid={uhrFehler || undefined}
            placeholder={ts.uhrzeitPlatzhalter}
            style={{ padding: '0 6px', ...(uhrFehler ? { borderColor: 'var(--accent)' } : {}) }}
            title={uhrFehler ? ts.uhrzeitFehler : undefined}
            wert={zeit.uhrzeit ?? ''}
            onSpeichern={(w) => {
              if (w.trim() === '') {
                setUhrFehler(false);
                return setzeZeit({ uhrzeit: undefined });
              }
              const u = uhrzeitNormalisieren(w);
              setUhrFehler(!u);
              if (u) setzeZeit({ uhrzeit: u });
            }}
          />
        </div>
        <label htmlFor={`${fid}-notiz`}>{ts.notiz}</label>
        <EntwurfBereich
          id={`${fid}-notiz`}
          className="pl-bereich"
          rows={2}
          autoHoehe
          wert={sz?.notiz ?? ''}
          placeholder={ts.notizPlatzhalter}
          onSpeichern={(notiz) => setze({ notiz })}
        />
      </div>
      {zeitHatAngaben(sz?.zeit) && (
        <span className="fd-leise">
          {f(ts.zeitHinweisVor, { zeit: zeitKurz(sz?.zeit) })}
          <button
            type="button"
            className="pl-link"
            onClick={() => {
              if (sz) {
                zeitSzenen(true);
                zeitWaehle(einheitSchluessel(kapitelId, sz.id));
              } else zeitWaehle(kapitelId);
              oeffne('zeitleiste', { kapitel: kapitelId });
            }}
          >
            {ts.zeitleiste}
          </button>
          {ts.zeitHinweisNach}
        </span>
      )}
      <div className="fd-aktionen">
        {zeile.abschnitt && zeile.woerter > 0 && (
          <button type="button" className="pl-link" onClick={() => zeigen(zeile)}>
            {ts.imTextZeigen}
          </button>
        )}
        {sz && (
          <>
            <button
              type="button"
              className="pl-link"
              disabled={idx === 0}
              onClick={() => void verschieben(kapitelId, sz.id, idx - 1)}
              title={ts.nachVornTitel}
            >
              {ts.nachVorn}
            </button>
            <button
              type="button"
              className="pl-link"
              disabled={idx >= anzahl - 1}
              onClick={() => void verschieben(kapitelId, sz.id, idx + 1)}
              title={ts.nachHintenTitel}
            >
              {ts.nachHinten}
            </button>
            <button
              type="button"
              className="pl-link"
              style={{ marginLeft: 'auto' }}
              onClick={async () => {
                if (await bestaetigen(f(ts.entfernenFrage, { titel: szenenTitel(zeile) }), { knopf: t.gemeinsam.entfernen, titel: t.gemeinsam.szene }))
                  void entfernen(kapitelId, sz.id);
              }}
            >
              {ts.planEntfernen}
            </button>
          </>
        )}
      </div>
      {sz && <RechercheLeiste ziel={szenenVerweis(sz.id)} titel={ts.recherche} max={4} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Liste (Schreiben-Inspektor)
// ---------------------------------------------------------------------------

function SzenenZeileAnsicht({
  kapitelId,
  zeile,
  daten,
  offen,
  anzahl,
  autoFokus,
  onUmschalten,
}: {
  kapitelId: Id;
  zeile: SzenenZeile;
  daten: ProjektDaten;
  offen: boolean;
  anzahl: number;
  /** nur nach einem Klick von Leon (nicht beim bloßen Anzeigen, sonst stiehlt das Feld dem Editor den Fokus) */
  autoFokus: boolean;
  onUmschalten(): void;
}) {
  const meta = szenenMeta(daten, zeile);
  const nurPlan = !zeile.abschnitt;
  const ts = useTexte().faeden.szenen;
  return (
    <li className="fd-szene">
      <button type="button" className="fd-szene__knopf" aria-expanded={offen} onClick={onUmschalten}>
        <span className={klassen('fd-szene__nr', nurPlan && 'fd-szene__nr--plan')} aria-hidden="true">
          {zeile.index + 1}
        </span>
        <span className={klassen('fd-szene__titel', !zeile.szene?.titel.trim() && 'fd-szene__titel--leer')}>
          <span className="pw-sr">{f(ts.srSzene, { nr: zeile.index + 1 })}</span>
          {zeile.szene?.titel.trim() || (zeile.szene ? ts.ohneTitel : ts.nichtGeplant)}
        </span>
        <span className="fd-szene__woerter">{woerterText(zeile)}</span>
        {meta && <span className="fd-szene__meta">{meta}</span>}
        {zeile.anfang && !offen && <span className="fd-szene__anfang">{zeile.anfang}</span>}
      </button>
      {offen && <SzenenFormular kapitelId={kapitelId} zeile={zeile} anzahl={anzahl} autoFokus={autoFokus} />}
    </li>
  );
}

/** Pfeiltasten wandern zwischen den Szenen-Knöpfen einer Liste. */
function listenTasten(e: KeyboardEvent<HTMLElement>, selektor: string) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const knoepfe = [...e.currentTarget.querySelectorAll<HTMLElement>(selektor)];
  const i = knoepfe.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const vor = e.key === 'ArrowDown' || e.key === 'ArrowRight';
  const n = knoepfe[Math.max(0, Math.min(knoepfe.length - 1, i + (vor ? 1 : -1)))];
  if (!n) return;
  e.preventDefault();
  n.focus();
}

/** Szenen im Schreiben-Inspektor (Tab „Plan“): Liste mit aufklappbarem Plan je Szene. */
export function SzenenKarte({ kapitelId }: { kapitelId: Id }) {
  const { daten, zeilen } = useSzenen(kapitelId);
  const offen = useStore((s) => s.struktur.szeneOffen);
  const setzeOffen = useStore((s) => s.struktur.setzeSzeneOffen);
  const hinzufuegen = useStore((s) => s.struktur.szeneHinzufuegen);
  const [fokusIndex, setFokusIndex] = useState<number | null>(null);
  const ts = useTexte().faeden.szenen;
  if (!daten) return null;
  const geplant = zeilen.filter((z) => z.szene).length;
  const mitSzenen = hatSzenen(zeilen);
  const offenIndex = offen?.kapitel === kapitelId ? offen.index : null;

  return (
    <Karte aria-label={ts.ueberschrift} gap={6}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Abschnittslabel>{ts.ueberschrift}</Abschnittslabel>
        {mitSzenen && <span className="fd-leise">{anzahlText(zeilen.length, geplant)}</span>}
      </div>
      {mitSzenen ? (
        <ul className="fd-szenen-liste" style={{ listStyle: 'none', margin: 0, padding: 0 }} onKeyDown={(e) => listenTasten(e, '.fd-szene__knopf')}>
          {zeilen.map((z) => (
            <SzenenZeileAnsicht
              key={z.index}
              kapitelId={kapitelId}
              zeile={z}
              daten={daten}
              anzahl={zeilen.length}
              offen={offenIndex === z.index}
              autoFokus={fokusIndex === z.index}
              onUmschalten={() => {
                setFokusIndex(z.index);
                setzeOffen(offenIndex === z.index ? null : { kapitel: kapitelId, index: z.index });
              }}
            />
          ))}
        </ul>
      ) : (
        <span className="fd-leise">
          {ts.eineSzene} {ts.trennerHinweis}
        </span>
      )}
      <Button
        variante="gestrichelt"
        klein
        onClick={async () => setFokusIndex(await hinzufuegen(kapitelId))}
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      >
        {ts.szenePlanen}
      </Button>
    </Karte>
  );
}

// ---------------------------------------------------------------------------
// Band (Kapitel-Überblick)
// ---------------------------------------------------------------------------

/** Szenen im Kapitel-Überblick: Kacheln nebeneinander; ein Klick öffnet den Plan der Szene im Dialog. */
export function SzenenUebersicht({ kapitelId }: { kapitelId: Id }) {
  const { daten, zeilen } = useSzenen(kapitelId);
  const hinzufuegen = useStore((s) => s.struktur.szeneHinzufuegen);
  const [dialog, setDialog] = useState<number | null>(null);
  const t = useTexte();
  const ts = t.faeden.szenen;
  if (!daten) return null;
  const mitSzenen = hatSzenen(zeilen);
  const geplant = zeilen.filter((z) => z.szene).length;
  const dialogZeile = dialog !== null ? zeilen.find((z) => z.index === dialog) : undefined;
  const neu = async () => {
    const i = await hinzufuegen(kapitelId);
    if (i >= 0) setDialog(i);
  };

  return (
    <section
      aria-label={ts.ueberschrift}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 12,
        padding: mitSzenen ? '14px 16px' : '10px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--ink-quiet)' }}>{ts.kopf}</span>
        <span className="fd-leise" style={{ flex: 1, minWidth: 0 }}>
          {mitSzenen ? anzahlText(zeilen.length, geplant) : `${ts.nochEine} ${ts.trennerHinweis}`}
        </span>
        <Button variante="gestrichelt" klein onClick={() => void neu()}>
          {ts.szenePlanen}
        </Button>
      </div>
      {mitSzenen && (
        <div className="fd-szenen-band" role="list" onKeyDown={(e) => listenTasten(e, '.fd-szenen-kachel')}>
          {zeilen.map((z) => {
            const meta = szenenMeta(daten, z);
            return (
              <button
                key={z.index}
                type="button"
                role="listitem"
                className={klassen('fd-szenen-kachel', !z.abschnitt && 'fd-szenen-kachel--plan')}
                aria-label={f(ts.kachelLabel, { nr: z.index + 1, titel: szenenTitel(z) })}
                onClick={() => setDialog(z.index)}
              >
                <span className="fd-szenen-kachel__kopf">
                  {f(ts.kachelKopf, { nr: z.index + 1 })}
                  <span style={{ marginLeft: 'auto', fontWeight: 400, letterSpacing: 0 }}>{woerterText(z)}</span>
                </span>
                <span className="fd-szenen-kachel__titel" style={z.szene?.titel.trim() ? undefined : { fontWeight: 400, color: 'var(--ink-quiet)' }}>
                  {z.szene?.titel.trim() || (z.szene ? ts.ohneTitel : ts.nichtGeplant)}
                </span>
                <span className="fd-szenen-kachel__meta">{meta || z.anfang || ' '}</span>
              </button>
            );
          })}
        </div>
      )}
      {dialogZeile && (
        <Dialog
          titel={f(ts.dialogTitel, { kap: f(t.gemeinsam.kapitelKurz, { nr: daten.projekt.kapitel.indexOf(kapitelId) + 1 }), nr: dialogZeile.index + 1 })}
          onSchliessen={() => setDialog(null)}
          breite={480}
          aktionen={
            <Button variante="primaer" onClick={() => setDialog(null)}>
              {t.gemeinsam.fertig}
            </Button>
          }
        >
          {dialogZeile.anfang && (
            <span className="fd-leise" style={{ fontFamily: 'var(--schrift-text)', fontSize: 13, display: 'block', marginBottom: 8 }}>
              {f(ts.beginntMit, { anfang: dialogZeile.anfang })}
            </span>
          )}
          <SzenenFormular kapitelId={kapitelId} zeile={dialogZeile} anzahl={zeilen.length} autoFokus eingerueckt={false} />
        </Dialog>
      )}
    </section>
  );
}
