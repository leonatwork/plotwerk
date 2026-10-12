/**
 * Schalter der Editor-Werkzeuge in der Statusleiste (G4): Wiederholungen markieren und Vorlesen
 * (Start/Pause/Stopp, Stimme, Tempo). Der Typewriter-Modus sitzt in den Titelaktionen (⌘⇧T).
 */
import type { Id } from '@core/model/types';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../../../state/store';
import { klassen } from '../../../ui';
import { useVorleseFortschritt } from './fortschritt';
import { deutscheStimmen, sprachausgabe, vorlesenAb, waehleStimme } from './vorlesen';

/** Stimmen des Systems (kommen bei WebKit/Chromium erst nach „voiceschanged“). */
function useStimmen(): SpeechSynthesisVoice[] {
  const cache = useRef<SpeechSynthesisVoice[]>([]);
  return useSyncExternalStore(
    (h) => {
      const synth = sprachausgabe();
      if (!synth) return () => undefined;
      synth.addEventListener?.('voiceschanged', h);
      return () => synth.removeEventListener?.('voiceschanged', h);
    },
    () => {
      const neu = sprachausgabe()?.getVoices() ?? [];
      const alt = cache.current;
      if (neu.length !== alt.length || neu.some((v, i) => v.voiceURI !== alt[i]?.voiceURI)) cache.current = neu;
      return cache.current;
    },
  );
}

