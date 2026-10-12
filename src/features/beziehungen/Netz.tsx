/** Zeichenfläche des Beziehungsnetzes: Karten verschieben, Flächen verschieben/skalieren, Beziehungen per Drag anlegen. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Index } from '@core/index/index';
import type { Id, ProjektDaten } from '@core/model/types';
import { f as fmt, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';
import { KARTE, netzBerechnen, paarSchluessel, type NetzAnsicht, type NetzFilter, type NetzKarte, type NetzPlatzhalter, type Segment } from './logik';

type Zug =
  | { art: 'karte'; id: Id; sx: number; sy: number; dx: number; dy: number; bewegt: boolean }
  | { art: 'flaeche'; id: Id; sx: number; sy: number; dx: number; dy: number; bewegt: boolean; mitglieder: Id[] }
  | { art: 'groesse'; id: Id; sx: number; sy: number; dx: number; dy: number; bewegt: boolean }
  /** start = angeklickte Karte (bei gewählter Quelle das Ziel eines Klicks) */
  | { art: 'verbinden'; von: Id; start: Id; sx: number; sy: number; x: number; y: number; bewegt: boolean; ueber: Id | null };

export interface NetzProps {
  daten: ProjektDaten;
  index: Index;
  ansicht: NetzAnsicht;
  standIdx: number;
  filter: NetzFilter;
}

