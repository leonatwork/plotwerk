import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import { MemoryFs } from '../projekt';
import { FAKTEN_ART, faktSchluessel, KiFehler, sammleFakten, schaetzeFakten, STANDARD_KI, type KiTransport } from './index';

const SAAB = 'Dann nimmt er den Schlüssel und fährt mit seinem alten Saab 900 zum Lindenhof.';

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
}

describe('KI-Aufgabe Figurenfakten (F-17)', () => {
  it('Demo: wörtliche Angaben bleiben, erfundenes Zitat fällt weg; nichts wird geschrieben', async () => {
    const fs = new NurLesen((await import('../../fixtures/demoProjekt')).demoDateien());
    const r = await sammleFakten(fs, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI, {});
    const paul = r.ergebnis.fakten.filter((f) => f.figur === 'paul');
    expect(paul.map((f) => f.wert)).toEqual(expect.arrayContaining(['alter Saab 900', 'Saab', 'Volvo']));
    expect(paul).toHaveLength(3);
    expect(r.ergebnis.fakten.some((f) => f.figur === 'ole')).toBe(false);
    expect(r.verworfen.map((v) => v.grund).join(' ')).toMatch(/nicht wörtlich/);
    expect(paul[0]!.zitat.text).toBe(SAAB);
    expect(paul[0]!.schluessel).toBe(faktSchluessel('paul', 'Auto', { kapitel: 'lotte', text: SAAB }));
  });

  it('nur eine Figur: Kopf trägt figur, Schema erlaubt nur sie; Statisten bei „alle“ nicht gefragt', async () => {
    const bodies: Record<string, unknown>[] = [];
    await sammleFakten(demoFs(), transport({ fakten: [] }, bodies), STANDARD_KI, { figur: 'vera' });
    const text = JSON.stringify(bodies[0]);
    expect(text).toContain(`art=\\"${FAKTEN_ART}\\"`);
    expect(text).toContain('figur=\\"vera\\"');
    expect(text).toMatch(/"enum":\["vera"\]/);
  });

  it('Prüfung: unbekannte Figur, zu lange Werte, Ersatztext und fremde Zitate fliegen raus', async () => {
    const r = await sammleFakten(
      demoFs(),
      transport({
        fakten: [
          { figur: 'paul', merkmal: 'Auto', wert: 'alter Saab 900', kapitel: 'lotte', zitat: SAAB },
          { figur: 'niemand', merkmal: 'Auto', wert: 'Saab', kapitel: 'lotte', zitat: SAAB },
          { figur: 'paul', merkmal: 'Auto mit sehr langem Merkmal', wert: 'Saab', kapitel: 'lotte', zitat: SAAB },
          { figur: 'paul', merkmal: 'Auto', wert: 'ein Saab, der wohl nicht mehr lange fahren wird und rostet', kapitel: 'lotte', zitat: SAAB },
          { figur: 'paul', merkmal: 'Auto', wert: 'Saab', kapitel: 'lotte', zitat: 'Er fährt einen Saab.' },
        ],
      }),
      STANDARD_KI,
      {},
    );
    expect(r.ergebnis.fakten).toHaveLength(1);
    expect(r.verworfen).toHaveLength(4);
  });

  it('Schätzung ohne Senden; nicht bereit → KiFehler', async () => {
    const bodies: Record<string, unknown>[] = [];
    const s = await schaetzeFakten(demoFs(), transport({ fakten: [] }, bodies), STANDARD_KI, {});
    expect(s.anfragen).toBe(1);
    expect(bodies).toHaveLength(0);
    const nicht: KiTransport = { ...transport({}), bereit: async () => false };
    await expect(sammleFakten(demoFs(), nicht, STANDARD_KI, {})).rejects.toBeInstanceOf(KiFehler);
  });
});
