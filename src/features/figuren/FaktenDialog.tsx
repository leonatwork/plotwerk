/**
 * Dialog „figurenfakten“ (F-17): Angaben über Figuren aus dem Text sammeln lassen – eine Figur oder alle, Kosten
 * schätzen, starten, Ergebnis zusammenfassen. Die KI sammelt nur, was der Text sagt (mit Zitat); Widersprüche
 * findet die App. Parameter: { figur?: Id }.
 */
import { useEffect, useMemo, useState } from 'react';
import { EFFORT, formatiereUsd, kiEndpoint, type FaktenAuftrag, type Schaetzung } from '@core/ki/index';
import type { Id } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { f as fmt, sprache, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog } from '../../ui';
import '../ki/ki.css';

const ALLE = '';

function FehlerKasten({ fehler, einstellungen }: { fehler: KiFehlerAnzeige; einstellungen(): void }) {
  const t = useTexte();
  return (
    <div className="pw-ki-hinweis" role="alert">
      <span>{fehler.text}</span>
      {fehler.art === 'nicht_bereit' && (
        <Button klein onClick={einstellungen}>
          {t.gemeinsam.einstellungenOeffnen}
        </Button>
      )}
    </div>
  );
}

export default function FaktenDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backendArt = useStore((s) => s.backend?.art);
  const fb = useStore((s) => s.figurenbogen);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte();
  const td = t.figuren.faktenDialog;
  const ts = t.figuren.stimmeDialog;

  const paramFigur = param && typeof param === 'object' && typeof (param as { figur?: unknown }).figur === 'string' ? (param as { figur: string }).figur : undefined;
  const figuren = daten ? Object.values(daten.figuren).sort((a, b) => vergleich(a.name, b.name)) : [];
  const [figur, setFigur] = useState<Id>(paramFigur && daten?.figuren[paramFigur] ? paramFigur : ALLE);
  const [tiefencheck, setTiefencheck] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  useEffect(() => {
    useStore.getState().figurenbogen.faktenZuruecksetzen();
  }, []);

  const auftrag = useMemo<FaktenAuftrag>(() => ({ ...(figur ? { figur } : {}), ...(tiefencheck ? { tiefencheck: true } : {}) }), [figur, tiefencheck]);
  const lauf = fb.faktenLauf;
  const ergebnis = fb.faktenErgebnis;
  const phase = lauf ? 'laeuft' : ergebnis ? 'fertig' : 'vorbereiten';

  useEffect(() => {
    if (phase !== 'vorbereiten' || !daten) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    useStore
      .getState()
      .figurenbogen.faktenSchaetzen(auftrag)
      .then(
        (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
        (e) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
      );
    return () => {
      aktiv = false;
    };
  }, [auftrag, phase, daten]);

  const einstellungenOeffnen = () => oeffneDialog('ki-einstellungen');
  const endpointFehlt = backendArt === 'tauri' && !kiEndpoint(kiEinstellungen());

  if (!daten || figuren.length === 0) {
    return (
      <Dialog titel={td.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="pw-ki-text">{daten ? ts.keineFiguren : ts.keinProjekt}</p>
      </Dialog>
    );
  }

  if (phase === 'laeuft' && lauf) {
    return (
      <Dialog
        titel={td.titel}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{ts.hintergrund}</Button>
            <Button onClick={fb.faktenAbbrechen}>{t.gemeinsam.abbrechen}</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{lauf.figur ? fmt(td.liestEine, { name: daten.figuren[lauf.figur]?.name ?? lauf.figur }) : td.liestAlle}</p>
          <div className="pw-ki-balken" role="progressbar" aria-label={ts.laeuftLabel} aria-valuetext={ts.laeuft}>
            <span style={{ width: '60%' }} />
          </div>
          <p className="pw-ki-klein">{ts.eineAnfrage}</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    const ziel = ergebnis.figur ?? figuren.find((x) => x.rolle === 'haupt')?.id;
    return (
      <Dialog
        titel={td.fertig}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>
            {ziel && (
              <Button
                variante="primaer"
                autoFocus
                onClick={() => {
                  oeffne('figuren', { figur: ziel });
                  fb.setzeFigurenAnsicht('karte');
                  schliessen();
                }}
              >
                {ts.aufKarte}
              </Button>
            )}
          </>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{fmt(td.angaben, { n: ergebnis.angaben })}</span>
          <span className="pw-ki-text">
            {fmt(ts.neu, { n: ergebnis.neu })} · {fmt(ts.verworfen, { n: ergebnis.verworfen.length })}
          </span>
        </div>
        <p className="pw-ki-klein">{td.widersprueche}</p>
        <dl className="pw-ki-zeilen">
          <dt>{ts.modell}</dt>
          <dd>{ergebnis.modell}</dd>
          <dt>{ts.kosten}</dt>
          <dd>{formatiereUsd(ergebnis.kostenUsd, sprache())}</dd>
        </dl>
        {ergebnis.verworfen.length > 0 && (
          <details className="pw-ki-details">
            <summary>{ts.gruende}</summary>
            <ul className="pw-ki-gruende">
              {ergebnis.verworfen.map((v, i) => (
                <li key={i}>{v.grund}</li>
              ))}
            </ul>
          </details>
        )}
      </Dialog>
    );
  }

  const s = schaetzung.wert;
  return (
    <Dialog
      titel={td.titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!s || schaetzung.laedt || !!schaetzung.fehler || endpointFehlt} onClick={() => void fb.faktenSammeln(auftrag)}>
            {td.starten}
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">{td.intro}</p>
      {fb.faktenFehler && <FehlerKasten fehler={fb.faktenFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: ts.keinEndpoint }} einstellungen={einstellungenOeffnen} />}

      <div className="pw-feld">
        <label className="pw-feld__label" htmlFor="fakten-figur">
          {ts.figur}
        </label>
        <select id="fakten-figur" className="pw-textfeld" value={figur} onChange={(e) => setFigur(e.target.value)} data-autofocus>
          <option value={ALLE}>{td.alle}</option>
          {figuren.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        {ts.tiefencheck}
      </Checkbox>

      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">{ts.schaetzen}</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>{ts.modell}</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>{ts.eingabe}</dt>
              <dd>{fmt(ts.eingabeWert, { n: Math.round(s.eingabeTokens) })}</dd>
              <dt>{ts.ausgabe}</dt>
              <dd>{fmt(ts.ausgabeWert, { n: Math.round(s.ausgabeTokens) })}</dd>
              <dt>{ts.kosten}</dt>
              <dd>{fmt(ts.kostenWert, { usd: formatiereUsd(s.kostenUsd, sprache()) })}</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-ki-klein">{ts.nichtGezaehlt}</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-ki-klein">{ts.demo}</p>}
    </Dialog>
  );
}
