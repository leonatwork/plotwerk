/** TS-seitige Fehlermeldungen des Tauri-Backends in der englischen Oberfläche. Rust übersetzt seine Meldungen selbst (sprache::t, tf!). */
import { describe, expect, it } from 'vitest';
import { festeSprache } from '../../i18n';
import { alsFehler } from './aufruf';
import { erstelleTauriKiTransport } from './kiTransport';
import { TauriFs } from './tauriFs';

describe('Backend-Meldungen auf Englisch', () => {
  it('fehlender Endpoint je Anbieter', async () => {
    festeSprache('en');
    const claude = erstelleTauriKiTransport(async () => ({ anbieter: 'claude', endpoint: ' ' }));
    await expect(claude.senden({})).rejects.toThrow('No base URL set for the Claude API. Check the AI settings (default: https://api.anthropic.com).');
    const foundry = erstelleTauriKiTransport(async () => ({ anbieter: 'foundry', endpoint: '' }));
    await expect(foundry.tokenZaehlen({})).rejects.toThrow('No AI endpoint set.');
  });

  it('leerer Pfad, Binärdateien, unbekannter Fehler eines Kommandos', async () => {
    festeSprache('en');
    const fs = new TauriFs({ kennung: 1, pfad: '/tmp/x', name: 'x' });
    await expect(fs.schreiben('', 'x')).rejects.toThrow('Empty path.');
    await expect(fs.schreibenBinaer('kapitel/a.bin', new Uint8Array())).rejects.toThrow('Binary files only under recherche/: kapitel/a.bin');
    expect(alsFehler(42, 'fs_lesen').message).toBe('fs_lesen failed: 42');
    // Meldungen aus Rust werden unverändert weitergegeben
    expect(alsFehler('Projektordner nicht gefunden', 'projekt_letztes').message).toBe('Projektordner nicht gefunden');
  });
});
