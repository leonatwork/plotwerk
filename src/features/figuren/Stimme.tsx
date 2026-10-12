/**
 * Figurenstimme (G3) auf der Figurenkarte: Spalte „Stimme“ rechts neben der Karte und Knopf in der Titelleiste.
 * Zeigt die KI-Beobachtungen aus .plotwerk/stimmen.json mit der auffälligen und den typischen Stellen (wörtlich).
 * Nur Beobachtung – Leon entscheidet „Ist Absicht“ oder „Erledigt“ (entscheidungen.json, gilt auch in Hinweise).
 * Besitzer: G3 Figuren.
 */
import { useMemo, useState } from 'react';
import { offeneStimmen, redeDerFigur, stimmenDerFigur, type StimmenEintrag } from '@core/figuren/index';
import { STIMME_MIN_REDE } from '@core/ki/index';
import type { Id, ProjektDaten, Zitat } from '@core/model/types';
import { datum, f as fmt, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button, Inspektor, Segment, Zaehler } from '../../ui';
import { zitatAnker } from '../akte/gemeinsam';
import '../ki/ki.css';
import { BoegenStil } from './BoegenStil';
import { kapMitTitel, zitat as zitatText } from './texte';

function datumText(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return datum(d, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Knopf „Stimme“ in der Titelleiste der Figurenkarte (blendet die Spalte ein/aus, zeigt offene Beobachtungen). */
export function StimmeKnopf() {
  const daten = useStore((s) => s.daten);
  const figur = useStore((s) => s.auswahl.figur);
  const offen = useStore((s) => s.figurenbogen.stimmeSpalte);
  const setze = useStore((s) => s.figurenbogen.setzeStimmeSpalte);
  const zahl = daten && figur ? offeneStimmen(daten, figur) : 0;
  const ts = useTexte().figuren.stimme;
  return (
    <Button
      klein
      variante={offen ? 'primaer' : 'sekundaer'}
      aria-pressed={offen}
      title={ts.knopfTitel}
      onClick={() => setze(!offen)}
      disabled={!figur}
    >
      {ts.knopf}
      {zahl > 0 && <Zaehler wert={zahl} label={ts.offeneLabel} style={{ marginLeft: 6 }} />}
    </Button>
  );
}

function ZitatKnopf({ daten, zitat, auffaellig }: { daten: ProjektDaten; zitat: Zitat; auffaellig?: boolean }) {
  const markiere = useStore((s) => s.markiere);
  const nr = daten.projekt.kapitel.indexOf(zitat.kapitel) + 1;
  const titel = daten.kapitel[zitat.kapitel]?.titel ?? zitat.kapitel;
  const t = useTexte().figuren;
  return (
    <button
      type="button"
      className={`fb-zitat-knopf${auffaellig ? ' fb-zitat-knopf--auffaellig' : ''}`}
      title={t.imTextZeigen}
      onClick={() => markiere({ kapitel: zitat.kapitel, anker: zitatAnker(daten, zitat.kapitel, zitat.text) })}
    >
      <span className="fb-zitat-knopf__kap">{kapMitTitel(nr || '?', titel)}</span>
      {zitatText(zitat.text)}
    </button>
  );
}

function Beobachtung({ daten, eintrag }: { daten: ProjektDaten; eintrag: StimmenEintrag }) {
  const entscheiden = useStore((s) => s.figurenbogen.stimmeEntscheiden);
  const oeffne = useStore((s) => s.oeffne);
  const { beobachtung: b, status, gueltig } = eintrag;
  // Link nur, wenn die Beobachtung in der Hinweise-Ansicht auftaucht (core/index führt sie zusammen)
  const inHinweisen = useStore((s) => s.index.hinweise.some((h) => h.schluessel === b.schluessel));
  const ts = useTexte().figuren.stimme;
  return (
    <article className={`fb-beobachtung${status !== 'neu' || !gueltig ? ' fb-beobachtung--alt' : ''}`} aria-label={b.titel}>
      <span className="fb-reihe" style={{ gap: 6 }}>
        <span className="pl-etikett" style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }}>
          {ts.etikett}
        </span>
        {status !== 'neu' && (
          <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
            {ts.status[status]}
          </span>
        )}
        {!gueltig && (
          <span className="pl-etikett" style={{ background: 'var(--ruhend)', color: 'var(--warm-dark)' }} title={ts.textGeaendertTitel}>
            {ts.textGeaendert}
          </span>
        )}
      </span>
      <h3>{b.titel}</h3>
      <p>{b.erklaerung}</p>
      <span className="fb-label">{ts.auffaellig}</span>
      {b.zitate.map((z, i) => (
        <ZitatKnopf key={`z${i}`} daten={daten} zitat={z} auffaellig />
      ))}
      <span className="fb-label">{ts.sonst}</span>
      {b.vergleich.map((z, i) => (
        <ZitatKnopf key={`v${i}`} daten={daten} zitat={z} />
      ))}
      <span className="fb-reihe" style={{ justifyContent: 'space-between' }}>
        {status === 'neu' ? (
          <span className="fb-reihe">
            <Button klein onClick={() => void entscheiden(b.schluessel, 'absicht')}>
              {ts.absicht}
            </Button>
            <Button klein onClick={() => void entscheiden(b.schluessel, 'erledigt')}>
              {ts.erledigt}
            </Button>
          </span>
        ) : (
          <Button klein variante="leise" onClick={() => void entscheiden(b.schluessel, null)}>
            {ts.wiederOeffnen}
          </Button>
        )}
        {inHinweisen && (
          <button type="button" className="pl-link" onClick={() => oeffne('hinweise', { hinweis: b.schluessel })}>
            {ts.inHinweise}
          </button>
        )}
      </span>
    </article>
  );
}

