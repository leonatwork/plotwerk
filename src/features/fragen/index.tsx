/**
 * Bereich „Fragen“ (G6 KI-Leser): Fragen an das Buch als Chat-Verlauf (.plotwerk/fragen.json).
 * Jede Antwort kommt nur aus dem Buchtext und zeigt wörtliche Belege (Klick → Stelle im Editor);
 * Antworten ohne prüfbaren Beleg sind als „ohne Beleg“ markiert. Die KI schreibt keinen Text. Besitzer: G6.
 */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { ohneBeleg } from '@core/ki/index';
import type { BuchFrage, ProjektDaten } from '@core/model/types';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Inspektor, Segment, Werkzeugseite } from '../../ui';
import { Belege, Etikett, formatiereDatum, formatiereKosten, KiFehlerKasten } from './gemeinsam';

const BEISPIELE = ['Wo erwähne ich Pauls Bleistifte?', 'Wann taucht Fiete zum ersten Mal auf?', 'Was steht auf den Postkarten?', 'Wo trinkt Paul Tee?'];

function Eintrag({ daten, f, hinweis }: { daten: ProjektDaten; f: BuchFrage; hinweis?: string }) {
  const entfernen = useStore((s) => s.kileser.frageEntfernen);
  const ohne = ohneBeleg(f);
  return (
    <article className="pw-kl-eintrag" aria-label={`Frage: ${f.frage}`}>
      <div className="pw-kl-frage">{f.frage}</div>
      <div className={`pw-kl-antwort${ohne ? ' pw-kl-antwort--ohne' : ''}`}>
        <p className="pw-kl-antwort__text">{f.antwort}</p>
        {ohne && (
          <div className="pw-kl-antwort__ohne">
            <Etikett art="warn" title="Keine Stelle im Buch belegt diese Antwort wörtlich">
              {f.imBuch === false ? 'nicht im Buch' : 'ohne Beleg'}
            </Etikett>
            <span>
              {f.imBuch === false
                ? 'Laut Antwort steht das nicht im Buch.'
                : f.imBuch === true
                  ? 'Die genannten Belege standen nicht wörtlich im Buch und wurden verworfen.'
                  : 'Keine wörtliche Stelle im Buch stützt diese Antwort.'}
            </span>
          </div>
        )}
        <Belege daten={daten} belege={f.belege} />
        <div className="pw-kl-meta">
          <span>{formatiereDatum(f.datum)}</span>
          {f.modell && <span>· {f.modell}</span>}
          {f.kostenUsd !== undefined && <span>· {formatiereKosten(f.kostenUsd)}</span>}
          {!ohne && <span>· {f.belege.length === 1 ? '1 Beleg' : `${f.belege.length} Belege`}</span>}
          {hinweis && <span className="pw-kl-meta__hinweis">· {hinweis}</span>}
          <button
            type="button"
            className="pw-kl-weg"
            aria-label={`Frage „${f.frage}“ aus dem Verlauf entfernen`}
            onClick={async () => (await bestaetigen(`„${f.frage}“ aus dem Verlauf entfernen?`, { knopf: 'Entfernen' })) && void entfernen(f.id)}
          >
            Entfernen
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
  useEffect(() => {
    if (hatDaten) void schaetzen();
  }, [schnell, hatDaten, schaetzen]);
  const w = schaetzung && schaetzung.schnell === schnell ? schaetzung.wert : null;
  if (!w) return <span>Kosten werden geschätzt …</span>;
  return (
    <span title={`${w.modell} · ≈ ${w.eingabeTokens.toLocaleString('de-DE')} Eingabe-Tokens${w.gezaehlt ? '' : ' (über die Zeichenzahl geschätzt)'}`}>
      ≈ {formatiereKosten(w.ersteUsd)} je Frage · danach ≈ {formatiereKosten(w.weitereUsd)} (Buch aus dem Cache)
    </span>
  );
}

function Eingabe({ feldRef }: { feldRef: RefObject<HTMLTextAreaElement> }) {
  const entwurf = useStore((s) => s.kileser.entwurf);
  const setzeEntwurf = useStore((s) => s.kileser.setzeEntwurf);
  const fragen = useStore((s) => s.kileser.fragen);
  const lauf = useStore((s) => s.kileser.frageLauf);
  const letzte = useStore((s) => s.daten?.kiFragen?.eintraege.at(-1)?.frage);

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
          aria-label="Frage an das Buch"
          placeholder="Frag dein Buch – z. B. „Wo erwähne ich Pauls Bleistifte?“"
          value={entwurf}
          onChange={(e) => setzeEntwurf(e.target.value)}
          onKeyDown={taste}
        />
        <Button type="submit" variante="primaer" klein disabled={!entwurf.trim() || !!lauf}>
          Fragen
        </Button>
      </div>
      <div className="pw-kl-eingabe__fuss">
        <span>
          <span className="pw-kl-taste">↩</span> fragen · <span className="pw-kl-taste">⇧↩</span> neue Zeile · <span className="pw-kl-taste">↑</span> letzte Frage
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
  return (
    <Inspektor label="Fragen an das Buch" breite={300}>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">So antwortet die KI</span>
        <ul className="pw-kl-regeln">
          <li>nur aus dem Text deines Buchs</li>
          <li>jede Antwort mit wörtlichen Belegen – ein Klick öffnet die Stelle</li>
          <li>Belege, die nicht wörtlich im Buch stehen, werden verworfen</li>
          <li>keine Formulierungen, keine Schreibtipps</li>
        </ul>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label" id="pw-kl-modell">
          Modell
        </span>
        <Segment
          label="Modell für Fragen"
          rolle="group"
          voll
          wert={schnell ? 'schnell' : 'gruendlich'}
          onChange={(w) => setzeSchnell(w === 'schnell')}
          optionen={[
            { wert: 'gruendlich', label: 'Gründlich' },
            { wert: 'schnell', label: 'Schnell' },
          ]}
        />
        <p className="pw-kl-klein">
          {schnell ? 'Haiku: günstig und schnell, findet einzelne Stellen.' : 'Sonnet: gründlicher bei Fragen über mehrere Kapitel.'} Weitere Fragen innerhalb von fünf
          Minuten lesen das Buch aus dem Cache.
        </p>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">Leser-Simulation</span>
        <p className="pw-kl-klein">Was weiß eine Erstleserin nach Kapitel n, welche Fragen hat sie offen – und passt das zu deinem Plan?</p>
        <Button klein onClick={() => oeffneDialog('leser-simulation', { kapitel })}>
          Leser-Simulation …
        </Button>
      </section>
      <section className="pw-kl-inspektor">
        <span className="pw-kl-label">Verlauf</span>
        <dl className="pw-kl-zeilen">
          <dt>Fragen</dt>
          <dd>{anzahl}</dd>
          <dt>Kosten</dt>
          <dd>{kosten > 0 ? formatiereKosten(kosten) : '–'}</dd>
        </dl>
        <p className="pw-kl-klein">Gespeichert im Projektordner unter .plotwerk/fragen.json.</p>
        <Button
          klein
          disabled={anzahl === 0}
          onClick={async () => (await bestaetigen(`Alle ${anzahl} Fragen aus dem Verlauf entfernen?`, { knopf: 'Verlauf leeren' })) && void leeren()}
        >
          Verlauf leeren
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
      titel="Fragen an das Buch"
      hinweis={eintraege.length ? `${eintraege.length === 1 ? '1 Frage' : `${eintraege.length} Fragen`} im Verlauf · Antworten nur mit Belegstellen` : 'Antworten nur mit Belegstellen'}
      hintergrund="surface"
      inspektor={<Seitenspalte />}
    >
      <div className="pw-kl-chat">
        <div ref={verlaufRef} className="pw-kl-verlauf" role="log" aria-live="polite" aria-label="Verlauf">
          {eintraege.length === 0 && !lauf ? (
            <div className="pw-kl-leer">
              <h2 className="pw-kl-leer__titel">Frag dein Buch</h2>
              <p className="pw-kl-text" style={{ maxWidth: 440 }}>
                {hatText
                  ? 'Die Antworten kommen nur aus deinem Text und zeigen jede Stelle wörtlich. Ein Klick auf einen Beleg öffnet die Stelle im Editor.'
                  : 'Sobald dein Buch Text hat, kannst du hier nach Stellen, Figuren und Ereignissen fragen.'}
              </p>
              {hatText && (
                <div className="pw-kl-beispiele" aria-label="Beispielfragen">
                  {BEISPIELE.map((b) => (
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
            eintraege.map((f) => <Eintrag key={f.id} daten={daten} f={f} hinweis={hinweise[f.id]} />)
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
                  Das Buch wird gelesen …
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
  return <Button onClick={() => oeffneDialog('leser-simulation', { kapitel })}>Leser-Simulation …</Button>;
}

export function kontext(state: Store): string {
  const n = state.daten?.kiFragen?.eintraege.length ?? 0;
  return n ? `Fragen an das Buch · ${n}` : 'Fragen an das Buch';
}
