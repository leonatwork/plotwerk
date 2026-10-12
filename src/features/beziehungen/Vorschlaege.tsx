/**
 * KI-Vorschläge für Figuren, Orte und Beziehungen im Bereich „Beziehungen“:
 * Dialog „Beziehungen vorschlagen“ (Schätzung vor dem Start, Fortschritt, Ergebnis, Fehler) und
 * Vorschläge-Panel rechts (Belege mit Kapitel und Zitat, Übernehmen/Verwerfen, „Alle übernehmen“).
 * Die KI legt nichts an; angelegt wird nur auf Klick über den Store.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EFFORT, figurVerweisAufloesen, formatiereUsd, offeneVorschlaege, type OffeneVorschlaege, type Schaetzung } from '@core/ki/index';
import type { BeziehungsVorschlag, FigurVorschlag, KiVorschlaege, OrtVorschlag, ProjektDaten, VorschlagsVerweis, Zitat } from '@core/model/types';
import { f, liste, useTexte, zahl as zahlFormat, sprache } from '../../i18n';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import type { VorschlagsArt } from '../../state/slices/vorschlaege';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, IconSchliessen, Inspektor, StrangPunkt, Zaehler } from '../../ui';
import { ankerFuerZitat, kategorieFarbe, kapitelTitel, kapLabel } from './gemeinsam';
import '../ki/ki.css';
import './vorschlaege.css';

const zahl = (n: number) => zahlFormat(Math.round(n));
const LEER: OffeneVorschlaege = { figuren: [], orte: [], beziehungen: [], anzahl: 0 };

/** Offene KI-Vorschläge des geladenen Projekts (für Zähler in Netz und Figurenliste). */
export function useOffeneVorschlaege(): OffeneVorschlaege {
  const daten = useStore((s) => s.daten);
  return useMemo(() => (daten ? offeneVorschlaege(daten.kiVorschlaege, daten) : LEER), [daten]);
}

