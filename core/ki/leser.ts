/**
 * KI-Aufgaben Leser-Simulation und Fragen an das Buch (G6). Besitzer: G6 KI-Leser.
 * Nutzt fuehreAufgabeAus/AufgabenDefinition (kapitelBis) aus ./aufgabe. Nur ProjektLeser und KiTransport.
 *
 * Leser-Simulation: Das Modell liest nur Kapitel 1..n (kapitelBis) und beschreibt, was eine Erstleserin nach
 * Kapitel n weiß, welche Fragen sie hat, was sie vermutet und wo Spannung entsteht – dazu der Abgleich mit
 * Leons Kapitelplänen (<plan>, Allowlist E12). Jede Aussage braucht ein wörtliches Zitat (E6).
 * Die Fäden-Planung geht NICHT an das Modell (nicht in E12); sie wird lokal neben die Leserfragen gelegt
 * (fadenAbgleich).
 *
 * HARTE REGEL 1: nichts hier schreibt. Gespeichert wird im Store (speichereKiLeser/speichereKiFragen).
 */
import type { Id, KapitelPlan, LeserAussage, LeserFrage, LeserPlanAbgleich, LeserPlanStatus, LeserStand, ProjektDaten, Zitat } from '../model/types';
import { normalisiere, normalisiereMitBereichen, textHash, zitatKern, zuOriginalBereich } from '../text';
import type { AufgabenDefinition, AufgabenPruefung } from './aufgabe';
import type { KiRolle } from './anfrage';
import type { BuchKontext } from './kontext';
import { planText } from './kontext';

export * from './fragen';

// ---------------------------------------------------------------------------
// Ergebnis der Leser-Simulation
// ---------------------------------------------------------------------------

export type PlanBelegStatus = LeserPlanStatus;
export const PLAN_BELEG_STATI: readonly PlanBelegStatus[] = ['belegt', 'teilweise', 'nicht_belegt'];

/** „Plan sagt: … – im Text belegt ja/nein“ (Datenmodell: LeserPlanAbgleich) */
export type PlanAbgleich = LeserPlanAbgleich;

/** Ausführliche Form eines Leser-Stands (gespeichert als LeserStand, siehe alsLeserStand). */
export interface LeserSimulation {
  kapitel: Id;
  basisHash: string;
  weiss: LeserAussage[];
  /** offene und (bis Kapitel n) schon beantwortete Fragen */
  fragen: LeserFrage[];
  vermutungen: LeserAussage[];
  spannung: LeserAussage[];
  plan: PlanAbgleich[];
  modell: string;
  datum: string;
}

// ---------------------------------------------------------------------------
// Speicherform: LeserStand mit eigenen Feldern vermutungen/spannung/plan. Ältere Stände legten diese Teile
// als LeserFrage mit Präfix in der id ab („vermutung|“, „spannung|“, „plan|status|kapitel|“); sie werden
// weiter gelesen, eigene Felder haben Vorrang.
// ---------------------------------------------------------------------------

const P_VERMUTUNG = 'vermutung|';
const P_SPANNUNG = 'spannung|';
const P_PLAN = 'plan|';

export function alsLeserStand(s: LeserSimulation): LeserStand {
  return {
    kapitel: s.kapitel,
    basisHash: s.basisHash,
    weiss: s.weiss,
    fragen: s.fragen,
    modell: s.modell,
    datum: s.datum,
    vermutungen: s.vermutungen,
    spannung: s.spannung,
    plan: s.plan,
  };
}

function istStatus(s: unknown): s is PlanBelegStatus {
  return typeof s === 'string' && (PLAN_BELEG_STATI as readonly string[]).includes(s);
}

