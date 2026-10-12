/** Überblick der Schreibstatistik (G5): Kennzahlen, Kalender, Wörter je Akt und Kapitel. */
import type { Id, Schreibstatistik } from '@core/model/types';
import { durchschnitt, fortschrittJeAkt, gesamtFortschritt, serie, woerterAm, zielTage, type AktFortschritt } from '@core/statistik';
import { useMemo, useState } from 'react';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, klassen, StatusPunkt } from '../../ui';
import { useGesamtWoerter } from '../schreiben/Statusleiste';
import { datumAnzeige, prozent, tageText, woerterText, zahl } from './hooks';
import { Kalender, KalenderLegende } from './Kalender';
import { Ring } from './Ring';

function Balken({ anteil, fertig, duenn, label }: { anteil: number; fertig?: boolean; duenn?: boolean; label?: string }) {
  const wert = Math.max(0, Math.min(1, anteil));
  return (
    <div
      className={klassen('pw-st-balken', duenn && 'pw-st-balken--duenn')}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(wert * 100) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <div className={klassen('pw-st-balken__wert', fertig && 'pw-st-balken__wert--fertig')} style={{ width: `${wert * 100}%` }} />
    </div>
  );
}

function Kennzahlen({ st, heute, onZielBearbeiten }: { st: Schreibstatistik; heute: string; onZielBearbeiten(): void }) {
  const gesamt = useGesamtWoerter();
  const heuteW = woerterAm(st, heute);
  const ziel = st.ziel.tagWoerter;
  const s = serie(st, heute);
  const g = gesamtFortschritt(st, gesamt, heute);
  const schnitt7 = durchschnitt(st, heute, 7);
  const ziel7 = zielTage(st, heute, 7);
  const t = useTexte().statistik.kennzahlen;

  return (
    <div className="pw-st-kacheln">
      <section className="pw-st-panel pw-st-kachel" aria-label={t.heute}>
        {ziel > 0 ? (
          <Ring anteil={heuteW / ziel} erreicht={heuteW >= ziel} />
        ) : (
          <Ring anteil={0} />
        )}
        <div className="pw-st-kachel__text">
          <Abschnittslabel>{t.heute}</Abschnittslabel>
          <span>
            <span className="pw-st-kachel__zahl">{zahl.format(heuteW)}</span>
            <span className="pw-st-kachel__einheit">{ziel > 0 ? f(t.einheitZiel, { ziel: zahl.format(ziel) }) : f(t.einheitWoerter, { n: heuteW })}</span>
          </span>
          {ziel > 0 ? (
            <span className="pw-st-leise">{heuteW >= ziel ? t.tageszielErreicht : f(t.noch, { rest: woerterText(ziel - heuteW) })}</span>
          ) : (
            <Button variante="text" klein onClick={onZielBearbeiten} style={{ alignSelf: 'flex-start', padding: 0 }}>
              {t.tageszielFestlegen}
            </Button>
          )}
        </div>
      </section>

      <section className="pw-st-panel" aria-label={t.schreibstrecke}>
        <Abschnittslabel>{t.serie}</Abschnittslabel>
        <span>
          <span className="pw-st-kachel__zahl">{zahl.format(s.aktuell)}</span>
          <span className="pw-st-kachel__einheit">{f(t.inFolge, { n: s.aktuell })}</span>
        </span>
        <span className="pw-st-leise">
          {s.aktuell > 0 && !s.heuteGeschrieben ? t.serieHalten : ''}
          {f(t.laengste, { tage: tageText(s.laengste) })}
        </span>
      </section>

      <section className="pw-st-panel" aria-label={t.durchschnitt}>
        <Abschnittslabel>{t.letzte7}</Abschnittslabel>
        <span>
          <span className="pw-st-kachel__zahl">{zahl.format(schnitt7)}</span>
          <span className="pw-st-kachel__einheit">{t.proTag}</span>
        </span>
        <span className="pw-st-leise">{ziel > 0 ? f(t.zielTage, { n: ziel7 }) : f(t.schnitt30, { n: zahl.format(durchschnitt(st, heute, 30)) })}</span>
      </section>

      <section className="pw-st-panel" aria-label={t.gesamtfortschritt}>
        <Abschnittslabel>{t.buch}</Abschnittslabel>
        <span>
          <span className="pw-st-kachel__zahl">{zahl.format(gesamt)}</span>
          <span className="pw-st-kachel__einheit">{g.ziel ? f(t.einheitZiel, { ziel: zahl.format(g.ziel) }) : t.einheitBuch}</span>
        </span>
        {g.ziel && g.anteil !== null ? (
          <>
            <Balken anteil={g.anteil} label={f(t.gesamtfortschrittWert, { prozent: prozent.format(g.anteil) })} />
            <span className="pw-st-leise">
              {prozent.format(g.anteil)}
              {g.rest ? f(t.nochRest, { rest: woerterText(g.rest) }) : t.zielumfangErreicht}
              {g.tageBisAbgabe !== null && st.ziel.abgabe
                ? g.tageBisAbgabe > 0
                  ? g.proTagNoetig
                    ? f(t.abgabeProTag, { datum: datumAnzeige(st.ziel.abgabe), tage: tageText(g.tageBisAbgabe), n: zahl.format(g.proTagNoetig) })
                    : f(t.abgabe, { datum: datumAnzeige(st.ziel.abgabe), tage: tageText(g.tageBisAbgabe) })
                  : f(t.abgabeWar, { datum: datumAnzeige(st.ziel.abgabe) })
                : ''}
            </span>
          </>
        ) : (
          <Button variante="text" klein onClick={onZielBearbeiten} style={{ alignSelf: 'flex-start', padding: 0 }}>
            {t.zielumfangFestlegen}
          </Button>
        )}
      </section>
    </div>
  );
}

