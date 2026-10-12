/**
 * Bearbeitung einer Bogen-Stufe (G3) unter dem Raster: Titel, Platz (Kapitel oder Akt), Notiz, Belege aus dem Text.
 * Belege wählt Leon selbst – aus Sätzen, in denen die Figur genannt wird, oder als wörtliches Zitat. Besitzer: G3.
 */
import { useId, useState } from 'react';
import {
  auftritteJeKapitel,
  belegGefunden,
  belegVorschlaege,
  gleicherAnker,
  kapitelDesAkts,
  kapitelTitel,
  stufenMeldungen,
  stufenOrt,
  stufeVerschieben,
} from '@core/figuren/index';
import type { Index } from '@core/index/index';
import type { BogenStufe, Id, ProjektDaten, TextAnker } from '@core/model/types';
import { useStore } from '../../state/store';
import { bestaetigen, Button } from '../../ui';
import { Abschnitt, EntwurfBereich, EntwurfFeld, zitatAnker } from '../akte/gemeinsam';
import { fokussiereStufe } from './Boegen';

interface Props {
  daten: ProjektDaten;
  index: Index;
  figur: Id;
  stufe: BogenStufe;
  /** frisch angelegt: Titel fokussieren und markieren */
  fokusTitel?: boolean;
  onSchliessen(): void;
}

function platzWert(s: BogenStufe): string {
  if (s.kapitel) return `k:${s.kapitel}`;
  if (s.akt !== undefined) return `a:${s.akt}`;
  return '';
}

function mitPlatz(s: BogenStufe, wert: string): BogenStufe {
  const { kapitel: _k, akt: _a, ...rest } = s;
  void _k;
  void _a;
  if (wert.startsWith('k:')) return { ...rest, kapitel: wert.slice(2) };
  if (wert.startsWith('a:')) return { ...rest, akt: Number(wert.slice(2)) };
  return rest;
}

function mitNotiz(s: BogenStufe, notiz: string): BogenStufe {
  const { notiz: _n, ...rest } = s;
  void _n;
  return notiz.trim() ? { ...rest, notiz: notiz.trim() } : rest;
}

