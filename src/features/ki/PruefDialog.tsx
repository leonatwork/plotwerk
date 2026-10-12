/** Dialog „Prüfen“: Umfang, Tiefencheck, Schätzung vor dem Start, Fortschritt, Ergebnis. */
import { useEffect, useMemo, useState } from 'react';
import { EFFORT, formatiereUsd, kiEndpoint, type PruefAuftrag, type Schaetzung } from '@core/ki/index';
import type { Id } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiErgebnis, type KiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog, Segment } from '../../ui';
import './ki.css';

const zahl = (n: number) => Math.round(n).toLocaleString('de-DE');

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

  const p = leseParam(param);
  const kandidat = p.kapitel ?? auswahlKapitel;
  const kapitelId = kandidat && daten?.kapitel[kandidat] ? kandidat : undefined;
  const nr = kapitelId && daten ? daten.projekt.kapitel.indexOf(kapitelId) + 1 : 0;
  const titel = kapitelId ? (daten?.kapitel[kapitelId]?.titel ?? kapitelId) : '';

  const [umfang, setUmfang] = useState<'kapitel' | 'buch'>(p.umfang === 'buch' || !kapitelId ? 'buch' : 'kapitel');
  const [tiefencheck, setTiefencheck] = useState(p.tiefencheck ?? false);
  const [erzwingen, setErzwingen] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  const auftrag = useMemo<PruefAuftrag>(
    () => ({
      umfang,
      ...(umfang === 'kapitel' && kapitelId ? { kapitel: kapitelId } : {}),
      ...(tiefencheck ? { tiefencheck: true } : {}),
      ...(erzwingen && !tiefencheck ? { erzwingen: true } : {}),
    }),
    [umfang, kapitelId, tiefencheck, erzwingen],
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
      <Dialog titel="Prüfen" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-ki-text">Öffne zuerst ein Projekt.</p>
      </Dialog>
    );
  }

  if (phase === 'laeuft' && lauf) {
    const f = lauf.fortschritt;
    const gesamt = f?.gesamt ?? 0;
    const anteil = gesamt ? Math.min(1, (f?.erledigt ?? 0) / gesamt) : 0;
    const aktuellNr = f?.kapitel ? daten.projekt.kapitel.indexOf(f.kapitel) + 1 : 0;
    return (
      <Dialog
        titel="Prüfen"
        onSchliessen={schliessen}
        aktionen={
          <>
            <Button onClick={schliessen}>Im Hintergrund weiter</Button>
            <Button onClick={kiAbbrechen}>Abbrechen</Button>
          </>
        }
      >
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">
            {f && f.kapitel
              ? `${zahl(f.erledigt + 1)} von ${zahl(gesamt)}: Kap. ${aktuellNr} „${f.titel}“ wird gelesen …`
              : 'Prüfung wird vorbereitet …'}
          </p>
          <div className="pw-ki-balken" role="progressbar" aria-valuemin={0} aria-valuemax={gesamt} aria-valuenow={f?.erledigt ?? 0} aria-label="Fortschritt der Prüfung">
            <span style={{ width: `${Math.max(4, anteil * 100)}%` }} />
          </div>
          <p className="pw-ki-klein">
            Die KI liest Kapitel für Kapitel und ändert keinen Text. Beim Abbrechen bleiben die bisherigen Ergebnisse erhalten.
          </p>
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
      titel="Prüfen"
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>Abbrechen</Button>
          <Button
            variante="primaer"
            disabled={!s || schaetzung.laedt || !!schaetzung.fehler || nichtsZuTun || endpointFehlt}
            onClick={() => void kiPruefen(auftrag)}
          >
            Prüfung starten
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">
        Die KI liest mit wie eine Leserin und meldet Stellen mit wörtlichem Zitat. Sie schreibt und ändert keinen Text.
      </p>
      {laufFehler && <FehlerKasten fehler={laufFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && (
        <FehlerKasten fehler={{ art: 'nicht_bereit', text: 'Es ist noch kein Foundry-Endpoint eingetragen.' }} einstellungen={einstellungenOeffnen} />
      )}

      <Segment
        label="Umfang"
        rolle="group"
        voll
        groesse="hoch"
        wert={umfang}
        onChange={(w) => setUmfang(w)}
        optionen={[
          ...(kapitelId ? [{ wert: 'kapitel' as const, label: `Kap. ${nr} „${titel}“` }] : []),
          { wert: 'buch' as const, label: `Ganzes Buch · ${kapitelMitText} Kapitel` },
        ]}
      />
      <div className="pw-ki-abschnitt" style={{ gap: 2 }}>
        <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
          Tiefencheck mit Opus – gründlicher, teurer, ignoriert den Ergebnis-Cache
        </Checkbox>
        {!tiefencheck && ((s?.uebersprungen.length ?? 0) > 0 || erzwingen) && (
          <Checkbox checked={erzwingen} onChange={(e) => setErzwingen(e.target.checked)}>
            Unveränderte Kapitel trotzdem neu prüfen
          </Checkbox>
        )}
      </div>

      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">Tokens werden geschätzt …</p>
        ) : nichtsZuTun ? (
          <p className="pw-ki-text">
            {s.uebersprungen.length === 1
              ? 'Das Kapitel ist seit der letzten Prüfung unverändert. Nichts zu tun.'
              : `Alle ${s.uebersprungen.length} Kapitel sind seit der letzten Prüfung unverändert. Nichts zu tun.`}
          </p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>Modell</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>Anfragen</dt>
              <dd>
                {s.anfragen === 1 ? '1 Kapitel' : `${s.anfragen} Kapitel`}
                {s.uebersprungen.length > 0 && ` · ${s.uebersprungen.length} unverändert, übersprungen`}
              </dd>
              <dt>Eingabe</dt>
              <dd>
                ≈ {zahl(s.eingabeTokens)} Tokens
                {s.anfragen > 1 && `, davon ${zahl(s.prefixTokens * (s.anfragen - 1))} aus dem Cache`}
              </dd>
              <dt>Ausgabe</dt>
              <dd>≈ {zahl(s.ausgabeTokens)} Tokens (mit Denken, großzügig)</dd>
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

function ErgebnisAnsicht({ ergebnis, schliessen, hinweiseAnsehen }: { ergebnis: KiErgebnis; schliessen(): void; hinweiseAnsehen(): void }) {
  const geprueft = ergebnis.geprueft?.length ?? 0;
  const uebersprungen = ergebnis.uebersprungen?.length ?? 0;
  const t = ergebnis.tokens;
  return (
    <Dialog
      titel="Prüfung abgeschlossen"
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>Schließen</Button>
          <Button variante="primaer" onClick={hinweiseAnsehen}>
            Hinweise ansehen
          </Button>
        </>
      }
    >
      {ergebnis.fehler && <div className="pw-ki-hinweis pw-ki-hinweis--ruhig" role="status">{ergebnis.fehler} Die Ergebnisse bis dahin sind gespeichert.</div>}
      <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="pw-ki-zahl">{ergebnis.neu === 1 ? '1 Hinweis neu' : `${ergebnis.neu} Hinweise neu`}</span>
        <span className="pw-ki-text">
          {ergebnis.verworfen.length === 1 ? '1 verworfen' : `${ergebnis.verworfen.length} verworfen`}
          {ergebnis.hinweise.length > ergebnis.neu && ` · ${ergebnis.hinweise.length - ergebnis.neu} schon bekannt`}
          {(ergebnis.bereitsEntschieden ?? 0) > 0 && ` · ${ergebnis.bereitsEntschieden} bereits entschieden`}
        </span>
      </div>
      <dl className="pw-ki-zeilen">
        <dt>Kapitel</dt>
        <dd>
          {geprueft === 1 ? '1 geprüft' : `${geprueft} geprüft`}
          {uebersprungen > 0 && ` · ${uebersprungen} unverändert, übersprungen`}
        </dd>
        <dt>Analysen</dt>
        <dd>{ergebnis.analysen.length === 1 ? '1 Zusammenfassung aktualisiert' : `${ergebnis.analysen.length} Zusammenfassungen aktualisiert`}</dd>
        <dt>Verbrauch</dt>
        <dd>
          {zahl(t.eingabe)} Eingabe · {zahl(t.cacheGelesen)} aus dem Cache · {zahl(t.ausgabe)} Ausgabe · {formatiereUsd(ergebnis.kostenUsd ?? 0)}
        </dd>
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
      <p className="pw-ki-klein">
        Verworfen wird, was kein wörtliches Zitat hat, Formulierungen vorschlägt oder bewusst Vages als Widerspruch meldet.
      </p>
    </Dialog>
  );
}

export default PruefDialog;
