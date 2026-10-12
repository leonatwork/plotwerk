/**
 * KI-Vorschläge zu Erzählsträngen (G2): neue Stränge, Kapitel-Zuordnungen und Rückfragen mit Belegen.
 * Gezeigt im Inspektor des Segments „Stränge“ (alle bzw. die eines Strangs) und im Kapitel-Inspektor (die des
 * Kapitels). Übernehmen/Verwerfen/Antworten laufen über den Store (struktur.strang…). Besitzer: G2.
 */
import { useMemo, useState } from 'react';
import type { Id, ProjektDaten, StrangVorschlag } from '@core/model/types';
import { fadenKarten } from '@core/struktur/faeden';
import { fadenKapitel, faedenOhneStrang, offeneStrangVorschlaege } from '@core/struktur/straenge';
import { useStore } from '../../state/store';
import { Button, StrangPunkt } from '../../ui';
import { strangFarbe } from '../akte/gemeinsam';
import { datum, f, useTexte } from '../../i18n';
import './faeden.css';

const kapNr = (daten: ProjektDaten, id: Id) => daten.projekt.kapitel.indexOf(id) + 1;

function Belege({ v, daten }: { v: StrangVorschlag; daten: ProjektDaten }) {
  const t = useTexte();
  if (v.belege.length === 0) return null;
  return (
    <ul className="fd-vorschlag__belege">
      {v.belege.map((b, i) => (
        <li key={i} title={f(t.faeden.vorschlaege.beleg, { nr: kapNr(daten, b.kapitel) })}>
          <span className="fd-vorschlag__kap">{f(t.gemeinsam.kapitelKurz, { nr: kapNr(daten, b.kapitel) })}</span>
          <span className="fd-vorschlag__zitat">»{b.text}«</span>
        </li>
      ))}
    </ul>
  );
}

function Verwerfen({ v }: { v: StrangVorschlag }) {
  const verwerfen = useStore((s) => s.struktur.strangVorschlagVerwerfen);
  const t = useTexte().faeden.vorschlaege;
  return (
    <Button klein variante="leise" title={t.verwerfenTitel} onClick={() => void verwerfen(v.schluessel)}>
      {t.verwerfen}
    </Button>
  );
}

function NeuerStrangKarte({ v, daten, kapitel }: { v: StrangVorschlag; daten: ProjektDaten; kapitel?: Id }) {
  const uebernehmen = useStore((s) => s.struktur.strangVorschlagUebernehmen);
  const [auswahl, setAuswahl] = useState<Id[]>(v.kapitel);
  const t = useTexte();
  const tv = t.faeden.vorschlaege;
  return (
    <article className="fd-vorschlag" aria-label={`${tv.neuerStrang}: ${v.name}`}>
      <div className="fd-vorschlag__kopf">
        <strong>{v.name}</strong>
        {v.rolle && <span className={v.rolle === 'haupt' ? 'fd-etikett fd-etikett--accent' : 'fd-etikett fd-etikett--neutral'}>{t.faeden.raster.rolle[v.rolle]}</span>}
      </div>
      {v.beschreibung && <span className="fd-vorschlag__text">{v.beschreibung}</span>}
      {!kapitel && v.kapitel.length > 1 ? (
        <div role="group" aria-label={tv.kapitelWaehlen} className="fd-chips">
          {v.kapitel.map((k) => (
            <button
              key={k}
              type="button"
              className="pl-kleinknopf"
              aria-pressed={auswahl.includes(k)}
              aria-label={f(tv.kapitelLabel, { nr: kapNr(daten, k) })}
              onClick={() => setAuswahl((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))}
            >
              {f(t.gemeinsam.kapitelKurz, { nr: kapNr(daten, k) })}
            </button>
          ))}
        </div>
      ) : null}
      <Belege v={kapitel ? { ...v, belege: v.belege.filter((b) => b.kapitel === kapitel) } : v} daten={daten} />
      <div className="fd-vorschlag__aktionen">
        <Button klein variante="primaer" disabled={auswahl.length === 0} onClick={() => void uebernehmen(v.schluessel, kapitel ? v.kapitel : auswahl)}>
          {tv.anlegen}
        </Button>
        <Verwerfen v={v} />
      </div>
    </article>
  );
}

