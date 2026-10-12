/**
 * Dialog „Einstellungen“: KI-Anbieter (Microsoft Foundry oder Claude API), Endpoint und Modelle je
 * Anbieter, API-Schlüssel je Anbieter (Schlüsselbund). Beim Umschalten bleiben die Einstellungen
 * des anderen Anbieters erhalten und werden mitgespeichert.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ANBIETER_NAME, CLAUDE_API_ENDPOINT, STANDARD_MODELLE } from '@core/ki/index';
import type { KiAnbieter, KiEinstellungen, KiModelle } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
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
    return 'Das ist keine gültige Adresse.';
  }
  if (url.protocol !== 'https:') return 'Der Endpoint muss mit https:// beginnen.';
  return null;
}

const ROLLEN = [
  { schluessel: 'erkennung', label: 'Erkennung (Haiku)' },
  { schluessel: 'pruefung', label: 'Prüfung (Sonnet)' },
  { schluessel: 'tiefencheck', label: 'Tiefencheck (Opus)' },
] as const;

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
  return (
    <div className="pw-ki-felder pw-ki-felder--drei">
      {ROLLEN.map((r) => (
        <Feld key={r.schluessel} label={r.label}>
          {(id) => (
            <Textfeld
              id={id}
              value={modelle[r.schluessel]}
              disabled={deaktiviert}
              placeholder={STANDARD_MODELLE[r.schluessel]}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onChange({ ...modelle, [r.schluessel]: e.target.value })}
            />
          )}
        </Feld>
      ))}
    </div>
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
      setSchluesselMeldung(ersetzt ? 'Schlüssel ersetzt.' : 'Schlüssel hinterlegt.');
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
      setSchluesselMeldung('Schlüssel gelöscht.');
    } catch (err) {
      setSchluesselFehler(kiFehlerAnzeige(err).text);
    } finally {
      setBeschaeftigt(false);
    }
  }

  return (
    <Dialog
      titel="Einstellungen"
      onSchliessen={schliessen}
      breite={600}
      aktionen={
        <>
          <Button onClick={schliessen}>Abbrechen</Button>
          <Button variante="primaer" onClick={() => void sichern()} disabled={ohneProjekt || !!fehler || !geaendert}>
            Sichern
          </Button>
        </>
      }
    >
      <section className="pw-ki-abschnitt" aria-labelledby="ki-anbieter">
        <Abschnittslabel as="h3" id="ki-anbieter">
          KI-Prüfung · Anbieter
        </Abschnittslabel>
        <Segment label="KI-Anbieter" rolle="group" voll groesse="hoch" wert={anbieter} onChange={anbieterWaehlen} optionen={ANBIETER_OPTIONEN} />
        {ohneProjekt && <p className="pw-ki-klein">Die KI-Einstellungen stehen in projekt.md. Öffne zuerst ein Projekt.</p>}

        {anbieter === 'foundry' ? (
          <>
            <Feld label="Endpoint">
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
              {fehler ?? 'Basis-URL aus Foundry, ohne /v1/messages.'}
            </p>
            <ModellFelder modelle={werte.deployments} deaktiviert={ohneProjekt} onChange={(deployments) => setWerte({ ...werte, deployments })} />
            <p className="pw-ki-klein">Eingetragen werden die Deployment-Namen aus Foundry. Region und Hosting sind egal.</p>
          </>
        ) : (
          <>
            <Feld label="Basis-URL">
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
              {fehler ?? `Leer lassen für ${CLAUDE_API_ENDPOINT} (ohne /v1/messages).`}
            </p>
            <ModellFelder
              modelle={werte.claude.modelle}
              deaktiviert={ohneProjekt}
              onChange={(modelle) => setWerte({ ...werte, claude: { ...werte.claude, modelle } })}
            />
            <p className="pw-ki-klein">
              Eingetragen werden Modell-IDs der Claude API. Lehnen die Sicherheitsfilter von Sonnet oder Opus 5.5 eine
              Anfrage ab, antwortet automatisch ein Ersatzmodell von Anthropic (serverseitiger Fallback).
            </p>
          </>
        )}
        {speicherFehler && <div className="pw-ki-hinweis" role="alert">{speicherFehler}</div>}
      </section>

      <section className="pw-ki-abschnitt" aria-labelledby="ki-schluessel">
        <Abschnittslabel as="h3" id="ki-schluessel">
          API-Schlüssel · {name}
        </Abschnittslabel>
        <div className="pw-ki-status" role="status">
          <StrangPunkt farbe={schluesselStatus === 'vorhanden' ? 'var(--real-gesichert)' : 'var(--status-entwurf)'} groesse={8} />
          {schluesselStatus === 'vorhanden'
            ? 'Im Schlüsselbund hinterlegt'
            : schluesselStatus === 'fehlt'
              ? 'Kein Schlüssel hinterlegt'
              : 'Status wird geprüft …'}
          {schluesselStatus === 'vorhanden' && (
            <Button variante="text" klein onClick={() => void schluesselEntfernen()} disabled={beschaeftigt} style={{ marginLeft: 'auto' }}>
              Löschen
            </Button>
          )}
        </div>
        <form className="pw-ki-reihe" onSubmit={(e) => void schluesselHinterlegen(e)}>
          <Textfeld
            type="password"
            aria-label={schluesselStatus === 'vorhanden' ? 'Neuen Schlüssel eingeben' : 'Schlüssel eingeben'}
            placeholder={
              schluesselStatus === 'vorhanden'
                ? 'Neuen Schlüssel einfügen, um ihn zu ersetzen'
                : anbieter === 'claude'
                  ? 'API-Schlüssel von Anthropic einfügen'
                  : 'Schlüssel aus Foundry einfügen'
            }
            value={neuerSchluessel}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setNeuerSchluessel(e.target.value)}
          />
          <Button type="submit" disabled={!neuerSchluessel.trim() || beschaeftigt}>
            {schluesselStatus === 'vorhanden' ? 'Ersetzen' : 'Hinterlegen'}
          </Button>
        </form>
        {schluesselFehler && <div className="pw-ki-hinweis" role="alert">{schluesselFehler}</div>}
        {schluesselMeldung && <p className="pw-ki-klein" role="status">{schluesselMeldung}</p>}
        <p className="pw-ki-klein">
          {backendArt === 'tauri'
            ? 'Der Schlüssel liegt im macOS-Schlüsselbund, je Anbieter ein eigener Eintrag. Die App zeigt ihn nie an und speichert ihn nicht im Projekt.'
            : 'Browser-Demo: Der Schlüssel wird nicht gespeichert, die Prüfung nutzt Demo-Antworten ohne Netz.'}
        </p>
      </section>

      <p className="pw-ki-klein">
        An {name} gehen nur Kapiteltexte und -titel, Namen und Aliase von Figuren und Orten, Gruppennamen,
        Realitätsebenen und die Planung von Figuren und Kapiteln – nie Wahrheit, Notizen, Anmerkungen oder Ideen.
      </p>
    </Dialog>
  );
}

export default EinstellungenDialog;
