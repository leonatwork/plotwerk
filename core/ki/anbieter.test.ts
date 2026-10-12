/**
 * KI-Anbieter (Foundry | Claude API): ältere projekt.md bleiben gültig (= Foundry), beim Umschalten
 * geht die Konfiguration des anderen Anbieters nicht verloren, Modellwahl je Anbieter.
 */
import { parseProjekt, serializeProjekt } from '../projekt';
import type { KiEinstellungen, Projekt } from '../model/types';
import {
  CLAUDE_API_ENDPOINT,
  kiAnbieter,
  kiEndpoint,
  kiMitStandards,
  kiModell,
  STANDARD_KI,
} from './index';

/** projekt.md im Format vor der Claude API (nur endpoint + deployments). */
const ALT = `---
version: 1
titel: Hafenlichter
kapitel:
  - grundriss
ki:
  endpoint: https://beispiel.services.ai.azure.com/anthropic
  deployments:
    erkennung: mein-haiku
    pruefung: mein-sonnet
    tiefencheck: mein-opus
---

Notiz.
`;

const CLAUDE: KiEinstellungen = {
  endpoint: 'https://beispiel.services.ai.azure.com/anthropic',
  deployments: { erkennung: 'mein-haiku', pruefung: 'mein-sonnet', tiefencheck: 'mein-opus' },
  anbieter: 'claude',
  claude: {
    endpoint: CLAUDE_API_ENDPOINT,
    modelle: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
  },
};

describe('KI-Anbieter', () => {
  it('ältere projekt.md lädt unverändert und gilt als Foundry', () => {
    const p = parseProjekt(ALT);
    expect(p.ki).toEqual({
      endpoint: 'https://beispiel.services.ai.azure.com/anthropic',
      deployments: { erkennung: 'mein-haiku', pruefung: 'mein-sonnet', tiefencheck: 'mein-opus' },
    });
    expect(kiAnbieter(p.ki)).toBe('foundry');
    expect(kiModell(p.ki, 'pruefung')).toBe('mein-sonnet');
    expect(kiEndpoint(p.ki)).toBe('https://beispiel.services.ai.azure.com/anthropic');
    // unverändert zurückgeschrieben: kein anbieter/claude-Block, Datei bleibt identisch
    expect(serializeProjekt(p, ALT)).toBe(ALT);
  });

  it('ohne ki-Block bzw. ohne Angaben: Foundry mit Standardmodellen', () => {
    expect(kiAnbieter(undefined)).toBe('foundry');
    expect(kiModell(undefined, 'erkennung')).toBe('claude-haiku-5-5');
    expect(kiEndpoint(STANDARD_KI)).toBe('');
    expect(kiMitStandards(undefined)).toEqual({
      endpoint: '',
      deployments: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
      anbieter: 'foundry',
      claude: {
        endpoint: 'https://api.anthropic.com',
        modelle: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
      },
    });
  });

  it('Claude API: Modell-IDs und Basis-URL (leer = https://api.anthropic.com)', () => {
    const ki: KiEinstellungen = { ...CLAUDE, claude: { endpoint: '  ', modelle: { erkennung: '', pruefung: 'claude-sonnet-5', tiefencheck: '' } } };
    expect(kiAnbieter(ki)).toBe('claude');
    expect(kiEndpoint(ki)).toBe('https://api.anthropic.com');
    expect(kiModell(ki, 'erkennung')).toBe('claude-haiku-5-5');
    expect(kiModell(ki, 'pruefung')).toBe('claude-sonnet-5');
    // Foundry-Deployments werden bei der Claude API nicht benutzt
    expect(kiModell(ki, 'tiefencheck')).toBe('claude-opus-5-5');
    // ohne claude-Block: Standard
    expect(kiModell({ ...CLAUDE, claude: undefined }, 'pruefung')).toBe('claude-sonnet-5-5');
  });

  it('Roundtrip mit beiden Anbietern; Umschalten verliert nichts', () => {
    const projekt: Projekt = { ...parseProjekt(ALT), ki: CLAUDE };
    const text = serializeProjekt(projekt, ALT);
    expect(text).toContain('anbieter: claude');
    expect(text).toContain('endpoint: https://api.anthropic.com');
    expect(parseProjekt(text).ki).toEqual(CLAUDE);

    // zurück zu Foundry: Claude-Einstellungen bleiben in der Datei
    const zurueck = serializeProjekt({ ...projekt, ki: { ...CLAUDE, anbieter: 'foundry' } }, text);
    const geladen = parseProjekt(zurueck).ki!;
    expect(kiAnbieter(geladen)).toBe('foundry');
    expect(geladen.claude).toEqual(CLAUDE.claude);
    expect(geladen.deployments).toEqual(CLAUDE.deployments);

    // ein Aufrufer, der nur endpoint/deployments kennt, löscht den Claude-Block nicht
    const nurFoundry = serializeProjekt({ ...projekt, ki: { endpoint: CLAUDE.endpoint, deployments: CLAUDE.deployments, anbieter: 'foundry' } }, zurueck);
    expect(parseProjekt(nurFoundry).ki?.claude).toEqual(CLAUDE.claude);
  });

  it('Schlüsselreihenfolge in projekt.md: endpoint, deployments, anbieter, claude', () => {
    const text = serializeProjekt({ version: 1, titel: 'x', kapitel: [], ki: CLAUDE, notiz: '' });
    const ki = text.slice(text.indexOf('ki:'));
    const pos = ['endpoint:', 'deployments:', 'anbieter:', 'claude:', 'modelle:'].map((k) => ki.indexOf(k));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it('unbekannter Anbieter in der Datei gilt als Foundry, unbekannte Felder bleiben erhalten', () => {
    const datei = ALT.replace('  endpoint: https', '  anbieter: openai\n  eigenesFeld: 1\n  endpoint: https');
    const p = parseProjekt(datei);
    expect(p.ki?.anbieter).toBeUndefined();
    expect(kiAnbieter(p.ki)).toBe('foundry');
    expect(serializeProjekt(p, datei)).toContain('eigenesFeld: 1');
  });
});
