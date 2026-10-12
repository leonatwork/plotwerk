/** Dialog „Prüfen“: Umfang, Tiefencheck, Schätzung vor dem Start, Fortschritt, Ergebnis. */
import { useEffect, useMemo, useState } from 'react';
import { EFFORT, formatiereUsd, kiEndpoint, type PruefAuftrag, type Schaetzung } from '@core/ki/index';
import type { Id } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, useTexte, zahl as zahlFormat, sprache } from '../../i18n';
import { kiFehlerAnzeige, type KiErgebnis, type KiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog, Segment } from '../../ui';
import './ki.css';
import { useFunktion } from '../../state/funktionen';

/** Ganze Zahl im Format der Oberflächensprache (Tokens, Zähler). */
const zahl = (n: number) => zahlFormat(Math.round(n));

function leseParam(param: unknown): { umfang?: 'kapitel' | 'buch'; kapitel?: Id; tiefencheck?: boolean } {
  if (!param || typeof param !== 'object') return {};
  const p = param as Record<string, unknown>;
  return {
    umfang: p.umfang === 'buch' || p.umfang === 'kapitel' ? p.umfang : undefined,
    kapitel: typeof p.kapitel === 'string' ? p.kapitel : undefined,
    tiefencheck: p.tiefencheck === true,
  };
}

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

