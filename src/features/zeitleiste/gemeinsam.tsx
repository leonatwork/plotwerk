/** Gemeinsame Bausteine der Zeitleiste (G1): Sicherheits-Punkt, Zitate, Vorschlagskarten, abgeleitete Daten. */
import { useMemo, useState, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { Hinweis, Id, ProjektDaten, Tageszeit, Wochentag, ZeitSicherheit, Zeitpunkt, ZeitVorschlag, Zitat, ZustandVorschlag } from '@core/model/types';
import {
  beginnVon,
  belegAusZitat,
  eigenerZeitpunkt,
  einheitenAusZeitHinweis,
  einheitSchluessel,
  effektiverTag,
  erwarteterWochentag,
  formatiereUhrzeit,
  gueltigesDatum,
  hauptfigur,
  offeneZeitVorschlaege,
  offeneZustandVorschlaege,
  ordneZeitleiste,
  parseUhrzeit,
  SICHERHEIT_FARBE,
  WOCHENTAG_KURZ,
  WOCHENTAG_NAME,
  WOCHENTAGE,
  zeitEinheiten,
  zeitleisteVon,
  zustandIn,
  zustandsFarbe,
  type Beginn,
  type RelativeAngabe,
  type ZeitEinheit,
  type ZeitSpalte,
} from '@core/zeit/index';
import { datum, f, locale, sprache, texte, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import { klassen } from '../../ui/klassen';

// ---------------------------------------------------------------------------
// Beschriftungen in der Oberflächensprache (core/zeit beschriftet deutsch)
// ---------------------------------------------------------------------------

/** Wochentag ausgeschrieben bzw. kurz; Deutsch wie in core, sonst über Intl. */
export function wochentagName(w: Wochentag, kurz = false): string {
  if (sprache() === 'de') return kurz ? WOCHENTAG_KURZ[w] : WOCHENTAG_NAME[w];
  // 1. Januar 2024 war ein Montag
  return new Date(2024, 0, 1 + WOCHENTAGE.indexOf(w)).toLocaleDateString(locale(), { weekday: kurz ? 'short' : 'long' });
}

export function tageszeitName(t: Tageszeit): string {
  return texte().zeitleiste.tageszeit[t];
}

export function sicherheitName(s: ZeitSicherheit): string {
  return texte().zeitleiste.sicherheit[s];
}

export function sicherheitErklaerung(s: ZeitSicherheit): string {
  return texte().zeitleiste.sicherheitErklaerung[s];
}

const RELATIV_SCHLUESSEL = {
  'gleicher-tag': 'gleicherTag',
  'naechster-morgen': 'naechsterMorgen',
  'naechster-abend': 'naechsterAbend',
  'naechster-tag': 'naechsterTag',
  spaeter: 'spaeter',
} as const satisfies Record<RelativeAngabe, string>;

export function relativName(art: RelativeAngabe): string {
  return texte().zeitleiste.relativ[RELATIV_SCHLUESSEL[art]];
}

/** „12.03.2026“ / „03/12/2026“ */
export function datumKurz(iso: string): string {
  return gueltigesDatum(iso) ? datum(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) : iso;
}

/** „Tag 8 · Mo · nachts · 23:00“ – leere Angaben fallen weg (wie zeitText in core, aber übersetzt). */
export function zeitBeschriftung(z: Zeitpunkt | undefined, beginn: Beginn = {}, optionen: { kurz?: boolean } = {}): string {
  const t = texte().zeitleiste;
  if (!z) return t.zeit.offen;
  const teile: string[] = [];
  const tag = effektiverTag(z, beginn);
  if (tag) teile.push(f(t.zeit.tag, { tag: tag.tag }));
  const w = z.wochentag ?? erwarteterWochentag(z, beginn);
  if (w) teile.push(wochentagName(w, optionen.kurz));
  if (z.datum && !optionen.kurz) teile.push(datumKurz(z.datum));
  if (z.tageszeit) teile.push(tageszeitName(z.tageszeit));
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) teile.push(formatiereUhrzeit(u));
  else if (z.uhrzeit) teile.push(z.uhrzeit);
  return teile.length ? teile.join(' · ') : t.zeit.offen;
}

/** Tageszeit/Uhrzeit als kurze Beschriftung über einer Karte */
export function tageszeitBeschriftung(z: Zeitpunkt | undefined): string {
  if (!z) return '';
  const name = z.tageszeit ? tageszeitName(z.tageszeit) : '';
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) return name ? `${name} · ${formatiereUhrzeit(u)}` : formatiereUhrzeit(u);
  return name;
}

