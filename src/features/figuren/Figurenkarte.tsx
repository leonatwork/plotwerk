/** F-02–F-05: Figurenkarte nach docs/design/screens/Figur.dc.html. */
import { useId, useState, type CSSProperties } from 'react';
import { bogenVon, RUHE_SCHWELLE, ruhendeStrecken, ruheSchwelle, sortiereStufen, stufeImKapitel, stufenSpanne } from '@core/figuren/index';
import type { Index } from '@core/index/index';
import { hauptfigur } from '@core/zeit/zustand';
import type { Beziehung, BeziehungsKategorie, Erwaehnung, Figur, FigurRolle, Hinweis, Id, ProjektDaten } from '@core/model/types';
import { f as fmt, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { indexBereit, notizAbsaetze } from '../../state/slices/planung';
import { Avatar, bestaetigen as rueckfrage, Button, RealitaetsUmschalter, Segment, StrangPunkt } from '../../ui';
import {
  Abschnitt,
  artJeKapitel,
  ausschnitt,
  EntwurfBereich,
  EntwurfFeld,
  erwaehnungenVon,
  figurDarstellung,
  IconSchloss,
  LinkKnopf,
  stelleAnker,
  zitatAnker,
} from '../akte/gemeinsam';
import { RechercheLeiste } from '../recherche/RechercheLeiste';
import { VerweisFeld, VerweisText } from '../schreiben/VerweisFeld';
import { SpitznamenFeld } from './Spitznamen';
import { kapKurz, stufenOrtText, zitat } from './texte';

const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '8px 12px', alignItems: 'center', fontSize: 13 };
const leise: CSSProperties = { color: 'var(--ink-quiet)' };

function namenDerFigur(f: Figur): string[] {
  return [f.name, ...f.aliase, ...(f.formen ?? [])].filter((n) => n.trim().length >= 2);
}

/** F-05: offene Hinweise mit Plan-Bezug auf die Figur oder die die Figur nennen; bei „bewusst vage“ nie „prüfen“. */
export function hinweiseFuerFigur(hinweise: Hinweis[], f: Figur): Hinweis[] {
  const namen = namenDerFigur(f).map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u'));
  return hinweise.filter(
    (h) =>
      h.status === 'neu' &&
      !(f.existenz === 'bewusst_vage' && h.typ === 'pruefen') &&
      (h.plan?.figur === f.id || namen.some((re) => re.test(h.titel) || h.zitate.some((z) => re.test(z.text)))),
  );
}

/** Eingabe so breit wie ihr Inhalt (field-sizing), sonst Näherung in ch. */
function inhaltsBreite(zeichen: number): CSSProperties {
  if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return { fieldSizing: 'content', minWidth: 40 } as CSSProperties;
  return { width: `${Math.max(12, zeichen + 2)}ch` };
}

function Kopf({ f, daten, ersteStelle }: { f: Figur; daten: ProjektDaten; ersteStelle: Erwaehnung | undefined }) {
  const aendern = useStore((s) => s.planung.figurAendern);
  const markiere = useStore((s) => s.markiere);
  const d = figurDarstellung(f, daten);
  const t = useTexte().figuren;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Avatar name={f.name} farbe={d.farbe} groesse={64} unsicher={d.unsicher} textfarbe={d.textfarbe} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, display: 'flex' }}>
          <EntwurfFeld
            key={`${f.id}-name`}
            className="pl-still"
            aria-label={t.karte.name}
            style={{ fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 40, lineHeight: 1, width: 'calc(100% + 6px)', height: 42, padding: '0 5px', margin: '-1px 0 -1px -6px' }}
            wert={f.name}
            onSpeichern={(name) => name.trim() && void aendern(f.id, { name: name.trim() })}
          />
        </h1>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-quiet)' }}>
          <EntwurfFeld
            key={`${f.id}-kurz`}
            className="pl-still"
            aria-label={t.karte.kurz}
            placeholder={t.karte.kurz}
            style={{ fontSize: 13, color: 'var(--ink-quiet)', ...inhaltsBreite((f.kurz ?? '').length), maxWidth: 260, height: 18, padding: '0 5px', margin: '-1px 0 -1px -6px' }}
            wert={f.kurz ?? ''}
            onSpeichern={(kurz) => void aendern(f.id, { kurz: kurz.trim() || undefined })}
          />
          {d.strang && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <StrangPunkt farbe={d.farbe} groesse={9} />
              {d.strang.name}
            </span>
          )}
        </span>
      </div>
      <Button
        disabled={!ersteStelle}
        title={ersteStelle ? undefined : t.karte.nichtImText}
        onClick={() => ersteStelle && markiere({ kapitel: ersteStelle.kapitel, anker: stelleAnker(daten, ersteStelle.kapitel, ersteStelle.start, ersteStelle.ende, ersteStelle.treffer) })}
      >
        {t.imTextZeigen}
      </Button>
    </div>
  );
}

