import { create } from 'zustand';
import type { SicherungsBackend } from '../../backend/types';
import type { ProjektDateisystem } from '@core/projekt';
import { archivAufbauen, archivZeit, dateiname, zuLoeschen } from '@core/sicherungen';
import { sprache } from '../../i18n';
export const useSicherungsStatus = create<{ fehler: string | null; fertig: boolean }>(() => ({ fehler: null, fertig: false }));
const laufend = new WeakMap<SicherungsBackend, Promise<void>>();
/** Eigene Warteschlange, ausdrücklich nicht Teil von Autosave oder beimBeenden. Fehler bleiben ein Hinweis. */
export function sicherungStarten(api: SicherungsBackend, fs: ProjektDateisystem, automatisch: boolean, zeit = new Date()): Promise<void> {
  const lauf = (laufend.get(api) ?? Promise.resolve()).then(async () => {
    try {
      const einstellungen = await api.einstellungenLesen();
      if (automatisch && !einstellungen.automatisch) return;
      const { name, leser } = api.projekt(fs, einstellungen.mitVersionen);
      const namen = await api.auflisten(fs);
      const tag = archivZeit(dateiname(name, zeit), name)!.tag;
      if (automatisch && namen.some(n => archivZeit(n, name)?.tag === tag)) return;
      const daten = await archivAufbauen(leser, einstellungen.mitVersionen, sprache());
      const geschrieben = await api.schreiben(fs, dateiname(name, zeit), daten);
      // Erst nach erfolgreichem, dauerhaftem Schreiben löschen.
      for (const n of zuLoeschen([...namen, geschrieben], name)) await api.entfernen(fs, n);
      useSicherungsStatus.setState({ fehler: null, fertig: !automatisch });
    } catch (e) {
      useSicherungsStatus.setState({ fehler: e instanceof Error ? e.message : String(e), fertig: false });
    }
  });
  laufend.set(api, lauf);
  return lauf;
}