export function StufenBearbeitung({ daten, index, figur, stufe, fokusTitel, onSchliessen }: Props) {
  const fb = useStore((s) => s.figurenbogen);
  const markiere = useStore((s) => s.markiere);
  const uid = useId();
  const f = daten.figuren[figur];
  const reihe = daten.projekt.kapitel;
  const nr = (k: Id) => reihe.indexOf(k) + 1;
  const auftritte = auftritteJeKapitel(index.erwaehnungen, figur);
  const meldungen = stufenMeldungen(daten, stufe, auftritte);

  // Kapitel für Belege: Kapitel der Stufe, bei Akt-Stufen das erste Kapitel des Akts mit Auftritt
  const kandidaten = stufe.kapitel ? [stufe.kapitel] : stufe.akt !== undefined ? kapitelDesAkts(daten, stufe.akt) : [];
  const vorschlagStart = kandidaten.find((k) => auftritte.has(k)) ?? kandidaten[0] ?? reihe.find((k) => auftritte.has(k)) ?? reihe[0] ?? '';
  const [belegKapitel, setBelegKapitel] = useState<Id>(vorschlagStart);
  const [zitat, setZitat] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const vorschlaege = belegKapitel
    ? belegVorschlaege(daten, index.erwaehnungen, figur, belegKapitel, 8).filter((a) => !stufe.belege.some((b) => gleicherAnker(a, b)))
    : [];
  const kapitelMitText = reihe.filter((k) => daten.kapitel[k]?.text.trim());

  const speichern = (s: BogenStufe) => fb.stufeSpeichern(figur, s);
  const verschieben = async (richtung: -1 | 1) => {
    const neu = stufeVerschieben(daten, stufe, richtung);
    if (neu) await speichern(neu);
  };
  const zeigen = (a: TextAnker) => markiere({ kapitel: a.kapitel, anker: a.davor || a.danach ? a : zitatAnker(daten, a.kapitel, a.exakt) });
  const zitatHinzufuegen = async () => {
    if (!zitat.trim() || !belegKapitel) return;
    const r = await fb.belegAusZitatHinzufuegen(figur, stufe.id, belegKapitel, zitat);
    setFehler(r);
    if (!r) setZitat('');
  };

  return (
    <Abschnitt
      label={`Stufe „${stufe.titel}“ bearbeiten`}
      titel={
        <span>
          Stufe <span style={{ fontWeight: 400, color: 'var(--ink-quiet)' }}>· {f?.name ?? figur} · {stufenOrt(daten, stufe)}</span>
        </span>
      }
      rechts={
        <Button klein variante="leise" onClick={onSchliessen} aria-keyshortcuts="Escape">
          Fertig
        </Button>
      }
      hintergrund="var(--inspector)"
    >
      <div
        style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
            e.stopPropagation();
            onSchliessen();
          }
        }}
      >
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="pw-feld__label" htmlFor={`${uid}-titel`}>
            Titel
          </label>
          <EntwurfFeld
            id={`${uid}-titel`}
            className="pl-eingabe"
            autoFocus={fokusTitel}
            onFocus={(e) => fokusTitel && e.currentTarget.select()}
            placeholder="z. B. im Lot, ohne Schlaf"
            wert={stufe.titel}
            onSpeichern={(t) => t.trim() && t.trim() !== stufe.titel && void speichern({ ...stufe, titel: t.trim() })}
          />
          <label className="pw-feld__label" htmlFor={`${uid}-platz`}>
            Erreicht in
          </label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              id={`${uid}-platz`}
              className="pl-select"
              style={{ flex: 1, minWidth: 0 }}
              value={platzWert(stufe)}
              onChange={(e) => void speichern(mitPlatz(stufe, e.target.value)).then(() => fokussiereStufe(figur, stufe.id))}
            >
              <optgroup label="Kapitel">
                {reihe.map((k, i) => (
                  <option key={k} value={`k:${k}`}>
                    Kap. {i + 1} „{kapitelTitel(daten, k)}“
                  </option>
                ))}
              </optgroup>
              {daten.akte.length > 0 && (
                <optgroup label="Ganzer Akt">
                  {daten.akte.map((a) => (
                    <option key={a.nummer} value={`a:${a.nummer}`}>
                      {a.titel || `Akt ${a.nummer}`}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="">ohne Kapitel</option>
            </select>
            <Button klein aria-label="Ein Kapitel früher" title="Früher (⌥←)" disabled={!stufeVerschieben(daten, stufe, -1)} onClick={() => void verschieben(-1)}>
              ←
            </Button>
            <Button klein aria-label="Ein Kapitel später" title="Später (⌥→)" disabled={!stufeVerschieben(daten, stufe, 1)} onClick={() => void verschieben(1)}>
              →
            </Button>
          </span>
          <label className="pw-feld__label" htmlFor={`${uid}-notiz`}>
            Notiz
          </label>
          <EntwurfBereich
            id={`${uid}-notiz`}
            className="pl-bereich"
            rows={3}
            autoHoehe
            placeholder="Was zeigt sich hier an der Figur?"
            wert={stufe.notiz ?? ''}
            onSpeichern={(n) => (n.trim() || undefined) !== stufe.notiz && void speichern(mitNotiz(stufe, n))}
          />
          {meldungen.map((m) => (
            <div key={m.art} className="fb-meldung" role="status">
              {m.art === 'ohne_platz' && 'Die Stufe hat noch keinen Platz im Buch und erscheint nicht im Raster.'}
              {m.art === 'kein_auftritt' && `${f?.name ?? 'Die Figur'} kommt in Kap. ${nr(m.kapitel)} im Text nicht vor.`}
              {m.art === 'verwaist' && `${m.anzahl === 1 ? 'Ein Beleg steht' : `${m.anzahl} Belege stehen`} so nicht mehr im Text.`}
            </div>
          ))}
          <Button
            klein
            variante="text"
            style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
            onClick={async () => (await bestaetigen(`Stufe „${stufe.titel}“ löschen?`, { knopf: 'Löschen' })) && void fb.stufeEntfernen(figur, stufe.id)}
          >
            Stufe löschen
          </Button>
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="fb-label">Belege aus dem Text</span>
          {stufe.belege.length === 0 && <span className="fb-leise">Noch keine Belege. Wähle unten einen Satz oder füge ein wörtliches Zitat ein.</span>}
          {stufe.belege.map((b, i) => {
            const da = belegGefunden(daten, b);
            return (
              <div key={`${b.kapitel}-${i}`} className="fb-beleg pl-zeile">
                <button type="button" className="pl-link" onClick={() => zeigen(b)} title="Im Text zeigen" disabled={!daten.kapitel[b.kapitel]}>
                  Kap. {nr(b.kapitel) || '?'} · <span className="fb-zitat">»{b.exakt}«</span>
                </button>
                {!da && (
                  <span className="pl-etikett" style={{ background: 'var(--ruhend)', color: 'var(--warm-dark)' }} title="Die Stelle steht so nicht mehr im Text">
                    verwaist
                  </span>
                )}
                <button type="button" className="pl-zeile-weg" aria-label={`Beleg aus Kap. ${nr(b.kapitel)} entfernen`} onClick={() => void fb.belegEntfernen(figur, stufe.id, i)}>
                  ×
                </button>
              </div>
            );
          })}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--line-faint)' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="pw-feld__label" htmlFor={`${uid}-kap`} style={{ whiteSpace: 'nowrap' }}>
                Beleg aus
              </label>
              <select
                id={`${uid}-kap`}
                className="pl-select"
                style={{ flex: 1, minWidth: 0 }}
                value={belegKapitel}
                onChange={(e) => {
                  setBelegKapitel(e.target.value);
                  setFehler(null);
                }}
              >
                {kapitelMitText.map((k) => (
                  <option key={k} value={k}>
                    Kap. {nr(k)} „{kapitelTitel(daten, k)}“{auftritte.has(k) ? '' : ' · ohne Nennung'}
                  </option>
                ))}
              </select>
            </span>
            {vorschlaege.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Sätze mit der Figur">
                {vorschlaege.map((a) => (
                  <li key={a.exakt} className="fb-beleg">
                    <span className="fb-zitat" style={{ flex: 1, minWidth: 0 }}>
                      »{a.exakt}«
                    </span>
                    <Button klein onClick={() => void fb.belegHinzufuegen(figur, stufe.id, a)} aria-label={`Als Beleg übernehmen: ${a.exakt}`}>
                      + Beleg
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="fb-leise">
                {belegKapitel && auftritte.has(belegKapitel) ? 'Alle Sätze mit der Figur sind schon Belege.' : 'In diesem Kapitel wird die Figur nicht genannt – füge ein Zitat ein.'}
              </span>
            )}
            <form
              style={{ display: 'flex', gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                void zitatHinzufuegen();
              }}
            >
              <label htmlFor={`${uid}-zitat`} className="pw-sr">
                Wörtliches Zitat aus dem Kapitel
              </label>
              <input
                id={`${uid}-zitat`}
                className="pl-eingabe"
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Wörtliches Zitat einfügen"
                value={zitat}
                aria-invalid={!!fehler}
                aria-describedby={fehler ? `${uid}-fehler` : undefined}
                onChange={(e) => {
                  setZitat(e.target.value);
                  setFehler(null);
                }}
              />
              <Button type="submit" disabled={!zitat.trim() || !belegKapitel}>
                Hinzufügen
              </Button>
            </form>
            {fehler && (
              <span id={`${uid}-fehler`} className="fb-fehler" role="alert">
                {fehler}
              </span>
            )}
          </div>
        </div>
      </div>
    </Abschnitt>
  );
}
