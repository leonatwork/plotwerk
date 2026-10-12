/** Gemeinsame Bausteine der Planungs-Ansichten (Akte, Kapitel, Figuren, Orte). Besitzer: Planung. */
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { Index } from '@core/index/index';
import type { Erwaehnung, ErwaehnungsArt, Figur, Id, KapitelStatus, ProjektDaten, Strang, TextAnker, Verweis } from '@core/model/types';
import { ankerErzeugen, findeZitat, klartext, normalisiere } from '@core/text/index';
import { useStore } from '../../state/store';
import { REALITAET_FARBE } from '../../ui';
import { VerweisFeld, VerweisText } from '../schreiben/VerweisFeld';
import './planung.css';

// ---------------------------------------------------------------------------
// Farben, Texte
// ---------------------------------------------------------------------------

const STRANG_TOKENS: Record<string, string> = {
  '#3d5a75': 'var(--strang-arbeit)',
  '#c2405c': 'var(--strang-dates)',
  '#a86a12': 'var(--strang-warm)',
  '#6a4c9c': 'var(--strang-violett)',
  '#4a4a4f': 'var(--strang-organisation)',
  '#2f6b45': 'var(--real-gesichert)',
  '#24262b': 'var(--ink)',
};

/** Strangfarbe aus der Datei → Design-Token (damit der Dunkelmodus stimmt); unbekannte Werte bleiben. */
export function strangFarbe(farbe: string | undefined): string {
  if (!farbe) return 'var(--ink-quiet)';
  return STRANG_TOKENS[farbe.trim().toLowerCase()] ?? farbe;
}

/** „Antagonist: Nordhaven“ → „Nordhaven“ für Chips. */
export function strangKurzname(s: Strang): string {
  return s.name.replace(/^Antagonist:\s*/i, '');
}

/** Strang einer geplanten Antagonisten-Gruppe → nur Ring */
export function strangGeplant(s: Strang, daten: ProjektDaten): boolean {
  return !!s.gruppe && daten.gruppen[s.gruppe]?.status === 'geplant';
}

export const STATUS_TEXT: Record<KapitelStatus, string> = { geschrieben: 'geschrieben', entwurf: 'Entwurf', geplant: 'geplant' };

const zahlFormat = new Intl.NumberFormat('de-DE');
export const zahl = (n: number): string => zahlFormat.format(n);

export function kapitelWort(n: number): string {
  return n === 1 ? 'Kapitel' : 'Kapiteln';
}

/** Darstellung einer Figur: Farbe aus dem ersten Strang ihrer Beziehungen bzw. ihrer Gruppe. */
export function figurDarstellung(f: Figur, daten: ProjektDaten): { farbe: string; strang?: Strang; unsicher?: string; textfarbe?: string } {
  const strangId = f.beziehungen.find((b) => b.strang)?.strang ?? (f.gruppe ? daten.gruppen[f.gruppe]?.strang : undefined);
  const strang = strangId ? daten.straenge.find((s) => s.id === strangId) : undefined;
  const farbe = strang ? strangFarbe(strang.farbe) : 'var(--ink)';
  if (f.existenz !== 'gesichert')
    return {
      farbe,
      strang,
      unsicher: REALITAET_FARBE[f.existenz],
      textfarbe: f.existenz === 'bewusst_vage' ? 'var(--vage-dark)' : 'var(--warm-dark)',
    };
  return { farbe, strang };
}

// ---------------------------------------------------------------------------
// Text, Erwähnungen, Anker
// ---------------------------------------------------------------------------

const klartextCache = new Map<string, { roh: string; norm: string }>();

/** Klartext und normalisierter Klartext (core/text) eines Markdown-Kapitels, gecacht. */
export function texteVon(markdown: string): { roh: string; norm: string } {
  let t = klartextCache.get(markdown);
  if (!t) {
    const roh = klartext(markdown);
    t = { roh, norm: normalisiere(roh).text };
    if (klartextCache.size > 200) klartextCache.clear();
    klartextCache.set(markdown, t);
  }
  return t;
}

/** Bestätigte bzw. exakt erkannte Erwähnungen eines Ziels (KI-Vorschläge erst nach Bestätigung). */
export function erwaehnungenVon(index: Pick<Index, 'erwaehnungen'>, typ: 'figur' | 'ort', id: Id): Erwaehnung[] {
  return index.erwaehnungen.filter((e) => e.zielTyp === typ && e.ziel === id && (e.quelle === 'exakt' || e.bestaetigt));
}

const ART_RANG: Record<ErwaehnungsArt, number> = { auftritt: 4, nachricht: 3, erwaehnt: 2, unbestimmt: 1 };

