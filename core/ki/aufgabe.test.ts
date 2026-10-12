import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { MemoryFs } from '../projekt';
import {
  aufgabenAnfrage,
  aufgabenKopf,
  fuehreAufgabeAus,
  KiFehler,
  leseAufgabenKopf,
  schaetzeAufgabe,
  werteAufgabenAntwortAus,
  type AufgabenDefinition,
  type KiTransport,
} from './index';

/** Beispielaufgabe: Beobachtungen mit Zitaten */
type Beobachtung = { text: string; zitate: { kapitel: string; text: string }[] };
const definition = (extra: Partial<AufgabenDefinition<Beobachtung[]>> = {}): AufgabenDefinition<Beobachtung[]> => ({
  name: 'Test',
  art: 'test',
  attribute: { kapitel: 'flut', notiz: 'a "b" <c>' },
  rolle: 'pruefung',
  system: 'Testsystem',
  aufgabe: () => 'Finde Beobachtungen.',
  schema: () => ({ type: 'object' }),
  auswerten(daten, p) {
    const liste = Array.isArray((daten as { beobachtungen?: unknown })?.beobachtungen) ? (daten as { beobachtungen: unknown[] }).beobachtungen : [];
    const ergebnis: Beobachtung[] = [];
    for (const roh of liste) {
      const r = roh as Record<string, unknown>;
      const zitate = p.zitate(r.zitate, roh);
      const text = p.text(r.text, roh, { pflicht: true });
      if (zitate && text !== null) ergebnis.push({ text, zitate });
    }
    return ergebnis;
  },
  ...extra,
});

const ANTWORT = {
  beobachtungen: [
    { text: 'Paul trinkt hier.', zitate: [{ kapitel: 'flut', text: 'bestelle einen Aperol Spritz' }] },
    { text: 'Erfundenes Zitat.', zitate: [{ kapitel: 'flut', text: 'Er trinkt nie wieder einen Aperol' }] },
    { text: 'Besser: „Ich bestelle mir einen“.', zitate: [{ kapitel: 'flut', text: 'bestelle einen Aperol Spritz' }] },
    { text: 'Ohne Beleg.', zitate: [] },
  ],
};

