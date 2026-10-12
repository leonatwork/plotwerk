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
import { f, texte, useTexte } from '../../i18n';
import './schreiben.css';

export default function Ansicht() {
  const reihenfolge = useStore((s) => s.daten?.projekt.kapitel);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const waehle = useStore((s) => s.waehle);
  const kapitelPlanen = useStore((s) => s.kapitelPlanen);
  const fokus = useStore((s) => s.fokusModus);
  const umschalteFokus = useStore((s) => s.umschalteFokus);
  const T = useTexte().schreiben.ansicht;
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
      <LeerZustand titel={T.leerTitel} aktionen={<Button variante="primaer" onClick={() => void kapitelPlanen()}>{T.kapitelPlanen}</Button>}>
        {T.leerText}
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
  const T = useTexte().schreiben.ansicht;
  return (
    <>
      <Button onClick={umschalteFokus} aria-pressed={fokus} title={T.fokusTitel}>
        {fokus ? T.fokusBeenden : T.fokusModus}
      </Button>
      <TypewriterKnopf />
      <Button title={T.vorschauTitel} onClick={() => oeffneVorschau(kapitel)}>
        {T.vorschau}
      </Button>
      <Button
        title={T.exportierenTitel}
        onClick={async () => {
          await editorSichern();
          oeffneDialog('export');
        }}
      >
        {T.exportieren}
      </Button>
      <Button
        variante="primaer"
        disabled={!kapitel}
        onClick={async () => {
          await editorSichern();
          oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel });
        }}
      >
        {T.kapitelPruefen}
      </Button>
    </>
  );
}

export function kontext(state: Store): string {
  const d = state.daten;
  const id = state.auswahl.kapitel ?? d?.projekt.kapitel[0];
  const t = texte();
  if (!id || !d) return t.schreiben.ansicht.kontext;
  const titel = d.kapitel[id]?.titel ?? d.plaene[id]?.titel;
  if (!titel) return t.schreiben.ansicht.kontext;
  return `${f(t.gemeinsam.kapitelKurz, { nr: d.projekt.kapitel.indexOf(id) + 1 })} · ${titel}`;
}
