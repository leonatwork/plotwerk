/** Zeitleiste (G1): Tages-Achse mit Kapitel-/Szenenkarten und Spuren für Ort und Zustand. Tastatur: ←/→, Pos1/Ende, Esc. */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { ProjektDaten } from '@core/model/types';
import {
  einheitName,
  einheitNummer,
  formatiereDatum,
  parseUhrzeit,
  erzaehlMinute,
  TAGESZEIT_SPANNE,
  tageszeitText,
  WOCHENTAG_KURZ,
  WOCHENTAG_NAME,
  zeitleisteVon,
  zeitText,
  zustaendeImKapitel,
  zustandFuerEinheit,
  zustandsFarbe,
  type ZeitEinheit,
  type ZeitSpalte,
  type ZustandTreffer,
} from '@core/zeit/index';
import { useStore } from '../../state/store';
import { klassen } from '../../ui/klassen';
import { farbe, SicherheitPunkt, vorschlaegeFuer, type ZeitDaten } from './gemeinsam';

/** Achse im Tageskopf: 04:00 bis 05:00 am nächsten Morgen (Minuten im Erzähltag) */
const ACHSE_VON = 240;
const ACHSE_BIS = 1740;
const pos = (m: number) => `${Math.max(0, Math.min(100, ((m - ACHSE_VON) / (ACHSE_BIS - ACHSE_VON)) * 100))}%`;

function TagAchse({ spalte, auswahl }: { spalte: Extract<ZeitSpalte, { art: 'tag' }>; auswahl: string | null }) {
  return (
    <div className="zl-tagachse" aria-hidden="true">
      {spalte.einheiten.map((e) => {
        const aktiv = e.schluessel === auswahl;
        const u = parseUhrzeit(e.zeit?.uhrzeit);
        if (u !== null)
          return <span key={e.schluessel} className={klassen('zl-tagachse__marke', aktiv && 'zl-tagachse__marke--aktiv')} style={{ left: pos(erzaehlMinute(u)) }} />;
        if (!e.zeit?.tageszeit) return null;
        const [von, bis] = TAGESZEIT_SPANNE[e.zeit.tageszeit];
        return (
          <span
            key={e.schluessel}
            className={klassen('zl-tagachse__marke', 'zl-tagachse__marke--spanne', aktiv && 'zl-tagachse__marke--aktiv')}
            style={{ left: pos(von), width: `calc(${pos(bis)} - ${pos(von)})` }}
          />
        );
      })}
    </div>
  );
}

function Kopf({ spalte, auswahl }: { spalte: ZeitSpalte; auswahl: string | null }) {
  if (spalte.art === 'unbekannt') {
    return (
      <div className="zl-gruppe__kopf zl-z-kopf">
        <div className="zl-gruppe__titel">
          <span className="zl-gruppe__tag">Abstand unbekannt</span>
        </div>
        <span className="zl-gruppe__datum">{spalte.einheiten.length === 1 ? 'ohne Tag' : `${spalte.einheiten.length} ohne Tag`}</span>
      </div>
    );
  }
  const zusatz = [spalte.wochentag ? WOCHENTAG_KURZ[spalte.wochentag] : '', spalte.datum ? formatiereDatum(spalte.datum) : '', spalte.tag <= 0 ? 'Rückblende' : '', spalte.fortsetzung ? 'Fortsetzung' : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="zl-gruppe__kopf zl-z-kopf">
      <div className="zl-gruppe__titel">
        <span className="zl-gruppe__tag">Tag {spalte.tag}</span>
        {zusatz && <span className="zl-gruppe__datum">{zusatz}</span>}
      </div>
      <TagAchse spalte={spalte} auswahl={auswahl} />
    </div>
  );
}

function ZustandZelle({ treffer }: { treffer: ZustandTreffer[] }) {
  if (!treffer.length)
    return (
      <div className="zl-spur zl-spur--zustand zl-z-zustand">
        <div className="zl-band" />
        <span className="zl-zustand" style={{ color: 'var(--ink-quiet)' }}>
          –
        </span>
      </div>
    );
  const geerbt = treffer.every((t) => t.geerbt);
  const namen = treffer.map((t) => t.art?.name ?? t.zustand.zustand).join(' → ');
  return (
    <div className="zl-spur zl-spur--zustand zl-z-zustand" title={geerbt ? `${namen} (vom Kapitel)` : namen}>
      <div className={klassen('zl-band', geerbt && 'zl-band--geerbt')}>
        {treffer.map((t, i) => (
          <span key={i} style={farbe(zustandsFarbe(t.art))} />
        ))}
      </div>
      <span className="zl-zustand">
        <span className="zl-zustand__punkt" style={farbe(zustandsFarbe(treffer[0]!.art))} aria-hidden="true" />
        {namen}
        {geerbt && <span style={{ color: 'var(--ink-quiet)' }}> · Kapitel</span>}
      </span>
    </div>
  );
}