function FehlerKasten({ fehler }: { fehler: KiFehlerAnzeige }) {
  const schliesseDialog = useStore((s) => s.schliesseVorschlagsDialog);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const t = useTexte();
  return (
    <div className="pw-ki-hinweis" role="alert">
      <span>{fehler.text}</span>
      {fehler.art === 'nicht_bereit' && (
        <Button
          klein
          onClick={() => {
            schliesseDialog();
            oeffneDialog('ki-einstellungen');
          }}
        >
          {t.gemeinsam.einstellungenOeffnen}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function VorschlagDialog() {
  const offen = useStore((s) => s.vorschlagDialog);
  return offen ? <VorschlagDialogInhalt /> : null;
}

function VorschlagDialogInhalt() {
  const daten = useStore((s) => s.daten);
  const backendArt = useStore((s) => s.backend?.art);
  const laeuft = useStore((s) => s.vorschlagLaeuft);
  const fehler = useStore((s) => s.vorschlagFehler);
  const ergebnis = useStore((s) => s.vorschlagErgebnis);
  const schaetzen = useStore((s) => s.vorschlaegeSchaetzen);
  const holen = useStore((s) => s.vorschlaegeHolen);
  const schliessen = useStore((s) => s.schliesseVorschlagsDialog);
  const [tiefencheck, setTiefencheck] = useState(false);
  const [schaetzung, setSchaetzung] = useState<{ wert?: Schaetzung; fehler?: KiFehlerAnzeige; laedt: boolean }>({ laedt: true });
  const phase = laeuft ? 'laeuft' : ergebnis ? 'fertig' : 'vorbereiten';
  const t = useTexte();
  const tv = t.beziehungen.vorschlaege;

  useEffect(() => {
    if (phase !== 'vorbereiten' || !daten) return;
    let aktiv = true;
    setSchaetzung((s) => ({ ...s, laedt: true, fehler: undefined }));
    schaetzen({ tiefencheck }).then(
      (wert) => aktiv && setSchaetzung({ wert, laedt: false }),
      (e) => aktiv && setSchaetzung({ fehler: kiFehlerAnzeige(e), laedt: false }),
    );
    return () => {
      aktiv = false;
    };
    // daten absichtlich nicht: die Schätzung gilt für den Stand beim Öffnen
  }, [phase, tiefencheck, schaetzen]);

  const titel = tv.dialogTitel;
  if (!daten) return null;

  if (phase === 'laeuft') {
    return (
      <Dialog titel={titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{tv.imHintergrund}</Button>}>
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">{tv.liestBuch}</p>
          <div className="pw-ki-balken pw-vs-balken" role="progressbar" aria-label={tv.werdenErstellt}>
            <span />
          </div>
          <p className="pw-ki-klein">{tv.eineAnfrage}</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    const tok = ergebnis.tokens;
    return (
      <Dialog
        titel={tv.sindDa}
        onSchliessen={schliessen}
        aktionen={
          <Button variante="primaer" onClick={schliessen}>
            {tv.ansehen}
          </Button>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{f(tv.neu, { n: ergebnis.neu })}</span>
          <span className="pw-ki-text">
            {f(tv.verworfen, { n: ergebnis.verworfen.length })}
            {ergebnis.aktualisiert > 0 && f(tv.schonOffen, { n: ergebnis.aktualisiert })}
            {ergebnis.bereitsAngelegt > 0 && f(tv.schonAngelegt, { n: ergebnis.bereitsAngelegt })}
            {ergebnis.bereitsEntschieden > 0 && f(tv.bereitsEntschieden, { n: ergebnis.bereitsEntschieden })}
          </span>
        </div>
        <dl className="pw-ki-zeilen">
          <dt>{tv.modell}</dt>
          <dd>{ergebnis.modell}</dd>
          <dt>{tv.verbrauch}</dt>
          <dd>
            {f(tv.verbrauchWert, {
              eingabe: zahl(tok.eingabe),
              cache: zahl(tok.cacheGelesen),
              ausgabe: zahl(tok.ausgabe),
              kosten: formatiereUsd(ergebnis.kostenUsd, sprache()),
            })}
          </dd>
        </dl>
        {ergebnis.verworfen.length > 0 && (
          <details className="pw-ki-details">
            <summary>{tv.gruendeAnzeigen}</summary>
            <ul className="pw-ki-gruende">
              {ergebnis.verworfen.map((v, i) => (
                <li key={i}>{v.grund}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="pw-ki-klein">{tv.verworfenErklaerung}</p>
      </Dialog>
    );
  }

  const s = schaetzung.wert;
  return (
    <Dialog
      titel={titel}
      onSchliessen={schliessen}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" disabled={!s || schaetzung.laedt || !!schaetzung.fehler} onClick={() => void holen({ tiefencheck })}>
            {tv.holen}
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">{tv.einleitung}</p>
      {fehler && <FehlerKasten fehler={fehler} />}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        {tv.tiefencheck}
      </Checkbox>
      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">{tv.schaetzen}</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>{tv.modell}</dt>
              <dd>{f(tv.modellWert, { modell: s.modell, effort: EFFORT[s.rolle] })}</dd>
              <dt>{tv.anfragen}</dt>
              <dd>{f(tv.anfragenWert, { n: s.kapitel.length })}</dd>
              <dt>{tv.eingabe}</dt>
              <dd>{f(tv.eingabeWert, { n: zahl(s.eingabeTokens) })}</dd>
              <dt>{tv.ausgabe}</dt>
              <dd>{f(tv.ausgabeWert, { n: zahl(s.ausgabeTokens) })}</dd>
              <dt>{tv.kosten}</dt>
              <dd>{f(tv.kostenWert, { kosten: formatiereUsd(s.kostenUsd, sprache()) })}</dd>
            </dl>
            {!s.gezaehlt && <p className="pw-ki-klein">{tv.nichtGezaehlt}</p>}
          </>
        )}
      </div>
      {backendArt === 'demo' && <p className="pw-ki-klein">{tv.demo}</p>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function Belege({ daten, belege }: { daten: ProjektDaten; belege: Zitat[] }) {
  const markiere = useStore((s) => s.markiere);
  const tv = useTexte().beziehungen.vorschlaege;
  return (
    <div className="pw-vs-belege">
      {belege.map((b) => (
        <button
          key={`${b.kapitel}|${b.text}`}
          type="button"
          className="pw-bz-beleg"
          title={tv.stelleOeffnen}
          onClick={() => markiere({ kapitel: b.kapitel, anker: ankerFuerZitat(daten, b.kapitel, b.text) })}
        >
          <span className="pw-bz-beleg__kap">{kapitelTitel(daten, b.kapitel)}</span>
          <span className="pw-bz-beleg__text">{f(tv.zitat, { text: b.text })}</span>
        </button>
      ))}
    </div>
  );
}

interface EintragProps {
  art: VorschlagsArt;
  schluessel: string;
  arbeitet: string | null;
  aktion(schluessel: string, was: 'uebernehmen' | 'verwerfen', art: VorschlagsArt): void;
  uebernehmenTitel?: string;
  children: ReactNode;
}

function Eintrag({ art, schluessel, arbeitet, aktion, uebernehmenTitel, children }: EintragProps) {
  const beschaeftigt = arbeitet !== null;
  const tv = useTexte().beziehungen.vorschlaege;
  return (
    <article className="pw-vs-eintrag" aria-busy={arbeitet === schluessel || undefined}>
      {children}
      <div className="pw-vs-knoepfe">
        <Button klein onClick={() => aktion(schluessel, 'uebernehmen', art)} disabled={beschaeftigt} title={uebernehmenTitel}>
          {tv.uebernehmen}
        </Button>
        <Button klein variante="leise" onClick={() => aktion(schluessel, 'verwerfen', art)} disabled={beschaeftigt}>
          {tv.verwerfen}
        </Button>
      </div>
    </article>
  );
}

function verweisName(ablage: KiVorschlaege, daten: ProjektDaten, r: VorschlagsVerweis): { name: string; neu: boolean } {
  const x = figurVerweisAufloesen(ablage, daten, r);
  if (x && 'figur' in x) return { name: daten.figuren[x.figur]?.name ?? r.name, neu: false };
  if (x && 'vorschlag' in x) return { name: x.vorschlag.name, neu: true };
  return { name: r.name, neu: false };
}

function Abschnitt({ titel, anzahl, children }: { titel: string; anzahl: number; children: ReactNode }) {
  const tv = useTexte().beziehungen.vorschlaege;
  if (anzahl === 0) return null;
  return (
    <section className="pw-vs-abschnitt" aria-label={titel}>
      <div className="pw-vs-abschnitt__kopf">
        <Abschnittslabel as="h3">{titel}</Abschnittslabel>
        <Zaehler wert={anzahl} label={f(tv.offeneVorschlaege, { titel })} style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }} />
      </div>
      {children}
    </section>
  );
}

export function VorschlaegePanel({ daten }: { daten: ProjektDaten }) {
  const ablage = daten.kiVorschlaege;
  const offen = useMemo(() => offeneVorschlaege(ablage, daten), [ablage, daten]);
  const laeuft = useStore((s) => s.vorschlagLaeuft);
  const fehler = useStore((s) => s.vorschlagFehler);
  const ergebnis = useStore((s) => s.vorschlagErgebnis);
  const schliessen = useStore((s) => s.schliesseVorschlagsPanel);
  const oeffneVorschlaege = useStore((s) => s.oeffneVorschlaege);
  const uebernehmen = useStore((s) => s.vorschlagUebernehmen);
  const verwerfen = useStore((s) => s.vorschlagVerwerfen);
  const alleUebernehmen = useStore((s) => s.alleVorschlaegeUebernehmen);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [aktionsFehler, setAktionsFehler] = useState<string | null>(null);
  const t = useTexte();
  const tv = t.beziehungen.vorschlaege;

  async function ausfuehren(schluessel: string, arbeit: () => Promise<string | null>) {
    setArbeitet(schluessel);
    setAktionsFehler(null);
    setMeldung(null);
    try {
      setMeldung(await arbeit());
    } catch (e) {
      setAktionsFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setArbeitet(null);
    }
  }

  const aktion = (schluessel: string, was: 'uebernehmen' | 'verwerfen', art: VorschlagsArt) =>
    void ausfuehren(schluessel, async () => {
      if (was === 'verwerfen') {
        await verwerfen(art, schluessel);
        return null;
      }
      await uebernehmen(art, schluessel);
      return null;
    });

  const alle = () =>
    void ausfuehren('alle', async () => {
      const r = await alleUebernehmen();
      return f(tv.uebernommen, {
        figuren: f(tv.figurenAnzahl, { n: r.figuren }),
        orte: f(tv.orteAnzahl, { n: r.orte }),
        beziehungen: f(tv.beziehungenAnzahl, { n: r.beziehungen }),
      });
    });

  const a = ablage ?? { version: 1 as const, figuren: [], orte: [], beziehungen: [] };

  return (
    <Inspektor breite={320} hintergrund="weiss" label={tv.panelTitel} className="pw-vs" style={{ gap: 12 }}>
      <div className="pw-vs-kopf">
        <Abschnittslabel>{tv.panelTitel}</Abschnittslabel>
        <button type="button" className="pw-vs-schliessen" aria-label={tv.schliessen} title={t.gemeinsam.schliessen} onClick={schliessen}>
          <IconSchliessen size={12} />
        </button>
      </div>
      <strong className="pw-bz-name">{offen.anzahl === 0 ? tv.nichtsOffen : f(tv.anzahl, { n: offen.anzahl })}</strong>
      <span className="pw-bz-text">{tv.abgeleitet}</span>

      {laeuft && (
        <div className="pw-ki-abschnitt" aria-live="polite" style={{ gap: 6 }}>
          <span className="pw-vs-klein">{tv.liestDasBuch}</span>
          <div className="pw-ki-balken pw-vs-balken" role="progressbar" aria-label={tv.werdenErstellt}>
            <span />
          </div>
        </div>
      )}
      {fehler && !laeuft && <FehlerKasten fehler={fehler} />}
      {aktionsFehler && (
        <div className="pw-ki-hinweis" role="alert">
          {aktionsFehler}
        </div>
      )}
      {meldung && (
        <span className="pw-vs-klein" role="status">
          {meldung}
        </span>
      )}
      {ergebnis && !laeuft && (
        <span className="pw-vs-klein">
          {f(tv.letzterLauf, { neu: ergebnis.neu, verworfen: ergebnis.verworfen.length, kosten: formatiereUsd(ergebnis.kostenUsd, sprache()) })}
        </span>
      )}

      {offen.anzahl > 0 && (
        <div className="pw-vs-aktionen">
          <Button variante="primaer" onClick={alle} disabled={arbeitet !== null}>
            {tv.alleUebernehmen}
          </Button>
          <span className="pw-vs-klein">{tv.reihenfolge}</span>
        </div>
      )}

      <Abschnitt titel={tv.figuren} anzahl={offen.figuren.length}>
        {offen.figuren.map((fv: FigurVorschlag) => (
          <Eintrag key={fv.schluessel} art="figur" schluessel={fv.schluessel} arbeitet={arbeitet} aktion={aktion}>
            <div className="pw-vs-zeile">
              <strong>{fv.name}</strong>
              <span className="pw-vs-meta">{fv.rolle === 'haupt' ? tv.hauptfigur : tv.nebenfigur}</span>
            </div>
            {fv.kurz && <span className="pw-vs-kurz">{fv.kurz}</span>}
            {fv.aliase.length > 0 && <span className="pw-vs-meta">{f(tv.auch, { namen: fv.aliase.join(', ') })}</span>}
            <Belege daten={daten} belege={fv.belege} />
          </Eintrag>
        ))}
      </Abschnitt>

      <Abschnitt titel={tv.orte} anzahl={offen.orte.length}>
        {offen.orte.map((o: OrtVorschlag) => (
          <Eintrag key={o.schluessel} art="ort" schluessel={o.schluessel} arbeitet={arbeitet} aktion={aktion}>
            <div className="pw-vs-zeile">
              <strong>{o.name}</strong>
              {o.in && (
                <span className="pw-vs-meta">
                  {f(tv.inOrt, { name: o.in.typ === 'angelegt' ? (daten.orte[o.in.id]?.name ?? o.in.name) : o.in.name })}
                </span>
              )}
            </div>
            {o.aliase.length > 0 && <span className="pw-vs-meta">{f(tv.auch, { namen: o.aliase.join(', ') })}</span>}
            <Belege daten={daten} belege={o.belege} />
          </Eintrag>
        ))}
      </Abschnitt>

      <Abschnitt titel={tv.beziehungen} anzahl={offen.beziehungen.length}>
        {offen.beziehungen.map((b: BeziehungsVorschlag) => {
          const von = verweisName(a, daten, b.von);
          const zu = verweisName(a, daten, b.zu);
          const neue = [von, zu].filter((x) => x.neu).map((x) => x.name);
          const farbe = kategorieFarbe(b.kategorie);
          return (
            <Eintrag
              key={b.schluessel}
              art="beziehung"
              schluessel={b.schluessel}
              arbeitet={arbeitet}
              aktion={aktion}
              uebernehmenTitel={neue.length ? f(tv.legtAuchAn, { n: neue.length, namen: liste(neue) }) : undefined}
            >
              <div className="pw-vs-zeile">
                <strong>
                  {von.name} – {zu.name}
                </strong>
              </div>
              <div className="pw-vs-zeile">
                <span className="pw-vs-art" style={{ color: farbe.dunkel }}>
                  {b.art}
                </span>
                <span className="pw-vs-meta">
                  <StrangPunkt farbe={farbe.farbe} /> {t.beziehungen.kategorie[b.kategorie]}
                  {b.abKapitel ? f(tv.abKap, { kap: kapLabel(daten, b.abKapitel) }) : ''}
                  {b.unsicher ? tv.gestricheltZusatz : ''}
                </span>
              </div>
              {neue.length > 0 && <span className="pw-vs-neu">{f(tv.neueFigur, { namen: neue.join(', ') })}</span>}
              {b.begruendung && <span className="pw-vs-kurz">{b.begruendung}</span>}
              <Belege daten={daten} belege={b.belege} />
            </Eintrag>
          );
        })}
      </Abschnitt>

      {offen.anzahl === 0 && !laeuft && (
        <div className="pw-vs-aktionen">
          <span className="pw-bz-text">
            {ablage ? tv.alleEntschieden : tv.nochKeine} {tv.neuerLauf}
          </span>
          <Button onClick={() => oeffneVorschlaege({ dialog: true })}>{t.beziehungen.ansicht.beziehungenVorschlagen}</Button>
        </div>
      )}
    </Inspektor>
  );
}