const pfad = (s: Segment[]) => s.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.x1} ${x.y1} L ${x.x2} ${x.y2}`).join(' ');

function figurUnter(cx: number, cy: number): Id | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(cx, cy) : null;
  return (el as HTMLElement | null)?.closest<HTMLElement>('[data-figur]')?.dataset.figur ?? null;
}

export function Netz({ daten, index, ansicht: basis, standIdx, filter }: NetzProps) {
  const inhalt = useRef<HTMLDivElement>(null);
  const zugRef = useRef<Zug | null>(null);
  const [zug, setZug] = useState<Zug | null>(null);
  const [quelle, setQuelle] = useState<Id | null>(null);
  const auswahl = useStore((s) => s.netzAuswahl);
  const verbindenModus = useStore((s) => s.netzVerbinden);
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const setzeNetzVerbinden = useStore((s) => s.setzeNetzVerbinden);
  const beziehungAnlegen = useStore((s) => s.beziehungAnlegen);
  const figurImNetzSetzen = useStore((s) => s.figurImNetzSetzen);
  const gruppeImNetzSetzen = useStore((s) => s.gruppeImNetzSetzen);
  const tn = useTexte().beziehungen.netz;

  // „+ Beziehung“ mit ausgewählter Figur: sie ist die Quelle
  useEffect(() => {
    if (!verbindenModus) setQuelle(null);
    else if (auswahl?.typ === 'figur') setQuelle(auswahl.id);
  }, [verbindenModus]); // nur beim Umschalten des Modus

  useEffect(() => {
    if (!verbindenModus && !quelle) return;
    const taste = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setQuelle(null);
      setzeNetzVerbinden(false);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [verbindenModus, quelle, setzeNetzVerbinden]);

  // Während des Ziehens mit verschobenen Positionen neu berechnen (Linien folgen)
  const ansicht = useMemo(() => {
    if (!zug || !zug.bewegt || zug.art === 'verbinden') return basis;
    const figuren = { ...daten.figuren };
    const gruppen = { ...daten.gruppen };
    const verschiebe = (id: Id, dx: number, dy: number) => {
      const f = figuren[id];
      if (f?.netz) figuren[id] = { ...f, netz: { x: Math.max(0, f.netz.x + dx), y: Math.max(0, f.netz.y + dy) } };
    };
    if (zug.art === 'karte') verschiebe(zug.id, zug.dx, zug.dy);
    const g = gruppen[zug.id];
    if (zug.art === 'flaeche' && g?.netz) {
      const dx = Math.max(-g.netz.x, zug.dx);
      const dy = Math.max(-g.netz.y, zug.dy);
      gruppen[zug.id] = { ...g, netz: { ...g.netz, x: g.netz.x + dx, y: g.netz.y + dy } };
      for (const m of zug.mitglieder) verschiebe(m, dx, dy);
    }
    if (zug.art === 'groesse' && g?.netz)
      gruppen[zug.id] = {
        ...g,
        netz: { ...g.netz, breite: Math.max(120, g.netz.breite + zug.dx), hoehe: Math.max(80, g.netz.hoehe + zug.dy) },
      };
    return netzBerechnen({ ...daten, figuren, gruppen }, index, standIdx, filter, useStore.getState().netzStatisten);
  }, [basis, zug, daten, index, standIdx, filter]);

  const punkt = (e: { clientX: number; clientY: number }) => {
    const r = inhalt.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const starte = (e: PointerEvent, z: Zug) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      inhalt.current?.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom/ältere WebViews */
    }
    zugRef.current = z;
    setZug(z);
  };

  const verbindenAb = (e: PointerEvent, von: Id, start: Id): Zug => ({
    art: 'verbinden',
    von,
    start,
    sx: e.clientX,
    sy: e.clientY,
    ...punkt(e),
    bewegt: false,
    ueber: null,
  });

  const verbinde = async (von: Id, zu: Id) => {
    setQuelle(null);
    setzeNetzVerbinden(false);
    const r = await beziehungAnlegen(von, zu);
    if (r) waehleImNetz({ typ: 'beziehung', paar: paarSchluessel(von, zu), eintrag: r });
  };

  const klickAufKarte = (id: Id) => {
    if (verbindenModus || quelle) {
      if (quelle && quelle !== id) void verbinde(quelle, id);
      else setQuelle(id);
      return;
    }
    waehleImNetz({ typ: 'figur', id });
  };

  const bewege = (e: PointerEvent) => {
    const z = zugRef.current;
    if (!z) return;
    const dx = e.clientX - z.sx;
    const dy = e.clientY - z.sy;
    const bewegt = z.bewegt || Math.abs(dx) + Math.abs(dy) > 3;
    let neu: Zug;
    if (z.art === 'verbinden') {
      const p = punkt(e);
      const ueber = figurUnter(e.clientX, e.clientY);
      neu = { ...z, x: p.x, y: p.y, bewegt, ueber: ueber !== z.von ? ueber : null };
    } else neu = { ...z, dx, dy, bewegt };
    zugRef.current = neu;
    setZug(neu);
  };

  const beende = (e: PointerEvent, abbrechen = false) => {
    const z = zugRef.current;
    if (!z) return;
    zugRef.current = null;
    try {
      inhalt.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* nicht gefangen */
    }
    setZug(null);
    if (abbrechen) return;
    if (z.art === 'karte') {
      const f = daten.figuren[z.id];
      if (z.bewegt && f?.netz) void figurImNetzSetzen(z.id, { x: Math.max(0, f.netz.x + z.dx), y: Math.max(0, f.netz.y + z.dy) });
      else if (!z.bewegt) klickAufKarte(z.id);
    } else if (z.art === 'flaeche' || z.art === 'groesse') {
      const g = daten.gruppen[z.id];
      if (!z.bewegt || !g?.netz) {
        if (!z.bewegt) waehleImNetz({ typ: 'gruppe', id: z.id });
        return;
      }
      if (z.art === 'groesse') {
        void gruppeImNetzSetzen(z.id, { ...g.netz, breite: g.netz.breite + z.dx, hoehe: g.netz.hoehe + z.dy });
        return;
      }
      const dx = Math.max(-g.netz.x, z.dx);
      const dy = Math.max(-g.netz.y, z.dy);
      void gruppeImNetzSetzen(z.id, { ...g.netz, x: g.netz.x + dx, y: g.netz.y + dy });
      for (const m of z.mitglieder) {
        const f = daten.figuren[m];
        if (f?.netz) void figurImNetzSetzen(m, { x: f.netz.x + dx, y: f.netz.y + dy });
      }
    } else {
      const ziel = figurUnter(e.clientX, e.clientY) ?? (z.bewegt ? null : z.start);
      if (ziel && ziel !== z.von) void verbinde(z.von, ziel);
      else if (!z.bewegt) klickAufKarte(z.start);
    }
  };

  const tasteAufKarte = (e: KeyboardEvent, k: NetzKarte) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      klickAufKarte(k.figur.id);
      return;
    }
    const schritt = e.shiftKey ? 20 : 4;
    const d = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[e.key];
    if (!d) return;
    e.preventDefault();
    void figurImNetzSetzen(k.figur.id, { x: Math.max(0, k.rechteck.x + d[0]!), y: Math.max(0, k.rechteck.y + d[1]!) });
  };

  const gewaehlteLinie = auswahl?.typ === 'beziehung' ? auswahl.paar : null;
  const aktivKarte = (id: Id) => auswahl?.typ === 'figur' && auswahl.id === id;
  const gezogen = zug?.art === 'karte' && zug.bewegt ? zug.id : null;

  const karteStil = (k: NetzKarte): CSSProperties => {
    const s: CSSProperties = { left: k.rechteck.x, top: k.rechteck.y };
    if (k.variante === 'normal' || k.variante === 'erwaehnt') s.borderColor = k.farben.linie;
    if (k.variante === 'geplant') s.borderColor = 'var(--dotted)';
    if (k.variante === 'unsicher') {
      s.borderColor = k.farben.farbe;
      s.background = k.farben.flaeche;
    }
    return s;
  };

  const platzhalterStil = (p: NetzPlatzhalter): CSSProperties =>
    p.variante === 'leer'
      ? { left: p.rechteck.x, top: p.rechteck.y, borderColor: p.farben.gestrichelt, color: p.farben.farbe }
      : { left: p.rechteck.x, top: p.rechteck.y, borderColor: p.farben.farbe };

  const quellKarte = zug?.art === 'verbinden' ? ansicht.karten.find((k) => k.figur.id === zug.von) : undefined;

  return (
    <div
      ref={inhalt}
      className={klassen('pw-bz-inhalt', (verbindenModus || quelle) && 'pw-bz-inhalt--verbinden')}
      style={{ width: ansicht.breite, height: ansicht.hoehe }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        setQuelle(null);
        waehleImNetz(null);
      }}
      onPointerMove={bewege}
      onPointerUp={(e) => beende(e)}
      onPointerCancel={(e) => beende(e, true)}
      data-testid="netz"
    >
      {ansicht.flaechen.map((f) => (
        <div
          key={f.gruppe.id}
          className={klassen('pw-bz-gruppe', auswahl?.typ === 'gruppe' && auswahl.id === f.gruppe.id && 'pw-bz-gruppe--aktiv')}
          style={{
            left: f.rechteck.x,
            top: f.rechteck.y,
            width: f.rechteck.breite,
            height: f.rechteck.hoehe,
            background: f.farben.flaeche,
            borderColor: f.farben.flaecheLinie,
          }}
          data-gruppe={f.gruppe.id}
          role="button"
          tabIndex={0}
          aria-label={fmt(tn.gruppe, { name: f.gruppe.name })}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && waehleImNetz({ typ: 'gruppe', id: f.gruppe.id })}
          onPointerDown={(e) => {
            const r = f.rechteck;
            const mitglieder = ansicht.karten
              .filter((k) => {
                const cx = k.rechteck.x + KARTE.breite / 2;
                const cy = k.rechteck.y + KARTE.hoehe / 2;
                return cx >= r.x && cx <= r.x + r.breite && cy >= r.y && cy <= r.y + r.hoehe;
              })
              .map((k) => k.figur.id);
            starte(e, { art: 'flaeche', id: f.gruppe.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, bewegt: false, mitglieder });
          }}
        >
          <span
            className="pw-bz-gruppe__groesse"
            title={tn.groesseAendern}
            onPointerDown={(e) =>
              starte(e, { art: 'groesse', id: f.gruppe.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, bewegt: false })
            }
          />
        </div>
      ))}
      {ansicht.flaechen.map((f) => (
        <div
          key={`l-${f.gruppe.id}`}
          className="pw-bz-gruppe__label"
          style={{ left: f.rechteck.x + 10, top: f.rechteck.y + 10, color: f.farben.dunkel }}
        >
          {f.label}
        </div>
      ))}

      <svg className="pw-bz-linien" width={ansicht.breite} height={ansicht.hoehe} aria-hidden="true">
        {ansicht.linien
          .filter((l) => l.id === gewaehlteLinie)
          .map((l) => (
            <path key={`h-${l.id}`} className="pw-bz-halo" d={pfad(l.weg)} style={{ stroke: l.segmente.at(-1)?.farbe }} />
          ))}
        {ansicht.linien.map((l) =>
          l.segmente.map((s, i) => (
            <path
              key={`${l.id}-${i}`}
              d={pfad([s])}
              style={{ stroke: s.farbe, strokeDasharray: s.gestrichelt ? '6 6' : undefined }}
              data-linie={l.id}
            />
          )),
        )}
        {ansicht.linien.map((l) => (
          <path
            key={`t-${l.id}`}
            className="pw-bz-treffer"
            d={pfad(l.weg)}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (l.id.startsWith('spur:')) waehleImNetz({ typ: 'gruppe', id: l.id.slice(5) });
              else waehleImNetz({ typ: 'beziehung', paar: l.id });
            }}
          />
        ))}
      </svg>

      {ansicht.platzhalter.map((p) => (
        <div
          key={`p-${p.gruppe.id}`}
          className={klassen('pw-bz-karte', 'pw-bz-karte--platzhalter', `pw-bz-karte--${p.variante}`)}
          style={platzhalterStil(p)}
          role="button"
          tabIndex={0}
          aria-label={`${p.gruppe.name}: ${p.titel}${p.untertitel ? `, ${p.untertitel}` : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => waehleImNetz({ typ: 'gruppe', id: p.gruppe.id })}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && waehleImNetz({ typ: 'gruppe', id: p.gruppe.id })}
        >
          <span>
            <b>{p.titel}</b>
            {p.untertitel && (
              <>
                <br />
                <span className="pw-bz-karte__unter">{p.untertitel}</span>
              </>
            )}
          </span>
        </div>
      ))}

      {ansicht.karten.map((k) => (
        <div
          key={k.figur.id}
          className={klassen(
            'pw-bz-karte',
            `pw-bz-karte--${k.variante}`,
            aktivKarte(k.figur.id) && 'pw-bz-karte--aktiv',
            quelle === k.figur.id && 'pw-bz-karte--quelle',
            zug?.art === 'verbinden' && zug.ueber === k.figur.id && 'pw-bz-karte--ziel',
            gezogen === k.figur.id && 'pw-bz-karte--zieht',
            k.figur.name.length > 16 && 'pw-bz-karte--lang',
          )}
          style={karteStil(k)}
          data-figur={k.figur.id}
          role="button"
          tabIndex={0}
          aria-pressed={aktivKarte(k.figur.id)}
          aria-label={`${k.figur.name}${k.untertitel ? `, ${k.untertitel}` : ''}`}
          onPointerDown={(e) =>
            verbindenModus || quelle
              ? starte(e, verbindenAb(e, quelle ?? k.figur.id, k.figur.id))
              : starte(e, { art: 'karte', id: k.figur.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, bewegt: false })
          }
          onKeyDown={(e) => tasteAufKarte(e, k)}
        >
          <span>
            <b>{k.figur.name}</b>
            {k.untertitel && (
              <>
                <br />
                <span className="pw-bz-karte__unter" style={k.variante === 'unsicher' ? { color: k.farben.dunkel } : undefined}>
                  {k.untertitel}
                </span>
              </>
            )}
          </span>
          {!verbindenModus && (
            <span
              className="pw-bz-griff"
              title={tn.ziehenZumVerbinden}
              onPointerDown={(e) => starte(e, verbindenAb(e, k.figur.id, k.figur.id))}
            />
          )}
        </div>
      ))}

      {ansicht.linien.map((l) => (
        <button
          key={`b-${l.id}`}
          type="button"
          className={klassen(
            'pw-bz-label',
            l.label.zentriert && 'pw-bz-label--zentriert',
            l.label.leer && 'pw-bz-label--leer',
            l.id === gewaehlteLinie && 'pw-bz-label--aktiv',
          )}
          style={{ left: l.label.x, top: l.label.y, color: l.label.farbe }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() =>
            l.id.startsWith('spur:') ? waehleImNetz({ typ: 'gruppe', id: l.id.slice(5) }) : waehleImNetz({ typ: 'beziehung', paar: l.id })
          }
        >
          {l.label.text}
        </button>
      ))}

      {zug?.art === 'verbinden' && zug.bewegt && quellKarte && (
        <svg className="pw-bz-linien" width={ansicht.breite} height={ansicht.hoehe} aria-hidden="true">
          <path
            d={`M ${quellKarte.rechteck.x + KARTE.breite / 2} ${quellKarte.rechteck.y + KARTE.hoehe / 2} L ${zug.x} ${zug.y}`}
            style={{ stroke: 'var(--accent)', strokeDasharray: '4 4' }}
          />
        </svg>
      )}
    </div>
  );
}
