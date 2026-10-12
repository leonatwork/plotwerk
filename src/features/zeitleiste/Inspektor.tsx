/** Inspektor der Zeitleiste (G1): Zeitpunkt und Zustand der gewählten Karte festlegen; ohne Auswahl Beginn und Zustandsliste. */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Id, TextAnker, Zeitpunkt, ZeitSicherheit } from '@core/model/types';
import {
  belegAusZitat,
  belegGefunden,
  dauerText,
  einheitName,
  einheitNummer,
  erwarteterWochentag,
  erwartetesDatum,
  normalisiereUhrzeit,
  RELATIVE_ANGABEN,
  relativerZeitpunkt,
  SICHERHEIT_ERKLAERUNG,
  SICHERHEIT_FARBE,
  SICHERHEIT_NAME,
  TAGESZEIT_NAME,
  TAGESZEITEN,
  vorigeEinheitMitTag,
  WOCHENTAG_NAME,
  WOCHENTAGE,
  ZUSTAND_FARBEN,
  zeitleisteVon,
  zeitText,
  zustaendeImKapitel,
  zustandIn,
  zustandsartBenutzt,
  zustandsFarbe,
  type RelativeAngabe,
  type ZeitEinheit,
} from '@core/zeit/index';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Feld, Inspektor, Segment } from '../../ui';
import { klassen } from '../../ui/klassen';
import { einheitBeschriftung, farbe, vorschlaegeFuer, ZeitVorschlagKarte, ZustandVorschlagKarte, type ZeitDaten } from './gemeinsam';

const SICHERHEITEN: ZeitSicherheit[] = ['fest', 'ungefaehr', 'unklar'];

function Abschnitt({ titel, rechts, children, label }: { titel: string; rechts?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="zl-abschnitt" aria-label={label ?? titel}>
      <div className="zl-abschnitt__kopf">
        <span className="zl-label">{titel}</span>
        {rechts}
      </div>
      {children}
    </section>
  );
}

/** Eingabe, die erst beim Verlassen oder mit Enter gespeichert wird; Esc stellt den alten Wert her. */
function useEntwurf(wert: string) {
  const [entwurf, setEntwurf] = useState(wert);
  useEffect(() => setEntwurf(wert), [wert]);
  return [entwurf, setEntwurf] as const;
}

function tastenFuerEntwurf(alt: string, setzen: (s: string) => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      e.stopPropagation();
      setzen(alt);
      (e.target as HTMLInputElement).blur();
    }
  };
}

function ZahlFeld({ label, wert, onCommit, min, platzhalter }: { label: string; wert: number | undefined; onCommit(n: number | undefined): void; min?: number; platzhalter?: string }) {
  const alt = wert === undefined ? '' : String(wert);
  const [entwurf, setEntwurf] = useEntwurf(alt);
  const [fehler, setFehler] = useState(false);
  return (
    <Feld label={label}>
      {(id) => (
        <input
          id={id}
          className={klassen('zl-feld', fehler && 'zl-feld--fehler')}
          inputMode="numeric"
          value={entwurf}
          placeholder={platzhalter}
          aria-invalid={fehler || undefined}
          onChange={(e) => {
            setEntwurf(e.target.value);
            setFehler(false);
          }}
          onKeyDown={tastenFuerEntwurf(alt, setEntwurf)}
          onBlur={() => {
            const t = entwurf.trim();
            if (t === alt) return;
            if (!t) return onCommit(undefined);
            if (!/^[+-]?\d{1,4}$/.test(t) || (min !== undefined && Number(t) < min)) return setFehler(true);
            onCommit(Number(t));
          }}
        />
      )}
    </Feld>
  );
}

