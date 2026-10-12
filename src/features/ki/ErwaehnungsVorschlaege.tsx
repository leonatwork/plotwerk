/**
 * KI-Vorschläge für Erwähnungen eines Kapitels (Haiku): indirekte Erwähnungen und unbekannte Namen.
 * Gedacht für den Tab „Erkannt“ im Editor. Bestätigen/Verwerfen → entscheidungen.zuordnungen.
 */
import { useState } from 'react';
import type { ErwaehnungsVorschlag } from '@core/ki/index';
import type { Id, Verweis } from '@core/model/types';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button } from '../../ui';
import './ki.css';

export interface ErwaehnungsVorschlaegeProps {
  kapitel: Id;
}

function schluessel(v: ErwaehnungsVorschlag): string {
  return `${v.anker.kapitel}|${v.anker.davor}|${v.anker.exakt}|${v.anker.danach}`;
}

export function ErwaehnungsVorschlaege({ kapitel }: ErwaehnungsVorschlaegeProps) {
  const eintrag = useStore((s) => s.kiVorschlaege[kapitel]);
  const figuren = useStore((s) => s.daten?.figuren);
  const orte = useStore((s) => s.daten?.orte);
  const hatText = useStore((s) => !!s.daten?.kapitel[kapitel]?.text.trim());
  const holen = useStore((s) => s.kiVorschlaegeHolen);
  const entscheiden = useStore((s) => s.kiVorschlagEntscheiden);
  const anlegen = useStore((s) => s.kiVorschlagAnlegen);
  const markiere = useStore((s) => s.markiere);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const oeffne = useStore((s) => s.oeffne);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; ziel?: Verweis } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const liste = eintrag?.liste ?? [];
  const laedt = eintrag?.laedt ?? false;

  function zielName(z: Verweis, quelle = { figuren, orte }): string {
    if (z.typ === 'figur') return quelle.figuren?.[z.id]?.name ?? z.id;
    if (z.typ === 'ort') return quelle.orte?.[z.id]?.name ?? z.id;
    return z.id;
  }

  async function aktion(v: ErwaehnungsVorschlag, was: 'bestaetigt' | 'verworfen' | 'anlegen') {
    setArbeitet(schluessel(v));
    setFehler(null);
    setMeldung(null);
    try {
      if (was === 'anlegen') {
        const ziel = await anlegen(v);
        const aktuell = useStore.getState().daten;
        const name = zielName(ziel, { figuren: aktuell?.figuren, orte: aktuell?.orte });
        setMeldung({ text: `${ziel.typ === 'ort' ? 'Ort' : 'Figur'} „${name}“ angelegt.`, ziel });
      } else {
        await entscheiden(v, was);
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setArbeitet(null);
    }
  }

  return (
    <section className="pw-ki-vorschlaege" aria-labelledby={`ki-vorschlaege-${kapitel}`}>
      <div className="pw-ki-vorschlaege__kopf">
        <Abschnittslabel id={`ki-vorschlaege-${kapitel}`}>KI-Vorschläge</Abschnittslabel>
        <Button klein onClick={() => void holen(kapitel)} disabled={laedt || !hatText}>
          {laedt ? 'Liest …' : eintrag?.geholt ? 'Erneut holen' : 'Vorschläge holen'}
        </Button>
      </div>

      {!eintrag?.geholt && !laedt && !eintrag?.fehler && (
        <p className="pw-ki-klein">
          {hatText
            ? 'Indirekte Erwähnungen und unbekannte Namen, etwa „der Hafenmeister“ oder »Fiete«. Du entscheidest pro Stelle.'
            : 'Das Kapitel hat noch keinen Text.'}
        </p>
      )}
      {laedt && <p className="pw-ki-klein" aria-live="polite">Haiku liest das Kapitel …</p>}

      {eintrag?.fehler && (
        <div className="pw-ki-hinweis" role="alert">
          <span>{eintrag.fehler.text}</span>
          {eintrag.fehler.art === 'nicht_bereit' && (
            <Button klein onClick={() => oeffneDialog('ki-einstellungen')}>
              Einstellungen
            </Button>
          )}
        </div>
      )}
      {fehler && (
        <div className="pw-ki-hinweis" role="alert">
          {fehler}
        </div>
      )}
      {meldung && (
        <p className="pw-ki-klein" role="status">
          {meldung.text}{' '}
          {meldung.ziel && (
            <Button
              variante="text"
              klein
              style={{ height: 'auto', padding: 0 }}
              onClick={() => meldung.ziel && oeffne(meldung.ziel.typ === 'ort' ? 'orte' : 'figuren', meldung.ziel.typ === 'ort' ? { ort: meldung.ziel.id } : { figur: meldung.ziel.id })}
            >
              Öffnen
            </Button>
          )}
        </p>
      )}

      {eintrag?.geholt && !laedt && liste.length === 0 && !eintrag.fehler && <p className="pw-ki-klein">Keine offenen Vorschläge.</p>}

      {liste.length > 0 && (
        <ul className="pw-ki-vorschlaege__liste">
          {liste.map((v) => {
            const s = schluessel(v);
            const beschaeftigt = arbeitet === s;
            return (
              <li key={s} className="pw-ki-vorschlag">
                <div className="pw-ki-vorschlag__zeile">
                  <button
                    type="button"
                    className="pw-ki-vorschlag__stelle"
                    title="Stelle im Text zeigen"
                    onClick={() => markiere({ kapitel: v.anker.kapitel, anker: v.anker })}
                  >
                    {v.text}
                  </button>
                  <span aria-hidden="true">→</span>
                  {v.ziel ? (
                    <span className="pw-ki-vorschlag__ziel">{zielName(v.ziel)}</span>
                  ) : (
                    <span className="pw-ki-vorschlag__ziel pw-ki-vorschlag__ziel--neu">{v.zielTyp === 'ort' ? 'unbekannter Ort' : 'unbekannte Figur'}</span>
                  )}
                </div>
                {v.begruendung && <p className="pw-ki-klein">{v.begruendung}</p>}
                <div className="pw-ki-vorschlag__knoepfe">
                  {v.ziel ? (
                    <Button klein onClick={() => void aktion(v, 'bestaetigt')} disabled={beschaeftigt}>
                      Bestätigen
                    </Button>
                  ) : (
                    <Button klein onClick={() => void aktion(v, 'anlegen')} disabled={beschaeftigt}>
                      {v.zielTyp === 'ort' ? 'Ort anlegen' : 'Figur anlegen'}
                    </Button>
                  )}
                  <Button klein variante="leise" onClick={() => void aktion(v, 'verworfen')} disabled={beschaeftigt}>
                    Verwerfen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ErwaehnungsVorschlaege;
