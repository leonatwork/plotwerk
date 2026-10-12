/** G6 Fragen an das Buch: gecachter Buchkontext, Belegprüfung, „ohne Beleg“, keine Schreibvorschläge, Allowlist. */
import { describe, expect, it } from 'vitest';
import { demoDateien, demoFs } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import { MemoryFs, parseKiFragen, serializeKiFragen } from '../projekt';
import {
  alsBuchFrage,
  aufgabenAnfrage,
  frageAufgabe,
  frageAufgabeText,
  fuehreAufgabeAus,
  ohneBeleg,
  schreibAuftrag,
  SYSTEM_FRAGEN,
  werteAufgabenAntwortAus,
  type KiTransport,
} from './index';

type Body = Record<string, unknown>;
const bloecke = (body: Body) => (body.messages as { content: { text: string; cache_control?: unknown }[] }[])[0]!.content;

function aufzeichnend(): { transport: KiTransport; bodies: Body[] } {
  const basis = erstelleDemoKiTransport({ verzoegerungMs: 0 });
  const bodies: Body[] = [];
  return {
    bodies,
    transport: {
      bereit: () => basis.bereit(),
      async senden(b) {
        bodies.push(structuredClone(b));
        return basis.senden(b);
      },
      tokenZaehlen: (b) => basis.tokenZaehlen(b),
    },
  };
}

describe('Fragen an das Buch: Request', () => {
  it('ganzes Buch als gecachter Prefix, Frage nur im zweiten Block – gleicher Prefix für jede Frage', async () => {
    const a = await aufgabenAnfrage(demoFs(), frageAufgabe('Wo erwähne ich Pauls Bleistifte?'));
    const b = await aufgabenAnfrage(demoFs(), frageAufgabe('Wer ist Fiete?', { verlauf: [{ frage: 'Wo erwähne ich Pauls Bleistifte?', antwort: 'In Kap. 2 und 9.' }] }));
    const [pa, qa] = bloecke(a);
    const [pb, qb] = bloecke(b);
    expect(pa!.cache_control).toEqual({ type: 'ephemeral' });
    expect(pa!.text).toBe(pb!.text);
    expect(a.system).toEqual(b.system);
    expect(JSON.stringify(a.system)).toContain(SYSTEM_FRAGEN.slice(0, 40));
    for (const id of ['grundriss', 'ebbe', 'funkstille']) expect(pa!.text).toContain(`id="${id}"`);
    expect(pa!.text).not.toContain('Bleistifte?');
    expect(qa!.text).toMatch(/^<aufgabe art="frage" frage="Wo erwähne ich Pauls Bleistifte\?">/);
    expect(qa!.text).toContain('Wo erwähne ich Pauls Bleistifte?');
    expect(qb!.text).toContain('Bisherige Fragen');
    expect(qb!.text).toContain('Wer ist Fiete?');
    expect(a.model).toBe('claude-sonnet-5-5');
    expect((await aufgabenAnfrage(demoFs(), frageAufgabe('x', { rolle: 'erkennung' }))).model).toBe('claude-haiku-5-5');
  });

  it('Verlauf: höchstens die letzten drei Fragen als Kontext', () => {
    const verlauf = Array.from({ length: 5 }, (_, i) => ({ frage: `Frage ${i + 1}`, antwort: `Antwort ${i + 1}` }));
    const t = frageAufgabeText('Neu?', verlauf);
    expect(t).not.toContain('Frage 2');
    expect(t).toContain('Frage 3');
    expect(t).toContain('Frage 5');
  });

  it('Allowlist (E12): private Felder gehen nicht mit', async () => {
    const dateien = demoDateien();
    dateien['figuren/paul.md'] = dateien['figuren/paul.md']!.replace('Privat (Testtext): Paul erinnert sich', 'GEHEIM-WAHRHEIT Paul erinnert sich');
    dateien['anmerkungen.json'] = dateien['anmerkungen.json']!.replace('Wo setzen sie sich hin? Szene noch ausführen.', 'GEHEIM-ANMERKUNG');
    const { transport, bodies } = aufzeichnend();
    await fuehreAufgabeAus(new MemoryFs(dateien), transport, undefined, frageAufgabe('Was weiß ich über Paul?'));
    const json = JSON.stringify(bodies);
    expect(json).not.toContain('GEHEIM');
    expect(json).not.toContain('Privat (Testtext)');
  });
});

