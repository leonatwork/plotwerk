import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { sucheText, type SuchOptionen } from '@core/suche';
import { useStore } from '../../state/store';
import { f, useTexte } from '../../i18n';
import { Button } from '../../ui';
import { SuchFelder } from '../suche/SuchFelder';
import { bereichZuPositionen, klartextKarte } from './klartext';
import { docZuMarkdown } from './markdown';
import { markiereSuchtreffer } from './suchdekorationen';
import '../suche/suche.css';

export function Kapitelsuche({editor,kapitelId,text}: {editor:Editor;kapitelId:string;text:string}) {
  const T = useTexte(); const t = T.suche;
  const [suche,setSuche] = useState(''); const [ersatz,setErsatz] = useState('');
  const [optionen,setOptionen] = useState<SuchOptionen>({}); const [aktiv,setAktiv] = useState(0);
  const [md,setMd] = useState(text); const [meldung,setMeldung] = useState('');
  const aktion = useStore(s => s.suche);
  useEffect(() => { setMd(text); },[text,kapitelId]);
  useEffect(() => {
    const update = () => setMd(docZuMarkdown(editor.state.doc));
    editor.on('update',update);
    return () => {editor.off('update',update); if (!editor.isDestroyed) markiereSuchtreffer(editor,[],-1);};
  },[editor,kapitelId]);
  const treffer = sucheText(md,suche,optionen,true); const index = Math.min(aktiv,Math.max(0,treffer.length-1));
  useEffect(() => {
    const karte = klartextKarte(editor.state.doc,md);
    markiereSuchtreffer(editor,sucheText(md,suche,optionen,true).map(x => bereichZuPositionen(karte,x.start,x.ende)),index);
  },[editor,md,suche,optionen,index]);
  const springen = (rueck: boolean) => {
    if (!treffer.length) return;
    const n = (index+(rueck ? -1 : 1)+treffer.length)%treffer.length; setAktiv(n);
    const x = treffer[n]!; const b = bereichZuPositionen(klartextKarte(editor.state.doc,md),x.start,x.ende);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,b.from,b.to)).scrollIntoView());
  };
  const ersetzen = async (alle: boolean) => {
    const x = treffer[index]; if (!x) return;
    try {
      const r = await aktion.ersetzen(suche,ersatz,optionen,alle ? {kapitel:kapitelId} : {einzeln:{...x,feld:{pfad:['kapitel',kapitelId,'text'],text:md,markdown:true,bereich:'manuskript',titel:kapitelId,kapitel:kapitelId}}});
      setMeldung(r.fehler.length ? r.fehler.join('\n') : f(t.fertig,{n:r.anzahl}));
      // Store-Ersetzung lädt den neuen Text; Anker werden wie externe Änderungen neu gesucht.
      setMd(useStore.getState().daten?.kapitel[kapitelId]?.text ?? md);
    } catch(e) {setMeldung(e instanceof Error ? e.message : String(e));}
  };
  return <div className="pw-suche" role="search" aria-label={t.kapitel} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); aktion.setzeKapitelOffen(false); editor.commands.focus(); }
  }}>
    <SuchFelder suche={suche} setSuche={w => {setSuche(w);setAktiv(0);}} ersatz={ersatz} setErsatz={setErsatz} optionen={optionen} setOptionen={o => {setOptionen(o);setAktiv(0);}} enter={springen} />
    <div className="pw-suche__aktionen">
      <span role="status" className="pw-suche__status">{!suche ? t.leer : !treffer.length ? t.keine : f(t.position,{nr:index+1,n:treffer.length})}</span>
      <Button disabled={!treffer.length} onClick={() => springen(true)}>{t.vorher}</Button>
      <Button disabled={!treffer.length} onClick={() => springen(false)}>{t.weiter}</Button>
      <Button disabled={aktion.laeuft || !treffer.length} onClick={() => void ersetzen(false)}>{t.ersetzen}</Button>
      <Button disabled={aktion.laeuft || !treffer.length} onClick={() => void ersetzen(true)}>{t.alle}</Button>
      <Button onClick={() => aktion.setzeKapitelOffen(false)}>{T.gemeinsam.schliessen}</Button>
    </div>
    {meldung && <p role="status">{meldung}</p>}
  </div>;
}
