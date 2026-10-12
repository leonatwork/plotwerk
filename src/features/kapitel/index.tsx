/** Bereich „Kapitel-Überblick“ (K-01–K-04, A-03) nach docs/design/screens/Kapitel.dc.html. Besitzer: Planung. */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Index } from '@core/index/index';
import type { Id, ProjektDaten, Realitaet } from '@core/model/types';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { faedenBisKapitel, kurzfassung, zusammenfassungFuer, type FadenBisHier } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Button, RealitaetsUmschalter, StrangPunkt } from '../../ui';
import { EntwurfFeld, LinkKnopf, strangFarbe, strangGeplant, strangKurzname, zahl } from '../akte/gemeinsam';
import { verweiseAlsText } from '../schreiben/verweise';
import { SzenenUebersicht } from '../faeden/Szenen';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { LeserSimulationKarte } from './LeserSimulationKarte';

const panel: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line-soft)',
  borderRadius: 12,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
};
const label = (farbe: string): CSSProperties => ({ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: farbe });

function Etikett({ children, art }: { children: ReactNode; art: 'neutral' | 'warn' | 'accent' }) {
  const stil =
    art === 'warn'
      ? { background: 'var(--ruhend)', color: 'var(--warm-dark)' }
      : art === 'accent'
        ? { background: 'var(--chip-accent)', color: 'var(--accent-dark)' }
        : { background: 'var(--chip)', color: 'var(--ink-soft)' };
  return (
    <span className="pl-etikett" style={stil}>
      {children}
    </span>
  );
}

function Zusammenfassung({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState({ text: '', kurz: '', wendung: '' });
  const speichern = useStore((s) => s.planung.zusammenfassungSpeichern);
  const zuruecksetzen = useStore((s) => s.planung.zusammenfassungZuruecksetzen);
  const bestaetigen = useStore((s) => s.planung.zusammenfassungBestaetigen);
  const oeffne = useStore((s) => s.oeffne);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const plan = daten.plaene[id];
  const kapitel = daten.kapitel[id];
  const z = zusammenfassungFuer(daten, index, id);
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const hatText = !!kapitel?.text.trim();
  const woerter = index.wortzahlen[id];
  const akt = plan?.akt != null ? daten.akte.find((a) => a.nummer === plan.akt) : undefined;
  const kopf = [
    `KAPITEL ${nr}`,
    !hatText ? 'NOCH OHNE TEXT' : woerter !== undefined ? `${zahl(woerter)} WÖRTER` : null,
    akt ? (akt.titel || `Akt ${akt.nummer}`).toLocaleUpperCase('de') : 'OHNE AKT',
  ]
    .filter(Boolean)
    .join(' · ');

  const starten = () => {
    setEntwurf({ text: z.text, kurz: z.kurz, wendung: z.wendung });
    setBearbeiten(true);
  };

  return (
    <section style={{ ...panel, padding: '18px 20px', gap: 10 }} aria-label="Zusammenfassung">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--ink-quiet)' }}>{kopf}</span>
        <span style={{ display: 'flex', gap: 14 }}>
          {hatText && !bearbeiten && (
            <LinkKnopf fett onClick={starten}>
              Bearbeiten
            </LinkKnopf>
          )}
          <LinkKnopf fett onClick={() => oeffne('schreiben', { kapitel: id })}>
            Im Editor öffnen
          </LinkKnopf>
        </span>
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 32, lineHeight: 1 }}>{plan?.titel || kapitel?.titel || id}</h2>
      {(z.quelle === 'bearbeitet' || z.analyseVeraltet) && !bearbeiten && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {z.quelle === 'bearbeitet' && <Etikett art="neutral">von dir bearbeitet</Etikett>}
          {z.veraltet && <Etikett art="warn">veraltet · Text seit der Bearbeitung geändert</Etikett>}
          {z.quelle !== 'bearbeitet' && z.analyseVeraltet && <Etikett art="warn">veraltet · Text seit der Prüfung geändert</Etikett>}
          {z.veraltet && <LinkKnopf onClick={() => void bestaetigen(id)}>Passt noch</LinkKnopf>}
          {z.quelle === 'bearbeitet' && z.hatAnalyse && (
            <LinkKnopf onClick={async () => (await rueckfrage('Deine Fassung verwerfen und die KI-Zusammenfassung zeigen?', { knopf: 'Verwerfen' })) && void zuruecksetzen(id)}>
              KI-Fassung wiederherstellen
            </LinkKnopf>
          )}
          {z.analyseVeraltet && z.quelle !== 'bearbeitet' && (
            <LinkKnopf onClick={() => oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel: id })}>Neu prüfen</LinkKnopf>
          )}
        </div>
      )}
      {bearbeiten ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!entwurf.text.trim()) return;
            void speichern(id, entwurf).then(() => setBearbeiten(false));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setBearbeiten(false);
          }}
        >
          <textarea
            className="pl-bereich"
            aria-label="Zusammenfassung"
            autoFocus
            rows={4}
            value={entwurf.text}
            onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })}
            style={{ fontSize: 15, lineHeight: 1.6 }}
          />
          <label style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>
            Kurzfassung für „Bis hierhin passiert“
            <input className="pl-eingabe" style={{ width: '100%', marginTop: 4 }} value={entwurf.kurz} onChange={(e) => setEntwurf({ ...entwurf, kurz: e.target.value })} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>
            Wendung
            <input className="pl-eingabe" style={{ width: '100%', marginTop: 4 }} value={entwurf.wendung} onChange={(e) => setEntwurf({ ...entwurf, wendung: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="submit" variante="primaer" disabled={!entwurf.text.trim()}>
              Speichern
            </Button>
            <Button onClick={() => setBearbeiten(false)}>Abbrechen</Button>
            <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>Deine Fassung wird bei neuen Prüfungen nie überschrieben.</span>
          </div>
        </form>
      ) : z.quelle === 'keine' ? (
        hatText ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-quiet)' }}>Noch nicht geprüft.</p>
            <Button onClick={() => oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel: id })}>Kapitel prüfen</Button>
            <LinkKnopf onClick={starten}>Selbst zusammenfassen</LinkKnopf>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-quiet)' }}>
            Noch kein Text.{plan?.notiz.trim() ? ` Geplant: ${verweiseAlsText(plan.notiz.trim())}` : ''}
          </p>
        )
      ) : (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{z.text}</p>
      )}
    </section>
  );
}