function transport(antwort: unknown, bodies: Record<string, unknown>[] = []): KiTransport {
  return {
    bereit: async () => true,
    senden: async (body) => {
      bodies.push(body);
      return {
        type: 'message',
        content: [{ type: 'text', text: JSON.stringify(antwort) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000 },
      };
    },
    tokenZaehlen: async (body) => Math.ceil(JSON.stringify(body).length / 3),
  };
}

/** Dateisystem, das bei jedem Schreibversuch fehlschlägt (harte Regel 1). */
class NurLesen extends MemoryFs {
  override async schreiben(): Promise<void> {
    throw new Error('Schreiben verboten');
  }
  override async entfernen(): Promise<void> {
    throw new Error('Entfernen verboten');
  }
}

describe('core/ki/aufgabe', () => {
  it('Aufgabenkopf hin und zurück (escaped)', () => {
    const kopf = aufgabenKopf('leser', { kapitel: 'lotte', frage: 'Wo ist „Paul“? <x> & "y"' });
    expect(leseAufgabenKopf(`${kopf}\nText`)).toEqual({ art: 'leser', attribute: { kapitel: 'lotte', frage: 'Wo ist „Paul“? <x> & "y"' } });
    expect(leseAufgabenKopf('nichts')).toBeNull();
  });

  it('Body: Buch als gecachter Prefix, Aufgabe mit Kopf, Schema, Modell der Rolle', async () => {
    const body = await aufgabenAnfrage(demoFs(), definition());
    const inhalt = (body.messages as { content: { text: string; cache_control?: unknown }[] }[])[0]!.content;
    expect(inhalt[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(inhalt[0]!.text).toContain('<buch>');
    expect(inhalt[1]!.text).toMatch(/^<aufgabe art="test" kapitel="flut" notiz="a &quot;b&quot; &lt;c&gt;">\nFinde Beobachtungen\.\n<\/aufgabe>$/);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect((body.output_config as { format: unknown }).format).toEqual({ type: 'json_schema', schema: { type: 'object' } });
    // Allowlist: private Felder nie im Prompt
    expect(JSON.stringify(body)).not.toContain('Privat (Testtext)');
  });

  it('kapitelBis: nur Kapitel bis einschließlich n im Kontext', async () => {
    const body = await aufgabenAnfrage(demoFs(), definition({ kapitelBis: 'lotte' }));
    const prefix = (body.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(prefix).toContain('id="lotte"');
    expect(prefix).not.toContain('id="staub"');
    await expect(aufgabenAnfrage(demoFs(), definition({ kapitelBis: 'gibt-es-nicht' }))).rejects.toBeInstanceOf(KiFehler);
  });

  it('prüft Zitate (E6) und verwirft Ersatztext; schreibt nichts', async () => {
    const fs = new NurLesen(demoFs().alleDateien());
    const r = await fuehreAufgabeAus(fs, transport(ANTWORT), undefined, definition(), { jetzt: () => new Date('2026-10-10T10:00:00Z') });
    expect(r.ergebnis).toEqual([{ text: 'Paul trinkt hier.', zitate: [{ kapitel: 'flut', text: 'bestelle einen Aperol Spritz' }] }]);
    expect(r.verworfen.map((v) => v.grund)).toEqual([
      expect.stringContaining('nicht wörtlich'),
      expect.stringContaining('Formulierungsvorschlag'),
      'ohne wörtliches Zitat',
    ]);
    expect(r.datum).toBe('2026-10-10T10:00:00.000Z');
    expect(r.tokens).toEqual({ eingabe: 1100, ausgabe: 20, cacheGelesen: 0 });
    expect(r.kostenUsd).toBeGreaterThan(0);
  });

  it('nicht eingerichtet → KiFehler nicht_bereit', async () => {
    const t = { ...transport(ANTWORT), bereit: async () => false };
    await expect(fuehreAufgabeAus(demoFs(), t, undefined, definition())).rejects.toMatchObject({ art: 'nicht_bereit' });
  });

  it('Abbruch: Signal geht an den Transport; bricht er nicht ab, wird die Antwort trotzdem verworfen', async () => {
    // 1. Transport bricht selbst ab (Demo, später fetch mit signal)
    const vorher = new AbortController();
    vorher.abort();
    const nieGesendet = { ...transport(ANTWORT), senden: async () => Promise.reject(new Error('darf nicht gesendet werden')) };
    await expect(fuehreAufgabeAus(demoFs(), nieGesendet, undefined, definition(), { signal: vorher.signal })).rejects.toMatchObject({ art: 'abgebrochen' });

    const signale: (AbortSignal | undefined)[] = [];
    const steuerung = new AbortController();
    const brichtAb: KiTransport = {
      ...transport(ANTWORT),
      senden: (_body, optionen) =>
        new Promise((_, verworfen) => {
          signale.push(optionen?.signal);
          optionen?.signal?.addEventListener('abort', () => verworfen(new Error('aborted')));
        }),
    };
    const lauf = fuehreAufgabeAus(demoFs(), brichtAb, undefined, definition(), { signal: steuerung.signal });
    await new Promise((r) => setTimeout(r, 0));
    expect(signale).toEqual([steuerung.signal]);
    steuerung.abort();
    await expect(lauf).rejects.toMatchObject({ art: 'abgebrochen' });

    // 2. Transport ignoriert das Signal (Tauri): die Antwort kommt, wird aber verworfen
    const ignoriert = new AbortController();
    const stur: KiTransport = {
      ...transport(ANTWORT),
      senden: async (body) => {
        ignoriert.abort();
        return transport(ANTWORT).senden(body);
      },
    };
    await expect(fuehreAufgabeAus(demoFs(), stur, undefined, definition(), { signal: ignoriert.signal })).rejects.toMatchObject({ art: 'abgebrochen' });
  });

  it('vorbereitete Antwort auswerten, Schätzung', async () => {
    const r = await werteAufgabenAntwortAus(demoFs(), definition(), JSON.stringify(ANTWORT));
    expect(r.ergebnis).toHaveLength(1);
    const s = await schaetzeAufgabe(demoFs(), transport(ANTWORT), undefined, definition());
    expect(s.anfragen).toBe(1);
    expect(s.prefixTokens).toBeGreaterThan(0);
    expect(s.eingabeTokens).toBeGreaterThan(s.prefixTokens);
  });
});

describe('Zitat mit Anführungszeichen am Rand', () => {
  it('behält das schließende „““, wenn das Modell es mitzitiert und es im Text steht', async () => {
    const { randAnfuehrung } = await import('./pruefung');
    const text = 'Er sagte: „Nur mit Beleg.“ Dann ging er.';
    const start = text.indexOf('Nur');
    const ende = text.indexOf('“');
    expect(text.slice(start, ende)).toBe('Nur mit Beleg.');
    const b = randAnfuehrung(text, { start, ende }, '„Nur mit Beleg.“');
    expect(text.slice(b.start, b.ende)).toBe('„Nur mit Beleg.“');
    // ohne Anführungszeichen im Zitat des Modells bleibt der Bereich, wie er ist
    const c = randAnfuehrung(text, { start, ende }, 'Nur mit Beleg.');
    expect(text.slice(c.start, c.ende)).toBe('Nur mit Beleg.');
  });
});
