/**
 * Strang-Raster (Kapitel × Stränge) im Bereich „Akte planen“ (Umschalter „Stränge“). Besitzer: G2.
 *
 * Zeilen = Stränge, Spalten = Kapitel. Eine Zelle ist gefüllt, wenn der Kapitelplan den Strang führt; Lücken
 * zwischen erstem und letztem Auftritt sind warm hervorgehoben, lange Lücken (≥ Ruhe-Schwelle) gestrichelt.
 * Klick bzw. Leertaste auf eine Zelle nimmt den Strang in den Kapitelplan auf oder heraus.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ProjektDaten, Strang } from '@core/model/types';
import { fadenSlug, RUHE_STANDARD, strangRaster, type RasterZeile, type RasterZelle } from '@core/struktur/faeden';
import { useStore } from '../../state/store';
import { Button, klassen, LeerZustand, StrangPunkt } from '../../ui';
import { strangFarbe, strangGeplant } from '../akte/gemeinsam';
import { kapitelVoll, roemisch } from './gemeinsam';
import { f, texte, useTexte, type Woerterbuch } from '../../i18n';
import './faeden.css';

type FarbName = keyof Woerterbuch['faeden']['raster']['farben'];

/** Farben für neue Stränge (Hex wie in plan/straenge.md; die Anzeige läuft über strangFarbe → Token). */
const STRANG_FARBEN: { hex: string; name: FarbName }[] = [
  { hex: '#3D5A75', name: 'blau' },
  { hex: '#C2405C', name: 'rosa' },
  { hex: '#A86A12', name: 'ocker' },
  { hex: '#6A4C9C', name: 'violett' },
  { hex: '#2F6B45', name: 'gruen' },
  { hex: '#4A4A4F', name: 'grau' },
];

function strangInfo(z: RasterZeile): { text: string; warn: boolean } {
  const t = texte().faeden.raster;
  if (z.anzahl === 0) return { text: t.inKeinem, warn: true };
  const teile = [z.erstes === z.letztes ? f(t.nurKap, { nr: z.erstes }) : f(t.bereich, { von: z.erstes, bis: z.letztes, n: z.anzahl })];
  const lang = z.luecken.filter((l) => l.laenge > 0);
  if (lang.length) teile.push(lang.map((l) => (l.von === l.bis ? f(t.fehltIn, { nr: l.von }) : f(t.fehltInBereich, { von: l.von, bis: l.bis }))).join(', '));
  if (z.endetVorStand) teile.push(f(t.verschwindet, { nr: z.letztes }));
  const warn = z.endetVorStand || z.zellen.some((c) => c.langeLuecke);
  return { text: teile.join(' · '), warn };
}

function zellenTitel(daten: ProjektDaten, strang: Strang, c: RasterZelle): string {
  const t = texte().faeden.raster;
  const was = f(c.belegt ? t.zelleGeplant : c.langeLuecke ? t.zelleLangeLuecke : c.luecke ? t.zelleLuecke : t.zelleNicht, { name: strang.name });
  return `${kapitelVoll(daten, c.kapitel)}${c.ohneText ? t.nochOhneText : ''} – ${was}`;
}

function NeuerStrang({ daten, onFertig }: { daten: ProjektDaten; onFertig(): void }) {
  const speichern = useStore((s) => s.speichereStraenge);
  const [name, setName] = useState('');
  const frei = STRANG_FARBEN.find((f) => !daten.straenge.some((s) => s.farbe.toLowerCase() === f.hex.toLowerCase())) ?? STRANG_FARBEN[0]!;
  const [farbe, setFarbe] = useState(frei.hex);
  const t = useTexte();
  const anlegen = () => {
    const n = name.trim();
    if (!n) return;
    const belegt = new Set(daten.straenge.map((s) => s.id));
    const basis = fadenSlug(n);
    let id = basis;
    for (let i = 2; belegt.has(id); i++) id = `${basis}-${i}`;
    void speichern([...daten.straenge, { id, name: n, farbe }]);
    onFertig();
  };
  return (
    <form
      className="fd-strang-neu"
      onSubmit={(e) => {
        e.preventDefault();
        anlegen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onFertig();
        }
      }}
    >
      <input
        className="pl-eingabe"
        autoFocus
        aria-label={t.faeden.raster.nameLabel}
        placeholder={t.faeden.raster.nameLabel}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div role="radiogroup" aria-label={t.faeden.raster.farbe} className="fd-farbwahl">
        {STRANG_FARBEN.map((fb) => (
          <button
            key={fb.hex}
            type="button"
            role="radio"
            aria-checked={farbe === fb.hex}
            aria-label={t.faeden.raster.farben[fb.name]}
            title={t.faeden.raster.farben[fb.name]}
            className="fd-farbwahl__knopf"
            style={{ background: strangFarbe(fb.hex) }}
            onClick={() => setFarbe(fb.hex)}
          />
        ))}
      </div>
      <Button type="submit" klein variante="primaer" disabled={!name.trim()}>
        {t.faeden.raster.anlegen}
      </Button>
      <Button klein variante="leise" onClick={onFertig}>
        {t.gemeinsam.abbrechen}
      </Button>
    </form>
  );
}

