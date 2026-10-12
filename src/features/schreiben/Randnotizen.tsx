/**
 * Anmerkungen am Rand neben ihrer Stelle (S-06): Karte mit Avatar, „Notiz an Paul“, Text mit
 * Verweisen und Kapitel-Links; neue Notiz mit Ziel-Auswahl und `[[`-Vorschlägen; Sammelbox für
 * Notizen, deren Stelle nicht mehr gefunden wird. Ist der Rand zu schmal, stehen dort nur Punkte.
 */
import type { Anmerkung, Id, ProjektDaten, TextAnker, Verweis } from '@core/model/types';
import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore } from '../../state/store';
import { datum, f, useTexte, vergleich } from '../../i18n';
import { Abschnittslabel, Avatar, Button, klassen } from '../../ui';
import { notizBereiche } from './dekorationen';
import { VerweisFeld, VerweisText } from './VerweisFeld';
import { kapitelAnzeige, kapitelVerweise } from './verweise';
import { fokusFiguren, notizKopf, schluesselVerweis, verweisSchluessel } from './ziele';

export const ENTWURF = '__entwurf';

export interface NotizEntwurf {
  anker: TextAnker;
  from: number;
  to: number;
  ziel: Verweis | null;
  notiz: string;
}

interface Props {
  editor: Editor;
  kapitelId: Id;
  randRef: RefObject<HTMLDivElement | null>;
  anmerkungen: Anmerkung[];
  verwaist: Id[];
  entwurf: NotizEntwurf | null;
  setEntwurf(e: NotizEntwurf | null): void;
  aktiv: Id | null;
  setAktiv(id: Id | null): void;
  /** Stelle im Text auswählen und hinscrollen */
  zuStelle(id: Id): void;
  /** Verwaiste Notiz an die aktuelle Auswahl heften */
  neuVerankern(id: Id): void;
}

const SCHMAL = 170;