function ZuordnungKarte({ v, daten, ohneStrang }: { v: StrangVorschlag; daten: ProjektDaten; ohneStrang?: boolean }) {
  const uebernehmen = useStore((s) => s.struktur.strangVorschlagUebernehmen);
  const texte = useTexte();
  const t = texte.faeden.vorschlaege;
  const s = daten.straenge.find((x) => x.id === v.strang);
  const k = v.kapitel[0]!;
  if (!s) return null;
  return (
    <article className="fd-vorschlag" aria-label={f(t.passtZu, { nr: kapNr(daten, k), name: s.name })}>
      <div className="fd-vorschlag__kopf">
        {!ohneStrang && <StrangPunkt farbe={strangFarbe(s.farbe)} groesse={9} />}
        <span>{ohneStrang ? `${f(texte.gemeinsam.kapitelKurz, { nr: kapNr(daten, k) })} · ${daten.kapitel[k]?.titel ?? k}` : f(t.passtZu, { nr: kapNr(daten, k), name: s.name })}</span>
      </div>
      {v.begruendung && <span className="fd-vorschlag__text">{v.begruendung}</span>}
      <Belege v={v} daten={daten} />
      <div className="fd-vorschlag__aktionen">
        <Button klein variante="primaer" onClick={() => void uebernehmen(v.schluessel)}>
          {t.uebernehmen}
        </Button>
        <Verwerfen v={v} />
      </div>
    </article>
  );
}

function FrageKarte({ v, daten }: { v: StrangVorschlag; daten: ProjektDaten }) {
  const beantworten = useStore((s) => s.struktur.strangFrageBeantworten);
  const [antwort, setAntwort] = useState('');
  const t = useTexte().faeden.vorschlaege;
  const s = v.strang ? daten.straenge.find((x) => x.id === v.strang) : undefined;
  const absenden = () => antwort.trim() && void beantworten(v.schluessel, antwort);
  return (
    <article className="fd-vorschlag fd-vorschlag--frage" aria-label={v.frage}>
      <div className="fd-vorschlag__kopf">
        {s && <StrangPunkt farbe={strangFarbe(s.farbe)} groesse={9} title={s.name} />}
        <span>{v.frage}</span>
      </div>
      <Belege v={v} daten={daten} />
      <textarea
        className="pl-bereich fd-vorschlag__antwort"
        rows={2}
        aria-label={t.antwort}
        placeholder={t.antwortPlatzhalter}
        value={antwort}
        onChange={(e) => setAntwort(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            absenden();
          }
        }}
      />
      <div className="fd-vorschlag__aktionen">
        <Button klein variante="primaer" disabled={!antwort.trim()} onClick={absenden}>
          {t.antworten}
        </Button>
        <Verwerfen v={v} />
      </div>
    </article>
  );
}

/** Eine Vorschlagskarte; `kapitel`: Anzeige im Kapitel-Inspektor (nur Belege dieses Kapitels). */
export function VorschlagKarte({ v, daten, kapitel, ohneStrang }: { v: StrangVorschlag; daten: ProjektDaten; kapitel?: Id; ohneStrang?: boolean }) {
  if (v.art === 'neu') return <NeuerStrangKarte v={v} daten={daten} kapitel={kapitel} />;
  if (v.art === 'zuordnung') return <ZuordnungKarte v={v} daten={daten} ohneStrang={ohneStrang} />;
  return <FrageKarte v={v} daten={daten} />;
}

