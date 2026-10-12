/**
 * KI-Vorschläge für Erwähnungen eines Kapitels (Haiku): indirekte Erwähnungen und unbekannte Namen.
 * Gedacht für den Tab „Erkannt“ im Editor. Bestätigen/Verwerfen → entscheidungen.zuordnungen.
 */
import { useState } from 'react';
import { spitznameAusText } from '@core/figuren/namen';
import type { ErwaehnungsVorschlag } from '@core/ki/index';
import type { Id, Verweis } from '@core/model/types';
import { f, texte, useTexte } from '../../i18n';
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
  const spitznameHinzufuegen = useStore((s) => s.planung.spitznameHinzufuegen);
  const markiere = useStore((s) => s.markiere);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const oeffne = useStore((s) => s.oeffne);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; ziel?: Verweis } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const t = useTexte();
  const T = t.ki.vorschlaege;

  const liste = eintrag?.liste ?? [];
  const laedt = eintrag?.laedt ?? false;

  function zielName(z: Verweis, quelle = { figuren, orte }): string {
    if (z.typ === 'figur') return quelle.figuren?.[z.id]?.name ?? z.id;
    if (z.typ === 'ort') return quelle.orte?.[z.id]?.name ?? z.id;
    return z.id;
  }

  async function aktion(v: ErwaehnungsVorschlag, was: 'bestaetigt' | 'verworfen' | 'anlegen' | 'spitzname') {
    setArbeitet(schluessel(v));
    setFehler(null);
    setMeldung(null);
    try {
      if (was === 'anlegen') {
        const ziel = await anlegen(v);
        const aktuell = useStore.getState().daten;
        const name = zielName(ziel, { figuren: aktuell?.figuren, orte: aktuell?.orte });
        const vorlagen = texte().ki.vorschlaege;
        setMeldung({ text: f(ziel.typ === 'ort' ? vorlagen.ortAngelegt : vorlagen.figurAngelegt, { name }), ziel });
      } else if (was === 'spitzname' && v.ziel?.typ === 'figur') {
        // F-10: diese Stelle bestätigen und den Wortlaut künftig immer erkennen
        const name = spitznameAusText(v.text);
        await spitznameHinzufuegen(v.ziel.id, name);
        await entscheiden(v, 'bestaetigt');
        setMeldung({ text: f(texte().ki.vorschlaege.spitznameGemerkt, { name, figur: zielName(v.ziel) }), ziel: v.ziel });
      } else if (was !== 'spitzname') {
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
        <Abschnittslabel id={`ki-vorschlaege-${kapitel}`}>{T.titel}</Abschnittslabel>
        <Button klein onClick={() => void holen(kapitel)} disabled={laedt || !hatText}>
          {laedt ? T.liest : eintrag?.geholt ? T.erneut : T.holen}
        </Button>
      </div>

      {!eintrag?.geholt && !laedt && !eintrag?.fehler && <p className="pw-ki-klein">{hatText ? T.erklaerung : T.ohneText}</p>}
      {laedt && (
        <p className="pw-ki-klein" aria-live="polite">
          {T.haikuLiest}
        </p>
      )}

      {eintrag?.fehler && (
        <div className="pw-ki-hinweis" role="alert">
          <span>{eintrag.fehler.text}</span>
          {eintrag.fehler.art === 'nicht_bereit' && (
            <Button klein onClick={() => oeffneDialog('ki-einstellungen')}>
              {T.einstellungen}
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
              {t.gemeinsam.oeffnen}
            </Button>
          )}
        </p>
      )}

      {eintrag?.geholt && !laedt && liste.length === 0 && !eintrag.fehler && <p className="pw-ki-klein">{T.keine}</p>}

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
                    title={T.stelleZeigen}
                    onClick={() => markiere({ kapitel: v.anker.kapitel, anker: v.anker })}
                  >
                    {v.text}
                  </button>
                  <span aria-hidden="true">→</span>
                  {v.ziel ? (
                    <span className="pw-ki-vorschlag__ziel">{zielName(v.ziel)}</span>
                  ) : (
                    <span className="pw-ki-vorschlag__ziel pw-ki-vorschlag__ziel--neu">{v.zielTyp === 'ort' ? T.unbekannterOrt : T.unbekannteFigur}</span>
                  )}
                </div>
                {v.begruendung && <p className="pw-ki-klein">{v.begruendung}</p>}
                <div className="pw-ki-vorschlag__knoepfe">
                  {v.ziel ? (
                    <>
                      <Button klein onClick={() => void aktion(v, 'bestaetigt')} disabled={beschaeftigt}>
                        {T.bestaetigen}
                      </Button>
                      {v.ziel.typ === 'figur' && (
                        <Button
                          klein
                          variante="leise"
                          onClick={() => void aktion(v, 'spitzname')}
                          disabled={beschaeftigt}
                          title={f(T.spitznameTitel, { name: spitznameAusText(v.text), figur: zielName(v.ziel) })}
                        >
                          {T.spitzname}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button klein onClick={() => void aktion(v, 'anlegen')} disabled={beschaeftigt}>
                      {v.zielTyp === 'ort' ? T.ortAnlegen : T.figurAnlegen}
                    </Button>
                  )}
                  <Button klein variante="leise" onClick={() => void aktion(v, 'verworfen')} disabled={beschaeftigt}>
                    {T.verwerfen}
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
