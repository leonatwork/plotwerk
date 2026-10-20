/** Kapitelliste in der Seitenleiste (S-01): Status, Nummer + Titel, Wortzahl, Drag & Drop, „+ Kapitel planen“. */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Id, KapitelStatus } from '@core/model/types';
import { useStore } from '../../state/store';
import { Abschnittslabel, klassen, StatusPunkt } from '../../ui';
import { titelFokussieren } from './bruecke';
import { useKapitelWoerter } from './Statusleiste';
import { f, useTexte, zahl } from '../../i18n';

function KapitelEintrag({ id, nummer, aktiv }: { id: Id; nummer: number; aktiv: boolean }) {
  const T = useTexte().schreiben.kapitelListe;
  const titel = useStore((s) => s.daten?.kapitel[id]?.titel ?? s.daten?.plaene[id]?.titel ?? id);
  const status: KapitelStatus = useStore((s) => s.daten?.plaene[id]?.status ?? 'geplant');
  const woerter = useKapitelWoerter(id);
  const waehle = useStore((s) => s.waehle);
  const setzeBereich = useStore((s) => s.setzeBereich);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const rechts = status === 'geplant' ? T.geplant : status === 'entwurf' ? T.entwurf : woerter !== undefined ? zahl(woerter) : '';
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-current={aktiv ? 'true' : undefined}
      aria-roledescription={T.rolle}
      title={f(T.eintragTitel, { nr: nummer, titel })}
      className={klassen('pw-s-kapitel__eintrag', isDragging && 'pw-s-kapitel__eintrag--ziehen')}
      style={{ transform: CSS.Transform.toString(transform && { ...transform, x: 0, scaleX: 1, scaleY: 1 }), transition }}
      onClick={() => {
        waehle({ kapitel: id });
        setzeBereich('schreiben');
      }}
    >
      <StatusPunkt status={aktiv ? 'aktiv' : status} />
      <span className="pw-s-kapitel__titel">
        {nummer} {titel}
      </span>
      <span className="pw-s-kapitel__zahl">{rechts}</span>
    </button>
  );
}

export function KapitelListe() {
  const reihenfolge = useStore((s) => s.daten?.projekt.kapitel);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const verschieben = useStore((s) => s.kapitelVerschieben);
  const planen = useStore((s) => s.kapitelPlanen);
  const archiv = useStore((s) => s.daten?.archiv);
  const archivieren = useStore((s) => s.kapitelArchivieren);
  const wiederherstellen = useStore((s) => s.kapitelWiederherstellen);
  const fehler = useStore((s) => s.speichern.fehler);
  const t = useTexte();
  const sensoren = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  if (!reihenfolge) return null;
  const aktiv = gewaehlt && reihenfolge.includes(gewaehlt) ? gewaehlt : reihenfolge[0];

  const beimLoslassen = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    void verschieben(String(active.id), reihenfolge.indexOf(String(over.id)));
  };

  return (
    <div className="pw-s-kapitel">
      <Abschnittslabel className="pw-s-kapitel__label">{t.gemeinsam.kapitelMehrzahl}</Abschnittslabel>
      <DndContext
        sensors={sensoren}
        collisionDetection={closestCenter}
        onDragEnd={beimLoslassen}
        accessibility={{
          screenReaderInstructions: { draggable: t.schreiben.kapitelListe.ziehenHilfe },
        }}
      >
        <SortableContext items={reihenfolge} strategy={verticalListSortingStrategy}>
          {reihenfolge.map((id, i) => (
            <KapitelEintrag key={id} id={id} nummer={i + 1} aktiv={id === aktiv} />
          ))}
        </SortableContext>
      </DndContext>
      {aktiv && <button type="button" className="pw-s-kapitel__neu" onClick={() => void archivieren(aktiv).catch(() => undefined)}>{t.schreiben.archiv.archivieren}</button>}
      {Object.keys(archiv ?? {}).length > 0 && (
        <details>
          <summary className="pw-s-kapitel__neu">{t.schreiben.archiv.liste}</summary>
          {Object.entries(archiv ?? {}).map(([id, eintrag]) => (
            <div key={id}>
              <button type="button" className="pw-s-kapitel__neu" aria-label={f(t.schreiben.archiv.ansehen, { titel: eintrag.kapitel.titel })}
                onClick={() => useStore.getState().oeffne('akte', { plan: id })}>{eintrag.kapitel.titel}</button>
              <button type="button" className="pw-s-kapitel__neu" onClick={() => void wiederherstellen(id).catch(() => undefined)}>{f(t.schreiben.archiv.zurueck, { titel: eintrag.kapitel.titel })}</button>
            </div>
          ))}
        </details>
      )}
      {fehler && <span role="alert">{fehler}</span>}
      <button
        type="button"
        className="pw-s-kapitel__neu"
        onClick={() => {
          const laeuft = planen();
          titelFokussieren(useStore.getState().auswahl.kapitel ?? null);
          void laeuft;
        }}
      >
        {t.schreiben.kapitelListe.neu}
      </button>
    </div>
  );
}