/** Spalte „Stimme“ neben der Figurenkarte. */
export function StimmeSpalte({ daten, figur }: { daten: ProjektDaten; figur: Id }) {
  const setze = useStore((s) => s.figurenbogen.setzeStimmeSpalte);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const lauf = useStore((s) => s.figurenbogen.stimmeLauf);
  const abbrechen = useStore((s) => s.figurenbogen.stimmeAbbrechen);
  const fehler = useStore((s) => s.figurenbogen.stimmeFehler);
  const ergebnis = useStore((s) => s.figurenbogen.stimmeErgebnis);
  const [filter, setFilter] = useState<'offen' | 'entschieden'>('offen');
  const f = daten.figuren[figur];
  const rede = useMemo(() => redeDerFigur(daten, figur), [daten, figur]);
  const t = useTexte();
  const ts = t.figuren.stimme;
  if (!f) return null;
  const alle = stimmenDerFigur(daten, figur);
  const offen = alle.filter((e) => e.status === 'neu' && e.gueltig);
  const entschieden = alle.filter((e) => !(e.status === 'neu' && e.gueltig));
  const liste = filter === 'offen' ? offen : entschieden;
  const ablageLauf = daten.kiStimmen?.lauf;
  const geprueft = alle.length > 0 || (ergebnis?.figur === figur);
  const laeuft = lauf?.figur === figur;

  return (
    <Inspektor breite={330} label={ts.spalteLabel}>
      <BoegenStil />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>{fmt(ts.titel, { name: f.name })}</strong>
        <button type="button" className="pl-zeile-weg" style={{ opacity: 1 }} aria-label={ts.schliessen} onClick={() => setze(false)}>
          ×
        </button>
      </div>
      <span className="fb-leise">{fmt(ts.erklaerung, { name: f.name })}</span>
      <span className="fb-leise">
        {rede.kapitel.length > 0
          ? fmt(ts.lokalIn, { stellen: fmt(ts.redestellen, { n: rede.stellen.length }), kapitel: fmt(ts.kapitelAnzahl, { n: rede.kapitel.length }) })
          : fmt(ts.lokal, { stellen: fmt(ts.redestellen, { n: rede.stellen.length }) })}
        {rede.stellen.length < STIMME_MIN_REDE && ` ${ts.zuWenigAnhang}`}
      </span>
      {f.existenz === 'bewusst_vage' && (
        <div className="fb-vage">{fmt(ts.vage, { name: f.name })}</div>
      )}

      {laeuft ? (
        <div className="fb-reihe" aria-live="polite">
          <span className="fb-leise" style={{ flex: 1 }}>
            {fmt(ts.liest, { name: f.name })}
          </span>
          <Button klein onClick={abbrechen}>
            {t.gemeinsam.abbrechen}
          </Button>
        </div>
      ) : (
        <Button variante="primaer" onClick={() => oeffneDialog('stimme-pruefen', { figur })} disabled={!!lauf} title={lauf ? ts.laeuftSchon : undefined}>
          {geprueft ? ts.erneut : ts.pruefen}
        </Button>
      )}
      {fehler && !laeuft && (
        <div className="pw-ki-hinweis" role="alert" style={{ fontSize: 12 }}>
          {fehler.text}
        </div>
      )}
      {ergebnis?.figur === figur && !laeuft && (
        <span className="fb-leise" role="status">
          {ergebnis.zuWenigRede
            ? fmt(ts.zuWenigRede, { name: f.name })
            : ergebnis.neu > 0
              ? fmt(ts.neueBeobachtungen, { n: ergebnis.neu })
              : ts.keineNeuen}
        </span>
      )}
      {ablageLauf && alle.length > 0 && (
        <span className="fb-leise">
          {fmt(ts.letztePruefung, { info: [datumText(ablageLauf.datum), ablageLauf.modell].filter(Boolean).join(' · ') })}
        </span>
      )}

      {alle.length > 0 && (
        <Segment<'offen' | 'entschieden'>
          label={ts.filterLabel}
          rolle="group"
          voll
          wert={filter}
          onChange={setFilter}
          optionen={[
            { wert: 'offen', label: fmt(ts.filterOffen, { n: offen.length }) },
            { wert: 'entschieden', label: fmt(ts.filterEntschieden, { n: entschieden.length }) },
          ]}
        />
      )}
      {alle.length === 0 ? (
        <span className="fb-leise" style={{ paddingTop: 6 }}>
          {geprueft ? ts.keineGemeldet : ts.nochNicht}
        </span>
      ) : liste.length === 0 ? (
        <span className="fb-leise">{filter === 'offen' ? ts.nichtsOffen : ts.nichtsEntschieden}</span>
      ) : (
        liste.map((e) => <Beobachtung key={e.beobachtung.schluessel} daten={daten} eintrag={e} />)
      )}
    </Inspektor>
  );
}
