/**
 * Dialog „Einstellungen“: KI-Anbieter (Microsoft Foundry oder Claude API), Endpoint und Modelle je
 * Anbieter, API-Schlüssel je Anbieter (Schlüsselbund). Beim Umschalten bleiben die Einstellungen
 * des anderen Anbieters erhalten und werden mitgespeichert.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ANBIETER_NAME, CLAUDE_API_ENDPOINT, STANDARD_MODELLE } from '@core/ki/index';
import type { KiAnbieter, KiEinstellungen, KiModelle } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, setzeSprachWahl, texte, useSprachWahl, useTexte, type SprachWahl } from '../../i18n';
import { kiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Dialog, Feld, Segment, StrangPunkt, Textfeld } from '../../ui';
import './ki.css';

/** Basis-URL ohne „/“ und ohne „/v1/messages“ am Ende. */
export function endpointNormalisieren(wert: string): string {
  return wert
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/messages(\/count_tokens)?$/i, '')
    .replace(/\/+$/, '');
}

export function endpointFehler(wert: string): string | null {
  const e = endpointNormalisieren(wert);
  if (!e) return null;
  let url: URL;
  try {
    url = new URL(e);
  } catch {
    return texte().ki.einstellungen.ungueltig;
  }
  if (url.protocol !== 'https:') return texte().ki.einstellungen.https;
  return null;
}

/** Modellrollen; Beschriftung aus t.ki.einstellungen.rollen */
const ROLLEN = ['erkennung', 'pruefung', 'tiefencheck'] as const;

const ANBIETER_OPTIONEN = [
  { wert: 'foundry' as const, label: ANBIETER_NAME.foundry },
  { wert: 'claude' as const, label: ANBIETER_NAME.claude },
];

/** Bearbeitungsstand beider Anbieter (Rohwerte der Felder). */
export type EinstellungsWerte = Required<KiEinstellungen>;

function modelleSauber(m: KiModelle): KiModelle {
  return {
    erkennung: m.erkennung.trim() || STANDARD_MODELLE.erkennung,
    pruefung: m.pruefung.trim() || STANDARD_MODELLE.pruefung,
    tiefencheck: m.tiefencheck.trim() || STANDARD_MODELLE.tiefencheck,
  };
}

/** Was in projekt.md landet: beide Anbieter, normalisiert, leere Modelle = Standard. */
export function einstellungenAusWerten(w: EinstellungsWerte): Required<KiEinstellungen> {
  return {
    endpoint: endpointNormalisieren(w.endpoint),
    deployments: modelleSauber(w.deployments),
    anbieter: w.anbieter,
    claude: {
      endpoint: endpointNormalisieren(w.claude.endpoint) || CLAUDE_API_ENDPOINT,
      modelle: modelleSauber(w.claude.modelle),
    },
  };
}

function ModellFelder({
  modelle,
  deaktiviert,
  onChange,
}: {
  modelle: KiModelle;
  deaktiviert: boolean;
  onChange(m: KiModelle): void;
}) {
  const t = useTexte();
  return (
    <div className="pw-ki-felder pw-ki-felder--drei">
      {ROLLEN.map((r) => (
        <Feld key={r} label={t.ki.einstellungen.rollen[r]}>
          {(id) => (
            <Textfeld
              id={id}
              value={modelle[r]}
              disabled={deaktiviert}
              placeholder={STANDARD_MODELLE[r]}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onChange({ ...modelle, [r]: e.target.value })}
            />
          )}
        </Feld>
      ))}
    </div>
  );
}

/** Sprache der Oberfläche: gilt sofort, App-Einstellung (nicht im Projekt). */
export function SprachWahlAbschnitt() {
  const t = useTexte();
  const { wahl, system } = useSprachWahl();
  const optionen: { wert: SprachWahl; label: string }[] = [
    { wert: 'system', label: f(t.sprache.systemMit, { sprache: t.sprache[system] }) },
    { wert: 'de', label: t.sprache.de },
    { wert: 'en', label: t.sprache.en },
  ];
  return (
    <section className="pw-ki-abschnitt" aria-labelledby="einstellungen-sprache">
      <Abschnittslabel as="h3" id="einstellungen-sprache">
        {t.sprache.abschnitt}
      </Abschnittslabel>
      <Segment label={t.sprache.label} rolle="group" voll groesse="hoch" wert={wahl} onChange={(w) => void setzeSprachWahl(w)} optionen={optionen} />
      <p className="pw-ki-klein">{t.sprache.erklaerung}</p>
    </section>
  );
}

