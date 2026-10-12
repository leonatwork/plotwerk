/** F-02–F-05: Figurenkarte nach docs/design/screens/Figur.dc.html. */
import { useId, useState, type CSSProperties } from 'react';
import { bogenVon, sortiereStufen, stufeImKapitel, stufenOrt, stufenSpanne } from '@core/figuren/index';
import type { Index } from '@core/index/index';
import { hauptfigur } from '@core/zeit/zustand';
import type { Beziehung, BeziehungsKategorie, Erwaehnung, Figur, FigurRolle, Hinweis, Id, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { indexBereit, notizAbsaetze } from '../../state/slices/planung';
import { Avatar, bestaetigen as rueckfrage, Button, RealitaetsUmschalter, Segment, StrangPunkt } from '../../ui';
import {
  Abschnitt,
  ART_TEXT,
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

const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '8px 12px', alignItems: 'center', fontSize: 13 };
const leise: CSSProperties = { color: 'var(--ink-quiet)' };
const eingabe: CSSProperties = { width: '100%' };

const HINWEIS_TYP: Record<Hinweis['typ'], string> = {
  pruefen: 'Prüfen',
  schreibweise: 'Schreibweise',
  offener_faden: 'Offener Faden',
  unbekannt: 'Unbekannt',
  struktur: 'Struktur',
  zeitleiste: 'Zeitleiste',
  sprache: 'Sprache',
};

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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Avatar name={f.name} farbe={d.farbe} groesse={64} unsicher={d.unsicher} textfarbe={d.textfarbe} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, display: 'flex' }}>
          <EntwurfFeld
            key={`${f.id}-name`}
            className="pl-still"
            aria-label="Name"
            style={{ fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 40, lineHeight: 1, width: 'calc(100% + 6px)', height: 42, padding: '0 5px', margin: '-1px 0 -1px -6px' }}
            wert={f.name}
            onSpeichern={(name) => name.trim() && void aendern(f.id, { name: name.trim() })}
          />
        </h1>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-quiet)' }}>
          <EntwurfFeld
            key={`${f.id}-kurz`}
            className="pl-still"
            aria-label="Kurzbeschreibung"
            placeholder="Kurzbeschreibung"
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
        title={ersteStelle ? undefined : 'Die Figur kommt im Text noch nicht vor'}
        onClick={() => ersteStelle && markiere({ kapitel: ersteStelle.kapitel, anker: stelleAnker(daten, ersteStelle.kapitel, ersteStelle.start, ersteStelle.ende, ersteStelle.treffer) })}
      >
        Im Text zeigen
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

  return (
    <Abschnitt titel="Aus dem Text" rechts={<span style={{ fontSize: 11, ...leise }}>nur lesen · mit Belegstelle</span>} hintergrund="var(--inspector)" label="Aus dem Text">
      {!indexBereit(index) ? (
        <span style={{ fontSize: 13, ...leise }}>Der Text wird noch ausgewertet …</span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 54px', gap: '8px 12px', fontSize: 13, alignItems: 'baseline' }}>
          {kapitel.length === 0 && (
            <>
              <span style={leise}>Im Text</span>
              <span style={{ color: 'var(--accent-dark)' }}>noch nicht im Text</span>
              <span />
            </>
          )}
          {genannt.length > 0 && (
            <>
              <span style={leise}>Genannt als</span>
              <span>{genannt.map((g) => `»${g}«`).join(', ')}</span>
              <span />
            </>
          )}
          {kapitel.map((k, i) => {
            const e = nachKapitel.get(k)![0]!;
            const [davor, treffer, danach] = ausschnitt(daten, k, e.start, e.ende, e.treffer);
            const anzahl = nachKapitel.get(k)!.length;
            return (
              <div key={k} style={{ display: 'contents' }}>
                <span style={leise}>{i === 0 ? 'Erstes Vorkommen' : ART_TEXT[arten.get(k) ?? 'unbestimmt']}</span>
                <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }} onClick={() => zeigen(e)} title="Stelle im Text zeigen">
                  »{davor}
                  <b>{treffer}</b>
                  {danach}«{anzahl > 1 && <span style={leise}> · {anzahl}×</span>}
                </button>
                <LinkKnopf onClick={() => zeigen(e)}>Kap. {nr(k)}</LinkKnopf>
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
  return (
    <div className="pl-zeile" style={{ display: 'contents' }}>
      {umbenennen ? (
        <EntwurfFeld
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="pl-eingabe"
          style={{ height: 28, fontSize: 12 }}
          aria-label="Feldname"
          wert={feld}
          onSpeichern={(neu) => void p.planFeldUmbenennen(f.id, feld, neu)}
          onBlur={() => setUmbenennen(null)}
        />
      ) : (
        <label htmlFor={id} style={{ ...leise, overflow: 'hidden', textOverflow: 'ellipsis' }} onDoubleClick={() => setUmbenennen(feld)} title="Doppelklick zum Umbenennen">
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
          <button type="button" className="pl-zeile-weg" style={{ opacity: 1 }} aria-label={`${feld} umbenennen`} title="Umbenennen" onClick={() => setUmbenennen(feld)}>
            ✎
          </button>
          <button
            type="button"
            className="pl-zeile-weg"
            style={{ opacity: 1 }}
            aria-label={`Feld ${feld} löschen`}
            title="Feld löschen"
            onClick={async () => (!f.plan[feld] || (await rueckfrage(`Feld „${feld}“ mit Inhalt löschen?`, { knopf: 'Löschen' }))) && void p.planFeldEntfernen(f.id, feld)}
          >
            ×
          </button>
        </span>
      </span>
    </div>
  );
}

function DeinePlanung({ f, daten }: { f: Figur; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const oeffne = useStore((s) => s.oeffne);
  const [umbenennen, setUmbenennen] = useState<string | null>(null);
  const uid = useId();
  const gruppen = Object.values(daten.gruppen).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <Abschnitt titel="Deine Planung" rechts={<span style={{ fontSize: 11, ...leise }}>frei bearbeitbar</span>} label="Deine Planung">
      <div style={grid2}>
        <span style={leise}>Existenz</span>
        <RealitaetsUmschalter variante="segment" label="Existenz" wert={f.existenz} onChange={(existenz) => void p.figurAendern(f.id, { existenz })} />
        <span style={leise}>Rolle</span>
        <Segment<FigurRolle>
          rolle="group"
          label="Rolle"
          voll
          wert={f.rolle}
          onChange={(rolle) => void p.figurAendern(f.id, { rolle })}
          optionen={[
            { wert: 'haupt', label: 'Hauptfigur' },
            { wert: 'neben', label: 'Nebenfigur' },
          ]}
        />
        <label htmlFor={`${uid}-aliase`} style={leise} title="Weitere Namen, unter denen die Figur im Text erkannt wird">
          Auch genannt
        </label>
        <EntwurfFeld
          key={`${f.id}-aliase`}
          id={`${uid}-aliase`}
          className="pl-eingabe"
          style={eingabe}
          placeholder="Aliase, mit Komma getrennt"
          wert={f.aliase.join(', ')}
          onSpeichern={(t) =>
            void p.figurAendern(f.id, {
              aliase: [...new Set(t.split(',').map((x) => x.trim()).filter(Boolean))],
            })
          }
        />
        <label htmlFor={`${uid}-gruppe`} style={leise}>
          Gruppe
        </label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <select
            id={`${uid}-gruppe`}
            className="pl-select"
            style={{ flex: 1 }}
            value={f.gruppe ?? ''}
            onChange={(e) => void p.figurAendern(f.id, { gruppe: e.target.value || null })}
          >
            <option value="">keine</option>
            {gruppen.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {f.gruppe && daten.gruppen[f.gruppe] && (
            <LinkKnopf fett onClick={() => oeffne('beziehungen', { gruppe: f.gruppe!, figur: f.id })}>
              im Netz
            </LinkKnopf>
          )}
        </span>
        {Object.keys(f.plan).map((feld) => (
          <FeldZeile key={feld} f={f} feld={feld} umbenennen={umbenennen === feld} setUmbenennen={setUmbenennen} />
        ))}
      </div>
      <button
        type="button"
        className="pl-link"
        style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', fontWeight: 600 }}
        onClick={() => void p.planFeldHinzufuegen(f.id, 'Neues Feld').then((name) => setUmbenennen(name))}
      >
        + Eigenes Feld
      </button>
    </Abschnitt>
  );
}

function Auftritte({ daten, nachKapitel, farbe }: { daten: ProjektDaten; nachKapitel: Map<Id, Erwaehnung[]>; farbe: string }) {
  const markiere = useStore((s) => s.markiere);
  const arten = artJeKapitel([...nachKapitel.values()].flat());
  const reihenfolge = daten.projekt.kapitel;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Auftritte">
      <strong style={{ fontSize: 14 }}>Auftritte</strong>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, reihenfolge.length)}, minmax(0, 1fr))`, gap: 4 }}>
        {reihenfolge.map((k, i) => {
          const art = arten.get(k);
          const ohneText = !daten.kapitel[k]?.text.trim();
          const titel = `Kap. ${i + 1} ${daten.plaene[k]?.titel ?? ''} · ${art ? ART_TEXT[art] : ohneText ? 'noch kein Text' : '–'}`;
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
      <span style={{ fontSize: 12, ...leise }}>Gefüllt: tritt auf · umrandet: nur per Nachricht · gestrichelt: nur erwähnt · hell: im Text, Art noch offen</span>
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
  const zuBoegen = (stufe?: Id) => {
    oeffne('figuren', { figur: f.id });
    waehleStufe(stufe ? { figur: f.id, stufe } : null);
    setzeFigurenAnsicht('boegen');
  };
  return (
    <Abschnitt
      titel="Bogen"
      rechts={
        <LinkKnopf fett onClick={() => zuBoegen()}>
          Bögen öffnen
        </LinkKnopf>
      }
      label="Bogen"
    >
      {stufen.length === 0 ? (
        <span style={{ fontSize: 13, ...leise }}>
          Noch keine Entwicklungsstufen geplant.{' '}
          <LinkKnopf fett style={{ fontSize: 13 }} onClick={() => zuBoegen()}>
            Bogen anlegen
          </LinkKnopf>
        </span>
      ) : (
        <>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }} aria-label={`Bogen von ${f.name}`}>
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
                    title={`${s.titel} · ${stufenOrt(daten, s)}${s.notiz ? `\n${s.notiz}` : ''} – im Tab „Bögen“ öffnen`}
                    onClick={() => zuBoegen(s.id)}
                  >
                    {s.titel}
                  </button>
                  {ist && (
                    <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
                      aktuell
                    </span>
                  )}
                  {n > 0 && <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap' }}>{n === 1 ? '1 Beleg' : `${n} Belege`}</span>}
                  <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap', minWidth: 44, textAlign: 'right' }}>{stufenOrt(daten, s)}</span>
                </li>
              );
            })}
          </ol>
          <span style={{ fontSize: 11, ...leise }}>
            {kapitel ? (aktuell ? `Aktuell: die Stufe, die in Kap. ${nr} gilt.` : `In Kap. ${nr} ist noch keine Stufe erreicht.`) : 'Aktuell: die letzte geplante Stufe.'} Klick
            öffnet die Stufe im Tab „Bögen“.
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
  const hinzufuegen = () => {
    if (!neu.trim()) return;
    void p.figurNotizHinzufuegen(f.id, neu);
    setNeu('');
  };
  return (
    <Abschnitt titel="Notizen" label="Notizen">
      {anmerkungen.map((a) => (
        <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, background: 'var(--accent-flaeche)', fontSize: 13, lineHeight: 1.45 }}>
          <span style={{ whiteSpace: 'pre-wrap' }}>
            <VerweisText text={a.notiz} />
          </span>
          <LinkKnopf onClick={() => markiere({ kapitel: a.anker.kapitel, anker: a.anker })}>
            angeheftet an Kap. {nr(a.anker.kapitel)} · »{a.anker.exakt}«
          </LinkKnopf>
        </div>
      ))}
      {eigene.map((t, i) => (
        <div
          key={`${i}-${t.slice(0, 12)}`}
          className="pl-zeile"
          style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: 'var(--inspector)', fontSize: 13, lineHeight: 1.45 }}
        >
          <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>
            <VerweisText text={t} />
          </span>
          <button type="button" className="pl-zeile-weg" aria-label="Notiz löschen" onClick={async () => (await rueckfrage('Notiz löschen?', { knopf: 'Löschen' })) && void p.figurNotizEntfernen(f.id, i)}>
            ×
          </button>
        </div>
      ))}
      <label htmlFor={`${uid}-notiz`} style={{ fontSize: 12, ...leise }}>
        Neue Notiz
      </label>
      <VerweisFeld
        id={`${uid}-notiz`}
        feldKlasse="pl-bereich"
        feldStil={{ lineHeight: 'normal' }}
        zeilen={3}
        label="Neue Notiz"
        placeholder="Idee, Frage, Detail … mit [[ verlinken"
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
          <span style={{ fontSize: 11, ...leise }}>⌘↩ speichert</span>
          <Button klein variante="primaer" onClick={hinzufuegen}>
            Notiz speichern
          </Button>
        </span>
      )}
    </Abschnitt>
  );
}

function Wahrheit({ f }: { f: Figur }) {
  const p = useStore((s) => s.planung);
  const uid = useId();
  return (
    <Abschnitt
      titel={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSchloss />
          Wahrheit hinter den Kulissen
        </span>
      }
      label="Wahrheit hinter den Kulissen"
    >
      <span style={{ fontSize: 11, marginTop: -6, ...leise }}>Nur für dich – geht nie an die KI.</span>
      <EntwurfBereich
        key={`${f.id}-wahrheit`}
        id={`${uid}-wahrheit`}
        aria-label="Wahrheit hinter den Kulissen"
        className="pl-bereich"
        autoHoehe
        rows={3}
        placeholder="Was wirklich hinter der Figur steckt – erscheint nie im Text und in keiner Analyse."
        verweise={{ typ: 'figur', id: f.id }}
        wert={f.wahrheit}
        onSpeichern={(wahrheit) => void p.figurAendern(f.id, { wahrheit })}
      />
    </Abschnitt>
  );
}

const KATEGORIE_TEXT: Record<BeziehungsKategorie, string> = { arbeit: 'Arbeit', dates: 'Dates', sonstige: 'Sonstige' };

function Beziehungen({ f, daten }: { f: Figur; daten: ProjektDaten }) {
  const p = useStore((s) => s.planung);
  const oeffne = useStore((s) => s.oeffne);
  const [form, setForm] = useState<{ zu: Id; art: string; kategorie: BeziehungsKategorie; abKapitel: Id } | null>(null);
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
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
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <Abschnitt
      titel="Beziehungen"
      rechts={
        <LinkKnopf fett onClick={() => oeffne('beziehungen', { figur: f.id })}>
          Netz öffnen
        </LinkKnopf>
      }
      label="Beziehungen"
    >
      {mitgliedIn.map((g) => (
        <span key={g.id} style={{ fontSize: 13 }}>
          Gruppe:{' '}
          <LinkKnopf fett style={{ fontSize: 13 }} onClick={() => oeffne('beziehungen', { gruppe: g.id, figur: f.id })}>
            {g.name}
          </LinkKnopf>
          {g.typ === 'antagonist' && <span style={leise}> · Antagonist</span>}
        </span>
      ))}
      {zeilen.length === 0 && mitgliedIn.length === 0 && <span style={{ fontSize: 13, ...leise }}>Noch keine Beziehungen.</span>}
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
              {z.b.unsicher && <span style={leise}> (unsicher)</span>}
            </span>
            {z.b.abKapitel && <span style={{ fontSize: 11, ...leise, whiteSpace: 'nowrap' }}>seit Kap. {nr(z.b.abKapitel)}</span>}
            <button
              type="button"
              className="pl-zeile-weg"
              aria-label="Beziehung entfernen"
              onClick={async () => (await rueckfrage(`Beziehung „${z.b.art}“ entfernen?`, { knopf: 'Entfernen' })) && void p.beziehungEntfernen(z.von, z.index)}
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
          <select className="pl-select" aria-label="Zu Figur" value={form.zu} onChange={(e) => setForm({ ...form, zu: e.target.value })}>
            {andere.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <input autoFocus className="pl-eingabe" aria-label="Art der Beziehung" placeholder="Art, z. B. Kollege, Verabredung" value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })} />
          <span style={{ display: 'flex', gap: 6 }}>
            <select className="pl-select" style={{ flex: 1 }} aria-label="Kategorie" value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value as BeziehungsKategorie })}>
              {(Object.keys(KATEGORIE_TEXT) as BeziehungsKategorie[]).map((k) => (
                <option key={k} value={k}>
                  {KATEGORIE_TEXT[k]}
                </option>
              ))}
            </select>
            <select className="pl-select" style={{ flex: 1 }} aria-label="Gilt ab Kapitel" value={form.abKapitel} onChange={(e) => setForm({ ...form, abKapitel: e.target.value })}>
              <option value="">von Anfang an</option>
              {daten.projekt.kapitel.map((k, i) => (
                <option key={k} value={k}>
                  ab Kap. {i + 1}
                </option>
              ))}
            </select>
          </span>
          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button klein onClick={() => setForm(null)}>
              Abbrechen
            </Button>
            <Button klein type="submit" variante="primaer" disabled={!form.art.trim()}>
              Hinzufügen
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
            + Beziehung
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
  if (liste.length === 0) return null;
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  return (
    <Abschnitt titel="Hinweise" rechts={<span style={{ fontSize: 11, ...leise }}>{liste.length} offen</span>} label="Hinweise zur Figur">
      {liste.map((h) => (
        <div key={h.schluessel} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--line-faint)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="pl-etikett" style={{ background: 'var(--chip)', color: 'var(--ink-soft)' }}>
              {HINWEIS_TYP[h.typ]}
            </span>
            {h.offen && (
              <span className="pl-etikett" style={{ background: 'var(--ruhend)', color: 'var(--warm-dark)' }}>
                offen
              </span>
            )}
            {h.plan?.figur === f.id && (
              <span className="pl-etikett" style={{ background: 'var(--chip-accent)', color: 'var(--accent-dark)' }}>
                {h.plan.feld ? `Plan · ${h.plan.feld}` : 'Plan'}
              </span>
            )}
          </span>
          <button type="button" className="pl-link" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }} onClick={() => oeffne('hinweise', { hinweis: h.schluessel })}>
            {h.titel}
          </button>
          {h.zitate.map((z, i) => (
            <LinkKnopf key={i} onClick={() => markiere({ kapitel: z.kapitel, anker: zitatAnker(daten, z.kapitel, z.text) })}>
              Kap. {nr(z.kapitel)} · »{z.text}«
            </LinkKnopf>
          ))}
        </div>
      ))}
    </Abschnitt>
  );
}

export function Figurenkarte({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const entfernen = useStore((s) => s.entferneFigur);
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
          <Auftritte daten={daten} nachKapitel={nachKapitel} farbe={farbe} />
          <Bogen f={f} daten={daten} farbe={farbe} />
        </div>
        <div style={{ flex: '0 1 330px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Notizen f={f} daten={daten} />
          <Wahrheit f={f} />
          <Beziehungen f={f} daten={daten} />
          <Hinweise f={f} daten={daten} index={index} />
          <RechercheLeiste ziel={{ typ: 'figur', id: f.id }} />
          <button
            type="button"
            className="pl-link"
            style={{ alignSelf: 'flex-start', color: 'var(--ink-quiet)' }}
            onClick={async () => (await rueckfrage(`Figur „${f.name}“ löschen? Vorher wird ein Schnappschuss angelegt.`, { knopf: 'Löschen' })) && void entfernen(f.id)}
          >
            Figur löschen
          </button>
        </div>
      </div>
    </div>
  );
}
