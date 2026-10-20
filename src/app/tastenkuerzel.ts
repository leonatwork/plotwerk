import { useEffect } from 'react';
import { useStore } from '../state/store';
import { BEREICHE } from './bereiche';
import { BEFEHL_EREIGNIS, befehlAusfuehren, befehlFuerTaste, type Befehl } from './befehle';

/** ⌘1–⌘7 Bereiche, ⌘8 Zeitleiste, ⌘9 Fäden, ⌘0 Recherche, ⌘K Schnellsuche, ⌘⇧F Fokus-Modus, ⌘⇧T Typewriter, ⌘⇧S Fassung sichern, ⌘⇧B Buch-Vorschau, ⌘E Export, ⌘O Projekt öffnen, ⌘, Einstellungen. */
export function useTastenkuerzel(): void {
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const befehl = befehlFuerTaste(e);
      if (!befehl) return;
      // Die bestehende Recherche-Suche verarbeitet ⌘F selbst.
      if (befehl === 'textsuche' && useStore.getState().bereich !== 'schreiben') return;
      // solange ein Dialog offen ist, wechseln Tastenkürzel nicht den Bereich dahinter
      if (useStore.getState().dialog && BEREICHE.some((b) => b.id === befehl)) return;
      e.preventDefault();
      void befehlAusfuehren(befehl);
    };
    const beiBefehl = (e: Event) => {
      const detail = (e as CustomEvent<Befehl>).detail;
      if (typeof detail === 'string') void befehlAusfuehren(detail);
    };
    window.addEventListener('keydown', beiTaste);
    window.addEventListener(BEFEHL_EREIGNIS, beiBefehl);
    return () => {
      window.removeEventListener('keydown', beiTaste);
      window.removeEventListener(BEFEHL_EREIGNIS, beiBefehl);
    };
  }, []);
}