function OrtZelle({ e, daten }: { e: ZeitEinheit; daten: ProjektDaten }) {
  if (!e.orte.length)
    return (
      <div className="zl-spur zl-spur--leer zl-z-ort" aria-label="kein Ort">
        –
      </div>
    );
  const geerbt = !!e.szene && !daten.plaene[e.kapitel]?.szenen?.find((s) => s.id === e.szene)?.ort;
  const namen = e.orte.map((id) => daten.orte[id]?.name ?? id);
  return (
    <div className="zl-spur zl-z-ort" title={namen.join(', ') + (geerbt ? ' (aus dem Kapitelplan)' : '')}>
      <span className={klassen('zl-ort', geerbt && 'zl-ort--geerbt')}>{namen[0]}</span>
      {namen.length > 1 && <span style={{ color: 'var(--ink-quiet)' }}>+{namen.length - 1}</span>}
    </div>
  );
}

function SpalteMitLuecke({ spalte, auswahl, children }: { spalte: ZeitSpalte; auswahl: string | null; children: ReactNode }) {
  const luecke = spalte.art === 'tag' ? spalte.luecke : 0;
  return (
    <>
      {luecke > 0 && (
        <div className="zl-luecke" title={luecke === 1 ? '1 Tag ohne Szene' : `${luecke} Tage ohne Szene`}>
          <span className="zl-luecke__text zl-z-kopf">
            +{luecke}
            <br />
            {luecke === 1 ? 'Tag' : 'Tage'}
          </span>
        </div>
      )}
      <div className={klassen('zl-gruppe', spalte.art === 'unbekannt' && 'zl-gruppe--unbekannt', spalte.art === 'tag' && spalte.tag <= 0 && 'zl-gruppe--rueckblende')}>
        <Kopf spalte={spalte} auswahl={auswahl} />
        <div className="zl-gruppe__einheiten">{children}</div>
      </div>
    </>
  );
}

function zeitZeile(e: ZeitEinheit): string {
  if (e.eigen) return tageszeitText(e.eigen) || (e.eigen.wochentag ? WOCHENTAG_NAME[e.eigen.wochentag] : '') || 'ohne Tageszeit';
  if (e.geerbt) return 'Zeit vom Kapitel';
  return 'Zeitpunkt offen';
}