describe('Fragen an das Buch: Belegprüfung', () => {
  const werte = (antwort: unknown) => werteAufgabenAntwortAus(demoFs(), frageAufgabe('Wo erwähne ich Pauls Bleistifte?'), antwort);

  it('verwirft nicht wörtliche Belege einzeln, sortiert in Buchreihenfolge', async () => {
    const r = await werte({
      imBuch: true,
      antwort: 'In Kap. 2 und Kap. 9.',
      belege: [
        { kapitel: 'flut', text: 'dass ich heute alle meine Bleistifte zu Hause gelassen habe' },
        { kapitel: 'fassade', text: 'klemmt sich den Bleistift hinters Ohr' },
        { kapitel: 'fassade', text: 'Paul trägt drei silberne Bleistifte' },
        { kapitel: 'gibt-es-nicht', text: 'Bleistifte' },
      ],
    });
    expect(r.ergebnis.belege.map((b) => b.kapitel)).toEqual(['fassade', 'flut']);
    expect(r.ergebnis.verworfeneBelege).toBe(2);
    expect(r.ergebnis.antwort).toBe('In Kap. 2 und Kap. 9.');
    expect(ohneBeleg(r.ergebnis)).toBe(false);
  });

  it('Antwort ohne prüfbaren Beleg bleibt, gilt aber als „ohne Beleg“', async () => {
    const r = await werte({ imBuch: true, antwort: 'Paul trägt immer Bleistifte.', belege: [{ kapitel: 'lotte', text: 'Paul trägt drei silberne Bleistifte' }] });
    expect(r.ergebnis.belege).toEqual([]);
    expect(ohneBeleg(r.ergebnis)).toBe(true);
    const nichts = await werte({ imBuch: false, antwort: 'Dazu steht im Buch nichts.', belege: [] });
    expect(nichts.ergebnis).toMatchObject({ imBuch: false, belege: [], verworfeneBelege: 0 });
  });

  it('verwirft Antworten mit Formulierungsvorschlag oder erfundenem Zitat ganz', async () => {
    const vorschlag = await werte({ imBuch: true, antwort: 'Du könntest schreiben: „Paul spitzt seinen Bleistift.“', belege: [] });
    expect(vorschlag.ergebnis.antwort).toBe('');
    expect(vorschlag.ergebnis.verworfen).toBeTruthy();
    const besser = await werte({ imBuch: true, antwort: 'Besser wäre, die Bleistifte schon in Kap. 1 einzuführen.', belege: [] });
    expect(besser.ergebnis.verworfen).toBeTruthy();
  });

  it('Schreibaufträge werden lokal erkannt (ohne Anfrage)', () => {
    for (const f of ['Schreib mir einen Dialog zwischen Paul und Lotte', 'Formuliere den Einstieg von Kap. 3 neu', 'Kannst du den Absatz verbessern?', 'Gib mir einen Textvorschlag für das Ende'])
      expect(schreibAuftrag(f), f).toBe(true);
    for (const f of ['Wo erwähne ich Pauls Bleistifte?', 'Wo schreibe ich über Lotte?', 'Wann taucht Fiete zum ersten Mal auf?', 'Was schreibt Vera an Paul?'])
      expect(schreibAuftrag(f), f).toBe(false);
  });
});

describe('Fragen an das Buch: Demo und Speicherform', () => {
  it('Demo beantwortet mit wörtlichen Fixture-Zitaten; der erfundene Beleg wird verworfen', async () => {
    const { transport } = aufzeichnend();
    const r = await fuehreAufgabeAus(demoFs(), transport, undefined, frageAufgabe('Wo erwähne ich Pauls Bleistifte?'));
    expect(r.ergebnis.belege.map((b) => b.kapitel)).toEqual(['fassade', 'flut']);
    expect(r.ergebnis.verworfeneBelege).toBe(1);
    expect(r.ergebnis.antwort).toContain('Kap. 2');
    const gespeichert = alsBuchFrage('frage-1', ' Wo erwähne ich Pauls Bleistifte? ', r);
    expect(gespeichert).toMatchObject({ id: 'frage-1', frage: 'Wo erwähne ich Pauls Bleistifte?', modell: r.modell });
    const datei = serializeKiFragen({ version: 1, eintraege: [gespeichert] });
    expect(parseKiFragen(datei).eintraege[0]).toEqual(gespeichert);
  });

  it('Demo: nichts gefunden → ohne Beleg', async () => {
    const { transport } = aufzeichnend();
    const leer = await fuehreAufgabeAus(demoFs(), transport, undefined, frageAufgabe('Wo kommt der Zeppelin vor?'));
    expect(leer.ergebnis).toMatchObject({ imBuch: false, belege: [] });
    expect(ohneBeleg(leer.ergebnis)).toBe(true);
  });
});
