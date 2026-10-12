/** O-01/O-02: Ortskarte im Stil der Figurenkarte. */
import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { Erwaehnung, Id, Ort, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { indexBereit } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Button, IconOrte } from '../../ui';
import { Abschnitt, alleTexte, AngehefteteNotizen, ausschnitt, EntwurfBereich, EntwurfFeld, erwaehnungenVon, IconSchloss, LinkKnopf, stelleAnker } from '../akte/gemeinsam';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { kapitelDesOrts, nachfahren, ortVarianten, variantenAusHinweis, zielFuerVarianten } from './logik';
import { f, useTexte, vergleich } from '../../i18n';

const leise: CSSProperties = { color: 'var(--ink-quiet)' };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '8px 12px', alignItems: 'center', fontSize: 13 };

export function OrtSymbol({ groesse = 28 }: { groesse?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: `0 0 ${groesse}px`,
        width: groesse,
        height: groesse,
        borderRadius: '50%',
        background: 'var(--chip)',
        color: 'var(--ink-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconOrte size={Math.round(groesse * 0.5)} />
    </span>
  );
}

function AusDemText({ o, daten, index }: { o: Ort; daten: ProjektDaten; index: Index }) {
  const markiere = useStore((s) => s.markiere);
  const liste = erwaehnungenVon(index, 'ort', o.id);
  const nachKapitel = new Map<Id, Erwaehnung[]>();
  for (const e of liste) nachKapitel.set(e.kapitel, [...(nachKapitel.get(e.kapitel) ?? []), e]);
  const kapitel = daten.projekt.kapitel.filter((k) => nachKapitel.has(k));
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const genannt = [...new Set(liste.map((e) => e.treffer))];
  const zeigen = (e: Erwaehnung) => markiere({ kapitel: e.kapitel, anker: stelleAnker(daten, e.kapitel, e.start, e.ende, e.treffer) });
  const t = useTexte();
  const tk = t.orte.karte;
  return (
    <Abschnitt titel={tk.ausDemText} rechts={<span style={{ fontSize: 11, ...leise }}>{tk.nurLesen}</span>} hintergrund="var(--inspector)" label={tk.ausDemText}>
      {!indexBereit(index) ? (
        <span style={{ fontSize: 13, ...leise }}>{tk.wirdAusgewertet}</span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 54px', gap: '8px 12px', fontSize: 13, alignItems: 'baseline' }}>
          {kapitel.length === 0 && (
            <>
              <span style={leise}>{tk.imText}</span>
              <span style={{ color: 'var(--accent-dark)' }}>{tk.nochNichtImText}</span>
              <span />
            </>
          )}
          {genannt.length > 0 && (
            <>
              <span style={leise}>{tk.genanntAls}</span>
              <span>{genannt.map((g) => f(tk.zitat, { text: g })).join(', ')}</span>
              <span />
            </>
          )}
          {kapitel.map((k, i) => {
            const l = nachKapitel.get(k)!.sort((a, b) => a.start - b.start);
            const e = l[0]!;
            const [davor, treffer, danach] = ausschnitt(daten, k, e.start, e.ende, e.treffer);
            return (
              <div key={k} style={{ display: 'contents' }}>
                <span style={leise}>{i === 0 ? tk.erstesVorkommen : daten.plaene[k]?.titel || tk.imTextKlein}</span>
                <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }} onClick={() => zeigen(e)} title={tk.stelleZeigen}>
                  »{davor}
                  <b>{treffer}</b>
                  {danach}«{l.length > 1 && <span style={leise}> · {l.length}×</span>}
                </button>
                <LinkKnopf onClick={() => zeigen(e)}>{f(t.gemeinsam.kapitelKurz, { nr: nr(k) })}</LinkKnopf>
              </div>
            );
          })}
        </div>
      )}
    </Abschnitt>
  );
}

