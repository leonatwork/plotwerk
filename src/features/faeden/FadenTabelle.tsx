/**
 * Tabelle „Lose Enden × Kapitel“ (G2): alle losen Enden untereinander, gruppiert nach Strang (Haupthandlung zuerst,
 * dann Nebenhandlungen, zuletzt ohne Strang), je Kapitel eine Zelle: eröffnet, aufgegriffen, ruht, Auflösung geplant.
 * Klick auf Name oder Zelle wählt das lose Ende im Inspektor. Besitzer: G2.
 */
import { Fragment, useMemo } from 'react';
import type { Id, ProjektDaten } from '@core/model/types';
import { fadenStreifen, strangRaster, type FadenKarte, type StreifenZelle } from '@core/struktur/faeden';
import { straengeSortiert } from '@core/struktur/straenge';
import { useStore } from '../../state/store';
import { klassen, StrangPunkt } from '../../ui';
import { strangFarbe } from '../akte/gemeinsam';
import { fadenFarbe, kapitelDauer, kapitelVoll, roemisch, StreifenLegende } from './gemeinsam';
import { f, texte, useTexte } from '../../i18n';
import './faeden.css';

interface Gruppe {
  strang: Id | null;
  karten: FadenKarte[];
}

function gruppen(daten: ProjektDaten, karten: FadenKarte[]): Gruppe[] {
  const ids = new Set(daten.straenge.map((s) => s.id));
  const ergebnis: Gruppe[] = straengeSortiert(daten.straenge)
    .map((s) => ({ strang: s.id as Id | null, karten: karten.filter((k) => k.strang === s.id) }))
    .filter((g) => g.karten.length > 0);
  const ohne = karten.filter((k) => !k.strang || !ids.has(k.strang));
  if (ohne.length) ergebnis.push({ strang: null, karten: ohne });
  return ergebnis;
}

function zellenTitel(daten: ProjektDaten, karte: FadenKarte, z: StreifenZelle): string {
  const t = texte().faeden.streifen;
  const teile: string[] = [];
  if (z.eroeffnet) teile.push(t.eroeffnet);
  if (z.aufgegriffen) teile.push(t.aufgegriffen);
  if (z.aufloesung) teile.push(t.aufloesungGeplant);
  if (z.ruht) teile.push(t.ruht);
  if (z.ohneText) teile.push(t.nochOhneText);
  return `${karte.name} · ${kapitelVoll(daten, z.kapitel)}${teile.length ? `: ${teile.join(', ')}` : ''}`;
}

function zeilenInfo(karte: FadenKarte, zellen: StreifenZelle[]): string {
  const t = texte().faeden;
  const drin = zellen.filter((z) => z.eroeffnet || z.aufgegriffen).map((z) => z.nummer);
  const teile: string[] = [];
  if (drin.length === 0) teile.push(t.karte.keinKapitel);
  else if (drin.length === 1) teile.push(f(t.raster.nurKap, { nr: drin[0]! }));
  else teile.push(f(t.raster.bereich, { von: drin[0]!, bis: drin[drin.length - 1]!, n: drin.length }));
  if (karte.ruhend) teile.push(f(t.karte.ruhtKurz, { dauer: kapitelDauer(karte.ruhtSeit) }));
  if (karte.status !== 'offen') teile.push(t.spalten[karte.spalte]);
  return teile.join(' · ');
}