export function ausLeserStand(stand: LeserStand): LeserSimulation {
  const sim: LeserSimulation = {
    kapitel: stand.kapitel,
    basisHash: stand.basisHash,
    weiss: stand.weiss,
    fragen: [],
    vermutungen: [],
    spannung: [],
    plan: [],
    modell: stand.modell,
    datum: stand.datum,
  };
  for (const f of stand.fragen) {
    if (f.id.startsWith(P_VERMUTUNG)) sim.vermutungen.push({ text: f.frage, belege: f.belege });
    else if (f.id.startsWith(P_SPANNUNG)) sim.spannung.push({ text: f.frage, belege: f.belege });
    else if (f.id.startsWith(P_PLAN)) {
      const [, status, kapitel = ''] = f.id.split('|');
      const [aussage = '', ...rest] = f.frage.split('\n');
      sim.plan.push({ kapitel, aussage, status: istStatus(status) ? status : 'nicht_belegt', erklaerung: rest.join(' ').trim(), belege: f.belege });
    } else sim.fragen.push(f);
  }
  // eigene Felder haben Vorrang vor der älteren Präfix-Form
  const x = stand;
  if (Array.isArray(x.vermutungen)) sim.vermutungen = x.vermutungen;
  if (Array.isArray(x.spannung)) sim.spannung = x.spannung;
  if (Array.isArray(x.plan)) sim.plan = x.plan.filter((p) => istStatus(p.status));
  return sim;
}

/** Offene (noch nicht beantwortete) Leserfragen */
export function offeneFragen(s: Pick<LeserSimulation, 'fragen'>): LeserFrage[] {
  return s.fragen.filter((f) => !f.beantwortetIn);
}

// ---------------------------------------------------------------------------
// Stand-Hash: Kapiteltexte und Kapitelpläne (Szene, Notiz) bis einschließlich n
// ---------------------------------------------------------------------------

export function leserBasisHash(daten: ProjektDaten, kapitel: Id): string {
  const i = daten.projekt.kapitel.indexOf(kapitel);
  if (i < 0) return '';
  const teile = daten.projekt.kapitel.slice(0, i + 1).map((id) => {
    const p = daten.plaene[id];
    return `${id}\u0000${daten.kapitel[id]?.text ?? ''}\u0000${p?.szene ?? ''}\u0000${p?.notiz ?? ''}`;
  });
  return textHash(teile.join('\u0001'));
}

/** Stand ist veraltet, wenn sich Text oder Plan eines Kapitels bis n geändert hat (oder der Hash fehlt). */
export function leserStandVeraltet(daten: ProjektDaten, stand: Pick<LeserStand, 'kapitel' | 'basisHash'>): boolean {
  return !stand.basisHash || stand.basisHash !== leserBasisHash(daten, stand.kapitel);
}

// ---------------------------------------------------------------------------
// Aufgabe
// ---------------------------------------------------------------------------

export const SYSTEM_LESER = `Du bist eine aufmerksame Erstleserin eines deutschsprachigen Romans. Du kennst nur die Kapitel, die dir vorliegen – was danach kommt, weißt du nicht. Du beschreibst, was eine Leserin nach dem letzten vorliegenden Kapitel weiß, welche Fragen sie offen hat, was sie vermutet und wo sie Spannung spürt. Danach vergleichst du das mit der Planung des Autors (<plan> bei den Kapiteln, Zeilen „Planung“ bei den Figuren). Die Planung gehört nicht zum Buch und ist kein Leserwissen.

Regeln:
- Jede Aussage, Frage, Vermutung und jeder Spannungspunkt hat mindestens ein wörtliches Zitat aus dem <text> der Kapitel: zeichengenau kopiert, kurz (ein Satz oder Satzteil), mit der Kapitel-ID.
- Nur, was eine Leserin aus dem Text erfährt oder ahnt. Angaben und Planung des Autors sind kein Leserwissen.
- Du schreibst keinen Text für das Buch, schlägst keine Formulierungen vor und gibst keine Schreibtipps. Du beobachtest nur.
- Als „bewusst vage“ Markiertes bleibt vage: nicht auflösen, nicht bewerten.
- Kurz und sachlich, auf Deutsch, je Eintrag höchstens zwei Sätze.`;

export interface LeserAufgabenOptionen {
  /** Opus (Deployment „tiefencheck“, effort high) statt Sonnet */
  tiefencheck?: boolean;
  /** Hash für den gespeicherten Stand (leserBasisHash); die App setzt ihn, Tests dürfen ihn weglassen */
  basisHash?: string;
}

