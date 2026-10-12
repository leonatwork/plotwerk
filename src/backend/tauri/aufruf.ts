/** invoke mit verständlichen Fehlern: Rust-Kommandos liefern Meldungen in der Oberflächensprache als String oder {meldung}. */
import { invoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core';
import { f, texte } from '../../i18n';

export class TauriFehler extends Error {
  /** HTTP-Status bei KI-Fehlern (401, 404, 429 …) */
  readonly status?: number;
  /** Sekunden bis zum nächsten Versuch (429, Retry-After) */
  readonly wiederholenNach?: number;

  constructor(meldung: string, status?: number, wiederholenNach?: number) {
    super(meldung);
    this.name = 'TauriFehler';
    if (status != null) this.status = status;
    if (wiederholenNach != null) this.wiederholenNach = wiederholenNach;
  }
}

export function alsFehler(e: unknown, kommando: string): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new TauriFehler(e);
  if (e && typeof e === 'object' && typeof (e as { meldung?: unknown }).meldung === 'string') {
    const f = e as { meldung: string; status?: number | null; wiederholenNach?: number | null };
    return new TauriFehler(f.meldung, f.status ?? undefined, f.wiederholenNach ?? undefined);
  }
  return new TauriFehler(f(texte().backend.aufrufFehlgeschlagen, { kommando, fehler: String(e) }));
}

export async function aufruf<T>(kommando: string, args?: InvokeArgs, optionen?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(kommando, args, optionen);
  } catch (e) {
    throw alsFehler(e, kommando);
  }
}
