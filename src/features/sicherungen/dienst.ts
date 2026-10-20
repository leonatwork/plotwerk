import { useStore } from '../../state/store';
import { f, texte } from '../../i18n';
import type { ProjektDateisystem } from '@core/projekt';
import type { Backend } from '../../backend/types';

/** Absichtlich weder Speicherwarteschlange noch Beenden-Callback: Fehler sperren nie den Editor. */
export async function sichereProjekt(automatisch: boolean, projekt?: { backend: Backend | null; fs: ProjektDateisystem }): Promise<void> {
  const { backend, fs } = projekt ?? useStore.getState();
  if (!backend?.archiv || backend.art !== 'tauri' || !fs) return;
  try {
    await backend.archiv.sichern(fs, automatisch);
  } catch (e) {
    useStore.setState({ fehler: f(texte().sicherungen.fehler, { grund: e instanceof Error ? e.message : String(e) }) });
  }
}
