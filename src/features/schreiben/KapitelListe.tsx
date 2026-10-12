/** Kapitelliste in der Seitenleiste (S-01): Status, Nummer + Titel, Wortzahl, Drag & Drop, „+ Kapitel planen“. */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Id, KapitelStatus } from '@core/model/types';
import { useStore } from '../../state/store';
import { Abschnittslabel, klassen, StatusPunkt } from '../../ui';
import { titelFokussieren } from './bruecke';
import { useKapitelWoerter } from './Statusleiste';

const zahl = new Intl.NumberFormat('de-DE');

function KapitelEintrag({ id, nummer, aktiv }: { id: Id; nummer: number; aktiv: boolean }) {
  const titel = useStore((s) => s.daten?.kapitel[id]?.titel ?? s.daten?.plaene[id]?.titel ?? id);
  const status: KapitelStatus = useStore((s) => s.daten?.plaene[id]?.status ?? 'geplant');
  const woerter = useKapitelWoerter(id);
  const waehle = useStore((s) => s.waehle);
  const setzeBereich = useStore((s) => s.setzeBereich);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const rechts = status === 'geplant' ? 'geplant' : status === 'entwurf' ? 'Entwurf' : woerter !== undefined ? zahl.format(woerter) : '';
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-current={aktiv ? 'true' : undefined}
      aria-roledescription="verschiebbares Kapitel"
      title={`${nummer} ${titel} – ziehen zum Verschieben`}
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
      <Abschnittslabel className="pw-s-kapitel__label">Kapitel</Abschnittslabel>
      <DndContext
        sensors={sensoren}
        collisionDetection={closestCenter}
        onDragEnd={beimLoslassen}
        accessibility={{
          screenReaderInstructions: { draggable: 'Leertaste zum Aufnehmen, Pfeiltasten zum Verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.' },
        }}
      >
        <SortableContext items={reihenfolge} strategy={verticalListSortingStrategy}>
          {reihenfolge.map((id, i) => (
            <KapitelEintrag key={id} id={id} nummer={i + 1} aktiv={id === aktiv} />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="pw-s-kapitel__neu"
        onClick={() => {
          const laeuft = planen();
          titelFokussieren(useStore.getState().auswahl.kapitel ?? null);
          void laeuft;
        }}
      >
        + Kapitel planen
      </button>
    </div>
  );
}
