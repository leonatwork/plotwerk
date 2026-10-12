/**
 * Dialog „zeit-vorschlaege“ (G1): Die KI schlägt Zeitpunkte bzw. Zustände einer Figur mit wörtlichem Beleg vor.
 * Schätzung vor dem Start, Lauf, Ergebnis; darunter alle offenen Vorschläge mit Übernehmen/Verwerfen.
 * Nichts wird automatisch übernommen. Besitzer: G1.
 */
import { nachRolle } from '@core/figuren/namen';
import { useEffect, useMemo, useState } from 'react';
import { EFFORT, formatiereUsd, kiEndpoint, type Schaetzung } from '@core/ki/index';
import type { Id } from '@core/model/types';
import { hauptfigur, offeneZeitVorschlaege, offeneZustandVorschlaege, zeitEinheiten } from '@core/zeit/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, useTexte, vergleich, zahl as zahlFormat, sprache } from '../../i18n';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import type { ZeitKiArt, ZeitKiAuftrag } from '../../state/slices/zeit';
import { useStore } from '../../state/store';
import { Button, Checkbox, Dialog, Segment } from '../../ui';
import { ZeitVorschlagKarte, ZustandVorschlagKarte } from './gemeinsam';
import '../ki/ki.css';
import './zeitleiste.css';

const zahl = (n: number) => zahlFormat(Math.round(n));

