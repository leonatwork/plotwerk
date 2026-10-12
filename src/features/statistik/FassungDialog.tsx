/**
 * Dialog „fassung“: benannten Schnappschuss anlegen („Fassung vor Lektorat“). Besitzer: G5.
 * param: { kapitel?: Id } – schlägt „nur dieses Kapitel“ vor.
 */
import type { Id } from '@core/model/types';
import { kapitelFuerFassung } from '@core/statistik';
import { useId, useMemo, useState } from 'react';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, useTexte } from '../../i18n';
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
  const tt = useTexte();
  const t = tt.statistik.dialog;

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
      titel={t.titel}
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
            {tt.gemeinsam.abbrechen}
          </Button>
          <Button variante="primaer" type="submit" form={formId} disabled={!bereit}>
            {laeuft ? t.sichert : f(t.kapitelSichern, { n: anzahl })}
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
          {t.erklaerung}
        </p>
        {mitText.length === 0 ? (
          <p className="pw-st-leise" style={{ margin: 0 }}>
            {t.keinText}
          </p>
        ) : (
          <>
            <Feld label={t.name}>
              {(id) => <Textfeld id={id} data-autofocus placeholder={t.namePlatzhalter} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
            </Feld>
            <Feld label={t.notiz}>
              {(id) => <Textbereich id={id} rows={2} placeholder={t.notizPlatzhalter} value={notiz} onChange={(e) => setNotiz(e.target.value)} />}
            </Feld>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <legend className="pw-feld__label" style={{ padding: 0, marginBottom: 4 }}>
                {t.umfang}
              </legend>
              <Radio name={gruppe} checked={umfang === 'buch'} onChange={() => setUmfang('buch')}>
                {f(t.ganzesBuch, { kapitel: f(tt.statistik.fassungen.kapitelAnzahl, { n: mitText.length }) })}
              </Radio>
              {aktuelles && (
                <Radio name={gruppe} checked={umfang === 'kapitel'} onChange={() => setUmfang('kapitel')}>
                  {f(t.nur, { kapitel: kapitelAnzeige(daten, aktuelles) })}
                </Radio>
              )}
              <Radio name={gruppe} checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')}>
                {t.auswaehlen}
              </Radio>
            </fieldset>
            {umfang === 'auswahl' && (
              <div className="pw-st-auswahlliste" role="group" aria-label={t.auswahlListe}>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <Button variante="text" klein onClick={() => setAuswahl(new Set(mitText))}>
                    {t.alle}
                  </Button>
                  <Button variante="text" klein onClick={() => setAuswahl(new Set())}>
                    {t.keine}
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