const str = { type: 'string' };
const liste = (items: Record<string, unknown>) => ({ type: 'array', items });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

function kapitelMitText(kontext: BuchKontext): Id[] {
  const ids = kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id);
  return ids.length ? ids : kontext.kapitel.map((k) => k.id);
}

export function leserSchema(kontext: BuchKontext): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kapitelMitText(kontext) };
  const belege = liste(obj({ kapitel, text: str }));
  const aussage = obj({ text: str, belege });
  const mitPlan = kontext.kapitel.filter((k) => k.plan.szene || k.plan.notiz).map((k) => k.id);
  return obj({
    weiss: liste(aussage),
    fragen: liste(obj({ frage: str, belege, beantwortetIn: { type: 'string', enum: [...kapitelMitText(kontext), ''] } })),
    vermutungen: liste(aussage),
    spannung: liste(aussage),
    plan: liste(
      obj({
        kapitel: { type: 'string', enum: mitPlan.length ? mitPlan : kontext.kapitel.map((k) => k.id) },
        aussage: str,
        status: { type: 'string', enum: [...PLAN_BELEG_STATI] },
        erklaerung: str,
        belege,
      }),
    ),
  });
}

export function leserAufgabe(kontext: BuchKontext): string {
  const letztes = kontext.kapitel[kontext.kapitel.length - 1];
  const n = letztes?.nr ?? 0;
  const titel = letztes ? `„${letztes.titel}“` : '';
  const mitPlan = kontext.kapitel.some((k) => k.plan.szene || k.plan.notiz);
  return [
    `Lies Kapitel 1 bis ${n} (bis ${titel}, id: ${letztes?.id ?? ''}) wie eine Erstleserin und beschreibe ihren Stand nach Kapitel ${n}.`,
    '- weiss: was die Leserin sicher weiß (Figuren, Ereignisse, Beziehungen, Orte). Höchstens 12, das Wichtigste zuerst.',
    `- fragen: Fragen, die der Text bei der Leserin aufwirft. beantwortetIn = ID des Kapitels (1 bis ${n}), in dem der Text die Frage schon beantwortet, sonst "". Höchstens 10.`,
    '- vermutungen: was die Leserin ahnt oder vermutet, ohne dass der Text es bestätigt. Höchstens 6.',
    '- spannung: Stellen, an denen Spannung entsteht oder anhält, und warum. Höchstens 6.',
    mitPlan
      ? `- plan: je ein Eintrag für die wichtigsten Punkte aus <plan> der Kapitel 1 bis ${n} (höchstens 2 je Kapitel). aussage = wörtlicher Ausschnitt aus dem <plan>. status: belegt (die Leserin erfährt es aus dem Text), teilweise (sie kann es nur ahnen) oder nicht_belegt (steht so nicht im Text). erklaerung: ein Satz, warum. belege: Zitate aus dem <text> (bei nicht_belegt leer).`
      : '- plan: leer (es gibt keine Kapitelpläne).',
    `Alle Zitate wörtlich aus dem <text> der Kapitel 1 bis ${n}. Nur Beobachtungen, keine Schreibvorschläge.`,
  ].join('\n');
}

/** Plan-Aussage auf Leons Plan-Text zurückführen: wörtlicher Ausschnitt, sonst der ganze Plan-Text des Kapitels. */
function planAussage(kontext: BuchKontext, kapitel: Id, roh: unknown): string | null {
  const k = kontext.kapitel.find((x) => x.id === kapitel);
  if (!k) return null;
  const texte = [k.plan.szene, k.plan.notiz].filter(Boolean);
  if (texte.length === 0) return null;
  const q = typeof roh === 'string' ? zitatKern(roh).toLocaleLowerCase('de') : '';
  if (q.length >= 3) {
    for (const t of texte) {
      const n = normalisiereMitBereichen(t);
      const i = n.text.toLocaleLowerCase('de').indexOf(q);
      if (i < 0) continue;
      const b = zuOriginalBereich(n, i, i + q.length, t.length);
      return t.slice(b.start, b.ende);
    }
  }
  return k.plan.notiz || k.plan.szene;
}

