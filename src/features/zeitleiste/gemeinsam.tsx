/** Gemeinsame Bausteine der Zeitleiste (G1): Sicherheits-Punkt, Zitate, Vorschlagskarten, abgeleitete Daten. */
import { useMemo, useState, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { Hinweis, Id, ProjektDaten, ZeitSicherheit, ZeitVorschlag, Zitat, ZustandVorschlag } from '@core/model/types';
import {
  beginnVon,
  belegAusZitat,
  eigenerZeitpunkt,
  einheitenAusZeitHinweis,
  einheitSchluessel,
  hauptfigur,
  offeneZeitVorschlaege,
  offeneZustandVorschlaege,
  ordneZeitleiste,
  SICHERHEIT_ERKLAERUNG,
  SICHERHEIT_FARBE,
  SICHERHEIT_NAME,
  zeitEinheiten,
  zeitleisteVon,
  zeitText,
  zustandIn,
  zustandsFarbe,
  type Beginn,
  type ZeitEinheit,
  type ZeitSpalte,
} from '@core/zeit/index';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import { klassen } from '../../ui/klassen';

export const farbe = (token: string): CSSProperties => ({ ['--zl-farbe' as string]: token.startsWith('var(') ? token : `var(--${token})` });

export function SicherheitPunkt({ sicherheit, titel }: { sicherheit: ZeitSicherheit; titel?: string }) {
  return (
    <span
      className={klassen('zl-punkt', `zl-punkt--${sicherheit}`)}
      style={farbe(SICHERHEIT_FARBE[sicherheit])}
      title={titel ?? `${SICHERHEIT_NAME[sicherheit]} – ${SICHERHEIT_ERKLAERUNG[sicherheit]}`}
      aria-hidden="true"
    />
  );
}

export function kapitelNr(daten: ProjektDaten, id: Id): number {
  return daten.projekt.kapitel.indexOf(id) + 1;
}

/** „Kap. 7 · Szene 2“ zu Kapitel/Szene (Szenennummer aus dem Plan) */
export function einheitBeschriftung(daten: ProjektDaten, kapitel: Id, szene?: Id): string {
  const nr = kapitelNr(daten, kapitel);
  const basis = nr > 0 ? `Kap. ${nr}` : kapitel;
  if (!szene) return basis;
  const s = daten.plaene[kapitel]?.szenen?.find((x) => x.id === szene);
  return s ? `${basis} · Szene ${s.index + 1}` : `${basis} · ${szene}`;
}

/** Wörtliches Zitat; Klick springt zur Stelle im Text. */
export function ZitatKnopf({ zitat, daten, farbeToken }: { zitat: Zitat; daten: ProjektDaten; farbeToken?: string }) {
  const markiere = useStore((s) => s.markiere);
  const r = belegAusZitat(daten, zitat.kapitel, zitat.text);
  const nr = kapitelNr(daten, zitat.kapitel);
  const inhalt = (
    <>
      „{zitat.text}“<span className="zl-zitat__ort">Kap. {nr > 0 ? nr : zitat.kapitel}</span>
    </>
  );
  if (!('anker' in r)) return <blockquote className="zl-zitat">{inhalt}</blockquote>;
  return (
    <button
      type="button"
      className="zl-zitat zl-zitat--knopf"
      style={farbeToken ? farbe(farbeToken) : undefined}
      title="Im Text zeigen"
      onClick={() => markiere({ kapitel: zitat.kapitel, anker: r.anker })}
    >
      {inhalt}
    </button>
  );
}

function Aktionen({ uebernehmen, verwerfen, name }: { uebernehmen(): Promise<void>; verwerfen(): Promise<void>; name: string }) {
  const [laeuft, setLaeuft] = useState(false);
  const tu = (f: () => Promise<void>) => async () => {
    setLaeuft(true);
    try {
      await f();
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="zl-vorschlag__aktionen">
      <Button variante="primaer" klein disabled={laeuft} onClick={tu(uebernehmen)} aria-label={`${name} übernehmen`}>
        Übernehmen
      </Button>
      <Button klein disabled={laeuft} onClick={tu(verwerfen)} aria-label={`${name} verwerfen`}>
        Verwerfen
      </Button>
    </div>
  );
}

/** Vorschlag der KI für einen Zeitpunkt – Übernehmen/Verwerfen, nie automatisch. */
export function ZeitVorschlagKarte({ v, daten, mitEinheit = true }: { v: ZeitVorschlag; daten: ProjektDaten; mitEinheit?: boolean }) {
  const uebernehmen = useStore((s) => s.zeit.zeitVorschlagUebernehmen);
  const verwerfen = useStore((s) => s.zeit.zeitVorschlagVerwerfen);
  const beginn = beginnVon(daten.zeitleiste);
  const bisher = eigenerZeitpunkt(daten, v.kapitel, v.szene);
  const name = einheitBeschriftung(daten, v.kapitel, v.szene);
  return (
    <article className="zl-vorschlag" aria-label={`Vorschlag Zeitpunkt ${name}`}>
      <div className="zl-vorschlag__kopf">
        <span>{mitEinheit ? `${name.toUpperCase()} · VORSCHLAG` : 'VORSCHLAG DER KI'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 400, letterSpacing: 0, color: 'var(--ink-quiet)' }}>
          <SicherheitPunkt sicherheit={v.zeit.sicherheit} />
          {SICHERHEIT_NAME[v.zeit.sicherheit]}
        </span>
      </div>
      <span className="zl-vorschlag__wert">{zeitText(v.zeit, beginn)}</span>
      {bisher && <span className="zl-vorschlag__bisher">Bisher: {zeitText(bisher, beginn)}</span>}
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
  const zl = zeitleisteVon(daten);
  const art = zl.zustandsarten.find((a) => a.id === v.zustand);
  const bisher = zustandIn(zl, v.figur, v.kapitel, v.szene);
  const figur = daten.figuren[v.figur]?.name ?? v.figur;
  const name = einheitBeschriftung(daten, v.kapitel, v.szene);
  return (
    <article className="zl-vorschlag" aria-label={`Vorschlag Zustand ${figur} ${name}`}>
      <div className="zl-vorschlag__kopf">
        <span>{mitEinheit ? `${name.toUpperCase()} · ${figur.toUpperCase()}` : 'VORSCHLAG DER KI'}</span>
      </div>
      <span className="zl-vorschlag__wert" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="zl-zustand__punkt" style={farbe(zustandsFarbe(art))} aria-hidden="true" />
        {art?.name ?? v.zustand}
      </span>
      {bisher && (
        <span className="zl-vorschlag__bisher">
          Bisher: {bisher.art?.name ?? bisher.zustand.zustand}
          {bisher.geerbt ? ' (vom Kapitel)' : ''}
        </span>
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
