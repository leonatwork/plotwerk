/**
 * Befehle der App – gemeinsam für Tastenkürzel und das native Menü (Tauri-Agent ruft
 * befehlAusfuehren auf oder sendet window.dispatchEvent(new CustomEvent('plotwerk:befehl', {detail: 'export'}))).
 */
import { oeffneVorschau, schliesseVorschau, vorschauOffen } from '../features/vorschau';
import { useStore, type Bereich } from '../state/store';
import { BEREICHE } from './bereiche';

export type Befehl =
  | Bereich
  | 'schnellsuche'
  | 'fokus'
  | 'export'
  | 'import'
  | 'einstellungen'
  | 'versionen'
  | 'pruefen'
  | 'buch-pruefen'
  | 'projekt-oeffnen'
  | 'vorschau'
  // Werkzeuge G1–G8
  | 'zeit-vorschlaege'
  | 'stimme-pruefen'
  | 'marken'
  | 'typewriter'
  | 'wiederholungen'
  | 'vorlesen'
  | 'fassung'
  | 'versionsvergleich'
  | 'leser-simulation'
  | 'abgabe'
  | 'rueckimport'
  | 'recherche-neu'
  | 'faden-neu';

export const BEFEHL_EREIGNIS = 'plotwerk:befehl';

/** Führt einen Befehl aus. Vor Export, Prüfung und Versionsverlauf werden ausstehende Eingaben gesichert. */
export async function befehlAusfuehren(befehl: Befehl): Promise<void> {
  const s = useStore.getState();
  if (BEREICHE.some((b) => b.id === befehl)) {
    if (s.daten) s.setzeBereich(befehl as Bereich);
    return;
  }
  const sichern = () => s.editorSichern().catch((e: unknown) => console.error('Sichern vor dem Befehl fehlgeschlagen:', e));
  switch (befehl) {
    case 'schnellsuche':
      if (s.daten) s.oeffneDialog('schnellsuche');
      break;
    case 'fokus':
      if (s.daten) s.umschalteFokus();
      break;
    case 'export':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('export');
      break;
    case 'import':
      s.oeffneDialog('import');
      break;
    case 'einstellungen':
      s.oeffneDialog('ki-einstellungen');
      break;
    case 'versionen':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('versionen', { kapitel: s.auswahl.kapitel });
      break;
    case 'pruefen':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('ki-pruefen', s.auswahl.kapitel ? { umfang: 'kapitel', kapitel: s.auswahl.kapitel } : { umfang: 'buch' });
      break;
    case 'buch-pruefen':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('ki-pruefen', { umfang: 'buch' });
      break;
    case 'vorschau':
      if (vorschauOffen()) schliesseVorschau();
      else if (s.daten) oeffneVorschau(s.auswahl.kapitel);
      break;
    // Werkzeuge G1–G8
    case 'zeit-vorschlaege':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('zeit-vorschlaege');
      break;
    case 'stimme-pruefen':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('stimme-pruefen', { figur: s.auswahl.figur });
      break;
    case 'marken':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('marken');
      break;
    case 'typewriter':
      if (s.daten) s.editorwerkzeuge.umschalteTypewriter();
      break;
    case 'wiederholungen':
      if (s.daten) s.editorwerkzeuge.umschalteWiederholungen();
      break;
    case 'vorlesen':
      if (s.daten) s.editorwerkzeuge.setzeVorlesen(s.editorwerkzeuge.vorlesen === 'laeuft' ? 'pausiert' : 'laeuft');
      break;
    case 'fassung':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('fassung');
      break;
    case 'versionsvergleich':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('versionsvergleich', { kapitel: s.auswahl.kapitel });
      break;
    case 'leser-simulation':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('leser-simulation', { kapitel: s.auswahl.kapitel });
      break;
    case 'abgabe':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('abgabe-export');
      break;
    case 'rueckimport':
      if (!s.daten) break;
      await sichern();
      s.oeffneDialog('rueckimport');
      break;
    case 'recherche-neu':
      if (s.daten) s.oeffneDialog('recherche-eintrag');
      break;
    case 'faden-neu':
      if (!s.daten) break;
      s.setzeBereich('faeden');
      s.struktur.setzeFadenNeuOffen(true);
      break;
    case 'projekt-oeffnen':
      await sichern();
      await s.alleSpeichernAbwarten();
      await s.projektOeffnen().catch((e: unknown) => console.error('Projekt öffnen fehlgeschlagen:', e));
      break;
  }
}

/** Befehl zu einem Tastendruck (nur ⌘, macOS). */
export function befehlFuerTaste(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'key' | 'code'>): Befehl | null {
  if (!e.metaKey || e.ctrlKey || e.altKey) return null;
  const taste = e.key.toLowerCase();
  if (e.shiftKey) return taste === 'f' ? 'fokus' : taste === 'b' ? 'vorschau' : taste === 't' ? 'typewriter' : taste === 's' ? 'fassung' : null;
  const bereich = BEREICHE.find((b) => b.taste && (b.taste === taste || e.code === `Digit${b.taste}`));
  if (bereich) return bereich.id;
  if (taste === 'k') return 'schnellsuche';
  if (taste === 'e') return 'export';
  if (taste === ',') return 'einstellungen';
  if (taste === 'o') return 'projekt-oeffnen';
  return null;
}