function leseParam(param: unknown): { art?: ZeitKiArt; figur?: Id } {
  if (!param || typeof param !== 'object') return {};
  const p = param as Record<string, unknown>;
  return {
    art: p.art === 'zeit' || p.art === 'zustand' ? p.art : undefined,
    figur: typeof p.figur === 'string' ? p.figur : undefined,
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
  const tt = useTexte();
  const t = tt.zeitleiste.dialog;

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
      <Dialog titel={t.vorschlagen} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{tt.gemeinsam.schliessen}</Button>}>
        <p className="pw-ki-text">{t.projektOeffnen}</p>
      </Dialog>
    );
  }

  const einstellungenOeffnen = () => oeffneDialog('ki-einstellungen');
  const endpointFehlt = backendArt === 'tauri' && !kiEndpoint(kiEinstellungen());
  const figuren = Object.values(daten.figuren).sort(nachRolle((a, b) => vergleich(a.name, b.name)));
  const zustandOffen = offeneZustandVorschlaege(daten).length;
  const zeitListe = offeneZeitVorschlaege(daten);
  const zustandListe = offeneZustandVorschlaege(daten, art === 'zustand' ? figur : undefined);
  const liste = art === 'zeit' ? zeitListe : zustandListe;
  const s = schaetzung.wert;
  const figurName = figur ? (daten.figuren[figur]?.name ?? figur) : '';

  return (
    <Dialog
      titel={art === 'zeit' ? t.titelZeit : t.titelZustand}
      breite={600}
      onSchliessen={schliessen}
      aktionen={
        lauf ? (
          <>
            <Button onClick={schliessen}>{t.imHintergrund}</Button>
            <Button onClick={abbrechen}>{tt.gemeinsam.abbrechen}</Button>
          </>
        ) : (
          <>
            <Button onClick={schliessen}>{tt.gemeinsam.schliessen}</Button>
            <Button
              variante="primaer"
              disabled={!s || schaetzung.laedt || !!schaetzung.fehler || nichtsZuTun || endpointFehlt || (art === 'zustand' && !figur)}
              onClick={() => void vorschlagen(auftrag)}
            >
              {ergebnis ? t.erneut : t.holen}
            </Button>
          </>
        )
      }
    >
      <Segment<ZeitKiArt>
        label={t.art}
        rolle="tablist"
        voll
        groesse="hoch"
        wert={art}
        onChange={(w) => !lauf && setArt(w)}
        optionen={[
          { wert: 'zeit', label: zeitListe.length ? f(t.zeitpunkteOffen, { n: zeitListe.length }) : t.zeitpunkte },
          { wert: 'zustand', label: zustandOffen ? f(t.zustaendeOffen, { n: zustandOffen }) : t.zustaende },
        ]}
      />
      <p className="pw-ki-text">{art === 'zeit' ? t.erklaerungZeit : f(t.erklaerungZustand, { figur: figurName || t.eineFigur })}</p>
      {laufFehler && <FehlerKasten fehler={laufFehler} einstellungen={einstellungenOeffnen} />}
      {endpointFehlt && <FehlerKasten fehler={{ art: 'nicht_bereit', text: t.endpointFehlt }} einstellungen={einstellungenOeffnen} />}

      {lauf ? (
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{lauf.art === 'zeit' ? t.liestZeit : f(t.liestZustand, { figur: daten.figuren[lauf.figur ?? '']?.name ?? t.dieFigur })}</p>
          <div className="pw-ki-balken" role="progressbar" aria-label={t.werdenGeholt} aria-busy="true">
            <span style={{ width: '45%' }} />
          </div>
          <p className="pw-ki-klein">{t.aendertNichts}</p>
        </div>
      ) : (
        <>
          <div className="pw-ki-abschnitt" style={{ gap: 8 }}>
            {art === 'zeit' ? (
              <Segment<'offen' | 'alle'>
                label={t.umfang}
                rolle="group"
                voll
                wert={umfang}
                onChange={setUmfang}
                optionen={[
                  { wert: 'offen', label: f(t.ohneGesichert, { n: offeneKapitel.length }) },
                  { wert: 'alle', label: f(t.alleMitText, { n: mitText }) },
                ]}
              />
            ) : (
              <label className="pw-feld" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <span className="pw-feld__label">{t.figur}</span>
                <select className="zl-select" value={figur ?? ''} onChange={(e) => setFigur(e.target.value || undefined)}>
                  {!figur && <option value="">{t.figurWaehlen}</option>}
                  {figuren.map((fig) => (
                    <option key={fig.id} value={fig.id}>
                      {fig.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
              {t.tiefencheck}
            </Checkbox>
          </div>
          {ergebnis && ergebnis.art === art && (
            <div className="pw-ki-kasten" role="status">
              <div className="pw-ki-reihe" style={{ gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="pw-ki-zahl">{f(t.neu, { n: ergebnis.neu })}</span>
                <span className="pw-ki-text">
                  {ergebnis.schonEingetragen > 0 && f(t.schonEingetragen, { n: ergebnis.schonEingetragen })}
                  {ergebnis.bereitsEntschieden > 0 && f(t.schonVerworfen, { n: ergebnis.bereitsEntschieden })}
                  {f(t.verworfen, { n: ergebnis.verworfen.length })} · {formatiereUsd(ergebnis.kostenUsd, sprache())}
                </span>
              </div>
              {ergebnis.verworfen.length > 0 && (
                <details className="pw-ki-details">
                  <summary>{t.gruende}</summary>
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
                <p className="pw-ki-text">{t.nichtsZuTun}</p>
              ) : art === 'zustand' && !figur ? (
                <p className="pw-ki-text">{t.waehleFigur}</p>
              ) : schaetzung.fehler ? (
                <FehlerKasten fehler={schaetzung.fehler} einstellungen={einstellungenOeffnen} />
              ) : !s || schaetzung.laedt ? (
                <p className="pw-ki-klein">{t.schaetzt}</p>
              ) : (
                <dl className="pw-ki-zeilen">
                  <dt>{t.modell}</dt>
                  <dd>
                    {s.modell} · Effort {EFFORT[s.rolle]}
                  </dd>
                  <dt>{t.eingabe}</dt>
                  <dd>{f(t.eingabeWert, { n: zahl(s.eingabeTokens) })}</dd>
                  <dt>{t.ausgabe}</dt>
                  <dd>{f(t.ausgabeWert, { n: zahl(s.ausgabeTokens) })}</dd>
                  <dt>{t.kosten}</dt>
                  <dd>{f(t.kostenWert, { kosten: formatiereUsd(s.kostenUsd, sprache()) })}</dd>
                </dl>
              )}
            </div>
          )}
        </>
      )}

      <section aria-label={t.offeneVorschlaege} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="zl-label">{liste.length ? f(t.offeneVorschlaegeAnzahl, { n: liste.length }) : t.keineOffenen}</span>
        {liste.length > 0 && (
          <div className="zl-liste">
            {art === 'zeit'
              ? zeitListe.map((v) => <ZeitVorschlagKarte key={v.schluessel} v={v} daten={daten} />)
              : zustandListe.map((v) => <ZustandVorschlagKarte key={v.schluessel} v={v} daten={daten} />)}
          </div>
        )}
      </section>
      {backendArt === 'demo' && <p className="pw-ki-klein">{t.demo}</p>}
    </Dialog>
  );
}
