/** F-01/F-06: Figurenliste in Bereichen; Figur vorab anlegen. */
import { useState } from 'react';
import type { Index } from '@core/index/index';
import type { Figur, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { figurenBereiche, indexBereit } from '../../state/slices/planung';
import { f as fmt, useTexte } from '../../i18n';
import { Avatar } from '../../ui';
import { erwaehnungenVon, figurDarstellung } from '../akte/gemeinsam';
import { useOffeneVorschlaege } from '../beziehungen/Vorschlaege';

export function kapitelDerFigur(f: Figur, daten: ProjektDaten, index: Index): string[] {
  if (indexBereit(index)) {
    const set = new Set(erwaehnungenVon(index, 'figur', f.id).map((e) => e.kapitel));
    return daten.projekt.kapitel.filter((k) => set.has(k));
  }
  return daten.projekt.kapitel.filter((k) => daten.plaene[k]?.figuren.includes(f.id));
}

function Eintrag({ f, daten, gewaehlt, unterzeile }: { f: Figur; daten: ProjektDaten; gewaehlt: boolean; unterzeile: string }) {
  const waehle = useStore((s) => s.waehle);
  const d = figurDarstellung(f, daten);
  return (
    <button type="button" className="pl-listeneintrag" aria-current={gewaehlt ? 'true' : undefined} onClick={() => waehle({ figur: f.id })}>
      <Avatar name={f.name} farbe={d.farbe} groesse={28} unsicher={d.unsicher} textfarbe={d.textfarbe} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unterzeile}</span>
      </span>
    </button>
  );
}

const kopf = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-quiet)' } as const;

export function FigurenListe({ daten, index }: { daten: ProjektDaten; index: Index }) {
  const gewaehlt = useStore((s) => s.auswahl.figur);
  const suche = useStore((s) => s.planung.figurenSuche).trim().toLocaleLowerCase('de');
  const anlegen = useStore((s) => s.planung.figurAnlegen);
  const oeffneVorschlaege = useStore((s) => s.oeffneVorschlaege);
  const vorschlaege = useOffeneVorschlaege();
  const [neu, setNeu] = useState<string | null>(null);
  /** F-14: Statisten eingeklappt; offen bei Suche oder wenn ein Statist gewählt ist */
  const [statistenOffen, setStatistenOffen] = useState(false);
  const t = useTexte();
  const tl = t.figuren.liste;

  const passt = (f: Figur) =>
    !suche || [f.name, ...f.aliase, f.kurz ?? ''].some((t) => t.toLocaleLowerCase('de').includes(suche));
  const b = figurenBereiche(daten, index);
  const nr = (k: string) => daten.projekt.kapitel.indexOf(k) + 1;
  const zeile = (f: Figur) => {
    const n = kapitelDerFigur(f, daten, index).length;
    return [f.kurz, fmt(tl.kapitelAnzahl, { n })].filter(Boolean).join(' · ');
  };
  const zeileOffen = (f: Figur) => {
    const erstes = index.erstesVorkommen[f.id];
    return [erstes ? fmt(t.gemeinsam.kapitelKurz, { nr: nr(erstes) }) : null, t.gemeinsam.realitaet[f.existenz]].filter(Boolean).join(' · ');
  };

  const gruppe = (titel: string, liste: Figur[], unterzeile: (f: Figur) => string, farbe?: string, erste = false) => {
    const sichtbar = liste.filter(passt);
    if (sichtbar.length === 0) return null;
    return (
      <>
        <span style={{ ...kopf, color: farbe ?? kopf.color, padding: erste ? '4px 10px' : '12px 10px 4px' }}>{titel}</span>
        {sichtbar.map((f) => (
          <Eintrag key={f.id} f={f} daten={daten} gewaehlt={gewaehlt === f.id} unterzeile={unterzeile(f)} />
        ))}
      </>
    );
  };

  const leer = b.haupt.length + b.neben.length + b.statisten.length + b.offen.length + b.geplant.length === 0;
  const statisten = b.statisten.filter(passt);
  const statistenSichtbar = statistenOffen || !!suche || b.statisten.some((f) => f.id === gewaehlt);
  // Statisten: Name, Kurzbeschreibung und die Kapitel als Nummern
  const zeileStatist = (f: Figur) => {
    const kap = kapitelDerFigur(f, daten, index).map(nr);
    return [f.kurz, kap.length ? fmt(t.gemeinsam.kapitelKurz, { nr: kap.join(', ') }) : null].filter(Boolean).join(' · ');
  };

  return (
    <nav
      aria-label={tl.label}
      style={{
        flex: '0 0 250px',
        borderRight: '1px solid var(--line-soft)',
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}
    >
      {gruppe(tl.haupt, b.haupt, zeile, undefined, true)}
      {gruppe(tl.neben, b.neben, zeile, undefined, b.haupt.filter(passt).length === 0)}
      {statisten.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={statistenSichtbar}
            title={statistenSichtbar ? tl.statistenVerbergen : tl.statistenZeigen}
            onClick={() => setStatistenOffen(!statistenSichtbar)}
            style={{ ...kopf, padding: '12px 10px 4px', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 6 }}
          >
            <span aria-hidden="true">{statistenSichtbar ? '▾' : '▸'}</span>
            {fmt(tl.statisten, { n: statisten.length })}
          </button>
          {statistenSichtbar &&
            statisten.map((f) => <Eintrag key={f.id} f={f} daten={daten} gewaehlt={gewaehlt === f.id} unterzeile={zeileStatist(f)} />)}
        </>
      )}
      {gruppe(tl.offen, b.offen, zeileOffen, 'var(--vage-dark)')}
      <span style={{ ...kopf, padding: '12px 10px 4px' }}>{tl.geplant}</span>
      {b.geplant.filter(passt).map((f) => (
        <Eintrag key={f.id} f={f} daten={daten} gewaehlt={gewaehlt === f.id} unterzeile={f.kurz || t.figuren.rolle[f.rolle]} />
      ))}
      {leer && <span style={{ fontSize: 12, color: 'var(--ink-quiet)', padding: '0 10px 6px' }}>{tl.leer}</span>}
      {vorschlaege.anzahl > 0 && (
        <button type="button" className="pw-vs-link" onClick={() => oeffneVorschlaege()} title={tl.vorschlaegeTitel}>
          {fmt(tl.vorschlaege, { n: vorschlaege.anzahl })}
        </button>
      )}
      {neu === null ? (
        <button type="button" className="pl-vorab" onClick={() => setNeu('')}>
          {tl.vorab}
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
            placeholder={tl.namePlatzhalter}
            aria-label={t.figuren.ansicht.nameNeu}
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