/** Wichtigste Art je Kapitel: tritt auf > per Nachricht > erwähnt > unbestimmt. */
export function artJeKapitel(liste: Erwaehnung[]): Map<Id, ErwaehnungsArt> {
  const m = new Map<Id, ErwaehnungsArt>();
  for (const e of liste) {
    const alt = m.get(e.kapitel);
    if (!alt || ART_RANG[e.art] > ART_RANG[alt]) m.set(e.kapitel, e.art);
  }
  return m;
}

export const ART_TEXT: Record<ErwaehnungsArt, string> = {
  auftritt: 'tritt auf',
  nachricht: 'per Nachricht',
  erwaehnt: 'erwähnt',
  unbestimmt: 'im Text',
};

function textFuer(daten: ProjektDaten, kapitel: Id, start: number, ende: number, treffer?: string): { text: string; start: number; ende: number } | null {
  const md = daten.kapitel[kapitel]?.text ?? '';
  const { roh, norm } = texteVon(md);
  for (const t of [roh, norm]) if (!treffer || t.slice(start, ende) === treffer) return t.length >= ende ? { text: t, start, ende } : null;
  if (treffer) {
    const i = norm.indexOf(treffer);
    if (i >= 0) return { text: norm, start: i, ende: i + treffer.length };
  }
  return null;
}

/** Textanker für eine Stelle (Offsets im normalisierten Klartext). Fällt auf das bloße Zitat zurück. */
export function stelleAnker(daten: ProjektDaten, kapitel: Id, start: number, ende: number, treffer?: string): TextAnker {
  const t = textFuer(daten, kapitel, start, ende, treffer);
  if (!t) return { kapitel, exakt: treffer ?? '', davor: '', danach: '' };
  return ankerErzeugen(kapitel, t.text, t.start, t.ende);
}

/** Anker für ein wörtliches Zitat (Hinweise); ohne Fund nur das Zitat. */
export function zitatAnker(daten: ProjektDaten, kapitel: Id, zitat: string): TextAnker {
  const { roh, norm } = texteVon(daten.kapitel[kapitel]?.text ?? '');
  const b = findeZitat(roh, zitat)[0];
  if (b) return stelleAnker(daten, kapitel, b.start, b.ende, roh.slice(b.start, b.ende));
  const i = norm.indexOf(zitat);
  if (i >= 0) return ankerErzeugen(kapitel, norm, i, i + zitat.length);
  return { kapitel, exakt: zitat, davor: '', danach: '' };
}

/** Ausschnitt um eine Stelle für die Anzeige: [davor, treffer, danach]. */
export function ausschnitt(daten: ProjektDaten, kapitel: Id, start: number, ende: number, treffer?: string, rand = 38): [string, string, string] {
  const t = textFuer(daten, kapitel, start, ende, treffer);
  if (!t) return ['', treffer ?? '', ''];
  const a = Math.max(0, t.start - rand);
  const b = Math.min(t.text.length, t.ende + rand);
  const davor = t.text.slice(a, t.start).replace(/\s+/g, ' ');
  const danach = t.text.slice(t.ende, b).replace(/\s+/g, ' ');
  return [(a > 0 ? '…' : '') + davor.replace(/^\S*\s/, a > 0 ? '' : '$&'), t.text.slice(t.start, t.ende), danach.replace(/\s\S*$/, b < t.text.length ? '' : '$&') + (b < t.text.length ? '…' : '')];
}

/** Durchsuchbare Klartexte aller Kapitel mit Text. */
export function alleTexte(daten: ProjektDaten): { kapitel: Id; text: string }[] {
  return daten.projekt.kapitel
    .map((kapitel) => ({ kapitel, text: texteVon(daten.kapitel[kapitel]?.text ?? '').norm }))
    .filter((t) => t.text);
}

// ---------------------------------------------------------------------------
// Eingabefelder mit Entwurf (speichern beim Verlassen und kurz nach dem Tippen)
// ---------------------------------------------------------------------------

function useEntwurf(wert: string, speichern: (w: string) => void, verzoegerung: number) {
  const [entwurf, setEntwurf] = useState(wert);
  const bearbeitet = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aktuell = useRef({ entwurf, wert, speichern });
  aktuell.current = { entwurf, wert, speichern };

  useEffect(() => {
    if (!bearbeitet.current) setEntwurf(wert);
  }, [wert]);

  const sichern = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { entwurf: e, wert: w, speichern: s } = aktuell.current;
    bearbeitet.current = false;
    if (e !== w) s(e);
  };

  useEffect(() => () => {
    if (bearbeitet.current) sichern();
  }, []);

  return {
    entwurf,
    aendern(neu: string) {
      bearbeitet.current = true;
      setEntwurf(neu);
      if (timer.current) clearTimeout(timer.current);
      if (verzoegerung > 0) timer.current = setTimeout(sichern, verzoegerung);
    },
    sichern,
    verwerfen() {
      if (timer.current) clearTimeout(timer.current);
      bearbeitet.current = false;
      setEntwurf(aktuell.current.wert);
    },
  };
}

