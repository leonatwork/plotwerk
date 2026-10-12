/** Statusleiste unter dem Text: Speicherstand · Versionsverlauf, Wortzahl Kapitel · gesamt (S-04, S-05). */
import type { Id } from '@core/model/types';
import { useStore } from '../../state/store';
import { EditorWerkzeugleiste } from './werkzeuge';
import { SchreibzielAnzeige } from '../statistik/SchreibzielAnzeige';
import { f, useTexte } from '../../i18n';
import { NurMit } from '../../app/NurMit';

/** Wörter des Kapitels: live aus dem Editor, sonst aus dem Index. */
export function useKapitelWoerter(id: Id | undefined): number | undefined {
  return useStore((s) => {
    if (!id) return undefined;
    if (s.schreibenLive?.kapitel === id) return s.schreibenLive.woerter;
    return s.index.wortzahlen[id];
  });
}

export function useGesamtWoerter(): number {
  return useStore((s) => {
    const d = s.daten;
    if (!d) return 0;
    let summe = 0;
    for (const id of d.projekt.kapitel) {
      summe += s.schreibenLive?.kapitel === id ? s.schreibenLive.woerter : (s.index.wortzahlen[id] ?? 0);
    }
    return summe;
  });
}

export function Statusleiste({ kapitelId, ungespeichert, meldung }: { kapitelId: Id; ungespeichert: boolean; meldung: string | null }) {
  const fehler = useStore((s) => s.speichern.fehler);
  const laufend = useStore((s) => s.speichern.laufend > 0);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const editorSichern = useStore((s) => s.editorSichern);
  const kapitel = useKapitelWoerter(kapitelId) ?? 0;
  const gesamt = useGesamtWoerter();
  const t = useTexte();
  const T = t.schreiben.statusleiste;

  const stand = fehler ? (
    <span className="pw-s-status__fehler" title={fehler}>
      {f(T.fehlgeschlagen, { fehler })}
    </span>
  ) : (
    <span>{meldung ?? (ungespeichert || laufend ? T.speichert : T.gespeichert)}</span>
  );

  return (
    <div className="pw-s-status" role="status" aria-live="polite">
      <span style={{ display: 'flex', gap: 4 }}>
        {stand}
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={async () => {
            await editorSichern();
            oeffneDialog('versionen', { kapitel: kapitelId });
          }}
        >
          {T.versionsverlauf}
        </button>
      </span>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <NurMit funktion="editorWerkzeuge">
          <EditorWerkzeugleiste kapitelId={kapitelId} />
        </NurMit>
        <NurMit funktion="statistik">
          <SchreibzielAnzeige />
        </NurMit>
        <span>
          {f(T.woerter, { n: kapitel })} · {f(T.gesamt, { n: gesamt })}
        </span>
      </span>
    </div>
  );
}
