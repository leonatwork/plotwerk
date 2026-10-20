import { useMemo, useState } from 'react';
import { ankerErzeugen } from '@core/text';
import { klartext, sucheProjekt, type ProjektTreffer, type SuchOptionen } from '@core/suche';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Dialog } from '../../ui';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { SuchFelder } from './SuchFelder';
import './suche.css';

export default function Projektsuche({schliessen}: DialogKomponentenProps) {
  const t = useTexte().suche;
  const d = useStore(s => s.daten);
  const aktion = useStore(s => s.suche);
  const [suche,setSuche] = useState(''); const [ersatz,setErsatz] = useState('');
  const [optionen,setOptionen] = useState<SuchOptionen>({});
  const [aktiv,setAktiv] = useState(0); const [meldung,setMeldung] = useState(''); const [fragt,setFragt] = useState(false);
  const treffer = useMemo(() => d ? sucheProjekt(d,suche,optionen) : [],[d,suche,optionen]);
  const index = Math.min(aktiv,Math.max(0,treffer.length-1));
  const ersetzen = async (alle: boolean) => {
    setFragt(true);
    try {
      await useStore.getState().editorSichern();
      const aktuell = useStore.getState().daten;
      if (!aktuell) return;
      const liste = sucheProjekt(aktuell,suche,optionen);
      if (!liste.length) return;
      if (alle && !await bestaetigen(f(t.bestaetigung,{n:liste.length,kapitel:new Set(liste.filter(x => x.feld.kapitel).map(x => x.feld.kapitel)).size}),{knopf:t.alle})) return;
      const r = await aktion.ersetzen(suche,ersatz,optionen,alle ? {erwartet:liste} : {einzeln:treffer[index]});
      setMeldung(r.fehler.length ? r.fehler.join('\n') : f(t.fertig,{n:r.anzahl}));
    } catch(e) { setMeldung(e instanceof Error ? e.message : String(e)); }
    finally {setFragt(false);}
  };
  const oeffnen = (x: ProjektTreffer) => {
    if (x.feld.kapitel) {
      useStore.getState().markiere({kapitel:x.feld.kapitel,anker:ankerErzeugen(x.feld.kapitel,klartext(x.feld.text),x.start,x.ende)});
      schliessen();
    } else setAktiv(treffer.indexOf(x));
  };
  const gesperrt = aktion.laeuft || fragt;
  return <Dialog titel={t.titel} breite={720} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{useTexte().gemeinsam.schliessen}</Button>}>
    <SuchFelder suche={suche} setSuche={w => {setSuche(w);setAktiv(0);}} ersatz={ersatz} setErsatz={setErsatz} optionen={optionen} setOptionen={o => {setOptionen(o);setAktiv(0);}} enter={r => setAktiv((index+(r ? -1 : 1)+treffer.length)%Math.max(1,treffer.length))} />
    <div className="pw-suche__aktionen">
      <span role="status" className="pw-suche__status">{!suche ? t.leer : !treffer.length ? t.keine : f(t.zahl,{n:treffer.length})}</span>
      <Button disabled={gesperrt || !treffer.length} onClick={() => void ersetzen(false)}>{t.ersetzen}</Button>
      <Button disabled={gesperrt || !treffer.length} onClick={() => void ersetzen(true)}>{t.alle}</Button>
      <Button disabled={gesperrt || !aktion.kannUndo} onClick={() => void aktion.undo().catch(e => setMeldung(e.message))}>{t.undo}</Button>
    </div>
    {meldung && <p role="status">{meldung}</p>}
    <div className="pw-suche__liste">
      {(['manuskript','plan','notizen'] as const).map(b => {
        const liste = treffer.filter(x => x.feld.bereich === b);
        return liste.length ? <section key={b} aria-label={t.bereiche[b]}>
          <h2>{t.bereiche[b]}</h2>
          {liste.map(x => <button key={`${x.feld.pfad.join('/')}@${x.start}`} className="pw-suche__treffer" aria-current={treffer[index] === x} onClick={() => oeffnen(x)}>
            <strong>{x.feld.kapitel ? f(t.kapitelTreffer,{nr:x.feld.nummer!,titel:x.feld.titel}) : x.feld.titel}</strong>
            <small>{f(t.feld,{feld:x.feld.pfad.slice(2).join(' / ') || x.feld.pfad.join(' / ')})}</small>
            <span>{x.kontext}</span>
          </button>)}
        </section> : null;
      })}
    </div>
  </Dialog>;
}
