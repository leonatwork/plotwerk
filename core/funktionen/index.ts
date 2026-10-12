/**
 * Funktionsumfang (E15): Katalog der abwählbaren Funktionen, Presets je Schreibertyp, eigene Presets und
 * No-AI-Modus (E16). Reine Logik ohne DOM und ohne Tauri; Besitzer: Fundament.
 *
 * Grundsätze:
 * - Ausgeblendet heißt nicht gelöscht. Daten ausgeblendeter Funktionen bleiben im Projekt und im Export erhalten;
 *   blendet man die Funktion wieder ein, ist alles wieder da.
 * - Abhängigkeiten werden aufgelöst: Einschalten nimmt benötigte Funktionen mit, Ausschalten nimmt abhängige mit.
 * - KI-Funktionen kosten nur Tokens, wenn sie laufen. Ausgeblendete KI-Funktionen laufen nie; der Plan-Abgleich
 *   bestimmt zusätzlich, ob Plan-Felder im Buchkontext jeder Prüfung mitgehen (`kiKontextUmfang`).
 * - Neue Funktionen späterer Versionen: Was ein gespeichertes Profil noch nicht kannte (`bekannt`), wird nach
 *   seiner Basis entschieden (Preset: wie im Preset, sonst eingeschaltet).
 */

export const FUNKTION_IDS = [
  // Schreiben
  'editor',
  'editorWerkzeuge',
  'statistik',
  'fassungen',
  'abgabe',
  // Planen
  'kapitelUeberblick',
  'akte',
  'faeden',
  'zeitleiste',
  'recherche',
  // Figuren & Welt
  'figuren',
  'boegen',
  'beziehungen',
  'orte',
  // Prüfen & KI
  'hinweise',
  'kiPruefung',
  'kiPlanAbgleich',
  'kiTiefencheck',
  'kiErkennung',
  'kiZeit',
  'kiStimme',
  'kiLeser',
] as const;

export type FunktionId = (typeof FUNKTION_IDS)[number];

export type FunktionsGruppe = 'schreiben' | 'planen' | 'figuren' | 'pruefen';

export const FUNKTIONS_GRUPPEN: readonly FunktionsGruppe[] = ['schreiben', 'planen', 'figuren', 'pruefen'];

/** Modellrolle einer KI-Funktion (Anzeige): erkennung = kleines, pruefung = mittleres, tiefencheck = großes Modell */
export type KiModellRolle = 'erkennung' | 'pruefung' | 'tiefencheck';

export interface FunktionDefinition {
  id: FunktionId;
  gruppe: FunktionsGruppe;
  /** immer an, nicht abwählbar */
  pflicht?: true;
  /** braucht die KI (im No-AI-Modus aus) */
  ki?: true;
  /** grobe KI-Last je Lauf: 1 klein, 2 mittel, 3 groß (Modellgröße × Anfragen) */
  kiLast?: 1 | 2 | 3;
  kiModell?: KiModellRolle;
  /** muss eingeschaltet sein, damit diese Funktion sichtbar ist */
  braucht?: readonly FunktionId[];
}

export const FUNKTIONEN: readonly FunktionDefinition[] = [
  { id: 'editor', gruppe: 'schreiben', pflicht: true },
  { id: 'editorWerkzeuge', gruppe: 'schreiben' },
  { id: 'statistik', gruppe: 'schreiben' },
  { id: 'fassungen', gruppe: 'schreiben' },
  { id: 'abgabe', gruppe: 'schreiben' },
  { id: 'kapitelUeberblick', gruppe: 'planen' },
  { id: 'akte', gruppe: 'planen' },
  { id: 'faeden', gruppe: 'planen' },
  { id: 'zeitleiste', gruppe: 'planen' },
  { id: 'recherche', gruppe: 'planen' },
  { id: 'figuren', gruppe: 'figuren' },
  { id: 'boegen', gruppe: 'figuren', braucht: ['figuren'] },
  { id: 'beziehungen', gruppe: 'figuren', braucht: ['figuren'] },
  { id: 'orte', gruppe: 'figuren' },
  { id: 'hinweise', gruppe: 'pruefen' },
  { id: 'kiPruefung', gruppe: 'pruefen', ki: true, kiLast: 2, kiModell: 'pruefung', braucht: ['hinweise'] },
  { id: 'kiPlanAbgleich', gruppe: 'pruefen', ki: true, kiLast: 1, kiModell: 'pruefung', braucht: ['kiPruefung'] },
  { id: 'kiTiefencheck', gruppe: 'pruefen', ki: true, kiLast: 3, kiModell: 'tiefencheck', braucht: ['kiPruefung'] },
  { id: 'kiErkennung', gruppe: 'pruefen', ki: true, kiLast: 1, kiModell: 'erkennung' },
  { id: 'kiZeit', gruppe: 'pruefen', ki: true, kiLast: 1, kiModell: 'pruefung', braucht: ['zeitleiste'] },
  { id: 'kiStimme', gruppe: 'pruefen', ki: true, kiLast: 1, kiModell: 'pruefung', braucht: ['figuren'] },
  { id: 'kiLeser', gruppe: 'pruefen', ki: true, kiLast: 2, kiModell: 'pruefung' },
];

