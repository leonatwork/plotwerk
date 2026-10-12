/**
 * KI-Vorschläge für Figuren, Orte und Beziehungen im Bereich „Beziehungen“:
 * Dialog „Beziehungen vorschlagen“ (Schätzung vor dem Start, Fortschritt, Ergebnis, Fehler) und
 * Vorschläge-Panel rechts (Belege mit Kapitel und Zitat, Übernehmen/Verwerfen, „Alle übernehmen“).
 * Die KI legt nichts an; angelegt wird nur auf Klick über den Store.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EFFORT, figurVerweisAufloesen, formatiereUsd, offeneVorschlaege, type OffeneVorschlaege, type Schaetzung } from '@core/ki/index';
import type { BeziehungsVorschlag, FigurVorschlag, KiVorschlaege, OrtVorschlag, ProjektDaten, VorschlagsVerweis, Zitat } from '@core/model/types';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from '../../state/slices/ki';
import type { VorschlagsArt } from '../../state/slices/vorschlaege';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, IconSchliessen, Inspektor, StrangPunkt, Zaehler } from '../../ui';
import { ankerFuerZitat, KATEGORIE_LABEL, kategorieFarbe, kapitelTitel, kapLabel } from './gemeinsam';
import '../ki/ki.css';
import './vorschlaege.css';

const zahl = (n: number) => Math.round(n).toLocaleString('de-DE');
const LEER: OffeneVorschlaege = { figuren: [], orte: [], beziehungen: [], anzahl: 0 };

/** Offene KI-Vorschläge des geladenen Projekts (für Zähler in Netz und Figurenliste). */
export function useOffeneVorschlaege(): OffeneVorschlaege {
  const daten = useStore((s) => s.daten);
  return useMemo(() => (daten ? offeneVorschlaege(daten.kiVorschlaege, daten) : LEER), [daten]);
}

function anzahlText(n: number, eins: string, viele: string): string {
  return n === 1 ? `1 ${eins}` : `${n} ${viele}`;
}

