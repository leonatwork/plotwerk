/** Karten des Akt-Boards: Kapitelkarte, Ideenkarte, Kopfkarte eines Akts. */
import { useState, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { Akt, Id, Idee, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { aktiveAbweichungen, type AkteAnsicht } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Chip, StrangPunkt } from '../../ui';
import { EntwurfBereich, EntwurfFeld, strangFarbe, strangGeplant } from './gemeinsam';
import { f, useTexte } from '../../i18n';

const kopfZeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--ink-quiet)' };

/** Figuren und Orte einer Karte: Plan zuerst, im Modus „Plan + Text“ ergänzt um Erkanntes. */
function besetzung(daten: ProjektDaten, index: Index, id: Id, mitText: boolean): string {
  const plan = daten.plaene[id];
  const figuren = [...(plan?.figuren ?? [])];
  const orte = [...(plan?.orte ?? [])];
  if (mitText)
    for (const e of index.erwaehnungen) {
      if (e.kapitel !== id || !(e.quelle === 'exakt' || e.bestaetigt)) continue;
      const liste = e.zielTyp === 'figur' ? figuren : orte;
      if (!liste.includes(e.ziel)) liste.push(e.ziel);
    }
  const fig = figuren.map((x) => daten.figuren[x]?.name).filter(Boolean).join(', ');
  const o = orte.map((x) => daten.orte[x]?.name).filter(Boolean).join(', ');
  return [fig, o].filter(Boolean).join(' · ');
}

