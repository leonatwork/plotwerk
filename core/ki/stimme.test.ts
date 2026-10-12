import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { MemoryFs } from '../projekt';
import {
  aufgabenAnfrage,
  KiFehler,
  pruefeStimme,
  schaetzeStimme,
  STIMME_ART,
  stimmeDefinition,
  stimmenSchluessel,
  stimmeSchema,
  type KiTransport,
} from './index';

const TROCKNEN = 'Paul sieht nicht vom Zollstock auf und sagt nur: „Achtzehn auf jeder Seite.“';
const AMERICANO = 'Ein Haus muss man in die Hand nehmen können, sagt er.';
const POSTKARTE_2 = '„Warum bist du nicht gekommen?“';
const POSTKARTE_1 = 'Auf der Vorderseite der Postkarte ist der alte Leuchtturm zu sehen, auf der Rückseite steht in blauer Tinte „Bis bald“.';

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

const beobachtung = (teil: Record<string, unknown> = {}) => ({
  titel: 'Antwortet nur mit dem Schild',
  erklaerung: 'Sonst erklärt Paul ausführlich, hier wiederholt er nur das Schild.',
  deutlich: true,
  zitate: [{ kapitel: 'staub', text: TROCKNEN }],
  vergleich: [{ kapitel: 'grundriss', text: AMERICANO }],
  ...teil,
});

