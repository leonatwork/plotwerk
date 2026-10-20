import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { sucheText, type SuchOptionen } from '@core/suche';
import { TextSelection } from '@tiptap/pm/state';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import { bereichZuPositionen, klartextKarte } from '../schreiben/klartext';
import { docZuMarkdown } from '../schreiben/markdown';
import { setzeSuchtreffer } from './dekorationen';
import { Suchfelder } from './Suchfelder';
import './suche.css';

export function Kapitelsuche({ editor, kapitel }: { editor: Editor; kapitel: string }) {
  const t = useTexte().suche;
  const aktion = useStore(s => s.volltext);
  const [suche, setSuche] = useState(''), [ersatz, setErsatz] = useState('');
  const [optionen, setOptionen] = useState<SuchOptionen>({});
  const [doc, setDoc] = useState(editor.state.doc);
  const [aktiv, setAktiv] = useState(0), [fehler, setFehler] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setDoc(editor.state.doc);
    editor.on('transaction', update);
    return () => { editor.off('transaction', update); setzeSuchtreffer(editor.view, [], 0); };
  }, [editor]);
  const karte = useMemo(() => klartextKarte(doc), [doc]);
  const treffer = useMemo(() => sucheText(karte.text, suche, optionen), [karte, suche, optionen]);
  const index = Math.min(aktiv, Math.max(0, treffer.length - 1));
  useEffect(() => {
    if (editor.isDestroyed) return;
    setzeSuchtreffer(editor.view, treffer.map(x => bereichZuPositionen(karte, x.start, x.ende)), index);
  }, [editor, karte, treffer, index]);
  const weiter = (richtung: number) => {
    const i = (index + richtung + treffer.length) % (treffer.length || 1);
    setAktiv(i);
    const x = treffer[i];
    if (!x) return;
    const b = bereichZuPositionen(karte, x.start, x.ende);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, b.from, b.to)).scrollIntoView());
  };
  const ersetzen = async (alle: boolean) => {
    const x = treffer[index];
    if (!x) return;
    const text = docZuMarkdown(doc);
    const r = await aktion.ersetzen(suche, ersatz, optionen, alle ? { kapitel } : { kapitel, einzeln: { ...x, feld: { pfad: ['kapitel', kapitel, 'text'], text, titel: kapitel, kapitel, bereich: 'manuskript', markdown: true } } });
    setDoc(editor.state.doc);
    setFehler(r.fehler);
  };
  return <div className="pw-kapitelsuche" role="search" aria-label={t.kapitel} onKeyDown={e => { if (e.key === 'Escape') aktion.oeffneKapitel(false); }}>
    <Suchfelder {...{ suche, ersatz, optionen, setErsatz, weiter }} setSuche={s => { setSuche(s); setAktiv(0); }} setOptionen={o => { setOptionen(o); setAktiv(0); }} />
    <div className="pw-suche-optionen">
      <span role="status">{!suche ? t.leer : !treffer.length ? t.keine : `${index + 1} / ${f(t.treffer, { n: treffer.length })}`}</span>
      <Button disabled={!treffer.length} onClick={() => weiter(-1)}>{t.zurueck}</Button>
      <Button disabled={!treffer.length} onClick={() => weiter(1)}>{t.weiter}</Button>
      <Button disabled={!treffer.length || aktion.laeuft} onClick={() => void ersetzen(false).catch(e => setFehler([String(e)]))}>{t.ersetzen}</Button>
      <Button disabled={!treffer.length || aktion.laeuft} onClick={() => void ersetzen(true).catch(e => setFehler([String(e)]))}>{t.alle}</Button>
      <Button onClick={() => aktion.oeffneKapitel(false)}>{t.schliessen}</Button>
    </div>
    {fehler.length > 0 && <div role="alert">{fehler.join('\n')}</div>}
  </div>;
}
