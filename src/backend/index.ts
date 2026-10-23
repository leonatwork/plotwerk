/** Backend-Auswahl: Tauri, wenn die App in Tauri läuft, sonst Browser-Demo. */
import type { Backend } from './types';

export type { Backend, GewaehlteDatei, GewaehlterOrdner } from './types';

export function istTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function waehleBackend(): Promise<Backend> {
  if (istTauri()) {
    const { erstelleTauriBackend } = await import('./tauri/index');
    return erstelleTauriBackend();
  }
  const { erstelleDemoBackend } = await import('./demo');
  return erstelleDemoBackend();
}
