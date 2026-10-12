/** Vorlesen-Rückfall über macOS `say`: Satz sprechen, abbrechen, Stimmen laden. */
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { SayAeusserung, SaySprachausgabe } from './vorlesen';

const warte = () => new Promise((r) => setTimeout(r, 0));

describe('SaySprachausgabe', () => {
  beforeEach(() => mocks.invoke.mockReset());

  it('spricht über vorlesen_sagen mit Stimme und Tempo und meldet das Ende', async () => {
    mocks.invoke.mockResolvedValue('fertig');
    const s = new SaySprachausgabe();
    const u = new SayAeusserung('Paul liest es einmal.');
    u.voice = { voiceURI: 'Markus', name: 'Markus', lang: 'de-DE', localService: true, default: false };
    u.rate = 1.2;
    const ende = vi.fn();
    u.onend = ende;
    s.speak(u);
    await warte();
    expect(mocks.invoke).toHaveBeenCalledWith('vorlesen_sagen', { text: 'Paul liest es einmal.', stimme: 'Markus', tempo: 1.2 }, undefined);
    expect(ende).toHaveBeenCalledOnce();
  });

  it('abgebrochen → onerror „canceled“, Stopp ruft vorlesen_stopp', async () => {
    mocks.invoke.mockImplementation(async (cmd: string) => (cmd === 'vorlesen_sagen' ? 'abgebrochen' : undefined));
    const s = new SaySprachausgabe();
    const u = new SayAeusserung('Satz.');
    const fehler = vi.fn();
    u.onerror = fehler;
    s.speak(u);
    s.cancel();
    await warte();
    expect(fehler).toHaveBeenCalledWith({ error: 'canceled' });
    expect(mocks.invoke).toHaveBeenCalledWith('vorlesen_stopp', undefined, undefined);
  });

  it('lädt die Stimmen einmal und meldet voiceschanged', async () => {
    mocks.invoke.mockResolvedValue([{ name: 'Markus', lang: 'de-DE' }]);
    const s = new SaySprachausgabe();
    const h = vi.fn();
    s.addEventListener('voiceschanged', h);
    expect(s.getVoices()).toEqual([]);
    await warte();
    expect(h).toHaveBeenCalledOnce();
    expect(s.getVoices().map((v) => [v.voiceURI, v.lang])).toEqual([['Markus', 'de-DE']]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
