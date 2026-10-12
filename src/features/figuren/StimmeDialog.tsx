/**
 * Dialog „stimme-pruefen“ (G3): Figurenstimme einer Figur prüfen lassen – Figur wählen, Kosten schätzen, starten,
 * Ergebnis zusammenfassen. Die KI meldet nur Beobachtungen mit Zitaten, keine Formulierungen. Besitzer: G3.
 * Parameter: { figur?: Id } (sonst die gewählte Figur).
 */
import { useEffect, useMemo, useState } from 'react';
import { redeDerFigur } from '@core/figuren/index';
import { EFFORT, kiEndpoint, STIMME_MIN_REDE, type Schaetzung, type StimmenAuftrag } from '@core/ki/index';
import type { Id } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { f as fmt, useTexte, vergleich } from '../../i18n';
import { kostenBetrag, kostenWert } from '../ki/kosten';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog } from '../../ui';
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

export default function StimmeDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const auswahlFigur = useStore((s) => s.auswahl.figur);
  const backendArt = useStore((s) => s.backend?.art);
  const fb = useStore((s) => s.figurenbogen);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte();
  const td = t.figuren.stimmeDialog;

  const paramFigur = param && typeof param === 'object' && typeof (param as { figur?: unknown }).figur === 'string' ? (param as { figur: string }).figur : undefined;
  const figuren = daten ? Object.values(daten.figuren).sort((a, b) => vergleich(a.name, b.name)) : [];
  const start = [paramFigur, auswahlFigur, fb.stimmeLauf?.figur].find((id) => id && daten?.figuren[id]) ?? figuren.find((f) => f.rolle === 'haupt')?.id ?? figuren[0]?.id;
  const [figur, setFigur] = useState<Id | undefined>(fb.stimmeLauf?.figur ?? start);
  const [tiefencheck, setTiefencheck] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  useEffect(() => {
    useStore.getState().figurenbogen.stimmeZuruecksetzen();
  }, []);

  const f = figur ? daten?.figuren[figur] : undefined;
  const rede = useMemo(() => (daten && figur ? redeDerFigur(daten, figur) : null), [daten, figur]);
  const auftrag = useMemo<StimmenAuftrag | null>(() => (figur ? { figur, ...(tiefencheck ? { tiefencheck: true } : {}) } : null), [figur, tiefencheck]);
  const lauf = fb.stimmeLauf;
  const ergebnis = fb.stimmeErgebnis;
  const phase = lauf ? 'laeuft' : ergebnis ? 'fertig' : 'vorbereiten';

  useEffect(() => {
    if (phase !== 'vorbereiten' || !auftrag || !daten) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    useStore
      .getState()
      .figurenbogen.stimmeSchaetzen(auftrag)
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
        <p className="pw-ki-text">{daten ? td.keineFiguren : td.keinProjekt}</p>
      </Dialog>
    );
  }

  const aufKarte = (id: Id) => {
    oeffne('figuren', { figur: id });
    fb.setzeFigurenAnsicht('karte');
    fb.setzeStimmeSpalte(true);
    schliessen();
  };

  if (phase === 'laeuft' && lauf) {
    const name = daten.figuren[lauf.figur]?.name ?? lauf.figur;
    return (
      <Dialog
        titel={td.titel}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{td.hintergrund}</Button>
            <Button onClick={fb.stimmeAbbrechen}>{t.gemeinsam.abbrechen}</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{fmt(td.liestAlle, { name })}</p>
          <div className="pw-ki-balken" role="progressbar" aria-label={td.laeuftLabel} aria-valuetext={td.laeuft}>
            <span style={{ width: '60%' }} />
          </div>
          <p className="pw-ki-klein">{td.eineAnfrage}</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    const name = daten.figuren[ergebnis.figur]?.name ?? ergebnis.figur;
    return (
      <Dialog
        titel={fmt(td.geprueft, { name })}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>
            <Button variante="primaer" autoFocus onClick={() => aufKarte(ergebnis.figur)}>
              {td.aufKarte}
            </Button>
          </>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{fmt(td.offen, { n: ergebnis.offen })}</span>
          <span className="pw-ki-text">
            {fmt(td.neu, { n: ergebnis.neu })}
            {ergebnis.bereitsEntschieden > 0 && ` · ${fmt(td.bereits, { n: ergebnis.bereitsEntschieden })}`}
            {` · ${fmt(td.verworfen, { n: ergebnis.verworfen.length })}`}
          </span>
        </div>
        {ergebnis.zuWenigRede && (
          <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="status">
            {fmt(td.zuWenig, { name })}
          </div>
        )}
        {ergebnis.vage && <p className="pw-ki-klein">{fmt(td.vageErgebnis, { name })}</p>}
        <dl className="pw-ki-zeilen">
          <dt>{td.redestellen}</dt>
          <dd>{fmt(td.lokalZugeordnet, { n: Math.round(ergebnis.redestellen) })}</dd>
          <dt>{td.modell}</dt>
          <dd>{ergebnis.modell}</dd>
          <dt>{td.kosten}</dt>
          <dd>{kostenBetrag(ergebnis)}</dd>
        </dl>
        {ergebnis.verworfen.length > 0 && (
          <details className="pw-ki-details">
            <summary>{td.gruende}</summary>
            <ul className="pw-ki-gruende">
              {ergebnis.verworfen.map((v, i) => (
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
  return (
    <Dialog
      titel={td.titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!auftrag || !s || schaetzung.laedt || !!schaetzung.fehler || endpointFehlt} onClick={() => auftrag && void fb.stimmePruefen(auftrag)}>
            {td.starten}
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">{td.intro}</p>
      {fb.stimmeFehler && <FehlerKasten fehler={fb.stimmeFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: td.keinEndpoint }} einstellungen={einstellungenOeffnen} />}

      <div className="pw-feld">
        <label className="pw-feld__label" htmlFor="stimme-figur">
          {td.figur}
        </label>
        <select id="stimme-figur" className="pw-textfeld" value={figur ?? ''} onChange={(e) => setFigur(e.target.value)} data-autofocus>
          {figuren.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.existenz === 'bewusst_vage' ? ` (${t.gemeinsam.realitaet.bewusst_vage})` : ''}
            </option>
          ))}
        </select>
      </div>
      {rede && f && (
        <p className="pw-ki-klein">
          {fmt(td.lokal, { stellen: fmt(t.figuren.stimme.redestellen, { n: rede.stellen.length }), name: f.name })}
          {rede.stellen.length < STIMME_MIN_REDE && ` ${td.zuWenigHinweis}`}
        </p>
      )}
      {f?.existenz === 'bewusst_vage' && (
        <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="note">
          {fmt(td.vageHinweis, { name: f.name })}
        </div>
      )}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        {td.tiefencheck}
      </Checkbox>

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
