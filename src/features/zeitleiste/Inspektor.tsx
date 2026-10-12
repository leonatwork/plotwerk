/** Inspektor der Zeitleiste (G1): Zeitpunkt und Zustand der gewählten Karte festlegen; ohne Auswahl Beginn und Zustandsliste. */
import { nachRolle } from '@core/figuren/namen';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Id, TextAnker, Zeitpunkt, ZeitSicherheit } from '@core/model/types';
import {
  belegAusZitat,
  belegGefunden,
  dauerText,
  erwarteterWochentag,
  erwartetesDatum,
  normalisiereUhrzeit,
  RELATIVE_ANGABEN,
  relativerZeitpunkt,
  SICHERHEIT_FARBE,
  TAGESZEITEN,
  vorigeEinheitMitTag,
  WOCHENTAGE,
  ZUSTAND_FARBEN,
  zeitleisteVon,
  zustaendeImKapitel,
  zustandIn,
  zustandsartBenutzt,
  zustandsFarbe,
  type RelativeAngabe,
  type ZeitEinheit,
} from '@core/zeit/index';
import { f, texte, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { bestaetigen, Button, Feld, Inspektor, Segment } from '../../ui';
import { klassen } from '../../ui/klassen';
import { NurMit } from '../../app/NurMit';
import {
  belegFehlerText,
  datumKurz,
  einheitBeschriftung,
  einheitNameText,
  einheitNummerText,
  farbe,
  relativName,
  sicherheitErklaerung,
  sicherheitName,
  tageszeitName,
  vorschlaegeFuer,
  wochentagName,
  zeitBeschriftung,
  zitiert,
  ZeitVorschlagKarte,
  ZustandVorschlagKarte,
  type ZeitDaten,
} from './gemeinsam';

const SICHERHEITEN: ZeitSicherheit[] = ['fest', 'ungefaehr', 'unklar'];

/** Farbnamen der Zustandsarten nach Token (ZUSTAND_FARBEN in core) */
const FARB_SCHLUESSEL: Record<string, keyof ReturnType<typeof texte>['zeitleiste']['farben']> = {
  'real-gesichert': 'gruen',
  'strang-warm': 'ocker',
  'strang-violett': 'violett',
  'arbeit-line': 'hellblau',
  'strang-arbeit': 'blau',
  accent: 'rosa',
  'accent-dark': 'weinrot',
  'warm-dark': 'braun',
  'organisation-dashed': 'grau',
  ink: 'tinte',
};

function farbName(token: string, name: string): string {
  const k = FARB_SCHLUESSEL[token];
  return k ? texte().zeitleiste.farben[k] : name;
}

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
  const t = useTexte().zeitleiste.inspektor;
  return (
    <Feld label={t.uhrzeit}>
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
          {fehler && <span className="zl-fehler">{t.uhrzeitFehler}</span>}
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
  const tz = useTexte().zeitleiste;
  const t = tz.inspektor;
  if (beleg) {
    const gefunden = belegGefunden(daten, beleg);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">{t.belegImText}</span>
        {gefunden ? (
          <button
            type="button"
            className="zl-zitat zl-zitat--knopf"
            style={farbeToken ? farbe(farbeToken) : undefined}
            title={tz.vorschlag.imTextZeigen}
            onClick={() => markiere({ kapitel: beleg.kapitel, anker: beleg })}
          >
            {zitiert(beleg.exakt)}
          </button>
        ) : (
          <blockquote className="zl-zitat">
            {zitiert(beleg.exakt)}
            <span className="zl-zitat__ort">{t.verwaist}</span>
          </blockquote>
        )}
        <div className="zl-reihe">
          <button type="button" className="zl-link zl-link--leise" onClick={() => onSetzen(undefined)}>
            {t.belegEntfernen}
          </button>
        </div>
      </div>
    );
  }
  const setzen = () => {
    const r = belegAusZitat(daten, kapitel, eingabe);
    if ('fehler' in r) return setFehler(belegFehlerText(daten, kapitel, r.fehler));
    setFehler(null);
    setEingabe('');
    onSetzen(r.anker);
  };
  return (
    <Feld label={t.belegWoertlich}>
      {(id) => (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id={id}
              className={klassen('zl-feld', fehler && 'zl-feld--fehler')}
              value={eingabe}
              placeholder={t.belegPlatzhalter}
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
              {t.setzen}
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
  const t = useTexte().zeitleiste.inspektor;
  const teil = (neu: Partial<Zeitpunkt>) => void aendere(e.kapitel, e.szene, neu);
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
      titel={t.zeitpunkt}
      rechts={
        z ? (
          <button type="button" className="zl-link zl-link--leise" onClick={() => void setzeZeitpunkt(e.kapitel, e.szene, null)}>
            {t.zeitpunktEntfernen}
          </button>
        ) : undefined
      }
    >
      <p className="zl-text" aria-live="polite">
        <b style={{ color: 'var(--ink)' }}>{zeitBeschriftung(e.zeit, beginn)}</b>
        {z?.dauer ? ` · ${dauerText(z.dauer)}` : ''}
      </p>
      {!z && e.geerbt && (
        <p className="zl-leise">
          {t.erbtTag}{' '}
          <button
            type="button"
            className="zl-link"
            onClick={() => {
              setzeSzenen(false);
              waehle(e.kapitel);
            }}
          >
            {t.kapitelZeitpunktBearbeiten}
          </button>
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">
          {vorige ? f(t.relativZu, { einheit: einheitNummerText(vorige), zeit: zeitBeschriftung(vorige.zeit, beginn, { kurz: true }) }) : t.relativOhne}
        </span>
        <div className="zl-reihe" role="group" aria-label={t.relativGruppe}>
          {RELATIVE_ANGABEN.filter((a) => a.art !== 'spaeter').map((a) => (
            <button key={a.art} type="button" className="zl-knopf" disabled={!vorige} onClick={() => relativ(a.art)}>
              {relativName(a.art)}
            </button>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              className="zl-feld"
              style={{ width: 46, height: 26 }}
              aria-label={t.tageSpaeter}
              inputMode="numeric"
              value={spaeter}
              disabled={!vorige}
              onChange={(ev) => setSpaeter(ev.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={(ev) => ev.key === 'Enter' && relativ('spaeter')}
            />
            <button type="button" className="zl-knopf" disabled={!vorige} onClick={() => relativ('spaeter')}>
              {t.tageSpaeter}
            </button>
          </span>
        </div>
      </div>

      <div className="zl-felder">
        <ZahlFeld label={t.tagDerHandlung} wert={z?.tag} platzhalter={e.tag !== undefined && z?.tag === undefined ? String(e.tag) : t.tagPlatzhalter} onCommit={(tag) => teil({ tag })} />
        <Feld label={t.wochentag}>
          {(id) => (
            <select id={id} className="zl-feld" value={z?.wochentag ?? ''} onChange={(ev) => teil({ wochentag: (ev.target.value || undefined) as Zeitpunkt['wochentag'] })}>
              <option value="">{erwartet ? `– (${wochentagName(erwartet)})` : '–'}</option>
              {WOCHENTAGE.map((w) => (
                <option key={w} value={w}>
                  {wochentagName(w)}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <Feld label={t.tageszeit}>
          {(id) => (
            <select id={id} className="zl-feld" value={z?.tageszeit ?? ''} onChange={(ev) => teil({ tageszeit: (ev.target.value || undefined) as Zeitpunkt['tageszeit'] })}>
              <option value="">–</option>
              {TAGESZEITEN.map((tz) => (
                <option key={tz} value={tz}>
                  {tageszeitName(tz)}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <UhrzeitFeld wert={z?.uhrzeit} onCommit={(uhrzeit) => teil({ uhrzeit })} />
        <Feld label={t.datum}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="zl-feld"
              value={z?.datum ?? ''}
              title={erwartetDatum ? f(t.ausDemBeginn, { datum: datumKurz(erwartetDatum) }) : undefined}
              onChange={(ev) => teil({ datum: ev.target.value || undefined })}
            />
          )}
        </Feld>
        <ZahlFeld label={t.dauer} wert={z?.dauer} min={1} platzhalter={t.optional} onCommit={(dauer) => teil({ dauer })} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pw-feld__label">{t.sicherheit}</span>
        {z ? (
          <Segment<ZeitSicherheit>
            label={t.sicherheitLabel}
            rolle="group"
            voll
            wert={z.sicherheit}
            onChange={(sicherheit) => teil({ sicherheit })}
            optionen={SICHERHEITEN.map((s) => ({ wert: s, label: sicherheitName(s), farbe: `var(--${SICHERHEIT_FARBE[s]})` }))}
          />
        ) : null}
        <span className="zl-leise">{z ? sicherheitErklaerung(z.sicherheit) : t.sicherheitZuerst}</span>
      </div>

      <BelegFeld kapitel={e.kapitel} beleg={z?.beleg} onSetzen={(beleg) => teil({ beleg })} farbeToken={z ? SICHERHEIT_FARBE[z.sicherheit] : undefined} />
      <NotizFeld label={t.notiz} wert={z?.notiz ?? ''} platzhalter={t.notizPlatzhalter} onCommit={(notiz) => teil({ notiz: notiz.trim() || undefined })} />
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
  const t = useTexte().zeitleiste.inspektor;
  const fertig = async () => {
    const id = await anlegen(name);
    setName('');
    setOffen(false);
    if (id) onAngelegt(id);
  };
  if (!offen)
    return (
      <button type="button" className="zl-knopf" style={{ borderStyle: 'dashed', borderColor: 'var(--dashed)', color: 'var(--ink-quiet)' }} onClick={() => setOffen(true)}>
        {t.neuerZustand}
      </button>
    );
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input
        autoFocus
        className="zl-feld"
        style={{ height: 26, width: 130 }}
        aria-label={t.neuerZustandLabel}
        placeholder={t.neuerZustandPlatzhalter}
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
        {t.anlegen}
      </Button>
    </span>
  );
}

function FigurWahl({ figur }: { figur: Id | undefined }) {
  const daten = useStore((s) => s.daten)!;
  const setzeFigur = useStore((s) => s.zeit.setzeFigur);
  const t = useTexte().zeitleiste.ansicht;
  const figuren = Object.values(daten.figuren).sort(nachRolle((a, b) => vergleich(a.name, b.name)));
  return (
    <select className="zl-select" aria-label={t.figurFuerSpur} value={figur ?? ''} onChange={(e) => setzeFigur(e.target.value || null)}>
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
  const t = useTexte().zeitleiste.inspektor;
  const figur = zd.figur;
  if (!figur)
    return (
      <Abschnitt titel={t.zustand}>
        <p className="zl-leise">{t.figurAnlegen}</p>
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
    <Abschnitt titel={t.zustand} rechts={<FigurWahl figur={figur} />}>
      <div className="zl-reihe" role="group" aria-label={f(t.zustandVon, { name })}>
        {zl.zustandsarten.map((a) => {
          const an = eigen?.zustand === a.id;
          return (
            <button
              key={a.id}
              type="button"
              className="zl-knopf zl-knopf--zustand"
              aria-pressed={an}
              style={farbe(zustandsFarbe(a))}
              title={an ? f(t.zustandEntfernen, { zustand: a.name }) : f(t.zustandSetzen, { name, zustand: a.name })}
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
          {t.vomKapitelVor} <b>{treffer.art?.name ?? treffer.zustand.zustand}</b>
          {t.vomKapitelNach}
        </p>
      )}
      {!treffer && !szenenEintraege.length && <p className="zl-leise">{f(t.keinZustand, { name })}</p>}
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
          <NotizFeld label={t.notizZumZustand} wert={eigen.notiz ?? ''} onCommit={(notiz) => setze(eigen.zustand, { notiz })} />
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
  const t = useTexte().zeitleiste.inspektor;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="zl-kopflabel">{einheitNummerText(e).toUpperCase()}</span>
        <button type="button" className="zl-link zl-link--leise" onClick={() => waehle(null)} aria-label={t.auswahlAufheben}>
          {t.ueberblick}
        </button>
      </div>
      <h2 className="zl-titel">{e.titel}</h2>
      <div className="zl-reihe" style={{ marginTop: -6 }}>
        {e.szene && <span className="zl-leise">{f(t.ausKapitel, { titel: e.kapitelTitel })}</span>}
        <button type="button" className="zl-link" onClick={() => oeffne('schreiben', { kapitel: e.kapitel })}>
          {t.imTextOeffnen}
        </button>
        <span className="zl-leise">·</span>
        <button type="button" className="zl-link" onClick={() => oeffne('akte', { plan: e.kapitel })}>
          {t.kapitelplan}
        </button>
      </div>

      {hinweise.length > 0 && (
        <Abschnitt titel={f(t.zeitHinweise, { n: hinweise.length })}>
          {hinweise.map((h) => (
            <div key={h.schluessel} className="zl-hinweis">
              <span className="zl-hinweis__titel">{h.titel}</span>
              <span>{h.erklaerung}</span>
              <div className="zl-reihe">
                <button type="button" className="zl-link" onClick={() => oeffne('hinweise', { hinweis: h.schluessel })}>
                  {t.inHinweisenOeffnen}
                </button>
              </div>
            </div>
          ))}
        </Abschnitt>
      )}

      <ZeitpunktAbschnitt e={e} zd={zd} />

      {zeitV.length > 0 && (
        <Abschnitt titel={f(t.vorschlaegeDerKi, { n: zeitV.length })}>
          {zeitV.map((v) => (
            <ZeitVorschlagKarte key={v.schluessel} v={v} daten={daten} mitEinheit={zeitV.length > 1 || !!v.szene !== !!e.szene} />
          ))}
        </Abschnitt>
      )}

      <ZustandAbschnitt e={e} zd={zd} />

      {zustandV.length > 0 && (
        <Abschnitt titel={t.zustandVorschlag}>
          {zustandV.map((v) => (
            <ZustandVorschlagKarte key={v.schluessel} v={v} daten={daten} mitEinheit={zustandV.length > 1} />
          ))}
        </Abschnitt>
      )}
      <span className="pw-sr" aria-live="polite">
        {f(t.gewaehlt, { name: einheitNameText(e) })}
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
  const t = useTexte().zeitleiste.inspektor;
  return (
    <div className="zl-art">
      <span className="zl-art__farbe" style={farbe(zustandsFarbe(art))}>
        <span />
        <select aria-label={f(t.farbeFuer, { name: art.name })} value={art.farbe} onChange={(e) => void aendern(id, { farbe: e.target.value })}>
          {ZUSTAND_FARBEN.some((fb) => fb.token === art.farbe) ? null : <option value={art.farbe}>{art.farbe}</option>}
          {ZUSTAND_FARBEN.map((fb) => (
            <option key={fb.token} value={fb.token}>
              {farbName(fb.token, fb.name)}
            </option>
          ))}
        </select>
      </span>
      <input
        className="zl-feld"
        aria-label={f(t.nameVon, { name: art.name })}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={tastenFuerEntwurf(art.name, setName)}
        onBlur={() => (name.trim() && name !== art.name ? void aendern(id, { name }) : setName(art.name))}
      />
      <button type="button" className="zl-symbol" aria-label={f(t.nachOben, { name: art.name })} disabled={index === 0} onClick={() => void verschieben(id, -1)}>
        ↑
      </button>
      <button type="button" className="zl-symbol" aria-label={f(t.nachUnten, { name: art.name })} disabled={index === anzahl - 1} onClick={() => void verschieben(id, 1)}>
        ↓
      </button>
      <button
        type="button"
        className="zl-symbol"
        aria-label={f(t.artEntfernen, { name: art.name })}
        title={benutzt ? f(t.eingetragen, { n: benutzt }) : t.entfernen}
        onClick={async () => {
          if (benutzt && !(await bestaetigen(f(t.artEntfernenFrage, { name: art.name, n: benutzt }), { titel: t.artEntfernenTitel, knopf: t.entfernen }))) return;
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
  const t = useTexte().zeitleiste.inspektor;
  const zeitN = zd.zeitVorschlaege.length;
  const zustandN = zd.zustandVorschlaege.length;
  return (
    <>
      <span className="zl-kopflabel">{t.kopflabel}</span>
      <h2 className="zl-titel">{t.ueberblick}</h2>
      <p className="zl-text" style={{ marginTop: -6 }}>
        {f(t.ueberblickText, { mit: mitTag, n: zd.einheiten.length, offen: offen ? f(t.ueberblickOffen, { n: offen }) : '' })}
      </p>

      <Abschnitt titel={t.beginn}>
        <p className="zl-leise">{t.beginnText}</p>
        <div className="zl-felder">
          <Feld label={t.tag1Ist}>
            {(id) => (
              <select id={id} className="zl-feld" value={b.wochentag ?? ''} onChange={(e) => void setzeBeginn({ ...b, wochentag: (e.target.value || undefined) as never })}>
                <option value="">–</option>
                {WOCHENTAGE.map((w) => (
                  <option key={w} value={w}>
                    {wochentagName(w)}
                  </option>
                ))}
              </select>
            )}
          </Feld>
          <Feld label={t.datumTag1}>
            {(id) => <input id={id} type="date" className="zl-feld" value={b.datum ?? ''} onChange={(e) => void setzeBeginn({ ...b, datum: e.target.value || undefined })} />}
          </Feld>
        </div>
      </Abschnitt>

      <Abschnitt titel={t.zustaende} label={t.zustandsliste}>
        <p className="zl-leise">{t.zustaendeText}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zl.zustandsarten.map((a, i) => (
            <ArtZeile key={a.id} id={a.id} index={i} anzahl={zl.zustandsarten.length} />
          ))}
        </div>
        <div className="zl-reihe">
          <NeueZustandsart onAngelegt={() => undefined} />
        </div>
      </Abschnitt>

      <NurMit funktion="kiZeit">
        <Abschnitt titel={t.vorschlaegeKi}>
          <p className="zl-leise">
            {zeitN + zustandN === 0
              ? t.keineVorschlaege
              : f(t.vorschlaegeOffen, { zeit: f(t.vorschlaegeOffenZeit, { n: zeitN }), zustand: f(t.vorschlaegeOffenZustand, { n: zustandN }) })}
          </p>
          <div className="zl-reihe">
            <Button klein onClick={() => oeffneDialog('zeit-vorschlaege')}>
              {zeitN + zustandN ? t.vorschlaegeAnsehen : texte().zeitleiste.ansicht.zeitpunkteVorschlagen}
            </Button>
          </div>
        </Abschnitt>
      </NurMit>

      <Abschnitt titel={t.notiz}>
        <NotizFeld label={t.notizZurZeitleiste} wert={zl.notiz} onCommit={(n) => void setzeNotiz(n)} />
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
  const t = useTexte().zeitleiste;
  return (
    <Inspektor breite={350} hintergrund="weiss" label={e ? t.inspektor.label : t.titel} className="zl-insp">
      {e ? <EinheitInspektor key={e.schluessel} e={e} zd={zd} /> : <Ueberblick zd={zd} />}
    </Inspektor>
  );
}