export function PruefDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const auswahlKapitel = useStore((s) => s.auswahl.kapitel);
  const backendArt = useStore((s) => s.backend?.art);
  const lauf = useStore((s) => s.kiLauf);
  const ergebnis = useStore((s) => s.kiErgebnis);
  const laufFehler = useStore((s) => s.kiFehler);
  const kiSchaetzen = useStore((s) => s.kiSchaetzen);
  const kiPruefen = useStore((s) => s.kiPruefen);
  const kiAbbrechen = useStore((s) => s.kiAbbrechen);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const setzeBereich = useStore((s) => s.setzeBereich);
  const t = useTexte();
  const T = t.ki.pruefen;

  const p = leseParam(param);
  const kandidat = p.kapitel ?? auswahlKapitel;
  const kapitelId = kandidat && daten?.kapitel[kandidat] ? kandidat : undefined;
  const nr = kapitelId && daten ? daten.projekt.kapitel.indexOf(kapitelId) + 1 : 0;
  const titel = kapitelId ? (daten?.kapitel[kapitelId]?.titel ?? kapitelId) : '';

  const [umfang, setUmfang] = useState<'kapitel' | 'buch'>(p.umfang === 'buch' || !kapitelId ? 'buch' : 'kapitel');
  const [tiefencheckGewaehlt, setTiefencheck] = useState(p.tiefencheck ?? false);
  // Funktionsumfang (E15): Tiefencheck nur, wenn eingeblendet; ohne Plan-Abgleich gehen keine Plan-Felder mit
  const mitTiefencheck = useFunktion('kiTiefencheck');
  const mitPlan = useFunktion('kiPlanAbgleich');
  const tiefencheck = tiefencheckGewaehlt && mitTiefencheck;
  const [erzwingen, setErzwingen] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  const auftrag = useMemo<PruefAuftrag>(
    () => ({
      umfang,
      ...(umfang === 'kapitel' && kapitelId ? { kapitel: kapitelId } : {}),
      ...(tiefencheck ? { tiefencheck: true } : {}),
      ...(erzwingen && !tiefencheck ? { erzwingen: true } : {}),
      ...(mitPlan ? {} : { ohnePlan: true }),
    }),
    [umfang, kapitelId, tiefencheck, erzwingen, mitPlan],
  );

  useEffect(() => {
    useStore.getState().kiZuruecksetzen();
  }, []);

  const phase = lauf ? 'laeuft' : ergebnis ? 'fertig' : 'vorbereiten';

  useEffect(() => {
    if (phase !== 'vorbereiten' || !daten) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    kiSchaetzen(auftrag).then(
      (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
      (e) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
    );
    return () => {
      aktiv = false;
    };
  }, [auftrag, phase, kiSchaetzen, daten]);

  const einstellungenOeffnen = () => oeffneDialog('ki-einstellungen');
  // Foundry braucht einen Endpoint; die Claude API hat eine Standard-Basis-URL.
  const endpointFehlt = backendArt === 'tauri' && !kiEndpoint(kiEinstellungen());

  if (!daten) {
    return (
      <Dialog titel={T.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="pw-ki-text">{T.ohneProjekt}</p>
      </Dialog>
    );
  }

  if (phase === 'laeuft' && lauf) {
    const fs = lauf.fortschritt;
    const gesamt = fs?.gesamt ?? 0;
    const anteil = gesamt ? Math.min(1, (fs?.erledigt ?? 0) / gesamt) : 0;
    const aktuellNr = fs?.kapitel ? daten.projekt.kapitel.indexOf(fs.kapitel) + 1 : 0;
    return (
      <Dialog
        titel={T.titel}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>{T.imHintergrund}</Button>
            <Button onClick={kiAbbrechen}>{t.gemeinsam.abbrechen}</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">
            {fs && fs.kapitel
              ? f(T.fortschritt, { nr: zahl(fs.erledigt + 1), gesamt: zahl(gesamt), kap: aktuellNr, titel: fs.titel })
              : T.vorbereiten}
          </p>
          <div
            className="pw-ki-balken"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={gesamt}
            aria-valuenow={fs?.erledigt ?? 0}
            aria-label={T.fortschrittLabel}
          >
            <span style={{ width: `${Math.max(4, anteil * 100)}%` }} />
          </div>
          <p className="pw-ki-klein">{T.laufHinweis}</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    return <ErgebnisAnsicht ergebnis={ergebnis} schliessen={schliessen} hinweiseAnsehen={() => (setzeBereich('hinweise'), schliessen())} />;
  }

  const s = schaetzung.wert;
  const nichtsZuTun = !!s && s.anfragen === 0;
  const kapitelMitText = daten.projekt.kapitel.filter((id) => daten.kapitel[id]?.text.trim()).length;

  return (
    <Dialog
      titel={T.titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button
            variante="primaer"
            disabled={!s || schaetzung.laedt || !!schaetzung.fehler || nichtsZuTun || endpointFehlt}
            onClick={() => void kiPruefen(auftrag)}
          >
            {T.starten}
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">{T.einleitung}</p>
      {laufFehler && <FehlerKasten fehler={laufFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: T.keinEndpoint }} einstellungen={einstellungenOeffnen} />}

      <Segment
        label={T.umfang}
        rolle="group"
        voll
        groesse="hoch"
        wert={umfang}
        onChange={(w) => setUmfang(w)}
        optionen={[
          ...(kapitelId ? [{ wert: 'kapitel' as const, label: f(T.kapitelOption, { nr, titel }) }] : []),
          { wert: 'buch' as const, label: f(T.buchOption, { n: kapitelMitText }) },
        ]}
      />
      <div className="pw-ki-abschnitt" style={{ gap: 2 }}>
        {mitTiefencheck && (
          <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
            {T.tiefencheck}
          </Checkbox>
        )}
        {!tiefencheck && ((s?.uebersprungen.length ?? 0) > 0 || erzwingen) && (
          <Checkbox checked={erzwingen} onChange={(e) => setErzwingen(e.target.checked)}>
            {T.erzwingen}
          </Checkbox>
        )}
      </div>

      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">{T.schaetzen}</p>
        ) : nichtsZuTun ? (
          <p className="pw-ki-text">{f(T.nichtsZuTun, { n: s.uebersprungen.length })}</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>{T.modell}</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>{T.anfragen}</dt>
              <dd>
                {f(t.ki.kapitelAnzahl, { n: s.anfragen })}
                {s.uebersprungen.length > 0 && f(T.uebersprungen, { n: s.uebersprungen.length })}
              </dd>
              <dt>{T.eingabe}</dt>
              <dd>
                {f(T.tokens, { n: zahl(s.eingabeTokens) })}
                {s.anfragen > 1 && f(T.ausCache, { n: zahl(s.prefixTokens * (s.anfragen - 1)) })}
              </dd>
              <dt>{T.ausgabe}</dt>
              <dd>{f(T.ausgabeWert, { n: zahl(s.ausgabeTokens) })}</dd>
              <dt>{T.kosten}</dt>
              <dd>{f(T.kostenWert, { betrag: formatiereUsd(s.kostenUsd, sprache()) })}</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-ki-klein">{T.nichtGezaehlt}</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-ki-klein">{T.demo}</p>}
    </Dialog>
  );
}

function ErgebnisAnsicht({ ergebnis, schliessen, hinweiseAnsehen }: { ergebnis: KiErgebnis; schliessen(): void; hinweiseAnsehen(): void }) {
  const geprueft = ergebnis.geprueft?.length ?? 0;
  const uebersprungen = ergebnis.uebersprungen?.length ?? 0;
  const tokens = ergebnis.tokens;
  const t = useTexte();
  const T = t.ki.ergebnis;
  return (
    <Dialog
      titel={T.titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>
          <Button variante="primaer" onClick={hinweiseAnsehen}>
            {T.hinweiseAnsehen}
          </Button>
        </>
      }
    >
      {ergebnis.fehler && (
        <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="status">
          {f(T.fehlerGespeichert, { fehler: ergebnis.fehler })}
        </div>
      )}
      <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="pw-ki-zahl">{f(T.neu, { n: ergebnis.neu })}</span>
        <span className="pw-ki-text">
          {f(T.verworfen, { n: ergebnis.verworfen.length })}
          {ergebnis.hinweise.length > ergebnis.neu && f(T.bekannt, { n: ergebnis.hinweise.length - ergebnis.neu })}
          {(ergebnis.bereitsEntschieden ?? 0) > 0 && f(T.entschieden, { n: ergebnis.bereitsEntschieden })}
        </span>
      </div>
      <dl className="pw-ki-zeilen">
        <dt>{T.kapitel}</dt>
        <dd>
          {f(T.geprueft, { n: geprueft })}
          {uebersprungen > 0 && f(t.ki.pruefen.uebersprungen, { n: uebersprungen })}
        </dd>
        <dt>{T.analysen}</dt>
        <dd>{f(T.zusammenfassungen, { n: ergebnis.analysen.length })}</dd>
        <dt>{T.verbrauch}</dt>
        <dd>
          {f(T.verbrauchWert, {
            eingabe: zahl(tokens.eingabe),
            cache: zahl(tokens.cacheGelesen),
            ausgabe: zahl(tokens.ausgabe),
            kosten: formatiereUsd(ergebnis.kostenUsd ?? 0, sprache()),
          })}
        </dd>
      </dl>
      {ergebnis.verworfen.length > 0 && (
        <details className="pw-ki-details">
          <summary>{T.gruende}</summary>
          <ul className="pw-ki-gruende">
            {ergebnis.verworfen.map((v, i) => (
              <li key={i}>{v.grund}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="pw-ki-klein">{T.erklaerung}</p>
    </Dialog>
  );
}

export default PruefDialog;