export interface EntwurfFeldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  wert: string;
  onSpeichern(wert: string): void;
  /** ms nach der letzten Eingabe; 0 = nur beim Verlassen/Enter */
  verzoegerung?: number;
}

/** Einzeiliges Feld: Enter speichert, Escape verwirft. */
export const EntwurfFeld = forwardRef<HTMLInputElement, EntwurfFeldProps>(function EntwurfFeld(
  { wert, onSpeichern, verzoegerung = 0, onBlur, onKeyDown, ...rest },
  ref,
) {
  const e = useEntwurf(wert, onSpeichern, verzoegerung);
  return (
    <input
      ref={ref}
      {...rest}
      value={e.entwurf}
      onChange={(ev) => e.aendern(ev.target.value)}
      onBlur={(ev) => {
        e.sichern();
        onBlur?.(ev);
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') {
          e.sichern();
          (ev.target as HTMLInputElement).blur();
        } else if (ev.key === 'Escape') {
          e.verwerfen();
          (ev.target as HTMLInputElement).blur();
        }
        onKeyDown?.(ev);
      }}
    />
  );
});

export interface EntwurfBereichProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  wert: string;
  onSpeichern(wert: string): void;
  verzoegerung?: number;
  /** Höhe wächst mit dem Inhalt */
  autoHoehe?: boolean;
  /** `[[`-Verweise (S-07): true oder das Ziel, dessen Verwandtes zuerst vorgeschlagen wird */
  verweise?: true | Verweis;
}

