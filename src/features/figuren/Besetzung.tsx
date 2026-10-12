/**
 * F-15 Besetzungsübersicht: Figuren × Kapitel. Zellen wie im Auftrittsstreifen der Figurenkarte (gefüllt: tritt
 * auf, umrandet: per Nachricht, gestrichelt: erwähnt, hell: im Text, schraffiert: nur im Kapitelplan), ruhende
 * Strecken gelb unterstrichen. Klick auf eine Zelle springt zur ersten Stelle, auf den Namen zur Figurenkarte.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { besetzung, ruhendeStrecken, type BesetzungsZeile } from '@core/figuren/index';
import type { Index } from '@core/index/index';
import type { FigurRolle, ProjektDaten } from '@core/model/types';
import { f as fmt, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { figurDarstellung, stelleAnker } from '../akte/gemeinsam';
import { kapKurz } from './texte';

const ZELLE = 26;

export function Besetzung({ daten, index }: { daten: ProjektDaten; index: Index }) {
  const markiere = useStore((s) => s.markiere);
  const waehle = useStore((s) => s.waehle);
  const setzeAnsicht = useStore((s) => s.figurenbogen.setzeFigurenAnsicht);
  const suche = useStore((s) => s.planung.figurenSuche).trim().toLocaleLowerCase('de');
  const [statistenOffen, setStatistenOffen] = useState(false);
  const t = useTexte();
  const T = t.figuren.besetzung;
  const b = useMemo(() => besetzung(daten, index.erwaehnungen), [daten, index]);
  const ruhend = useMemo(
    () => new Map(b.zeilen.map((z) => [z.figur.id, new Set(ruhendeStrecken(daten, index.erwaehnungen, z.figur).flatMap((s) => s.kapitel))])),
    [b, daten, index],
  );
  const passt = (z: BesetzungsZeile) => !suche || [z.figur.name, ...z.figur.aliase].some((n) => n.toLocaleLowerCase('de').includes(suche));
  const gruppen: { rolle: FigurRolle; titel: string }[] = [
    { rolle: 'haupt', titel: t.figuren.liste.haupt },
    { rolle: 'neben', titel: t.figuren.liste.neben },
    { rolle: 'statist', titel: fmt(t.figuren.liste.statisten, { n: b.zeilen.filter((z) => z.figur.rolle === 'statist').length }) },
  ];
  const spalten = `minmax(140px, 200px) repeat(${b.kapitel.length}, ${ZELLE}px) 48px`;

  const zelle = (z: BesetzungsZeile, i: number) => {
    const k = b.kapitel[i]!;
    const art = z.zellen[i];
    const farbe = figurDarstellung(z.figur, daten).farbe;
    const ohneText = !daten.kapitel[k]?.text.trim();
    const stil: CSSProperties = { height: ZELLE - 4, borderRadius: 4, background: 'var(--surface-muted)', border: 0, padding: 0 };
    if (art === 'auftritt') Object.assign(stil, { background: farbe });
    else if (art === 'nachricht') Object.assign(stil, { background: 'transparent', border: `2px solid ${farbe}` });
    else if (art === 'erwaehnt') Object.assign(stil, { background: 'transparent', border: `1.5px dashed ${farbe}` });
    else if (art === 'unbestimmt') stil.background = `color-mix(in srgb, ${farbe} 22%, var(--surface))`;
    else if (art === 'plan') stil.background = `repeating-linear-gradient(135deg, color-mix(in srgb, ${farbe} 35%, transparent) 0 3px, transparent 3px 6px)`;
    else if (ohneText) stil.background = 'repeating-linear-gradient(135deg, var(--schraffur) 0 4px, var(--surface) 4px 8px)';
    if (ruhend.get(z.figur.id)?.has(k)) stil.boxShadow = 'inset 0 -3px 0 var(--ampel-gelb)';
    const titel = `${z.figur.name} · ${kapKurz(i + 1)} ${daten.plaene[k]?.titel ?? daten.kapitel[k]?.titel ?? ''} · ${
      art === 'plan' ? T.nurPlan : art ? t.figuren.art[art] : ohneText ? t.figuren.karte.auftritte.keinText : '–'
    }`;
    const e = z.erste[i];
    return e ? (
      <button
        key={k}
        type="button"
        className="pl-zelle"
        style={{ ...stil, cursor: 'pointer' }}
        title={titel}
        aria-label={titel}
        onClick={() => markiere({ kapitel: k, anker: stelleAnker(daten, k, e.start, e.ende, e.treffer) })}
      />
    ) : (
      <span key={k} style={stil} title={titel} aria-label={titel} role="img" />
    );
  };

  const zeile = (z: BesetzungsZeile) => (
    <div key={z.figur.id} role="row" style={{ display: 'grid', gridTemplateColumns: spalten, gap: 2, alignItems: 'center' }}>
      <button
        type="button"
        role="rowheader"
        className="pl-link"
        style={{ textAlign: 'left', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}
        title={T.karteOeffnen}
        onClick={() => {
          waehle({ figur: z.figur.id });
          setzeAnsicht('karte');
        }}
      >
        {z.figur.name}
      </button>
      {z.zellen.map((_, i) => zelle(z, i))}
      <span style={{ fontSize: 12, color: 'var(--ink-quiet)', textAlign: 'right' }}>{z.anzahl}</span>
    </div>
  );

  return (
    <section aria-label={T.titel} style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 26 }}>{T.titel}</h2>
      <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{T.legende}</span>
      <div role="table" aria-label={T.titel} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: spalten, gap: 2, fontSize: 11, color: 'var(--ink-quiet)' }}>
          <span role="columnheader" />
          {b.kapitel.map((k, i) => (
            <span key={k} role="columnheader" style={{ textAlign: 'center' }} title={daten.plaene[k]?.titel ?? daten.kapitel[k]?.titel}>
              {i + 1}
            </span>
          ))}
          <span role="columnheader" style={{ textAlign: 'right' }}>
            {T.kap}
          </span>
        </div>
        {gruppen.map(({ rolle, titel }) => {
          const liste = b.zeilen.filter((z) => z.figur.rolle === rolle && passt(z));
          if (!liste.length) return null;
          const statist = rolle === 'statist';
          const offen = !statist || statistenOffen || !!suche;
          return (
            <div key={rolle} role="rowgroup" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {statist ? (
                <button
                  type="button"
                  aria-expanded={offen}
                  onClick={() => setStatistenOffen(!offen)}
                  style={{ border: 0, background: 'none', padding: '10px 0 4px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-quiet)', cursor: 'pointer' }}
                >
                  {offen ? '▾ ' : '▸ '}
                  {titel}
                </button>
              ) : (
                <span style={{ padding: '10px 0 4px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-quiet)' }}>{titel}</span>
              )}
              {offen && liste.map(zeile)}
            </div>
          );
        })}
        <div role="row" style={{ display: 'grid', gridTemplateColumns: spalten, gap: 2, fontSize: 11, color: 'var(--ink-quiet)', marginTop: 6, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
          <span role="rowheader">{T.jeKapitel}</span>
          {b.summen.map((n, i) => (
            <span key={b.kapitel[i]} style={{ textAlign: 'center', fontWeight: n ? 600 : 400 }}>
              {n || '–'}
            </span>
          ))}
          <span />
        </div>
      </div>
    </section>
  );
}
