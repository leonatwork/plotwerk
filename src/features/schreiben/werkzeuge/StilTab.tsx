/**
 * Tab „Stil“ im Schreiben-Inspektor (G4): Wiederholungen und Marken des offenen Kapitels.
 * Lokal, ohne KI. Alles sind nur Hinweise mit Sprung zur Stelle – Plotwerk ändert nie den Text.
 */
import type { Id } from '@core/model/types';
import { ausschnitt, type Stelle } from '@core/stil/index';
import { useId, useRef, useState, type ReactNode } from 'react';
import { f, useTexte } from '../../../i18n';
import { useStore } from '../../../state/store';
import { Abschnittslabel, Checkbox, klassen } from '../../../ui';
import { markeAufnehmen, markeIgnorieren, prozent, zeigeStelle } from './gemeinsam';

const ABSTAENDE = [10, 20, 30, 50, 80];

/** Klick springt zur nächsten Stelle der Liste (reihum). */
function useReihum(kapitelId: Id, text: string) {
  const zaehler = useRef(new Map<string, number>());
  return (schluessel: string, stellen: Stelle[]) => {
    if (!stellen.length) return;
    const i = (zaehler.current.get(schluessel) ?? -1) + 1;
    const n = i % stellen.length;
    zaehler.current.set(schluessel, n);
    const s = stellen[n]!;
    zeigeStelle(kapitelId, text, s.start, s.ende);
  };
}

function Zitat({ text, stelle }: { text: string; stelle: Stelle }) {
  const a = ausschnitt(text, stelle.start, stelle.ende, 28);
  return (
    <span className="pw-w-zitat">
      {a.vor}
      <mark>{a.treffer}</mark>
      {a.nach}
    </span>
  );
}

function Abschnitt({ titel, anzahl, children, leer }: { titel: string; anzahl?: number; children: ReactNode; leer?: string | false }) {
  const id = useId();
  return (
    <section className="pw-w-abschnitt" aria-labelledby={id}>
      <Abschnittslabel as="h3" id={id}>
        {titel}
        {anzahl ? ` · ${anzahl}` : ''}
      </Abschnittslabel>
      {leer ? <span className="pw-s-leise">{leer}</span> : children}
    </section>
  );
}

