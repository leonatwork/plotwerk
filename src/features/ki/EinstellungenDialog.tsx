/**
 * Dialog „Einstellungen“: KI-Anbieter (Microsoft Foundry, Claude API oder ein OpenAI-kompatibler
 * Dienst), Endpoint und Modelle je Anbieter, API-Schlüssel je Anbieter (Schlüsselbund). Beim
 * Umschalten bleiben die Einstellungen der anderen Anbieter erhalten und werden mitgespeichert.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ANBIETER_NAME, CLAUDE_API_ENDPOINT, KI_VORLAGEN, kiMitStandards, STANDARD_MODELLE, VORLAGEN } from '@core/ki/index';
import type { KiAnbieter, KiEinstellungen, KiModelle, KiOpenAiEinstellungen, KiVorlage } from '@core/model/types';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, setzeSprachWahl, texte, useSprachWahl, useTexte, type SprachWahl } from '../../i18n';
import { FunktionenEinstellungen } from '../funktionen/EinstellungenAbschnitt';
import { kiFehlerAnzeige } from '../../state/slices/ki';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Dialog, Feld, Segment, StrangPunkt, Textfeld } from '../../ui';
import './ki.css';
import { DarstellungAbschnitt } from './DarstellungAbschnitt';

/** Basis-URL ohne „/“ und ohne „/v1/messages“ am Ende. */
export function endpointNormalisieren(wert: string): string {
  return wert
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/messages(\/count_tokens)?$/i, '')
    .replace(/\/+$/, '');
}

/** OpenAI-kompatibel: Basis-URL samt /v1, ohne „/“ und ohne „/chat/completions“ am Ende. */
export function openAiEndpointNormalisieren(wert: string): string {
  return wert
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/+$/, '');
}

const LOKALE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `httpLokal`: http:// ist für localhost erlaubt (lokale Server wie Ollama und LM Studio). */
export function endpointFehler(wert: string, httpLokal = false): string | null {
  const e = httpLokal ? openAiEndpointNormalisieren(wert) : endpointNormalisieren(wert);
  if (!e) return null;
  let url: URL;
  try {
    url = new URL(e);
  } catch {
    return texte().ki.einstellungen.ungueltig;
  }
  if (url.protocol === 'https:') return null;
  if (httpLokal) return url.protocol === 'http:' && LOKALE_HOSTS.has(url.hostname) ? null : texte().ki.einstellungen.httpsLokal;
  return texte().ki.einstellungen.https;
}

