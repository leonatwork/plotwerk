/**
 * Recherche (G8): Link im Standardbrowser öffnen – nur auf ausdrücklichen Klick, die App lädt nie selbst
 * fremde Seiten. Rust: recherche::link_oeffnen (nur http/https, `/usr/bin/open`).
 */
import { aufruf } from './aufruf';

export async function linkImBrowserOeffnen(url: string): Promise<void> {
  await aufruf<void>('link_oeffnen', { url });
}
