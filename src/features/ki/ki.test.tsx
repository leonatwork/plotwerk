import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hinweisSchluessel } from '@core/index/index';
import type { KiTransport } from '@core/ki/index';
import { analysePfad, MemoryFs, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import type { Backend } from '../../backend/types';
import { erstelleStore, useStore } from '../../state/store';
import { EinstellungenDialog, endpointNormalisieren } from './EinstellungenDialog';
import { ErwaehnungsVorschlaege } from './ErwaehnungsVorschlaege';
import { PruefDialog } from './PruefDialog';

function testBackend(ki: KiTransport = erstelleDemoKiTransport({ verzoegerungMs: 0 })): Backend {
  return { ...erstelleDemoBackend(), ki };
}

/** Demo-Projekt ohne frühere KI-Analysen (die Fixture kann aktuelle Analysen enthalten). */
function frischFs(): MemoryFs {
  const d = demoDateien();
  for (const p of Object.keys(d)) if (p.startsWith(`${PFADE.analysen}/`)) delete d[p];
  return new MemoryFs(d);
}

async function laden(store: typeof useStore, ki?: KiTransport) {
  const fs = frischFs();
  store.setState({ backend: testBackend(ki) });
  await store.getState().projektLaden(fs);
  return fs;
}

describe('Slice „ki“', () => {
  it('prüft, speichert Hinweise (Merge nach Schlüssel) und Analysen, beim zweiten Lauf greift der Cache', async () => {
    const store = erstelleStore();
    const fs = await laden(store);
    const vorher = store.getState().daten!.kiHinweise.length;
    await store.getState().kiPruefen({ umfang: 'buch' });
    const s = store.getState();
    expect(s.kiFehler).toBeNull();
    expect(s.kiLauf).toBeNull();
    expect(s.kiErgebnis?.geprueft).toHaveLength(9);
    const nachher = s.daten!.kiHinweise;
    expect(nachher.length).toBe(vorher + s.kiErgebnis!.neu);
    expect(new Set(nachher.map((h) => hinweisSchluessel(h.typ, h.zitate))).size).toBe(nachher.length);
    // die vier Fixture-Hinweise (Fiete, zweite Postkarte, Lotte, Zeitleiste) werden wiedererkannt, nicht verdoppelt
    expect(s.kiErgebnis!.hinweise.length - s.kiErgebnis!.neu).toBe(4);
    await s.alleSpeichernAbwarten();
    expect(JSON.parse((await fs.lesen(PFADE.hinweise))!)).toHaveLength(nachher.length);
    const funkstille = JSON.parse((await fs.lesen(analysePfad('funkstille')))!);
    expect(funkstille.textHash).not.toBe('');
    expect(funkstille.modell).toBe('claude-sonnet-5-5');

    await store.getState().kiPruefen({ umfang: 'buch' });
    expect(store.getState().kiErgebnis?.geprueft).toEqual([]);
    expect(store.getState().kiErgebnis?.uebersprungen).toHaveLength(9);
  });

  it('behält den Status bereits gespeicherter Hinweise beim Merge', async () => {
    const store = erstelleStore();
    await laden(store);
    await store.getState().kiPruefen({ umfang: 'kapitel', kapitel: 'funkstille' });
    const fiete = store.getState().daten!.kiHinweise.find((h) => h.typ === 'unbekannt' && h.titel.includes('Fiete'))!;
    await store.getState().speichereKiHinweise(store.getState().daten!.kiHinweise.map((h) => (h === fiete ? { ...h, status: 'erledigt' } : h)));
    await store.getState().kiPruefen({ umfang: 'kapitel', kapitel: 'funkstille', erzwingen: true });
    const danach = store.getState().daten!.kiHinweise.filter((h) => h.schluessel === fiete.schluessel);
    expect(danach).toHaveLength(1);
    expect(danach[0]!.status).toBe('erledigt');
  });

  it('der API-Schlüssel landet nie im Store', async () => {
    const store = erstelleStore();
    await laden(store);
    await store.getState().kiSchluesselSetzen('  sk-ant-GEHEIMER-SCHLUESSEL-123 ');
    expect(store.getState().kiSchluessel).toBe('vorhanden');
    const { backend, fs, ...rest } = store.getState();
    void backend;
    void fs;
    expect(JSON.stringify(rest)).not.toContain('GEHEIMER');
    await store.getState().kiSchluesselLoeschen();
    expect(store.getState().kiSchluessel).toBe('fehlt');
  });

  it('meldet fehlende Einrichtung verständlich', async () => {
    const store = erstelleStore();
    const ki = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    await laden(store, { ...ki, bereit: async () => false });
    await store.getState().kiPruefen({ umfang: 'buch' });
    expect(store.getState().kiFehler).toEqual({ art: 'nicht_bereit', text: 'Die KI ist noch nicht eingerichtet: API-Schlüssel oder Endpoint fehlt.' });
  });

  it('übersetzt HTTP-Fehler in verständliche Meldungen', async () => {
    const store = erstelleStore();
    const ki = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    await laden(store, { ...ki, senden: async () => Promise.reject('HTTP 401: invalid x-api-key') });
    await store.getState().kiPruefen({ umfang: 'kapitel', kapitel: 'ebbe' });
    expect(store.getState().kiFehler?.art).toBe('nicht_bereit');
    expect(store.getState().kiFehler?.text).toContain('API-Schlüssel wurde abgelehnt');
  });

  it('Vorschläge: holen, verwerfen, Figur anlegen → entscheidungen.zuordnungen', async () => {
    const store = erstelleStore();
    await laden(store);
    await store.getState().kiVorschlaegeHolen('funkstille');
    const liste = store.getState().kiVorschlaege.funkstille!.liste;
    expect(liste.map((v) => v.text)).toEqual(['Linden-Hof', 'Der Mann am Fischstand', 'Fiete']);

    await store.getState().kiVorschlagEntscheiden(liste[1]!, 'verworfen');
    await store.getState().kiVorschlagEntscheiden(liste[0]!, 'bestaetigt');
    const ziel = await store.getState().kiVorschlagAnlegen(liste[2]!);
    expect(ziel).toEqual({ typ: 'figur', id: 'fiete' });
    const s = store.getState();
    expect(s.daten!.figuren.fiete).toMatchObject({ name: 'Fiete', rolle: 'neben', wahrheit: '', notizen: '' });
    expect(s.daten!.entscheidungen.zuordnungen.map((z) => [z.anker.exakt, z.status, z.ziel])).toEqual([
      ['Der Mann am Fischstand', 'verworfen', null],
      ['Linden-Hof', 'bestaetigt', { typ: 'ort', id: 'lindenhof' }],
      ['Fiete', 'bestaetigt', { typ: 'figur', id: 'fiete' }],
    ]);
    expect(s.kiVorschlaege.funkstille!.liste).toEqual([]);

    // entschiedene Stellen kommen beim nächsten Holen nicht wieder
    await s.kiVorschlaegeHolen('funkstille');
    expect(store.getState().kiVorschlaege.funkstille!.liste).toEqual([]);
  });
});

describe('Dialoge und Vorschläge (UI)', () => {
  beforeEach(async () => {
    useStore.setState({ kiErgebnis: null, kiFehler: null, kiLauf: null, kiVorschlaege: {}, dialog: null });
    await laden(useStore);
  });

  it('Prüf-Dialog: Schätzung vor dem Start, Prüfung, Ergebnis mit Verworfenem', async () => {
    const schliessen = vi.fn();
    render(<PruefDialog param={{ umfang: 'kapitel', kapitel: 'funkstille' }} schliessen={schliessen} />);
    expect(screen.getByRole('button', { name: 'Kap. 10 „Funkstille“' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/claude-sonnet-5-5 · Effort medium/)).toBeInTheDocument();
    expect(screen.getByText('1 Kapitel')).toBeInTheDocument();
    expect(screen.getByText(/\$ \(grob, Listenpreis\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ganzes Buch/ }));
    expect(await screen.findByText('9 Kapitel')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    expect(await screen.findByText(/claude-opus-5-5 · Effort high/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    await screen.findByText(/claude-sonnet-5-5/);

    fireEvent.click(screen.getByRole('button', { name: 'Prüfung starten' }));
    expect(await screen.findByRole('heading', { name: 'Prüfung abgeschlossen' })).toBeInTheDocument();
    expect(screen.getByText(/Hinweise? neu/)).toBeInTheDocument();
    expect(screen.getByText('9 geprüft')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Gründe für Verworfenes anzeigen'));
    expect(screen.getByText(/Zitat steht nicht wörtlich/)).toBeInTheDocument();
    expect(screen.getByText(/Formulierungsvorschlag/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hinweise ansehen' }));
    expect(useStore.getState().bereich).toBe('hinweise');
    expect(schliessen).toHaveBeenCalled();
  });

  it('Prüf-Dialog: unverändertes Kapitel → nichts zu tun, „trotzdem prüfen“ möglich', async () => {
    await act(() => useStore.getState().kiPruefen({ umfang: 'kapitel', kapitel: 'ebbe' }));
    render(<PruefDialog param={{ umfang: 'kapitel', kapitel: 'ebbe' }} schliessen={() => {}} />);
    expect(await screen.findByText('Das Kapitel ist seit der letzten Prüfung unverändert. Nichts zu tun.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prüfung starten' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Unveränderte Kapitel trotzdem neu prüfen'));
    expect(await screen.findByText('1 Kapitel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prüfung starten' })).toBeEnabled();
  });

  it('Prüf-Dialog: kein Schlüssel → Hinweis mit „Einstellungen öffnen“', async () => {
    const ki = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    useStore.setState({ backend: testBackend({ ...ki, bereit: async () => false }) });
    render(<PruefDialog param={{ umfang: 'kapitel', kapitel: 'lotte' }} schliessen={() => {}} />);
    await screen.findByText('1 Kapitel');
    fireEvent.click(screen.getByRole('button', { name: 'Prüfung starten' }));
    expect(await screen.findByText('Die KI ist noch nicht eingerichtet: API-Schlüssel oder Endpoint fehlt.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(useStore.getState().dialog?.id).toBe('ki-einstellungen');
  });

  it('Einstellungen: Endpoint normalisiert speichern, Schlüssel nie anzeigen', async () => {
    const schliessen = vi.fn();
    const { container } = render(<EinstellungenDialog schliessen={schliessen} />);
    expect(await screen.findByText('Kein Schlüssel hinterlegt')).toBeInTheDocument();

    const feld = screen.getByLabelText('Schlüssel eingeben');
    expect(feld).toHaveAttribute('type', 'password');
    fireEvent.change(feld, { target: { value: 'sk-ant-GEHEIM-987' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinterlegen' }));
    expect(await screen.findByText('Im Schlüsselbund hinterlegt')).toBeInTheDocument();
    expect(screen.getByText('Schlüssel hinterlegt.')).toBeInTheDocument();
    expect((screen.getByLabelText('Neuen Schlüssel eingeben') as HTMLInputElement).value).toBe('');
    expect(container.ownerDocument.body.innerHTML).not.toContain('GEHEIM-987');
    expect(screen.getByRole('button', { name: 'Ersetzen' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://falsch' } });
    expect(screen.getByText('Der Endpoint muss mit https:// beginnen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: ' https://plotwerk.services.ai.azure.com/anthropic/v1/messages/ ' } });
    fireEvent.change(screen.getByLabelText('Prüfung (Sonnet)'), { target: { value: 'sonnet-eu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sichern' }));
    await waitFor(() => expect(schliessen).toHaveBeenCalled());
    expect(useStore.getState().daten!.projekt.ki).toEqual({
      endpoint: 'https://plotwerk.services.ai.azure.com/anthropic',
      deployments: { erkennung: 'claude-haiku-5-5', pruefung: 'sonnet-eu', tiefencheck: 'claude-opus-5-5' },
      anbieter: 'foundry',
      claude: {
        endpoint: 'https://api.anthropic.com',
        modelle: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
      },
    });
  });

  it('Einstellungen: Anbieter umschalten ohne Datenverlust, Schlüssel je Anbieter', async () => {
    useStore.setState({ kiSchluesselJe: { foundry: 'unbekannt', claude: 'unbekannt', openai: 'unbekannt' }, kiSchluessel: 'unbekannt' });
    const schliessen = vi.fn();
    render(<EinstellungenDialog schliessen={schliessen} />);
    const foundry = screen.getByRole('button', { name: 'Microsoft Foundry' });
    const claude = screen.getByRole('button', { name: 'Claude API' });
    expect(foundry).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Kein Schlüssel hinterlegt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();

    // Foundry-Endpoint eintragen, dann zur Claude API wechseln
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://flamingo.services.ai.azure.com/anthropic' } });
    fireEvent.click(claude);
    expect(claude).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Endpoint')).toBeNull();
    expect(screen.getByRole('heading', { name: 'API-Schlüssel · Claude API' })).toBeInTheDocument();
    expect(screen.getByLabelText('Basis-URL')).toHaveValue('https://api.anthropic.com');
    expect(screen.getByLabelText('Prüfung (Sonnet)')).toHaveValue('claude-sonnet-5-5');
    expect(screen.getByText(/serverseitiger Fallback/)).toBeInTheDocument();
    expect(screen.getByText(/^An Claude API gehen nur/)).toBeInTheDocument();

    // Schlüssel für die Claude API: eigener Eintrag, Foundry bleibt ohne Schlüssel
    fireEvent.change(screen.getByLabelText('Schlüssel eingeben'), { target: { value: 'sk-ant-api-GEHEIM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinterlegen' }));
    expect(await screen.findByText('Im Schlüsselbund hinterlegt')).toBeInTheDocument();
    expect(useStore.getState().kiSchluesselJe).toMatchObject({ claude: 'vorhanden', foundry: 'fehlt' });

    fireEvent.change(screen.getByLabelText('Basis-URL'), { target: { value: 'http://unsicher.example' } });
    expect(screen.getByText('Der Endpoint muss mit https:// beginnen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Basis-URL'), { target: { value: 'https://api.anthropic.com/v1/messages' } });
    fireEvent.change(screen.getByLabelText('Tiefencheck (Opus)'), { target: { value: 'claude-opus-5' } });

    // zurück zu Foundry: Endpoint ist noch da, Status zeigt den Foundry-Schlüssel
    fireEvent.click(foundry);
    expect(screen.getByLabelText('Endpoint')).toHaveValue('https://flamingo.services.ai.azure.com/anthropic');
    expect(await screen.findByText('Kein Schlüssel hinterlegt')).toBeInTheDocument();
    // und wieder zur Claude API: die Änderungen sind noch da
    fireEvent.click(claude);
    expect(screen.getByLabelText('Tiefencheck (Opus)')).toHaveValue('claude-opus-5');
    expect(await screen.findByText('Im Schlüsselbund hinterlegt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sichern' }));
    await waitFor(() => expect(schliessen).toHaveBeenCalled());
    const ki = useStore.getState().daten!.projekt.ki!;
    expect(ki).toEqual({
      endpoint: 'https://flamingo.services.ai.azure.com/anthropic',
      deployments: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
      anbieter: 'claude',
      claude: {
        endpoint: 'https://api.anthropic.com',
        modelle: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5' },
      },
    });
    expect(useStore.getState().kiSchluessel).toBe('vorhanden');
    expect(useStore.getState().kiEinstellungen().anbieter).toBe('claude');

    // Wechsel zurück zu Foundry und speichern: Claude-Einstellungen bleiben in projekt.md
    await useStore.getState().kiEinstellungenSpeichern({ endpoint: ki.endpoint, deployments: ki.deployments, anbieter: 'foundry' });
    await useStore.getState().alleSpeichernAbwarten();
    const datei = (await useStore.getState().fs!.lesen('projekt.md'))!;
    expect(datei).toContain('anbieter: foundry');
    expect(datei).toContain('tiefencheck: claude-opus-5\n');
    expect(useStore.getState().daten!.projekt.ki?.claude?.modelle.tiefencheck).toBe('claude-opus-5');
    expect(useStore.getState().kiSchluessel).toBe('fehlt');
  });

  it('Einstellungen: OpenAI-kompatibler Dienst mit Vorlage, Modell und Kontextlänge', async () => {
    useStore.setState({ kiSchluesselJe: { foundry: 'unbekannt', claude: 'unbekannt', openai: 'unbekannt' }, kiSchluessel: 'unbekannt' });
    const schliessen = vi.fn();
    render(<EinstellungenDialog schliessen={schliessen} />);
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI-kompatibel' }));

    // Standard: Ollama auf diesem Mac, ohne Schlüssel, ohne Modell
    expect(screen.getByLabelText('Dienst')).toHaveValue('ollama');
    expect(screen.getByLabelText('Basis-URL')).toHaveValue('http://localhost:11434/v1');
    expect(screen.getByLabelText('Prüfung')).toHaveAttribute('placeholder', 'qwen3:32b');
    expect(screen.getByText('Bitte mindestens ein Modell eintragen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'API-Schlüssel · Ollama' })).toBeInTheDocument();
    expect(screen.getByText(/Für Ollama ist kein Schlüssel nötig/)).toBeInTheDocument();
    expect(screen.getByText(/verlässt den Rechner nicht/)).toBeInTheDocument();
    expect(screen.getByText(/OLLAMA_CONTEXT_LENGTH/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Prüfung'), { target: { value: 'qwen3:32b' } });
    fireEvent.change(screen.getByLabelText('Kontextlänge (Tokens)'), { target: { value: 'viel' } });
    expect(screen.getByText('Bitte eine ganze Zahl eintragen (oder leer lassen).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Kontextlänge (Tokens)'), { target: { value: '131.072' } });
    // http nur für localhost
    fireEvent.change(screen.getByLabelText('Basis-URL'), { target: { value: 'http://192.168.1.20:11434/v1' } });
    expect(screen.getByText('Die Adresse muss mit https:// beginnen (http:// nur für localhost).')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Basis-URL'), { target: { value: 'http://127.0.0.1:11434/v1/chat/completions' } });

    fireEvent.click(screen.getByRole('button', { name: 'Sichern' }));
    await waitFor(() => expect(schliessen).toHaveBeenCalled());
    const ki = useStore.getState().daten!.projekt.ki!;
    expect(ki.anbieter).toBe('openai');
    expect(ki.openai).toEqual({
      vorlage: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      modelle: { erkennung: '', pruefung: 'qwen3:32b', tiefencheck: '' },
      kontextTokens: 131072,
    });
    expect(useStore.getState().kiEinstellungen().deployments.pruefung).toBe('claude-sonnet-5-5');
  });

  it('Einstellungen: Dienst wechseln setzt dessen Standard-URL, Cloud-Dienste verlangen einen Schlüssel', () => {
    render(<EinstellungenDialog schliessen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI-kompatibel' }));
    fireEvent.change(screen.getByLabelText('Dienst'), { target: { value: 'openrouter' } });
    expect(screen.getByLabelText('Basis-URL')).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByRole('heading', { name: 'API-Schlüssel · OpenRouter' })).toBeInTheDocument();
    expect(screen.queryByText(/kein Schlüssel nötig/)).toBeNull();
    expect(screen.getByPlaceholderText('API-Schlüssel von OpenRouter einfügen')).toBeInTheDocument();
    expect(screen.getByText(/keine Daten speichern oder zum Training nutzen/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Dienst'), { target: { value: 'eigen' } });
    expect(screen.getByLabelText('Basis-URL')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Sichern' })).toBeDisabled();
  });

  it('endpointNormalisieren', () => {
    expect(endpointNormalisieren('https://x.services.ai.azure.com/anthropic/')).toBe('https://x.services.ai.azure.com/anthropic');
    expect(endpointNormalisieren('https://x.services.ai.azure.com/anthropic/v1/messages/count_tokens')).toBe('https://x.services.ai.azure.com/anthropic');
  });

  it('Erwähnungs-Vorschläge: holen, Stelle zeigen, Figur anlegen, verwerfen', async () => {
    render(<ErwaehnungsVorschlaege kapitel="funkstille" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschläge holen' }));
    const liste = await screen.findByRole('list');
    const eintraege = within(liste).getAllByRole('listitem');
    expect(eintraege.map((e) => within(e).getAllByRole('button')[0]!.textContent)).toEqual(['Linden-Hof', 'Der Mann am Fischstand', 'Fiete']);
    expect(within(eintraege[0]!).getByText('Lindenhof')).toBeInTheDocument();
    expect(within(eintraege[2]!).getByText('unbekannte Figur')).toBeInTheDocument();

    fireEvent.click(within(eintraege[2]!).getByRole('button', { name: 'Fiete' }));
    expect(useStore.getState().markierung?.anker.exakt).toBe('Fiete');

    fireEvent.click(within(eintraege[2]!).getByRole('button', { name: 'Figur anlegen' }));
    expect(await screen.findByText(/Figur „Fiete“ angelegt\./)).toBeInTheDocument();
    expect(useStore.getState().daten!.figuren.fiete?.name).toBe('Fiete');

    fireEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    expect(await screen.findByText('Keine offenen Vorschläge.')).toBeInTheDocument();
    expect(useStore.getState().daten!.entscheidungen.zuordnungen).toHaveLength(3);
  });

  it('Erwähnungs-Vorschläge: „Als Spitznamen merken“ bestätigt und ergänzt den Spitznamen (ohne Artikel)', async () => {
    render(<ErwaehnungsVorschlaege kapitel="funkstille" />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschläge holen' }));
    await screen.findByRole('list');
    // Demo liefert keine indirekte Figuren-Erwähnung: den ersten Vorschlag auf „der Krabbenmann“ → Paul umbiegen
    act(() => {
      useStore.setState((st) => {
        const e = st.kiVorschlaege['funkstille']!;
        return { kiVorschlaege: { ...st.kiVorschlaege, funkstille: { ...e, liste: [{ ...e.liste[0]!, text: 'der Krabbenmann', ziel: { typ: 'figur', id: 'paul' } }] } } };
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Als Spitznamen merken' }));
    expect(await screen.findByText(/„Krabbenmann“ ist jetzt ein Spitzname von Paul\./)).toBeInTheDocument();
    expect(useStore.getState().daten!.figuren.paul!.aliase).toContain('Krabbenmann');
    expect(useStore.getState().daten!.entscheidungen.zuordnungen.some((z) => z.ziel?.id === 'paul' && z.status === 'bestaetigt')).toBe(true);
  });
});
