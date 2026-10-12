/** O-03 Weg einer Figur („Pauls Weg“) und die Schreibweisen-Übersicht (O-02). */
import { useId, useState, type CSSProperties } from 'react';
import { ortsfolge, type Index } from '@core/index/index';
import type { Figur, Hinweis, Id, ProjektDaten } from '@core/model/types';
import { hauptfigur } from '@core/zeit/zustand';
import { useStore } from '../../state/store';
import { Button, Chip } from '../../ui';
import { LinkKnopf, zitatAnker } from '../akte/gemeinsam';
import { variantenAusHinweis, zielFuerVarianten } from './logik';

const leise: CSSProperties = { color: 'var(--ink-quiet)' };
const seite: CSSProperties = { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 20 };
const h1: CSSProperties = { margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 40, lineHeight: 1 };

export function genitiv(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}’` : `${name}s`;
}

/** Figur für den Weg: die gewählte, sonst die Hauptfigur, sonst die erste nach Name. */
export function wegFigurVon(daten: ProjektDaten, wegFigur: Id): Figur | undefined {
  const figuren = Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return daten.figuren[wegFigur] ?? daten.figuren[hauptfigur(daten) ?? ''] ?? figuren[0];
}

export function WegAnsicht({ daten, index }: { daten: ProjektDaten; index: Index }) {
  const wegFigur = useStore((s) => s.planung.wegFigur);
  const setze = useStore((s) => s.planung.setzeWegFigur);
  const oeffne = useStore((s) => s.oeffne);
  const waehle = useStore((s) => s.waehle);
  const uid = useId();
  const figuren = Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const figur = wegFigurVon(daten, wegFigur);
  if (!figur) return <div style={seite}>Noch keine Figuren angelegt.</div>;

  const folge = new Map(ortsfolge(index, daten, figur.id).map((x) => [x.kapitel, x.orte]));
  const zeilen = daten.projekt.kapitel.map((k, i) => {
    const imText = folge.get(k) ?? [];
    const plan = daten.plaene[k];
    const laut = imText.length === 0 && plan?.figuren.includes(figur.id) ? plan.orte : [];
    return { k, nr: i + 1, imText, laut, dabei: folge.has(k) || !!plan?.figuren.includes(figur.id), ohneText: !daten.kapitel[k]?.text.trim() };
  });
  const pfad: Id[] = [];
  for (const z of zeilen) for (const o of z.imText.length ? z.imText : z.laut) if (pfad[pfad.length - 1] !== o) pfad.push(o);
  const ortWaehlen = (o: Id) => {
    useStore.getState().planung.setzeOrteAnsicht('ort');
    waehle({ ort: o });
  };

  return (
    <div style={seite}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={h1}>{genitiv(figur.name)} Weg</h1>
          <span style={{ fontSize: 13, ...leise }}>Ortsfolge über alle Kapitel, aus dem Text erkannt · gestrichelt: nur laut Plan</span>
        </div>
        <label htmlFor={`${uid}-figur`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, ...leise }}>
          Figur
          <select id={`${uid}-figur`} className="pl-select" value={figur.id} onChange={(e) => setze(e.target.value)}>
            {figuren.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pfad.length > 0 && (
        <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '12px 14px', borderRadius: 10, background: 'var(--inspector)', border: '1px solid var(--line-soft)', fontSize: 12 }} aria-label="Weg in Kurzform">
          {pfad.map((o, i) => (
            <span key={`${o}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={leise}>→</span>}
              <Chip variante="umrandet" onClick={() => ortWaehlen(o)}>
                {daten.orte[o]?.name ?? o}
              </Chip>
            </span>
          ))}
        </section>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }} aria-label="Kapitel">
        {zeilen.map((z, i) => {
          const orte = z.imText.length ? z.imText : z.laut;
          const aktiv = orte.length > 0;
          return (
            <li key={z.k} style={{ display: 'grid', gridTemplateColumns: '170px 20px minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
              <span style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', fontSize: 13 }}>
                <LinkKnopf fett style={{ fontSize: 13, color: 'var(--ink)' }} onClick={() => oeffne('schreiben', { kapitel: z.k })}>
                  Kap. {z.nr}
                </LinkKnopf>
                <span style={{ fontSize: 12, ...leise }}>{daten.plaene[z.k]?.titel || daten.kapitel[z.k]?.titel}</span>
              </span>
              <span aria-hidden="true" style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span style={{ position: 'absolute', top: i === 0 ? 18 : 0, bottom: i === zeilen.length - 1 ? 'calc(100% - 18px)' : 0, width: 2, background: 'var(--line)' }} />
                <span
                  style={{
                    position: 'relative',
                    marginTop: 13,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: aktiv && z.imText.length ? 'var(--accent)' : 'var(--surface)',
                    border: aktiv && z.imText.length ? '2px solid var(--accent)' : `2px ${aktiv ? 'dashed' : 'solid'} var(--border-strong)`,
                  }}
                />
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--line-faint)', minHeight: 44 }}>
                {orte.map((o, j) => (
                  <span key={o} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {j > 0 && <span style={leise}>→</span>}
                    <Chip variante={z.imText.length ? 'umrandet' : 'gestrichelt'} onClick={() => ortWaehlen(o)} title={z.imText.length ? 'im Text' : 'laut Plan'}>
                      {daten.orte[o]?.name ?? o}
                    </Chip>
                  </span>
                ))}
                {!aktiv && (
                  <span style={{ fontSize: 12, ...leise }}>
                    {z.ohneText ? 'noch kein Text' : z.dabei ? 'kein Ort erkannt' : `${figur.name} kommt nicht vor`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HinweisKarte({ h, daten }: { h: Hinweis; daten: ProjektDaten }) {
  const festlegen = useStore((s) => s.planung.schreibweiseFestlegen);
  const markiere = useStore((s) => s.markiere);
  const varianten = variantenAusHinweis(h);
  const [wahl, setWahl] = useState(varianten[0] ?? '');
  const ziel = zielFuerVarianten(daten, varianten);
  const uid = useId();
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const zielName = ziel ? (ziel.typ === 'ort' ? daten.orte[ziel.id]?.name : daten.figuren[ziel.id]?.name) : undefined;
  return (
    <form
      style={{ border: '1px solid var(--line-soft)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        void festlegen(varianten.filter((v) => v !== wahl), wahl, ziel);
      }}
    >
      <strong style={{ fontSize: 14 }}>{h.titel}</strong>
      {h.erklaerung && <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{h.erklaerung}</span>}
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <legend style={{ fontSize: 12, paddingBottom: 4, ...leise }}>Gültige Schreibweise</legend>
        {varianten.map((v) => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, fontSize: 13 }}>
            <input type="radio" name={`${uid}-sw`} checked={wahl === v} onChange={() => setWahl(v)} style={{ margin: 0, accentColor: 'var(--ink)' }} />
            »{v}«
            {h.zitate
              .filter((z) => z.text.trim() === v)
              .map((z) => (
                <LinkKnopf key={z.kapitel} onClick={() => markiere({ kapitel: z.kapitel, anker: zitatAnker(daten, z.kapitel, z.text) })}>
                  Kap. {nr(z.kapitel)}
                </LinkKnopf>
              ))}
          </label>
        ))}
      </fieldset>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button type="submit" klein variante="primaer" disabled={!wahl}>
          Als gültig festlegen
        </Button>
        <span style={{ fontSize: 12, ...leise }}>{zielName ? `wird Name von ${zielName}, die übrigen werden Aliase` : 'keinem Ort und keiner Figur zugeordnet'}</span>
      </span>
    </form>
  );
}

export function SchreibweisenAnsicht({ daten, index }: { daten: ProjektDaten; index: Index }) {
  const aufheben = useStore((s) => s.planung.schreibweiseAufheben);
  const offen = index.hinweise.filter((h) => h.typ === 'schreibweise' && h.status === 'neu');
  const entschieden = daten.entscheidungen.schreibweisen;
  return (
    <div style={seite}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={h1}>Schreibweisen</h1>
        <span style={{ fontSize: 13, ...leise }}>Derselbe Name, verschieden geschrieben: Lege fest, welche Schreibweise gilt. Der Text bleibt unverändert.</span>
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Offene Schreibweisen">
          <strong style={{ fontSize: 14 }}>Offen</strong>
          {offen.length === 0 && <span style={{ fontSize: 13, ...leise }}>Keine abweichenden Schreibweisen gefunden.</span>}
          {offen.map((h) => (
            <HinweisKarte key={h.schluessel} h={h} daten={daten} />
          ))}
        </section>
        <section style={{ flex: '0 1 330px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Festgelegte Schreibweisen">
          <strong style={{ fontSize: 14 }}>Festgelegt</strong>
          {entschieden.length === 0 && <span style={{ fontSize: 13, ...leise }}>Noch nichts festgelegt.</span>}
          {entschieden.map((s) => {
            const ziel = s.ziel ? (s.ziel.typ === 'ort' ? daten.orte[s.ziel.id]?.name : daten.figuren[s.ziel.id]?.name) : undefined;
            return (
              <div key={s.gueltig} className="pl-zeile" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--inspector)', fontSize: 13, lineHeight: 1.45 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>»{s.gueltig}«</b>
                  {ziel && <span style={leise}> · {ziel}</span>}
                  <br />
                  <span style={{ fontSize: 12, ...leise }}>statt {s.varianten.filter((v) => v !== s.gueltig).map((v) => `»${v}«`).join(', ') || '–'}</span>
                </span>
                <button type="button" className="pl-zeile-weg" aria-label={`Schreibweise ${s.gueltig} aufheben`} onClick={() => void aufheben(s.gueltig)}>
                  ×
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
