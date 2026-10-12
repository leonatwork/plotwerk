/**
 * F-09: Panel der Auswahl-Leiste „Figur“: markierten Text als neue Figur anlegen oder als Spitznamen einer
 * Figur übernehmen. Die Erkennung findet die Stellen danach von selbst (Signatur über Name und Spitznamen).
 */
import { useId, useMemo, useState } from 'react';
import { figurenSuchen, figurMitNamensform, spitznameAusText } from '@core/figuren/namen';
import type { Id } from '@core/model/types';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';

/** Höchstens so viele Figuren in der Liste */
const MAX = 6;

export function FigurPanel({ markiert, erkannt, onFertig }: { markiert: string; erkannt: Id[]; onFertig(meldung: string): void }) {
  const daten = useStore((s) => s.daten);
  const planung = useStore((s) => s.planung);
  const t = useTexte();
  const T = t.schreiben.figurPanel;
  const uid = useId();
  const [name, setName] = useState(() => spitznameAusText(markiert));
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const [arbeitet, setArbeitet] = useState(false);
  const treffer = useMemo(() => (daten ? figurenSuchen(daten, suche, suche ? [] : erkannt).slice(0, MAX) : []), [daten, suche, erkannt]);
  if (!daten) return null;
  const n = name.trim();
  const besitzer = n ? figurMitNamensform(daten, n) : undefined;
  const zitat = (x: string) => f(t.figuren.zitat, { text: x });

  const ausfuehren = async (arbeit: () => Promise<string>) => {
    if (arbeitet) return;
    setArbeitet(true);
    try {
      onFertig(await arbeit());
    } finally {
      setArbeitet(false);
    }
  };
  const neueFigur = () =>
    void ausfuehren(async () => {
      await planung.figurAnlegen(n);
      return f(T.angelegt, { name: zitat(n) });
    });
  const spitzname = (id: Id) =>
    void ausfuehren(async () => {
      const figur = daten.figuren[id]!;
      const neu = await planung.spitznameHinzufuegen(id, n);
      return f(neu ? T.spitznameNeu : T.spitznameDa, { name: zitat(n), figur: figur.name });
    });

  return (
    <div className="pw-s-figurpanel">
      <label className="pw-s-figurpanel__label" htmlFor={`${uid}-name`}>
        {T.name}
      </label>
      <input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      {besitzer ? (
        <span className="pw-s-figurpanel__hinweis">{f(T.gehoertZu, { name: zitat(n), figur: besitzer.name })}</span>
      ) : (
        <button type="button" className="pw-s-figurpanel__neu" disabled={!n || arbeitet} onClick={neueFigur}>
          {f(T.neueFigur, { name: zitat(n || '…') })}
        </button>
      )}
      <label className="pw-s-figurpanel__label" htmlFor={`${uid}-suche`}>
        {T.spitznameVon}
      </label>
      <input
        id={`${uid}-suche`}
        data-autofocus
        role="combobox"
        aria-expanded={treffer.length > 0}
        aria-controls={`${uid}-liste`}
        aria-activedescendant={treffer[aktiv] ? `${uid}-${treffer[aktiv]!.id}` : undefined}
        placeholder={T.suchen}
        value={suche}
        autoComplete="off"
        onChange={(e) => {
          setSuche(e.target.value);
          setAktiv(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (treffer.length) setAktiv((i) => (i + (e.key === 'ArrowDown' ? 1 : treffer.length - 1)) % treffer.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const ziel = treffer[aktiv];
            if (ziel && n && !besitzer) spitzname(ziel.id);
          }
        }}
      />
      <ul id={`${uid}-liste`} role="listbox" aria-label={T.spitznameVon} className="pw-s-figurpanel__liste">
        {treffer.map((x, i) => (
          <li
            key={x.id}
            id={`${uid}-${x.id}`}
            role="option"
            aria-selected={i === aktiv}
            aria-disabled={!n || !!besitzer}
            className={i === aktiv ? 'pw-s-figurpanel__option--aktiv' : undefined}
            onMouseEnter={() => setAktiv(i)}
            onClick={() => n && !besitzer && spitzname(x.id)}
          >
            <span>{x.name}</span>
            {x.kurz && <span className="pw-s-figurpanel__kurz">{x.kurz}</span>}
          </li>
        ))}
        {treffer.length === 0 && <li className="pw-s-figurpanel__leer">{T.keine}</li>}
      </ul>
    </div>
  );
}