export function Leiste({ zd }: { zd: ZeitDaten }) {
  const daten = useStore((s) => s.daten)!;
  const auswahl = useStore((s) => s.zeit.auswahl);
  const waehle = useStore((s) => s.zeit.waehle);
  const spuren = useStore((s) => s.zeit.spuren);
  const rahmen = useRef<HTMLDivElement>(null);
  const zl = zeitleisteVon(daten);
  const figur = zd.figur;
  const figurName = figur ? (daten.figuren[figur]?.name ?? figur) : undefined;
  const zeigeZustand = spuren.zustand && !!figur;
  const aktiv = zd.folge.findIndex((e) => e.schluessel === auswahl);
  const tabZiel = aktiv >= 0 ? aktiv : 0;
  const mitSzenen = zd.einheiten.some((e) => e.szene);

  useEffect(() => {
    if (!auswahl) return;
    const el = rahmen.current?.querySelector<HTMLElement>(`[data-einheit="${CSS.escape(auswahl)}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [auswahl]);

  const springe = (i: number) => {
    const e = zd.folge[Math.max(0, Math.min(zd.folge.length - 1, i))];
    if (!e) return;
    waehle(e.schluessel);
    rahmen.current?.querySelector<HTMLElement>(`[data-einheit="${CSS.escape(e.schluessel)}"]`)?.focus();
  };

  const tasten = (ev: KeyboardEvent) => {
    const i = zd.folge.findIndex((e) => e.schluessel === (document.activeElement as HTMLElement | null)?.dataset?.einheit);
    const von = i >= 0 ? i : aktiv;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') springe(von + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') springe(von <= 0 ? 0 : von - 1);
    else if (ev.key === 'Home') springe(0);
    else if (ev.key === 'End') springe(zd.folge.length - 1);
    else if (ev.key === 'Escape' && auswahl) waehle(null);
    else return;
    ev.preventDefault();
  };

  const zelleZustand = (e: ZeitEinheit): ZustandTreffer[] => {
    if (!figur) return [];
    if (e.szene) {
      const t = zustandFuerEinheit(zl, figur, e);
      return t ? [t] : [];
    }
    return zustaendeImKapitel(daten, figur, e.kapitel);
  };

  let laufNr = 0;
  return (
    <div className="zl-rahmen" ref={rahmen}>
      <div className="zl-raster" role="group" aria-label="Zeitleiste – Pfeiltasten wechseln die Karte, Esc hebt die Auswahl auf" onKeyDown={tasten}>
        <div className="zl-beschriftung" aria-hidden="true">
          <div className="zl-z-kopf">Tag</div>
          <div className="zl-z-zeit">Zeit</div>
          <div className="zl-z-karte">{mitSzenen ? 'Kapitel / Szene' : 'Kapitel'}</div>
          {spuren.ort && <div className="zl-z-ort">Ort</div>}
          {zeigeZustand && (
            <div className="zl-z-zustand" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
              Zustand
              <span className="zl-beschriftung__figur">{figurName}</span>
            </div>
          )}
        </div>
        {zd.spalten.map((spalte) => (
          <SpalteMitLuecke key={spalte.schluessel} spalte={spalte} auswahl={auswahl}>
            {spalte.einheiten.map((e) => {
              const nr = laufNr++;
              const hinweise = zd.hinweise.get(e.schluessel) ?? [];
              const vorschlaege =
                vorschlaegeFuer(zd.zeitVorschlaege, e).length + (figur ? vorschlaegeFuer(zd.zustandVorschlaege.filter((v) => v.figur === figur), e).length : 0);
              const gewaehlt = e.schluessel === auswahl;
              const fuss = e.szene ? `aus „${e.kapitelTitel}“` : !e.hatText ? 'noch ohne Text' : e.geerbt ? 'Tag vom Kapitel' : '';
              return (
                <div key={e.schluessel} className="zl-einheit">
                  <div className="zl-z-zeit">
                    {e.zeit ? <SicherheitPunkt sicherheit={e.zeit.sicherheit} /> : null}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: e.zeit ? undefined : 'var(--ink-quiet)' }}>{zeitZeile(e)}</span>
                  </div>
                  <div className="zl-einheit__karte-zelle zl-z-karte">
                    <button
                      type="button"
                      data-einheit={e.schluessel}
                      tabIndex={nr === tabZiel ? 0 : -1}
                      aria-pressed={gewaehlt}
                      aria-label={`${einheitName(e)}, ${zeitText(e.zeit, zd.beginn)}${hinweise.length ? `, ${hinweise.length} Zeit-Hinweis${hinweise.length > 1 ? 'e' : ''}` : ''}${vorschlaege ? `, ${vorschlaege} Vorschlag${vorschlaege > 1 ? 'e' : ''} der KI` : ''}`}
                      className={klassen('zl-karte', gewaehlt && 'zl-karte--aktiv', e.tag === undefined && 'zl-karte--offen', !e.hatText && 'zl-karte--ohne-text')}
                      onClick={() => waehle(gewaehlt ? null : e.schluessel)}
                    >
                      <span className="zl-karte__kopf">
                        {einheitNummer(e).toUpperCase()}
                        {hinweise.length > 0 && (
                          <span className="zl-marke zl-marke--warn" title={hinweise.map((h) => h.titel).join('\n')}>
                            ! {hinweise.length}
                          </span>
                        )}
                        {vorschlaege > 0 && (
                          <span className="zl-marke zl-marke--ki" title="Vorschläge der KI">
                            KI {vorschlaege}
                          </span>
                        )}
                      </span>
                      <span className="zl-karte__titel">{e.titel}</span>
                      <span className="zl-karte__fuss">{fuss}</span>
                    </button>
                  </div>
                  {spuren.ort && <OrtZelle e={e} daten={daten} />}
                  {zeigeZustand && <ZustandZelle treffer={zelleZustand(e)} />}
                </div>
              );
            })}
          </SpalteMitLuecke>
        ))}
      </div>
    </div>
  );

}
