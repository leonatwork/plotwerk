import { useMemo, useState } from 'react';
import { sucheProjekt, type ProjektTreffer, type SuchOptionen } from '@core/suche';
import { ankerErzeugen, klartext } from '@core/text';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Dialog } from '../../ui';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { Suchfelder } from './Suchfelder';
import './suche.css';

export default function Projektsuche({ schliessen }: DialogKomponentenProps) {
  const t = useTexte().suche;
  const d = useStore(s => s.daten);
  const aktion = useStore(s => s.volltext);
  const [suche, setSuche] = useState(''), [ersatz, setErsatz] = useState('');
  const [optionen, setOptionen] = useState<SuchOptionen>({});
  const [aktiv, setAktiv] = useState(0), [fehler, setFehler] = useState<string[]>([]);
  const treffer = useMemo(() => d ? sucheProjekt(d, suche, optionen) : [], [d, suche, optionen]);
  const index = Math.min(aktiv, Math.max(0, treffer.length - 1));
  const weiter = (richtung: number) => setAktiv((index + richtung + treffer.length) % (treffer.length || 1));
  const ersetzen = async (alle: boolean) => {
    if (!treffer.length) return;
    if (alle && !await bestaetigen(f(t.rueckfrage, { n: treffer.length, kapitel: new Set(treffer.filter(x => x.feld.bereich === 'manuskript').map(x => x.feld.kapitel)).size }), { titel: t.bestaetigen, knopf: t.alle })) return;
    const r = await aktion.ersetzen(suche, ersatz, optionen, alle ? {} : { einzeln: treffer[index] });
    setFehler(r.fehler);
  };
  const oeffnen = (x: ProjektTreffer, i: number) => {
    setAktiv(i);
    if (x.feld.bereich !== 'manuskript') return;
    useStore.getState().markiere({ kapitel: x.feld.kapitel!, anker: ankerErzeugen(x.feld.kapitel!, klartext(x.feld.text), x.start, x.ende) });
    schliessen();
  };
  return <Dialog titel={t.projekt} onSchliessen={schliessen} breite={760} modalFest={aktion.laeuft}>
    <div className="pw-projektsuche">
      <Suchfelder {...{ suche, ersatz, optionen, setErsatz, setOptionen, weiter }} setSuche={s => { setSuche(s); setAktiv(0); }} />
      <div className="pw-suche-optionen">
        <span role="status">{!suche ? t.leer : !treffer.length ? t.keine : f(t.treffer, { n: treffer.length })}</span>
        <Button disabled={!treffer.length || aktion.laeuft} onClick={() => void ersetzen(false).catch(e => setFehler([String(e)]))}>{t.ersetzen}</Button>
        <Button disabled={!treffer.length || aktion.laeuft} onClick={() => void ersetzen(true).catch(e => setFehler([String(e)]))}>{t.alle}</Button>
        <Button disabled={!aktion.kannUndo || aktion.laeuft} onClick={() => void aktion.undo().catch(e => setFehler([String(e)]))}>{t.undo}</Button>
      </div>
      {fehler.length > 0 && <div role="alert">{fehler.map((x, i) => <p key={i}>{x}</p>)}</div>}
      <div className="pw-suche-ergebnisse">
        {(['manuskript', 'plan', 'notizen'] as const).map(bereich => <section key={bereich} aria-label={t.bereiche[bereich]}>
          <h3>{t.bereiche[bereich]}</h3>
          {treffer.map((x, i) => x.feld.bereich === bereich && <button key={JSON.stringify(x.feld.pfad) + x.start} className="pw-suche-ergebnis" aria-pressed={i === index} onClick={() => oeffnen(x, i)}>
            <strong>{bereich === 'manuskript' ? f(t.kapitelTreffer, { nr: x.feld.nummer!, titel: x.feld.titel }) : `${x.feld.titel} · ${x.feld.pfad.slice(2).join(' › ')}`}</strong>
            <span>{x.kontext}</span>
          </button>)}
        </section>)}
      </div>
    </div>
  </Dialog>;
}