function AusDemText({ daten, index, nachKapitel }: { daten: ProjektDaten; index: Index; nachKapitel: Map<Id, Erwaehnung[]> }) {
  const markiere = useStore((s) => s.markiere);
  const arten = artJeKapitel([...nachKapitel.values()].flat());
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const kapitel = daten.projekt.kapitel.filter((k) => nachKapitel.has(k));
  const genannt = [...new Set([...nachKapitel.values()].flat().map((e) => e.treffer))];
  const zeigen = (e: Erwaehnung) => markiere({ kapitel: e.kapitel, anker: stelleAnker(daten, e.kapitel, e.start, e.ende, e.treffer) });
  const t = useTexte().figuren;
  const ta = t.karte.ausDemText;

  return (
    <Abschnitt titel={ta.titel} rechts={<span style={{ fontSize: 11, ...leise }}>{ta.rechts}</span>} hintergrund="var(--inspector)" label={ta.titel}>
      {!indexBereit(index) ? (
        <span style={{ fontSize: 13, ...leise }}>{ta.auswerten}</span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 54px', gap: '8px 12px', fontSize: 13, alignItems: 'baseline' }}>
          {kapitel.length === 0 && (
            <>
              <span style={leise}>{ta.imText}</span>
              <span style={{ color: 'var(--accent-dark)' }}>{ta.nochNicht}</span>
              <span />
            </>
          )}
          {genannt.length > 0 && (
            <>
              <span style={leise}>{ta.genanntAls}</span>
              <span>{genannt.map((g) => zitat(g)).join(', ')}</span>
              <span />
            </>
          )}
          {kapitel.map((k, i) => {
            const e = nachKapitel.get(k)![0]!;
            const [davor, treffer, danach] = ausschnitt(daten, k, e.start, e.ende, e.treffer);
            const anzahl = nachKapitel.get(k)!.length;
            return (
              <div key={k} style={{ display: 'contents' }}>
                <span style={leise}>{i === 0 ? ta.erstesVorkommen : t.art[arten.get(k) ?? 'unbestimmt']}</span>
                <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }} onClick={() => zeigen(e)} title={ta.stelleZeigen}>
                  {t.zitatAuf}
                  {davor}
                  <b>{treffer}</b>
                  {danach}
                  {t.zitatZu}
                  {anzahl > 1 && <span style={leise}> · {anzahl}×</span>}
                </button>
                <LinkKnopf onClick={() => zeigen(e)}>{kapKurz(nr(k))}</LinkKnopf>
              </div>
            );
          })}
        </div>
      )}
    </Abschnitt>
  );
}

function FeldZeile({ f, feld, umbenennen, setUmbenennen }: { f: Figur; feld: string; umbenennen: boolean; setUmbenennen(v: string | null): void }) {
  const p = useStore((s) => s.planung);
  const id = useId();
  const t = useTexte();
  const tf = t.figuren.karte.feld;
  return (
    <div className="pl-zeile" style={{ display: 'contents' }}>
      {umbenennen ? (
        <EntwurfFeld
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="pl-eingabe"
          style={{ height: 28, fontSize: 12 }}
          aria-label={tf.feldname}
          wert={feld}
          onSpeichern={(neu) => void p.planFeldUmbenennen(f.id, feld, neu)}
          onBlur={() => setUmbenennen(null)}
        />
      ) : (
        <label htmlFor={id} style={{ ...leise, overflow: 'hidden', textOverflow: 'ellipsis' }} onDoubleClick={() => setUmbenennen(feld)} title={tf.umbenennenTitel}>
          {feld}
        </label>
      )}
      <span style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
        <EntwurfFeld
          key={`${f.id}-${feld}`}
          id={id}
          className="pl-eingabe"
          style={{ width: '100%', paddingRight: 52 }}
          placeholder="–"
          wert={f.plan[feld] ?? ''}
          verzoegerung={800}
          onSpeichern={(wert) => void p.planFeldSetzen(f.id, feld, wert)}
        />
        <span className="pl-hover-zeigen" style={{ position: 'absolute', right: 4, top: 5, display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 4 }}>
          <button type="button" className="pl-zeile-weg" style={{ opacity: 1 }} aria-label={fmt(tf.umbenennenLabel, { feld })} title={tf.umbenennen} onClick={() => setUmbenennen(feld)}>
            ✎
          </button>
          <button
            type="button"
            className="pl-zeile-weg"
            style={{ opacity: 1 }}
            aria-label={fmt(tf.loeschenLabel, { feld })}
            title={tf.loeschen}
            onClick={async () => (!f.plan[feld] || (await rueckfrage(fmt(tf.loeschenFrage, { feld }), { knopf: t.gemeinsam.loeschen }))) && void p.planFeldEntfernen(f.id, feld)}
          >
            ×
          </button>
        </span>
      </span>
    </div>
  );
}

const NEUE_GRUPPE = '\u0000neu';