function werteAussagenAus(roh: unknown, p: AufgabenPruefung, art: string): LeserAussage[] {
  const ergebnis: LeserAussage[] = [];
  for (const e of Array.isArray(roh) ? roh : []) {
    const r = (e ?? {}) as Record<string, unknown>;
    const text = p.text(r.text, { art, ...r }, { pflicht: true });
    if (text === null) continue;
    const belege = p.zitate(r.belege, { art, ...r });
    if (!belege) continue;
    if (ergebnis.some((x) => x.text === text)) continue;
    ergebnis.push({ text, belege });
  }
  return ergebnis;
}

function slug(s: string): string {
  return (
    normalisiere(s)
      .text.toLocaleLowerCase('de')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'frage'
  );
}

/** Auswertung der Modellantwort (ohne modell/datum – die setzt der Aufrufer). */
export function werteLeserAntwortAus(daten: unknown, p: AufgabenPruefung, kapitel: Id, basisHash = ''): LeserSimulation {
  const d = (daten ?? {}) as Record<string, unknown>;
  const erlaubt = new Set(p.kontext.kapitel.map((k) => k.id));

  const fragen: LeserFrage[] = [];
  const ids = new Set<string>();
  for (const e of Array.isArray(d.fragen) ? d.fragen : []) {
    const r = (e ?? {}) as Record<string, unknown>;
    const frage = p.text(r.frage, { art: 'frage', ...r }, { pflicht: true });
    if (frage === null) continue;
    const belege = p.zitate(r.belege, { art: 'frage', ...r }, { kapitel: erlaubt });
    if (!belege) continue;
    let id = slug(frage);
    for (let n = 2; ids.has(id); n++) id = `${slug(frage)}-${n}`;
    ids.add(id);
    const beantwortet = typeof r.beantwortetIn === 'string' && r.beantwortetIn ? p.kapitel(r.beantwortetIn) : undefined;
    fragen.push({ id, frage, belege, ...(beantwortet && erlaubt.has(beantwortet.id) ? { beantwortetIn: beantwortet.id } : {}) });
  }

  const plan: PlanAbgleich[] = [];
  for (const e of Array.isArray(d.plan) ? d.plan : []) {
    const r = (e ?? {}) as Record<string, unknown>;
    const k = p.kapitel(r.kapitel);
    if (!k || !erlaubt.has(k.id)) {
      p.verwerfen(`Plan-Abgleich zu unbekanntem Kapitel „${String(r.kapitel)}“`, e);
      continue;
    }
    const aussage = planAussage(p.kontext, k.id, r.aussage);
    if (!aussage) {
      p.verwerfen(`Kap. ${k.nr} hat keinen Plan`, e);
      continue;
    }
    const status = istStatus(r.status) ? r.status : null;
    if (!status) {
      p.verwerfen('Plan-Abgleich ohne gültigen Status', e);
      continue;
    }
    const erklaerung = p.text(r.erklaerung, e);
    if (erklaerung === null) continue;
    const hatBelege = Array.isArray(r.belege) && r.belege.length > 0;
    let belege: Zitat[] = [];
    if (status !== 'nicht_belegt' || hatBelege) {
      const z = p.zitate(r.belege, e, { kapitel: erlaubt, mindestens: status === 'nicht_belegt' ? 0 : 1 });
      if (!z) continue;
      belege = z;
    }
    if (plan.some((x) => x.kapitel === k.id && x.aussage === aussage)) continue;
    plan.push({ kapitel: k.id, aussage, status, erklaerung, belege });
  }
  const reihenfolge = new Map(p.kontext.kapitel.map((k, i) => [k.id, i]));
  plan.sort((a, b) => (reihenfolge.get(a.kapitel) ?? 0) - (reihenfolge.get(b.kapitel) ?? 0));

  return {
    kapitel,
    basisHash,
    weiss: werteAussagenAus(d.weiss, p, 'weiss'),
    fragen,
    vermutungen: werteAussagenAus(d.vermutungen, p, 'vermutung'),
    spannung: werteAussagenAus(d.spannung, p, 'spannung'),
    plan,
    modell: '',
    datum: '',
  };
}