export function KapitelKarte({
  id,
  nummer,
  daten,
  index,
  ansicht,
  gewaehlt,
}: {
  id: Id;
  nummer: number;
  daten: ProjektDaten;
  index: Index;
  ansicht: AkteAnsicht;
  gewaehlt: boolean;
}) {
  const plan = daten.plaene[id];
  const kapitel = daten.kapitel[id];
  const t = useTexte();
  if (!plan) return null;
  const mitText = ansicht === 'plantext';
  const status = plan.status;
  const woerter = index.wortzahlen[id];
  const abweichungen = mitText ? aktiveAbweichungen(plan).length : 0;
  const titel = plan.titel || kapitel?.titel || id;

  let kopf = f(t.akte.karte.kap, { nr: nummer });
  if (status === 'geplant') kopf += ` · ${t.akte.karte.geplant}`;
  else if (status === 'entwurf') kopf += ` · ${t.akte.karte.entwurf}`;
  if (mitText && status !== 'geplant' && woerter !== undefined) kopf += ` · ${f(t.akte.karte.woerter, { n: woerter })}`;

  const zeile = mitText && status === 'geplant' && !kapitel?.text.trim() ? '' : besetzung(daten, index, id, mitText);
  const szene = !mitText && plan.szene ? plan.szene : '';

  const stil: CSSProperties = {
    background: status === 'entwurf' ? 'var(--surface-muted)' : 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    cursor: 'grab',
  };
  if (status === 'geplant') {
    stil.border = gewaehlt ? '2px dashed var(--accent)' : '1.5px dashed var(--dotted)';
    stil.padding = gewaehlt ? 9 : 9.5;
  } else if (gewaehlt) {
    stil.border = '2px solid var(--accent)';
    stil.padding = 9;
  }
  if (abweichungen > 0) stil.boxShadow = 'inset 3px 0 0 var(--accent)';

  return (
    <div style={stil}>
      <span style={{ ...kopfZeile, ...(status === 'geplant' ? { color: gewaehlt ? 'var(--accent-dark)' : 'var(--ink-quiet)', fontWeight: 600 } : {}) }}>
        <span>{kopf}</span>
        {plan.straenge.length > 0 && (
          <span style={{ display: 'flex', gap: 3 }}>
            {plan.straenge.map((sid) => {
              const s = daten.straenge.find((x) => x.id === sid);
              return s ? <StrangPunkt key={sid} farbe={strangFarbe(s.farbe)} geplant={strangGeplant(s, daten)} title={s.name} /> : null;
            })}
          </span>
        )}
      </span>
      <strong style={{ fontSize: 14 }}>{titel}</strong>
      {plan.funktion && (
        <span className="pl-etikett" style={{ alignSelf: 'flex-start', background: 'var(--chip)', color: 'var(--ink-soft)' }}>
          {plan.funktion}
        </span>
      )}
      {szene && <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{szene}</span>}
      {zeile ? (
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{zeile}</span>
      ) : (
        status === 'geplant' && mitText && <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{t.akte.karte.nochKeinText}</span>
      )}
      {abweichungen > 0 && (
        <span className="pl-etikett" style={{ alignSelf: 'flex-start', background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
          {f(t.akte.karte.abweichungen, { n: abweichungen })}
        </span>
      )}
    </div>
  );
}

export function IdeeKarte({ idee, gewaehlt, daten }: { idee: Idee; gewaehlt: boolean; daten: ProjektDaten }) {
  const t = useTexte();
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: gewaehlt ? '2px solid var(--strang-warm)' : '1px solid var(--ideen-line)',
        borderRadius: 8,
        padding: gewaehlt ? 9 : 10,
        fontSize: 13,
        lineHeight: 1.4,
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span>{idee.titel || t.akte.karte.neueIdee}</span>
      {idee.straenge.length > 0 && (
        <span style={{ display: 'flex', gap: 3 }}>
          {idee.straenge.map((sid) => {
            const s = daten.straenge.find((x) => x.id === sid);
            return s ? <StrangPunkt key={sid} farbe={strangFarbe(s.farbe)} geplant={strangGeplant(s, daten)} title={s.name} /> : null;
          })}
        </span>
      )}
    </div>
  );
}

/** Antagonisten-Zeile: „Nordhaven setzt die Frist“ (Präsenz der Gruppe im Akt). */
export function antagonistenText(akt: Akt, daten: ProjektDaten): string {
  if (akt.antagonisten.length === 0) return '–';
  return akt.antagonisten
    .map((gid) => {
      const g = daten.gruppen[gid];
      if (!g) return gid;
      const p = g.praesenz[akt.nummer];
      return p ? `${g.name} ${p}` : g.name;
    })
    .join('; ');
}

/** P-02: Kopfkarte eines Akts – Quintessenz, Wendepunkt, aktive Antagonisten; frei bearbeitbar. */
export function AktKopf({ akt, daten, leer }: { akt: Akt; daten: ProjektDaten; leer: boolean }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const aktAendern = useStore((s) => s.planung.aktAendern);
  const aktEntfernen = useStore((s) => s.planung.aktEntfernen);
  const praesenzSetzen = useStore((s) => s.planung.praesenzSetzen);
  const antagonisten = Object.values(daten.gruppen).filter((g) => g.typ === 'antagonist');
  const t = useTexte();
  const tk = t.akte.aktKopf;

  const label = (
    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent-dark)' }}>
      <span>{tk.quintessenzLabel}</span>
      <button type="button" className="pl-kopfkarte__bearbeiten" onClick={() => setBearbeiten((b) => !b)} aria-expanded={bearbeiten}>
        {bearbeiten ? t.gemeinsam.fertig : tk.bearbeiten}
      </button>
    </span>
  );
  const rahmen: CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  };

  if (!bearbeiten)
    return (
      <div className="pl-kopfkarte" style={rahmen} onDoubleClick={() => setBearbeiten(true)} title={tk.doppelklick}>
        {label}
        <span style={{ fontFamily: 'var(--schrift-titel)', fontSize: 18, lineHeight: 1.2, color: akt.quintessenz ? undefined : 'var(--ink-quiet)' }}>
          {akt.quintessenz || tk.keineQuintessenz}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
          <b>{tk.wendepunkt}</b> {akt.wendepunkt || tk.offen}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
          <b>{tk.antagonist}</b> {antagonistenText(akt, daten)}
        </span>
      </div>
    );

  const feldLabel: CSSProperties = { fontSize: 11, color: 'var(--ink-quiet)' };
  return (
    <div style={rahmen}>
      {label}
      <label style={feldLabel} htmlFor={`akt-titel-${akt.nummer}`}>
        {tk.titelDesAkts}
      </label>
      <EntwurfFeld
        id={`akt-titel-${akt.nummer}`}
        className="pl-eingabe"
        style={{ height: 28, fontSize: 12 }}
        wert={akt.titel}
        onSpeichern={(titel) => void aktAendern(akt.nummer, { titel })}
      />
      <label style={feldLabel} htmlFor={`akt-q-${akt.nummer}`}>
        {tk.quintessenz}
      </label>
      <EntwurfBereich
        id={`akt-q-${akt.nummer}`}
        className="pl-bereich"
        autoHoehe
        autoFocus
        rows={2}
        style={{ fontFamily: 'var(--schrift-titel)', fontSize: 18, lineHeight: 1.2, padding: '4px 6px' }}
        wert={akt.quintessenz}
        placeholder={tk.quintessenzPlatzhalter}
        onSpeichern={(quintessenz) => void aktAendern(akt.nummer, { quintessenz })}
      />
      <label style={feldLabel} htmlFor={`akt-w-${akt.nummer}`}>
        {tk.wendepunktLabel}
      </label>
      <EntwurfBereich
        id={`akt-w-${akt.nummer}`}
        className="pl-bereich"
        autoHoehe
        rows={1}
        style={{ fontSize: 12, padding: '4px 6px' }}
        wert={akt.wendepunkt}
        onSpeichern={(wendepunkt) => void aktAendern(akt.nummer, { wendepunkt })}
      />
      <span style={feldLabel}>{tk.aktiveAntagonisten}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {antagonisten.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-quiet)' }}>{tk.keineAntagonisten}</span>}
        {antagonisten.map((g) => {
          const aktiv = akt.antagonisten.includes(g.id);
          const strang = daten.straenge.find((s) => s.id === g.strang);
          return (
            <Chip
              key={g.id}
              variante="knopf"
              aktiv={aktiv}
              punkt={strang ? strangFarbe(strang.farbe) : undefined}
              onClick={() =>
                void aktAendern(akt.nummer, {
                  antagonisten: aktiv ? akt.antagonisten.filter((x) => x !== g.id) : [...akt.antagonisten, g.id],
                })
              }
            >
              {g.name}
              {g.status === 'geplant' && <span style={{ fontSize: 10, color: 'var(--ink-quiet)', fontWeight: 400 }}>{tk.geplant}</span>}
            </Chip>
          );
        })}
      </div>
      {akt.antagonisten.map((gid) => {
        const g = daten.gruppen[gid];
        if (!g) return null;
        return (
          <div key={gid} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={feldLabel} htmlFor={`akt-p-${akt.nummer}-${gid}`}>
              {f(tk.inDiesemAkt, { name: g.name })}
            </label>
            <EntwurfFeld
              id={`akt-p-${akt.nummer}-${gid}`}
              className="pl-eingabe"
              style={{ height: 28, fontSize: 12 }}
              placeholder={tk.praesenzPlatzhalter}
              wert={g.praesenz[akt.nummer] ?? ''}
              onSpeichern={(text) => void praesenzSetzen(gid, akt.nummer, text)}
            />
          </div>
        );
      })}
      {leer && (
        <button
          type="button"
          className="pl-link"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={async () => {
            if (await rueckfrage(f(tk.entfernenFrage, { titel: akt.titel }), { knopf: t.gemeinsam.entfernen })) void aktEntfernen(akt.nummer);
          }}
        >
          {tk.leerenEntfernen}
        </button>
      )}
    </div>
  );
}