export function EinstellungenDialog({ schliessen }: DialogKomponentenProps) {
  const projekt = useStore((s) => s.daten?.projekt);
  const backendArt = useStore((s) => s.backend?.art);
  const schluesselJe = useStore((s) => s.kiSchluesselJe);
  const kiEinstellungen = useStore((s) => s.kiEinstellungen);
  const speichern = useStore((s) => s.kiEinstellungenSpeichern);
  const schluesselPruefen = useStore((s) => s.kiSchluesselPruefen);
  const schluesselSetzen = useStore((s) => s.kiSchluesselSetzen);
  const schluesselLoeschen = useStore((s) => s.kiSchluesselLoeschen);

  const [anfang] = useState<EinstellungsWerte>(() => kiEinstellungen());
  const [werte, setWerte] = useState<EinstellungsWerte>(anfang);
  const [neuerSchluessel, setNeuerSchluessel] = useState('');
  const [schluesselMeldung, setSchluesselMeldung] = useState<string | null>(null);
  const [schluesselFehler, setSchluesselFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const t = useTexte();
  const T = t.ki.einstellungen;

  const anbieter = werte.anbieter;
  const name = ANBIETER_NAME[anbieter];
  const schluesselStatus = schluesselJe[anbieter];

  useEffect(() => {
    void schluesselPruefen(anbieter);
  }, [schluesselPruefen, anbieter]);

  const ohneProjekt = !projekt;
  const fehler = endpointFehler(anbieter === 'claude' ? werte.claude.endpoint : werte.endpoint);
  const geaendert = JSON.stringify(einstellungenAusWerten(werte)) !== JSON.stringify(einstellungenAusWerten(anfang));

  function anbieterWaehlen(a: KiAnbieter) {
    if (a === anbieter) return;
    setWerte({ ...werte, anbieter: a });
    setNeuerSchluessel('');
    setSchluesselMeldung(null);
    setSchluesselFehler(null);
  }

  async function sichern() {
    if (ohneProjekt || fehler) return;
    setSpeicherFehler(null);
    try {
      await speichern(einstellungenAusWerten(werte));
      schliessen();
    } catch (e) {
      setSpeicherFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function schluesselHinterlegen(e: FormEvent) {
    e.preventDefault();
    if (!neuerSchluessel.trim() || beschaeftigt) return;
    setBeschaeftigt(true);
    setSchluesselFehler(null);
    setSchluesselMeldung(null);
    try {
      const ersetzt = schluesselStatus === 'vorhanden';
      await schluesselSetzen(neuerSchluessel, anbieter);
      setSchluesselMeldung(ersetzt ? texte().ki.einstellungen.schluesselErsetzt : texte().ki.einstellungen.schluesselHinterlegt);
    } catch (err) {
      setSchluesselFehler(kiFehlerAnzeige(err).text);
    } finally {
      setNeuerSchluessel('');
      setBeschaeftigt(false);
    }
  }

  async function schluesselEntfernen() {
    setBeschaeftigt(true);
    setSchluesselFehler(null);
    setSchluesselMeldung(null);
    try {
      await schluesselLoeschen(anbieter);
      setSchluesselMeldung(texte().ki.einstellungen.schluesselGeloescht);
    } catch (err) {
      setSchluesselFehler(kiFehlerAnzeige(err).text);
    } finally {
      setBeschaeftigt(false);
    }
  }

  return (
    <Dialog
      titel={T.titel}
      onSchliessen={schliessen}
      breite={600}
      aktionen={
        <>
          <Button onClick={schliessen}>{t.gemeinsam.abbrechen}</Button>
          <Button variante="primaer" onClick={() => void sichern()} disabled={ohneProjekt || !!fehler || !geaendert}>
            {t.gemeinsam.sichern}
          </Button>
        </>
      }
    >
      <SprachWahlAbschnitt />

      <section className="pw-ki-abschnitt" aria-labelledby="ki-anbieter">
        <Abschnittslabel as="h3" id="ki-anbieter">
          {T.anbieterAbschnitt}
        </Abschnittslabel>
        <Segment label={T.anbieterLabel} rolle="group" voll groesse="hoch" wert={anbieter} onChange={anbieterWaehlen} optionen={ANBIETER_OPTIONEN} />
        {ohneProjekt && <p className="pw-ki-klein">{T.ohneProjekt}</p>}

        {anbieter === 'foundry' ? (
          <>
            <Feld label={T.endpoint}>
              {(id) => (
                <Textfeld
                  id={id}
                  value={werte.endpoint}
                  disabled={ohneProjekt}
                  placeholder="https://<resource>.services.ai.azure.com/anthropic"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!!fehler}
                  onChange={(e) => setWerte({ ...werte, endpoint: e.target.value })}
                />
              )}
            </Feld>
            <p className="pw-ki-klein" style={fehler ? { color: 'var(--accent-dark)' } : undefined}>
              {fehler ?? T.endpointHilfe}
            </p>
            <ModellFelder modelle={werte.deployments} deaktiviert={ohneProjekt} onChange={(deployments) => setWerte({ ...werte, deployments })} />
            <p className="pw-ki-klein">{T.foundryModelle}</p>
          </>
        ) : (
          <>
            <Feld label={T.basisUrl}>
              {(id) => (
                <Textfeld
                  id={id}
                  value={werte.claude.endpoint}
                  disabled={ohneProjekt}
                  placeholder={CLAUDE_API_ENDPOINT}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!!fehler}
                  onChange={(e) => setWerte({ ...werte, claude: { ...werte.claude, endpoint: e.target.value } })}
                />
              )}
            </Feld>
            <p className="pw-ki-klein" style={fehler ? { color: 'var(--accent-dark)' } : undefined}>
              {fehler ?? f(T.basisUrlHilfe, { url: CLAUDE_API_ENDPOINT })}
            </p>
            <ModellFelder
              modelle={werte.claude.modelle}
              deaktiviert={ohneProjekt}
              onChange={(modelle) => setWerte({ ...werte, claude: { ...werte.claude, modelle } })}
            />
            <p className="pw-ki-klein">{T.claudeModelle}</p>
          </>
        )}
        {speicherFehler && <div className="pw-ki-hinweis" role="alert">{speicherFehler}</div>}
      </section>

      <section className="pw-ki-abschnitt" aria-labelledby="ki-schluessel">
        <Abschnittslabel as="h3" id="ki-schluessel">
          {f(T.schluesselAbschnitt, { name })}
        </Abschnittslabel>
        <div className="pw-ki-status" role="status">
          <StrangPunkt farbe={schluesselStatus === 'vorhanden' ? 'var(--real-gesichert)' : 'var(--status-entwurf)'} groesse={8} />
          {schluesselStatus === 'vorhanden' ? T.imSchluesselbund : schluesselStatus === 'fehlt' ? T.keinSchluessel : T.statusPruefen}
          {schluesselStatus === 'vorhanden' && (
            <Button variante="text" klein onClick={() => void schluesselEntfernen()} disabled={beschaeftigt} style={{ marginLeft: 'auto' }}>
              {t.gemeinsam.loeschen}
            </Button>
          )}
        </div>
        <form className="pw-ki-reihe" onSubmit={(e) => void schluesselHinterlegen(e)}>
          <Textfeld
            type="password"
            aria-label={schluesselStatus === 'vorhanden' ? T.neuerSchluessel : T.schluesselEingeben}
            placeholder={
              schluesselStatus === 'vorhanden' ? T.platzhalterErsetzen : anbieter === 'claude' ? T.platzhalterClaude : T.platzhalterFoundry
            }
            value={neuerSchluessel}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setNeuerSchluessel(e.target.value)}
          />
          <Button type="submit" disabled={!neuerSchluessel.trim() || beschaeftigt}>
            {schluesselStatus === 'vorhanden' ? T.ersetzen : T.hinterlegen}
          </Button>
        </form>
        {schluesselFehler && <div className="pw-ki-hinweis" role="alert">{schluesselFehler}</div>}
        {schluesselMeldung && <p className="pw-ki-klein" role="status">{schluesselMeldung}</p>}
        <p className="pw-ki-klein">{backendArt === 'tauri' ? T.hinweisTauri : T.hinweisDemo}</p>
      </section>

      <p className="pw-ki-klein">{f(T.datenschutz, { name })}</p>
    </Dialog>
  );
}

export default EinstellungenDialog;
