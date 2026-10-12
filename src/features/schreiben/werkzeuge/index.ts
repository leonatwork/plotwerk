/**
 * Editor-Werkzeuge (G4): Typewriter-Modus, Wiederholungen, Vorlesen, Markennamen. Besitzer: G4.
 * Einbindung im Schreibbereich:
 *   editorErweiterungen()  – TipTap-Erweiterung (Markierungen, Typewriter) → Editor.tsx
 *   <EditorWerkzeuge>      – Analyse, Typewriter-Scrollen, Vorlesen → Editor.tsx
 *   <EditorWerkzeugleiste> – Wiederholungen, Vorlesen → Statusleiste
 *   <TypewriterKnopf>      – Titelaktion (⌘⇧T)
 *   <StilTab>              – Tab „Stil“ im Schreiben-Inspektor
 *   MarkenDialog           – Dialog „marken“ (src/app/dialoge.tsx)
 */
import type { AnyExtension } from '@tiptap/core';
import { EditorWerkzeugErweiterung } from './erweiterung';
import './werkzeuge.css';

export { EditorWerkzeuge, type EditorWerkzeugeProps } from './EditorWerkzeuge';
export { StilTab } from './StilTab';
export { TypewriterKnopf } from './TypewriterKnopf';
export { EditorWerkzeugleiste } from './Werkzeugleiste';

export function editorErweiterungen(): AnyExtension[] {
  return [EditorWerkzeugErweiterung];
}
