/**
 * Vorlesen-Rückfall (G4) über macOS `say` (Rust: vorlesen::vorlesen_sagen/vorlesen_stopp/vorlesen_stimmen),
 * wenn die WKWebView keine Web Speech API hat. Die Klasse bildet genau den Teil von `speechSynthesis`
 * nach, den das Vorlesen braucht (speak/cancel/getVoices/voiceschanged); Sätze werden einzeln gesprochen.
 */
import { aufruf } from './aufruf';

interface SayStimme {
  name: string;
  lang: string;
}

/** Stimme in der Form von SpeechSynthesisVoice (voiceURI = Name für `say -v`). */
export interface SayVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/** Entspricht dem genutzten Teil von SpeechSynthesisUtterance. */
export class SayAeusserung {
  voice: SayVoice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  /** `lang`: Sprache des Textes (Buchsprache, Standard de-DE) – ohne gewählte Stimme spricht eine Stimme dieser Sprache. */
  constructor(
    public text: string,
    public lang = 'de-DE',
  ) {}
}

/** Erste Stimme mit genau dieser Sprache (de-DE), sonst derselben Sprachfamilie (de-AT); `say` meldet de_DE. */
export function stimmeFuerSprache(stimmen: readonly SayVoice[], lang: string): SayVoice | null {
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  const ziel = norm(lang);
  const familie = ziel.split('-')[0]!;
  return stimmen.find((s) => norm(s.lang) === ziel) ?? stimmen.find((s) => norm(s.lang).split('-')[0] === familie) ?? null;
}

export class SaySprachausgabe {
  private stimmen: SayVoice[] = [];
  private hoerer = new Set<() => void>();
  private geladen = false;

  getVoices(): SayVoice[] {
    if (!this.geladen) {
      this.geladen = true;
      aufruf<SayStimme[]>('vorlesen_stimmen')
        .then((liste) => {
          this.stimmen = liste.map((s) => ({ voiceURI: s.name, name: s.name, lang: s.lang, localService: true, default: false }));
          this.hoerer.forEach((h) => h());
        })
        .catch((e: unknown) => console.warn('Stimmen für das Vorlesen nicht verfügbar:', e));
    }
    return this.stimmen;
  }

  addEventListener(art: string, h: () => void): void {
    if (art === 'voiceschanged') this.hoerer.add(h);
  }

  removeEventListener(art: string, h: () => void): void {
    if (art === 'voiceschanged') this.hoerer.delete(h);
  }

  speak(u: SayAeusserung): void {
    // Ohne gewählte Stimme nicht die Systemstimme (Sprache des Macs), sondern eine Stimme der Textsprache
    const stimme = u.voice?.voiceURI ?? stimmeFuerSprache(this.stimmen, u.lang)?.voiceURI ?? null;
    aufruf<string>('vorlesen_sagen', { text: u.text, stimme, tempo: u.rate })
      .then((ergebnis) => (ergebnis === 'fertig' ? u.onend?.() : u.onerror?.({ error: 'canceled' })))
      .catch((e: unknown) => u.onerror?.({ error: e instanceof Error ? e.message : String(e) }));
  }

  cancel(): void {
    void aufruf<void>('vorlesen_stopp').catch(() => undefined);
  }
}