describe('core/ki/stimme – Figurenstimme', () => {
  it('Schlüssel ist stabil und unabhängig von Reihenfolge und Anführungszeichen', () => {
    const a = stimmenSchluessel('paul', [
      { kapitel: 'staub', text: TROCKNEN },
      { kapitel: 'ebbe', text: 'er verspricht: „Ich melde mich bei Dir!“' },
    ]);
    const b = stimmenSchluessel('paul', [
      { kapitel: 'ebbe', text: 'er verspricht: "Ich melde mich bei Dir!"' },
      { kapitel: 'staub', text: TROCKNEN },
    ]);
    expect(a).toBe(b);
    expect(a.startsWith('stimme:paul|')).toBe(true);
    expect(stimmenSchluessel('lotte', [{ kapitel: 'staub', text: TROCKNEN }])).not.toBe(stimmenSchluessel('paul', [{ kapitel: 'staub', text: TROCKNEN }]));
  });

  it('Anfrage: Kopf mit Figur, Redestellen als Orientierung, kein Ersatztext-Feld, keine privaten Felder (E12)', async () => {
    const body = await aufgabenAnfrage(demoFs(), stimmeDefinition({ figur: 'paul' }));
    const inhalt = (body.messages as { content: { text: string }[] }[])[0]!.content;
    const aufgabe = inhalt[1]!.text;
    expect(aufgabe).toMatch(new RegExp(`^<aufgabe art="${STIMME_ART}" figur="paul">`));
    expect(aufgabe).toContain('Figur: Paul (id: paul) · Hauptfigur');
    expect(aufgabe).toContain('Achtzehn auf jeder Seite.');
    expect(aufgabe).toContain('Rede eines Ich-Erzählers');
    expect(aufgabe).not.toContain('bewusst vage');
    expect(body.model).toBe('claude-sonnet-5-5');
    const json = JSON.stringify(body);
    expect(json).not.toContain('Privat (Testtext)');
    const schema = JSON.stringify(stimmeSchema({ kapitel: [], figuren: [] } as never));
    expect(schema).not.toMatch(/ersatz|neu(er)?_?text|formulierung|vorschlag/i);
    expect(Object.keys((stimmeSchema({ kapitel: [], figuren: [] } as never).properties as { beobachtungen: { items: { properties: object } } }).beobachtungen.items.properties)).toEqual([
      'titel',
      'erklaerung',
      'deutlich',
      'zitate',
      'vergleich',
    ]);

    const vage = await aufgabenAnfrage(demoFs(), stimmeDefinition({ figur: 'die-fremde', tiefencheck: true }));
    const text = (vage.messages as { content: { text: string }[] }[])[0]!.content[1]!.text;
    expect(text).toContain('Die Fremde ist bewusst vage angelegt');
    expect(vage.model).toBe('claude-opus-5-5');
  });

  it('unbekannte Figur → KiFehler', async () => {
    await expect(aufgabenAnfrage(demoFs(), stimmeDefinition({ figur: 'gibt-es-nicht' }))).rejects.toBeInstanceOf(KiFehler);
  });

  it('prüft Zitate wörtlich, verwirft Formulierungsvorschläge, erfundene Zitate, gleiche Vergleichsstellen; schreibt nichts', async () => {
    const fs = new NurLesen(demoFs().alleDateien());
    const antwort = {
      zuWenigRede: false,
      beobachtungen: [
        beobachtung(),
        beobachtung(), // doppelt
        beobachtung({ titel: 'Erfunden', zitate: [{ kapitel: 'staub', text: 'Paul schreit: „Raus hier!“' }] }),
        beobachtung({ titel: 'Vorschlag', erklaerung: 'Besser wäre: „Ich weiß es nicht.“ statt des Schilds.' }),
        beobachtung({ titel: 'Gleiche Stelle', vergleich: [{ kapitel: 'staub', text: 'sagt nur: „Achtzehn auf jeder Seite.“' }] }),
        beobachtung({ titel: 'Ohne Vergleich', vergleich: [] }),
        beobachtung({
          titel: 'Anrede groß',
          deutlich: false,
          zitate: [{ kapitel: 'ebbe', text: 'er verspricht: "Ich melde mich bei Dir!"' }],
          vergleich: [{ kapitel: 'lotte', text: '„Bestell dir schon mal was, ich beeil mich.“' }],
        }),
      ],
    };
    const r = await pruefeStimme(fs, transport(antwort), undefined, { figur: 'paul' }, { jetzt: () => new Date('2026-10-10T10:00:00Z') });
    // Buchreihenfolge: Staub (Kap. 5) vor Ebbe (Kap. 7)
    expect(r.ergebnis.beobachtungen.map((b) => b.titel)).toEqual(['Antwortet nur mit dem Schild', 'Anrede groß']);
    const [schild, anrede] = r.ergebnis.beobachtungen as [NonNullable<(typeof r.ergebnis.beobachtungen)[number]>, NonNullable<(typeof r.ergebnis.beobachtungen)[number]>];
    expect(schild).toMatchObject({ figur: 'paul', kapitel: 'staub', status: 'neu', vergleich: [{ kapitel: 'grundriss', text: AMERICANO }] });
    // Originaltext statt normalisierter Modellangabe
    expect(anrede.zitate[0]!.text).toMatch(/^er verspricht: „Ich melde mich bei Dir!/);
    expect(schild.schluessel).toBe(stimmenSchluessel('paul', [{ kapitel: 'staub', text: TROCKNEN }]));
    expect(r.verworfen.map((v) => v.grund)).toEqual([
      expect.stringContaining('nicht wörtlich'),
      expect.stringContaining('Formulierungsvorschlag'),
      'Vergleich nennt dieselbe Stelle wie die Auffälligkeit',
      'ohne wörtliches Zitat',
    ]);
    expect(r.ergebnis).toMatchObject({ figur: 'paul', zuWenigRede: false, vage: false });
    expect(r.ergebnis.redestellen).toBeGreaterThan(0);
    expect(r.datum).toBe('2026-10-10T10:00:00.000Z');
  });

  it('bewusst vage Figur: nur deutliche Auffälligkeiten', async () => {
    const antwort = {
      zuWenigRede: false,
      beobachtungen: [
        {
          titel: 'Vom Spiel zum Vorwurf',
          erklaerung: 'Die erste Postkarte ist freundlich, die zweite vorwurfsvoll.',
          deutlich: true,
          zitate: [{ kapitel: 'funkstille', text: POSTKARTE_2 }],
          vergleich: [{ kapitel: 'bis-bald', text: POSTKARTE_1 }],
        },
        {
          titel: 'Kürzere Sätze',
          erklaerung: 'Leichte Tendenz zu kürzeren Sätzen.',
          deutlich: false,
          zitate: [{ kapitel: 'funkstille', text: POSTKARTE_2 }],
          vergleich: [{ kapitel: 'bis-bald', text: POSTKARTE_1 }],
        },
      ],
    };
    const r = await pruefeStimme(demoFs(), transport(antwort), undefined, { figur: 'die-fremde' });
    expect(r.ergebnis.vage).toBe(true);
    expect(r.ergebnis.beobachtungen.map((b) => b.titel)).toEqual(['Vom Spiel zum Vorwurf']);
    expect(r.verworfen.map((v) => v.grund)).toEqual(['bewusst vage Figur „Die Fremde“: nur deutliche Auffälligkeiten']);
  });

  it('zu wenig Rede und Antwort außerhalb des Schemas', async () => {
    const wenig = await pruefeStimme(demoFs(), transport({ zuWenigRede: true, beobachtungen: [] }), undefined, { figur: 'herr-kessler' });
    expect(wenig.ergebnis).toMatchObject({ zuWenigRede: true, beobachtungen: [], redestellen: 0 });
    const kaputt = await pruefeStimme(demoFs(), transport({ irgendwas: 1 }), undefined, { figur: 'paul' });
    expect(kaputt.ergebnis.beobachtungen).toEqual([]);
    expect(kaputt.verworfen.map((v) => v.grund)).toEqual(['Die Antwort passt nicht zum Schema.']);
  });

  it('Schätzung: eine Anfrage', async () => {
    const s = await schaetzeStimme(demoFs(), transport({}), undefined, { figur: 'paul' });
    expect(s.anfragen).toBe(1);
    expect(s.eingabeTokens).toBeGreaterThan(s.prefixTokens);
  });
});
