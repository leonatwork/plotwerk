import { MemoryFs, ladeProjektMitBericht, serializeProjekt } from '@core/projekt';
import { STANDARD_KI } from '@core/ki/index';

type Handler = (e: { payload: unknown }) => unknown;

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  handler: new Map<string, (e: { payload: unknown }) => unknown>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, h: Handler) => {
    mocks.handler.set(name, h);
    return () => mocks.handler.delete(name);
  }),
}));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn(async () => ({ execute: vi.fn(), select: vi.fn(async () => []) })) } }));

import { erstelleTauriBackend, TauriFehler, TauriFs } from './index';

const INFO = { kennung: 7, pfad: '/Users/leon/Hafenlichter', name: 'Hafenlichter' };

/** Rust-Kommandos im Test: fs_* auf einem MemoryFs, der Rest über `weitere`. */
function rustImSpeicher(fs: MemoryFs, weitere: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  mocks.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
    switch (cmd) {
      case 'fs_lesen':
        return fs.lesen(args.pfad as string);
      case 'fs_schreiben':
        return fs.schreiben(args.pfad as string, args.inhalt as string);
      case 'fs_auflisten':
        return fs.auflisten(args.ordner as string);
      case 'fs_existiert':
        return fs.existiert(args.pfad as string);
      case 'fs_entfernen':
        return fs.entfernen(args.pfad as string);
    }
    const f = weitere[cmd];
    if (!f) throw `Unbekanntes Kommando ${cmd}`;
    return f(args);
  });
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.handler.clear();
});

