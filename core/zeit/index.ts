/**
 * Zeitleiste und Zustände (G1). Besitzer: G1 Zeit & Zustand.
 * Reines TypeScript ohne DOM/Tauri. Grundlage: Zeitpunkt an KapitelPlan/Szene, plan/zeitleiste.md,
 * KI-Vorschläge in .plotwerk/zeit-vorschlaege.json und .plotwerk/zustand-vorschlaege.json.
 *
 * `zeitHinweise(daten)` (lokale Zeitprüfung, Typ „zeitleiste“) fließt in core/index (hinweiseBerechnen).
 */
export * from './zeitpunkt';
export * from './leiste';
export * from './zustand';
export * from './beleg';
export * from './vorschlaege';
export { zeitHinweise, einheitenAusZeitHinweis, type ZeitHinweisArt } from './pruefung';