export function StilTab({ kapitelId }: { kapitelId: Id }) {
  const live = useStore((s) => (s.editorwerkzeuge.live?.kapitel === kapitelId ? s.editorwerkzeuge.live : null));
  const wiederholungen = useStore((s) => s.editorwerkzeuge.wiederholungen);
  const umschalten = useStore((s) => s.editorwerkzeuge.umschalteWiederholungen);
  const abstand = useStore((s) => s.editorwerkzeuge.abstand);
  const setzeAbstand = useStore((s) => s.editorwerkzeuge.setzeAbstand);
  const fokusWort = useStore((s) => s.editorwerkzeuge.fokusWort);
  const setzeFokusWort = useStore((s) => s.editorwerkzeuge.setzeFokusWort);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const editorSichern = useStore((s) => s.editorSichern);
  const abstandId = useId();
  const reihum = useReihum(kapitelId, live?.text ?? '');
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const t = useTexte();
  const T = t.schreiben.stil;

  if (!live) return <span className="pw-s-leise">{T.wertet}</span>;
  const { bericht, text } = live;
  if (bericht.woerter === 0) return <span className="pw-s-leise">{T.leer}</span>;
  const maxHaeufig = bericht.haeufig[0]?.anzahl ?? 1;

  const ausfuehren = async (schluessel: string, f: () => Promise<unknown>) => {
    setArbeitet(schluessel);
    try {
      await f();
    } catch (e) {
      console.error('Markenliste nicht gespeichert:', e);
    } finally {
      setArbeitet(null);
    }
  };

  return (
    <div className="pw-w-stil">
      <div className="pw-w-kopf">
        <Checkbox checked={wiederholungen} onChange={umschalten}>
          {T.markieren}
        </Checkbox>
        <span className="pw-w-kopf__zeile">
          <label htmlFor={abstandId}>{T.innerhalb}</label>
          <select id={abstandId} className="pw-w-auswahl" value={abstand} onChange={(e) => setzeAbstand(Number(e.target.value))}>
            {[...new Set([...ABSTAENDE, abstand])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {f(T.abstandOption, { n })}
                </option>
              ))}
          </select>
        </span>
        <span className="pw-s-leise">{f(T.umfang, { woerter: f(t.gemeinsam.woerter, { n: bericht.woerter }), n: bericht.saetze })}</span>
      </div>

      <Abschnitt titel={T.dicht} anzahl={bericht.nah.length} leer={!bericht.nah.length && f(T.keinDoppel, { n: abstand })}>
        <ul className="pw-w-liste">
          {bericht.nah.map((n) => (
            <li key={`${n.stamm}-${n.stellen[0]!.start}`}>
              <button type="button" className="pw-w-eintrag" onClick={() => reihum(`nah-${n.stellen[0]!.start}`, n.stellen)} title={T.springenTitel}>
                <span className="pw-w-eintrag__kopf">
                  <b className="pw-w-nah-punkt">{n.wort}</b>
                  <span>{f(T.abstand, { anzahl: n.stellen.length, n: n.abstand })}</span>
                </span>
                <Zitat text={text} stelle={n.stellen[0]!} />
              </button>
            </li>
          ))}
        </ul>
      </Abschnitt>

      <Abschnitt titel={T.satzanfaenge} anzahl={bericht.satzanfaenge.length}>
        {bericht.satzanfaenge.length > 0 ? (
          <ul className="pw-w-liste">
            {bericht.satzanfaenge.map((a) => (
              <li key={a.stellen[0]!.start}>
                <button type="button" className="pw-w-eintrag" onClick={() => reihum(`anfang-${a.stellen[0]!.start}`, a.stellen)}>
                  <span className="pw-w-eintrag__kopf">
                    <b className="pw-w-anfang-punkt">{a.wort} …</b>
                    <span>{f(T.hintereinander, { n: a.saetze })}</span>
                  </span>
                  <Zitat text={text} stelle={a.stellen[0]!} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="pw-s-leise">{T.keineAnfaenge}</span>
        )}
        {bericht.anfangsStatistik.length > 0 && (
          <span className="pw-s-leise">
            {f(T.haeufigsteAnfaenge, { liste: bericht.anfangsStatistik.map((a) => `${a.wort} ${prozent(a.anteil)}`).join(' · ') })}
          </span>
        )}
      </Abschnitt>

      <Abschnitt titel={T.haeufigsteWoerter} leer={!bericht.haeufig.length && T.keinMehrfach}>
        <ul className="pw-w-liste pw-w-liste--dicht">
          {bericht.haeufig.map((h) => {
            const an = fokusWort === h.stamm;
            return (
              <li key={h.stamm}>
                <button
                  type="button"
                  className={klassen('pw-w-wort', an && 'pw-w-wort--an')}
                  aria-pressed={an}
                  title={an ? T.aufheben : T.hervorheben}
                  onClick={() => {
                    setzeFokusWort(an ? null : h.stamm);
                    if (!an) reihum(`wort-${h.stamm}`, h.stellen);
                  }}
                >
                  <span className="pw-w-wort__name">{h.wort}</span>
                  <span className="pw-w-balken" aria-hidden="true">
                    <span style={{ width: `${Math.max(6, (h.anzahl / maxHaeufig) * 100)}%` }} />
                  </span>
                  <span className="pw-w-wort__zahl">{h.anzahl}×</span>
                </button>
              </li>
            );
          })}
        </ul>
        {bericht.haeufig.length > 0 && <span className="pw-s-leise">{T.haeufigHilfe}</span>}
      </Abschnitt>

      <Abschnitt titel={T.markenHier} anzahl={live.marken.length}>
        {live.marken.length > 0 ? (
          <ul className="pw-w-liste pw-w-liste--dicht">
            {live.marken.map((m) => (
              <li key={m.marke.id}>
                <button type="button" className="pw-w-wort" onClick={() => reihum(`marke-${m.marke.id}`, m.stellen)} title={T.naechstesTitel}>
                  <span className="pw-w-wort__name">{m.marke.name}</span>
                  <span className="pw-w-wort__info">{m.marke.kategorie ?? ''}</span>
                  <span className="pw-w-wort__zahl">{m.stellen.length}×</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="pw-s-leise">{T.keineMarkeHier}</span>
        )}
        {live.kandidaten.length > 0 && (
          <>
            <span className="pw-w-unterlabel">{T.vielleicht}</span>
            <ul className="pw-w-liste">
              {live.kandidaten.slice(0, 12).map((k) => (
                <li key={k.name} className="pw-w-kandidat">
                  <button type="button" className="pw-w-kandidat__name" onClick={() => reihum(`kand-${k.name}`, k.stellen)} title={T.stelleTitel}>
                    <b>{k.name}</b>
                    <span>
                      {T.grund[k.grund]} · {k.stellen.length}×
                    </span>
                  </button>
                  <span className="pw-w-kandidat__aktionen">
                    <button type="button" className="pw-w-link" disabled={arbeitet !== null} onClick={() => void ausfuehren(k.name, () => markeAufnehmen(k.name))}>
                      {T.aufnehmen}
                    </button>
                    <button type="button" className="pw-w-link pw-w-link--leise" disabled={arbeitet !== null} onClick={() => void ausfuehren(k.name, () => markeIgnorieren(k.name))}>
                      {T.keineMarke}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          className="pw-w-link pw-w-mehr"
          onClick={async () => {
            await editorSichern();
            oeffneDialog('marken');
          }}
        >
          {T.alleMarken}
        </button>
      </Abschnitt>

      <span className="pw-s-leise">{T.nurHinweise}</span>
    </div>
  );
}