describe('TauriFs', () => {
  it('Binärdateien: roher Body mit Kopfzeilen, Antwort als ArrayBuffer, nur unter recherche/', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    mocks.invoke.mockImplementation(async (cmd: string) => (cmd === 'fs_existiert' ? true : cmd === 'fs_lesen_binaer' ? bytes.buffer.slice(0) : undefined));
    const fs = new TauriFs(INFO);
    await fs.schreibenBinaer('recherche/dateien/büro.png', bytes);
    expect(mocks.invoke).toHaveBeenCalledWith('fs_schreiben_binaer', bytes, {
      headers: { 'plotwerk-kennung': '7', 'plotwerk-pfad': 'recherche%2Fdateien%2Fb%C3%BCro.png' },
    });
    expect(await fs.lesenBinaer('recherche/dateien/büro.png')).toEqual(bytes);
    expect(mocks.invoke).toHaveBeenCalledWith('fs_lesen_binaer', { kennung: 7, pfad: 'recherche/dateien/büro.png' }, undefined);
    await expect(fs.schreibenBinaer('manuskript/lotte.md', bytes)).rejects.toThrow('recherche/');
    mocks.invoke.mockImplementation(async (cmd: string) => (cmd === 'fs_existiert' ? false : undefined));
    expect(await fs.lesenBinaer('recherche/fehlt.png')).toBeNull();
  });

  it('gibt die Projektkennung mit und prüft Pfade vorher', async () => {
    mocks.invoke.mockResolvedValue('inhalt');
    const fs = new TauriFs(INFO);
    expect(await fs.lesen('./manuskript//lotte.md')).toBe('inhalt');
    expect(mocks.invoke).toHaveBeenCalledWith('fs_lesen', { kennung: 7, pfad: 'manuskript/lotte.md' }, undefined);
    await expect(fs.lesen('../geheim')).rejects.toThrow('„..“');
    await expect(fs.schreiben('/etc/hosts', 'x')).rejects.toThrow('Absoluter Pfad');
    await expect(fs.schreiben('', 'x')).rejects.toThrow('Leerer Pfad');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('macht aus Rust-Fehlertexten Error-Objekte', async () => {
    mocks.invoke.mockRejectedValue('Speichern fehlgeschlagen: x.md (keine Berechtigung)');
    const e = await new TauriFs(INFO).schreiben('x.md', 'a').catch((f: unknown) => f);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toContain('keine Berechtigung');
  });
});

describe('Tauri-Backend', () => {
  it('öffnet das letzte Projekt und lädt es über TauriFs', async () => {
    const speicher = new MemoryFs({
      'projekt.md': serializeProjekt({ version: 1, titel: 'Hafenlichter', kapitel: [], ki: STANDARD_KI, notiz: '' }),
    });
    rustImSpeicher(speicher, { projekt_letztes: () => INFO });
    const backend = await erstelleTauriBackend();
    expect(backend.art).toBe('tauri');
    const fs = await backend.letztesProjekt();
    expect(fs).toBeInstanceOf(TauriFs);
    const { daten, warnungen } = await ladeProjektMitBericht(fs!);
    expect(daten.projekt.titel).toBe('Hafenlichter');
    expect(warnungen).toEqual([]);
  });

  it('letztesProjekt ohne gemerktes Projekt oder bei Fehler: null', async () => {
    rustImSpeicher(new MemoryFs(), { projekt_letztes: () => null });
    expect(await (await erstelleTauriBackend()).letztesProjekt()).toBeNull();
    rustImSpeicher(new MemoryFs(), {
      projekt_letztes: () => {
        throw 'Projektordner nicht gefunden';
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await (await erstelleTauriBackend()).letztesProjekt()).toBeNull();
  });

  it('neues Projekt bekommt ein ladbares Grundgerüst', async () => {
    const speicher = new MemoryFs();
    rustImSpeicher(speicher, { projekt_neu: (a) => (a.titel === 'Hafenlichter' ? INFO : null) });
    const backend = await erstelleTauriBackend();
    const fs = await backend.neuesProjekt('Hafenlichter');
    expect(fs).not.toBeNull();
    expect(Object.keys(speicher.alleDateien())).toEqual([
      'anmerkungen.json',
      'entscheidungen.json',
      'plan/akte.md',
      'plan/ideen.md',
      'plan/straenge.md',
      'projekt.md',
    ]);
    const { daten, warnungen } = await ladeProjektMitBericht(fs!);
    expect(warnungen).toEqual([]);
    expect(daten.projekt.titel).toBe('Hafenlichter');
    expect(daten.projekt.ki?.deployments.pruefung).toBe('claude-sonnet-5-5');
  });

  it('Abbruch im Dialog ergibt null', async () => {
    rustImSpeicher(new MemoryFs(), { projekt_waehlen: () => null, projekt_neu: () => null, datei_waehlen: () => null, datei_speichern: () => null });
    const backend = await erstelleTauriBackend();
    expect(await backend.projektOeffnen()).toBeNull();
    expect(await backend.neuesProjekt('x')).toBeNull();
    expect(await backend.dateiWaehlen(['docx'])).toBeNull();
    expect(await backend.dateiSpeichern('Buch.pdf', new Uint8Array([1]))).toBe(false);
  });

  it('Datei wählen liest die Binärdaten über datei_lesen_extern', async () => {
    rustImSpeicher(new MemoryFs(), {
      datei_waehlen: (a) => {
        expect(a.endungen).toEqual(['docx']);
        return { name: 'Hafenlichter.docx', pfad: '/Users/leon/Downloads/Hafenlichter.docx' };
      },
      datei_lesen_extern: (a) => {
        expect(a.pfad).toBe('/Users/leon/Downloads/Hafenlichter.docx');
        return new Uint8Array([80, 75, 3, 4]).buffer;
      },
    });
    const datei = await (await erstelleTauriBackend()).dateiWaehlen(['docx']);
    expect(datei?.name).toBe('Hafenlichter.docx');
    expect([...datei!.daten]).toEqual([80, 75, 3, 4]);
  });

  it('Datei speichern schickt Rohdaten mit kodiertem Pfad', async () => {
    rustImSpeicher(new MemoryFs(), {
      datei_speichern: (a) => {
        expect(a.vorschlag).toBe('Hafenlichter.pdf');
        return '/Users/leon/Schreibtisch/Hafenlichter – Entwurf.pdf';
      },
      datei_schreiben_extern: () => undefined,
    });
    const daten = new Uint8Array([37, 80, 68, 70]);
    expect(await (await erstelleTauriBackend()).dateiSpeichern('Hafenlichter.pdf', daten)).toBe(true);
    expect(mocks.invoke).toHaveBeenLastCalledWith('datei_schreiben_extern', daten, {
      headers: { 'x-pfad': encodeURIComponent('/Users/leon/Schreibtisch/Hafenlichter – Entwurf.pdf') },
    });
  });

  it('KI-Transport: Endpoint aus projekt.md, Schlüssel bleibt im Rust-Kern', async () => {
    const speicher = new MemoryFs({
      'projekt.md': serializeProjekt({
        version: 1,
        titel: 'x',
        kapitel: [],
        ki: { ...STANDARD_KI, endpoint: 'https://flamingo.services.ai.azure.com/anthropic' },
        notiz: '',
      }),
    });
    rustImSpeicher(speicher, {
      projekt_letztes: () => INFO,
      schluessel_vorhanden: () => true,
      ki_anfrage: (a) => ({ echo: a.endpoint, body: a.body }),
      ki_tokens: () => 4321,
    });
    const backend = await erstelleTauriBackend();
    expect(await backend.ki.bereit()).toBe(false);
    await backend.letztesProjekt();
    expect(await backend.ki.bereit()).toBe(true);
    const antwort = await backend.ki.senden({ model: 'claude-sonnet-5-5', messages: [] });
    expect(antwort).toEqual({
      echo: 'https://flamingo.services.ai.azure.com/anthropic',
      body: { model: 'claude-sonnet-5-5', messages: [] },
    });
    expect(await backend.ki.tokenZaehlen({ model: 'm', messages: [] })).toBe(4321);
    const argumente = mocks.invoke.mock.calls.map((c) => JSON.stringify(c[1] ?? {}));
    expect(argumente.some((a) => /schluessel"|apiKey|x-api-key/i.test(a))).toBe(false);
  });

  it('KI-Endpoint: der Stand im Store hat Vorrang vor projekt.md', async () => {
    const datei = serializeProjekt({ version: 1, titel: 'x', kapitel: [], ki: { ...STANDARD_KI, endpoint: 'https://alt.example/anthropic' }, notiz: '' });
    rustImSpeicher(new MemoryFs({ 'projekt.md': datei }), {
      projekt_letztes: () => INFO,
      ki_anfrage: (a) => ({ endpoint: a.endpoint }),
    });
    const { useStore } = await import('../../state/store');
    const { daten } = await ladeProjektMitBericht(new MemoryFs({ 'projekt.md': datei }));
    useStore.setState({ daten: { ...daten, projekt: { ...daten.projekt, ki: { ...STANDARD_KI, endpoint: 'https://neu.example/anthropic' } } } });
    try {
      const backend = await erstelleTauriBackend();
      await backend.letztesProjekt();
      expect(await backend.ki.senden({})).toEqual({ endpoint: 'https://neu.example/anthropic' });
    } finally {
      useStore.setState({ daten: null });
    }
  });

  it('KI-Fehler kommen mit Status und Wartezeit an', async () => {
    const speicher = new MemoryFs({
      'projekt.md': serializeProjekt({ version: 1, titel: 'x', kapitel: [], ki: { ...STANDARD_KI, endpoint: 'https://a.example/anthropic' }, notiz: '' }),
    });
    rustImSpeicher(speicher, {
      projekt_letztes: () => INFO,
      ki_anfrage: () => {
        throw { meldung: 'Zu viele Anfragen oder Kontingent erschöpft (429).', status: 429, wiederholenNach: 20 };
      },
    });
    const backend = await erstelleTauriBackend();
    await backend.letztesProjekt();
    const e = await backend.ki.senden({}).catch((f: unknown) => f);
    expect(e).toBeInstanceOf(TauriFehler);
    expect((e as TauriFehler).status).toBe(429);
    expect((e as TauriFehler).wiederholenNach).toBe(20);
  });

  it('ohne Endpoint wird die KI nicht aufgerufen', async () => {
    rustImSpeicher(new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel: 'x', kapitel: [], ki: STANDARD_KI, notiz: '' }) }), {
      projekt_letztes: () => INFO,
      schluessel_vorhanden: () => true,
    });
    const backend = await erstelleTauriBackend();
    await backend.letztesProjekt();
    expect(await backend.ki.bereit()).toBe(false);
    await expect(backend.ki.senden({})).rejects.toThrow('Kein KI-Endpoint');
    expect(mocks.invoke.mock.calls.some((c) => c[0] === 'ki_anfrage')).toBe(false);
  });

  it('KI-Transport: Claude API aus projekt.md (Standard-Basis-URL, Modell-IDs, Fallback)', async () => {
    const ki = {
      ...STANDARD_KI,
      endpoint: 'https://flamingo.services.ai.azure.com/anthropic',
      anbieter: 'claude' as const,
      claude: { endpoint: '', modelle: { ...STANDARD_KI.deployments } },
    };
    rustImSpeicher(new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel: 'x', kapitel: [], ki, notiz: '' }) }), {
      projekt_letztes: () => INFO,
      schluessel_vorhanden: (a) => a.anbieter === 'claude',
      ki_anfrage: (a) => ({ endpoint: a.endpoint, anbieter: a.anbieter, fallbacks: (a.body as Record<string, unknown>).fallbacks ?? null }),
      ki_tokens: (a) => (a.anbieter === 'claude' ? 7 : 0),
    });
    const backend = await erstelleTauriBackend();
    await backend.letztesProjekt();
    expect(await backend.ki.bereit()).toBe(true);
    expect(await backend.ki.senden({ model: 'claude-sonnet-5-5', messages: [] })).toEqual({
      endpoint: 'https://api.anthropic.com',
      anbieter: 'claude',
      fallbacks: 'default',
    });
    expect(await backend.ki.senden({ model: 'claude-haiku-5-5', messages: [] })).toMatchObject({ fallbacks: null });
    expect(await backend.ki.tokenZaehlen({ model: 'claude-sonnet-5-5', messages: [] })).toBe(7);
  });

  it('Schlüssel je Anbieter: ohne Angabe Foundry, sonst eigener Eintrag', async () => {
    const gesetzt = new Set<string>();
    rustImSpeicher(new MemoryFs(), {
      schluessel_setzen: (a) => void gesetzt.add(a.anbieter as string),
      schluessel_vorhanden: (a) => gesetzt.has(a.anbieter as string),
      schluessel_loeschen: (a) => void gesetzt.delete(a.anbieter as string),
    });
    const { schluessel } = await erstelleTauriBackend();
    await schluessel.setzen('sk-ant-x', 'claude');
    expect(await schluessel.vorhanden('claude')).toBe(true);
    expect(await schluessel.vorhanden()).toBe(false);
    await schluessel.setzen('foundry-x');
    expect([...gesetzt].sort()).toEqual(['claude', 'foundry']);
    await schluessel.loeschen('claude');
    expect(await schluessel.vorhanden('claude')).toBe(false);
    expect(await schluessel.vorhanden('foundry')).toBe(true);
  });

  it('Schlüssel: setzen/vorhanden/löschen gehen an den Schlüsselbund', async () => {
    let gesetzt = false;
    rustImSpeicher(new MemoryFs(), {
      schluessel_setzen: () => {
        gesetzt = true;
      },
      schluessel_vorhanden: () => gesetzt,
      schluessel_loeschen: () => {
        gesetzt = false;
      },
    });
    const { schluessel } = await erstelleTauriBackend();
    await schluessel.setzen('geheim');
    expect(await schluessel.vorhanden()).toBe(true);
    await schluessel.loeschen();
    expect(await schluessel.vorhanden()).toBe(false);
  });

  it('Beenden: erst alle Rückrufe, dann app_beenden', async () => {
    rustImSpeicher(new MemoryFs(), { app_beenden: () => undefined });
    const backend = await erstelleTauriBackend();
    const reihenfolge: string[] = [];
    backend.beimBeenden(async () => {
      await new Promise((ok) => setTimeout(ok, 20));
      reihenfolge.push('schnappschuss');
    });
    mocks.invoke.mockClear();
    await mocks.handler.get('app-beenden')!({ payload: null });
    reihenfolge.push(...mocks.invoke.mock.calls.map((c) => c[0] as string));
    expect(reihenfolge).toEqual(['schnappschuss', 'app_beenden']);
  });

  it('Beenden wartet höchstens knapp 3 s', async () => {
    vi.useFakeTimers();
    try {
      rustImSpeicher(new MemoryFs(), { app_beenden: () => undefined });
      const backend = await erstelleTauriBackend();
      backend.beimBeenden(() => new Promise(() => undefined));
      const fertig = mocks.handler.get('app-beenden')!({ payload: null }) as Promise<void>;
      await vi.advanceTimersByTimeAsync(2900);
      await fertig;
      expect(mocks.invoke.mock.calls.some((c) => c[0] === 'app_beenden')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('externe Änderungen und Menübefehle kommen an', async () => {
    rustImSpeicher(new MemoryFs());
    const backend = await erstelleTauriBackend();
    const pfade: string[] = [];
    backend.aufExterneAenderung((p) => pfade.push(p));
    mocks.handler.get('datei-geaendert')!({ payload: { pfad: 'manuskript/lotte.md' } });
    expect(pfade).toEqual(['manuskript/lotte.md']);

    const befehle: unknown[] = [];
    const lauscher = (e: Event) => befehle.push((e as CustomEvent).detail);
    window.addEventListener('plotwerk:befehl', lauscher);
    mocks.handler.get('menue-befehl')!({ payload: 'export' });
    window.removeEventListener('plotwerk:befehl', lauscher);
    expect(befehle).toEqual(['export']);
  });
});
