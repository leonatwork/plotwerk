import { istPlural, platzhalter } from '@core/i18n';
import { de } from './de';
import { en } from './en';
import { f, festeSprache, sprache, texte, zahl } from './index';

type Eintrag = { pfad: string; wert: unknown };

function eintraege(obj: unknown, pfad = ''): Eintrag[] {
  if (typeof obj === 'string' || typeof obj === 'function' || istPlural(obj)) return [{ pfad, wert: obj }];
  if (Array.isArray(obj)) return obj.flatMap((w, i) => eintraege(w, `${pfad}[${i}]`));
  if (typeof obj === 'object' && obj !== null)
    return Object.entries(obj).flatMap(([k, w]) => eintraege(w, pfad ? `${pfad}.${k}` : k));
  return [{ pfad, wert: obj }];
}

const deListe = eintraege(de);
const enKarte = new Map(eintraege(en).map((e) => [e.pfad, e.wert]));
const deKarte = new Map(deListe.map((e) => [e.pfad, e.wert]));

describe('Wörterbuch de ↔ en', () => {
  it('hat in beiden Sprachen dieselben Schlüssel', () => {
    expect([...enKarte.keys()].filter((k) => !deKarte.has(k))).toEqual([]);
    expect([...deKarte.keys()].filter((k) => !enKarte.has(k))).toEqual([]);
  });

  it('hat dieselbe Art je Eintrag (Text, Plural, Funktion)', () => {
    const art = (w: unknown) => (typeof w === 'function' ? 'funktion' : istPlural(w) ? 'plural' : typeof w);
    const abweichend = deListe.filter((e) => art(e.wert) !== art(enKarte.get(e.pfad))).map((e) => e.pfad);
    expect(abweichend).toEqual([]);
  });

  it('hat dieselben Platzhalter', () => {
    const abweichend = deListe
      .filter((e) => typeof e.wert === 'string' || istPlural(e.wert))
      .filter((e) => {
        const w = enKarte.get(e.pfad);
        return JSON.stringify(platzhalter(e.wert as string)) !== JSON.stringify(platzhalter(w as string));
      })
      .map((e) => e.pfad);
    expect(abweichend).toEqual([]);
  });

  it('hat keine leeren englischen Texte', () => {
    const leer = [...enKarte.entries()]
      .filter(([k, w]) => typeof w === 'string' && w.trim() === '' && String(deKarte.get(k)).trim() !== '')
      .map(([k]) => k);
    expect(leer).toEqual([]);
  });

  it('enthält im Englischen keine deutschen Umlaute (außer ausdrücklich deutschen Wörtern)', () => {
    const erlaubt = new Set(['sprache.de']);
    const verdaechtig = [...enKarte.entries()]
      .filter(([k, w]) => !erlaubt.has(k) && typeof w === 'string' && /[äöüÄÖÜß„]/.test(w))
      .map(([k]) => k);
    expect(verdaechtig).toEqual([]);
  });
});

describe('Sprachumschaltung', () => {
  afterEach(() => festeSprache('de'));

  it('liefert Texte, Zahlen und Pluralformen in der gewählten Sprache', () => {
    festeSprache('de');
    expect(sprache()).toBe('de');
    expect(texte().gemeinsam.abbrechen).toBe('Abbrechen');
    expect(f(texte().gemeinsam.woerter, { n: 1234 })).toBe('1.234 Wörter');
    expect(f(texte().gemeinsam.woerter, { n: 1 })).toBe('1 Wort');
    festeSprache('en');
    expect(texte().gemeinsam.abbrechen).toBe('Cancel');
    expect(f(texte().gemeinsam.woerter, { n: 1234 })).toBe('1,234 words');
    expect(f(texte().gemeinsam.woerter, { n: 1 })).toBe('1 word');
    expect(zahl(0.5)).toBe('0.5');
  });
});