function Antagonisten({ id, daten, text }: { id: Id; daten: ProjektDaten; text: string }) {
  const plan = daten.plaene[id];
  const straenge = (plan?.straenge ?? []).map((s) => daten.straenge.find((x) => x.id === s)).filter((s) => !!s && !!s.gruppe);
  const akt = plan?.akt != null ? daten.akte.find((a) => a.nummer === plan.akt) : undefined;
  const praesenz = (akt?.antagonisten ?? [])
    .map((g) => daten.gruppen[g])
    .filter((g) => !!g && !!g.praesenz[akt!.nummer])
    .map((g) => `${g!.name} ${g!.praesenz[akt!.nummer]}`);
  return (
    <section style={{ ...panel, flex: '1 1 0' }}>
      <span style={label('var(--strang-organisation)')}>ANTAGONISTEN</span>
      <span style={{ fontSize: 14, lineHeight: 1.5 }}>{text || '–'}</span>
      {(straenge.length > 0 || praesenz.length > 0) && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
          {straenge.map((s) => (
            <span key={s!.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <StrangPunkt farbe={strangFarbe(s!.farbe)} geplant={strangGeplant(s!, daten)} />
              {strangKurzname(s!)}
            </span>
          ))}
          {praesenz.length > 0 && <span>Im Akt: {praesenz.join('; ')}</span>}
        </span>
      )}
    </section>
  );
}

function fadenText(f: FadenBisHier): string {
  const eroeffnet = f.eroeffnetPos + 1;
  const zuletzt = f.zuletztPos + 1;
  if (f.ruhendSeit === 0) return f.eroeffnetPos === f.zuletztPos ? 'in diesem Kapitel eröffnet' : `eröffnet in Kap. ${eroeffnet} · in diesem Kapitel aufgegriffen`;
  const seit = `seit ${f.ruhendSeit} ${f.ruhendSeit === 1 ? 'Kapitel' : 'Kapiteln'} ruhend`;
  return eroeffnet === zuletzt ? `eröffnet in Kap. ${eroeffnet} · ${seit}` : `eröffnet in Kap. ${eroeffnet} · zuletzt Kap. ${zuletzt} · ${seit}`;
}