function Planung({ o, daten }: { o: Ort; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const uid = useId();
  const ausgeschlossen = nachfahren(daten.orte, o.id);
  const tk = useTexte().orte.karte;
  const moegliche = Object.values(daten.orte)
    .filter((x) => !ausgeschlossen.has(x.id))
    .sort((a, b) => vergleich(a.name, b.name));
  return (
    <Abschnitt titel={tk.planung} rechts={<span style={{ fontSize: 11, ...leise }}>{tk.freiBearbeitbar}</span>} label={tk.planung}>
      <div style={grid2}>
        <label htmlFor={`${uid}-aliase`} style={leise} title={tk.auchGenanntTitel}>
          {tk.auchGenannt}
        </label>
        <EntwurfFeld
          key={`${o.id}-aliase`}
          id={`${uid}-aliase`}
          className="pl-eingabe"
          style={{ width: '100%' }}
          placeholder={tk.aliasePlatzhalter}
          wert={o.aliase.join(', ')}
          onSpeichern={(text) => void p.ortAendern(o.id, { aliase: [...new Set(text.split(',').map((x) => x.trim()).filter(Boolean))] })}
        />
        <label htmlFor={`${uid}-in`} style={leise}>
          {tk.liegtIn}
        </label>
        <select id={`${uid}-in`} className="pl-select" value={o.in ?? ''} onChange={(e) => void p.ortAendern(o.id, { in: e.target.value || undefined })}>
          <option value="">{tk.eigenstaendig}</option>
          {moegliche.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <label htmlFor={`${uid}-beschreibung`} style={{ ...leise, alignSelf: 'start', paddingTop: 8 }}>
          {tk.beschreibung}
        </label>
        <EntwurfBereich
          key={`${o.id}-beschreibung`}
          id={`${uid}-beschreibung`}
          className="pl-bereich"
          autoHoehe
          rows={3}
          placeholder={tk.beschreibungPlatzhalter}
          verweise={{ typ: 'ort', id: o.id }}
          wert={o.beschreibung}
          onSpeichern={(beschreibung) => void p.ortAendern(o.id, { beschreibung })}
        />
      </div>
    </Abschnitt>
  );
}

function KapitelStreifen({ o, daten, index }: { o: Ort; daten: ProjektDaten; index: Index }) {
  const markiere = useStore((s) => s.markiere);
  const imText = new Map<Id, Erwaehnung>();
  for (const e of erwaehnungenVon(index, 'ort', o.id)) if (!imText.has(e.kapitel)) imText.set(e.kapitel, e);
  const t = useTexte();
  const tk = t.orte.karte;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label={tk.kapitel}>
      <strong style={{ fontSize: 14 }}>{tk.kapitel}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, daten.projekt.kapitel.length)}, minmax(0, 1fr))`, gap: 4 }}>
        {daten.projekt.kapitel.map((k, i) => {
          const e = imText.get(k);
          const geplant = !e && daten.plaene[k]?.orte.includes(o.id);
          const ohneText = !daten.kapitel[k]?.text.trim();
          const stil: CSSProperties = {
            height: 34,
            borderRadius: 4,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-muted)',
            color: 'var(--ink-quiet)',
          };
          if (e) Object.assign(stil, { background: 'var(--ink)', color: 'var(--on-ink)', fontWeight: 600 });
          else if (geplant) Object.assign(stil, { background: 'transparent', border: '1.5px dashed var(--dotted)', color: 'var(--ink)', fontWeight: 600 });
          else if (ohneText) stil.background = 'repeating-linear-gradient(135deg, var(--schraffur) 0 4px, var(--surface) 4px 8px)';
          const titel = f(tk.zelle, {
            kap: f(t.gemeinsam.kapitelKurz, { nr: i + 1 }),
            titel: daten.plaene[k]?.titel ?? '',
            stand: e ? tk.imTextKlein : geplant ? tk.lautPlan : ohneText ? tk.nochKeinText : '–',
          });
          return e ? (
            <button
              key={k}
              type="button"
              className="pl-zelle"
              style={stil}
              title={titel}
              aria-label={titel}
              onClick={() => markiere({ kapitel: k, anker: stelleAnker(daten, k, e.start, e.ende, e.treffer) })}
            >
              {i + 1}
            </button>
          ) : (
            <span key={k} className="pl-zelle" style={stil} title={titel}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <span style={{ fontSize: 12, ...leise }}>{tk.streifenLegende}</span>
    </section>
  );
}

function Schreibweisen({ o, daten, index }: { o: Ort; daten: ProjektDaten; index: Index }) {
  const festlegen = useStore((s) => s.planung.schreibweiseFestlegen);
  const aufheben = useStore((s) => s.planung.schreibweiseAufheben);
  const markiere = useStore((s) => s.markiere);
  const oeffne = useStore((s) => s.oeffne);
  const texte = useMemo(() => alleTexte(daten), [daten]);
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const gefunden = ortVarianten(o, texte);
  const hinweise = index.hinweise.filter(
    (h) => h.typ === 'schreibweise' && h.status === 'neu' && zielFuerVarianten(daten, variantenAusHinweis(h))?.id === o.id,
  );
  const entscheidung = daten.entscheidungen.schreibweisen.find(
    (s) => (s.ziel?.typ === 'ort' && s.ziel.id === o.id) || (!s.ziel && [s.gueltig, ...s.varianten].includes(o.name)),
  );
  const optionen = [...new Set([...gefunden.map((v) => v.text), ...hinweise.flatMap(variantenAusHinweis)])];
  const standard = optionen.includes(o.name) ? o.name : (gefunden[0]?.text ?? optionen[0] ?? '');
  const [wahl, setWahl] = useState<string>(standard);
  const gewaehlt = optionen.includes(wahl) ? wahl : standard;
  const uid = useId();
  const t = useTexte();
  const ts = t.orte.schreibweisen;
  const zitat = (text: string) => f(t.orte.karte.zitat, { text });

  const stelle = (text: string) => {
    const v = gefunden.find((x) => x.text === text);
    if (!v) return null;
    return (
      <span style={{ fontSize: 12, ...leise }}>
        {f(ts.anzahl, { n: v.anzahl })} ·{' '}
        {v.kapitel.map((k, i) => (
          <span key={k}>
            {i > 0 && ', '}
            <LinkKnopf
              onClick={() => {
                const kt = texte.find((x) => x.kapitel === k)?.text ?? '';
                const pos = k === v.erste.kapitel ? v.erste.start : kt.indexOf(text);
                markiere({ kapitel: k, anker: stelleAnker(daten, k, pos, pos + text.length, text) });
              }}
            >
              {f(t.gemeinsam.kapitelKurz, { nr: nr(k) })}
            </LinkKnopf>
          </span>
        ))}
      </span>
    );
  };

  let inhalt;
  if (entscheidung) {
    const abweichend = gefunden.filter((v) => v.text !== entscheidung.gueltig);
    const zusammen = entscheidung.varianten.filter((v) => v !== entscheidung.gueltig);
    inhalt = (
      <>
        <span style={{ fontSize: 13 }}>
          {ts.gueltig} <b>{zitat(entscheidung.gueltig)}</b>
          {zusammen.length > 0 && <span style={leise}>{f(ts.zusammengefuehrt, { liste: zusammen.map(zitat).join(', ') })}</span>}
        </span>
        {abweichend.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 6, background: 'var(--ruhend)' }}>
            <span style={{ fontSize: 12, color: 'var(--warm-dark)' }}>{ts.nochAnders}</span>
            {abweichend.map((v) => (
              <span key={v.text} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                {zitat(v.text)} {stelle(v.text)}
              </span>
            ))}
          </div>
        )}
        <LinkKnopf style={{ alignSelf: 'flex-start', color: 'var(--ink-quiet)' }} onClick={() => void aufheben(entscheidung.gueltig)}>
          {ts.aufheben}
        </LinkKnopf>
      </>
    );
  } else if (optionen.length >= 2) {
    inhalt = (
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          void festlegen(optionen.filter((v) => v !== gewaehlt), gewaehlt, { typ: 'ort', id: o.id });
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--warm-dark)' }}>{f(ts.frage, { n: optionen.length })}</span>
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <legend className="pw-sr">{ts.gueltigeSchreibweise}</legend>
          {optionen.map((v) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, fontSize: 13 }}>
              <input type="radio" name={`${uid}-sw`} checked={gewaehlt === v} onChange={() => setWahl(v)} style={{ margin: 0, accentColor: 'var(--ink)' }} />
              <span>{zitat(v)}</span>
              {stelle(v)}
            </label>
          ))}
        </fieldset>
        <Button type="submit" klein variante="primaer" style={{ alignSelf: 'flex-start' }}>
          {ts.festlegen}
        </Button>
        <span style={{ fontSize: 11, ...leise }}>{ts.aliasHinweis}</span>
      </form>
    );
  } else {
    inhalt = <span style={{ fontSize: 13, ...leise }}>{gefunden.length ? ts.einheitlich : ts.kommtNichtVor}</span>;
  }

  return (
    <Abschnitt
      titel={ts.titel}
      rechts={
        hinweise.length > 0 ? (
          <LinkKnopf fett onClick={() => oeffne('hinweise', { hinweis: hinweise[0]!.schluessel })}>
            {ts.inHinweisen}
          </LinkKnopf>
        ) : undefined
      }
      label={ts.titel}
    >
      {inhalt}
    </Abschnitt>
  );
}

function Unterorte({ o, daten, index }: { o: Ort; daten: ProjektDaten; index: Index }) {
  const anlegen = useStore((s) => s.planung.ortAnlegen);
  const waehle = useStore((s) => s.waehle);
  const [neu, setNeu] = useState<string | null>(null);
  const t = useTexte();
  const tu = t.orte.unterorte;
  const kinder = Object.values(daten.orte)
    .filter((x) => x.in === o.id)
    .sort((a, b) => vergleich(a.name, b.name));
  return (
    <Abschnitt titel={tu.titel} label={tu.titel}>
      {kinder.length === 0 && neu === null && <span style={{ fontSize: 13, ...leise }}>{tu.keine}</span>}
      {kinder.map((k) => (
        <span key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <OrtSymbol groesse={26} />
          <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, flex: 1 }} onClick={() => waehle({ ort: k.id })}>
            {k.name}
          </button>
          <span style={{ fontSize: 11, ...leise }}>{f(t.orte.liste.kapKurz, { n: kapitelDesOrts(k.id, daten, index).length })}</span>
        </span>
      ))}
      {neu === null ? (
        <button type="button" className="pl-link" style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', fontWeight: 600 }} onClick={() => setNeu('')}>
          {tu.plus}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (neu.trim()) void anlegen(neu.trim(), o.id);
            setNeu(null);
          }}
        >
          <input
            autoFocus
            className="pl-eingabe"
            style={{ width: '100%' }}
            placeholder={t.orte.liste.namePlatzhalter}
            aria-label={tu.label}
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            onBlur={() => !neu.trim() && setNeu(null)}
            onKeyDown={(e) => e.key === 'Escape' && setNeu(null)}
          />
        </form>
      )}
    </Abschnitt>
  );
}

export function OrtKarte({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const p = useStore((s) => s.planung);
  const markiere = useStore((s) => s.markiere);
  const waehle = useStore((s) => s.waehle);
  const entfernen = useStore((s) => s.entferneOrt);
  const uid = useId();
  const t = useTexte();
  const tk = t.orte.karte;
  const o = daten.orte[id];
  if (!o) return null;
  const kapitel = kapitelDesOrts(o.id, daten, index);
  const erste = erwaehnungenVon(index, 'ort', o.id)[0];
  const eltern = o.in ? daten.orte[o.in] : undefined;

  return (
    <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <OrtSymbol groesse={64} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, display: 'flex' }}>
            <EntwurfFeld
              key={`${o.id}-name`}
              className="pl-still"
              aria-label={tk.name}
              style={{ fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 40, lineHeight: 1, width: '100%', padding: '0 6px' }}
              wert={o.name}
              onSpeichern={(name) => name.trim() && void p.ortAendern(o.id, { name: name.trim() })}
            />
          </h1>
          <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, ...leise }}>
            {eltern && (
              <span>
                {tk.in}{' '}
                <LinkKnopf style={{ fontSize: 13 }} onClick={() => waehle({ ort: eltern.id })}>
                  {eltern.name}
                </LinkKnopf>{' '}
                ·
              </span>
            )}
            <span>
              {f(tk.anzahlKapitel, { n: kapitel.length })}
              {!indexBereit(index) && tk.lautPlanZusatz}
            </span>
          </span>
        </div>
        <Button
          disabled={!erste}
          title={erste ? undefined : tk.kommtNichtVor}
          onClick={() => erste && markiere({ kapitel: erste.kapitel, anker: stelleAnker(daten, erste.kapitel, erste.start, erste.ende, erste.treffer) })}
        >
          {tk.imTextZeigen}
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 500px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AusDemText o={o} daten={daten} index={index} />
          <Planung o={o} daten={daten} />
          <KapitelStreifen o={o} daten={daten} index={index} />
        </div>
        <div style={{ flex: '0 1 330px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Schreibweisen key={o.id} o={o} daten={daten} index={index} />
          <Unterorte o={o} daten={daten} index={index} />
          <Abschnitt
            titel={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconSchloss />
                {tk.notizen}
              </span>
            }
            label={tk.notizen}
          >
            <span style={{ fontSize: 11, marginTop: -6, ...leise }}>{tk.nurFuerDich}</span>
            <AngehefteteNotizen ziele={[{ typ: 'ort', id: o.id }]} daten={daten} />
            <EntwurfBereich
              key={`${o.id}-notizen`}
              id={`${uid}-notizen`}
              aria-label={tk.notizen}
              className="pl-bereich"
              autoHoehe
              rows={3}
              placeholder={tk.notizenPlatzhalter}
              verweise={{ typ: 'ort', id: o.id }}
              wert={o.notizen}
              onSpeichern={(notizen) => void p.ortAendern(o.id, { notizen })}
            />
          </Abschnitt>
          <RechercheLeiste ziel={{ typ: 'ort', id: o.id }} />
          <button
            type="button"
            className="pl-link"
            style={{ alignSelf: 'flex-start', color: 'var(--ink-quiet)' }}
            onClick={async () => (await rueckfrage(f(tk.loeschenFrage, { name: o.name }), { knopf: t.gemeinsam.loeschen })) && void entfernen(o.id)}
          >
            {tk.loeschen}
          </button>
        </div>
      </div>
    </div>
  );
}