/** Aufgabe „Was weiß der Leser nach Kapitel n?“ – das Modell bekommt nur Kapitel 1..n. */
export function leserSimulationAufgabe(kapitel: Id, optionen: LeserAufgabenOptionen = {}): AufgabenDefinition<LeserSimulation> {
  const rolle: KiRolle = optionen.tiefencheck ? 'tiefencheck' : 'pruefung';
  return {
    name: 'Leser-Simulation',
    art: 'leser',
    attribute: { kapitel },
    rolle,
    system: SYSTEM_LESER,
    kapitelBis: kapitel,
    ausgabeSchaetzung: 6000,
    aufgabe: leserAufgabe,
    schema: leserSchema,
    auswerten: (daten, p) => werteLeserAntwortAus(daten, p, kapitel, optionen.basisHash ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Lokaler Abgleich mit der Fäden-Planung (geht nicht an das Modell)
// ---------------------------------------------------------------------------

export interface FadenSoll {
  id: Id;
  name: string;
  eroeffnetIn?: Id;
  aufloesungIn?: Id;
  status?: 'offen' | 'erledigt' | 'bewusst_offen';
}

export interface FadenAbgleich {
  faden: FadenSoll;
  /** was Leons Planung nach Kapitel n erwartet */
  soll: 'offen' | 'aufgeloest';
  /** passende Leserfrage (Wortüberschneidung), falls gefunden */
  frage?: LeserFrage;
  /** Leserfrage passt zur Erwartung? undefined = keine passende Frage gefunden */
  passt?: boolean;
}

const FUELLWOERTER = new Set(
  'der die das den dem des ein eine einen einem einer und oder aber mit von vom zum zur im in am an auf aus bei für hat ist sind wird was wer wie wo warum wieso weshalb noch schon nicht kein keine sich er sie es ihm ihr ihn'.split(
    ' ',
  ),
);

function woerter(s: string): Set<string> {
  return new Set(
    normalisiere(s)
      .text.toLocaleLowerCase('de')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !FUELLWOERTER.has(w))
      .map((w) => w.replace(/(en|e|n|s)$/u, '')),
  );
}

/**
 * Leons Fäden-Planung neben die Leserfragen nach Kapitel n legen: Ein Faden, dessen geplante Auflösung nach n
 * liegt, soll für die Leserin noch offen sein; liegt sie bei oder vor n, soll er aufgelöst sein.
 */
export function fadenAbgleich(reihenfolge: Id[], kapitel: Id, faeden: FadenSoll[], fragen: LeserFrage[]): FadenAbgleich[] {
  const n = reihenfolge.indexOf(kapitel);
  if (n < 0) return [];
  const pos = (id?: Id) => (id ? reihenfolge.indexOf(id) : -1);
  const ergebnis: FadenAbgleich[] = [];
  for (const f of faeden) {
    const eroeffnet = pos(f.eroeffnetIn);
    if (eroeffnet < 0 || eroeffnet > n) continue;
    const aufloesung = pos(f.aufloesungIn);
    const soll: FadenAbgleich['soll'] = (aufloesung >= 0 && aufloesung <= n) || f.status === 'erledigt' ? 'aufgeloest' : 'offen';
    const fw = woerter(f.name);
    let beste: { frage: LeserFrage; treffer: number } | undefined;
    for (const q of fragen) {
      const qw = woerter(q.frage);
      let treffer = 0;
      for (const w of fw) if (qw.has(w)) treffer++;
      if (treffer > 0 && (!beste || treffer > beste.treffer)) beste = { frage: q, treffer };
    }
    const frage = beste?.frage;
    ergebnis.push({
      faden: f,
      soll,
      ...(frage ? { frage, passt: soll === 'offen' ? !frage.beantwortetIn : !!frage.beantwortetIn } : {}),
    });
  }
  return ergebnis;
}

/** Plan-Text eines Kapitels für die Anzeige (wie an das Modell: Verweise als Text) */
export function kapitelPlanText(plan: KapitelPlan | undefined): { szene: string; notiz: string } {
  return { szene: planText(plan?.szene), notiz: planText(plan?.notiz) };
}
