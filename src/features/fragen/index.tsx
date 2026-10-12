/**
 * Bereich „Fragen“ (G6 KI-Leser): Fragen an das Buch als Chat-Verlauf (.plotwerk/fragen.json).
 * Jede Antwort kommt nur aus dem Buchtext und zeigt wörtliche Belege (Klick → Stelle im Editor);
 * Antworten ohne prüfbaren Beleg sind als „ohne Beleg“ markiert. Die KI schreibt keinen Text. Besitzer: G6.
 */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { ohneBeleg } from '@core/ki/index';
import type { BuchFrage, ProjektDaten } from '@core/model/types';
import { f, texte, useTexte, zahl } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Inspektor, Segment, Werkzeugseite } from '../../ui';
import { Belege, Etikett, formatiereDatum, formatiereKosten, KiFehlerKasten } from './gemeinsam';

function Eintrag({ daten, frage: fr, hinweis }: { daten: ProjektDaten; frage: BuchFrage; hinweis?: string }) {
  const entfernen = useStore((s) => s.kileser.frageEntfernen);
  const tt = useTexte();
  const t = tt.fragen.ansicht;
  const ohne = ohneBeleg(fr);
  return (
    <article className="pw-kl-eintrag" aria-label={f(t.frageLabel, { frage: fr.frage })}>
      <div className="pw-kl-frage">{fr.frage}</div>
      <div className={`pw-kl-antwort${ohne ? ' pw-kl-antwort--ohne' : ''}`}>
        <p className="pw-kl-antwort__text">{fr.antwort}</p>
        {ohne && (
          <div className="pw-kl-antwort__ohne">
            <Etikett art="warn" title={t.ohneBelegTitel}>
              {fr.imBuch === false ? t.nichtImBuch : t.ohneBeleg}
            </Etikett>
            <span>{fr.imBuch === false ? t.laut : fr.imBuch === true ? t.verworfen : t.keineStelle}</span>
          </div>
        )}
        <Belege daten={daten} belege={fr.belege} />
        <div className="pw-kl-meta">
          <span>{formatiereDatum(fr.datum)}</span>
          {fr.modell && <span>· {fr.modell}</span>}
          {fr.kostenUsd !== undefined && <span>· {formatiereKosten(fr.kostenUsd)}</span>}
          {!ohne && <span>· {f(t.belegAnzahl, { n: fr.belege.length })}</span>}
          {hinweis && <span className="pw-kl-meta__hinweis">· {hinweis}</span>}
          <button
            type="button"
            className="pw-kl-weg"
            aria-label={f(t.entfernenLabel, { frage: fr.frage })}
            onClick={async () => (await bestaetigen(f(t.entfernenFrage, { frage: fr.frage }), { knopf: tt.gemeinsam.entfernen })) && void entfernen(fr.id)}
          >
            {tt.gemeinsam.entfernen}
          </button>
        </div>
      </div>
    </article>
  );
}

function Kostenzeile() {
  const schnell = useStore((s) => s.kileser.schnell);
  const schaetzung = useStore((s) => s.kileser.fragenSchaetzung);
  const schaetzen = useStore((s) => s.kileser.fragenSchaetzen);
  const hatDaten = useStore((s) => !!s.daten);
  const alle = useTexte();
  const t = alle.fragen.ansicht;
  const kostenUnbekanntText = alle.ki.kostenUnbekannt;
  useEffect(() => {
    if (hatDaten) void schaetzen();
  }, [schnell, hatDaten, schaetzen]);
  const w = schaetzung && schaetzung.schnell === schnell ? schaetzung.wert : null;
  if (!w) return <span>{t.kostenSchaetzen}</span>;
  return (
    <span title={f(w.gezaehlt ? t.kostenTitel : t.kostenTitelGeschaetzt, { modell: w.modell, n: zahl(w.eingabeTokens) })}>
      {w.kostenBekannt === false ? kostenUnbekanntText : f(t.kostenZeile, { erste: formatiereKosten(w.ersteUsd), weitere: formatiereKosten(w.weitereUsd) })}
    </span>
  );
}

