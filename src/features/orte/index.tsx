/** Bereich „Orte“ (O-01–O-03). Kein eigener Mac-Screen: Liste + Karte im Stil der Figurenkarte. Besitzer: Planung. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Index } from '@core/index/index';
import type { ProjektDaten } from '@core/model/types';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, Zaehler } from '../../ui';
import { kapitelDesOrts, ortBaum } from './logik';
import { OrtKarte, OrtSymbol } from './OrtKarte';
import { genitiv, SchreibweisenAnsicht, WegAnsicht, wegFigurVon } from './Uebersichten';

const kopf: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-quiet)' };

function IconWeg() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" />
    </svg>
  );
}

function IconAa() {
  return (
    <span aria-hidden="true" style={{ fontFamily: 'var(--schrift-titel)', fontSize: 14, lineHeight: 1 }}>
      Aa
    </span>
  );
}

function Rund({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{ flex: '0 0 28px', height: 28, borderRadius: '50%', background: 'var(--chip)', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </span>
  );
}

function OrteListe({ daten, index }: { daten: ProjektDaten; index: Index }) {
  const gewaehlt = useStore((s) => s.auswahl.ort);
  const ansicht = useStore((s) => s.planung.orteAnsicht);
  const setzeAnsicht = useStore((s) => s.planung.setzeOrteAnsicht);
  const wegFigur = useStore((s) => s.planung.wegFigur);
  const suche = useStore((s) => s.planung.orteSuche).trim().toLocaleLowerCase('de');
  const anlegen = useStore((s) => s.planung.ortAnlegen);
  const waehle = useStore((s) => s.waehle);
  const [neu, setNeu] = useState<string | null>(null);
  const baum = ortBaum(daten.orte).filter(({ ort }) => !suche || [ort.name, ...ort.aliase].some((n) => n.toLocaleLowerCase('de').includes(suche)));
  const offeneSchreibweisen = index.hinweise.filter((h) => h.typ === 'schreibweise' && h.status === 'neu').length;
  const wegName = wegFigurVon(daten, wegFigur)?.name ?? 'Figur';

  return (
    <nav aria-label="Orte" style={{ flex: '0 0 250px', borderRight: '1px solid var(--line-soft)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
      <span style={{ ...kopf, padding: '4px 10px' }}>ÜBERBLICK</span>
      <button type="button" className="pl-listeneintrag" aria-current={ansicht === 'weg' ? 'true' : undefined} onClick={() => setzeAnsicht('weg')}>
        <Rund>
          <IconWeg />
        </Rund>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{genitiv(wegName)} Weg</span>
          <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>Ortsfolge über alle Kapitel</span>
        </span>
      </button>
      <button type="button" className="pl-listeneintrag" aria-current={ansicht === 'schreibweisen' ? 'true' : undefined} onClick={() => setzeAnsicht('schreibweisen')}>
        <Rund>
          <IconAa />
        </Rund>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Schreibweisen</span>
          <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>zusammenführen, gültige festlegen</span>
        </span>
        {offeneSchreibweisen > 0 && <Zaehler wert={offeneSchreibweisen} label="offen" />}
      </button>
      <span style={{ ...kopf, padding: '12px 10px 4px' }}>ORTE</span>
      {baum.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-quiet)', padding: '0 10px 6px' }}>{suche ? 'Kein Ort gefunden.' : 'Noch keine Orte angelegt.'}</span>}
      {baum.map(({ ort, tiefe }) => {
        const n = kapitelDesOrts(ort.id, daten, index).length;
        return (
          <button
            key={ort.id}
            type="button"
            className="pl-listeneintrag"
            aria-current={ansicht === 'ort' && gewaehlt === ort.id ? 'true' : undefined}
            style={{ paddingLeft: 10 + Math.min(tiefe, 4) * 18 }}
            onClick={() => {
              setzeAnsicht('ort');
              waehle({ ort: ort.id });
            }}
          >
            <OrtSymbol />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ort.name}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>{n === 0 ? 'noch nicht im Text' : `${n} Kap.`}</span>
            </span>
          </button>
        );
      })}
      <span style={{ height: 8, flexShrink: 0 }} />
      {neu === null ? (
        <button type="button" className="pl-vorab" onClick={() => setNeu('')}>
          + Ort anlegen
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (neu.trim()) void anlegen(neu.trim());
            setNeu(null);
          }}
        >
          <input
            autoFocus
            className="pl-eingabe"
            style={{ width: '100%', height: 40, borderRadius: 8 }}
            placeholder="Name des Orts, Enter"
            aria-label="Name des neuen Orts"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            onBlur={() => !neu.trim() && setNeu(null)}
            onKeyDown={(e) => e.key === 'Escape' && setNeu(null)}
          />
        </form>
      )}
    </nav>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gewaehlt = useStore((s) => s.auswahl.ort);
  const ansicht = useStore((s) => s.planung.orteAnsicht);
  const waehle = useStore((s) => s.waehle);
  const id = gewaehlt && daten?.orte[gewaehlt] ? gewaehlt : daten ? ortBaum(daten.orte)[0]?.ort.id : undefined;
  useEffect(() => {
    if (id && id !== gewaehlt) waehle({ ort: id });
  }, [id, gewaehlt, waehle]);
  if (!daten) return null;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', background: 'var(--surface)' }}>
      <OrteListe daten={daten} index={index} />
      {ansicht === 'weg' ? (
        <WegAnsicht daten={daten} index={index} />
      ) : ansicht === 'schreibweisen' ? (
        <SchreibweisenAnsicht daten={daten} index={index} />
      ) : id ? (
        <OrtKarte key={id} id={id} daten={daten} index={index} />
      ) : (
        <div className="pw-leer">
          <h2 className="pw-leer__titel">Noch keine Orte</h2>
          <div className="pw-leer__text">Lege links einen Ort an, auch bevor er im Text vorkommt.</div>
        </div>
      )}
    </div>
  );
}

export function Titelaktionen() {
  const suche = useStore((s) => s.planung.orteSuche);
  const setzeSuche = useStore((s) => s.planung.setzeOrteSuche);
  const anlegen = useStore((s) => s.planung.ortAnlegen);
  const [neu, setNeu] = useState<string | null>(null);
  const feld: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    height: 30,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--ink)',
  };
  return (
    <>
      <label htmlFor="orte-suche" className="pw-sr">
        Suchen
      </label>
      <input id="orte-suche" type="search" placeholder="Suchen" value={suche} onChange={(e) => setzeSuche(e.target.value)} style={{ ...feld, width: 200 }} />
      {neu === null ? (
        <Button variante="primaer" onClick={() => setNeu('')}>
          + Neuer Ort
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (neu.trim()) void anlegen(neu.trim());
            setNeu(null);
          }}
        >
          <input
            autoFocus
            aria-label="Name des neuen Orts"
            placeholder="Name, Enter"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            onBlur={() => !neu.trim() && setNeu(null)}
            onKeyDown={(e) => e.key === 'Escape' && setNeu(null)}
            style={{ ...feld, width: 160, borderColor: 'var(--ink)' }}
          />
        </form>
      )}
    </>
  );
}

export function kontext(state: Store): string {
  const a = state.planung.orteAnsicht;
  if (a === 'weg') return `Orte · ${genitiv((state.daten && wegFigurVon(state.daten, state.planung.wegFigur)?.name) ?? 'Figur')} Weg`;
  if (a === 'schreibweisen') return 'Orte · Schreibweisen';
  const id = state.auswahl.ort;
  const name = id ? state.daten?.orte[id]?.name : undefined;
  return name ? `Orte · ${name}` : 'Orte';
}