/** Kontextlänge aus dem Feld: leer = keine Angabe, sonst ganze Zahl > 0 (Tausenderpunkte erlaubt); NaN = ungültig. */
export function kontextAusText(wert: string): number | undefined {
  const t = wert.replace(/[\s.,'’_]/g, '');
  if (!t) return undefined;
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
}

/** Modellrollen; Beschriftung aus t.ki.einstellungen.rollen bzw. rollenAllgemein */
const ROLLEN = ['erkennung', 'pruefung', 'tiefencheck'] as const;

/** Bearbeitungsstand aller Anbieter (Rohwerte der Felder; Kontextlänge als Text). */
export type EinstellungsWerte = Required<KiEinstellungen> & { kontextText: string };

function modelleSauber(m: KiModelle): KiModelle {
  return {
    erkennung: m.erkennung.trim() || STANDARD_MODELLE.erkennung,
    pruefung: m.pruefung.trim() || STANDARD_MODELLE.pruefung,
    tiefencheck: m.tiefencheck.trim() || STANDARD_MODELLE.tiefencheck,
  };
}

function openAiSauber(w: EinstellungsWerte): KiOpenAiEinstellungen {
  const o = w.openai;
  const kontext = kontextAusText(w.kontextText);
  return {
    vorlage: o.vorlage,
    endpoint: openAiEndpointNormalisieren(o.endpoint) || VORLAGEN[o.vorlage].endpoint,
    modelle: { erkennung: o.modelle.erkennung.trim(), pruefung: o.modelle.pruefung.trim(), tiefencheck: o.modelle.tiefencheck.trim() },
    ...(kontext && Number.isFinite(kontext) ? { kontextTokens: kontext } : {}),
  };
}

/**
 * Was in projekt.md landet: Foundry und Claude API normalisiert (leere Modelle = Standard); den
 * OpenAI-kompatiblen Block nur, wenn er gewählt oder bearbeitet ist (sonst bleibt ein vorhandener erhalten).
 */
export function einstellungenAusWerten(w: EinstellungsWerte): KiEinstellungen {
  const openai = openAiSauber(w);
  const unberuehrt = JSON.stringify(openai) === JSON.stringify(kiMitStandards(undefined).openai);
  return {
    endpoint: endpointNormalisieren(w.endpoint),
    deployments: modelleSauber(w.deployments),
    anbieter: w.anbieter,
    claude: {
      endpoint: endpointNormalisieren(w.claude.endpoint) || CLAUDE_API_ENDPOINT,
      modelle: modelleSauber(w.claude.modelle),
    },
    ...(w.anbieter === 'openai' || !unberuehrt ? { openai } : {}),
  };
}

function ModellFelder({
  modelle,
  deaktiviert,
  beschriftung,
  platzhalter,
  onChange,
}: {
  modelle: KiModelle;
  deaktiviert: boolean;
  beschriftung: Record<(typeof ROLLEN)[number], string>;
  platzhalter: Readonly<KiModelle>;
  onChange(m: KiModelle): void;
}) {
  return (
    <div className="pw-ki-felder pw-ki-felder--drei">
      {ROLLEN.map((r) => (
        <Feld key={r} label={beschriftung[r]}>
          {(id) => (
            <Textfeld
              id={id}
              value={modelle[r]}
              disabled={deaktiviert}
              placeholder={platzhalter[r]}
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

function Hilfe({ fehler, children }: { fehler: string | null; children: string }) {
  return (
    <p className="pw-ki-klein" style={fehler ? { color: 'var(--accent-dark)' } : undefined}>
      {fehler ?? children}
    </p>
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

  const [anfang] = useState<EinstellungsWerte>(() => {
    const ki = kiEinstellungen();
    return { ...ki, kontextText: ki.openai.kontextTokens ? String(ki.openai.kontextTokens) : '' };
  });
  const [werte, setWerte] = useState<EinstellungsWerte>(anfang);
  const [neuerSchluessel, setNeuerSchluessel] = useState('');
  const [schluesselMeldung, setSchluesselMeldung] = useState<string | null>(null);
  const [schluesselFehler, setSchluesselFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const t = useTexte();
  const T = t.ki.einstellungen;

  const anbieter = werte.anbieter;
  const vorlage = VORLAGEN[werte.openai.vorlage];
  const name = anbieter === 'openai' ? vorlage.name : ANBIETER_NAME[anbieter];
  const schluesselStatus = schluesselJe[anbieter];

  useEffect(() => {
    void schluesselPruefen(anbieter);
  }, [schluesselPruefen, anbieter]);

  const ohneProjekt = !projekt;
  const endpointFalsch =
    anbieter === 'openai'
      ? endpointFehler(werte.openai.endpoint, true)
      : endpointFehler(anbieter === 'claude' ? werte.claude.endpoint : werte.endpoint);
  const openAiFehler =
    anbieter !== 'openai'
      ? null
      : !openAiEndpointNormalisieren(werte.openai.endpoint) && !vorlage.endpoint
        ? T.openAiBasisUrlEigen
        : !ROLLEN.some((r) => werte.openai.modelle[r].trim())
          ? T.keinModell
          : Number.isNaN(kontextAusText(werte.kontextText))
            ? T.kontextFalsch
            : null;
  const fehler = endpointFalsch ?? openAiFehler;
  const geaendert = JSON.stringify(einstellungenAusWerten(werte)) !== JSON.stringify(einstellungenAusWerten(anfang));

  const anbieterOptionen: { wert: KiAnbieter; label: string }[] = [
    { wert: 'foundry', label: ANBIETER_NAME.foundry },
    { wert: 'claude', label: ANBIETER_NAME.claude },
    { wert: 'openai', label: T.anbieterOpenAi },
  ];

  function anbieterWaehlen(a: KiAnbieter) {
    if (a === anbieter) return;
    setWerte({ ...werte, anbieter: a });
    setNeuerSchluessel('');
    setSchluesselMeldung(null);
    setSchluesselFehler(null);
  }

  /** Neuer Dienst: dessen Standard-URL; Modellnamen bleiben stehen. */
  function vorlageWaehlen(v: KiVorlage) {
    setWerte({ ...werte, openai: { ...werte.openai, vorlage: v, endpoint: VORLAGEN[v].endpoint } });
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

  const platzhalterSchluessel =
    schluesselStatus === 'vorhanden'
      ? T.platzhalterErsetzen
      : anbieter === 'claude'
        ? T.platzhalterClaude
        : anbieter === 'openai'
          ? f(T.platzhalterOpenAi, { name })
          : T.platzhalterFoundry;

  const datenschutz =
    anbieter === 'openai' && vorlage.lokal
      ? T.datenschutzLokal
      : anbieter === 'openai' && werte.openai.vorlage === 'openrouter'
        ? `${f(T.datenschutz, { name })} ${T.datenschutzOpenRouter}`
        : f(T.datenschutz, { name });

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
      <DarstellungAbschnitt />
      <FunktionenEinstellungen />

      <section className="pw-ki-abschnitt" aria-labelledby="ki-anbieter">
        <Abschnittslabel as="h3" id="ki-anbieter">
          {T.anbieterAbschnitt}
        </Abschnittslabel>
        <Segment label={T.anbieterLabel} rolle="group" voll groesse="hoch" wert={anbieter} onChange={anbieterWaehlen} optionen={anbieterOptionen} />
        {ohneProjekt && <p className="pw-ki-klein">{T.ohneProjekt}</p>}

        {anbieter === 'foundry' && (
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
                  aria-invalid={!!endpointFalsch}
                  onChange={(e) => setWerte({ ...werte, endpoint: e.target.value })}
                />
              )}
            </Feld>
            <Hilfe fehler={endpointFalsch}>{T.endpointHilfe}</Hilfe>
            <ModellFelder
              modelle={werte.deployments}
              deaktiviert={ohneProjekt}
              beschriftung={T.rollen}
              platzhalter={STANDARD_MODELLE}
              onChange={(deployments) => setWerte({ ...werte, deployments })}
            />
            <p className="pw-ki-klein">{T.foundryModelle}</p>
          </>
        )}

        {anbieter === 'claude' && (
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
                  aria-invalid={!!endpointFalsch}
                  onChange={(e) => setWerte({ ...werte, claude: { ...werte.claude, endpoint: e.target.value } })}
                />
              )}
            </Feld>
            <Hilfe fehler={endpointFalsch}>{f(T.basisUrlHilfe, { url: CLAUDE_API_ENDPOINT })}</Hilfe>
            <ModellFelder
              modelle={werte.claude.modelle}
              deaktiviert={ohneProjekt}
              beschriftung={T.rollen}
              platzhalter={STANDARD_MODELLE}
              onChange={(modelle) => setWerte({ ...werte, claude: { ...werte.claude, modelle } })}
            />
            <p className="pw-ki-klein">{T.claudeModelle}</p>
          </>
        )}

        {anbieter === 'openai' && (
          <>
            <div className="pw-ki-felder pw-ki-felder--url">
              <Feld label={T.dienst}>
                {(id) => (
                  <select
                    id={id}
                    className="pw-ki-select"
                    value={werte.openai.vorlage}
                    disabled={ohneProjekt}
                    onChange={(e) => vorlageWaehlen(e.target.value as KiVorlage)}
                  >
                    {KI_VORLAGEN.map((v) => (
                      <option key={v} value={v}>
                        {VORLAGEN[v].name}
                      </option>
                    ))}
                  </select>
                )}
              </Feld>
              <Feld label={T.openAiBasisUrl}>
                {(id) => (
                  <Textfeld
                    id={id}
                    value={werte.openai.endpoint}
                    disabled={ohneProjekt}
                    placeholder={vorlage.endpoint || 'https://…/v1'}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!!endpointFalsch}
                    onChange={(e) => setWerte({ ...werte, openai: { ...werte.openai, endpoint: e.target.value } })}
                  />
                )}
              </Feld>
            </div>
            <Hilfe fehler={endpointFalsch}>
              {vorlage.endpoint ? f(T.openAiBasisUrlHilfe, { name: vorlage.name, url: vorlage.endpoint }) : T.openAiBasisUrlEigen}
            </Hilfe>
            <ModellFelder
              modelle={werte.openai.modelle}
              deaktiviert={ohneProjekt}
              beschriftung={T.rollenAllgemein}
              platzhalter={vorlage.beispiele}
              onChange={(modelle) => setWerte({ ...werte, openai: { ...werte.openai, modelle } })}
            />
            <Hilfe fehler={openAiFehler === T.keinModell ? openAiFehler : null}>{T.openAiModelle}</Hilfe>
            <div className="pw-ki-felder pw-ki-felder--drei">
              <Feld label={T.kontext}>
                {(id) => (
                  <Textfeld
                    id={id}
                    value={werte.kontextText}
                    disabled={ohneProjekt}
                    placeholder={T.kontextPlatzhalter}
                    inputMode="numeric"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={Number.isNaN(kontextAusText(werte.kontextText))}
                    onChange={(e) => setWerte({ ...werte, kontextText: e.target.value })}
                  />
                )}
              </Feld>
            </div>
            <Hilfe fehler={openAiFehler === T.kontextFalsch ? openAiFehler : null}>{vorlage.lokal ? T.kontextLokal : T.kontextCloud}</Hilfe>
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
        {anbieter === 'openai' && vorlage.ohneSchluessel && <p className="pw-ki-klein">{f(T.schluesselOptional, { name })}</p>}
        <form className="pw-ki-reihe" onSubmit={(e) => void schluesselHinterlegen(e)}>
          <Textfeld
            type="password"
            aria-label={schluesselStatus === 'vorhanden' ? T.neuerSchluessel : T.schluesselEingeben}
            placeholder={platzhalterSchluessel}
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

      <p className="pw-ki-klein">{datenschutz}</p>
    </Dialog>
  );
}

export default EinstellungenDialog;
