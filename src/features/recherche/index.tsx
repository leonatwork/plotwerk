/**
 * Bereich „Recherche“ (G8): Bilder, Links und Notizen im Projektordner (recherche/), an Figuren, Orte,
 * Kapitel und Szenen geheftet. Raster oder Liste, Suche und Filter, Inspektor rechts. Besitzer: G8.
 *
 * Tastatur: Pfeiltasten wählen, ↩ bearbeitet, Leertaste zeigt ein Bild groß, ⌫ entfernt (mit Rückfrage),
 * ⌘N neuer Eintrag, ⌘F Suche, ⌘V legt ein Bild oder eine Adresse aus der Zwischenablage ab.
 * Links werden nie geladen, nur auf Klick im Standardbrowser geöffnet. Recherche geht nie an die KI (E12).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Id, ProjektDaten, RechercheArt, RechercheEintrag, Verweis } from '@core/model/types';
import {
  fehlendeZiele,
  filtereEintraege,
  freieDateien,
  linkHost,
  RECHERCHE_ORDNER,
  schlagwortListe,
  schluesselAlsVerweis,
  sortiereEintraege,
  verweisSchluessel,
  verweiseAlsText,
  verwendeteZiele,
  zielInfo,
  type ArtFilter,
  type ZielArt,
} from '@core/recherche/index';
import { f, sprache, texte, useTexte, type Woerterbuch } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Dialog, Inspektor, klassen, LeerZustand, Segment, Werkzeugseite } from '../../ui';
import { VerweisText } from '../schreiben/VerweisFeld';
import { ablegen } from './ablegen';
import { RechercheBild } from './Bild';
import { ArtSymbol, ausUebergabe, datumKurz, IconBild, IconExtern, IconLink, IconListe, IconNotiz, IconRaster, linkOeffnen, uebergabeMoeglich, ZielChip } from './gemeinsam';
import './recherche.css';
import { ZielWahl } from './ZielWahl';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Fokus liegt in einem Eingabefeld (dann keine Bereichs-Kürzel). */
function inEingabe(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function auszug(text: string, max = 220): string {
  const t = verweiseAlsText(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 2).trimEnd()} …` : t;
}

async function eintragEntfernenFragen(e: RechercheEintrag): Promise<void> {
  const r = useStore.getState().recherche;
  const t = texte();
  const datei = e.art === 'bild' && e.datei ? ` ${t.recherche.entfernen.bildDatei}` : '';
  const ok = await bestaetigen(`${f(t.recherche.entfernen.frage, { titel: e.titel })}${datei}`, { titel: t.recherche.entfernen.titel, knopf: t.gemeinsam.entfernen });
  if (ok) await r.entfernen(e.id);
}

// ---------------------------------------------------------------------------
// Filterleiste
// ---------------------------------------------------------------------------

/** Reihenfolge der Zielgruppen in der Auswahl „Geheftet an“ (Namen aus dem Wörterbuch) */
const ZIEL_GRUPPEN: ZielArt[] = ['figur', 'ort', 'kapitel', 'szene', 'plan', 'gruppe', 'idee'];

/** „2 Bilder · 1 Link“ */
function artZaehler(t: Woerterbuch, eintraege: RechercheEintrag[]): string {
  return (['bild', 'link', 'notiz'] as RechercheArt[])
    .map((a) => [a, eintraege.filter((e) => e.art === a).length] as const)
    .filter(([, n]) => n > 0)
    .map(([a, n]) => f(t.recherche.artAnzahl[a], { n }))
    .join(' · ');
}

function Filterleiste({ daten, eintraege, sucheRef }: { daten: ProjektDaten; eintraege: RechercheEintrag[]; sucheRef: React.RefObject<HTMLInputElement> }) {
  const t = useTexte();
  const r = useStore((s) => s.recherche);
  const ziele = useMemo(() => verwendeteZiele(daten, eintraege, sprache()), [daten, eintraege]);
  const schlagworte = useMemo(() => schlagwortListe(eintraege), [eintraege]);
  const zaehl = (a: RechercheArt) => eintraege.filter((e) => e.art === a).length;
  const zielWert = r.ziel ?? '';
  const zielFehlt = r.ziel && !ziele.some((z) => verweisSchluessel(z.verweis) === r.ziel);
  const gefiltert = !!(r.suche || r.art !== 'alle' || r.ziel || r.schlagwort);

  return (
    <div className="rc-filter" role="toolbar" aria-label={t.recherche.filter.label}>
      <span className="rc-filter__suche">
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          ref={sucheRef}
          type="search"
          className="rc-filter__feld"
          placeholder={t.recherche.filter.suche}
          aria-label={t.recherche.filter.sucheLabel}
          value={r.suche}
          onChange={(e) => r.setzeSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && r.suche) {
              e.preventDefault();
              e.stopPropagation();
              r.setzeSuche('');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              document.querySelector<HTMLElement>('.rc-sammlung [role="option"][tabindex="0"]')?.focus();
            }
          }}
        />
      </span>
      <Segment<ArtFilter>
        label={t.recherche.filter.art}
        rolle="group"
        hintergrund="selected"
        wert={r.art}
        onChange={r.setzeArt}
        optionen={[
          { wert: 'alle', label: t.gemeinsam.alle },
          ...(['bild', 'link', 'notiz'] as RechercheArt[]).map((a) => ({
            wert: a,
            label: (
              <span className="rc-segment-label">
                {t.recherche.artMehrzahl[a]} <span className="rc-filter__zahl">{zaehl(a)}</span>
              </span>
            ),
          })),
        ]}
      />
      <label className="rc-filter__wahl">
        <span className="pw-sr">{t.recherche.geheftetAn}</span>
        <select value={zielWert} onChange={(e) => r.setzeZiel(e.target.value ? schluesselAlsVerweis(e.target.value) : null)} className={klassen(r.ziel && 'rc-filter__wahl--aktiv')}>
          <option value="">{t.recherche.filter.alleZiele}</option>
          {zielFehlt && r.ziel && <option value={r.ziel}>{zielInfo(daten, schluesselAlsVerweis(r.ziel)!, sprache()).name ?? r.ziel}</option>}
          {ZIEL_GRUPPEN.map((art) => {
            const liste = ziele.filter((z) => z.art === art);
            if (!liste.length) return null;
            return (
              <optgroup key={art} label={t.recherche.zielGruppe[art]}>
                {liste.map((z) => (
                  <option key={verweisSchluessel(z.verweis)} value={verweisSchluessel(z.verweis)}>
                    {z.name} ({z.anzahl})
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {schlagworte.length > 0 && (
        <label className="rc-filter__wahl">
          <span className="pw-sr">{t.recherche.filter.schlagwort}</span>
          <select value={r.schlagwort ?? ''} onChange={(e) => r.setzeSchlagwort(e.target.value || null)} className={klassen(r.schlagwort && 'rc-filter__wahl--aktiv')}>
            <option value="">{t.recherche.filter.alleSchlagworte}</option>
            {r.schlagwort && !schlagworte.some((s) => s.wert.toLocaleLowerCase('de') === r.schlagwort!.toLocaleLowerCase('de')) && <option value={r.schlagwort}>{r.schlagwort}</option>}
            {schlagworte.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.wert} ({s.anzahl})
              </option>
            ))}
          </select>
        </label>
      )}
      {gefiltert && (
        <Button variante="text" klein onClick={r.filterZuruecksetzen}>
          {t.recherche.filter.zuruecksetzen}
        </Button>
      )}
      <span style={{ flex: 1 }} />
      <Segment<'raster' | 'liste'>
        label={t.recherche.filter.darstellung}
        rolle="group"
        hintergrund="selected"
        wert={r.darstellung}
        onChange={r.setzeDarstellung}
        optionen={[
          { wert: 'raster', label: <span className="rc-segment-label" title={t.recherche.filter.raster}><IconRaster size={14} /><span className="pw-sr">{t.recherche.filter.raster}</span></span> },
          { wert: 'liste', label: <span className="rc-segment-label" title={t.recherche.filter.liste}><IconListe size={14} /><span className="pw-sr">{t.recherche.filter.liste}</span></span> },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Einträge (Raster und Liste)
// ---------------------------------------------------------------------------

function Ziele({ eintrag, max = 2 }: { eintrag: RechercheEintrag; max?: number }) {
  if (!eintrag.verweise.length) return null;
  const rest = eintrag.verweise.length - max;
  return (
    <span className="rc-karte__ziele">
      {eintrag.verweise.slice(0, max).map((v) => (
        <ZielChip key={verweisSchluessel(v)} verweis={v} klein oeffnen={false} />
      ))}
      {rest > 0 && <span className="rc-karte__mehr">+{rest}</span>}
    </span>
  );
}

function Medium({ eintrag }: { eintrag: RechercheEintrag }) {
  const t = useTexte();
  if (eintrag.art === 'bild') return <RechercheBild pfad={eintrag.datei} alt="" className="rc-kachel__medium" />;
  if (eintrag.art === 'link')
    return (
      <div className="rc-kachel__medium rc-kachel__medium--link" aria-hidden="true">
        <IconLink size={22} />
        <span className="rc-kachel__host">{linkHost(eintrag.url) || t.recherche.art.link}</span>
      </div>
    );
  return (
    <div className="rc-kachel__medium rc-kachel__medium--notiz" aria-hidden="true">
      <p>{auszug(eintrag.text, 260) || eintrag.titel}</p>
    </div>
  );
}

interface EintragElementProps {
  eintrag: RechercheEintrag;
  gewaehlt: boolean;
  fokussierbar: boolean;
  onWaehlen(): void;
  onOeffnen(): void;
  setzeRef(el: HTMLElement | null): void;
}

function Kachel({ eintrag, gewaehlt, fokussierbar, onWaehlen, onOeffnen, setzeRef }: EintragElementProps) {
  const t = useTexte();
  const neben = eintrag.art === 'link' ? linkHost(eintrag.url) : t.recherche.art[eintrag.art];
  return (
    <li
      ref={setzeRef}
      role="option"
      aria-selected={gewaehlt}
      tabIndex={fokussierbar ? 0 : -1}
      className={klassen('rc-kachel', gewaehlt && 'rc-kachel--gewaehlt')}
      onClick={onWaehlen}
      onDoubleClick={onOeffnen}
      data-id={eintrag.id}
    >
      <Medium eintrag={eintrag} />
      <div className="rc-kachel__text">
        <span className="rc-kachel__titel">{eintrag.titel}</span>
        <span className="rc-kachel__neben">
          <ArtSymbol art={eintrag.art} size={11} />
          <span className="rc-kachel__nebentext">{neben}</span>
          <span className="rc-kachel__datum">{datumKurz(eintrag.erstellt)}</span>
        </span>
        <Ziele eintrag={eintrag} />
      </div>
    </li>
  );
}

function Zeile({ eintrag, gewaehlt, fokussierbar, onWaehlen, onOeffnen, setzeRef }: EintragElementProps) {
  const beschreibung = eintrag.art === 'link' ? [linkHost(eintrag.url), auszug(eintrag.text, 120)].filter(Boolean).join(' · ') : auszug(eintrag.text, 140);
  return (
    <li
      ref={setzeRef}
      role="option"
      aria-selected={gewaehlt}
      tabIndex={fokussierbar ? 0 : -1}
      className={klassen('rc-zeile', gewaehlt && 'rc-zeile--gewaehlt')}
      onClick={onWaehlen}
      onDoubleClick={onOeffnen}
      data-id={eintrag.id}
    >
      {eintrag.art === 'bild' ? (
        <RechercheBild pfad={eintrag.datei} alt="" className="rc-zeile__mini" />
      ) : (
        <span className={klassen('rc-zeile__mini rc-zeile__symbol', `rc-zeile__symbol--${eintrag.art}`)} aria-hidden="true">
          <ArtSymbol art={eintrag.art} size={15} />
        </span>
      )}
      <span className="rc-zeile__text">
        <span className="rc-zeile__titel">{eintrag.titel}</span>
        {beschreibung && <span className="rc-zeile__beschreibung">{beschreibung}</span>}
      </span>
      <Ziele eintrag={eintrag} max={3} />
      <span className="rc-zeile__datum">{datumKurz(eintrag.erstellt)}</span>
    </li>
  );
}

function Sammlung({ liste, onLupe }: { liste: RechercheEintrag[]; onLupe(id: Id): void }) {
  const t = useTexte();
  const r = useStore((s) => s.recherche);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const elemente = useRef(new Map<Id, HTMLElement>());
  const container = useRef<HTMLUListElement>(null);
  const gewaehltIndex = liste.findIndex((e) => e.id === r.gewaehlt);
  const fokusIndex = gewaehltIndex >= 0 ? gewaehltIndex : 0;
  const raster = r.darstellung === 'raster';

  // Fokus folgt der Auswahl, solange er in der Sammlung liegt
  useEffect(() => {
    if (!r.gewaehlt || !container.current?.contains(document.activeElement)) return;
    const el = elemente.current.get(r.gewaehlt);
    if (el && el !== document.activeElement) el.focus();
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [r.gewaehlt]);

  const spalten = () => {
    if (!raster || !container.current) return 1;
    return Math.max(1, getComputedStyle(container.current).gridTemplateColumns.split(' ').filter(Boolean).length);
  };

  const taste = (e: KeyboardEvent<HTMLUListElement>) => {
    if (inEingabe(e.target) && e.target !== e.currentTarget && !(e.target as HTMLElement).matches('[role="option"]')) return;
    const aktuell = liste[fokusIndex];
    const geh = (n: number) => {
      const ziel = liste[Math.max(0, Math.min(liste.length - 1, n))];
      if (!ziel) return;
      e.preventDefault();
      r.waehle(ziel.id);
      elemente.current.get(ziel.id)?.focus();
    };
    switch (e.key) {
      case 'ArrowRight':
        if (raster) geh(fokusIndex + 1);
        break;
      case 'ArrowLeft':
        if (raster) geh(fokusIndex - 1);
        break;
      case 'ArrowDown':
        geh(gewaehltIndex < 0 ? 0 : fokusIndex + spalten());
        break;
      case 'ArrowUp':
        geh(fokusIndex - spalten());
        break;
      case 'Home':
        geh(0);
        break;
      case 'End':
        geh(liste.length - 1);
        break;
      case 'Enter':
        if (aktuell && !e.metaKey) {
          e.preventDefault();
          oeffneDialog('recherche-eintrag', { id: aktuell.id });
        } else if (aktuell?.art === 'link' && e.metaKey) {
          e.preventDefault();
          void linkOeffnen(aktuell.url);
        }
        break;
      case ' ':
        if (aktuell) {
          e.preventDefault();
          if (aktuell.art === 'bild') onLupe(aktuell.id);
          else oeffneDialog('recherche-eintrag', { id: aktuell.id });
        }
        break;
      case 'Backspace':
      case 'Delete':
        if (aktuell) {
          e.preventDefault();
          void eintragEntfernenFragen(aktuell);
        }
        break;
      case 'Escape':
        if (r.gewaehlt) {
          e.preventDefault();
          r.waehle(null);
        }
        break;
    }
  };

  const Element = raster ? Kachel : Zeile;
  return (
    <ul
      ref={container}
      role="listbox"
      aria-label={f(t.recherche.sammlung.label, { n: liste.length })}
      aria-orientation={raster ? undefined : 'vertical'}
      className={klassen('rc-sammlung', raster ? 'rc-sammlung--raster' : 'rc-sammlung--liste')}
      onKeyDown={taste}
    >
      {liste.map((e, i) => (
        <Element
          key={e.id}
          eintrag={e}
          gewaehlt={e.id === r.gewaehlt}
          fokussierbar={i === fokusIndex}
          onWaehlen={() => r.waehle(e.id)}
          onOeffnen={() => (e.art === 'bild' ? onLupe(e.id) : oeffneDialog('recherche-eintrag', { id: e.id }))}
          setzeRef={(el) => {
            if (el) elemente.current.set(e.id, el);
            else elemente.current.delete(e.id);
          }}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Inspektor
// ---------------------------------------------------------------------------

function Abschnitt({ titel, children, rechts }: { titel: string; children: ReactNode; rechts?: ReactNode }) {
  return (
    <section className="rc-insp__abschnitt">
      <div className="rc-insp__kopf">
        <h3 className="pw-label">{titel}</h3>
        {rechts}
      </div>
      {children}
    </section>
  );
}

function EintragInspektor({ eintrag, daten, onLupe }: { eintrag: RechercheEintrag; daten: ProjektDaten; onLupe(): void }) {
  const t = useTexte();
  const ti = t.recherche.inspektor;
  const r = useStore((s) => s.recherche);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const [heftenOffen, setHeftenOffen] = useState(false);
  const fehlend = fehlendeZiele(daten, eintrag);
  useEffect(() => setHeftenOffen(false), [eintrag.id]);

  return (
    <Inspektor label={ti.label} breite={330}>
      {eintrag.art === 'bild' && (
        <button type="button" className="rc-insp__bild" onClick={onLupe} title={ti.grossZeigen} aria-label={f(ti.grossZeigenLabel, { titel: eintrag.titel })}>
          <RechercheBild pfad={eintrag.datei} alt={eintrag.titel} einpassen="contain" />
        </button>
      )}
      <div className="rc-insp__titelblock">
        <span className="rc-insp__art">
          <ArtSymbol art={eintrag.art} size={12} /> {t.recherche.art[eintrag.art]} · {datumKurz(eintrag.erstellt)}
        </span>
        <h2 className="rc-insp__titel">{eintrag.titel}</h2>
      </div>

      {eintrag.art === 'link' && eintrag.url && (
        <div className="rc-insp__link">
          <span className="rc-insp__url" title={eintrag.url}>
            {eintrag.url}
          </span>
          <Button klein icon={<IconExtern size={13} />} onClick={() => void linkOeffnen(eintrag.url)} title={ti.browserTitel}>
            {t.recherche.imBrowserOeffnen}
          </Button>
        </div>
      )}

      {eintrag.text.trim() && (
        <Abschnitt titel={eintrag.art === 'notiz' ? t.recherche.notiz : t.recherche.beschreibung}>
          <div className="rc-insp__notiz">
            <VerweisText text={eintrag.text} />
          </div>
        </Abschnitt>
      )}

      <Abschnitt
        titel={t.recherche.geheftetAn}
        rechts={
          !heftenOffen && (
            <Button variante="text" klein onClick={() => setHeftenOffen(true)}>
              {ti.heften}
            </Button>
          )
        }
      >
        {eintrag.verweise.length === 0 && !heftenOffen && <p className="rc-insp__leer">{ti.nichtsGeheftet}</p>}
        {eintrag.verweise.length > 0 && (
          <div className="rc-ziele">
            {eintrag.verweise.map((v) => (
              <ZielChip key={verweisSchluessel(v)} verweis={v} onLoesen={() => void r.loesen(eintrag.id, v)} />
            ))}
          </div>
        )}
        {fehlend.length > 0 && <p className="rc-insp__leer">{f(ti.fehlend, { n: fehlend.length })}</p>}
        {heftenOffen && (
          <ZielWahl
            gewaehlt={eintrag.verweise}
            autoFocus
            onWaehlen={(v: Verweis) => void r.heften(eintrag.id, v)}
            onAbbrechen={() => setHeftenOffen(false)}
            placeholder={ti.heftenPlatzhalter}
          />
        )}
      </Abschnitt>

      {(eintrag.schlagworte?.length ?? 0) > 0 && (
        <Abschnitt titel={t.recherche.schlagworte}>
          <div className="rc-ziele">
            {eintrag.schlagworte!.map((s) => (
              <button key={s} type="button" className={klassen('rc-schlagwort', r.schlagwort === s && 'rc-schlagwort--aktiv')} onClick={() => r.setzeSchlagwort(r.schlagwort === s ? null : s)} title={ti.schlagwortFiltern}>
                {s}
              </button>
            ))}
          </div>
        </Abschnitt>
      )}

      {eintrag.art === 'bild' && eintrag.datei && (
        <Abschnitt titel={ti.datei}>
          <span className="rc-insp__datei">{eintrag.datei}</span>
        </Abschnitt>
      )}

      <div className="rc-insp__aktionen">
        <Button onClick={() => oeffneDialog('recherche-eintrag', { id: eintrag.id })} title={ti.bearbeitenTitel}>
          {t.gemeinsam.bearbeiten}
        </Button>
        <Button variante="leise" onClick={() => void eintragEntfernenFragen(eintrag)} title={ti.entfernenTitel}>
          {t.gemeinsam.entfernen}
        </Button>
      </div>
    </Inspektor>
  );
}

function UebersichtInspektor({ eintraege }: { eintraege: RechercheEintrag[] }) {
  const t = useTexte();
  const tu = t.recherche.uebersicht;
  return (
    <Inspektor label={t.recherche.titel} breite={330}>
      <div className="rc-insp__titelblock">
        <span className="pw-label">{tu.titel}</span>
        <p className="rc-insp__hilfe">{eintraege.length ? tu.hilfeMitEintraegen : tu.hilfeLeer}</p>
      </div>
      <Abschnitt titel={tu.ablegen}>
        <ul className="rc-insp__liste">
          <li>{tu.ablegenBilder}</li>
          <li>{tu.ablegenAdressen}</li>
          <li>{tu.ablegenVerweise}</li>
        </ul>
      </Abschnitt>
      <Abschnitt titel={tu.tastatur}>
        <dl className="rc-insp__tasten">
          <dt>⌘N</dt>
          <dd>{tu.neuerEintrag}</dd>
          <dt>⌘F</dt>
          <dd>{tu.suchen}</dd>
          <dt>← ↑ → ↓</dt>
          <dd>{tu.waehlen}</dd>
          <dt>↩</dt>
          <dd>{tu.bearbeiten}</dd>
          <dt>{tu.leertaste}</dt>
          <dd>{tu.bildGross}</dd>
          <dt>⌘↩</dt>
          <dd>{tu.linkOeffnen}</dd>
          <dt>⌫</dt>
          <dd>{tu.entfernen}</dd>
        </dl>
      </Abschnitt>
    </Inspektor>
  );
}

// ---------------------------------------------------------------------------
// Bild groß (Lupe)
// ---------------------------------------------------------------------------

function Lupe({ bilder, id, onWechsel, onSchliessen }: { bilder: RechercheEintrag[]; id: Id; onWechsel(id: Id): void; onSchliessen(): void }) {
  const t = useTexte();
  const tl = t.recherche.lupe;
  const i = Math.max(0, bilder.findIndex((b) => b.id === id));
  const bild = bilder[i];
  const geh = useCallback(
    (d: number) => {
      const n = bilder[(i + d + bilder.length) % bilder.length];
      if (n) onWechsel(n.id);
    },
    [bilder, i, onWechsel],
  );
  useEffect(() => {
    const t = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        geh(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        geh(-1);
      } else if (e.key === ' ' && !inEingabe(e.target)) {
        e.preventDefault();
        onSchliessen();
      }
    };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [geh, onSchliessen]);
  if (!bild) return null;
  return (
    <Dialog
      titel={bild.titel}
      onSchliessen={onSchliessen}
      breite={920}
      className="rc-lupe"
      aktionen={
        <>
          {bilder.length > 1 && (
            <span className="rc-lupe__zaehler">{f(tl.zaehler, { i: i + 1, n: bilder.length })}</span>
          )}
          {bilder.length > 1 && (
            <>
              <Button onClick={() => geh(-1)} aria-label={tl.vorheriges} title={tl.vorherigesTitel}>
                ‹
              </Button>
              <Button onClick={() => geh(1)} aria-label={tl.naechstes} title={tl.naechstesTitel}>
                ›
              </Button>
            </>
          )}
          <Button variante="primaer" onClick={onSchliessen} data-autofocus>
            {t.gemeinsam.schliessen}
          </Button>
        </>
      }
    >
      <RechercheBild pfad={bild.datei} alt={bild.titel} einpassen="contain" className="rc-lupe__bild" />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bereich
// ---------------------------------------------------------------------------

function FreieDateien({ daten }: { daten: ProjektDaten }) {
  const t = useTexte();
  const fs = useStore((s) => s.fs);
  const r = useStore((s) => s.recherche);
  const [frei, setFrei] = useState<string[]>([]);
  const ablage = daten.recherche;
  useEffect(() => {
    let aktiv = true;
    if (!fs || !ablage) {
      setFrei([]);
      return;
    }
    fs.auflisten(RECHERCHE_ORDNER).then(
      (dateien) => aktiv && setFrei(freieDateien(ablage, dateien)),
      () => aktiv && setFrei([]),
    );
    return () => {
      aktiv = false;
    };
  }, [fs, ablage]);
  if (!frei.length) return null;
  return (
    <div className="rc-freie" role="status">
      <IconBild size={14} />
      <span>
        {f(t.recherche.freieDateien.text, {
          n: frei.length,
          dateien: `${frei
            .map((p) => p.replace(/^.*\//, ''))
            .slice(0, 3)
            .join(', ')}${frei.length > 3 ? ' …' : ''}`,
        })}
      </span>
      <Button klein onClick={() => void r.dateienUebernehmen(frei)}>
        {t.recherche.freieDateien.uebernehmen}
      </Button>
    </div>
  );
}

function Leer({ onNeu }: { onNeu(art: RechercheArt): void }) {
  const t = useTexte();
  const tl = t.recherche.leer;
  return (
    <LeerZustand
      titel={tl.titel}
      aktionen={
        <>
          <Button icon={<IconBild size={14} />} onClick={() => onNeu('bild')}>
            {tl.bild}
          </Button>
          <Button icon={<IconLink size={14} />} onClick={() => onNeu('link')}>
            {tl.link}
          </Button>
          <Button icon={<IconNotiz size={14} />} onClick={() => onNeu('notiz')}>
            {tl.notiz}
          </Button>
        </>
      }
    >
      {tl.text}
    </LeerZustand>
  );
}

export default function Ansicht() {
  const t = useTexte();
  const ta = t.recherche.ansicht;
  const daten = useStore((s) => s.daten);
  const r = useStore((s) => s.recherche);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const sucheRef = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [lupe, setLupe] = useState<Id | null>(null);
  const [legtAb, setLegtAb] = useState(false);

  const eintraege = useMemo(() => daten?.recherche?.eintraege ?? [], [daten?.recherche]);
  const ziel = r.ziel ? schluesselAlsVerweis(r.ziel) : null;
  const liste = useMemo(
    () =>
      daten
        ? sortiereEintraege(filtereEintraege(daten, eintraege, { suche: r.suche, art: r.art, ziel: r.ziel ? schluesselAlsVerweis(r.ziel) : null, schlagwort: r.schlagwort }))
        : [],
    [daten, eintraege, r.suche, r.art, r.ziel, r.schlagwort],
  );
  const gewaehlt = eintraege.find((e) => e.id === r.gewaehlt);
  const bilder = liste.filter((e) => e.art === 'bild');

  const zielSchluessel = r.ziel;
  const neu = useCallback(
    (art?: RechercheArt) => oeffneDialog('recherche-eintrag', { art, verweis: zielSchluessel ? (schluesselAlsVerweis(zielSchluessel) ?? undefined) : undefined }),
    [oeffneDialog, zielSchluessel],
  );

  const uebergeben = useCallback(
    async (dt: DataTransfer | null) => {
      setLegtAb(true);
      try {
        const v = zielSchluessel ? schluesselAlsVerweis(zielSchluessel) : null;
        await ablegen(dt, v ? [v] : []);
      } finally {
        setLegtAb(false);
      }
    },
    [zielSchluessel],
  );

  // ⌘N, ⌘F und Einfügen, solange der Bereich sichtbar ist und kein Dialog offen ist
  useEffect(() => {
    const sucheFokussieren = () => { sucheRef.current?.focus(); sucheRef.current?.select(); };
    const taste = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || useStore.getState().dialog) return;
      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        neu();
      } else if (k === 'f') {
        e.preventDefault();
        sucheRef.current?.focus();
        sucheRef.current?.select();
      }
    };
    const einfuegen = (e: ClipboardEvent) => {
      if (useStore.getState().dialog || inEingabe(e.target) || inEingabe(document.activeElement)) return;
      const { dateien, links } = ausUebergabe(e.clipboardData);
      if (!dateien.length && !links.length) return;
      e.preventDefault();
      void uebergeben(e.clipboardData);
    };
    window.addEventListener('keydown', taste);
    window.addEventListener('plotwerk:recherche-suche', sucheFokussieren);
    window.addEventListener('paste', einfuegen);
    return () => {
      window.removeEventListener('keydown', taste);
      window.removeEventListener('plotwerk:recherche-suche', sucheFokussieren);
      window.removeEventListener('paste', einfuegen);
    };
  }, [neu, uebergeben]);

  if (!daten) return null;

  const hinweis = eintraege.length
    ? liste.length === eintraege.length
      ? artZaehler(t, eintraege)
      : f(ta.gefiltert, { anzahl: liste.length, n: eintraege.length })
    : ta.hinweisLeer;
  const zielName = ziel ? zielInfo(daten, ziel, sprache()).name : null;

  return (
    <Werkzeugseite
      titel={t.recherche.titel}
      hinweis={hinweis}
      hintergrund="canvas"
      inspektor={gewaehlt ? <EintragInspektor key={gewaehlt.id} eintrag={gewaehlt} daten={daten} onLupe={() => setLupe(gewaehlt.id)} /> : <UebersichtInspektor eintraege={eintraege} />}
    >
      <div
        className={klassen('rc-bereich', ziehen && 'rc-bereich--ziehen')}
        onDragOver={(e: DragEvent) => {
          if (!uebergabeMoeglich(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setZiehen(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setZiehen(false);
        }}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setZiehen(false);
          void uebergeben(e.dataTransfer);
        }}
      >
        {eintraege.length > 0 && <Filterleiste daten={daten} eintraege={eintraege} sucheRef={sucheRef} />}
        <FreieDateien daten={daten} />
        {eintraege.length === 0 ? (
          <Leer onNeu={neu} />
        ) : liste.length === 0 ? (
          <LeerZustand
            titel={t.recherche.nichtsGefunden}
            aktionen={
              <Button onClick={r.filterZuruecksetzen} data-autofocus>
                {t.recherche.filter.zuruecksetzen}
              </Button>
            }
          >
            {r.suche ? f(ta.keinTreffer, { suche: r.suche }) : ta.keinTrefferFilter}
          </LeerZustand>
        ) : (
          <div className="rc-scroll">
            <Sammlung liste={liste} onLupe={setLupe} />
          </div>
        )}
        {ziehen && (
          <div className="rc-bereich__ziehen" aria-hidden="true">
            <span>{zielName ? f(ta.loslassenZiel, { name: zielName }) : ta.loslassen}</span>
          </div>
        )}
        {legtAb && (
          <div className="rc-bereich__status" role="status">
            {ta.legtAb}
          </div>
        )}
      </div>
      {lupe && bilder.some((b) => b.id === lupe) && (
        <Lupe
          bilder={bilder}
          id={lupe}
          onWechsel={(id) => {
            setLupe(id);
            r.waehle(id);
          }}
          onSchliessen={() => setLupe(null)}
        />
      )}
    </Werkzeugseite>
  );
}

export function Titelaktionen() {
  const t = useTexte();
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const ziel = useStore((s) => s.recherche.ziel);
  return (
    <Button
      variante="primaer"
      onClick={() => oeffneDialog('recherche-eintrag', { verweis: ziel ? (schluesselAlsVerweis(ziel) ?? undefined) : undefined })}
      title={t.recherche.ansicht.neuerEintragTitel}
    >
      {t.recherche.ansicht.neuerEintrag}
    </Button>
  );
}

export function kontext(state: Store): string {
  const t = texte();
  const daten = state.daten;
  const id = state.recherche.gewaehlt;
  const e = id ? daten?.recherche?.eintraege.find((x) => x.id === id) : undefined;
  if (e) return f(t.recherche.kontext.eintrag, { titel: e.titel });
  const ziel = state.recherche.ziel ? schluesselAlsVerweis(state.recherche.ziel) : null;
  const name = ziel && daten ? zielInfo(daten, ziel, sprache()).name : null;
  return name ? f(t.recherche.kontext.ziel, { art: t.recherche.zielArt[zielInfo(daten!, ziel!).art], name }) : t.recherche.titel;
}