const DEFINITION = new Map(FUNKTIONEN.map((f) => [f.id, f]));

export function funktion(id: FunktionId): FunktionDefinition {
  return DEFINITION.get(id)!;
}

export function istFunktionId(id: unknown): id is FunktionId {
  return typeof id === 'string' && DEFINITION.has(id as FunktionId);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Schreibertypen im Einrichtungs-Assistenten */
export const PRESET_IDS = ['einsteiger', 'fortgeschritten', 'profi', 'autor'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

const EINSTEIGER: readonly FunktionId[] = [
  'editor',
  'statistik',
  'kapitelUeberblick',
  'figuren',
  'orte',
  'hinweise',
  'kiPruefung',
  'kiErkennung',
];
const FORTGESCHRITTEN: readonly FunktionId[] = [
  ...EINSTEIGER,
  'editorWerkzeuge',
  'fassungen',
  'akte',
  'recherche',
  'beziehungen',
  'kiPlanAbgleich',
  'kiStimme',
];
const PROFI: readonly FunktionId[] = [...FORTGESCHRITTEN, 'faeden', 'zeitleiste', 'boegen', 'kiZeit', 'kiLeser'];

export const PRESETS: Record<PresetId, readonly FunktionId[]> = {
  einsteiger: EINSTEIGER,
  fortgeschritten: FORTGESCHRITTEN,
  profi: PROFI,
  autor: FUNKTION_IDS,
};

export function istPresetId(id: unknown): id is PresetId {
  return typeof id === 'string' && (PRESET_IDS as readonly string[]).includes(id);
}

// ---------------------------------------------------------------------------
// Auswahl: Abhängigkeiten auflösen
// ---------------------------------------------------------------------------

/** In Katalog-Reihenfolge, nur bekannte IDs, Pflichtfunktionen und benötigte Funktionen ergänzt. */
export function normalisiere(auswahl: Iterable<string>): FunktionId[] {
  const menge = new Set<FunktionId>();
  const nimm = (id: FunktionId) => {
    if (menge.has(id)) return;
    menge.add(id);
    for (const b of funktion(id).braucht ?? []) nimm(b);
  };
  for (const id of auswahl) if (istFunktionId(id)) nimm(id);
  for (const f of FUNKTIONEN) if (f.pflicht) menge.add(f.id);
  return FUNKTION_IDS.filter((id) => menge.has(id));
}

/** Funktionen, die (direkt oder indirekt) `id` brauchen. */
export function abhaengigeVon(id: FunktionId): FunktionId[] {
  const ergebnis = new Set<FunktionId>();
  const suche = (ziel: FunktionId) => {
    for (const f of FUNKTIONEN) {
      if (f.braucht?.includes(ziel) && !ergebnis.has(f.id)) {
        ergebnis.add(f.id);
        suche(f.id);
      }
    }
  };
  suche(id);
  return FUNKTION_IDS.filter((f) => ergebnis.has(f));
}

/** Schaltet `id` ein (mit allem, was sie braucht). */
export function einschalten(auswahl: Iterable<string>, id: FunktionId): FunktionId[] {
  return normalisiere([...auswahl, id]);
}

/** Schaltet `id` aus (mit allem, was sie braucht); Pflichtfunktionen bleiben. */
export function ausschalten(auswahl: Iterable<string>, id: FunktionId): FunktionId[] {
  if (funktion(id).pflicht) return normalisiere(auswahl);
  const weg = new Set<FunktionId>([id, ...abhaengigeVon(id)]);
  return normalisiere([...auswahl].filter((f) => !weg.has(f as FunktionId)));
}

export function gleicheAuswahl(a: Iterable<string>, b: Iterable<string>): boolean {
  const x = normalisiere(a);
  const y = normalisiere(b);
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

// ---------------------------------------------------------------------------
// KI-Umfang
// ---------------------------------------------------------------------------

export type KiStufe = 'aus' | 'keine' | 'gering' | 'mittel' | 'hoch';

/** Summe der KI-Last der gewählten Funktionen (0 im No-AI-Modus). */
export function kiLast(auswahl: Iterable<string>, kiAus = false): number {
  if (kiAus) return 0;
  return normalisiere(auswahl).reduce((summe, id) => summe + (funktion(id).kiLast ?? 0), 0);
}

/** Grobe Einordnung für die Anzeige: bis 3 gering, bis 8 mittel, darüber hoch. */
export function kiStufe(auswahl: Iterable<string>, kiAus = false): KiStufe {
  if (kiAus) return 'aus';
  const last = kiLast(auswahl);
  return last === 0 ? 'keine' : last <= 3 ? 'gering' : last <= 8 ? 'mittel' : 'hoch';
}

/** KI-Funktionen, die im No-AI-Modus wegfallen (aus der Auswahl). */
export function kiFunktionen(auswahl: Iterable<string>): FunktionId[] {
  return normalisiere(auswahl).filter((id) => funktion(id).ki);
}

// ---------------------------------------------------------------------------
// Profil (App-Einstellung `funktionen`, nie im Projektordner)
// ---------------------------------------------------------------------------

export interface EigenesPreset {
  /** stabile Kennung, z. B. „eigen-krimi“ */
  id: string;
  name: string;
  funktionen: FunktionId[];
  kiAus: boolean;
}

/** Woher die Auswahl stammt: Schreibertyp, eigenes Preset (dessen id) oder freie Auswahl */
export type ProfilBasis = PresetId | 'eigen' | `eigen-${string}`;

export interface FunktionsProfil {
  version: 1;
  basis: ProfilBasis;
  /** eingeschaltete Funktionen (normalisiert) */
  funktionen: FunktionId[];
  /** No-AI-Modus: alle KI-Funktionen aus, kein Aufruf an ein Modell */
  kiAus: boolean;
  eigenePresets: EigenesPreset[];
  /** Einrichtungs-Assistent abgeschlossen (oder übersprungen) */
  eingerichtet: boolean;
  /** Katalog beim Speichern – spätere Funktionen werden nach `basis` ergänzt */
  bekannt: FunktionId[];
}

/** Alles sichtbar, Assistent noch nicht gelaufen. */
export function standardProfil(): FunktionsProfil {
  return {
    version: 1,
    basis: 'autor',
    funktionen: [...FUNKTION_IDS],
    kiAus: false,
    eigenePresets: [],
    eingerichtet: false,
    bekannt: [...FUNKTION_IDS],
  };
}

/** Profil für bestehende Nutzer (vor E15): alles wie bisher, ohne Assistent. */
export function bestandsProfil(): FunktionsProfil {
  return { ...standardProfil(), eingerichtet: true };
}

export function profilMitPreset(profil: FunktionsProfil, preset: PresetId): FunktionsProfil {
  return { ...profil, basis: preset, funktionen: normalisiere(PRESETS[preset]) };
}

export function profilMitEigenemPreset(profil: FunktionsProfil, id: string): FunktionsProfil {
  const p = profil.eigenePresets.find((e) => e.id === id);
  if (!p) return profil;
  return { ...profil, basis: p.id as ProfilBasis, funktionen: normalisiere(p.funktionen), kiAus: p.kiAus };
}

/** Freie Änderung der Auswahl: Basis wird „eigen“, solange die Auswahl keinem Preset mehr entspricht. */
export function profilMitAuswahl(profil: FunktionsProfil, funktionen: Iterable<string>): FunktionsProfil {
  const auswahl = normalisiere(funktionen);
  return { ...profil, funktionen: auswahl, basis: passendeBasis(profil, auswahl) };
}

function passendeBasis(profil: FunktionsProfil, auswahl: FunktionId[]): ProfilBasis {
  if (istPresetId(profil.basis) && gleicheAuswahl(PRESETS[profil.basis], auswahl)) return profil.basis;
  const eigen = profil.eigenePresets.find((p) => p.id === profil.basis);
  if (eigen && gleicheAuswahl(eigen.funktionen, auswahl)) return eigen.id as ProfilBasis;
  return 'eigen';
}

/** Kennung aus dem Namen („Mein Krimi“ → „eigen-mein-krimi“), eindeutig unter den vorhandenen. */
export function presetKennung(name: string, vorhanden: Iterable<string>): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'preset';
  const belegt = new Set(vorhanden);
  let id = `eigen-${slug}`;
  for (let n = 2; belegt.has(id); n++) id = `eigen-${slug}-${n}`;
  return id;
}

/**
 * Speichert die aktuelle Auswahl als eigenes Preset. Gibt es schon eines mit diesem Namen (ohne Groß-/Kleinschreibung),
 * wird es überschrieben. Die Basis des Profils wird das gespeicherte Preset.
 */
export function eigenesPresetSpeichern(profil: FunktionsProfil, name: string): FunktionsProfil {
  const sauber = name.trim();
  if (!sauber) return profil;
  const alt = profil.eigenePresets.find((p) => p.name.toLocaleLowerCase() === sauber.toLocaleLowerCase());
  const id = alt?.id ?? presetKennung(sauber, profil.eigenePresets.map((p) => p.id));
  const preset: EigenesPreset = { id, name: sauber, funktionen: normalisiere(profil.funktionen), kiAus: profil.kiAus };
  const eigenePresets = alt
    ? profil.eigenePresets.map((p) => (p.id === id ? preset : p))
    : [...profil.eigenePresets, preset];
  return { ...profil, eigenePresets, basis: id as ProfilBasis };
}

export function eigenesPresetLoeschen(profil: FunktionsProfil, id: string): FunktionsProfil {
  return {
    ...profil,
    eigenePresets: profil.eigenePresets.filter((p) => p.id !== id),
    basis: profil.basis === id ? 'eigen' : profil.basis,
  };
}

/** Wirksam eingeschaltete Funktionen: Auswahl, im No-AI-Modus ohne KI-Funktionen. */
export function aktiveFunktionen(profil: FunktionsProfil): Set<FunktionId> {
  return new Set(normalisiere(profil.funktionen).filter((id) => !(profil.kiAus && funktion(id).ki)));
}

/** Umfang des Buchkontexts für die KI (core/ki): Plan-Felder nur mit Plan-Abgleich. */
export interface KiKontextUmfang {
  plan: boolean;
}

export function kiKontextUmfang(profil: FunktionsProfil): KiKontextUmfang {
  return { plan: aktiveFunktionen(profil).has('kiPlanAbgleich') };
}

// ---------------------------------------------------------------------------
// Laden (gespeicherter Wert ist unbekannte JSON-Struktur)
// ---------------------------------------------------------------------------

function idListe(wert: unknown): FunktionId[] {
  return Array.isArray(wert) ? wert.filter(istFunktionId) : [];
}

function basisAus(wert: unknown, eigene: EigenesPreset[]): ProfilBasis {
  if (istPresetId(wert)) return wert;
  if (typeof wert === 'string' && eigene.some((p) => p.id === wert)) return wert as ProfilBasis;
  return 'eigen';
}

/** Gespeichertes Profil prüfen und ergänzen; null = unbrauchbar (dann gilt das Standardprofil). */
export function profilAusJson(wert: unknown): FunktionsProfil | null {
  if (!wert || typeof wert !== 'object') return null;
  const o = wert as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.funktionen)) return null;
  const eigenePresets: EigenesPreset[] = (Array.isArray(o.eigenePresets) ? o.eigenePresets : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => typeof p.id === 'string' && p.id.startsWith('eigen-') && typeof p.name === 'string' && p.name.trim() !== '')
    .map((p) => ({ id: p.id as string, name: (p.name as string).trim(), funktionen: normalisiere(idListe(p.funktionen)), kiAus: p.kiAus === true }));
  const basis = basisAus(o.basis, eigenePresets);
  // Funktionen, die es beim Speichern noch nicht gab: wie im Preset der Basis, sonst eingeschaltet
  const bekannt = new Set<FunktionId>(Array.isArray(o.bekannt) ? idListe(o.bekannt) : FUNKTION_IDS);
  const neu = FUNKTION_IDS.filter((id) => !bekannt.has(id) && (!istPresetId(basis) || PRESETS[basis].includes(id)));
  return {
    version: 1,
    basis,
    funktionen: normalisiere([...idListe(o.funktionen), ...neu]),
    kiAus: o.kiAus === true,
    eigenePresets,
    eingerichtet: o.eingerichtet === true,
    bekannt: [...FUNKTION_IDS],
  };
}