function AktZeile({ akt, max, maxKapitel, offen, umschalten }: { akt: AktFortschritt; max: number; maxKapitel: number; offen: boolean; umschalten(): void }) {
  const oeffne = useStore((s) => s.oeffne);
  const t = useTexte().statistik.akte;
  const name = akt.nummer === null ? t.ohneAkt : f(akt.titel ? t.aktTitel : t.akt, { nr: akt.nummer, titel: akt.titel });
  const listeId = `pw-st-akt-${akt.nummer ?? 'ohne'}`;
  return (
    <li className="pw-st-akt">
      <button type="button" className="pw-st-akt__kopf" aria-expanded={offen} aria-controls={listeId} onClick={umschalten}>
        <span className="pw-st-akt__pfeil" aria-hidden="true">
          ›
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="pw-st-akt__name">{name}</span>
          <span className="pw-st-leise">
            {akt.kapitel.length === 0 ? t.keineKapitel : f(t.geschrieben, { fertig: akt.fertig, n: akt.kapitel.length })}
          </span>
        </span>
        <span className="pw-st-zahl">{woerterText(akt.woerter)}</span>
        <Balken anteil={max > 0 ? akt.woerter / max : 0} />
      </button>
      {offen && akt.kapitel.length > 0 && (
        <ul className="pw-st-kapitel" id={listeId}>
          {akt.kapitel.map((k) => (
            <li key={k.id}>
              <StatusPunkt status={k.status} />
              <button type="button" onClick={() => oeffne('schreiben', { kapitel: k.id })} title={t.imEditor}>
                {k.titel}
              </button>
              <span className="pw-st-zahl">{k.woerter > 0 ? zahl.format(k.woerter) : '–'}</span>
              <Balken duenn anteil={maxKapitel > 0 ? k.woerter / maxKapitel : 0} fertig={k.status === 'geschrieben'} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AkteUndKapitel() {
  const daten = useStore((s) => s.daten);
  const wortzahlen = useStore((s) => s.index.wortzahlen);
  const live = useStore((s) => s.schreibenLive);
  const [zu, setZu] = useState<Set<string>>(() => new Set());
  const t = useTexte().statistik.akte;
  const akte = useMemo(() => {
    if (!daten) return [];
    const woerter = (id: Id) => (live?.kapitel === id ? live.woerter : (wortzahlen[id] ?? 0));
    return fortschrittJeAkt(daten, woerter);
  }, [daten, wortzahlen, live]);
  if (!daten) return null;
  const max = Math.max(0, ...akte.map((a) => a.woerter));
  const maxKapitel = Math.max(0, ...akte.flatMap((a) => a.kapitel.map((k) => k.woerter)));
  const schluessel = (a: AktFortschritt) => String(a.nummer ?? 'ohne');
  const alleZu = akte.every((a) => zu.has(schluessel(a)));

  return (
    <section className="pw-st-panel" aria-labelledby="pw-st-akte-titel">
      <div className="pw-st-panel__kopf">
        <Abschnittslabel id="pw-st-akte-titel" as="h2">
          {t.titel}
        </Abschnittslabel>
        {akte.length > 0 && (
          <Button variante="text" klein onClick={() => setZu(alleZu ? new Set() : new Set(akte.map(schluessel)))}>
            {alleZu ? t.aufklappen : t.zuklappen}
          </Button>
        )}
      </div>
      {akte.length === 0 ? (
        <p className="pw-st-leise" style={{ margin: 0 }}>
          {t.leer}
        </p>
      ) : (
        <ul className="pw-st-akte">
          {akte.map((a) => (
            <AktZeile
              key={schluessel(a)}
              akt={a}
              max={max}
              maxKapitel={maxKapitel}
              offen={!zu.has(schluessel(a))}
              umschalten={() =>
                setZu((alt) => {
                  const neu = new Set(alt);
                  if (neu.has(schluessel(a))) neu.delete(schluessel(a));
                  else neu.add(schluessel(a));
                  return neu;
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export interface UeberblickProps {
  st: Schreibstatistik;
  heute: string;
  tag: string;
  onTag(tag: string): void;
  onZielBearbeiten(): void;
}

export function Ueberblick({ st, heute, tag, onTag, onZielBearbeiten }: UeberblickProps) {
  const tageMitText = Object.values(st.tage).filter((x) => x.geschrieben > 0).length;
  const t = useTexte().statistik.ueberblick;
  return (
    <>
      <Kennzahlen st={st} heute={heute} onZielBearbeiten={onZielBearbeiten} />
      <section className="pw-st-panel" aria-labelledby="pw-st-kalender-titel">
        <div className="pw-st-panel__kopf">
          <Abschnittslabel id="pw-st-kalender-titel" as="h2">
            {t.woerterProTag}
          </Abschnittslabel>
          <KalenderLegende ziel={st.ziel.tagWoerter} />
        </div>
        <Kalender st={st} heute={heute} gewaehlt={tag} onWaehlen={onTag} />
        {tageMitText === 0 && (
          <p className="pw-st-leise" style={{ margin: 0 }}>
            {t.keineTage}
          </p>
        )}
      </section>
      <AkteUndKapitel />
    </>
  );
}