/** „Kap. 7 · Szene 2“ */
export function einheitNummerText(e: Pick<ZeitEinheit, 'nr' | 'szenenNr'>): string {
  const t = texte().zeitleiste.einheit;
  return e.szenenNr ? f(t.nummerSzene, { nr: e.nr, szene: e.szenenNr }) : f(t.nummer, { nr: e.nr });
}

/** „Kap. 7 „Ebbe“, Szene 2 „Kai bei Nacht““ */
export function einheitNameText(e: ZeitEinheit): string {
  const t = texte().zeitleiste.einheit;
  return e.szene ? f(t.nameSzene, { nr: e.nr, kapitel: e.kapitelTitel, szene: e.szenenNr, titel: e.titel }) : f(t.name, { nr: e.nr, titel: e.kapitelTitel });
}

/** Fehler aus belegAusZitat (core, deutsch) in der Oberflächensprache. */
export function belegFehlerText(daten: ProjektDaten, kapitel: Id, fehler: string): string {
  if (sprache() === 'de') return fehler;
  const t = texte().zeitleiste.beleg;
  const nr = kapitelNr(daten, kapitel);
  const name = nr > 0 ? f(texte().gemeinsam.kapitelKurz, { nr }) : kapitel;
  if (!daten.kapitel[kapitel]?.text.trim()) return f(t.keinText, { name });
  if (fehler.includes('zu kurz')) return t.zuKurz;
  return f(t.nichtGefunden, { name });
}

/** Wörtliches Zitat in typografischen Anführungszeichen der Oberflächensprache */
export function zitiert(text: string): string {
  return sprache() === 'de' ? `„${text}“` : `“${text}”`;
}

export const farbe = (token: string): CSSProperties => ({ ['--zl-farbe' as string]: token.startsWith('var(') ? token : `var(--${token})` });

export function SicherheitPunkt({ sicherheit, titel }: { sicherheit: ZeitSicherheit; titel?: string }) {
  useTexte();
  return (
    <span
      className={klassen('zl-punkt', `zl-punkt--${sicherheit}`)}
      style={farbe(SICHERHEIT_FARBE[sicherheit])}
      title={titel ?? `${sicherheitName(sicherheit)} – ${sicherheitErklaerung(sicherheit)}`}
      aria-hidden="true"
    />
  );
}

export function kapitelNr(daten: ProjektDaten, id: Id): number {
  return daten.projekt.kapitel.indexOf(id) + 1;
}

/** „Kap. 7 · Szene 2“ zu Kapitel/Szene (Szenennummer aus dem Plan) */
export function einheitBeschriftung(daten: ProjektDaten, kapitel: Id, szene?: Id): string {
  const t = texte();
  const nr = kapitelNr(daten, kapitel);
  const basis = nr > 0 ? f(t.gemeinsam.kapitelKurz, { nr }) : kapitel;
  if (!szene) return basis;
  const s = daten.plaene[kapitel]?.szenen?.find((x) => x.id === szene);
  return s ? f(t.zeitleiste.einheit.mitSzene, { basis, szene: s.index + 1 }) : `${basis} · ${szene}`;
}

/** Wörtliches Zitat; Klick springt zur Stelle im Text. */
export function ZitatKnopf({ zitat, daten, farbeToken }: { zitat: Zitat; daten: ProjektDaten; farbeToken?: string }) {
  const t = useTexte();
  const markiere = useStore((s) => s.markiere);
  const r = belegAusZitat(daten, zitat.kapitel, zitat.text);
  const nr = kapitelNr(daten, zitat.kapitel);
  const inhalt = (
    <>
      {zitiert(zitat.text)}
      <span className="zl-zitat__ort">{f(t.gemeinsam.kapitelKurz, { nr: nr > 0 ? nr : zitat.kapitel })}</span>
    </>
  );
  if (!('anker' in r)) return <blockquote className="zl-zitat">{inhalt}</blockquote>;
  return (
    <button
      type="button"
      className="zl-zitat zl-zitat--knopf"
      style={farbeToken ? farbe(farbeToken) : undefined}
      title={t.zeitleiste.vorschlag.imTextZeigen}
      onClick={() => markiere({ kapitel: zitat.kapitel, anker: r.anker })}
    >
      {inhalt}
    </button>
  );
}