function Vorlesefenster({ schliessen }: { schliessen(fokusZurueck: boolean): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titelId = useId();
  const stimmen = useStimmen();
  const deutsch = deutscheStimmen(stimmen);
  const gewaehlt = useStore((s) => s.editorwerkzeuge.stimme);
  const tempo = useStore((s) => s.editorwerkzeuge.tempo);
  const status = useStore((s) => s.editorwerkzeuge.vorlesen);
  const ew = useStore.getState().editorwerkzeuge;
  const aktiv = waehleStimme(stimmen, gewaehlt);
  const andere = stimmen.filter((s) => !deutsch.includes(s)).sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const verfuegbar = !!sprachausgabe();
  const schliessenRef = useRef(schliessen);
  schliessenRef.current = schliessen;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('select, button')?.focus();
    const weg = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !(t instanceof Element && t.closest('[data-vorlesen-knopf]'))) schliessenRef.current(false);
    };
    window.addEventListener('mousedown', weg);
    return () => window.removeEventListener('mousedown', weg);
  }, []);

  const starten = (ab: 'anfang' | 'cursor') => {
    vorlesenAb(ab);
    if (status !== 'aus') ew.setzeVorlesen('aus');
    ew.setzeVorlesen('laeuft');
    schliessen(true);
  };

  return (
    <div
      ref={ref}
      className="pw-w-pop"
      role="dialog"
      aria-labelledby={titelId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          schliessen(true);
        }
      }}
    >
      <div id={titelId} className="pw-w-pop__titel">
        Vorlesen
      </div>
      {!verfuegbar ? (
        <p className="pw-w-leise">Die Sprachausgabe des Systems ist in diesem Fenster nicht verfügbar.</p>
      ) : (
        <>
          <label className="pw-w-pop__feld">
            <span>Stimme</span>
            <select value={gewaehlt ?? ''} onChange={(e) => ew.setzeStimme(e.target.value || null)} className="pw-w-auswahl">
              <option value="">Beste deutsche Stimme{aktiv && !gewaehlt ? ` (${aktiv.name})` : ''}</option>
              {deutsch.length > 0 && (
                <optgroup label="Deutsch">
                  {deutsch.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                      {v.lang !== 'de-DE' ? ` · ${v.lang}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {andere.length > 0 && (
                <optgroup label="Andere Sprachen">
                  {andere.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} · {v.lang}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {stimmen.length > 0 && !deutsch.length && (
            <p className="pw-w-leise">Keine deutsche Stimme installiert – unter macOS: Systemeinstellungen › Bedienungshilfen › Gesprochene Inhalte › Systemstimme › Stimmen verwalten.</p>
          )}
          <label className="pw-w-pop__feld">
            <span>
              Tempo <b>{tempo.toLocaleString('de-DE', { minimumFractionDigits: 2 })}×</b>
            </span>
            <input type="range" min={0.6} max={1.6} step={0.05} value={tempo} onChange={(e) => ew.setzeTempo(Number(e.target.value))} />
          </label>
          <p className="pw-w-leise">Neue Einstellungen gelten ab dem nächsten Satz.</p>
          <div className="pw-w-pop__knoepfe">
            <button type="button" className="pw-w-knopf pw-w-knopf--primaer" title="Liest die markierte Auswahl oder ab dem Satz am Cursor" onClick={() => starten('cursor')}>
              Ab Cursor
            </button>
            <button type="button" className="pw-w-knopf" onClick={() => starten('anfang')}>
              Kapitel von vorn
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function EditorWerkzeugleiste({ kapitelId }: { kapitelId: Id }) {
  const wiederholungen = useStore((s) => s.editorwerkzeuge.wiederholungen);
  const umschalten = useStore((s) => s.editorwerkzeuge.umschalteWiederholungen);
  const status = useStore((s) => s.editorwerkzeuge.vorlesen);
  const setzeVorlesen = useStore((s) => s.editorwerkzeuge.setzeVorlesen);
  const anzahl = useStore((s) => {
    const l = s.editorwerkzeuge.live;
    return l && l.kapitel === kapitelId ? l.bericht.nah.length + l.bericht.satzanfaenge.length : null;
  });
  const fortschritt = useVorleseFortschritt();
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const schliessen = (fokusZurueck: boolean) => {
    setOffen(false);
    if (fokusZurueck) knopf.current?.focus();
  };

  return (
    <span className="pw-w-leiste">
      {fortschritt.meldung && <span className="pw-w-meldung">{fortschritt.meldung}</span>}
      <button
        type="button"
        className={klassen('pw-w-schalter', wiederholungen && 'pw-w-schalter--an')}
        aria-pressed={wiederholungen}
        title="Wiederholungen im Text markieren – nur Hinweise, der Text bleibt unverändert"
        onClick={umschalten}
      >
        Wiederholungen{wiederholungen && anzahl !== null ? ` · ${anzahl}` : ''}
      </button>
      <span className="pw-w-vorlesegruppe">
        {status !== 'aus' && (
          <>
            <span className="pw-w-fortschritt" aria-live="off">
              {fortschritt.auswahl ? 'Auswahl · ' : ''}Satz {fortschritt.satz + 1}/{fortschritt.von || '…'}
            </span>
            <button
              type="button"
              className="pw-w-schalter pw-w-schalter--an"
              onClick={() => setzeVorlesen(status === 'laeuft' ? 'pausiert' : 'laeuft')}
              aria-label={status === 'laeuft' ? 'Vorlesen pausieren' : 'Vorlesen fortsetzen'}
            >
              {status === 'laeuft' ? 'Pause' : 'Weiter'}
            </button>
            <button type="button" className="pw-w-schalter" onClick={() => setzeVorlesen('aus')} title="Vorlesen beenden (Esc)">
              Stopp
            </button>
          </>
        )}
        <button
          ref={knopf}
          type="button"
          data-vorlesen-knopf
          className={klassen('pw-w-schalter', offen && 'pw-w-schalter--an')}
          aria-expanded={offen}
          aria-haspopup="dialog"
          title="Vorlesen mit der Stimme des Systems"
          onClick={() => setOffen((o) => !o)}
        >
          {status === 'aus' ? 'Vorlesen …' : 'Stimme …'}
        </button>
        {offen && <Vorlesefenster schliessen={schliessen} />}
      </span>
    </span>
  );
}
