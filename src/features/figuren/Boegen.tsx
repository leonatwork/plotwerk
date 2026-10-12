/**
 * Figuren-Bögen (G3, Segment „Bögen“ im Bereich Figuren): je Figur eine Linie durchs Buch mit Leons geplanten
 * Entwicklungsstufen (plan/boegen.md) und den Auftritten aus dem Text (index.erwaehnungen). Weitere Figuren lassen
 * sich darunter zum Vergleich einblenden. Besitzer: G3 Figuren. Plan-Daten, gehen nicht an die KI (E12).
 *
 * Tastatur: Stufe fokussieren → Enter wählt, ←/→ springt zur Nachbarstufe, ⌥←/⌥→ verschiebt, Entf löscht,
 * Escape schließt die Bearbeitung.
 */
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  aktGruppen,
  auftritteJeKapitel,
  bogenVon,
  kapitelTitel,
  naechstesKapitel,
  stufenOrt,
  stufenSpuren,
  stufeVerschieben,
  type KapitelAuftritt,
} from '@core/figuren/index';
import type { Index } from '@core/index/index';
import type { BogenStufe, Id, ProjektDaten } from '@core/model/types';
import { indexBereit } from '../../state/slices/planung';
import { useStore } from '../../state/store';
import { Avatar, bestaetigen, Button, LeerZustand } from '../../ui';
import { ART_TEXT, AuswahlMenue, figurDarstellung, stelleAnker, zitatAnker } from '../akte/gemeinsam';
import { BoegenStil } from './BoegenStil';
import { StufenBearbeitung } from './BoegenStufe';

const SPALTE_NAME = 200;