function Aktionen({ uebernehmen, verwerfen, name }: { uebernehmen(): Promise<void>; verwerfen(): Promise<void>; name: string }) {
  const t = useTexte().zeitleiste.vorschlag;
  const [laeuft, setLaeuft] = useState(false);
  const tu = (aktion: () => Promise<void>) => async () => {
    setLaeuft(true);
    try {
      await aktion();
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="zl-vorschlag__aktionen">
      <Button variante="primaer" klein disabled={laeuft} onClick={tu(uebernehmen)} aria-label={f(t.uebernehmenLabel, { name })}>
        {t.uebernehmen}
      </Button>
      <Button klein disabled={laeuft} onClick={tu(verwerfen)} aria-label={f(t.verwerfenLabel, { name })}>
        {t.verwerfen}
      </Button>
    </div>
  );
}

/** Vorschlag der KI für einen Zeitpunkt – Übernehmen/Verwerfen, nie automatisch. */
export function ZeitVorschlagKarte({ v, daten, mitEinheit = true }: { v: ZeitVorschlag; daten: ProjektDaten; mitEinheit?: boolean }) {
  const uebernehmen = useStore((s) => s.zeit.zeitVorschlagUebernehmen);
  const verwerfen = useStore((s) => s.zeit.zeitVorschlagVerwerfen);
  const t = useTexte().zeitleiste.vorschlag;
  const beginn = beginnVon(daten.zeitleiste);
  const bisher = eigenerZeitpunkt(daten, v.kapitel, v.szene);
  const name = einheitBeschriftung(daten, v.kapitel, v.szene);
  return (
    <article className="zl-vorschlag" aria-label={f(t.zeitLabel, { name })}>
      <div className="zl-vorschlag__kopf">
        <span>{mitEinheit ? f(t.kopf, { name: name.toUpperCase() }) : t.derKi}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 400, letterSpacing: 0, color: 'var(--ink-quiet)' }}>
          <SicherheitPunkt sicherheit={v.zeit.sicherheit} />
          {sicherheitName(v.zeit.sicherheit)}
        </span>
      </div>
      <span className="zl-vorschlag__wert">{zeitBeschriftung(v.zeit, beginn)}</span>
      {bisher && <span className="zl-vorschlag__bisher">{f(t.bisher, { wert: zeitBeschriftung(bisher, beginn) })}</span>}
      {v.belege.map((z, i) => (
        <ZitatKnopf key={i} zitat={z} daten={daten} farbeToken="accent-line" />
      ))}
      <p className="zl-text">{v.begruendung}</p>
      <Aktionen name={name} uebernehmen={() => uebernehmen(v.schluessel)} verwerfen={() => verwerfen(v.schluessel)} />
    </article>
  );
}

/** Vorschlag der KI für einen Figurenzustand. */
export function ZustandVorschlagKarte({ v, daten, mitEinheit = true }: { v: ZustandVorschlag; daten: ProjektDaten; mitEinheit?: boolean }) {
  const uebernehmen = useStore((s) => s.zeit.zustandVorschlagUebernehmen);
  const verwerfen = useStore((s) => s.zeit.zustandVorschlagVerwerfen);
  const t = useTexte().zeitleiste.vorschlag;
  const zl = zeitleisteVon(daten);
  const art = zl.zustandsarten.find((a) => a.id === v.zustand);
  const bisher = zustandIn(zl, v.figur, v.kapitel, v.szene);
  const figur = daten.figuren[v.figur]?.name ?? v.figur;
  const name = einheitBeschriftung(daten, v.kapitel, v.szene);
  return (
    <article className="zl-vorschlag" aria-label={f(t.zustandLabel, { figur, name })}>
      <div className="zl-vorschlag__kopf">
        <span>{mitEinheit ? `${name.toUpperCase()} · ${figur.toUpperCase()}` : t.derKi}</span>
      </div>
      <span className="zl-vorschlag__wert" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="zl-zustand__punkt" style={farbe(zustandsFarbe(art))} aria-hidden="true" />
        {art?.name ?? v.zustand}
      </span>
      {bisher && (
        <span className="zl-vorschlag__bisher">{f(bisher.geerbt ? t.bisherVomKapitel : t.bisher, { wert: bisher.art?.name ?? bisher.zustand.zustand })}</span>
      )}
      {v.belege.map((z, i) => (
        <ZitatKnopf key={i} zitat={z} daten={daten} farbeToken={zustandsFarbe(art)} />
      ))}
      <p className="zl-text">{v.begruendung}</p>
      <Aktionen name={`${figur} ${name}`} uebernehmen={() => uebernehmen(v.schluessel)} verwerfen={() => verwerfen(v.schluessel)} />
    </article>
  );
}

