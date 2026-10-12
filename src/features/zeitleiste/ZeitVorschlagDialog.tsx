/**
 * Dialog „zeit-vorschlaege“ (G1): Die KI schlägt Zeitpunkte bzw. Zustände einer Figur mit wörtlichem Beleg vor.
 * Schätzung vor dem Start, Lauf, Ergebnis; darunter alle offenen Vorschläge mit Übernehmen/Verwerfen.
 * Nichts wird automatisch übernommen. Besitzer: G1.
 */
import { useEffect, useMemo, useState } from 'react';
import { EFFORT, formatiereUsd, kiEndpoint, type Schaetzung } from '@core/ki/index';
import type { Id } from '@core/model/types';
import { hauptfigur, offeneZeitVorschlaege, offeneZustandVorschlaege, zeitEinheiten } from '@core/zeit/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import type { ZeitKiArt, ZeitKiAuftrag } from '../../state/slices/zeit';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog, Segment } from '../../ui';
import { ZeitVorschlagKarte, ZustandVorschlagKarte } from './gemeinsam';
import '../ki/ki.css';
import './zeitleiste.css';

const zahl = (n: number) => Math.round(n).toLocaleString('de-DE');

function leseParam(param: unknown): { art?: ZeitKiArt; figur?: Id } {
  if (!param || typeof param !== 'object') return {};
  const p = param as Record<string, unknown>;
  return {
    art: p.art === 'zeit' || p.art === 'zustand' ? p.art : undefined,
    figur: typeof p.figur === 'string' ? p.figur : undefined,
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

export default function ZeitVorschlagDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backendArt = useStore((s) => s.backend?.art);
  const lauf = useStore((s) => s.zeit.lauf);
  const ergebnis = useStore((s) => s.zeit.ergebnis);
  const laufFehler = useStore((s) => s.zeit.fehler);
  const schaetzen = useStore((s) => s.zeit.schaetzen);
  const vorschlagen = useStore((s) => s.zeit.vorschlagen);
  const abbrechen = useStore((s) => s.zeit.abbrechen);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const spurFigur = useStore((s) => s.zeit.figur);

  const p = leseParam(param);
  const [art, setArt] = useState<ZeitKiArt>(p.art ?? 'zeit');
  const [figur, setFigur] = useState<Id | undefined>(() => p.figur ?? spurFigur ?? (daten ? hauptfigur(daten) : undefined));
  const [umfang, setUmfang] = useState<'offen' | 'alle'>('offen');
  const [tiefencheck, setTiefencheck] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });

  useEffect(() => {
    useStore.getState().zeit.zuruecksetzen();
  }, []);

  /** Kapitel mit Text, die noch keinen gesicherten Zeitpunkt haben (bei Szenen: mindestens eine Szene ohne) */
  const offeneKapitel = useMemo(() => {
    if (!daten) return [];
    const einheiten = zeitEinheiten(daten);
    return daten.projekt.kapitel.filter(
      (id) => daten.kapitel[id]?.text.trim() && einheiten.filter((e) => e.kapitel === id).some((e) => !e.eigen || e.eigen.sicherheit !== 'fest'),
    );
  }, [daten]);
  const mitText = daten ? daten.projekt.kapitel.filter((id) => daten.kapitel[id]?.text.trim()).length : 0;

  const auftrag = useMemo<ZeitKiAuftrag>(
    () => ({
      art,
      ...(art === 'zustand' && figur ? { figur } : {}),
      ...(art === 'zeit' && umfang === 'offen' ? { kapitel: offeneKapitel } : {}),
      ...(tiefencheck ? { tiefencheck: true } : {}),
    }),
    [art, figur, umfang, offeneKapitel, tiefencheck],
  );
  const nichtsZuTun = art === 'zeit' && umfang === 'offen' && offeneKapitel.length === 0;

  useEffect(() => {
    if (lauf || !daten || nichtsZuTun || (art === 'zustand' && !figur)) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    schaetzen(auftrag).then(
      (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
      (e) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
    );
    return () => {
      aktiv = false;
    };
  }, [auftrag, lauf, schaetzen, daten, nichtsZuTun, art, figur]);

  if (!daten) {
    return (
      <Dialog titel="Vorschlagen" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-ki-text">Öffne zuerst ein Projekt.</p>
      </Dialog>
    );
  }

  const einstellungenOeffnen = () => oeffneDialog('ki-einstellungen');
  const endpointFehlt = backendArt === 'tauri' && !kiEndpoint(kiEinstellungen());
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? a.name.localeCompare(b.name, 'de') : a.rolle === 'haupt' ? -1 : 1));
  const zeitListe = offeneZeitVorschlaege(daten);
  const zustandListe = offeneZustandVorschlaege(daten, art === 'zustand' ? figur : undefined);
  const liste = art === 'zeit' ? zeitListe : zustandListe;
  const s = schaetzung.wert;
  const figurName = figur ? (daten.figuren[figur]?.name ?? figur) : '';

  return (
    <Dialog
      titel={art === 'zeit' ? 'Zeitpunkte vorschlagen' : 'Zustände vorschlagen'}
      breite={600}
      onSchliessen={schliessen}
      aktionen={
        lauf ? (
          <>
            <Button onClick={schliessen}>Im Hintergrund weiter</Button>
            <Button onClick={abbrechen}>Abbrechen</Button>
          </>
        ) : (
          <>
            <Button onClick={schliessen}>Schließen</Button>
            <Button
              variante="primaer"
              disabled={!s || schaetzung.laedt || !!schaetzung.fehler || nichtsZuTun || endpointFehlt || (art === 'zustand' && !figur)}
              onClick={() => void vorschlagen(auftrag)}
            >
              {ergebnis ? 'Erneut vorschlagen' : 'Vorschläge holen'}
            </Button>
          </>
        )
      }
    >
      <Segment<ZeitKiArt>
        label="Art der Vorschläge"
        rolle="tablist"
        voll
        groesse="hoch"
        wert={art}
        onChange={(w) => !lauf && setArt(w)}
        optionen={[
          { wert: 'zeit', label: `Zeitpunkte${zeitListe.length ? ` · ${zeitListe.length} offen` : ''}` },
          { wert: 'zustand', label: `Zustände${offeneZustandVorschlaege(daten).length ? ` · ${offeneZustandVorschlaege(daten).length} offen` : ''}` },
        ]}
      />
      <p className="pw-ki-text">
        {art === 'zeit'
          ? 'Die KI liest das Buch und schlägt für Kapitel und Szenen vor, wann sie spielen – jeweils mit wörtlichem Beleg. Deine eingetragenen Zeitpunkte bekommt sie nicht zu sehen. Du übernimmst oder verwirfst jeden Vorschlag einzeln.'
          : `Die KI schlägt vor, in welchem Zustand ${figurName || 'eine Figur'} in den Kapiteln ist – nur mit wörtlichem Beleg und nur aus deiner Zustandsliste. Du entscheidest einzeln.`}
      </p>
      {laufFehler && <FehlerKasten fehler={laufFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: 'Es ist noch kein Foundry-Endpoint eingetragen.' }} einstellungen={einstellungenOeffnen} />}

      {lauf ? (
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{lauf.art === 'zeit' ? 'Die KI liest das Buch und sucht Zeitangaben …' : `Die KI liest das Buch und achtet auf ${daten.figuren[lauf.figur ?? '']?.name ?? 'die Figur'} …`}</p>
          <div className="pw-ki-balken" role="progressbar" aria-label="Vorschläge werden geholt" aria-busy="true">
            <span style={{ width: '45%' }} />
          </div>
          <p className="pw-ki-klein">Die KI ändert keinen Text. Gespeichert werden nur die Vorschläge.</p>
        </div>
      ) : (
        <>
          <div className="pw-ki-abschnitt" style={{ gap: 8 }}>
            {art === 'zeit' ? (
              <Segment<'offen' | 'alle'>
                label="Umfang"
                rolle="group"
                voll
                wert={umfang}
                onChange={setUmfang}
                optionen={[
                  { wert: 'offen', label: `Ohne gesicherten Zeitpunkt · ${offeneKapitel.length}` },
                  { wert: 'alle', label: `Alle Kapitel mit Text · ${mitText}` },
                ]}
              />
            ) : (
              <label className="pw-feld" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <span className="pw-feld__label">Figur</span>
                <select className="zl-select" value={figur ?? ''} onChange={(e) => setFigur(e.target.value || undefined)}>
                  {!figur && <option value="">Figur wählen …</option>}
                  {figuren.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
              Tiefencheck mit Opus – gründlicher, teurer
            </Checkbox>
          </div>
          {ergebnis && ergebnis.art === art && (
            <div className="pw-ki-kasten" role="status">
              <div className="pw-ki-reihe" style={{ gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="pw-ki-zahl">{ergebnis.neu === 1 ? '1 Vorschlag neu' : `${ergebnis.neu} Vorschläge neu`}</span>
                <span className="pw-ki-text">
                  {ergebnis.schonEingetragen > 0 && `${ergebnis.schonEingetragen} schon eingetragen · `}
                  {ergebnis.bereitsEntschieden > 0 && `${ergebnis.bereitsEntschieden} schon verworfen · `}
                  {ergebnis.verworfen.length === 1 ? '1 verworfen' : `${ergebnis.verworfen.length} verworfen`} · {formatiereUsd(ergebnis.kostenUsd)}
                </span>
              </div>
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
            </div>
          )}
          {!ergebnis && (
            <div className="pw-ki-kasten" aria-live="polite">
              {nichtsZuTun ? (
                <p className="pw-ki-text">Alle Kapitel mit Text haben schon einen gesicherten Zeitpunkt. Wähle „Alle Kapitel“, um trotzdem Vorschläge zu holen.</p>
              ) : art === 'zustand' && !figur ? (
                <p className="pw-ki-text">Wähle eine Figur.</p>
              ) : schaetzung.fehler ? (
                <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
              ) : !s || schaetzung.laedt ? (
                <p className="pw-ki-klein">Tokens werden geschätzt …</p>
              ) : (
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
              )}
            </div>
          )}
        </>
      )}

      <section aria-label="Offene Vorschläge" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="zl-label">{liste.length ? `Offene Vorschläge · ${liste.length}` : 'Keine offenen Vorschläge'}</span>
        {liste.length > 0 && (
          <div className="zl-liste">
            {art === 'zeit'
              ? zeitListe.map((v) => <ZeitVorschlagKarte key={v.schluessel} v={v} daten={daten} />)
              : zustandListe.map((v) => <ZustandVorschlagKarte key={v.schluessel} v={v} daten={daten} />)}
          </div>
        )}
      </section>
      {backendArt === 'demo' && <p className="pw-ki-klein">Browser-Demo: Die Antworten kommen vom Demo-Transport, es gehen keine Daten ins Netz.</p>}
    </Dialog>
  );
}