function UhrzeitFeld({ wert, onCommit }: { wert: string | undefined; onCommit(u: string | undefined): void }) {
  const alt = wert ?? '';
  const [entwurf, setEntwurf] = useEntwurf(alt);
  const [fehler, setFehler] = useState(false);
  return (
    <Feld label="Uhrzeit">
      {(id) => (
        <>
          <input
            id={id}
            className={klassen('zl-feld', fehler && 'zl-feld--fehler')}
            value={entwurf}
            placeholder="HH:MM"
            aria-invalid={fehler || undefined}
            onChange={(e) => {
              setEntwurf(e.target.value);
              setFehler(false);
            }}
            onKeyDown={tastenFuerEntwurf(alt, setEntwurf)}
            onBlur={() => {
              const t = entwurf.trim();
              if (t === alt) return;
              if (!t) return onCommit(undefined);
              const n = normalisiereUhrzeit(t);
              if (!n) return setFehler(true);
              setEntwurf(n);
              onCommit(n);
            }}
          />
          {fehler && <span className="zl-fehler">Bitte als HH:MM eingeben.</span>}
        </>
      )}
    </Feld>
  );
}

function NotizFeld({ label, wert, onCommit, platzhalter }: { label: string; wert: string; onCommit(s: string): void; platzhalter?: string }) {
  const [entwurf, setEntwurf] = useEntwurf(wert);
  return (
    <Feld label={label}>
      {(id) => (
        <textarea
          id={id}
          className="zl-feld zl-textbereich"
          rows={2}
          value={entwurf}
          placeholder={platzhalter}
          onChange={(e) => setEntwurf(e.target.value)}
          onBlur={() => entwurf !== wert && onCommit(entwurf)}
        />
      )}
    </Feld>
  );
}

/** Beleg: wörtliche Stelle aus dem Kapitel (E4), anzeigen, springen, setzen, entfernen. */
function BelegFeld({ kapitel, beleg, onSetzen, farbeToken }: { kapitel: Id; beleg: TextAnker | undefined; onSetzen(a: TextAnker | undefined): void; farbeToken?: string }) {
  const daten = useStore((s) => s.daten)!;
  const markiere = useStore((s) => s.markiere);
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  if (beleg) {
    const gefunden = belegGefunden(daten, beleg);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">Beleg im Text</span>
        {gefunden ? (
          <button type="button" className="zl-zitat zl-zitat--knopf" style={farbeToken ? farbe(farbeToken) : undefined} title="Im Text zeigen" onClick={() => markiere({ kapitel: beleg.kapitel, anker: beleg })}>
            „{beleg.exakt}“
          </button>
        ) : (
          <blockquote className="zl-zitat">
            „{beleg.exakt}“<span className="zl-zitat__ort">verwaist – die Stelle steht so nicht mehr im Text</span>
          </blockquote>
        )}
        <div className="zl-reihe">
          <button type="button" className="zl-link zl-link--leise" onClick={() => onSetzen(undefined)}>
            Beleg entfernen
          </button>
        </div>
      </div>
    );
  }
  const setzen = () => {
    const r = belegAusZitat(daten, kapitel, eingabe);
    if ('fehler' in r) return setFehler(r.fehler);
    setFehler(null);
    setEingabe('');
    onSetzen(r.anker);
  };
  return (
    <Feld label="Beleg im Text (wörtlich)">
      {(id) => (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id={id}
              className={klassen('zl-feld', fehler && 'zl-feld--fehler')}
              value={eingabe}
              placeholder="z. B. Kurz nach elf"
              onChange={(e) => {
                setEingabe(e.target.value);
                setFehler(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && eingabe.trim()) {
                  e.preventDefault();
                  setzen();
                }
              }}
            />
            <Button klein disabled={!eingabe.trim()} onClick={setzen}>
              Setzen
            </Button>
          </div>
          {fehler && <span className="zl-fehler">{fehler}</span>}
        </>
      )}
    </Feld>
  );
}

// ---------------------------------------------------------------------------
// Zeitpunkt
// ---------------------------------------------------------------------------