function gleich(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

function ZielAuswahl({ daten, kapitelId, wert, onChange }: { daten: ProjektDaten; kapitelId: Id; wert: Verweis | null; onChange(v: Verweis | null): void }) {
  const T = useTexte().schreiben.notizen;
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? vergleich(a.name, b.name) : a.rolle === 'haupt' ? -1 : 1));
  const orte = Object.values(daten.orte).sort((a, b) => vergleich(a.name, b.name));
  const kopf = notizKopf(daten, wert, kapitelId, true);
  return (
    <>
      <span>{kopf.praefix}</span>
      <select aria-label={T.hefteLabel} value={verweisSchluessel(wert)} onChange={(e) => onChange(schluesselVerweis(e.target.value))}>
        <optgroup label={T.figuren}>
          {figuren.map((f) => (
            <option key={f.id} value={`figur:${f.id}`}>
              {f.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={T.orte}>
          {orte.map((o) => (
            <option key={o.id} value={`ort:${o.id}`}>
              {o.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={T.diesesKapitel}>
          <option value={`kapitel:${kapitelId}`}>{T.kapitel}</option>
          <option value={`plan:${kapitelId}`}>{T.planKarte}</option>
        </optgroup>
      </select>
    </>
  );
}

function avatarFarbe(ziel: Verweis | null, fokus: Set<Id>): string {
  if (ziel?.typ === 'figur') return fokus.has(ziel.id) ? 'var(--accent)' : 'var(--ink)';
  return 'var(--ink-quiet)';
}

export function Randnotizen({ editor, kapitelId, randRef, anmerkungen, verwaist, entwurf, setEntwurf, aktiv, setAktiv, zuStelle, neuVerankern }: Props) {
  const daten = useStore((s) => s.daten);
  const waehle = useStore((s) => s.waehle);
  const anmerkungAnlegen = useStore((s) => s.anmerkungAnlegen);
  const anmerkungAendern = useStore((s) => s.anmerkungAendern);
  const anmerkungEntfernen = useStore((s) => s.anmerkungEntfernen);
  const t = useTexte();
  const T = t.schreiben.notizen;

  const [wunsch, setWunsch] = useState<Record<Id, number>>({});
  const [lage, setLage] = useState<Record<Id, number>>({});
  const [breite, setBreite] = useState(400);
  const [bearbeiten, setBearbeiten] = useState<{ id: Id; notiz: string; ziel: Verweis | null } | null>(null);
  const [hatAuswahl, setHatAuswahl] = useState(false);
  const karten = useRef(new Map<Id, HTMLElement>());
  const sammelRef = useRef<HTMLDivElement>(null);

  const fokus = useMemo(() => (daten ? fokusFiguren(daten.plaene[kapitelId], daten.figuren) : new Set<Id>()), [daten, kapitelId]);
  const verwaistSet = useMemo(() => new Set(verwaist), [verwaist]);
  const verwaiste = anmerkungen.filter((a) => verwaistSet.has(a.id));
  const schmal = breite < SCHMAL;

  // Wunschposition = Zeile der Stelle; nachgeführt bei jeder Änderung (einmal pro Bild)
  useEffect(() => {
    let rahmen = 0;
    const messen = () => {
      rahmen = 0;
      const rand = randRef.current;
      if (!rand || editor.isDestroyed) return;
      const oben = rand.getBoundingClientRect().top;
      const neu: Record<Id, number> = {};
      for (const [id, b] of notizBereiche(editor.state)) {
        try {
          neu[id] = Math.round(editor.view.coordsAtPos(b.from).top - oben - 4);
        } catch {
          /* Position nicht darstellbar */
        }
      }
      setWunsch((alt) => (gleich(alt, neu) ? alt : neu));
      setBreite(rand.clientWidth);
      setHatAuswahl(!editor.state.selection.empty);
    };
    const planen = () => {
      if (!rahmen) rahmen = requestAnimationFrame(messen);
    };
    editor.on('transaction', planen);
    window.addEventListener('resize', planen);
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(planen);
    beobachter?.observe(editor.view.dom);
    if (randRef.current) beobachter?.observe(randRef.current);
    void document.fonts?.ready.then(planen);
    planen();
    return () => {
      editor.off('transaction', planen);
      window.removeEventListener('resize', planen);
      beobachter?.disconnect();
      if (rahmen) cancelAnimationFrame(rahmen);
    };
  }, [editor, randRef]);

  // Karten untereinander stapeln, ohne sich zu überdecken
  useLayoutEffect(() => {
    const reihen = Object.entries(wunsch).sort((a, b) => a[1] - b[1]);
    let unten = verwaiste.length && sammelRef.current ? sammelRef.current.offsetHeight + 12 : 0;
    const neu: Record<Id, number> = {};
    for (const [id, top] of reihen) {
      const t = schmal ? top : Math.max(top, unten);
      neu[id] = t;
      const h = karten.current.get(id)?.offsetHeight ?? 0;
      if (!schmal || id === aktiv || id === ENTWURF) unten = t + h + 8;
    }
    if (!gleich(neu, lage)) setLage(neu);
  });

  if (!daten) return null;

  const speichernEntwurf = async () => {
    if (!entwurf) return;
    const text = entwurf.notiz.trim();
    if (!text) {
      setEntwurf(null);
      return;
    }
    const neu = await anmerkungAnlegen(entwurf.anker, text, entwurf.ziel);
    setEntwurf(null);
    setAktiv(neu.id);
  };

  const speichernBearbeitung = async () => {
    if (!bearbeiten) return;
    const text = bearbeiten.notiz.trim();
    if (text) await anmerkungAendern(bearbeiten.id, { notiz: text, ziel: bearbeiten.ziel });
    setBearbeiten(null);
  };

  const kapitelLinks = (notiz: string) =>
    kapitelVerweise(notiz, daten).map((id) => (
      <button
        key={id}
        type="button"
        className="pw-s-notizkarte__link"
        onClick={(e) => {
          e.stopPropagation();
          waehle({ kapitel: id });
        }}
      >
        → {kapitelAnzeige(daten, id)}
      </button>
    ));

  const sichtbar = anmerkungen.filter((a) => wunsch[a.id] !== undefined);

  return (
    <>
      {verwaiste.length > 0 && !schmal && (
        <div ref={sammelRef} className="pw-s-sammelbox" role="region" aria-label={T.ohneStelleLabel}>
          <Abschnittslabel>{T.nichtGefunden}</Abschnittslabel>
          {verwaiste.map((a) => {
            const kopf = notizKopf(daten, a.ziel, kapitelId);
            return (
              <div key={a.id} className="pw-s-sammelbox__eintrag">
                <span className="pw-s-sammelbox__zitat">{f(t.schreiben.zitat, { text: a.anker.exakt })}</span>
                <span className="pw-s-notizkarte__text">
                  <strong>{`${kopf.praefix} ${kopf.name}`.trim()}:</strong> <VerweisText text={a.notiz} />
                </span>
                <div className="pw-s-notizkarte__aktionen">
                  <Button
                    klein
                    variante="text"
                    className="pw-s-notizkarte__loeschen"
                    style={{ paddingLeft: 0 }}
                    onClick={() => void anmerkungEntfernen(a.id)}
                  >
                    {t.gemeinsam.loeschen}
                  </Button>
                  <Button klein disabled={!hatAuswahl} title={hatAuswahl ? undefined : T.erstMarkieren} onClick={() => neuVerankern(a.id)}>
                    {T.anheften}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sichtbar.map((a) => {
        const istAktiv = a.id === aktiv;
        const top = lage[a.id] ?? wunsch[a.id] ?? 0;
        const kopf = notizKopf(daten, a.ziel, kapitelId);
        const fokusFigur = a.ziel?.typ === 'figur' && fokus.has(a.ziel.id);
        if (schmal && !istAktiv)
          return (
            <button
              key={a.id}
              type="button"
              className="pw-s-notizpunkt"
              style={{ top }}
              title={`${kopf.praefix} ${kopf.name}: ${a.notiz}`}
              onClick={() => {
                setAktiv(a.id);
                zuStelle(a.id);
              }}
            >
              <Avatar name={kopf.name || 'N'} farbe={avatarFarbe(a.ziel, fokus)} groesse={18} />
            </button>
          );
        const inBearbeitung = bearbeiten?.id === a.id;
        return (
          <div
            key={a.id}
            ref={(el) => {
              if (el) karten.current.set(a.id, el);
              else karten.current.delete(a.id);
            }}
            className={klassen('pw-s-notizkarte', istAktiv && 'pw-s-notizkarte--aktiv', fokusFigur && 'pw-s-notizkarte--fokus', schmal && 'pw-s-notizkarte--schmal')}
            style={{ top }}
            onClick={() => {
              if (inBearbeitung) return;
              setAktiv(a.id);
              zuStelle(a.id);
            }}
          >
            <span className="pw-s-notizkarte__kopf">
              <Avatar name={inBearbeitung ? (notizKopf(daten, bearbeiten!.ziel, kapitelId).name || 'N') : kopf.name || 'N'} farbe={avatarFarbe(inBearbeitung ? bearbeiten!.ziel : a.ziel, fokus)} groesse={18} />
              {inBearbeitung ? (
                <ZielAuswahl daten={daten} kapitelId={kapitelId} wert={bearbeiten!.ziel} onChange={(ziel) => setBearbeiten({ ...bearbeiten!, ziel })} />
              ) : (
                `${kopf.praefix} ${kopf.name}`.trim()
              )}
              {!inBearbeitung && a.quelle === 'word' && (
                <span className="pw-s-notizkarte__herkunft" title={[a.autor, a.erstellt ? datum(a.erstellt, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''].filter(Boolean).join(' · ')}>
                  {T.ausWord}
                </span>
              )}
            </span>
            {inBearbeitung ? (
              <>
                <VerweisFeld
                  label={T.notiz}
                  wert={bearbeiten!.notiz}
                  kontext={bearbeiten!.ziel}
                  autoFocus
                  onChange={(notiz) => setBearbeiten({ ...bearbeiten!, notiz })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void speichernBearbeitung();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setBearbeiten(null);
                    }
                  }}
                />
                <div className="pw-s-notizkarte__aktionen">
                  <Button klein variante="text" className="pw-s-notizkarte__loeschen" style={{ paddingLeft: 0 }} onClick={() => void anmerkungEntfernen(a.id)}>
                    {t.gemeinsam.loeschen}
                  </Button>
                  <Button klein onClick={() => setBearbeiten(null)}>
                    {t.gemeinsam.abbrechen}
                  </Button>
                  <Button klein variante="primaer" onClick={() => void speichernBearbeitung()}>
                    {t.gemeinsam.speichern}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="pw-s-notizkarte__text">
                  <VerweisText text={a.notiz} />
                </span>
                {kapitelLinks(a.notiz)}
                {istAktiv && (
                  <div className="pw-s-notizkarte__aktionen">
                    <Button
                      klein
                      variante="text"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBearbeiten({ id: a.id, notiz: a.notiz, ziel: a.ziel });
                      }}
                    >
                      {t.gemeinsam.bearbeiten}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {entwurf && wunsch[ENTWURF] !== undefined && (
        <div
          ref={(el) => {
            if (el) karten.current.set(ENTWURF, el);
            else karten.current.delete(ENTWURF);
          }}
          className={klassen(
            'pw-s-notizkarte pw-s-notizkarte--aktiv',
            entwurf.ziel?.typ === 'figur' && fokus.has(entwurf.ziel.id) && 'pw-s-notizkarte--fokus',
            schmal && 'pw-s-notizkarte--schmal',
          )}
          style={{ top: lage[ENTWURF] ?? wunsch[ENTWURF] }}
        >
          <span className="pw-s-notizkarte__kopf">
            <Avatar name={notizKopf(daten, entwurf.ziel, kapitelId, true).name || 'N'} farbe={avatarFarbe(entwurf.ziel, fokus)} groesse={18} />
            <ZielAuswahl daten={daten} kapitelId={kapitelId} wert={entwurf.ziel} onChange={(ziel) => setEntwurf({ ...entwurf, ziel })} />
          </span>
          <VerweisFeld
            label={T.notiz}
            wert={entwurf.notiz}
            kontext={entwurf.ziel}
            autoFocus
            placeholder={T.platzhalter}
            onChange={(notiz) => setEntwurf({ ...entwurf, notiz })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void speichernEntwurf();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEntwurf(null);
                editor.commands.focus();
              }
            }}
          />
          <div className="pw-s-notizkarte__aktionen">
            <Button
              klein
              onClick={() => {
                setEntwurf(null);
                editor.commands.focus();
              }}
            >
              {t.gemeinsam.abbrechen}
            </Button>
            <Button klein variante="primaer" disabled={!entwurf.notiz.trim()} onClick={() => void speichernEntwurf()}>
              {t.gemeinsam.speichern}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
