/**
 * Dialog „straenge-vorschlagen“ (G2): Kosten schätzen, KI-Lauf starten, Ergebnis zusammenfassen. Die Vorschläge
 * selbst stehen danach im Inspektor des Segments „Stränge“ und im Kapitel-Inspektor. Besitzer: G2.
 */
import { useEffect, useState } from 'react';
import { EFFORT, kiEndpoint, type Schaetzung } from '@core/ki/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { f as fmt, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button, Dialog } from '../../ui';
import { kostenBetrag, kostenWert } from '../ki/kosten';
import '../ki/ki.css';

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

export default function StraengeDialog({ schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backendArt = useStore((s) => s.backend?.art);
  const st = useStore((s) => s.struktur);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte();
  const td = t.faeden.dialog;
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  useEffect(() => {
    useStore.getState().struktur.strangZuruecksetzen();
  }, []);

  const phase = st.strangLauf ? 'laeuft' : st.strangErgebnis ? 'fertig' : 'vorbereiten';

  useEffect(() => {
    if (phase !== 'vorbereiten' || !daten) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    useStore
      .getState()
      .struktur.strangSchaetzen()
      .then(
        (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
        (e) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
      );
    return () => {
      aktiv = false;
    };
    // Schätzung nur beim Öffnen und nach einem Lauf, nicht bei jeder Datenänderung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, !!daten]);

  const einstellungenOeffnen = () => oeffneDialog('ki-einstellungen');
  const endpointFehlt = backendArt === 'tauri' && !kiEndpoint(kiEinstellungen());

  if (!daten) {
    return (
      <Dialog titel={td.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="pw-ki-text">{td.keinProjekt}</p>
      </Dialog>
    );
  }

  const ansehen = () => {
    oeffne('akte');
    st.setzeAkteDarstellung('straenge');
    st.waehleStrang(null);
    schliessen();
  };

  if (phase === 'laeuft') {
    return (
      <Dialog
        titel={td.titel}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{td.hintergrund}</Button>
            <Button onClick={st.strangAbbrechen}>{t.gemeinsam.abbrechen}</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{td.liest}</p>
          <div className="pw-ki-balken" role="progressbar" aria-label={td.laeuftLabel} aria-valuetext={td.laeuft}>
            <span style={{ width: '60%' }} />
          </div>
          <p className="pw-ki-klein">{td.eineAnfrage}</p>
        </div>
      </Dialog>
    );
  }

  const e = st.strangErgebnis;
  if (phase === 'fertig' && e) {
    return (
      <Dialog
        titel={td.fertig}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>
            <Button variante="primaer" autoFocus onClick={ansehen}>
              {td.ansehen}
            </Button>
          </>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{fmt(td.offen, { n: e.offen })}</span>
          <span className="pw-ki-text">
            {fmt(td.neu, { n: e.neu })}
            {e.bereitsEntschieden > 0 && ` · ${fmt(td.bereits, { n: e.bereitsEntschieden })}`}
            {` · ${fmt(td.verworfen, { n: e.verworfen.length })}`}
          </span>
        </div>
        <dl className="pw-ki-zeilen">
          <dt>{td.modell}</dt>
          <dd>{e.modell}</dd>
          <dt>{td.kosten}</dt>
          <dd>{kostenBetrag(e)}</dd>
        </dl>
        {e.verworfen.length > 0 && (
          <details className="pw-ki-details">
            <summary>{td.gruende}</summary>
            <ul className="pw-ki-gruende">
              {e.verworfen.map((v, i) => (
                <li key={i}>{v.grund}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="pw-ki-klein">{td.verworfenRegel}</p>
      </Dialog>
    );
  }

  const s = schaetzung.wert;
  const antworten = (daten.kiStrangVorschlaege?.eintraege ?? []).filter((v) => v.art === 'frage' && v.status === 'uebernommen' && v.antwort).length;
  return (
    <Dialog
      titel={td.titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!s || schaetzung.laedt || !!schaetzung.fehler || endpointFehlt} onClick={() => void st.strangVorschlagen()}>
            {td.starten}
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">{td.intro}</p>
      {st.strangFehler && <FehlerKasten fehler={st.strangFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: td.keinEndpoint }} einstellungen={einstellungenOeffnen} />}
      <p className="pw-ki-klein">
        {daten.straenge.length ? fmt(td.straenge, { n: daten.straenge.length }) : td.keineStraenge}
        {antworten > 0 && ` · ${fmt(td.antworten, { n: antworten })}`}
      </p>
      <p className="pw-ki-klein">{td.mitgeschickt}</p>

      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">{td.schaetzen}</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>{td.modell}</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>{td.eingabe}</dt>
              <dd>{fmt(td.eingabeWert, { n: Math.round(s.eingabeTokens) })}</dd>
              <dt>{td.ausgabe}</dt>
              <dd>{fmt(td.ausgabeWert, { n: Math.round(s.ausgabeTokens) })}</dd>
              <dt>{td.kosten}</dt>
              <dd>{kostenWert(s, td.kostenWert, 'usd')}</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-ki-klein">{td.nichtGezaehlt}</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-ki-klein">{td.demo}</p>}
    </Dialog>
  );
}
