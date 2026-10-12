/**
 * Dialog „fassung“: benannten Schnappschuss anlegen („Fassung vor Lektorat“). Besitzer: G5.
 * param: { kapitel?: Id } – schlägt „nur dieses Kapitel“ vor.
 */
import type { Id } from '@core/model/types';
import { kapitelFuerFassung } from '@core/statistik';
import { useId, useMemo, useState } from 'react';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog, Feld, Radio, Textbereich, Textfeld } from '../../ui';
import { kapitelAnzeige } from '../schreiben/verweise';
import './statistik.css';

type Umfang = 'buch' | 'kapitel' | 'auswahl';

export default function FassungDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const bereich = useStore((s) => s.bereich);
  const fassungSichern = useStore((s) => s.statistik.fassungSichern);
  const setzeAnsicht = useStore((s) => s.statistik.setzeAnsicht);
  const vorschlag = (param as { kapitel?: Id } | undefined)?.kapitel ?? (bereich === 'schreiben' ? gewaehlt : undefined);
  const mitText = useMemo(() => (daten ? kapitelFuerFassung(daten) : []), [daten]);
  const aktuelles = vorschlag && mitText.includes(vorschlag) ? vorschlag : undefined;

  const [name, setName] = useState('');
  const [notiz, setNotiz] = useState('');
  const [umfang, setUmfang] = useState<Umfang>('buch');
  const [auswahl, setAuswahl] = useState<Set<Id>>(() => new Set(aktuelles ? [aktuelles] : []));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const gruppe = useId();
  const formId = useId();

  if (!daten) return null;

  const kapitel: Id[] | 'buch' = umfang === 'buch' ? 'buch' : umfang === 'kapitel' && aktuelles ? [aktuelles] : mitText.filter((id) => auswahl.has(id));
  const anzahl = kapitel === 'buch' ? mitText.length : kapitel.length;
  const bereit = name.trim() !== '' && anzahl > 0 && !laeuft;

  const absenden = async () => {
    if (!bereit) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await fassungSichern({ name, notiz, kapitel });
      if (bereich === 'statistik') setzeAnsicht('fassungen');
      schliessen();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(false);
    }
  };

  return (
    <Dialog
      titel="Fassung sichern"
      onSchliessen={schliessen}
      modalFest={laeuft}
      breite={520}
      aktionen={
        <>
          {fehler && (
            <span className="pw-st-fehler" role="alert" style={{ marginRight: 'auto' }}>
              {fehler}
            </span>
          )}
          <Button onClick={schliessen} disabled={laeuft}>
            Abbrechen
          </Button>
          <Button variante="primaer" type="submit" form={formId} disabled={!bereit}>
            {laeuft ? 'Sichert …' : anzahl === 1 ? 'Kapitel sichern' : `${anzahl} Kapitel sichern`}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void absenden();
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Sichert den jetzigen Text unter einem Namen. Benannte Fassungen werden nie automatisch aufgeräumt; du kannst sie später mit dem aktuellen Text vergleichen oder wiederherstellen.
        </p>
        {mitText.length === 0 ? (
          <p className="pw-st-leise" style={{ margin: 0 }}>
            Es gibt noch kein Kapitel mit Text. Sobald du geschrieben hast, kannst du hier eine Fassung sichern.
          </p>
        ) : (
          <>
            <Feld label="Name">
              {(id) => <Textfeld id={id} data-autofocus placeholder="z. B. Fassung vor Lektorat" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
            </Feld>
            <Feld label="Notiz (optional)">
              {(id) => <Textbereich id={id} rows={2} placeholder="Was ist das Besondere an diesem Stand?" value={notiz} onChange={(e) => setNotiz(e.target.value)} />}
            </Feld>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <legend className="pw-feld__label" style={{ padding: 0, marginBottom: 4 }}>
                Umfang
              </legend>
              <Radio name={gruppe} checked={umfang === 'buch'} onChange={() => setUmfang('buch')}>
                Ganzes Buch ({mitText.length === 1 ? '1 Kapitel' : `${mitText.length} Kapitel`} mit Text)
              </Radio>
              {aktuelles && (
                <Radio name={gruppe} checked={umfang === 'kapitel'} onChange={() => setUmfang('kapitel')}>
                  Nur {kapitelAnzeige(daten, aktuelles)}
                </Radio>
              )}
              <Radio name={gruppe} checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')}>
                Kapitel auswählen …
              </Radio>
            </fieldset>
            {umfang === 'auswahl' && (
              <div className="pw-st-auswahlliste" role="group" aria-label="Kapitel für die Fassung">
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <Button variante="text" klein onClick={() => setAuswahl(new Set(mitText))}>
                    Alle
                  </Button>
                  <Button variante="text" klein onClick={() => setAuswahl(new Set())}>
                    Keine
                  </Button>
                </div>
                {mitText.map((id) => (
                  <Checkbox
                    key={id}
                    checked={auswahl.has(id)}
                    onChange={(e) =>
                      setAuswahl((alt) => {
                        const neu = new Set(alt);
                        if (e.target.checked) neu.add(id);
                        else neu.delete(id);
                        return neu;
                      })
                    }
                  >
                    {kapitelAnzeige(daten, id)}
                  </Checkbox>
                ))}
              </div>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}