export interface ZeitDaten {
  beginn: Beginn;
  einheiten: ZeitEinheit[];
  spalten: ZeitSpalte[];
  /** Einheiten in Anzeigereihenfolge (Tastatur) */
  folge: ZeitEinheit[];
  /** offene Zeit-Hinweise je Einheiten-Schlüssel */
  hinweise: Map<string, Hinweis[]>;
  zeitVorschlaege: ZeitVorschlag[];
  zustandVorschlaege: ZustandVorschlag[];
  /** Figur der Zustandsspur (gewählt oder Hauptfigur) */
  figur?: Id;
}

/** Zeit-Hinweise (aus dem Index, also mit Leons Entscheidungen) je Einheit; Kapitel-Hinweise auch an ihren Szenen. */
export function hinweiseJeEinheit(index: Index, einheiten: ZeitEinheit[]): Map<string, Hinweis[]> {
  const m = new Map<string, Hinweis[]>();
  const dazu = (k: string, h: Hinweis) => {
    const l = m.get(k) ?? [];
    if (!l.includes(h)) l.push(h);
    m.set(k, l);
  };
  for (const h of index.hinweise) {
    if (h.typ !== 'zeitleiste' || h.status !== 'neu') continue;
    for (const s of einheitenAusZeitHinweis(h.schluessel)) {
      dazu(s, h);
      if (s.includes('#')) {
        // Szenen-Hinweis auch an der Kapitelkarte (Ansicht ohne Szenen)
        dazu(s.slice(0, s.indexOf('#')), h);
      } else {
        // Kapitel-Hinweis auch an seinen Szenen
        for (const e of einheiten) if (e.kapitel === s && e.szene) dazu(e.schluessel, h);
      }
    }
  }
  return m;
}

export function useZeitDaten(): ZeitDaten | null {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const szenen = useStore((s) => s.zeit.szenen);
  const gewaehlteFigur = useStore((s) => s.zeit.figur);
  return useMemo(() => {
    if (!daten) return null;
    const beginn = beginnVon(daten.zeitleiste);
    const einheiten = zeitEinheiten(daten, { szenen });
    const spalten = ordneZeitleiste(einheiten, beginn);
    const figur = gewaehlteFigur && daten.figuren[gewaehlteFigur] ? gewaehlteFigur : hauptfigur(daten);
    return {
      beginn,
      einheiten,
      spalten,
      folge: spalten.flatMap((s) => s.einheiten),
      hinweise: hinweiseJeEinheit(index, einheiten),
      zeitVorschlaege: offeneZeitVorschlaege(daten),
      zustandVorschlaege: offeneZustandVorschlaege(daten),
      ...(figur ? { figur } : {}),
    };
  }, [daten, index, szenen, gewaehlteFigur]);
}

/**
 * Vorschläge, die zu einer Einheit gehören: an einer Kapitelkarte alle des Kapitels (auch die seiner Szenen),
 * an einer Szene die der Szene und die fürs ganze Kapitel.
 */
export function vorschlaegeFuer<T extends { kapitel: Id; szene?: Id }>(liste: T[], e: Pick<ZeitEinheit, 'kapitel' | 'szene'>): T[] {
  return liste.filter((v) => v.kapitel === e.kapitel && (!e.szene || !v.szene || v.szene === e.szene));
}

export { einheitSchluessel };