function DeinePlanung({ f, daten }: { f: Figur; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const oeffne = useStore((s) => s.oeffne);
  const mitgliedHinzufuegen = useStore((s) => s.mitgliedHinzufuegen);
  const mitgliedEntfernen = useStore((s) => s.mitgliedEntfernen);
  const gruppeAnlegen = useStore((s) => s.gruppeAnlegen);
  const [umbenennen, setUmbenennen] = useState<string | null>(null);
  /** Name der neuen Gruppe, solange das Eingabefeld offen ist */
  const [neueGruppe, setNeueGruppe] = useState<string | null>(null);
  /** F-14: bei Statisten nur ausgefüllte Planfelder, die übrigen auf Klick */
  const [leereZeigen, setLeereZeigen] = useState(false);
  const uid = useId();
  const t = useTexte();
  const tp = t.figuren.karte.planung;
  const gruppen = Object.values(daten.gruppen).sort((a, b) => vergleich(a.name, b.name));
  // A-05: Gruppen der Figur (Mitgliedschaft über gruppe.mitglieder; figur.gruppe = Hauptgruppe)
  const meine = gruppen.filter((g) => g.mitglieder.includes(f.id) || g.id === f.gruppe);
  const andere = gruppen.filter((g) => !meine.includes(g));
  const gruppeHinzu = (wert: string) => {
    if (wert === NEUE_GRUPPE) return setNeueGruppe('');
    if (wert) void mitgliedHinzufuegen(wert, f.id);
  };
  const alleFelder = Object.keys(f.plan);
  const felder =
    f.rolle === 'statist' && !leereZeigen ? alleFelder.filter((feld) => f.plan[feld]?.trim() || umbenennen === feld) : alleFelder;
  const versteckt = alleFelder.length - felder.length;
  const gruppeAnlegenUndSetzen = async () => {
    const name = neueGruppe?.trim();
    if (!name) return;
    setNeueGruppe(null);
    await gruppeAnlegen(name, { mitglieder: [f.id] });
  };
  return (
    <Abschnitt titel={tp.titel} rechts={<span style={{ fontSize: 11, ...leise }}>{tp.rechts}</span>} label={tp.titel}>
      <div style={grid2}>
        <span style={leise}>{tp.existenz}</span>
        <RealitaetsUmschalter variante="segment" label={tp.existenz} wert={f.existenz} onChange={(existenz) => void p.figurAendern(f.id, { existenz })} />
        <span style={leise}>{tp.rolle}</span>
        <Segment<FigurRolle>
          rolle="group"
          label={tp.rolle}
          voll
          wert={f.rolle}
          onChange={(rolle) => void p.figurAendern(f.id, { rolle })}
          optionen={[
            { wert: 'haupt', label: t.figuren.rolle.haupt },
            { wert: 'neben', label: t.figuren.rolle.neben },
            { wert: 'statist', label: t.figuren.rolle.statist },
          ]}
        />
        <label htmlFor={`${uid}-aliase`} style={leise} title={tp.auchGenanntTitel}>
          {tp.auchGenannt}
        </label>
        <SpitznamenFeld key={`${f.id}-aliase`} f={f} daten={daten} id={`${uid}-aliase`} />
        <label htmlFor={`${uid}-gruppe`} style={leise}>
          {tp.gruppe}
        </label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {neueGruppe === null ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {meine.map((g) => {
                const haupt = g.id === f.gruppe;
                const rolle = g.rollen?.[f.id];
                return (
                  <span key={g.id} className="pl-gruppenchip" data-haupt={haupt || undefined}>
                    <button
                      type="button"
                      className="pl-gruppenchip__stern"
                      aria-pressed={haupt}
                      title={haupt ? tp.hauptgruppe : tp.alsHauptgruppe}
                      aria-label={haupt ? tp.hauptgruppe : fmt(tp.alsHauptgruppeLabel, { name: g.name })}
                      onClick={() => !haupt && void p.figurAendern(f.id, { gruppe: g.id })}
                    >
                      {haupt ? '★' : '☆'}
                    </button>
                    <button type="button" className="pl-gruppenchip__name" title={tp.imNetz} onClick={() => oeffne('beziehungen', { gruppe: g.id, figur: f.id })}>
                      {g.name}
                      {rolle && <span style={leise}> · {rolle}</span>}
                    </button>
                    <button type="button" className="pl-gruppenchip__weg" aria-label={fmt(tp.gruppeVerlassen, { name: g.name })} onClick={() => void mitgliedEntfernen(g.id, f.id)}>
                      ×
                    </button>
                  </span>
                );
              })}
              <select id={`${uid}-gruppe`} className="pl-select" aria-label={tp.gruppeHinzu} value="" onChange={(e) => gruppeHinzu(e.target.value)} style={{ flex: meine.length ? '0 1 auto' : 1 }}>
                <option value="">{meine.length ? tp.gruppeHinzu : t.gemeinsam.keine}</option>
                {andere.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value={NEUE_GRUPPE}>{tp.neueGruppe}</option>
              </select>
            </span>
          ) : (
            <>
              <input
                id={`${uid}-gruppe`}
                className="pl-eingabe"
                style={{ flex: 1, minWidth: 0 }}
                autoFocus
                aria-label={tp.neueGruppeName}
                placeholder={tp.neueGruppeName}
                value={neueGruppe}
                onChange={(e) => setNeueGruppe(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void gruppeAnlegenUndSetzen();
                  if (e.key === 'Escape') setNeueGruppe(null);
                }}
              />
              <Button klein variante="primaer" disabled={!neueGruppe.trim()} onClick={() => void gruppeAnlegenUndSetzen()}>
                {tp.neueGruppeAnlegen}
              </Button>
              <Button klein variante="text" onClick={() => setNeueGruppe(null)}>
                {t.gemeinsam.abbrechen}
              </Button>
            </>
          )}
        </span>
        {felder.map((feld) => (
          <FeldZeile key={feld} f={f} feld={feld} umbenennen={umbenennen === feld} setUmbenennen={setUmbenennen} />
        ))}
      </div>
      {versteckt > 0 && (
        <button type="button" className="pl-link" style={{ alignSelf: 'flex-start', ...leise }} onClick={() => setLeereZeigen(true)}>
          {fmt(tp.leereFelder, { n: versteckt })}
        </button>
      )}
      <button
        type="button"
        className="pl-link"
        style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', fontWeight: 600 }}
        onClick={() => void p.planFeldHinzufuegen(f.id, tp.neuesFeld).then((name) => setUmbenennen(name))}
      >
        {tp.eigenesFeld}
      </button>
    </Abschnitt>
  );
}

/** Auswahl „Ruht seit … melden“: Standard nach Rolle, feste Schwellen oder nie (F-13). */
const RUHE_STUFEN = [2, 3, 4, 6, 10] as const;

function Auftritte({
  f,
  daten,
  index,
  nachKapitel,
  farbe,
}: {
  f: Figur;
  daten: ProjektDaten;
  index: Index;
  nachKapitel: Map<Id, Erwaehnung[]>;
  farbe: string;
}) {
  const markiere = useStore((s) => s.markiere);
  const figurAendern = useStore((s) => s.planung.figurAendern);
  const uid = useId();
  const arten = artJeKapitel([...nachKapitel.values()].flat());
  const reihenfolge = daten.projekt.kapitel;
  const t = useTexte().figuren;
  const tau = t.karte.auftritte;
  const ruhend = new Set(ruhendeStrecken(daten, index.erwaehnungen, f).flatMap((s) => s.kapitel));
  const standard = f.rolle === 'haupt' ? RUHE_SCHWELLE.haupt : f.rolle === 'neben' ? RUHE_SCHWELLE.neben : null;
  const wert = f.ruheSchwelle === undefined ? 'standard' : f.ruheSchwelle === null ? 'nie' : String(f.ruheSchwelle);
  const schwelle = ruheSchwelle(f);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label={tau.titel}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, flex: 1 }}>{tau.titel}</strong>
        <label htmlFor={`${uid}-ruhe`} style={{ fontSize: 12, ...leise }}>
          {tau.ruheLabel}
        </label>
        <select
          id={`${uid}-ruhe`}
          className="pl-select"
          value={wert}
          onChange={(e) => {
            const v = e.target.value;
            void figurAendern(f.id, { ruheSchwelle: v === 'standard' ? undefined : v === 'nie' ? null : Number(v) });
          }}
        >
          <option value="standard">{standard === null ? tau.ruheStandardNie : fmt(tau.ruheStandard, { n: standard })}</option>
          {RUHE_STUFEN.map((n) => (
            <option key={n} value={String(n)}>
              {fmt(tau.ruheNach, { n })}
            </option>
          ))}
          <option value="nie">{tau.ruheNie}</option>
        </select>
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, reihenfolge.length)}, minmax(0, 1fr))`, gap: 4 }}>
        {reihenfolge.map((k, i) => {
          const art = arten.get(k);
          const ohneText = !daten.kapitel[k]?.text.trim();
          const titel = `${kapKurz(i + 1)} ${daten.plaene[k]?.titel ?? ''} · ${art ? t.art[art] : ohneText ? tau.keinText : '–'}${ruhend.has(k) ? ` · ${tau.ruht}` : ''}`;
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
          if (art === 'auftritt') Object.assign(stil, { background: farbe, color: 'var(--on-farbe)', fontWeight: 600 });
          else if (art === 'nachricht') Object.assign(stil, { background: 'transparent', border: `2px solid ${farbe}`, color: 'var(--ink)', fontWeight: 600 });
          else if (art === 'erwaehnt') Object.assign(stil, { background: 'transparent', border: `1.5px dashed ${farbe}`, color: 'var(--ink)', fontWeight: 600 });
          else if (art === 'unbestimmt')
            Object.assign(stil, { background: `color-mix(in srgb, ${farbe} 22%, var(--surface))`, color: 'var(--ink)', fontWeight: 600 });
          else if (ohneText) stil.background = 'repeating-linear-gradient(135deg, var(--schraffur) 0 4px, var(--surface) 4px 8px)';
          // F-13: Kapitel einer ruhenden Strecke
          if (ruhend.has(k)) Object.assign(stil, { boxShadow: 'inset 0 -3px 0 var(--ampel-gelb)' });
          const e = nachKapitel.get(k)?.[0];
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
      <span style={{ fontSize: 12, ...leise }}>
        {tau.legende}
        {ruhend.size > 0 && schwelle !== null && ` · ${fmt(tau.ruhtLegende, { n: schwelle })}`}
      </span>
    </section>
  );
}

/**
 * G3: Der geplante Bogen der Figur (plan/boegen.md) kompakt – Stufen in Buchreihenfolge mit Kapitel/Akt, die aktuelle
 * Stufe (die im gewählten Kapitel gilt, sonst die letzte mit Platz) hervorgehoben. Klick öffnet die Stufe im Tab „Bögen“.
 */
function Bogen({ f, daten, farbe }: { f: Figur; daten: ProjektDaten; farbe: string }) {
  const oeffne = useStore((s) => s.oeffne);
  const gewaehltesKapitel = useStore((s) => s.auswahl.kapitel);
  const waehleStufe = useStore((s) => s.figurenbogen.waehleStufe);
  const setzeFigurenAnsicht = useStore((s) => s.figurenbogen.setzeFigurenAnsicht);
  const bogen = bogenVon(daten.boegen, f.id);
  const stufen = sortiereStufen(daten, bogen.stufen);
  const kapitel = gewaehltesKapitel && daten.projekt.kapitel.includes(gewaehltesKapitel) ? gewaehltesKapitel : undefined;
  const nr = kapitel ? daten.projekt.kapitel.indexOf(kapitel) + 1 : 0;
  const aktuell = kapitel ? stufeImKapitel(daten, bogen, kapitel) : [...stufen].reverse().find((s) => stufenSpanne(daten, s));
  const tb = useTexte().figuren.karte.bogen;
  const zuBoegen = (stufe?: Id) => {
    oeffne('figuren', { figur: f.id });
    waehleStufe(stufe ? { figur: f.id, stufe } : null);
    setzeFigurenAnsicht('boegen');
  };
  return (
    <Abschnitt
      titel={tb.titel}
      rechts={
        <LinkKnopf fett onClick={() => zuBoegen()}>
          {tb.oeffnen}
        </LinkKnopf>
      }
      label={tb.titel}
    >
      {stufen.length === 0 ? (
        <span style={{ fontSize: 13, ...leise }}>
          {tb.leer}{' '}
          <LinkKnopf fett style={{ fontSize: 13 }} onClick={() => zuBoegen()}>
            {tb.anlegen}
          </LinkKnopf>
        </span>
      ) : (
        <>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }} aria-label={fmt(tb.listeLabel, { name: f.name })}>
            {stufen.map((s, i) => {
              const ist = s.id === aktuell?.id;
              const n = s.belege.length;
              return (
                <li
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, borderBottom: i < stufen.length - 1 ? '1px solid var(--line-faint)' : 0 }}
                >
                  <span
                    aria-hidden
                    style={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: `2px solid ${farbe}`, background: ist ? farbe : 'transparent', opacity: ist ? 1 : 0.55 }}
                  />
                  <button
                    type="button"
                    className="pl-link"
                    aria-current={ist ? 'step' : undefined}
                    style={{ fontSize: 13, color: 'var(--ink)', fontWeight: ist ? 700 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={fmt(tb.stufeTitel, { text: `${s.titel} · ${stufenOrtText(daten, s)}${s.notiz ? `\n${s.notiz}` : ''}` })}
                    onClick={() => zuBoegen(s.id)}
                  >
                    {s.titel}
                  </button>
                  {ist && (
                    <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
                      {tb.aktuell}
                    </span>
                  )}
                  {n > 0 && <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap' }}>{fmt(tb.belege, { n })}</span>}
                  <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap', minWidth: 44, textAlign: 'right' }}>{stufenOrtText(daten, s)}</span>
                </li>
              );
            })}
          </ol>
          <span style={{ fontSize: 11, ...leise }}>
            {kapitel ? fmt(aktuell ? tb.giltIn : tb.keineIn, { nr }) : tb.letzte} {tb.klick}
          </span>
        </>
      )}
    </Abschnitt>
  );
}

function Notizen({ f, daten }: { f: Figur; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const markiere = useStore((s) => s.markiere);
  const [neu, setNeu] = useState('');
  const uid = useId();
  const anmerkungen = daten.anmerkungen.filter((a) => a.ziel?.typ === 'figur' && a.ziel.id === f.id);
  const eigene = notizAbsaetze(f.notizen);
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const t = useTexte();
  const tn = t.figuren.karte.notizen;
  const hinzufuegen = () => {
    if (!neu.trim()) return;
    void p.figurNotizHinzufuegen(f.id, neu);
    setNeu('');
  };
  return (
    <Abschnitt titel={tn.titel} label={tn.titel}>
      {anmerkungen.map((a) => (
        <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, background: 'var(--accent-flaeche)', fontSize: 13, lineHeight: 1.45 }}>
          <span style={{ whiteSpace: 'pre-wrap' }}>
            <VerweisText text={a.notiz} />
          </span>
          <LinkKnopf onClick={() => markiere({ kapitel: a.anker.kapitel, anker: a.anker })}>
            {fmt(tn.angeheftet, { nr: nr(a.anker.kapitel), zitat: zitat(a.anker.exakt) })}
          </LinkKnopf>
        </div>
      ))}
      {eigene.map((notiz, i) => (
        <div
          key={`${i}-${notiz.slice(0, 12)}`}
          className="pl-zeile"
          style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: 'var(--inspector)', fontSize: 13, lineHeight: 1.45 }}
        >
          <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>
            <VerweisText text={notiz} />
          </span>
          <button type="button" className="pl-zeile-weg" aria-label={tn.loeschen} onClick={async () => (await rueckfrage(tn.loeschenFrage, { knopf: t.gemeinsam.loeschen })) && void p.figurNotizEntfernen(f.id, i)}>
            ×
          </button>
        </div>
      ))}
      <label htmlFor={`${uid}-notiz`} style={{ fontSize: 12, ...leise }}>
        {tn.neu}
      </label>
      <VerweisFeld
        id={`${uid}-notiz`}
        feldKlasse="pl-bereich"
        feldStil={{ lineHeight: 'normal' }}
        zeilen={3}
        label={tn.neu}
        placeholder={tn.platzhalter}
        kontext={{ typ: 'figur', id: f.id }}
        wert={neu}
        onChange={setNeu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            hinzufuegen();
          }
        }}
      />
      {neu.trim() && (
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, ...leise }}>{tn.tastatur}</span>
          <Button klein variante="primaer" onClick={hinzufuegen}>
            {tn.speichern}
          </Button>
        </span>
      )}
    </Abschnitt>
  );
}

function Wahrheit({ f }: { f: Figur }) {
  const p = useStore((s) => s.planung);
  const uid = useId();
  const tw = useTexte().figuren.karte.wahrheit;
  return (
    <Abschnitt
      titel={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSchloss />
          {tw.titel}
        </span>
      }
      label={tw.titel}
    >
      <span style={{ fontSize: 11, marginTop: -6, ...leise }}>{tw.hinweis}</span>
      <EntwurfBereich
        key={`${f.id}-wahrheit`}
        id={`${uid}-wahrheit`}
        aria-label={tw.titel}
        className="pl-bereich"
        autoHoehe
        rows={3}
        placeholder={tw.platzhalter}
        verweise={{ typ: 'figur', id: f.id }}
        wert={f.wahrheit}
        onSpeichern={(wahrheit) => void p.figurAendern(f.id, { wahrheit })}
      />
    </Abschnitt>
  );
}

const KATEGORIEN: BeziehungsKategorie[] = ['arbeit', 'dates', 'sonstige'];

function Beziehungen({ f, daten }: { f: Figur; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const oeffne = useStore((s) => s.oeffne);
  const [form, setForm] = useState<{ zu: Id; art: string; kategorie: BeziehungsKategorie; abKapitel: Id } | null>(null);
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  const t = useTexte();
  const tz = t.figuren.karte.beziehungen;
  type Zeile = { von: Id; index: number; b: Beziehung; anderer: Id };
  const zeilen: Zeile[] = [
    ...f.beziehungen.map((b, index) => ({ von: f.id, index, b, anderer: b.zu })),
    ...Object.values(daten.figuren)
      .filter((x) => x.id !== f.id)
      .flatMap((x) => x.beziehungen.map((b, index) => ({ von: x.id, index, b, anderer: x.id })).filter((z) => z.b.zu === f.id)),
  ].sort((a, b) => (a.b.abKapitel ? nr(a.b.abKapitel) : 0) - (b.b.abKapitel ? nr(b.b.abKapitel) : 0));
  const mitgliedIn = Object.values(daten.gruppen).filter((g) => g.id === f.gruppe || g.mitglieder.includes(f.id));
  const andere = Object.values(daten.figuren)
    .filter((x) => x.id !== f.id)
    .sort((a, b) => vergleich(a.name, b.name));

  return (
    <Abschnitt
      titel={tz.titel}
      rechts={
        <LinkKnopf fett onClick={() => oeffne('beziehungen', { figur: f.id })}>
          {tz.netzOeffnen}
        </LinkKnopf>
      }
      label={tz.titel}
    >
      {mitgliedIn.map((g) => (
        <span key={g.id} style={{ fontSize: 13 }}>
          {tz.gruppe}{' '}
          <LinkKnopf fett style={{ fontSize: 13 }} onClick={() => oeffne('beziehungen', { gruppe: g.id, figur: f.id })}>
            {g.name}
          </LinkKnopf>
          {g.typ === 'antagonist' && <span style={leise}> · {tz.antagonist}</span>}
        </span>
      ))}
      {zeilen.length === 0 && mitgliedIn.length === 0 && <span style={{ fontSize: 13, ...leise }}>{tz.leer}</span>}
      {zeilen.map((z) => {
        const x = daten.figuren[z.anderer];
        if (!x) return null;
        const d = figurDarstellung(x, daten);
        return (
          <div key={`${z.von}-${z.index}`} className="pl-zeile" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <Avatar name={x.name} farbe={d.farbe} groesse={26} unsicher={d.unsicher} textfarbe={d.textfarbe} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700 }} onClick={() => useStore.getState().waehle({ figur: x.id })}>
                {x.name}
              </button>{' '}
              · {z.b.art || '–'}
              {z.b.unsicher && <span style={leise}> {tz.unsicher}</span>}
            </span>
            {z.b.abKapitel && <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap' }}>{fmt(tz.seit, { nr: nr(z.b.abKapitel) })}</span>}
            <button
              type="button"
              className="pl-zeile-weg"
              aria-label={tz.entfernen}
              onClick={async () => (await rueckfrage(fmt(tz.entfernenFrage, { art: z.b.art }), { knopf: t.gemeinsam.entfernen })) && void p.beziehungEntfernen(z.von, z.index)}
            >
              ×
            </button>
          </div>
        );
      })}
      {form ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 8, background: 'var(--inspector)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.zu || !form.art.trim()) return;
            void p.beziehungHinzufuegen(f.id, {
              zu: form.zu,
              art: form.art.trim(),
              kategorie: form.kategorie,
              ...(form.abKapitel ? { abKapitel: form.abKapitel } : {}),
            });
            setForm(null);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setForm(null)}
        >
          <select className="pl-select" aria-label={tz.zuFigur} value={form.zu} onChange={(e) => setForm({ ...form, zu: e.target.value })}>
            {andere.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <input autoFocus className="pl-eingabe" aria-label={tz.art} placeholder={tz.artPlatzhalter} value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })} />
          <span style={{ display: 'flex', gap: 6 }}>
            <select className="pl-select" style={{ flex: 1 }} aria-label={tz.kategorie} value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value as BeziehungsKategorie })}>
              {KATEGORIEN.map((k) => (
                <option key={k} value={k}>
                  {tz.kategorien[k]}
                </option>
              ))}
            </select>
            <select className="pl-select" style={{ flex: 1 }} aria-label={tz.abKapitel} value={form.abKapitel} onChange={(e) => setForm({ ...form, abKapitel: e.target.value })}>
              <option value="">{tz.vonAnfang}</option>
              {daten.projekt.kapitel.map((k, i) => (
                <option key={k} value={k}>
                  {fmt(tz.ab, { nr: i + 1 })}
                </option>
              ))}
            </select>
          </span>
          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button klein onClick={() => setForm(null)}>
              {t.gemeinsam.abbrechen}
            </Button>
            <Button klein type="submit" variante="primaer" disabled={!form.art.trim()}>
              {t.gemeinsam.hinzufuegen}
            </Button>
          </span>
        </form>
      ) : (
        andere.length > 0 && (
          <button
            type="button"
            className="pl-link"
            style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', fontWeight: 600 }}
            onClick={() => setForm({ zu: andere.find((x) => x.id === hauptfigur(daten))?.id ?? andere[0]!.id, art: '', kategorie: 'sonstige', abKapitel: '' })}
          >
            {tz.neu}
          </button>
        )
      )}
    </Abschnitt>
  );
}

function Hinweise({ f, daten, index }: { f: Figur; daten: ProjektDaten; index: Index }) {
  const markiere = useStore((s) => s.markiere);
  const oeffne = useStore((s) => s.oeffne);
  const liste = hinweiseFuerFigur(index.hinweise, f);
  const th = useTexte().figuren.karte.hinweise;
  if (liste.length === 0) return null;
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  return (
    <Abschnitt titel={th.titel} rechts={<span style={{ fontSize: 11, ...leise }}>{fmt(th.offen, { n: liste.length })}</span>} label={th.label}>
      {liste.map((h) => (
        <div key={h.schluessel} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--line-faint)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="pl-etikett" style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }}>
              {th.typ[h.typ]}
            </span>
            {h.offen && (
              <span className="pl-etikett" style={{ background: 'var(--ruhend)', color: 'var(--warm-dark)' }}>
                {th.offenEtikett}
              </span>
            )}
            {h.plan?.figur === f.id && (
              <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
                {h.plan.feld ? fmt(th.planFeld, { feld: h.plan.feld }) : th.plan}
              </span>
            )}
          </span>
          <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }} onClick={() => oeffne('hinweise', { hinweis: h.schluessel })}>
            {h.titel}
          </button>
          {h.zitate.map((z, i) => (
            <LinkKnopf key={i} onClick={() => markiere({ kapitel: z.kapitel, anker: zitatAnker(daten, z.kapitel, z.text) })}>
              {kapKurz(nr(z.kapitel))} · {zitat(z.text)}
            </LinkKnopf>
          ))}
        </div>
      ))}
    </Abschnitt>
  );
}

const namensform = (n: string) => n.trim().toLocaleLowerCase('de');

/** Andere Figuren, die einen Namen (Name, Spitzname, Form) mit `f` teilen – vermutlich dieselbe Person. */
export function gleichnamigeFiguren(f: Figur, daten: ProjektDaten): Figur[] {
  const formen = new Set(namenDerFigur(f).map(namensform));
  return Object.values(daten.figuren)
    .filter((x) => x.id !== f.id && namenDerFigur(x).some((n) => formen.has(namensform(n))))
    .sort((a, b) => vergleich(a.name, b.name));
}

type Zusammenfuehrung = { figur: Id; wahl: Id } | null;

/** Hinweis auf gleichnamige Figuren und Auswahl, welche Figur in dieser aufgeht. */
function Zusammenfuehren({ f, daten, zustand, setZustand }: { f: Figur; daten: ProjektDaten; zustand: Zusammenfuehrung; setZustand(z: Zusammenfuehrung): void }) {
  const zusammenfuehren = useStore((s) => s.figurenZusammenfuehren);
  const uid = useId();
  const t = useTexte();
  const tz = t.figuren.karte.zusammenfuehren;
  const doppelte = gleichnamigeFiguren(f, daten);
  const offen = zustand?.figur === f.id ? zustand : null;
  if (!offen) {
    if (doppelte.length === 0) return null;
    return (
      <div role="note" style={{ border: '1px solid var(--accent-line)', background: 'var(--accent-flaeche)', borderRadius: 10, padding: '10px 12px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>{fmt(tz.doppelt, { namen: doppelte.map((x) => `${fmt(t.figuren.zitat, { text: x.name })}${x.kurz ? ` (${x.kurz})` : ''}`).join(', ') })}</span>
        <LinkKnopf fett onClick={() => setZustand({ figur: f.id, wahl: doppelte[0]!.id })}>
          {tz.pruefen}
        </LinkKnopf>
      </div>
    );
  }
  const doppelteIds = new Set(doppelte.map((x) => x.id));
  const andere = Object.values(daten.figuren)
    .filter((x) => x.id !== f.id && !doppelteIds.has(x.id))
    .sort((a, b) => vergleich(a.name, b.name));
  const option = (x: Figur, gleich: boolean) => (
    <option key={x.id} value={x.id}>
      {x.name}
      {x.kurz ? ` – ${x.kurz}` : ''}
      {gleich ? ` (${tz.gleicherName})` : ''}
    </option>
  );
  const gewaehlt = daten.figuren[offen.wahl];
  /** `bleibt` übernimmt `geht` (nach Rückfrage) */
  const ausfuehren = async (bleibt: Figur, geht: Figur) => {
    if (!(await rueckfrage(fmt(tz.frage, { andere: geht.name, name: bleibt.name }), { knopf: tz.ausfuehren }))) return;
    setZustand(null);
    await zusammenfuehren(bleibt.id, geht.id);
  };
  return (
    <section aria-label={tz.knopf} style={{ border: '1px solid var(--line-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <label htmlFor={`${uid}-wahl`} style={{ fontWeight: 600 }}>
        {fmt(tz.label, { name: f.name })}
      </label>
      <select id={`${uid}-wahl`} className="pl-select" value={offen.wahl} onChange={(e) => setZustand({ figur: f.id, wahl: e.target.value })}>
        <option value="">{tz.waehlen}</option>
        {doppelte.map((x) => option(x, true))}
        {andere.map((x) => option(x, false))}
      </select>
      <span style={leise}>{fmt(tz.hilfe, { name: f.name })}</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <Button
          klein
          variante="primaer"
          disabled={!gewaehlt}
          onClick={() => gewaehlt && void ausfuehren(f, gewaehlt)}
        >
          {tz.ausfuehren}
        </Button>
        <Button klein variante="text" onClick={() => setZustand(null)}>
          {t.gemeinsam.abbrechen}
        </Button>
      </span>
      {gewaehlt && (
        <LinkKnopf onClick={() => void ausfuehren(gewaehlt, f)}>
          {fmt(tz.umgekehrt, { andere: gewaehlt.name })}
        </LinkKnopf>
      )}
    </section>
  );
}

export function Figurenkarte({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const entfernen = useStore((s) => s.entferneFigur);
  const [zusammenfuehrung, setZusammenfuehrung] = useState<Zusammenfuehrung>(null);
  const t = useTexte();
  const f = daten.figuren[id];
  if (!f) return null;
  const liste = erwaehnungenVon(index, 'figur', id);
  const nachKapitel = new Map<Id, Erwaehnung[]>();
  for (const e of liste) {
    const l = nachKapitel.get(e.kapitel);
    if (l) l.push(e);
    else nachKapitel.set(e.kapitel, [e]);
  }
  for (const l of nachKapitel.values()) l.sort((a, b) => a.start - b.start);
  const ersteKapitel = daten.projekt.kapitel.find((k) => nachKapitel.has(k));
  const ersteStelle = ersteKapitel ? nachKapitel.get(ersteKapitel)![0] : undefined;
  const d = figurDarstellung(f, daten);
  const farbe = d.unsicher ?? d.farbe;

  return (
    <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Kopf f={f} daten={daten} ersteStelle={ersteStelle} />
      <div style={{ display: 'flex', gap: 28, minHeight: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 500px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AusDemText daten={daten} index={index} nachKapitel={nachKapitel} />
          <DeinePlanung f={f} daten={daten} />
          <Auftritte f={f} daten={daten} index={index} nachKapitel={nachKapitel} farbe={farbe} />
          {(f.rolle !== 'statist' || bogenVon(daten.boegen, f.id).stufen.length > 0) && <Bogen f={f} daten={daten} farbe={farbe} />}
        </div>
        <div style={{ flex: '0 1 330px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Zusammenfuehren f={f} daten={daten} zustand={zusammenfuehrung} setZustand={setZusammenfuehrung} />
          <Notizen f={f} daten={daten} />
          <Wahrheit f={f} />
          <Beziehungen f={f} daten={daten} />
          <Hinweise f={f} daten={daten} index={index} />
          <RechercheLeiste ziel={{ typ: 'figur', id: f.id }} />
          {zusammenfuehrung?.figur !== f.id && Object.keys(daten.figuren).length > 1 && (
            <button
              type="button"
              className="pl-link"
              style={{ alignSelf: 'flex-start', color: 'var(--ink-quiet)' }}
              onClick={() => setZusammenfuehrung({ figur: f.id, wahl: gleichnamigeFiguren(f, daten)[0]?.id ?? '' })}
            >
              {t.figuren.karte.zusammenfuehren.knopf}
            </button>
          )}
          <button
            type="button"
            className="pl-link"
            style={{ alignSelf: 'flex-start', color: 'var(--ink-quiet)' }}
            onClick={async () => (await rueckfrage(fmt(t.figuren.karte.loeschenFrage, { name: f.name }), { knopf: t.gemeinsam.loeschen })) && void entfernen(f.id)}
          >
            {t.figuren.karte.loeschen}
          </button>
        </div>
      </div>
    </div>
  );
}
