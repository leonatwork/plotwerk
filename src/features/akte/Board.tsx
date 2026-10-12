/** P-01/P-06: Akt-Board mit Drag & Drop (dnd-kit) zwischen Akten, in der Reihenfolge und aus der Ideen-Ablage. */
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Index } from '@core/index/index';
import type { ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { kapitelImAkt, type AkteAnsicht } from '../../state/slices/planung';
import { AktKopf, IdeeKarte, KapitelKarte } from './Karten';
import { mitteilen } from '../../ui';
import { f, useTexte } from '../../i18n';

type Spalten = Record<string, string[]>;

const IDEEN = 'ideen';
const OHNE = 'ohne';
const aktSpalte = (n: number) => `akt:${n}`;

function basisSpalten(d: ProjektDaten): Spalten {
  const r: Spalten = {};
  const nummern = new Set(d.akte.map((a) => a.nummer));
  for (const a of [...d.akte].sort((x, y) => x.nummer - y.nummer))
    r[aktSpalte(a.nummer)] = kapitelImAkt(d.projekt.kapitel, d.plaene, a.nummer).map((id) => `k:${id}`);
  const ohne = d.projekt.kapitel.filter((id) => {
    const a = d.plaene[id]?.akt ?? null;
    return a === null || !nummern.has(a);
  });
  if (ohne.length > 0) r[OHNE] = ohne.map((id) => `k:${id}`);
  r[IDEEN] = d.ideen.map((i) => `i:${i.id}`);
  return r;
}

function spalteVon(s: Spalten, id: string): string | undefined {
  if (id in s) return id;
  return Object.keys(s).find((k) => s[k]!.includes(id));
}

function zielAkt(spalte: string): number | null {
  return spalte.startsWith('akt:') ? Number(spalte.slice(4)) : null;
}

function Sortierbar({ id, children, onWaehle, label }: { id: string; children: ReactNode; onWaehle(): void; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const t = useTexte();
  const stil: CSSProperties = { transform: CSS.Translate.toString(transform), transition, flexShrink: 0 };
  return (
    <div
      ref={setNodeRef}
      style={stil}
      className={`pl-karte${isDragging ? ' pl-karte--ziehend' : ''}`}
      {...attributes}
      {...listeners}
      aria-label={label}
      aria-roledescription={t.akte.board.ziehbar}
      onClick={onWaehle}
      onFocus={onWaehle}
    >
      {children}
    </div>
  );
}

function Spalte({
  id,
  kopf,
  items,
  children,
  stil,
}: {
  id: string;
  kopf: ReactNode;
  items: string[];
  children: ReactNode;
  stil?: CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={`pl-spalte${isOver && items.length === 0 ? ' pl-spalte--ziel' : ''}`}
      style={{ background: 'var(--spalte)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, ...stil }}
    >
      {kopf}
      <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}

function SpaltenKopf({ titel, rechts }: { titel: string; rechts?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 4px', flexShrink: 0 }}>
      <strong style={{ fontSize: 14 }}>{titel}</strong>
      {rechts && <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>{rechts}</span>}
    </div>
  );
}

export function Board({ daten, index, ansicht }: { daten: ProjektDaten; index: Index; ansicht: AkteAnsicht }) {
  const auswahlPlan = useStore((s) => s.auswahl.plan ?? s.auswahl.kapitel);
  const ideeAuswahl = useStore((s) => s.planung.ideeAuswahl);
  const waehle = useStore((s) => s.waehle);
  const waehleIdee = useStore((s) => s.planung.waehleIdee);
  const kapitelVerschieben = useStore((s) => s.planung.kapitelVerschieben);
  const kapitelPlanen = useStore((s) => s.planung.kapitelPlanen);
  const ideeAnlegen = useStore((s) => s.planung.ideeAnlegen);
  const ideeEinplanen = useStore((s) => s.planung.ideeEinplanen);
  const ideenSortieren = useStore((s) => s.planung.ideenSortieren);
  const t = useTexte();

  const basis = useMemo(() => basisSpalten(daten), [daten]);
  const [ziehend, setZiehend] = useState<Spalten | null>(null);
  const ziehendRef = useRef<Spalten | null>(null);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const spalten = ziehend ?? basis;
  const setzeZiehend = (s: Spalten | null) => {
    ziehendRef.current = s;
    setZiehend(s);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nummern = useMemo(() => {
    const m: Record<string, number> = {};
    daten.projekt.kapitel.forEach((id, i) => (m[id] = i + 1));
    return m;
  }, [daten.projekt.kapitel]);

  const ideen = useMemo(() => new Map(daten.ideen.map((i) => [i.id, i])), [daten.ideen]);
  const fehler = (e: unknown) =>
    void mitteilen(f(t.akte.board.nichtGespeichert, { fehler: e instanceof Error ? e.message : String(e) }), t.akte.board.fehlerTitel);

  function onDragStart(e: DragStartEvent) {
    setAktiv(String(e.active.id));
    setzeZiehend(basis);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const aktivId = String(active.id);
    const overId = String(over.id);
    const s = ziehendRef.current ?? basis;
    const von = spalteVon(s, aktivId);
    const nach = spalteVon(s, overId);
    if (!von || !nach || von === nach) return;
    if (aktivId.startsWith('k:') && nach === IDEEN) return;
    const nachListe = s[nach]!.filter((x) => x !== aktivId);
    let idx = nachListe.indexOf(overId);
    if (idx < 0) idx = nachListe.length;
    else {
      const r = active.rect.current.translated;
      if (r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2) idx += 1;
    }
    nachListe.splice(idx, 0, aktivId);
    setzeZiehend({ ...s, [von]: s[von]!.filter((x) => x !== aktivId), [nach]: nachListe });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const aktivId = String(active.id);
    let s = ziehendRef.current ?? basis;
    const von = spalteVon(s, aktivId);
    if (over && von) {
      const overId = String(over.id);
      if (spalteVon(s, overId) === von) {
        const a = s[von]!.indexOf(aktivId);
        const b = s[von]!.indexOf(overId);
        if (b >= 0 && a !== b) s = { ...s, [von]: arrayMove(s[von]!, a, b) };
      }
    }
    setAktiv(null);
    setzeZiehend(null);
    const spalte = spalteVon(s, aktivId);
    if (!over || !spalte) return;
    const echteId = aktivId.slice(2);
    const position = s[spalte]!.filter((x) => x.startsWith('k:') || x === aktivId).indexOf(aktivId);
    if (aktivId.startsWith('k:')) {
      const alteSpalte = spalteVon(basis, aktivId);
      const altePosition = alteSpalte ? basis[alteSpalte]!.indexOf(aktivId) : -1;
      if (alteSpalte === spalte && altePosition === position) return;
      kapitelVerschieben(echteId, zielAkt(spalte), position).catch(fehler);
    } else if (spalte === IDEEN) {
      const neu = s[IDEEN]!.map((x) => x.slice(2));
      if (neu.some((x, i) => x !== daten.ideen[i]?.id)) ideenSortieren(neu).catch(fehler);
    } else {
      ideeEinplanen(echteId, zielAkt(spalte), position).catch(fehler);
    }
  }

  function karte(itemId: string, overlay = false) {
    const echteId = itemId.slice(2);
    if (itemId.startsWith('k:'))
      return (
        <KapitelKarte
          id={echteId}
          nummer={nummern[echteId] ?? 0}
          daten={daten}
          index={index}
          ansicht={ansicht}
          gewaehlt={!overlay && !ideeAuswahl && auswahlPlan === echteId}
        />
      );
    const idee = ideen.get(echteId);
    return idee ? <IdeeKarte idee={idee} daten={daten} gewaehlt={!overlay && ideeAuswahl === echteId} /> : null;
  }

  function karten(spalte: string) {
    return spalten[spalte]!.map((itemId) => {
      const echteId = itemId.slice(2);
      const istKapitel = itemId.startsWith('k:');
      const label = istKapitel
        ? f(t.akte.board.kapitelLabel, { nr: nummern[echteId] ?? '', titel: daten.plaene[echteId]?.titel ?? '' })
        : f(t.akte.board.ideeLabel, { titel: ideen.get(echteId)?.titel ?? '' });
      return (
        <Sortierbar
          key={itemId}
          id={itemId}
          label={label}
          onWaehle={() => {
            if (istKapitel) {
              waehleIdee(null);
              waehle({ plan: echteId });
            } else waehleIdee(echteId);
          }}
        >
          {karte(itemId)}
        </Sortierbar>
      );
    });
  }

  const akte = [...daten.akte].sort((a, b) => a.nummer - b.nummer);
  const spaltenAnzahl = akte.length + (spalten[OHNE] ? 1 : 0) + 1;
  const mitText = ansicht === 'plantext';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setAktiv(null);
        setzeZiehend(null);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: t.akte.board.anleitung },
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${spaltenAnzahl}, minmax(${spaltenAnzahl > 4 ? 200 : 180}px, 1fr))`,
          gap: 12,
          overflowX: 'auto',
        }}
      >
        {akte.map((akt) => {
          const id = aktSpalte(akt.nummer);
          const ids = (spalten[id] ?? []).filter((x) => x.startsWith('k:')).map((x) => x.slice(2));
          const woerter = ids.reduce((sum, k) => sum + (index.wortzahlen[k] ?? 0), 0);
          const rechts = mitText && Object.keys(index.wortzahlen).length > 0 ? f(t.akte.board.woerter, { n: woerter }) : f(t.akte.board.kapitel, { n: ids.length });
          return (
            <Spalte
              key={id}
              id={id}
              items={spalten[id] ?? []}
              kopf={
                <>
                  <SpaltenKopf titel={akt.titel || f(t.akte.board.aktTitel, { nr: akt.nummer })} rechts={rechts} />
                  <AktKopf akt={akt} daten={daten} leer={ids.length === 0} />
                </>
              }
            >
              {karten(id)}
              <button
                type="button"
                className="pl-plus-szene"
                onClick={() => void kapitelPlanen(akt.nummer)}
                style={{
                  font: 'inherit',
                  fontSize: 13,
                  minHeight: 64,
                  flexShrink: 0,
                  borderRadius: 8,
                  border: '1.5px dashed var(--dashed)',
                  background: 'transparent',
                  color: 'var(--ink-quiet)',
                  cursor: 'pointer',
                }}
              >
                {t.akte.board.szenePlanen}
              </button>
            </Spalte>
          );
        })}
        {spalten[OHNE] && (
          <Spalte id={OHNE} items={spalten[OHNE]} kopf={<SpaltenKopf titel={t.akte.board.ohneAkt} rechts={t.akte.board.ohneAktHinweis} />}>
            {karten(OHNE)}
          </Spalte>
        )}
        <Spalte
          id={IDEEN}
          items={spalten[IDEEN] ?? []}
          stil={{ background: 'var(--ideen)', border: '1px solid var(--ideen-line)' }}
          kopf={<SpaltenKopf titel={t.akte.board.ideen} rechts={t.akte.board.ideenHinweis} />}
        >
          {karten(IDEEN)}
          <button
            type="button"
            onClick={() => void ideeAnlegen()}
            style={{
              font: 'inherit',
              fontSize: 13,
              minHeight: 44,
              flexShrink: 0,
              borderRadius: 8,
              border: '1.5px dashed var(--ideen-dashed)',
              background: 'transparent',
              color: 'var(--warm-dark)',
              cursor: 'pointer',
            }}
          >
            {t.akte.board.plusIdee}
          </button>
        </Spalte>
      </div>
      <DragOverlay dropAnimation={null}>{aktiv ? <div className="pl-karte pl-karte--overlay">{karte(aktiv, true)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