function LoseEnden({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const setzen = useStore((s) => s.planung.fadenStatusSetzen);
  const liste = faedenBisKapitel(index.faeden, daten.projekt.kapitel, id, daten.entscheidungen);
  const sortiert = [...liste.filter((f) => f.status !== 'erledigt'), ...liste.filter((f) => f.status === 'erledigt')];
  const offen = liste.filter((f) => f.status === 'offen').length;
  return (
    <section style={{ ...panel, gap: 8, flex: '0 1 auto', minHeight: 150 }} aria-label="Lose Enden bis hier">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={label('var(--warm-dark)')}>LOSE ENDEN BIS HIER</span>
        <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{offen} offen</span>
      </div>
      {liste.length === 0 && (
        <span style={{ fontSize: 13, color: 'var(--ink-quiet)', lineHeight: 1.45 }}>
          {index.faeden.length === 0 ? 'Noch keine losen Enden bekannt. Sie entstehen bei der Prüfung der Kapitel.' : 'Bis hier ist kein Faden eröffnet.'}
        </span>
      )}
      <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortiert.map((f) => (
          <div
            key={f.faden.id}
            className="pl-zeile"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              position: 'relative',
              padding: '7px 10px',
              borderRadius: 6,
              background: f.ruhend ? 'var(--ruhend)' : 'var(--inspector)',
              opacity: f.status === 'erledigt' ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textDecoration: f.status === 'erledigt' ? 'line-through' : undefined }}>{f.faden.name}</span>
              {f.status !== 'offen' ? (
                <button type="button" className="pl-kleinknopf" onClick={() => void setzen(f.faden.id, 'offen')} title="wieder als offen führen">
                  {f.status === 'erledigt' ? 'erledigt' : 'bewusst offen'} ×
                </button>
              ) : (
                <span className="pl-hover-zeigen" style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 4, paddingLeft: 6, background: 'inherit' }}>
                  <button type="button" className="pl-kleinknopf" onClick={() => void setzen(f.faden.id, 'erledigt')}>
                    erledigt
                  </button>
                  <button type="button" className="pl-kleinknopf" onClick={() => void setzen(f.faden.id, 'bewusst_offen')}>
                    bewusst offen
                  </button>
                </span>
              )}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fadenText(f)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Realitaetsebene({ id, daten }: { id: Id; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const markiere = useStore((s) => s.markiere);
  const [neu, setNeu] = useState('');
  const plan = daten.plaene[id];
  const stellen = daten.entscheidungen.realitaet.filter((r) => r.anker.kapitel === id);
  const eintraege = plan?.realitaet ?? [];
  const leer = eintraege.length === 0 && stellen.length === 0;

  const zeile = (key: string, text: ReactNode, stufe: Realitaet, setze: (s: Realitaet) => void, entferne: () => void) => (
    <div key={key} className="pl-zeile" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line-faint)', flexShrink: 0 }}>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{text}</span>
        <button type="button" className="pl-zeile-weg" style={{ margin: '-2px 0' }} aria-label="Eintrag entfernen" onClick={entferne}>
          ×
        </button>
      </span>
      <RealitaetsUmschalter wert={stufe} onChange={setze} />
    </div>
  );

  return (
    <section style={{ ...panel, gap: 10, flex: '1 1 auto', minHeight: 0 }} aria-label="Real oder eingebildet?">
      <span style={label('var(--vage-dark)')}>REAL ODER EINGEBILDET?</span>
      <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {leer && <span style={{ fontSize: 13, color: 'var(--ink-quiet)' }}>In diesem Kapitel nichts markiert.</span>}
        {eintraege.map((r) =>
          zeile(
            r.id,
            r.anker ? (
              <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)' }} onClick={() => markiere({ kapitel: id, anker: r.anker! })} title="Stelle im Text zeigen">
                {r.text}
              </button>
            ) : (
              <EntwurfFeld
                className="pl-still"
                style={{ fontSize: 13, lineHeight: 1.4, width: 'calc(100% + 6px)', padding: '0 5px', margin: '-1px 0 -1px -6px' }}
                aria-label="Ereignis oder Stelle"
                wert={r.text}
                onSpeichern={(text) => text.trim() && void p.realitaetAendern(id, r.id, { text: text.trim() })}
              />
            ),
            r.stufe,
            (stufe) => void p.realitaetAendern(id, r.id, { stufe }),
            async () => (await rueckfrage(`„${r.text}“ entfernen?`, { knopf: 'Entfernen' })) && void p.realitaetEntfernen(id, r.id),
          ),
        )}
        {stellen.map((r, i) =>
          zeile(
            `stelle-${i}`,
            <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)' }} onClick={() => markiere({ kapitel: id, anker: r.anker })} title="Stelle im Text zeigen">
              »{r.anker.exakt}«
            </button>,
            r.stufe,
            (stufe) => void p.stelleRealitaetSetzen(r.anker, stufe),
            () => void p.stelleRealitaetSetzen(r.anker, null),
          ),
        )}
        <form
          style={{ display: 'flex', gap: 6, flexShrink: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!neu.trim()) return;
            void p.realitaetHinzufuegen(id, neu.trim());
            setNeu('');
          }}
        >
          <input
            className="pl-eingabe"
            style={{ flex: 1, height: 28, fontSize: 12 }}
            aria-label="Neues Ereignis oder neue Stelle"
            placeholder="Ereignis oder Stelle hinzufügen …"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
          />
          <Button type="submit" klein disabled={!neu.trim()}>
            Hinzufügen
          </Button>
        </form>
      </div>
      <span style={{ marginTop: 'auto', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-quiet)', flexShrink: 0 }}>
        Stellen, die du als »bewusst vage« markierst, meldet die Prüfung nie als Widerspruch. »Noch offen« erinnert dich, dass du dich noch entscheiden willst.
      </span>
    </section>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const waehle = useStore((s) => s.waehle);
  if (!daten) return null;
  const reihenfolge = daten.projekt.kapitel;
  const id = gewaehlt && reihenfolge.includes(gewaehlt) ? gewaehlt : reihenfolge[0];
  if (!id)
    return (
      <div style={{ flex: 1, display: 'flex', background: 'var(--canvas)' }}>
        <div className="pw-leer">
          <h2 className="pw-leer__titel">Noch keine Kapitel</h2>
          <div className="pw-leer__text">Lege im Akt-Board oder im Bereich Schreiben ein Kapitel an.</div>
        </div>
      </div>
    );
  const sel = reihenfolge.indexOf(id);
  const z = zusammenfassungFuer(daten, index, id);

  return (
    <div
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        background: 'var(--canvas)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 34, lineHeight: 1 }}>Kapitel-Überblick</h1>
        <div role="group" aria-label="Kapitel wählen" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {reihenfolge.map((k, i) => (
            <button
              key={k}
              type="button"
              className="pl-kapitelwahl"
              aria-pressed={k === id}
              title={daten.plaene[k]?.titel || daten.kapitel[k]?.titel || k}
              onClick={() => waehle({ kapitel: k })}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 16 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Zusammenfassung key={id} id={id} daten={daten} index={index} />
          <div style={{ display: 'flex', gap: 14 }}>
            <section style={{ ...panel, flex: '1 1 0' }}>
              <span style={label('var(--accent-dark)')}>WENDUNG</span>
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>{z.wendung || '–'}</span>
            </section>
            <Antagonisten id={id} daten={daten} text={z.antagonisten} />
          </div>
          <SzenenUebersicht key={`szenen-${id}`} kapitelId={id} />
          <section style={{ ...panel, flex: '1 1 auto', minHeight: 0, gap: 8, overflow: 'hidden' }} aria-label="Bis hierhin passiert">
            <span style={label('var(--ink-quiet)')}>BIS HIERHIN PASSIERT</span>
            <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
              {sel === 0 && <span style={{ fontSize: 14, color: 'var(--ink-quiet)' }}>Das ist der Einstieg.</span>}
              {reihenfolge.slice(0, sel).map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className="pl-zeilenknopf"
                  style={{ gridTemplateColumns: '56px minmax(0, 1fr)', gap: 10, fontSize: 13, lineHeight: 1.45, padding: '4px 0', flexShrink: 0 }}
                  onClick={() => waehle({ kapitel: k })}
                >
                  <span style={{ fontWeight: 600, color: 'var(--ink-quiet)' }}>Kap. {i + 1}</span>
                  <span>{kurzfassung(daten, index, k)}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="pl-scroll" style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto' }}>
          <LoseEnden id={id} daten={daten} index={index} />
          {/* nur die Liste der losen Enden schrumpft; reicht die Höhe nicht, scrollt die Spalte */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <LeserSimulationKarte kapitelId={id} />
            <Realitaetsebene key={id} id={id} daten={daten} />
            <RechercheLeiste ziel={{ typ: 'kapitel', id }} max={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  return <Button onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>Zusammenfassungen aktualisieren</Button>;
}

export function kontext(state: Store): string {
  void state;
  return 'Kapitel-Überblick';
}
