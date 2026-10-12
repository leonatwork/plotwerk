/**
 * Dialog „stimme-pruefen“ (G3): Figurenstimme einer Figur prüfen lassen – Figur wählen, Kosten schätzen, starten,
 * Ergebnis zusammenfassen. Die KI meldet nur Beobachtungen mit Zitaten, keine Formulierungen. Besitzer: G3.
 * Parameter: { figur?: Id } (sonst die gewählte Figur).
 */
import { useEffect, useMemo, useState } from 'react';
import { redeDerFigur } from '@core/figuren/index';
import { EFFORT, formatiereUsd, kiEndpoint, STIMME_MIN_REDE, type Schaetzung, type StimmenAuftrag } from '@core/ki/index';
import type { Id } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog } from '../../ui';
import '../ki/ki.css';

const zahl = (n: number) => Math.round(n).toLocaleString('de-DE');

function FehlerKasten({ fehler, einstellungen }: { fehler: KiFehlerAnzeige; einstellungen(): void }) {
  return (
    <div className="pw-ki-hinweis" role="alert">
      <span>{fehler.text}</span>
      {fehler.art === 'nicht_bereit' && (
        <Button klein onClick={einstellungen}>
          Einstellungen öffnen
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

  const paramFigur = param && typeof param === 'object' && typeof (param as { figur?: unknown }).figur === 'string' ? (param as { figur: string }).figur : undefined;
  const figuren = daten ? Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de')) : [];
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
      <Dialog titel="Figurenstimme prüfen" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-ki-text">{daten ? 'Es gibt noch keine Figuren.' : 'Öffne zuerst ein Projekt.'}</p>
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
        titel="Figurenstimme prüfen"
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>Im Hintergrund weiter</Button>
            <Button onClick={fb.stimmeAbbrechen}>Abbrechen</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">Die KI liest alle Stellen, an denen {name} spricht oder schreibt …</p>
          <div className="pw-ki-balken" role="progressbar" aria-label="Prüfung läuft" aria-valuetext="läuft">
            <span style={{ width: '60%' }} />
          </div>
          <p className="pw-ki-klein">Eine Anfrage für das ganze Buch. Die KI ändert keinen Text.</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    const name = daten.figuren[ergebnis.figur]?.name ?? ergebnis.figur;
    return (
      <Dialog
        titel={`Stimme von ${name} geprüft`}
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>Schließen</Button>
            <Button variante="primaer" autoFocus onClick={() => aufKarte(ergebnis.figur)}>
              Auf der Karte ansehen
            </Button>
          </>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{ergebnis.offen === 1 ? '1 Beobachtung offen' : `${ergebnis.offen} Beobachtungen offen`}</span>
          <span className="pw-ki-text">
            {ergebnis.neu === 1 ? '1 neu' : `${ergebnis.neu} neu`}
            {ergebnis.bereitsEntschieden > 0 && ` · ${ergebnis.bereitsEntschieden} bereits entschieden`}
            {` · ${ergebnis.verworfen.length} verworfen`}
          </span>
        </div>
        {ergebnis.zuWenigRede && (
          <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="status">
            {name} spricht zu wenig, um eine typische Stimme zu erkennen.
          </div>
        )}
        {ergebnis.vage && <p className="pw-ki-klein">{name} ist bewusst vage angelegt: Nur deutliche Auffälligkeiten wurden behalten.</p>}
        <dl className="pw-ki-zeilen">
          <dt>Redestellen</dt>
          <dd>{zahl(ergebnis.redestellen)} lokal zugeordnet</dd>
          <dt>Modell</dt>
          <dd>{ergebnis.modell}</dd>
          <dt>Kosten</dt>
          <dd>{formatiereUsd(ergebnis.kostenUsd)}</dd>
        </dl>
        {ergebnis.verworfen.length > 0 && (
          <details className="pw-ki-details">
            <summary>Gründe für Verworfenes anzeigen</summary>
            <ul className="pw-ki-gruende">
              {ergebnis.verworfen.map((v, i) => (
                <li key={i}>{v.grund}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="pw-ki-klein">Verworfen wird, was kein wörtliches Zitat hat, eine Formulierung vorschlägt oder dieselbe Stelle als Vergleich nennt.</p>
      </Dialog>
    );
  }

  const s = schaetzung.wert;
  return (
    <Dialog
      titel="Figurenstimme prüfen"
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>Abbrechen</Button>
          <Button variante="primaer" disabled={!auftrag || !s || schaetzung.laedt || !!schaetzung.fehler || endpointFehlt} onClick={() => auftrag && void fb.stimmePruefen(auftrag)}>
            Prüfung starten
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">
        Die KI liest die wörtliche Rede einer Figur im ganzen Buch und meldet Stellen, an denen sie in Ton, Wortwahl oder Anrede auffällig anders klingt – mit
        Zitaten aus beiden Stellen. Sie schlägt keine Formulierungen vor und ändert keinen Text.
      </p>
      {fb.stimmeFehler && <FehlerKasten fehler={fb.stimmeFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: 'Es ist noch kein Foundry-Endpoint eingetragen.' }} einstellungen={einstellungenOeffnen} />}

      <div className="pw-feld">
        <label className="pw-feld__label" htmlFor="stimme-figur">
          Figur
        </label>
        <select id="stimme-figur" className="pw-textfeld" value={figur ?? ''} onChange={(e) => setFigur(e.target.value)} data-autofocus>
          {figuren.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.existenz === 'bewusst_vage' ? ' (bewusst vage)' : ''}
            </option>
          ))}
        </select>
      </div>
      {rede && f && (
        <p className="pw-ki-klein">
          Lokal gefunden: {rede.stellen.length === 1 ? '1 Redestelle' : `${rede.stellen.length} Redestellen`} von {f.name} (Zuordnung geschätzt).
          {rede.stellen.length < STIMME_MIN_REDE && ' Das ist vermutlich zu wenig für einen Vergleich – die KI sagt es dann.'}
        </p>
      )}
      {f?.existenz === 'bewusst_vage' && (
        <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="note">
          {f.name} ist bewusst vage angelegt. Gemeldet werden nur sehr deutliche Brüche, vorsichtig formuliert.
        </div>
      )}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        Tiefencheck mit Opus – gründlicher, teurer
      </Checkbox>

      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">Tokens werden geschätzt …</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>Modell</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>Eingabe</dt>
              <dd>≈ {zahl(s.eingabeTokens)} Tokens (ganzes Buch)</dd>
              <dt>Ausgabe</dt>
              <dd>≈ {zahl(s.ausgabeTokens)} Tokens</dd>
              <dt>Kosten</dt>
              <dd>{formatiereUsd(s.kostenUsd)} (grob, Listenpreis)</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-ki-klein">count_tokens war nicht erreichbar, geschätzt über die Zeichenzahl.</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-ki-klein">Browser-Demo: Die Antworten kommen vom Demo-Transport, es gehen keine Daten ins Netz.</p>}
    </Dialog>
  );
}
