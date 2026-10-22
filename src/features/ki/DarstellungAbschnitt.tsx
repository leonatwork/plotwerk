import { DARSTELLUNGS_BEREICHE, SKALIERUNGEN, STANDARD_DARSTELLUNG } from '@core/darstellung';
import { useTexte, zahl } from '../../i18n';
import { setzeDarstellung, useDarstellungsStore } from '../../state/darstellung';
import { Abschnittslabel, Button, Feld, Textfeld } from '../../ui';
import { useEffect, useState } from 'react';

function DarstellungsFeld({ feld, label, wert }: { feld: keyof typeof DARSTELLUNGS_BEREICHE; label: string; wert: number }) {
  const [eingabe, setEingabe] = useState(String(wert));
  useEffect(() => setEingabe(String(wert)), [wert]);
  const bereich = DARSTELLUNGS_BEREICHE[feld];
  return <Feld label={label}>{(id) => <Textfeld id={id} type="number" {...bereich} value={eingabe}
    onChange={(e) => {
      setEingabe(e.target.value);
      const v = e.target.valueAsNumber;
      // Zwischenstände wie leer oder „2“ beim Tippen von „20“ bleiben editierbar.
      if (Number.isFinite(v) && v >= bereich.min && v <= bereich.max) void setzeDarstellung({ [feld]: v });
    }}
    onBlur={() => {
      void setzeDarstellung({ [feld]: eingabe.trim() ? Number(eingabe) : NaN });
      setEingabe(String(useDarstellungsStore.getState().werte[feld]));
    }} />}</Feld>;
}

export function DarstellungAbschnitt() {
  const t = useTexte().app.darstellung;
  const werte = useDarstellungsStore((s) => s.werte);
  return (
    <section className="pw-ki-abschnitt" aria-labelledby="einstellungen-darstellung">
      <Abschnittslabel as="h3" id="einstellungen-darstellung">{t.abschnitt}</Abschnittslabel>
      <div className="pw-ki-felder pw-ki-felder--drei">
        {(Object.keys(DARSTELLUNGS_BEREICHE) as (keyof typeof DARSTELLUNGS_BEREICHE)[]).map((feld) => (
          <DarstellungsFeld key={feld} feld={feld} label={t[feld]} wert={werte[feld]} />
        ))}
      </div>
      <Feld label={t.skalierung}>
        {(id) => <select id={id} className="pw-ki-select" value={werte.skalierung}
          onChange={(e) => void setzeDarstellung({ skalierung: Number(e.target.value) })}>
          {SKALIERUNGEN.map((s) => <option key={s} value={s}>{zahl(s * 100)} %</option>)}
        </select>}
      </Feld>
      <p className="pw-ki-klein">{t.erklaerung}</p>
      <Button klein onClick={() => void setzeDarstellung({ ...STANDARD_DARSTELLUNG })}>{t.zuruecksetzen}</Button>
    </section>
  );
}