export const EntwurfBereich = forwardRef<HTMLTextAreaElement, EntwurfBereichProps>(function EntwurfBereich(
  { wert, onSpeichern, verzoegerung = 800, autoHoehe, onBlur, onKeyDown, style, verweise, ...rest },
  ref,
) {
  const e = useEntwurf(wert, onSpeichern, verzoegerung);
  const innen = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = innen.current;
    if (!autoHoehe || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [e.entwurf, autoHoehe]);
  if (verweise)
    return (
      <VerweisFeld
        id={rest.id}
        wert={e.entwurf}
        onChange={e.aendern}
        kontext={verweise === true ? null : verweise}
        label={rest['aria-label'] ?? rest.placeholder ?? ''}
        placeholder={rest.placeholder}
        autoFocus={rest.autoFocus}
        zeilen={rest.rows}
        feldKlasse={rest.className ?? 'pl-bereich'}
        feldStil={style}
        onBlur={() => e.sichern()}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape') {
            e.verwerfen();
            ev.currentTarget.blur();
          } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
            e.sichern();
            ev.currentTarget.blur();
          }
          onKeyDown?.(ev);
        }}
      />
    );
  return (
    <textarea
      ref={(el) => {
        innen.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      {...rest}
      style={autoHoehe ? { overflow: 'hidden', ...style } : style}
      value={e.entwurf}
      onChange={(ev) => e.aendern(ev.target.value)}
      onBlur={(ev) => {
        e.sichern();
        onBlur?.(ev);
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          e.verwerfen();
          (ev.target as HTMLTextAreaElement).blur();
        } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
          e.sichern();
          (ev.target as HTMLTextAreaElement).blur();
        }
        onKeyDown?.(ev);
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Kleine Bausteine
// ---------------------------------------------------------------------------

/**
 * Anmerkungen aus dem Text, die an ein Ziel geheftet sind (S-06): Ort, Kapitel oder Plan-Karte.
 * Klick springt zur Stelle im Editor. Ohne Anmerkungen wird nichts angezeigt.
 */
export function AngehefteteNotizen({ ziele, daten }: { ziele: Verweis[]; daten: ProjektDaten }) {
  const markiere = useStore((s) => s.markiere);
  const liste = daten.anmerkungen.filter((a) => a.ziel && ziele.some((z) => z.typ === a.ziel!.typ && z.id === a.ziel!.id));
  if (!liste.length) return null;
  const nr = (k: Id) => daten.projekt.kapitel.indexOf(k) + 1;
  return (
    <>
      {liste.map((a) => (
        <div
          key={a.id}
          style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, background: 'var(--accent-flaeche)', fontSize: 13, lineHeight: 1.45, flexShrink: 0 }}
        >
          <span style={{ whiteSpace: 'pre-wrap' }}>
            <VerweisText text={a.notiz} />
          </span>
          <LinkKnopf onClick={() => markiere({ kapitel: a.anker.kapitel, anker: a.anker })}>
            angeheftet an Kap. {nr(a.anker.kapitel)} · »{a.anker.exakt}«
          </LinkKnopf>
        </div>
      ))}
    </>
  );
}

/** Knopf, der wie ein Link aussieht (Kapitelbelege, „Im Editor öffnen“). */
export function LinkKnopf({
  children,
  onClick,
  fett,
  title,
  style,
  disabled,
}: {
  children: ReactNode;
  onClick(): void;
  fett?: boolean;
  title?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="pl-link" onClick={onClick} title={title} disabled={disabled} style={{ fontWeight: fett ? 600 : 400, ...style }}>
      {children}
    </button>
  );
}

export interface MenueOption {
  wert: string;
  label: ReactNode;
  /** zusätzlicher Suchtext */
  suche?: string;
}

/** „+ Figur“ / „+ Ort“: gestrichelter Knopf mit Auswahlliste. */
export function AuswahlMenue({
  knopf,
  optionen,
  onWaehle,
  leer = 'Nichts mehr frei',
  zusatz,
  knopfStil,
}: {
  knopf: ReactNode;
  optionen: MenueOption[];
  onWaehle(wert: string): void;
  leer?: string;
  /** Eintrag am Ende, z. B. „Neue Figur anlegen …“ (bekommt den Suchtext) */
  zusatz?: { label(suche: string): ReactNode; onClick(suche: string): void };
  knopfStil?: CSSProperties;
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const weg = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', weg);
    return () => document.removeEventListener('mousedown', weg);
  }, [offen]);
  const gefiltert = optionen.filter((o) =>
    `${typeof o.label === 'string' ? o.label : ''} ${o.suche ?? ''}`.toLocaleLowerCase('de').includes(suche.toLocaleLowerCase('de')),
  );
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="pl-plus-chip"
        aria-expanded={offen}
        aria-haspopup="listbox"
        onClick={() => {
          setOffen((o) => !o);
          setSuche('');
        }}
        style={knopfStil}
      >
        {knopf}
      </button>
      {offen && (
        <div
          className="pl-menue"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOffen(false);
            }
          }}
        >
          {(optionen.length > 6 || zusatz) && (
            <input
              autoFocus
              className="pl-menue__suche"
              placeholder={zusatz ? 'Suchen oder neu anlegen' : 'Suchen'}
              aria-label="Suchen"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (gefiltert[0]) onWaehle(gefiltert[0].wert);
                else if (zusatz && suche.trim()) zusatz.onClick(suche.trim());
                else return;
                setOffen(false);
              }}
            />
          )}
          <div role="listbox" className="pl-menue__liste">
            {gefiltert.map((o) => (
              <button
                key={o.wert}
                type="button"
                role="option"
                aria-selected={false}
                className="pl-menue__eintrag"
                autoFocus={optionen.length <= 6 && !zusatz && o === gefiltert[0]}
                onClick={() => {
                  onWaehle(o.wert);
                  setOffen(false);
                }}
              >
                {o.label}
              </button>
            ))}
            {gefiltert.length === 0 && <span className="pl-menue__leer">{leer}</span>}
          </div>
          {zusatz && (
            <button
              type="button"
              className="pl-menue__eintrag pl-menue__zusatz"
              onClick={() => {
                zusatz.onClick(suche);
                setOffen(false);
              }}
            >
              {zusatz.label(suche.trim())}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Chip mit kleinem Entfernen-Knopf. */
export function EntfernbarerChip({
  children,
  onEntfernen,
  onClick,
  variante = 'gefuellt',
  farbe,
  title,
}: {
  children: ReactNode;
  onEntfernen(): void;
  onClick?(): void;
  variante?: 'gefuellt' | 'umrandet';
  farbe?: 'accent';
  title?: string;
}) {
  return (
    <span className={`pl-chip pl-chip--${variante}${farbe ? ' pl-chip--accent' : ''}`} title={title}>
      {onClick ? (
        <button type="button" className="pl-chip__text" onClick={onClick}>
          {children}
        </button>
      ) : (
        <span className="pl-chip__text">{children}</span>
      )}
      <button type="button" className="pl-chip__weg" aria-label={`${typeof children === 'string' ? children : 'Eintrag'} entfernen`} onClick={onEntfernen}>
        ×
      </button>
    </span>
  );
}

/** Schloss-Symbol für private Felder. */
export function IconSchloss({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Abschnitt im Stil der Figurenkarte (Rand #E2DED7, Radius 10, 14/16 px). */
export function Abschnitt({
  titel,
  rechts,
  children,
  hintergrund,
  style,
  label,
}: {
  titel: ReactNode;
  rechts?: ReactNode;
  children: ReactNode;
  hintergrund?: string;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      style={{
        border: '1px solid var(--line-soft)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: hintergrund ?? 'var(--surface)',
        minWidth: 0,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <strong style={{ fontSize: 14 }}>{titel}</strong>
        {rechts}
      </div>
      {children}
    </section>
  );
}

export function Leise({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 12, color: 'var(--ink-quiet)', ...style }}>{children}</span>;
}