function FehlerKasten({ fehler }: { fehler: KiFehlerAnzeige }) {
  const schliesseDialog = useStore((s) => s.schliesseVorschlagsDialog);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
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
          Einstellungen öffnen
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

  const titel = 'Figuren und Beziehungen vorschlagen';
  if (!daten) return null;

  if (phase === 'laeuft') {
    return (
      <Dialog titel={titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Im Hintergrund weiter</Button>}>
        <div className="pw-ki-abschnitt" aria-live="polite">
          <p className="pw-ki-text">Die KI liest das ganze Buch und sammelt Figuren, Orte und Beziehungen …</p>
          <div className="pw-ki-balken pw-vs-balken" role="progressbar" aria-label="Vorschläge werden erstellt">
            <span />
          </div>
          <p className="pw-ki-klein">Eine Anfrage für das ganze Buch. Die KI ändert keinen Text und legt nichts an.</p>
        </div>
      </Dialog>
    );
  }

  if (phase === 'fertig' && ergebnis) {
    const t = ergebnis.tokens;
    return (
      <Dialog
        titel="Vorschläge sind da"
        onSchliessen={schliessen}
        aktionen={
          <Button variante="primaer" onClick={schliessen}>
            Vorschläge ansehen
          </Button>
        }
      >
        <div className="pw-ki-reihe" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="pw-ki-zahl">{anzahlText(ergebnis.neu, 'Vorschlag neu', 'Vorschläge neu')}</span>
          <span className="pw-ki-text">
            {anzahlText(ergebnis.verworfen.length, 'verworfen', 'verworfen')}
            {ergebnis.aktualisiert > 0 && ` · ${ergebnis.aktualisiert} schon offen`}
            {ergebnis.bereitsAngelegt > 0 && ` · ${ergebnis.bereitsAngelegt} schon angelegt`}
            {ergebnis.bereitsEntschieden > 0 && ` · ${ergebnis.bereitsEntschieden} bereits entschieden`}
          </span>
        </div>
        <dl className="pw-ki-zeilen">
          <dt>Modell</dt>
          <dd>{ergebnis.modell}</dd>
          <dt>Verbrauch</dt>
          <dd>
            {zahl(t.eingabe)} Eingabe · {zahl(t.cacheGelesen)} aus dem Cache · {zahl(t.ausgabe)} Ausgabe · {formatiereUsd(ergebnis.kostenUsd)}
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
          Verworfen wird, was kein wörtliches Zitat hat, auf unbekannte Figuren verweist oder Formulierungen vorschlägt.
        </p>
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
          <Button onClick={schliessen}>Abbrechen</Button>
          <Button variante="primaer" disabled={!s || schaetzung.laedt || !!schaetzung.fehler} onClick={() => void holen({ tiefencheck })}>
            Vorschläge holen
          </Button>
        </>
      }
    >
      <p className="pw-ki-text">
        Die KI liest das ganze Buch und schlägt Figuren, Orte und Beziehungen vor, jeweils mit wörtlichem Beleg. Sie legt nichts an
        und ändert keinen Text: Du übernimmst oder verwirfst jeden Vorschlag einzeln.
      </p>
      {fehler && <FehlerKasten fehler={fehler} />}
      <Checkbox checked={tiefencheck} onChange={(e) => setTiefencheck(e.target.checked)}>
        Tiefencheck mit Opus – gründlicher, teurer
      </Checkbox>
      <div className="pw-ki-kasten" aria-live="polite">
        {schaetzung.fehler ? (
          <FehlerKasten fehler={schaetzung.fehler} />
        ) : !s || schaetzung.laedt ? (
          <p className="pw-ki-klein">Tokens werden geschätzt …</p>
        ) : (
          <>
            <dl className="pw-ki-zeilen">
              <dt>Modell</dt>
              <dd>
                {s.modell} · Effort {EFFORT[s.rolle]}
              </dd>
              <dt>Anfragen</dt>
              <dd>1 für das ganze Buch · {anzahlText(s.kapitel.length, 'Kapitel', 'Kapitel')} mit Text</dd>
              <dt>Eingabe</dt>
              <dd>≈ {zahl(s.eingabeTokens)} Tokens</dd>
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

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function Belege({ daten, belege }: { daten: ProjektDaten; belege: Zitat[] }) {
  const markiere = useStore((s) => s.markiere);
  return (
    <div className="pw-vs-belege">
      {belege.map((b) => (
        <button
          key={`${b.kapitel}|${b.text}`}
          type="button"
          className="pw-bz-beleg"
          title="Stelle im Text öffnen"
          onClick={() => markiere({ kapitel: b.kapitel, anker: ankerFuerZitat(daten, b.kapitel, b.text) })}
        >
          <span className="pw-bz-beleg__kap">{kapitelTitel(daten, b.kapitel)}</span>
          <span className="pw-bz-beleg__text">„{b.text}“</span>
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
  return (
    <article className="pw-vs-eintrag" aria-busy={arbeitet === schluessel || undefined}>
      {children}
      <div className="pw-vs-knoepfe">
        <Button klein onClick={() => aktion(schluessel, 'uebernehmen', art)} disabled={beschaeftigt} title={uebernehmenTitel}>
          Übernehmen
        </Button>
        <Button klein variante="leise" onClick={() => aktion(schluessel, 'verwerfen', art)} disabled={beschaeftigt}>
          Verwerfen
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
  if (anzahl === 0) return null;
  return (
    <section className="pw-vs-abschnitt" aria-label={titel}>
      <div className="pw-vs-abschnitt__kopf">
        <Abschnittslabel as="h3">{titel}</Abschnittslabel>
        <Zaehler wert={anzahl} label={`offene Vorschläge ${titel}`} style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }} />
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
      return `Übernommen: ${anzahlText(r.figuren, 'Figur', 'Figuren')}, ${anzahlText(r.orte, 'Ort', 'Orte')}, ${anzahlText(r.beziehungen, 'Beziehung', 'Beziehungen')}.`;
    });

  const a = ablage ?? { version: 1 as const, figuren: [], orte: [], beziehungen: [] };

  return (
    <Inspektor breite={320} hintergrund="weiss" label="Vorschläge der KI" className="pw-vs" style={{ gap: 12 }}>
      <div className="pw-vs-kopf">
        <Abschnittslabel>Vorschläge der KI</Abschnittslabel>
        <button type="button" className="pw-vs-schliessen" aria-label="Vorschläge schließen" title="Schließen" onClick={schliessen}>
          <IconSchliessen size={12} />
        </button>
      </div>
      <strong className="pw-bz-name">{offen.anzahl === 0 ? 'Nichts offen' : anzahlText(offen.anzahl, 'Vorschlag', 'Vorschläge')}</strong>
      <span className="pw-bz-text">Aus dem Text abgeleitet, jeweils mit wörtlichem Beleg. Angelegt wird nur, was du übernimmst.</span>

      {laeuft && (
        <div className="pw-ki-abschnitt" aria-live="polite" style={{ gap: 6 }}>
          <span className="pw-vs-klein">Die KI liest das Buch …</span>
          <div className="pw-ki-balken pw-vs-balken" role="progressbar" aria-label="Vorschläge werden erstellt">
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
          Letzter Lauf: {ergebnis.neu} neu · {ergebnis.verworfen.length} verworfen · {formatiereUsd(ergebnis.kostenUsd)}
        </span>
      )}

      {offen.anzahl > 0 && (
        <div className="pw-vs-aktionen">
          <Button variante="primaer" onClick={alle} disabled={arbeitet !== null}>
            Alle übernehmen
          </Button>
          <span className="pw-vs-klein">Figuren, dann Orte, dann Beziehungen</span>
        </div>
      )}

      <Abschnitt titel="Figuren" anzahl={offen.figuren.length}>
        {offen.figuren.map((f: FigurVorschlag) => (
          <Eintrag key={f.schluessel} art="figur" schluessel={f.schluessel} arbeitet={arbeitet} aktion={aktion}>
            <div className="pw-vs-zeile">
              <strong>{f.name}</strong>
              <span className="pw-vs-meta">{f.rolle === 'haupt' ? 'Hauptfigur' : 'Nebenfigur'}</span>
            </div>
            {f.kurz && <span className="pw-vs-kurz">{f.kurz}</span>}
            {f.aliase.length > 0 && <span className="pw-vs-meta">auch: {f.aliase.join(', ')}</span>}
            <Belege daten={daten} belege={f.belege} />
          </Eintrag>
        ))}
      </Abschnitt>

      <Abschnitt titel="Orte" anzahl={offen.orte.length}>
        {offen.orte.map((o: OrtVorschlag) => (
          <Eintrag key={o.schluessel} art="ort" schluessel={o.schluessel} arbeitet={arbeitet} aktion={aktion}>
            <div className="pw-vs-zeile">
              <strong>{o.name}</strong>
              {o.in && <span className="pw-vs-meta">in {o.in.typ === 'angelegt' ? (daten.orte[o.in.id]?.name ?? o.in.name) : o.in.name}</span>}
            </div>
            {o.aliase.length > 0 && <span className="pw-vs-meta">auch: {o.aliase.join(', ')}</span>}
            <Belege daten={daten} belege={o.belege} />
          </Eintrag>
        ))}
      </Abschnitt>

      <Abschnitt titel="Beziehungen" anzahl={offen.beziehungen.length}>
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
              uebernehmenTitel={neue.length ? `Legt auch ${neue.length === 1 ? 'die Figur' : 'die Figuren'} ${neue.join(' und ')} an` : undefined}
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
                  <StrangPunkt farbe={farbe.farbe} /> {KATEGORIE_LABEL[b.kategorie]}
                  {b.abKapitel ? ` · ab ${kapLabel(daten, b.abKapitel)}` : ''}
                  {b.unsicher ? ' · gestrichelt' : ''}
                </span>
              </div>
              {neue.length > 0 && <span className="pw-vs-neu">+ neue Figur: {neue.join(', ')}</span>}
              {b.begruendung && <span className="pw-vs-kurz">{b.begruendung}</span>}
              <Belege daten={daten} belege={b.belege} />
            </Eintrag>
          );
        })}
      </Abschnitt>

      {offen.anzahl === 0 && !laeuft && (
        <div className="pw-vs-aktionen">
          <span className="pw-bz-text">
            {ablage ? 'Alle Vorschläge sind entschieden.' : 'Noch keine Vorschläge geholt.'} Ein neuer Lauf bringt nur Neues, Verworfenes
            kommt nicht wieder.
          </span>
          <Button onClick={() => oeffneVorschlaege({ dialog: true })}>Beziehungen vorschlagen</Button>
        </div>
      )}
    </Inspektor>
  );
}
