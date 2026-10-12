/** Bereich „Kapitel-Überblick“ (K-01–K-04, A-03) nach docs/design/screens/Kapitel.dc.html. Besitzer: Planung. */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Index } from '@core/index/index';
import type { Id, ProjektDaten, Realitaet } from '@core/model/types';
import { f, locale, texte, useTexte } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { faedenBisKapitel, kurzfassung, zusammenfassungFuer, type FadenBisHier } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Button, RealitaetsUmschalter, StrangPunkt } from '../../ui';
import { EntwurfFeld, LinkKnopf, strangFarbe, strangGeplant, strangKurzname } from '../akte/gemeinsam';
import { verweiseAlsText } from '../schreiben/verweise';
import { SzenenUebersicht } from '../faeden/Szenen';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { LeserSimulationKarte } from './LeserSimulationKarte';
import { NurMit } from '../../app/NurMit';

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
  const t = useTexte();
  const tz = t.kapitel.zusammenfassung;
  const plan = daten.plaene[id];
  const kapitel = daten.kapitel[id];
  const z = zusammenfassungFuer(daten, index, id);
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const hatText = !!kapitel?.text.trim();
  const woerter = index.wortzahlen[id];
  const akt = plan?.akt != null ? daten.akte.find((a) => a.nummer === plan.akt) : undefined;
  const kopf = [
    f(tz.kopfKapitel, { nr }),
    !hatText ? tz.ohneText : woerter !== undefined ? f(tz.woerter, { n: woerter }) : null,
    akt ? (akt.titel || f(tz.akt, { nr: akt.nummer })).toLocaleUpperCase(locale()) : tz.ohneAkt,
  ]
    .filter(Boolean)
    .join(' · ');

  const starten = () => {
    setEntwurf({ text: z.text, kurz: z.kurz, wendung: z.wendung });
    setBearbeiten(true);
  };

  return (
    <section style={{ ...panel, padding: '18px 20px', gap: 10 }} aria-label={tz.label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--ink-quiet)' }}>{kopf}</span>
        <span style={{ display: 'flex', gap: 14 }}>
          {hatText && !bearbeiten && (
            <LinkKnopf fett onClick={starten}>
              {t.gemeinsam.bearbeiten}
            </LinkKnopf>
          )}
          <LinkKnopf fett onClick={() => oeffne('schreiben', { kapitel: id })}>
            {tz.imEditorOeffnen}
          </LinkKnopf>
        </span>
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 32, lineHeight: 1 }}>{plan?.titel || kapitel?.titel || id}</h2>
      {(z.quelle === 'bearbeitet' || z.analyseVeraltet) && !bearbeiten && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {z.quelle === 'bearbeitet' && <Etikett art="neutral">{tz.vonDirBearbeitet}</Etikett>}
          {z.veraltet && <Etikett art="warn">{tz.veraltetBearbeitung}</Etikett>}
          {z.quelle !== 'bearbeitet' && z.analyseVeraltet && <Etikett art="warn">{tz.veraltetPruefung}</Etikett>}
          {z.veraltet && <LinkKnopf onClick={() => void bestaetigen(id)}>{tz.passtNoch}</LinkKnopf>}
          {z.quelle === 'bearbeitet' && z.hatAnalyse && (
            <LinkKnopf onClick={async () => (await rueckfrage(tz.verwerfenFrage, { knopf: tz.verwerfen })) && void zuruecksetzen(id)}>
              {tz.kiFassung}
            </LinkKnopf>
          )}
          {z.analyseVeraltet && z.quelle !== 'bearbeitet' && (
            <NurMit funktion="kiPruefung">
              <LinkKnopf onClick={() => oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel: id })}>{tz.neuPruefen}</LinkKnopf>
            </NurMit>
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
            aria-label={tz.label}
            autoFocus
            rows={4}
            value={entwurf.text}
            onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })}
            style={{ fontSize: 15, lineHeight: 1.6 }}
          />
          <label style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>
            {tz.kurzfassung}
            <input className="pl-eingabe" style={{ width: '100%', marginTop: 4 }} value={entwurf.kurz} onChange={(e) => setEntwurf({ ...entwurf, kurz: e.target.value })} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>
            {tz.wendung}
            <input className="pl-eingabe" style={{ width: '100%', marginTop: 4 }} value={entwurf.wendung} onChange={(e) => setEntwurf({ ...entwurf, wendung: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="submit" variante="primaer" disabled={!entwurf.text.trim()}>
              {t.gemeinsam.speichern}
            </Button>
            <Button onClick={() => setBearbeiten(false)}>{t.gemeinsam.abbrechen}</Button>
            <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{tz.nieUeberschrieben}</span>
          </div>
        </form>
      ) : z.quelle === 'keine' ? (
        hatText ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-quiet)' }}>{tz.nochNichtGeprueft}</p>
            <NurMit funktion="kiPruefung">
              <Button onClick={() => oeffneDialog('ki-pruefen', { umfang: 'kapitel', kapitel: id })}>{tz.kapitelPruefen}</Button>
            </NurMit>
            <LinkKnopf onClick={starten}>{tz.selbstZusammenfassen}</LinkKnopf>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-quiet)' }}>
            {tz.nochKeinText}
            {plan?.notiz.trim() ? f(tz.geplant, { notiz: verweiseAlsText(plan.notiz.trim()) }) : ''}
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
  const tk = useTexte().kapitel;
  return (
    <section style={{ ...panel, flex: '1 1 0' }}>
      <span style={label('var(--strang-organisation)')}>{tk.antagonisten}</span>
      <span style={{ fontSize: 14, lineHeight: 1.5 }}>{text || '–'}</span>
      {(straenge.length > 0 || praesenz.length > 0) && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
          {straenge.map((s) => (
            <span key={s!.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <StrangPunkt farbe={strangFarbe(s!.farbe)} geplant={strangGeplant(s!, daten)} />
              {strangKurzname(s!)}
            </span>
          ))}
          {praesenz.length > 0 && <span>{f(tk.imAkt, { liste: praesenz.join('; ') })}</span>}
        </span>
      )}
    </section>
  );
}

