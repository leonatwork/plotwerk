/**
 * Meldungen von core/ki in der Oberflächensprache Englisch (`oberflaeche: 'en'`).
 * Die Buchsprache des Demo-Projekts bleibt Deutsch: Prompts und KI-Texte ändern sich dadurch nicht.
 */
import { describe, expect, it } from 'vitest';
import { demoFs, ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { platzhalter } from '../i18n';
import { leseAntwort } from './antwort';
import {
  aufgabenAnfrage,
  ersatztextGrund,
  fuehreAufgabeAus,
  kiMeldungen,
  pruefe,
  pruefeVorschlaege,
  schaetzeLauf,
  STANDARD_KI,
  leseZeitAngaben,
  type AufgabenDefinition,
  type KiTransport,
} from './index';

type Beobachtung = { text: string };
const definition: AufgabenDefinition<Beobachtung[]> = {
  name: 'Test',
  nameEn: 'Test task',
  art: 'test',
  rolle: 'pruefung',
  system: 'Testsystem',
  aufgabe: () => 'Finde Beobachtungen.',
  schema: () => ({ type: 'object' }),
  auswerten(daten, p) {
    const liste = (daten as { beobachtungen?: Record<string, unknown>[] }).beobachtungen ?? [];
    const ergebnis: Beobachtung[] = [];
    for (const r of liste) {
      const zitate = p.zitate(r.zitate, r);
      const text = p.text(r.text, r, { pflicht: true });
      if (zitate && text !== null) ergebnis.push({ text });
    }
    return ergebnis;
  },
};

const ANTWORT = {
  beobachtungen: [
    { text: 'Paul trinkt hier.', zitate: [{ kapitel: 'flut', text: 'bestelle einen Aperol Spritz' }] },
    { text: 'Erfundenes Zitat.', zitate: [{ kapitel: 'flut', text: 'Er trinkt nie wieder einen Aperol' }] },
    { text: 'Besser: „Ich bestelle mir einen“.', zitate: [{ kapitel: 'flut', text: 'bestelle einen Aperol Spritz' }] },
    { text: 'Ohne Beleg.', zitate: [] },
  ],
};

function transport(antwort: unknown, bereit = true): KiTransport {
  return {
    bereit: async () => bereit,
    senden: async () => ({
      type: 'message',
      content: [{ type: 'text', text: JSON.stringify(antwort) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
    }),
    tokenZaehlen: async (body) => Math.ceil(JSON.stringify(body).length / 3),
  };
}

describe('core/ki – Meldungen auf Englisch', () => {
  it('KiFehler in der Oberflächensprache, Standard bleibt Deutsch', async () => {
    await expect(fuehreAufgabeAus(demoFs(), transport(ANTWORT, false), undefined, definition, { oberflaeche: 'en' })).rejects.toMatchObject({
      art: 'nicht_bereit',
      message: 'The AI is not set up yet: API key or endpoint missing.',
    });
    await expect(fuehreAufgabeAus(demoFs(), transport(ANTWORT, false), undefined, definition)).rejects.toMatchObject({
      message: 'Die KI ist noch nicht eingerichtet: API-Schlüssel oder Endpoint fehlt.',
    });
    await expect(
      schaetzeLauf(demoFs(), { umfang: 'kapitel', kapitel: 'gibt-es-nicht' }, transport(ANTWORT), STANDARD_KI, 'en'),
    ).rejects.toMatchObject({ art: 'auftrag', message: 'The chapter “gibt-es-nicht” does not exist.' });
    await expect(aufgabenAnfrage(demoFs(), { ...definition, kapitelBis: 'fehlt' }, undefined, 'en')).rejects.toMatchObject({
      message: 'The chapter “fehlt” does not exist.',
    });
  });

  it('Abbruch nennt den englischen Aufgabennamen', async () => {
    const steuerung = new AbortController();
    steuerung.abort();
    await expect(
      fuehreAufgabeAus(demoFs(), transport(ANTWORT), undefined, definition, { signal: steuerung.signal, oberflaeche: 'en' }),
    ).rejects.toMatchObject({ art: 'abgebrochen', message: 'Test task: cancelled.' });
  });

  it('Gründe verworfener Antworten auf Englisch (Zitatprüfung und Ersatztext unverändert)', async () => {
    const r = await fuehreAufgabeAus(demoFs(), transport(ANTWORT), undefined, definition, { oberflaeche: 'en' });
    expect(r.ergebnis).toEqual([{ text: 'Paul trinkt hier.' }]);
    expect(r.verworfen.map((v) => v.grund)).toEqual([
      expect.stringMatching(/^Quote does not appear verbatim in Ch\. \d+ “.+”: “Er trinkt nie wieder einen Aperol”$/),
      'Wording suggestion („besser:“)',
      'no verbatim quote',
    ]);
    expect(ersatztextGrund('Besser: „Paul setzt sich.“', 'en')).toBe('Wording suggestion („besser:“)');
    expect(ersatztextGrund('Besser: „Paul setzt sich.“')).toBe('Formulierungsvorschlag („besser:“)');
  });

  it('Prüfung: Schema-Fehler und Abbruch auf Englisch', async () => {
    const r = await pruefe(demoFs(), { umfang: 'kapitel', kapitel: 'lotte', erzwingen: true }, transport({ falsch: true }), STANDARD_KI, {
      oberflaeche: 'en',
    });
    expect(r.verworfen.map((v) => v.grund)).toEqual([expect.stringMatching(/^Ch\. \d+ “.+”: The response does not match the schema\.$/)]);
    const steuerung = new AbortController();
    steuerung.abort();
    const b = await pruefe(demoFs(), { umfang: 'buch', erzwingen: true }, transport({}), STANDARD_KI, {
      signal: steuerung.signal,
      oberflaeche: 'en',
    });
    expect(b.fehler).toBe('The check was cancelled.');
  });

  it('Messages-API-Antwort und Zeitangaben', () => {
    expect(leseAntwort({ type: 'message', content: [], stop_reason: 'max_tokens' }, 'en').grund).toBe(
      'Response cut off: the token limit (max_tokens) was reached.',
    );
    expect(() => leseAntwort({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'en')).toThrow(
      'The AI service reported an error (overloaded_error): Overloaded',
    );
    expect(leseZeitAngaben({ tag: 'acht', sicherheit: 'fest' }, 'en')).toBe('Day “acht” is not a whole number');
    expect(leseZeitAngaben({ tageszeit: 'morgens', uhrzeit: '23:30' }, 'en')).toBe('Time 23:30 does not match “morgens”');
  });

  it('Vorschläge: Gründe auf Englisch', async () => {
    const daten = await ladeDemoProjekt();
    const g = pruefeVorschlaege(daten, { figuren: [{ name: '' }], orte: [{ name: 'Nirgendwo', belege: [] }], beziehungen: [] }, undefined, 'en');
    expect(g.verworfen.map((v) => v.grund)).toEqual(['Character without a name', 'Place “Nirgendwo”: no evidence']);
    expect(() => pruefeVorschlaege(daten, [], undefined, 'en')).toThrow('The response does not match the schema.');
  });

  it('Wörterbuch: gleiche Platzhalter de ↔ en, keine deutschen Umlaute im Englischen', () => {
    const de = kiMeldungen('de');
    const en = kiMeldungen('en');
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const k of Object.keys(de) as (keyof typeof de)[]) {
      expect(platzhalter(en[k]), k).toEqual(platzhalter(de[k]));
      expect(en[k], k).not.toMatch(/[äöüÄÖÜß„]/);
    }
  });
});
