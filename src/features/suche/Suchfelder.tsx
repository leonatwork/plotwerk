import type { SuchOptionen } from '@core/suche';
import { useTexte } from '../../i18n';
import { Checkbox, Feld, Textfeld } from '../../ui';

export function Suchfelder({ suche, ersatz, optionen, setSuche, setErsatz, setOptionen, weiter }: {
  suche: string; ersatz: string; optionen: SuchOptionen;
  setSuche(s: string): void; setErsatz(s: string): void; setOptionen(o: SuchOptionen): void; weiter(richtung: number): void;
}) {
  const t = useTexte().suche;
  return <>
    <div className="pw-suche-felder">
      <Feld label={t.suchen}>{id => <Textfeld id={id} type="search" autoFocus value={suche} onChange={e => setSuche(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); weiter(e.shiftKey ? -1 : 1); }
      }} />}</Feld>
      <Feld label={t.ersatz}>{id => <Textfeld id={id} value={ersatz} onChange={e => setErsatz(e.target.value)} />}</Feld>
    </div>
    <div className="pw-suche-optionen">
      <Checkbox checked={!!optionen.ganzesWort} onChange={e => setOptionen({ ...optionen, ganzesWort: e.target.checked })}>{t.wort}</Checkbox>
      <Checkbox checked={!!optionen.caseSensitiv} onChange={e => setOptionen({ ...optionen, caseSensitiv: e.target.checked })}>{t.case}</Checkbox>
    </div>
  </>;
}
