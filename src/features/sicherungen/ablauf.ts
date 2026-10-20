import type { Backend } from '../../backend/types';
import type { ProjektDateisystem } from '@core/projekt/fs';
import { archivAufbauen, rotation, sicherungsName, sicherungsZeit } from '@core/sicherungen';

/** Pro Dateisystem serialisiert; kein Beenden-Hook und kein Eintrag in der Autosave-Warteschlange. */
const laeufe = new WeakMap<ProjektDateisystem, Promise<void>>();
export async function sichereProjekt(backend: Backend, fs: ProjektDateisystem, titel: string, manuell: boolean): Promise<void> {
  if (backend.art !== 'tauri' || !backend.sicherungen) return;
  const api = backend.sicherungen;
  const lauf = (laeufe.get(fs) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const einstellung = await api.einstellungen();
    if (!manuell && !einstellung.aktiv) return;
    const zeit = new Date();
    const name = sicherungsName(titel, zeit);
    const archive = await api.auflisten(fs);
    const namen = archive.map((a) => a.name);
    const heute = name.slice(0, -8);
    if (!manuell && namen.some((n) => sicherungsZeit(n, titel) && n.startsWith(heute))) return;
    // Minutenmuster bleibt verbindlich: bei Kollision nächste freie Minute verwenden, nie überschreiben.
    while (namen.includes(sicherungsName(titel, zeit))) zeit.setMinutes(zeit.getMinutes() + 1);
    const neu = sicherungsName(titel, zeit);
    await api.schreiben(fs, neu, await archivAufbauen(api.leser?.(fs) ?? fs, einstellung.mitVersionen));
    for (const alt of rotation([...namen, neu], titel)) await api.entfernen(fs, alt);
  });
  laeufe.set(fs, lauf);
  try { await lauf; } finally { if (laeufe.get(fs) === lauf) laeufe.delete(fs); }
}