export function FadenTabelle({ daten, karten }: { daten: ProjektDaten; karten: FadenKarte[] }) {
  const auswahl = useStore((s) => s.struktur.fadenAuswahl);
  const waehle = useStore((s) => s.struktur.waehleFaden);
  const t = useTexte();
  const tt = t.faeden.tabelle;
  const raster = useMemo(() => strangRaster(daten), [daten]);
  const liste = useMemo(() => gruppen(daten, karten), [daten, karten]);
  const n = raster.kapitel.length;
  const spalten = `minmax(220px, max-content) repeat(${n}, minmax(28px, 34px))`;
  let zeile = 3;

  return (
    <div className="fd-raster-flaeche">
      <div className="fd-raster-scroll">
        <div role="table" aria-label={tt.label} className="fd-raster" style={{ gridTemplateColumns: spalten }}>
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" className="fd-raster__ecke" style={{ gridRow: 1 }} />
            {raster.akte.map((a) => (
              <div key={`${a.akt}-${a.start}`} role="columnheader" className="fd-raster__akt" style={{ gridRow: 1, gridColumn: `${a.start + 2} / span ${a.anzahl}` }}>
                {a.akt === null ? t.faeden.raster.ohneAkt : f(t.faeden.raster.akt, { nr: roemisch(a.akt) })}
              </div>
            ))}
          </div>
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" className="fd-raster__ecke fd-label" style={{ gridRow: 2, alignSelf: 'center' }}>
              {tt.ecke}
            </div>
            {raster.kapitel.map((k, i) => (
              <div
                key={k.id}
                role="columnheader"
                title={kapitelVoll(daten, k.id)}
                className={klassen('fd-tabelle__kapitel', k.ohneText && 'fd-raster__kapitel--ohnetext')}
                style={{ gridRow: 2, gridColumn: i + 2 }}
              >
                {k.nummer}
              </div>
            ))}
          </div>
          {liste.map((g) => {
            const s = g.strang ? daten.straenge.find((x) => x.id === g.strang) : undefined;
            const kopfZeile = zeile++;
            return (
              <Fragment key={g.strang ?? '–'}>
                <div role="row" style={{ display: 'contents' }}>
                  <div role="rowheader" className="fd-tabelle__gruppe" style={{ gridRow: kopfZeile, gridColumn: `1 / span ${n + 1}` }}>
                    {s ? <StrangPunkt farbe={strangFarbe(s.farbe)} groesse={9} /> : null}
                    <span>{s ? s.name : tt.ohneStrang}</span>
                    {s?.rolle && <span className={klassen('fd-rolle', s.rolle === 'haupt' && 'fd-rolle--haupt')}>{t.faeden.raster.rolleKurz[s.rolle]}</span>}
                    <span className="fd-leise">{f(t.faeden.ansicht.anzahl, { n: g.karten.length })}</span>
                  </div>
                </div>
                {g.karten.map((karte) => {
                  const r = zeile++;
                  const zellen = fadenStreifen(karte, daten);
                  const farbe = fadenFarbe(daten, karte.strang);
                  return (
                    <div key={karte.id} role="row" style={{ display: 'contents' }}>
                      <div role="rowheader" className="fd-raster__strang" style={{ gridRow: r }}>
                        <button
                          type="button"
                          className="fd-raster__strangname"
                          aria-current={auswahl === karte.id ? 'true' : undefined}
                          onClick={() => waehle(karte.id)}
                          style={karte.status === 'erledigt' ? { textDecoration: 'line-through', color: 'var(--ink-quiet)' } : undefined}
                        >
                          <span className="fd-raster__strangtext">{karte.name}</span>
                        </button>
                        <span className={klassen('fd-raster__info', karte.ruhend && 'fd-raster__info--warn')}>{zeilenInfo(karte, zellen)}</span>
                      </div>
                      {zellen.map((z, i) => (
                        <div key={z.kapitel} role="cell" style={{ gridRow: r, gridColumn: i + 2, display: 'flex' }} title={zellenTitel(daten, karte, z)} onClick={() => waehle(karte.id)}>
                          <span
                            className={klassen(
                              'fd-zelle fd-tabelle__zelle',
                              z.eroeffnet && 'fd-zelle--eroeffnet',
                              !z.eroeffnet && z.aufgegriffen && 'fd-zelle--aufgegriffen',
                              z.ruht && 'fd-zelle--ruht',
                              z.aufloesung && 'fd-zelle--aufloesung',
                              z.ohneText && !z.eroeffnet && !z.aufgegriffen && 'fd-zelle--ohnetext',
                            )}
                            style={z.eroeffnet || z.aufgegriffen ? { background: farbe } : undefined}
                          >
                            {z.eroeffnet ? '●' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      <StreifenLegende />
    </div>
  );
}