/** Beantwortete Rückfragen (zum Zurücknehmen) */
function Beantwortet({ daten }: { daten: ProjektDaten }) {
  const beantworten = useStore((s) => s.struktur.strangFrageBeantworten);
  const t = useTexte().faeden.vorschlaege;
  const liste = (daten.kiStrangVorschlaege?.eintraege ?? []).filter((v) => v.art === 'frage' && v.status === 'uebernommen' && v.antwort);
  if (liste.length === 0) return null;
  return (
    <ul className="fd-vorschlag__beantwortet">
      {liste.map((v) => (
        <li key={v.schluessel}>
          <span>{v.frage}</span>
          <span className="fd-leise">{f(t.beantwortet, { antwort: v.antwort ?? '' })}</span>
          <button type="button" className="pl-link" onClick={() => void beantworten(v.schluessel, '')}>
            {t.zuruecknehmen}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Alle offenen Vorschläge, gruppiert; `strang`: nur die eines Strangs (Zuordnungen und Rückfragen). */
export function StrangVorschlaegeListe({ daten, strang }: { daten: ProjektDaten; strang?: Id }) {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const lauf = useStore((s) => s.struktur.strangLauf);
  const t = useTexte();
  const tv = t.faeden.vorschlaege;
  const alle = offeneStrangVorschlaege(daten).filter((v) => !strang || v.strang === strang);
  const neu = strang ? [] : alle.filter((v) => v.art === 'neu');
  const zuordnungen = alle.filter((v) => v.art === 'zuordnung');
  const fragen = alle.filter((v) => v.art === 'frage');
  const letzter = daten.kiStrangVorschlaege?.lauf;
  return (
    <section className="fd-vorschlaege" aria-label={tv.kopf}>
      <div className="fd-vorschlaege__kopf">
        <span className="fd-label" style={{ color: 'var(--accent-dark)' }}>
          {tv.kopf}
        </span>
        <Button klein onClick={() => oeffneDialog('straenge-vorschlagen')} disabled={lauf}>
          {letzter ? tv.nochmal : tv.starten}
        </Button>
      </div>
      {!letzter && !strang && <span className="fd-leise">{tv.intro}</span>}
      {letzter && alle.length === 0 && <span className="fd-leise">{tv.leer}</span>}
      {letzter && !strang && (
        <span className="fd-leise">{f(tv.zuletzt, { datum: datum(new Date(letzter.datum), { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }), modell: letzter.modell })}</span>
      )}
      {neu.length > 0 && (
        <div className="fd-vorschlaege__gruppe">
          <span className="fd-feldlabel">{tv.neueStraenge}</span>
          {neu.map((v) => (
            <VorschlagKarte key={v.schluessel} v={v} daten={daten} />
          ))}
        </div>
      )}
      {zuordnungen.length > 0 && (
        <div className="fd-vorschlaege__gruppe">
          <span className="fd-feldlabel">{tv.zuordnungen}</span>
          {zuordnungen.map((v) => (
            <VorschlagKarte key={v.schluessel} v={v} daten={daten} ohneStrang={!!strang} />
          ))}
        </div>
      )}
      {fragen.length > 0 && (
        <div className="fd-vorschlaege__gruppe">
          <span className="fd-feldlabel">{tv.rueckfragen}</span>
          {fragen.map((v) => (
            <VorschlagKarte key={v.schluessel} v={v} daten={daten} />
          ))}
        </div>
      )}
      {!strang && <Beantwortet daten={daten} />}
    </section>
  );
}

/** Kapitel-Inspektor: offene Vorschläge, die dieses Kapitel betreffen (ohne Rückfragen), plus Start-Knopf. */
export function KapitelStrangVorschlaege({ kapitel, daten }: { kapitel: Id; daten: ProjektDaten }) {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const lauf = useStore((s) => s.struktur.strangLauf);
  const t = useTexte();
  const tv = t.faeden.vorschlaege;
  const liste = offeneStrangVorschlaege(daten, kapitel).filter((v) => v.art !== 'frage');
  const hatText = !!daten.kapitel[kapitel]?.text.trim();
  return (
    <div className="fd-vorschlaege fd-vorschlaege--kapitel">
      {liste.map((v) =>
        v.art === 'zuordnung' ? (
          <KapitelZuordnung key={v.schluessel} v={v} daten={daten} />
        ) : (
          <div key={v.schluessel} className="fd-vorschlaege__gruppe">
            <span className="fd-feldlabel" style={{ color: 'var(--accent-dark)' }}>
              {tv.hierKurz} · {tv.neuerStrang}
            </span>
            <VorschlagKarte v={v} daten={daten} kapitel={kapitel} />
          </div>
        ),
      )}
      {hatText && (
        <button type="button" className="pl-link" style={{ alignSelf: 'flex-start' }} disabled={lauf} onClick={() => oeffneDialog('straenge-vorschlagen')}>
          {t.faeden.raster.kiVorschlagen}
        </button>
      )}
    </div>
  );
}

function KapitelZuordnung({ v, daten }: { v: StrangVorschlag; daten: ProjektDaten }) {
  const uebernehmen = useStore((s) => s.struktur.strangVorschlagUebernehmen);
  const t = useTexte().faeden.vorschlaege;
  const s = daten.straenge.find((x) => x.id === v.strang);
  if (!s) return null;
  return (
    <article className="fd-vorschlag" aria-label={f(t.passtZuKurz, { name: s.name })}>
      <div className="fd-vorschlag__kopf">
        <span className="fd-feldlabel" style={{ color: 'var(--accent-dark)' }}>
          {t.hierKurz}
        </span>
      </div>
      <div className="fd-vorschlag__kopf">
        <StrangPunkt farbe={strangFarbe(s.farbe)} groesse={9} />
        <span>{f(t.passtZuKurz, { name: s.name })}</span>
      </div>
      {v.begruendung && <span className="fd-vorschlag__text">{v.begruendung}</span>}
      {v.belege[0] && <span className="fd-vorschlag__zitat">»{v.belege[0].text}«</span>}
      <div className="fd-vorschlag__aktionen">
        <Button klein variante="primaer" onClick={() => void uebernehmen(v.schluessel)}>
          {t.uebernehmen}
        </Button>
        <Verwerfen v={v} />
      </div>
    </article>
  );
}

/**
 * Lose Enden aus der Prüfung, die noch keinem Strang gehören, mit „Als Strang übernehmen“.
 * `kapitel`: nur die losen Enden dieses Kapitels (Kapitel-Inspektor, kompakt).
 */
export function FaedenAlsStraenge({ daten, kapitel, wenige }: { daten: ProjektDaten; kapitel?: Id; wenige?: number }) {
  const faeden = useStore((s) => s.index.faeden);
  const alsStrang = useStore((s) => s.struktur.strangAusFaden);
  const waehleStrang = useStore((s) => s.struktur.waehleStrang);
  const [alle, setAlle] = useState(false);
  const t = useTexte();
  const ta = t.faeden.ausFaeden;
  const liste = useMemo(() => faedenOhneStrang(daten, fadenKarten(daten, faeden), kapitel), [daten, faeden, kapitel]);
  if (liste.length === 0) return null;
  const gezeigt = wenige && !alle ? liste.slice(0, wenige) : liste;
  return (
    <section className="fd-vorschlaege" aria-label={kapitel ? ta.imKapitel : ta.kopf}>
      {kapitel ? (
        <span className="fd-feldlabel">{ta.imKapitel}</span>
      ) : (
        <>
          <span className="fd-label">{ta.kopf}</span>
          <span className="fd-leise">{ta.intro}</span>
        </>
      )}
      <ul className="fd-aus-faeden">
        {gezeigt.map((k) => (
          <li key={k.id}>
            <span className="fd-aus-faeden__name">{k.name}</span>
            {!kapitel && (
              <span className="fd-leise">
                {f(ta.kapitel, { kapitel: fadenKapitel(daten, k).map((id) => f(t.gemeinsam.kapitelKurz, { nr: kapNr(daten, id) })).join(', ') })}
              </span>
            )}
            <button
              type="button"
              className="pl-link"
              title={ta.titel}
              onClick={async () => {
                const id = await alsStrang(k.id);
                if (id && !kapitel) waehleStrang(id);
              }}
            >
              {ta.uebernehmen}
            </button>
          </li>
        ))}
      </ul>
      {wenige && !alle && liste.length > wenige && (
        <button type="button" className="pl-link" style={{ alignSelf: 'flex-start' }} onClick={() => setAlle(true)}>
          + {liste.length - wenige}
        </button>
      )}
    </section>
  );
}