export function StrangRaster({ daten }: { daten: ProjektDaten }) {
  const umschalten = useStore((s) => s.struktur.strangUmschalten);
  const waehle = useStore((s) => s.waehle);
  const gewaehlt = useStore((s) => s.auswahl.plan ?? s.auswahl.kapitel);
  const schwelle = daten.fadenplanung?.ruheSchwelle ?? RUHE_STANDARD;
  const raster = useMemo(() => strangRaster(daten, schwelle), [daten, schwelle]);
  const [fokus, setFokus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [neu, setNeu] = useState(false);
  const gitter = useRef<HTMLDivElement>(null);
  const t = useTexte();
  const tr = t.faeden.raster;

  const n = raster.kapitel.length;
  if (daten.straenge.length === 0 && !neu)
    return (
      <LeerZustand titel={tr.leerTitel} aktionen={<Button onClick={() => setNeu(true)}>{tr.plusStrang}</Button>}>
        {tr.leerText}
      </LeerZustand>
    );
  if (n === 0) return <LeerZustand titel={tr.keineKapitelTitel}>{tr.keineKapitelText}</LeerZustand>;

  const zeilen = raster.zeilen.length;
  const r0 = Math.min(fokus.r, Math.max(0, zeilen - 1));
  const c0 = Math.min(fokus.c, n - 1);
  const fokussiere = (r: number, c: number) => {
    setFokus({ r, c });
    gitter.current?.querySelector<HTMLButtonElement>(`[data-zelle="${r}:${c}"]`)?.focus();
  };
  const tasten = (e: KeyboardEvent<HTMLDivElement>) => {
    const ziel = (e.target as HTMLElement).dataset.zelle;
    if (!ziel) return;
    const [r, c] = ziel.split(':').map(Number) as [number, number];
    let nr = r;
    let nc = c;
    if (e.key === 'ArrowRight') nc = Math.min(n - 1, c + 1);
    else if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') nr = Math.min(zeilen - 1, r + 1);
    else if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
    else if (e.key === 'Home') nc = 0;
    else if (e.key === 'End') nc = n - 1;
    else return;
    e.preventDefault();
    fokussiere(nr, nc);
  };
  const spalten = `minmax(190px, max-content) repeat(${n}, minmax(28px, 34px))`;
  const strangVon = new Map(daten.straenge.map((s) => [s.id, s]));
  const verschwunden = raster.zeilen.filter((z) => strangInfo(z).warn).length;

  return (
    <div className="fd-raster-flaeche">
      <div className="fd-raster-scroll">
        <div
          ref={gitter}
          role="grid"
          aria-label={tr.gitter}
          aria-rowcount={zeilen + 2}
          aria-colcount={n + 1}
          className="fd-raster"
          style={{ gridTemplateColumns: spalten }}
          onKeyDown={tasten}
        >
          {/* Akte */}
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" className="fd-raster__ecke" style={{ gridRow: 1 }} />
            {raster.akte.map((a) => {
              const akt = a.akt !== null ? daten.akte.find((x) => x.nummer === a.akt) : undefined;
              const zusatz = akt?.titel.trim() && !/^akt\s+[ivx\d]+$/i.test(akt.titel.trim()) ? ` · ${akt.titel.trim()}` : '';
              const titel = a.akt === null ? tr.ohneAkt : `${f(tr.akt, { nr: roemisch(a.akt) })}${zusatz}`;
              return (
                <div key={`${a.akt}-${a.start}`} role="columnheader" className="fd-raster__akt" title={titel} style={{ gridRow: 1, gridColumn: `${a.start + 2} / span ${a.anzahl}` }}>
                  {titel}
                </div>
              );
            })}
          </div>
          {/* Kapitel */}
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" className="fd-raster__ecke fd-label" style={{ gridRow: 2, alignSelf: 'center' }}>
              {tr.ecke}
            </div>
            {raster.kapitel.map((k, i) => (
              <div key={k.id} role="columnheader" style={{ gridRow: 2, gridColumn: i + 2, display: 'flex' }}>
                <button
                  type="button"
                  className={klassen('fd-raster__kapitel', k.ohneText && 'fd-raster__kapitel--ohnetext')}
                  style={{ flex: 1 }}
                  aria-current={gewaehlt === k.id ? 'true' : undefined}
                  title={f(tr.kapitelTitel, { kap: f(t.gemeinsam.kapitelKurz, { nr: k.nummer }), titel: k.titel, ohneText: k.ohneText ? tr.nochOhneText : '' })}
                  aria-label={f(tr.kapitelLabel, { nr: k.nummer, titel: k.titel })}
                  tabIndex={-1}
                  onClick={() => waehle({ plan: k.id, kapitel: k.id })}
                >
                  {k.nummer}
                </button>
              </div>
            ))}
          </div>
          {/* Stränge */}
          {raster.zeilen.map((z, r) => {
            const strang = strangVon.get(z.strang)!;
            const farbe = strangFarbe(strang.farbe);
            const geplant = strangGeplant(strang, daten);
            const info = strangInfo(z);
            return (
              <div key={z.strang} role="row" style={{ display: 'contents' }}>
                <div role="rowheader" className="fd-raster__strang" style={{ gridRow: r + 3 }}>
                  <span className="fd-raster__strangname">
                    <StrangPunkt farbe={farbe} groesse={10} geplant={geplant} />
                    {strang.name}
                  </span>
                  <span className={klassen('fd-raster__info', info.warn && 'fd-raster__info--warn')}>{info.text}</span>
                </div>
                {z.zellen.map((c, i) => (
                  <div key={c.kapitel} role="gridcell" style={{ gridRow: r + 3, gridColumn: i + 2, display: 'flex' }}>
                    <button
                      type="button"
                      data-zelle={`${r}:${i}`}
                      tabIndex={r === r0 && i === c0 ? 0 : -1}
                      aria-pressed={c.belegt}
                      aria-label={zellenTitel(daten, strang, c)}
                      title={zellenTitel(daten, strang, c)}
                      className={klassen(
                        'fd-raster__zelle',
                        c.belegt && 'fd-raster__zelle--belegt',
                        c.belegt && geplant && 'fd-raster__zelle--geplant',
                        c.ohneText && 'fd-raster__zelle--ohnetext',
                        !c.belegt && c.luecke && 'fd-raster__zelle--luecke',
                        !c.belegt && c.langeLuecke && 'fd-raster__zelle--lang',
                        gewaehlt === c.kapitel && 'fd-raster__zelle--spalte',
                      )}
                      style={{
                        flex: 1,
                        ...(c.belegt ? (geplant ? { boxShadow: `inset 0 0 0 2px ${farbe}` } : { background: farbe }) : {}),
                      }}
                      onFocus={() => setFokus({ r, c: i })}
                      onClick={() => void umschalten(c.kapitel, z.strang)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div className="fd-legende" aria-label={tr.legende} style={{ flex: '1 1 320px' }}>
          <span className="fd-legende__eintrag">
            <span className="fd-legende__muster" style={{ background: 'var(--ink)' }} />
            {tr.imPlan}
          </span>
          <span className="fd-legende__eintrag">
            <span className="fd-legende__muster" style={{ background: 'var(--ruhend)' }} />
            {tr.luecke}
          </span>
          <span className="fd-legende__eintrag">
            <span className="fd-legende__muster" style={{ background: 'var(--ruhend)', border: '1.5px dashed var(--real-offen)' }} />
            {f(tr.langeLuecke, { n: schwelle })}
          </span>
          <span className="fd-legende__eintrag">
            <span className="fd-legende__muster" style={{ background: 'repeating-linear-gradient(135deg, var(--schraffur) 0 3px, var(--surface) 3px 6px)', border: '1px solid var(--line)' }} />
            {tr.ohneText}
          </span>
          <span className="fd-legende__eintrag">{tr.tastatur}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {verschwunden > 0 && <span className="fd-etikett fd-etikett--warn">{f(tr.verschwinden, { n: verschwunden })}</span>}
          {!neu && (
            <Button klein variante="leise" onClick={() => setNeu(true)}>
              {tr.plusStrang}
            </Button>
          )}
        </div>
      </div>
      {neu && <NeuerStrang daten={daten} onFertig={() => setNeu(false)} />}
    </div>
  );
}

