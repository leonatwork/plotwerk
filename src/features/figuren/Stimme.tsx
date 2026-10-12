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
import { useStore } from '../../state/store';
import { Button, Inspektor, Segment, Zaehler } from '../../ui';
import { zitatAnker } from '../akte/gemeinsam';
import '../ki/ki.css';
import { BoegenStil } from './BoegenStil';

const STATUS_TEXT = { neu: 'offen', absicht: 'Ist Absicht', erledigt: 'Erledigt' } as const;

function datumText(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Knopf „Stimme“ in der Titelleiste der Figurenkarte (blendet die Spalte ein/aus, zeigt offene Beobachtungen). */
export function StimmeKnopf() {
  const daten = useStore((s) => s.daten);
  const figur = useStore((s) => s.auswahl.figur);
  const offen = useStore((s) => s.figurenbogen.stimmeSpalte);
  const setze = useStore((s) => s.figurenbogen.setzeStimmeSpalte);
  const zahl = daten && figur ? offeneStimmen(daten, figur) : 0;
  return (
    <Button
      klein
      variante={offen ? 'primaer' : 'sekundaer'}
      aria-pressed={offen}
      title="Figurenstimme: Stellen, an denen die Figur auffällig anders klingt"
      onClick={() => setze(!offen)}
      disabled={!figur}
    >
      Stimme
      {zahl > 0 && <Zaehler wert={zahl} label="offene Beobachtungen" style={{ marginLeft: 6 }} />}
    </Button>
  );
}

function ZitatKnopf({ daten, zitat, auffaellig }: { daten: ProjektDaten; zitat: Zitat; auffaellig?: boolean }) {
  const markiere = useStore((s) => s.markiere);
  const nr = daten.projekt.kapitel.indexOf(zitat.kapitel) + 1;
  const titel = daten.kapitel[zitat.kapitel]?.titel ?? zitat.kapitel;
  return (
    <button
      type="button"
      className={`fb-zitat-knopf${auffaellig ? ' fb-zitat-knopf--auffaellig' : ''}`}
      title="Im Text zeigen"
      onClick={() => markiere({ kapitel: zitat.kapitel, anker: zitatAnker(daten, zitat.kapitel, zitat.text) })}
    >
      <span className="fb-zitat-knopf__kap">
        Kap. {nr || '?'} „{titel}“
      </span>
      »{zitat.text}«
    </button>
  );
}

function Beobachtung({ daten, eintrag }: { daten: ProjektDaten; eintrag: StimmenEintrag }) {
  const entscheiden = useStore((s) => s.figurenbogen.stimmeEntscheiden);
  const oeffne = useStore((s) => s.oeffne);
  const { beobachtung: b, status, gueltig } = eintrag;
  // Link nur, wenn die Beobachtung in der Hinweise-Ansicht auftaucht (core/index führt sie zusammen)
  const inHinweisen = useStore((s) => s.index.hinweise.some((h) => h.schluessel === b.schluessel));
  return (
    <article className={`fb-beobachtung${status !== 'neu' || !gueltig ? ' fb-beobachtung--alt' : ''}`} aria-label={b.titel}>
      <span className="fb-reihe" style={{ gap: 6 }}>
        <span className="pl-etikett" style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }}>
          Stimme · KI
        </span>
        {status !== 'neu' && (
          <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
            {STATUS_TEXT[status]}
          </span>
        )}
        {!gueltig && (
          <span className="pl-etikett" style={{ background: 'var(--ruhend)', color: 'var(--warm-dark)' }} title="Mindestens ein Zitat steht so nicht mehr im Text">
            Text geändert
          </span>
        )}
      </span>
      <h3>{b.titel}</h3>
      <p>{b.erklaerung}</p>
      <span className="fb-label">Auffällig</span>
      {b.zitate.map((z, i) => (
        <ZitatKnopf key={`z${i}`} daten={daten} zitat={z} auffaellig />
      ))}
      <span className="fb-label">Sonst</span>
      {b.vergleich.map((z, i) => (
        <ZitatKnopf key={`v${i}`} daten={daten} zitat={z} />
      ))}
      <span className="fb-reihe" style={{ justifyContent: 'space-between' }}>
        {status === 'neu' ? (
          <span className="fb-reihe">
            <Button klein onClick={() => void entscheiden(b.schluessel, 'absicht')}>
              Ist Absicht
            </Button>
            <Button klein onClick={() => void entscheiden(b.schluessel, 'erledigt')}>
              Erledigt
            </Button>
          </span>
        ) : (
          <Button klein variante="leise" onClick={() => void entscheiden(b.schluessel, null)}>
            Wieder öffnen
          </Button>
        )}
        {inHinweisen && (
          <button type="button" className="pl-link" onClick={() => oeffne('hinweise', { hinweis: b.schluessel })}>
            In Hinweise
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
  if (!f) return null;
  const alle = stimmenDerFigur(daten, figur);
  const offen = alle.filter((e) => e.status === 'neu' && e.gueltig);
  const entschieden = alle.filter((e) => !(e.status === 'neu' && e.gueltig));
  const liste = filter === 'offen' ? offen : entschieden;
  const ablageLauf = daten.kiStimmen?.lauf;
  const geprueft = alle.length > 0 || (ergebnis?.figur === figur);
  const laeuft = lauf?.figur === figur;

  return (
    <Inspektor breite={330} label="Figurenstimme">
      <BoegenStil />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Stimme von {f.name}</strong>
        <button type="button" className="pl-zeile-weg" style={{ opacity: 1 }} aria-label="Spalte Stimme schließen" onClick={() => setze(false)}>
          ×
        </button>
      </div>
      <span className="fb-leise">
        Die KI meldet Stellen, an denen {f.name} in Rede oder Ton auffällig anders klingt als sonst – mit der auffälligen und einer typischen Stelle. Sie schlägt
        keine Formulierungen vor.
      </span>
      <span className="fb-leise">
        Lokal gefunden: {rede.stellen.length === 1 ? '1 Redestelle' : `${rede.stellen.length} Redestellen`}
        {rede.kapitel.length > 0 && ` in ${rede.kapitel.length === 1 ? '1 Kapitel' : `${rede.kapitel.length} Kapiteln`}`} (Zuordnung geschätzt)
        {rede.stellen.length < STIMME_MIN_REDE && ' – vermutlich zu wenig für einen Vergleich.'}
      </span>
      {f.existenz === 'bewusst_vage' && (
        <div className="fb-vage">{f.name} ist bewusst vage angelegt. Die KI meldet nur sehr deutliche Brüche und legt nicht fest, wer die Figur ist.</div>
      )}

      {laeuft ? (
        <div className="fb-reihe" aria-live="polite">
          <span className="fb-leise" style={{ flex: 1 }}>
            Die KI liest die Rede von {f.name} …
          </span>
          <Button klein onClick={abbrechen}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button variante="primaer" onClick={() => oeffneDialog('stimme-pruefen', { figur })} disabled={!!lauf} title={lauf ? 'Es läuft schon eine Prüfung.' : undefined}>
          {geprueft ? 'Erneut prüfen …' : 'Stimme prüfen …'}
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
            ? `${f.name} spricht zu wenig für einen Vergleich.`
            : ergebnis.neu > 0
              ? `${ergebnis.neu === 1 ? '1 neue Beobachtung' : `${ergebnis.neu} neue Beobachtungen`}.`
              : 'Keine neuen Auffälligkeiten.'}
        </span>
      )}
      {ablageLauf && alle.length > 0 && (
        <span className="fb-leise">
          Letzte Prüfung: {[datumText(ablageLauf.datum), ablageLauf.modell].filter(Boolean).join(' · ')}
        </span>
      )}

      {alle.length > 0 && (
        <Segment<'offen' | 'entschieden'>
          label="Beobachtungen filtern"
          rolle="group"
          voll
          wert={filter}
          onChange={setFilter}
          optionen={[
            { wert: 'offen', label: `Offen · ${offen.length}` },
            { wert: 'entschieden', label: `Entschieden · ${entschieden.length}` },
          ]}
        />
      )}
      {alle.length === 0 ? (
        <span className="fb-leise" style={{ paddingTop: 6 }}>
          {geprueft ? 'Keine Auffälligkeiten gemeldet.' : 'Noch nicht geprüft.'}
        </span>
      ) : liste.length === 0 ? (
        <span className="fb-leise">{filter === 'offen' ? 'Nichts mehr offen.' : 'Noch nichts entschieden.'}</span>
      ) : (
        liste.map((e) => <Beobachtung key={e.beobachtung.schluessel} daten={daten} eintrag={e} />)
      )}
    </Inspektor>
  );
}
