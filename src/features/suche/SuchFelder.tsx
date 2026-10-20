import { Checkbox, Feld, Textfeld } from '../../ui';
import { useTexte } from '../../i18n';
import type { SuchOptionen } from '@core/suche';

export function SuchFelder({suche, setSuche, ersatz, setErsatz, optionen, setOptionen, enter}: {
  suche: string; setSuche(w: string): void; ersatz: string; setErsatz(w: string): void;
  optionen: SuchOptionen; setOptionen(w: SuchOptionen): void; enter?(rueckwaerts: boolean): void;
}) {
  const t = useTexte().suche;
  return <>
    <div className="pw-suche__felder">
      <Feld label={t.suchen}>{id => <Textfeld id={id} type="search" value={suche} autoFocus data-autofocus onChange={e => setSuche(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); enter?.(e.shiftKey); }
      }} />}</Feld>
      <Feld label={t.ersatz}>{id => <Textfeld id={id} value={ersatz} onChange={e => setErsatz(e.target.value)} />}</Feld>
    </div>
    <div className="pw-suche__optionen">
      <Checkbox checked={!!optionen.ganzesWort} onChange={e => setOptionen({...optionen,ganzesWort:e.target.checked})}>{t.wort}</Checkbox>
      <Checkbox checked={!!optionen.case} onChange={e => setOptionen({...optionen,case:e.target.checked})}>{t.case}</Checkbox>
    </div>
  </>;
}