/** Fokus nach einem Neuzeichnen auf eine Stufe setzen (die Knöpfe werden beim Umsortieren neu eingehängt). */
export function fokussiereStufe(figur: Id, stufe: Id) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-fb-stufe="${CSS.escape(`${figur}/${stufe}`)}"]`);
    el?.focus();
  });
}

export function FigurenBoegen({ daten, figur }: { daten: ProjektDaten; figur?: Id }) {
  const index = useStore((s) => s.index);
  const vergleich = useStore((s) => s.figurenbogen.vergleich);
  const setzeVergleich = useStore((s) => s.figurenbogen.setzeVergleich);
  const gewaehlt = useStore((s) => s.figurenbogen.gewaehlteStufe);
  const waehleStufe = useStore((s) => s.figurenbogen.waehleStufe);
  const [neu, setNeu] = useState<string | null>(null);

  const figuren = gezeigteFiguren(daten, figur, vergleich);
  const kapitel = daten.projekt.kapitel;

  // Auswahl verwerfen, wenn die Stufe oder ihre Figur nicht mehr gezeigt wird
  const gewaehlteStufe = gewaehlt && figuren.includes(gewaehlt.figur) ? bogenVon(daten.boegen, gewaehlt.figur).stufen.find((s) => s.id === gewaehlt.stufe) : undefined;
  useEffect(() => {
    if (gewaehlt && !gewaehlteStufe) waehleStufe(null);
  }, [gewaehlt, gewaehlteStufe, waehleStufe]);

  const mitBogen = (daten.boegen ?? []).filter((b) => b.stufen.length > 0 && daten.figuren[b.figur]).map((b) => b.figur);
  const frei = Object.values(daten.figuren)
    .filter((f) => !figuren.includes(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const fehlendMitBogen = mitBogen.filter((id) => !figuren.includes(id));

  if (Object.keys(daten.figuren).length === 0) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <LeerZustand titel="Noch keine Figuren">Lege links eine Figur an. Danach kannst du hier ihre Entwicklung durchs Buch planen.</LeerZustand>
      </div>
    );
  }
  if (kapitel.length === 0) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <LeerZustand titel="Noch keine Kapitel">Ein Bogen läuft durch die Kapitel des Buchs. Lege zuerst Kapitel an.</LeerZustand>
      </div>
    );
  }

  return (
    <div className="fb-seite" aria-label="Figuren-Bögen">
      <BoegenStil />
      <div className="fb-kopf">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="fb-titel">Bögen</h1>
          <span className="fb-leise">
            Deine geplanten Stufen je Kapitel oder Akt, darunter die Auftritte im Text. Klick auf einen Punkt springt zur Stelle.
          </span>
        </div>
        <div className="fb-reihe">
          <AuswahlMenue
            knopf="+ Figur vergleichen"
            leer="Alle Figuren sind schon zu sehen"
            optionen={frei.map((f) => ({ wert: f.id, label: f.name, suche: f.aliase.join(' ') }))}
            onWaehle={(id) => setzeVergleich([...vergleich, id])}
          />
          {fehlendMitBogen.length > 0 && (
            <Button klein variante="text" onClick={() => setzeVergleich([...vergleich, ...fehlendMitBogen])}>
              Alle Bögen zeigen
            </Button>
          )}
          {vergleich.some((v) => v !== figur) && (
            <Button klein variante="leise" onClick={() => setzeVergleich([])}>
              Vergleich leeren
            </Button>
          )}
        </div>
      </div>

      {!indexBereit(index) && <span className="fb-leise">Der Text wird noch ausgewertet – die Auftritte erscheinen gleich.</span>}

      {figuren.length === 0 ? (
        <LeerZustand titel="Keine Figur gewählt">Wähle links eine Figur oder füge oben eine zum Vergleich hinzu.</LeerZustand>
      ) : (
        <Raster
          daten={daten}
          index={index}
          figuren={figuren}
          hauptfigur={figur}
          gewaehlt={gewaehlt}
          onNeu={(f, s) => {
            setNeu(`${f}/${s}`);
          }}
        />
      )}

      <Legende />

      {gewaehlt && gewaehlteStufe && (
        <StufenBearbeitung
          key={`${gewaehlt.figur}/${gewaehlt.stufe}`}
          daten={daten}
          index={index}
          figur={gewaehlt.figur}
          stufe={gewaehlteStufe}
          fokusTitel={neu === `${gewaehlt.figur}/${gewaehlt.stufe}`}
          onSchliessen={() => {
            waehleStufe(null);
            fokussiereStufe(gewaehlt.figur, gewaehlt.stufe);
          }}
        />
      )}
    </div>
  );
}

function Legende() {
  return (
    <div className="fb-legende" aria-label="Legende">
      <span>
        <span className="fb-punkt" aria-hidden /> tritt auf
      </span>
      <span>
        <span className="fb-punkt fb-punkt--nachricht" aria-hidden /> per Nachricht
      </span>
      <span>
        <span className="fb-punkt fb-punkt--erwaehnt" aria-hidden /> nur erwähnt
      </span>
      <span>
        <span className="fb-punkt fb-punkt--unbestimmt" aria-hidden /> im Text, Art offen
      </span>
      <span>
        <span className="fb-beleg-marke" style={{ position: 'static' }} aria-hidden>
          1
        </span>{' '}
        Belege deiner Stufen
      </span>
      <span>Stufen: ⌥← ⌥→ verschieben · Entf löschen</span>
    </div>
  );
}

interface RasterProps {
  daten: ProjektDaten;
  index: Index;
  figuren: Id[];
  hauptfigur?: Id;
  gewaehlt: { figur: Id; stufe: Id } | null;
  onNeu(figur: Id, stufe: Id): void;
}

function Raster({ daten, index, figuren, hauptfigur, gewaehlt, onNeu }: RasterProps) {
  const kapitel = daten.projekt.kapitel;
  const gruppen = aktGruppen(daten);
  const aktAnfang = new Set(gruppen.map((g) => g.von).filter((v) => v > 0));
  const bereit = indexBereit(index);

  const zeilen = useMemo(() => {
    let zeile = 3;
    return figuren.map((id) => {
      const bogen = bogenVon(daten.boegen, id);
      const spuren = stufenSpuren(daten, bogen.stufen);
      const start = zeile;
      zeile += spuren.spuren + 1;
      return { id, bogen, spuren, start };
    });
  }, [figuren, daten]);

  return (
    <div className="fb-raster-huelle">
      <div
        className="fb-raster"
        style={{ gridTemplateColumns: `${SPALTE_NAME}px repeat(${kapitel.length}, minmax(0, 1fr))`, minWidth: SPALTE_NAME + kapitel.length * 56 }}
        role="group"
        aria-label="Bögen der Figuren über die Kapitel"
      >
        <div className="fb-ecke" style={{ gridRow: '1 / span 2', gridColumn: 1 }} />
        {gruppen.map((g) => (
          <div key={`${g.von}`} className="fb-akt" style={{ gridRow: 1, gridColumn: `${g.von + 2} / ${g.bis + 3}`, borderLeft: g.von === 0 ? 0 : undefined }} title={g.titel}>
            {g.titel}
          </div>
        ))}
        {kapitel.map((k, i) => (
          <div
            key={k}
            className={`fb-kapitelkopf${aktAnfang.has(i) ? ' fb-kapitelkopf--aktgrenze' : ''}`}
            style={{ gridRow: 2, gridColumn: i + 2 }}
            title={`Kap. ${i + 1} „${kapitelTitel(daten, k)}“`}
          >
            {i + 1}
          </div>
        ))}
        {zeilen.map((z) => (
          <FigurBogen
            key={z.id}
            daten={daten}
            index={index}
            figur={z.id}
            start={z.start}
            plaetze={z.spuren.plaetze}
            spuren={z.spuren.spuren}
            anzahlStufen={z.bogen.stufen.length}
            ohnePlatz={z.bogen.stufen.length - z.spuren.plaetze.length}
            haupt={z.id === hauptfigur}
            gewaehlt={gewaehlt?.figur === z.id ? gewaehlt.stufe : null}
            aktAnfang={aktAnfang}
            bereit={bereit}
            onNeu={onNeu}
          />
        ))}
      </div>
    </div>
  );
}

interface FigurBogenProps {
  daten: ProjektDaten;
  index: Index;
  figur: Id;
  start: number;
  plaetze: ReturnType<typeof stufenSpuren>['plaetze'];
  spuren: number;
  anzahlStufen: number;
  ohnePlatz: number;
  haupt: boolean;
  gewaehlt: Id | null;
  aktAnfang: Set<number>;
  bereit: boolean;
  onNeu(figur: Id, stufe: Id): void;
}

function FigurBogen({ daten, index, figur, start, plaetze, spuren, anzahlStufen, ohnePlatz, haupt, gewaehlt, aktAnfang, bereit, onNeu }: FigurBogenProps) {
  const fb = useStore((s) => s.figurenbogen);
  const waehle = useStore((s) => s.waehle);
  const markiere = useStore((s) => s.markiere);
  const f = daten.figuren[figur]!;
  const d = figurDarstellung(f, daten);
  const farbe = d.unsicher ?? d.farbe;
  const kapitel = daten.projekt.kapitel;
  const auftritte = useMemo(() => auftritteJeKapitel(index.erwaehnungen, figur), [index.erwaehnungen, figur]);
  const bogen = bogenVon(daten.boegen, figur);
  const zeileAuftritte = start + spuren;
  const stil = { '--fb-farbe': farbe } as CSSProperties;

  // Belege je Kapitel (aus allen Stufen)
  const belege = new Map<Id, { stufe: BogenStufe; exakt: string; anker: BogenStufe['belege'][number] }[]>();
  for (const s of bogen.stufen)
    for (const b of s.belege) {
      const l = belege.get(b.kapitel) ?? [];
      l.push({ stufe: s, exakt: b.exakt, anker: b });
      belege.set(b.kapitel, l);
    }

  const mitAuftritt = kapitel.map((k, i) => (auftritte.has(k) ? i : -1)).filter((i) => i >= 0);
  const linie = mitAuftritt.length > 1 ? { von: mitAuftritt[0]!, bis: mitAuftritt[mitAuftritt.length - 1]! } : null;

  const neueStufe = async () => {
    const id = await fb.stufeAnlegen(figur, { titel: 'Neue Stufe', kapitel: naechstesKapitel(daten, bogen) });
    onNeu(figur, id);
  };

  const tasten = async (e: KeyboardEvent<HTMLButtonElement>, s: BogenStufe) => {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey) {
      e.preventDefault();
      const neu = stufeVerschieben(daten, s, e.key === 'ArrowLeft' ? -1 : 1);
      if (neu) {
        await fb.stufeSpeichern(figur, neu);
        fokussiereStufe(figur, s.id);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const knoepfe = [...document.querySelectorAll<HTMLElement>(`[data-fb-figur="${CSS.escape(figur)}"]`)];
      const ziel = knoepfe[knoepfe.indexOf(e.currentTarget) + (e.key === 'ArrowLeft' ? -1 : 1)];
      ziel?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (await bestaetigen(`Stufe „${s.titel}“ aus dem Bogen von ${f.name} löschen?`, { knopf: 'Löschen' })) await fb.stufeEntfernen(figur, s.id);
    } else if (e.key === 'Escape' && gewaehlt === s.id) {
      e.preventDefault();
      fb.waehleStufe(null);
    }
  };

  const springe = (k: Id, a: KapitelAuftritt) => markiere({ kapitel: k, anker: stelleAnker(daten, k, a.erste.start, a.erste.ende, a.erste.treffer) });

  return (
    <>
      <div className="fb-name" style={{ gridRow: `${start} / span ${spuren + 1}`, gridColumn: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Avatar name={f.name} farbe={d.farbe} groesse={26} unsicher={d.unsicher} textfarbe={d.textfarbe} />
          <button
            type="button"
            className="pl-link"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
            title="Figurenkarte öffnen"
            onClick={() => {
              waehle({ figur });
              fb.setzeFigurenAnsicht('karte');
            }}
          >
            {f.name}
          </button>
          {!haupt && (
            <button
              type="button"
              className="pl-zeile-weg"
              style={{ opacity: 1, marginLeft: 'auto' }}
              aria-label={`${f.name} aus dem Vergleich nehmen`}
              title="Aus dem Vergleich nehmen"
              onClick={() => fb.setzeVergleich(fb.vergleich.filter((v) => v !== figur))}
            >
              ×
            </button>
          )}
        </span>
        <span className="fb-leise">
          {anzahlStufen === 1 ? '1 Stufe' : `${anzahlStufen} Stufen`} · {bereit ? `${auftritte.size} Kap. im Text` : '…'}
          {ohnePlatz > 0 && ` · ${ohnePlatz} ohne Kapitel`}
        </span>
        <Button klein variante="leise" onClick={() => void neueStufe()} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
          + Stufe
        </Button>
      </div>

      {Array.from({ length: spuren }, (_, spur) => (
        <div key={`hg-${spur}`} className="fb-stufenzelle" style={{ gridRow: start + spur, gridColumn: `2 / ${kapitel.length + 2}` }} aria-hidden />
      ))}
      {plaetze.length === 0 && (
        <div className="fb-stufenzelle" style={{ gridRow: start, gridColumn: `2 / ${kapitel.length + 2}` }}>
          <button type="button" className="fb-leerstufe" onClick={() => void neueStufe()}>
            Noch keine Stufen. + Erste Stufe planen, z. B. „im Lot“ → „ohne Schlaf“
          </button>
        </div>
      )}
      {plaetze.map(({ stufe: s, spanne, spur, giltBis }) => {
        const n = s.belege.length;
        const anteil = ((spanne.bis - spanne.von + 1) / (giltBis - spanne.von + 1)) * 100;
        const gilt = giltBis > spanne.bis ? ` · gilt bis Kap. ${giltBis + 1}` : '';
        const titel = `${s.titel} · ${stufenOrt(daten, s)}${gilt}${n ? ` · ${n === 1 ? '1 Beleg' : `${n} Belege`}` : ''}${s.notiz ? `\n${s.notiz}` : ''}`;
        return (
          <div key={s.id} className="fb-stufenzelle" style={{ gridRow: start + spur, gridColumn: `${spanne.von + 2} / ${giltBis + 3}`, ...stil, '--fb-anteil': `${anteil}%` } as CSSProperties}>
            <button
              type="button"
              className={`fb-stufe${s.kapitel ? '' : ' fb-stufe--akt'}`}
              data-fb-stufe={`${figur}/${s.id}`}
              data-fb-figur={figur}
              aria-pressed={gewaehlt === s.id}
              aria-label={`Stufe „${s.titel}“ von ${f.name}, ${stufenOrt(daten, s)}${n ? `, ${n} Belege` : ''}`}
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Delete"
              title={titel}
              onClick={() => fb.waehleStufe(gewaehlt === s.id ? null : { figur, stufe: s.id })}
              onKeyDown={(e) => void tasten(e, s)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titel}</span>
              {n > 0 && <span className="fb-stufe__zahl">{n}</span>}
            </button>
          </div>
        );
      })}

      {linie && (
        <div
          aria-hidden
          style={{ gridRow: zeileAuftritte, gridColumn: `${linie.von + 2} / ${linie.bis + 3}`, position: 'relative', pointerEvents: 'none', ...stil }}
        >
          <span
            className="fb-linie"
            style={{ left: `calc(100% / ${linie.bis - linie.von + 1} / 2)`, right: `calc(100% / ${linie.bis - linie.von + 1} / 2)` }}
          />
        </div>
      )}
      {kapitel.map((k, i) => {
        const a = auftritte.get(k);
        const b = belege.get(k);
        const ohneText = !daten.kapitel[k]?.text.trim();
        const kap = `Kap. ${i + 1} „${kapitelTitel(daten, k)}“`;
        return (
          <div key={`a-${k}`} className={`fb-zelle${aktAnfang.has(i) ? ' fb-aktgrenze' : ''}`} style={{ gridRow: zeileAuftritte, gridColumn: i + 2, ...stil }}>
            {ohneText && !a && <span className="fb-ohnetext" title={`${kap} · noch kein Text`} />}
            {a && (
              <button
                type="button"
                className={`fb-punkt fb-punkt--${a.art === 'auftritt' ? 'auftritt' : a.art}`}
                title={`${kap} · ${ART_TEXT[a.art]} · ${a.anzahl}× genannt – im Text zeigen`}
                aria-label={`${f.name} in ${kap}: ${ART_TEXT[a.art]}, ${a.anzahl}-mal genannt. Im Text zeigen`}
                onClick={() => springe(k, a)}
              />
            )}
            {b && (
              <button
                type="button"
                className="fb-beleg-marke"
                style={{ pointerEvents: 'auto', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 9, fontWeight: 700 }}
                title={b.map((x) => `${x.stufe.titel}: »${x.exakt}«`).join('\n')}
                aria-label={`${b.length === 1 ? '1 Beleg' : `${b.length} Belege`} in ${kap} – ersten Beleg im Text zeigen`}
                onClick={() => markiere({ kapitel: k, anker: b[0]!.anker.davor || b[0]!.anker.danach ? b[0]!.anker : zitatAnker(daten, k, b[0]!.exakt) })}
              >
                {b.length}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Für Tests: Figuren, die im Raster erscheinen (gewählte zuerst, dann der Vergleich). */
export function gezeigteFiguren(daten: ProjektDaten, figur: Id | undefined, vergleich: Id[]): Id[] {
  return (figur ? [figur, ...vergleich.filter((v) => v !== figur)] : vergleich).filter((id) => daten.figuren[id]);
}

