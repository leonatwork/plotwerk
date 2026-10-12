import { describe, expect, it } from 'vitest';
import { fuehreAufgabeAus, type AufgabenDefinition } from '@core/ki/index';
import { demoFs } from '../../../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../demo';
import { DEMO_ANTWORTEN_ZEIT } from './zeit';
import { demoAntwortFuer } from './index';

describe('Demo-Antworten (Registry)', () => {
  it('beantwortet registrierte Aufgabenarten mit Zitaten aus dem mitgeschickten Kontext', async () => {
    DEMO_ANTWORTEN_ZEIT['registry-test'] = (ctx, anfrage) => {
      const k = ctx.kapitel.find((x) => x.id === anfrage.attribute.kapitel)!;
      return { zitat: { kapitel: k.id, text: k.text.split('.')[0]! }, art: anfrage.art };
    };
    try {
      expect(demoAntwortFuer('registry-test')).toBeDefined();
      const definition: AufgabenDefinition<string | null> = {
        name: 'Registry',
        art: 'registry-test',
        attribute: { kapitel: 'lotte' },
        rolle: 'erkennung',
        system: 'x',
        aufgabe: () => 'y',
        schema: () => ({ type: 'object' }),
        auswerten: (d, p) => p.zitate([(d as { zitat: unknown }).zitat], d)?.[0]?.text ?? null,
      };
      const r = await fuehreAufgabeAus(demoFs(), erstelleDemoKiTransport({ verzoegerungMs: 0 }), undefined, definition);
      expect(r.ergebnis).toBe('In Pauls Wohnung riecht es nach Terpentin und frischem Kaffee');
    } finally {
      delete DEMO_ANTWORTEN_ZEIT['registry-test'];
    }
    expect(demoAntwortFuer('registry-test')).toBeUndefined();
    expect(demoAntwortFuer('toString')).toBeUndefined();
  });
});