function Eingabe({ feldRef }: { feldRef: RefObject<HTMLTextAreaElement> }) {
  const entwurf = useStore((s) => s.kileser.entwurf);
  const setzeEntwurf = useStore((s) => s.kileser.setzeEntwurf);
  const fragen = useStore((s) => s.kileser.fragen);
  const lauf = useStore((s) => s.kileser.frageLauf);
  const letzte = useStore((s) => s.daten?.kiFragen?.eintraege.at(-1)?.frage);
  const t = useTexte().fragen.ansicht;

  // Höhe an den Inhalt anpassen
  useEffect(() => {
    const el = feldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [entwurf, feldRef]);

  const senden = async () => {
    const frage = entwurf.trim();
    if (!frage || lauf) return;
    setzeEntwurf('');
    const ok = await fragen(frage);
    // bei Fehler die Frage zurück ins Feld (wenn Leon inzwischen nichts Neues getippt hat)
    if (!ok && !useStore.getState().kileser.entwurf.trim()) setzeEntwurf(frage);
    feldRef.current?.focus();
  };

  const taste = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void senden();
    } else if (e.key === 'ArrowUp' && !entwurf && letzte) {
      e.preventDefault();
      setzeEntwurf(letzte);
    } else if (e.key === 'Escape' && entwurf) {
      e.preventDefault();
      e.stopPropagation();
      setzeEntwurf('');
    }
  };

  return (
    <form
      className="pw-kl-eingabe"
      onSubmit={(e) => {
        e.preventDefault();
        void senden();
      }}
    >
      <div className="pw-kl-eingabe__zeile">
        <textarea
          ref={feldRef}
          rows={1}
          autoFocus
          aria-label={t.eingabeLabel}
          placeholder={t.eingabePlatzhalter}
          value={entwurf}
          onChange={(e) => setzeEntwurf(e.target.value)}
          onKeyDown={taste}
        />
        <Button type="submit" variante="primaer" klein disabled={!entwurf.trim() || !!lauf}>
          {t.fragen}
        </Button>
      </div>
      <div className="pw-kl-eingabe__fuss">
        <span>
          <span className="pw-kl-taste">↩</span> {t.tasteFragen} · <span className="pw-kl-taste">⇧↩</span> {t.tasteZeile} · <span className="pw-kl-taste">↑</span>{' '}
          {t.tasteLetzte}
        </span>
        <Kostenzeile />
      </div>
    </form>
  );
}