function fadenText(faden: FadenBisHier): string {
  const tl = texte().kapitel.loseEnden;
  const eroeffnet = faden.eroeffnetPos + 1;
  const zuletzt = faden.zuletztPos + 1;
  if (faden.ruhendSeit === 0)
    return faden.eroeffnetPos === faden.zuletztPos ? tl.hierEroeffnet : f(tl.eroeffnetAufgegriffen, { eroeffnet });
  const seit = f(tl.ruhend, { n: faden.ruhendSeit });
  return eroeffnet === zuletzt ? f(tl.eroeffnetSeit, { eroeffnet, seit }) : f(tl.eroeffnetZuletzt, { eroeffnet, zuletzt, seit });
}

function LoseEnden({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const setzen = useStore((s) => s.planung.fadenStatusSetzen);
  const tl = useTexte().kapitel.loseEnden;
  const liste = faedenBisKapitel(index.faeden, daten.projekt.kapitel, id, daten.entscheidungen);
  const sortiert = [...liste.filter((f) => f.status !== 'erledigt'), ...liste.filter((f) => f.status === 'erledigt')];
  const offen = liste.filter((x) => x.status === 'offen').length;
  return (
    <section style={{ ...panel, gap: 8, flex: '0 1 auto', minHeight: 150 }} aria-label={tl.label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={label('var(--warm-dark)')}>{tl.titel}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{f(tl.offen, { n: offen })}</span>
      </div>
      {liste.length === 0 && (
        <span style={{ fontSize: 13, color: 'var(--ink-quiet)', lineHeight: 1.45 }}>
          {index.faeden.length === 0 ? tl.keineBekannt : tl.keinFaden}
        </span>
      )}
      <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortiert.map((fb) => (
          <div
            key={fb.faden.id}
            className="pl-zeile"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              position: 'relative',
              padding: '7px 10px',
              borderRadius: 6,
              background: fb.ruhend ? 'var(--ruhend)' : 'var(--inspector)',
              opacity: fb.status === 'erledigt' ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textDecoration: fb.status === 'erledigt' ? 'line-through' : undefined }}>{fb.faden.name}</span>
              {fb.status !== 'offen' ? (
                <button type="button" className="pl-kleinknopf" onClick={() => void setzen(fb.faden.id, 'offen')} title={tl.wiederOffen}>
                  {fb.status === 'erledigt' ? tl.erledigt : tl.bewusstOffen} ×
                </button>
              ) : (
                <span className="pl-hover-zeigen" style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 4, paddingLeft: 6, background: 'inherit' }}>
                  <button type="button" className="pl-kleinknopf" onClick={() => void setzen(fb.faden.id, 'erledigt')}>
                    {tl.erledigt}
                  </button>
                  <button type="button" className="pl-kleinknopf" onClick={() => void setzen(fb.faden.id, 'bewusst_offen')}>
                    {tl.bewusstOffen}
                  </button>
                </span>
              )}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fadenText(fb)}</span>
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
  const t = useTexte();
  const tr = t.kapitel.realitaet;
  const plan = daten.plaene[id];
  const stellen = daten.entscheidungen.realitaet.filter((r) => r.anker.kapitel === id);
  const eintraege = plan?.realitaet ?? [];
  const leer = eintraege.length === 0 && stellen.length === 0;

  const zeile = (key: string, text: ReactNode, stufe: Realitaet, setze: (s: Realitaet) => void, entferne: () => void) => (
    <div key={key} className="pl-zeile" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line-faint)', flexShrink: 0 }}>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{text}</span>
        <button type="button" className="pl-zeile-weg" style={{ margin: '-2px 0' }} aria-label={tr.eintragEntfernen} onClick={entferne}>
          ×
        </button>
      </span>
      <RealitaetsUmschalter wert={stufe} onChange={setze} />
    </div>
  );

  return (
    <section style={{ ...panel, gap: 10, flex: '1 1 auto', minHeight: 0 }} aria-label={tr.label}>
      <span style={label('var(--vage-dark)')}>{tr.titel}</span>
      <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {leer && <span style={{ fontSize: 13, color: 'var(--ink-quiet)' }}>{tr.nichtsMarkiert}</span>}
        {eintraege.map((r) =>
          zeile(
            r.id,
            r.anker ? (
              <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)' }} onClick={() => markiere({ kapitel: id, anker: r.anker! })} title={tr.stelleZeigen}>
                {r.text}
              </button>
            ) : (
              <EntwurfFeld
                className="pl-still"
                style={{ fontSize: 13, lineHeight: 1.4, width: 'calc(100% + 6px)', padding: '0 5px', margin: '-1px 0 -1px -6px' }}
                aria-label={tr.ereignisOderStelle}
                wert={r.text}
                onSpeichern={(text) => text.trim() && void p.realitaetAendern(id, r.id, { text: text.trim() })}
              />
            ),
            r.stufe,
            (stufe) => void p.realitaetAendern(id, r.id, { stufe }),
            async () => (await rueckfrage(f(tr.entfernenFrage, { text: r.text }), { knopf: t.gemeinsam.entfernen })) && void p.realitaetEntfernen(id, r.id),
          ),
        )}
        {stellen.map((r, i) =>
          zeile(
            `stelle-${i}`,
            <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)' }} onClick={() => markiere({ kapitel: id, anker: r.anker })} title={tr.stelleZeigen}>
              {f(tr.stelle, { text: r.anker.exakt })}
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
            aria-label={tr.neuLabel}
            placeholder={tr.neuPlatzhalter}
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
          />
          <Button type="submit" klein disabled={!neu.trim()}>
            {t.gemeinsam.hinzufuegen}
          </Button>
        </form>
      </div>
      <span style={{ marginTop: 'auto', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-quiet)', flexShrink: 0 }}>{tr.erklaerung}</span>
    </section>
  );
}

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const waehle = useStore((s) => s.waehle);
  const t = useTexte();
  const tk = t.kapitel;
  if (!daten) return null;
  const reihenfolge = daten.projekt.kapitel;
  const id = gewaehlt && reihenfolge.includes(gewaehlt) ? gewaehlt : reihenfolge[0];
  if (!id)
    return (
      <div style={{ flex: 1, display: 'flex', background: 'var(--canvas)' }}>
        <div className="pw-leer">
          <h2 className="pw-leer__titel">{tk.keineKapitel}</h2>
          <div className="pw-leer__text">{tk.keineKapitelText}</div>
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
        <h1 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 34, lineHeight: 1 }}>{tk.titel}</h1>
        <div role="group" aria-label={tk.kapitelWaehlen} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
              <span style={label('var(--accent-dark)')}>{tk.wendung}</span>
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>{z.wendung || '–'}</span>
            </section>
            <Antagonisten id={id} daten={daten} text={z.antagonisten} />
          </div>
          <NurMit funktion="faeden">
            <SzenenUebersicht key={`szenen-${id}`} kapitelId={id} />
          </NurMit>
          <section style={{ ...panel, flex: '1 1 auto', minHeight: 0, gap: 8, overflow: 'hidden' }} aria-label={tk.bisHierhinLabel}>
            <span style={label('var(--ink-quiet)')}>{tk.bisHierhin}</span>
            <div className="pl-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
              {sel === 0 && <span style={{ fontSize: 14, color: 'var(--ink-quiet)' }}>{tk.einstieg}</span>}
              {reihenfolge.slice(0, sel).map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className="pl-zeilenknopf"
                  style={{ gridTemplateColumns: '56px minmax(0, 1fr)', gap: 10, fontSize: 13, lineHeight: 1.45, padding: '4px 0', flexShrink: 0 }}
                  onClick={() => waehle({ kapitel: k })}
                >
                  <span style={{ fontWeight: 600, color: 'var(--ink-quiet)' }}>{f(t.gemeinsam.kapitelKurz, { nr: i + 1 })}</span>
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
            <NurMit funktion="kiLeser">
              <LeserSimulationKarte kapitelId={id} />
            </NurMit>
            <Realitaetsebene key={id} id={id} daten={daten} />
            <NurMit funktion="recherche">
              <RechercheLeiste ziel={{ typ: 'kapitel', id }} max={3} />
            </NurMit>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Titelaktionen() {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const t = useTexte();
  return (
    <NurMit funktion="kiPruefung">
      <Button onClick={() => oeffneDialog('ki-pruefen', { umfang: 'buch' })}>{t.kapitel.zusammenfassungenAktualisieren}</Button>
    </NurMit>
  );
}

export function kontext(state: Store): string {
  void state;
  return texte().kapitel.titel;
}