function ZeitpunktAbschnitt({ e, zd }: { e: ZeitEinheit; zd: ZeitDaten }) {
  const aendere = useStore((s) => s.zeit.aendereZeitpunkt);
  const setzeZeitpunkt = useStore((s) => s.zeit.setzeZeitpunkt);
  const setzeSzenen = useStore((s) => s.zeit.setzeSzenen);
  const waehle = useStore((s) => s.zeit.waehle);
  const z = e.eigen;
  const beginn = zd.beginn;
  const vorige = vorigeEinheitMitTag(zd.einheiten, e.schluessel);
  const [spaeter, setSpaeter] = useState('2');
  const teil = (t: Partial<Zeitpunkt>) => void aendere(e.kapitel, e.szene, t);
  const probe: Zeitpunkt = { ...(z ?? { sicherheit: 'fest' }), ...(z?.tag === undefined && e.tag !== undefined ? { tag: e.tag } : {}) };
  const erwartet = erwarteterWochentag({ ...probe, wochentag: undefined }, beginn);
  const erwartetDatum = z?.tag !== undefined ? erwartetesDatum(probe, beginn) : undefined;

  const relativ = (art: RelativeAngabe) => {
    const r = relativerZeitpunkt(vorige?.zeit, art, beginn, Number(spaeter) || 2);
    if (!r) return;
    teil({
      tag: r.tag,
      wochentag: r.wochentag,
      datum: r.datum,
      ...(r.tageszeit ? { tageszeit: r.tageszeit, uhrzeit: undefined } : {}),
      ...(z ? {} : { sicherheit: 'ungefaehr' as const }),
    });
  };

  return (
    <Abschnitt
      titel="Zeitpunkt"
      rechts={
        z ? (
          <button type="button" className="zl-link zl-link--leise" onClick={() => void setzeZeitpunkt(e.kapitel, e.szene, null)}>
            Zeitpunkt entfernen
          </button>
        ) : undefined
      }
    >
      <p className="zl-text" aria-live="polite">
        <b style={{ color: 'var(--ink)' }}>{zeitText(e.zeit, beginn)}</b>
        {z?.dauer ? ` · ${dauerText(z.dauer)}` : ''}
      </p>
      {!z && e.geerbt && (
        <p className="zl-leise">
          Übernimmt den Tag vom Kapitel. Eigene Angaben gelten nur für diese Szene.{' '}
          <button
            type="button"
            className="zl-link"
            onClick={() => {
              setzeSzenen(false);
              waehle(e.kapitel);
            }}
          >
            Kapitel-Zeitpunkt bearbeiten
          </button>
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">
          {vorige ? `Relativ zu ${einheitNummer(vorige)} (${zeitText(vorige.zeit, beginn, { kurz: true })})` : 'Relativ zur Stelle davor – dort ist noch kein Tag eingetragen'}
        </span>
        <div className="zl-reihe" role="group" aria-label="Relativ zur Stelle davor">
          {RELATIVE_ANGABEN.filter((a) => a.art !== 'spaeter').map((a) => (
            <button key={a.art} type="button" className="zl-knopf" disabled={!vorige} onClick={() => relativ(a.art)}>
              {a.label}
            </button>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              className="zl-feld"
              style={{ width: 46, height: 26 }}
              aria-label="Tage später"
              inputMode="numeric"
              value={spaeter}
              disabled={!vorige}
              onChange={(ev) => setSpaeter(ev.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={(ev) => ev.key === 'Enter' && relativ('spaeter')}
            />
            <button type="button" className="zl-knopf" disabled={!vorige} onClick={() => relativ('spaeter')}>
              Tage später
            </button>
          </span>
        </div>
      </div>

      <div className="zl-felder">
        <ZahlFeld label="Tag der Handlung" wert={z?.tag} platzhalter={e.tag !== undefined && z?.tag === undefined ? String(e.tag) : '1, 2, … · 0 = davor'} onCommit={(tag) => teil({ tag })} />
        <Feld label="Wochentag">
          {(id) => (
            <select id={id} className="zl-feld" value={z?.wochentag ?? ''} onChange={(ev) => teil({ wochentag: (ev.target.value || undefined) as Zeitpunkt['wochentag'] })}>
              <option value="">{erwartet ? `– (${WOCHENTAG_NAME[erwartet]})` : '–'}</option>
              {WOCHENTAGE.map((w) => (
                <option key={w} value={w}>
                  {WOCHENTAG_NAME[w]}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <Feld label="Tageszeit">
          {(id) => (
            <select id={id} className="zl-feld" value={z?.tageszeit ?? ''} onChange={(ev) => teil({ tageszeit: (ev.target.value || undefined) as Zeitpunkt['tageszeit'] })}>
              <option value="">–</option>
              {TAGESZEITEN.map((t) => (
                <option key={t} value={t}>
                  {TAGESZEIT_NAME[t]}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <UhrzeitFeld wert={z?.uhrzeit} onCommit={(uhrzeit) => teil({ uhrzeit })} />
        <Feld label="Datum">
          {(id) => (
            <input
              id={id}
              type="date"
              className="zl-feld"
              value={z?.datum ?? ''}
              title={erwartetDatum ? `Aus dem Beginn: ${erwartetDatum}` : undefined}
              onChange={(ev) => teil({ datum: ev.target.value || undefined })}
            />
          )}
        </Feld>
        <ZahlFeld label="Dauer (Minuten)" wert={z?.dauer} min={1} platzhalter="optional" onCommit={(dauer) => teil({ dauer })} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">Sicherheit</span>
        {z ? (
          <Segment<ZeitSicherheit>
            label="Sicherheit des Zeitpunkts"
            rolle="group"
            voll
            wert={z.sicherheit}
            onChange={(sicherheit) => teil({ sicherheit })}
            optionen={SICHERHEITEN.map((s) => ({ wert: s, label: SICHERHEIT_NAME[s], farbe: `var(--${SICHERHEIT_FARBE[s]})` }))}
          />
        ) : null}
        <span className="zl-leise">{z ? SICHERHEIT_ERKLAERUNG[z.sicherheit] : 'Trag zuerst eine Zeitangabe ein; was du einträgst, gilt als gesichert.'}</span>
      </div>

      <BelegFeld kapitel={e.kapitel} beleg={z?.beleg} onSetzen={(beleg) => teil({ beleg })} farbeToken={z ? SICHERHEIT_FARBE[z.sicherheit] : undefined} />
      <NotizFeld label="Notiz" wert={z?.notiz ?? ''} platzhalter="z. B. „nach der Bar“" onCommit={(notiz) => teil({ notiz: notiz.trim() || undefined })} />
    </Abschnitt>
  );
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

function NeueZustandsart({ onAngelegt }: { onAngelegt(id: Id): void }) {
  const anlegen = useStore((s) => s.zeit.zustandsartAnlegen);
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState('');
  const fertig = async () => {
    const id = await anlegen(name);
    setName('');
    setOffen(false);
    if (id) onAngelegt(id);
  };
  if (!offen)
    return (
      <button type="button" className="zl-knopf" style={{ borderStyle: 'dashed', borderColor: 'var(--dashed)', color: 'var(--ink-quiet)' }} onClick={() => setOffen(true)}>
        + Zustand
      </button>
    );
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input
        autoFocus
        className="zl-feld"
        style={{ height: 26, width: 130 }}
        aria-label="Neuer Zustand"
        placeholder="z. B. übermüdet"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void fertig();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOffen(false);
          }
        }}
      />
      <Button klein disabled={!name.trim()} onClick={() => void fertig()}>
        Anlegen
      </Button>
    </span>
  );
}

function FigurWahl({ figur }: { figur: Id | undefined }) {
  const daten = useStore((s) => s.daten)!;
  const setzeFigur = useStore((s) => s.zeit.setzeFigur);
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? a.name.localeCompare(b.name, 'de') : a.rolle === 'haupt' ? -1 : 1));
  return (
    <select className="zl-select" aria-label="Figur für die Zustandsspur" value={figur ?? ''} onChange={(e) => setzeFigur(e.target.value || null)}>
      {figuren.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

function ZustandAbschnitt({ e, zd }: { e: ZeitEinheit; zd: ZeitDaten }) {
  const daten = useStore((s) => s.daten)!;
  const setzeZustand = useStore((s) => s.zeit.setzeZustand);
  const figur = zd.figur;
  if (!figur)
    return (
      <Abschnitt titel="Zustand">
        <p className="zl-leise">Leg zuerst eine Figur an, um ihren Zustand zu verfolgen.</p>
      </Abschnitt>
    );
  const zl = zeitleisteVon(daten);
  const treffer = zustandIn(zl, figur, e.kapitel, e.szene);
  const eigen = treffer && !treffer.geerbt ? treffer.zustand : undefined;
  const szenenEintraege = !e.szene ? zustaendeImKapitel(daten, figur, e.kapitel).filter((t) => t.zustand.szene) : [];
  const name = daten.figuren[figur]?.name ?? figur;
  const setze = (zustand: Id | null, extra: { notiz?: string; beleg?: TextAnker } = {}) =>
    void setzeZustand({ figur, kapitel: e.kapitel, ...(e.szene ? { szene: e.szene } : {}), zustand, ...extra });
  const art = eigen ? zl.zustandsarten.find((a) => a.id === eigen.zustand) : undefined;

  return (
    <Abschnitt titel="Zustand" rechts={<FigurWahl figur={figur} />}>
      <div className="zl-reihe" role="group" aria-label={`Zustand von ${name}`}>
        {zl.zustandsarten.map((a) => {
          const an = eigen?.zustand === a.id;
          return (
            <button
              key={a.id}
              type="button"
              className="zl-knopf zl-knopf--zustand"
              aria-pressed={an}
              style={farbe(zustandsFarbe(a))}
              title={an ? `${a.name} entfernen` : `${name}: ${a.name}`}
              onClick={() => setze(an ? null : a.id)}
            >
              <span className="zl-zustand__punkt" aria-hidden="true" />
              {a.name}
            </button>
          );
        })}
        <NeueZustandsart onAngelegt={(id) => setze(id)} />
      </div>
      {treffer?.geerbt && (
        <p className="zl-leise">
          Vom Kapitel: <b>{treffer.art?.name ?? treffer.zustand.zustand}</b>. Ein Zustand hier gilt nur für diese Szene.
        </p>
      )}
      {!treffer && !szenenEintraege.length && <p className="zl-leise">Für {name} ist hier noch kein Zustand eingetragen.</p>}
      {szenenEintraege.length > 0 && (
        <ul className="zl-leise" style={{ margin: 0, paddingLeft: 16 }}>
          {szenenEintraege.map((t) => (
            <li key={t.zustand.id}>
              {einheitBeschriftung(daten, e.kapitel, t.zustand.szene)}: {t.art?.name ?? t.zustand.zustand}
            </li>
          ))}
        </ul>
      )}
      {eigen && (
        <>
          <BelegFeld kapitel={e.kapitel} beleg={eigen.beleg} farbeToken={zustandsFarbe(art)} onSetzen={(beleg) => setze(eigen.zustand, beleg ? { beleg } : { beleg: undefined })} />
          <NotizFeld label="Notiz zum Zustand" wert={eigen.notiz ?? ''} onCommit={(notiz) => setze(eigen.zustand, { notiz })} />
        </>
      )}
    </Abschnitt>
  );
}

// ---------------------------------------------------------------------------
// Einheit
// ---------------------------------------------------------------------------

function EinheitInspektor({ e, zd }: { e: ZeitEinheit; zd: ZeitDaten }) {
  const daten = useStore((s) => s.daten)!;
  const oeffne = useStore((s) => s.oeffne);
  const waehle = useStore((s) => s.zeit.waehle);
  const hinweise = zd.hinweise.get(e.schluessel) ?? [];
  const zeitV = vorschlaegeFuer(zd.zeitVorschlaege, e);
  const zustandV = zd.figur ? vorschlaegeFuer(zd.zustandVorschlaege.filter((v) => v.figur === zd.figur), e) : [];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="zl-kopflabel">{einheitNummer(e).toUpperCase()}</span>
        <button type="button" className="zl-link zl-link--leise" onClick={() => waehle(null)} aria-label="Auswahl aufheben (Esc)">
          Überblick
        </button>
      </div>
      <h2 className="zl-titel">{e.titel}</h2>
      <div className="zl-reihe" style={{ marginTop: -6 }}>
        {e.szene && <span className="zl-leise">aus „{e.kapitelTitel}“ ·</span>}
        <button type="button" className="zl-link" onClick={() => oeffne('schreiben', { kapitel: e.kapitel })}>
          Im Text öffnen
        </button>
        <span className="zl-leise">·</span>
        <button type="button" className="zl-link" onClick={() => oeffne('akte', { plan: e.kapitel })}>
          Kapitelplan
        </button>
      </div>

      {hinweise.length > 0 && (
        <Abschnitt titel={hinweise.length === 1 ? 'Zeit-Hinweis' : `${hinweise.length} Zeit-Hinweise`}>
          {hinweise.map((h) => (
            <div key={h.schluessel} className="zl-hinweis">
              <span className="zl-hinweis__titel">{h.titel}</span>
              <span>{h.erklaerung}</span>
              <div className="zl-reihe">
                <button type="button" className="zl-link" onClick={() => oeffne('hinweise', { hinweis: h.schluessel })}>
                  In den Hinweisen öffnen
                </button>
              </div>
            </div>
          ))}
        </Abschnitt>
      )}

      <ZeitpunktAbschnitt e={e} zd={zd} />

      {zeitV.length > 0 && (
        <Abschnitt titel={zeitV.length === 1 ? 'Vorschlag der KI' : `${zeitV.length} Vorschläge der KI`}>
          {zeitV.map((v) => (
            <ZeitVorschlagKarte key={v.schluessel} v={v} daten={daten} mitEinheit={zeitV.length > 1 || !!v.szene !== !!e.szene} />
          ))}
        </Abschnitt>
      )}

      <ZustandAbschnitt e={e} zd={zd} />

      {zustandV.length > 0 && (
        <Abschnitt titel="Zustand – Vorschlag der KI">
          {zustandV.map((v) => (
            <ZustandVorschlagKarte key={v.schluessel} v={v} daten={daten} mitEinheit={zustandV.length > 1} />
          ))}
        </Abschnitt>
      )}
      <span className="pw-sr" aria-live="polite">
        {einheitName(e)} gewählt
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Überblick (ohne Auswahl)
// ---------------------------------------------------------------------------

function ArtZeile({ id, index, anzahl }: { id: Id; index: number; anzahl: number }) {
  const daten = useStore((s) => s.daten)!;
  const aendern = useStore((s) => s.zeit.zustandsartAendern);
  const entfernen = useStore((s) => s.zeit.zustandsartEntfernen);
  const verschieben = useStore((s) => s.zeit.zustandsartVerschieben);
  const zl = zeitleisteVon(daten);
  const art = zl.zustandsarten.find((a) => a.id === id)!;
  const [name, setName] = useEntwurf(art.name);
  const benutzt = zustandsartBenutzt(zl, id);
  return (
    <div className="zl-art">
      <span className="zl-art__farbe" style={farbe(zustandsFarbe(art))}>
        <span />
        <select aria-label={`Farbe für „${art.name}“`} value={art.farbe} onChange={(e) => void aendern(id, { farbe: e.target.value })}>
          {ZUSTAND_FARBEN.some((f) => f.token === art.farbe) ? null : <option value={art.farbe}>{art.farbe}</option>}
          {ZUSTAND_FARBEN.map((f) => (
            <option key={f.token} value={f.token}>
              {f.name}
            </option>
          ))}
        </select>
      </span>
      <input
        className="zl-feld"
        aria-label={`Name von „${art.name}“`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={tastenFuerEntwurf(art.name, setName)}
        onBlur={() => (name.trim() && name !== art.name ? void aendern(id, { name }) : setName(art.name))}
      />
      <button type="button" className="zl-symbol" aria-label={`„${art.name}“ nach oben`} disabled={index === 0} onClick={() => void verschieben(id, -1)}>
        ↑
      </button>
      <button type="button" className="zl-symbol" aria-label={`„${art.name}“ nach unten`} disabled={index === anzahl - 1} onClick={() => void verschieben(id, 1)}>
        ↓
      </button>
      <button
        type="button"
        className="zl-symbol"
        aria-label={`„${art.name}“ entfernen`}
        title={benutzt ? `${benutzt}× eingetragen` : 'Entfernen'}
        onClick={async () => {
          if (benutzt && !(await bestaetigen(`„${art.name}“ ist ${benutzt}× eingetragen. Diese Einträge werden mit entfernt.`, { titel: 'Zustand entfernen?', knopf: 'Entfernen' }))) return;
          await entfernen(id);
        }}
      >
        ×
      </button>
    </div>
  );
}

function Ueberblick({ zd }: { zd: ZeitDaten }) {
  const daten = useStore((s) => s.daten)!;
  const setzeBeginn = useStore((s) => s.zeit.setzeBeginn);
  const setzeNotiz = useStore((s) => s.zeit.setzeNotiz);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const zl = zeitleisteVon(daten);
  const b = zl.beginn ?? {};
  const mitTag = zd.einheiten.filter((e) => e.tag !== undefined).length;
  const offen = zd.einheiten.length - mitTag;
  return (
    <>
      <span className="zl-kopflabel">ZEITLEISTE</span>
      <h2 className="zl-titel">Überblick</h2>
      <p className="zl-text" style={{ marginTop: -6 }}>
        {mitTag} von {zd.einheiten.length} Karten haben einen Tag{offen ? `, ${offen} stehen bei „Abstand unbekannt“` : ''}. Wähle eine Karte, um ihren Zeitpunkt
        festzulegen – mit ← und → wechselst du die Karte.
      </p>

      <Abschnitt titel="Beginn">
        <p className="zl-leise">Bezug für die Handlungstage. Daraus ergeben sich Wochentag und Datum jedes Tags; die Zeitprüfung meldet, was nicht passt.</p>
        <div className="zl-felder">
          <Feld label="Tag 1 ist ein">
            {(id) => (
              <select id={id} className="zl-feld" value={b.wochentag ?? ''} onChange={(e) => void setzeBeginn({ ...b, wochentag: (e.target.value || undefined) as never })}>
                <option value="">–</option>
                {WOCHENTAGE.map((w) => (
                  <option key={w} value={w}>
                    {WOCHENTAG_NAME[w]}
                  </option>
                ))}
              </select>
            )}
          </Feld>
          <Feld label="Datum von Tag 1">
            {(id) => <input id={id} type="date" className="zl-feld" value={b.datum ?? ''} onChange={(e) => void setzeBeginn({ ...b, datum: e.target.value || undefined })} />}
          </Feld>
        </div>
      </Abschnitt>

      <Abschnitt titel="Zustände" label="Zustandsliste">
        <p className="zl-leise">Frei erweiterbar; die Farbe erscheint in der Zustandsspur.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zl.zustandsarten.map((a, i) => (
            <ArtZeile key={a.id} id={a.id} index={i} anzahl={zl.zustandsarten.length} />
          ))}
        </div>
        <div className="zl-reihe">
          <NeueZustandsart onAngelegt={() => undefined} />
        </div>
      </Abschnitt>

      <Abschnitt titel="Vorschläge der KI">
        <p className="zl-leise">
          {zd.zeitVorschlaege.length + zd.zustandVorschlaege.length === 0
            ? 'Keine offenen Vorschläge. Die KI schlägt Zeitpunkte und Zustände mit wörtlichem Beleg vor – du entscheidest einzeln.'
            : `${zd.zeitVorschlaege.length} Zeitpunkt${zd.zeitVorschlaege.length === 1 ? '' : 'e'} und ${zd.zustandVorschlaege.length} Zustand${zd.zustandVorschlaege.length === 1 ? '' : 'e'} warten auf deine Entscheidung.`}
        </p>
        <div className="zl-reihe">
          <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
            {zd.zeitVorschlaege.length + zd.zustandVorschlaege.length ? 'Vorschläge ansehen …' : 'Zeitpunkte vorschlagen …'}
          </Button>
        </div>
      </Abschnitt>

      <Abschnitt titel="Notiz">
        <NotizFeld label="Notiz zur Zeitleiste" wert={zl.notiz} onCommit={(n) => void setzeNotiz(n)} />
      </Abschnitt>
    </>
  );
}

/** Rechte Spalte: gewählte Karte oder Überblick. */
export function ZeitInspektor({ zd }: { zd: ZeitDaten }) {
  const auswahl = useStore((s) => s.zeit.auswahl);
  // Auswahl einer Szene bei Kapitel-Ansicht → Kapitelkarte (und umgekehrt die erste Szene)
  const e =
    zd.folge.find((x) => x.schluessel === auswahl) ??
    (auswahl ? zd.folge.find((x) => x.kapitel === (auswahl.includes('#') ? auswahl.slice(0, auswahl.indexOf('#')) : auswahl)) : undefined);
  return (
    <Inspektor breite={350} hintergrund="weiss" label={e ? 'Zeitpunkt und Zustand' : 'Zeitleiste'} className="zl-insp">
      {e ? <EinheitInspektor key={e.schluessel} e={e} zd={zd} /> : <Ueberblick zd={zd} />}
    </Inspektor>
  );
}