function Seitenspalte() {
  const schnell = useStore((s) => s.kileser.schnell);
  const setzeSchnell = useStore((s) => s.kileser.setzeSchnell);
  const leeren = useStore((s) => s.kileser.verlaufLeeren);
  const anzahl = useStore((s) => s.daten?.kiFragen?.eintraege.length ?? 0);
  const kosten = useStore((s) => (s.daten?.kiFragen?.eintraege ?? []).reduce((summe, f) => summe + (f.kostenUsd ?? 0), 0));
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const kapitel = useStore((s) => s.auswahl.kapitel);
  const tt = useTexte().fragen;
  const t = tt.ansicht;
  return (
    <Inspektor label={tt.titel} breite={300}>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">{t.soAntwortet}</span>
        <ul className="pw-kl-regeln">
          {t.regeln.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label" id="pw-kl-modell">
          {t.modell}
        </span>
        <Segment
          label={t.modellLabel}
          rolle="group"
          voll
          wert={schnell ? 'schnell' : 'gruendlich'}
          onChange={(w) => setzeSchnell(w === 'schnell')}
          optionen={[
            { wert: 'gruendlich', label: t.gruendlich },
            { wert: 'schnell', label: t.schnell },
          ]}
        />
        <p className="pw-kl-klein">
          {schnell ? t.haiku : t.sonnet} {t.cache}
        </p>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">{t.leserSimulation}</span>
        <p className="pw-kl-klein">{t.leserSimulationText}</p>
        <Button klein onClick={() => oeffneDialog('leser-simulation', { kapitel })}>
          {t.leserSimulationKnopf}
        </Button>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">{t.verlauf}</span>
        <dl className="pw-kl-zeilen">
          <dt>{t.fragenAnzahl}</dt>
          <dd>{zahl(anzahl)}</dd>
          <dt>{t.kosten}</dt>
          <dd>{kosten > 0 ? formatiereKosten(kosten) : '–'}</dd>
        </dl>
        <p className="pw-kl-klein">{t.gespeichert}</p>
        <Button klein disabled={anzahl === 0} onClick={async () => (await bestaetigen(f(t.leerenFrage, { n: anzahl }), { knopf: t.leeren })) && void leeren()}>
          {t.leeren}
        </Button>
      </section>
    </Inspektor>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const lauf = useStore((s) => s.kileser.frageLauf);
  const fehler = useStore((s) => s.kileser.frageFehler);
  const hinweise = useStore((s) => s.kileser.frageHinweise);
  const fehlerZuruecksetzen = useStore((s) => s.kileser.fehlerZuruecksetzen);
  const setzeEntwurf = useStore((s) => s.kileser.setzeEntwurf);
  const verlaufRef = useRef<HTMLDivElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);
  const eintraege = daten?.kiFragen?.eintraege ?? [];
  const tt = useTexte().fragen;
  const t = tt.ansicht;

  // neue Antwort oder laufende Frage → ans Ende scrollen
  useEffect(() => {
    const el = verlaufRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [eintraege.length, lauf]);

  if (!daten) return null;
  const hatText = daten.projekt.kapitel.some((id) => daten.kapitel[id]?.text.trim());

  return (
    <Werkzeugseite
      titel={tt.titel}
      hinweis={eintraege.length ? f(t.hinweisVerlauf, { n: eintraege.length }) : t.hinweis}
      hintergrund="surface"
      inspektor={<Seitenspalte />}
    >
      <div className="pw-kl-chat">
        <div ref={verlaufRef} className="pw-kl-verlauf" role="log" aria-live="polite" aria-label={t.verlauf}>
          {eintraege.length === 0 && !lauf ? (
            <div className="pw-kl-leer">
              <h2 className="pw-kl-leer__titel">{t.leerTitel}</h2>
              <p className="pw-kl-text" style={{ maxWidth: 440 }}>
                {hatText ? t.leerMitText : t.leerOhneText}
              </p>
              {hatText && (
                <div className="pw-kl-beispiele" aria-label={t.beispielfragen}>
                  {t.beispiele.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className="pw-kl-beispiel"
                      onClick={() => {
                        setzeEntwurf(b);
                        feldRef.current?.focus();
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            eintraege.map((fr) => <Eintrag key={fr.id} daten={daten} frage={fr} hinweis={hinweise[fr.id]} />)
          )}
          {lauf && (
            <article className="pw-kl-eintrag" aria-busy="true">
              <div className="pw-kl-frage">{lauf.frage}</div>
              <div className="pw-kl-antwort">
                <span className="pw-kl-denkt">
                  <span className="pw-kl-denkt__punkte" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  {t.liest}
                </span>
              </div>
            </article>
          )}
        </div>
        {fehler && <KiFehlerKasten fehler={fehler} onSchliessen={fehlerZuruecksetzen} />}
        <Eingabe feldRef={feldRef} />
      </div>
    </Werkzeugseite>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const kapitel = useStore((s) => s.auswahl.kapitel);
  const t = useTexte().fragen.ansicht;
  return <Button onClick={() => oeffneDialog('leser-simulation', { kapitel })}>{t.leserSimulationKnopf}</Button>;
}

export function kontext(state: Store): string {
  const t = texte().fragen;
  const n = state.daten?.kiFragen?.eintraege.length ?? 0;
  return n ? f(t.kontextAnzahl, { n }) : t.titel;
}
