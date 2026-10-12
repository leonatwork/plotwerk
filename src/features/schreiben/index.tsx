/** Bereich „Schreiben“: Editor, Kapitelliste, Plan-Panel, Anmerkungen, Versionsverlauf, Fokus-Modus. */
import { useEffect } from 'react';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, LeerZustand } from '../../ui';
import { SchreibEditor } from './Editor';
import { KapitelListe } from './KapitelListe';
import { SchreibInspektor } from './SchreibInspektor';
import { oeffneVorschau } from '../vorschau';
import { TypewriterKnopf } from './werkzeuge';
import './schreiben.css';

export default function Ansicht() {
  const reihenfolge = useStore((s) => s.daten?.projekt.kapitel);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const waehle = useStore((s) => s.waehle);
  const kapitelPlanen = useStore((s) => s.kapitelPlanen);
  const fokus = useStore((s) => s.fokusModus);
  const umschalteFokus = useStore((s) => s.umschalteFokus);
  const kapitelId = gewaehlt && reihenfolge?.includes(gewaehlt) ? gewaehlt : reihenfolge?.[0];

  useEffect(() => {
    if (kapitelId && kapitelId !== gewaehlt) waehle({ kapitel: kapitelId });
  }, [kapitelId, gewaehlt, waehle]);

  // Escape beendet den Fokus-Modus
  useEffect(() => {
    if (!fokus) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) umschalteFokus();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [fokus, umschalteFokus]);

  if (!kapitelId)
    return (
      <LeerZustand titel="Noch keine Kapitel" aktionen={<Button variante="primaer" onClick={() => void kapitelPlanen()}>+ Kapitel planen</Button>}>
        Plane das erste Kapitel oder importiere ein Word-Dokument.
      </LeerZustand>
    );

  return (
    <div className="pw-s-ansicht">
      <SchreibEditor kapitelId={kapitelId} />
      <SchreibInspektor kapitelId={kapitelId} />
    </div>
  );
}

export function Seitenleiste() {
  return <KapitelListe />;
}

export function Titelaktionen() {
  const umschalteFokus = useStore((s) => s.umschalteFokus);
  const fokus = useStore((s) => s.fokusModus);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const editorSichern = useStore((s) => s.editorSichern);
  const kapitel = useStore((s) => s.auswahl.kapitel);
  return (
    <>
      <Button onClick={umschalteFokus} aria-pressed={fokus} title="Fokus-Modus (⌘⇧F)">
        {fokus ? 'Fokus beenden' : 'Fokus-Modus'}
      </Button>
      <TypewriterKnopf />
      <Button title="Buch- und E-Book-Vorschau (⌘⇧B)" onClick={() => oeffneVorschau(kapitel)}>
        Vorschau
      </Button>
      <Button
        title="Exportieren (⌘E)"
        onClick={async () => {
          await editorSichern();
          oeffneDialog('export');
        }}
      >
        Exportieren
      </Button>
      <Button
        variante="primaer"
        disabled={!kapitel}
        onClick={async () => {
          await editorSichern();
          oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel });
        }}
      >
        Kapitel prüfen
      </Button>
    </>
  );
}

export function kontext(state: Store): string {
  const d = state.daten;
  const id = state.auswahl.kapitel ?? d?.projekt.kapitel[0];
  if (!id || !d) return 'Schreiben';
  const titel = d.kapitel[id]?.titel ?? d.plaene[id]?.titel;
  if (!titel) return 'Schreiben';
  return `Kap. ${d.projekt.kapitel.indexOf(id) + 1} · ${titel}`;
}
