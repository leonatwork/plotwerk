import { describe, expect, it } from 'vitest';
import { darstellungAusJson, STANDARD_DARSTELLUNG } from './index';

describe('Darstellung als App-Einstellung', () => {
  it('erhält die bisherigen Maße als Standard', () => {
    expect(STANDARD_DARSTELLUNG).toEqual({ schriftgroesse: 17.5, zeilenbreite: 530, zeilenhoehe: 1.65, skalierung: 1 });
    for (const wert of [null, undefined, [], 'kaputt', 42]) expect(darstellungAusJson(wert)).toEqual(STANDARD_DARSTELLUNG);
  });
  it.each([
    ['schriftgroesse', 14, 26], ['zeilenbreite', 420, 800], ['zeilenhoehe', 1.4, 2],
  ] as const)('validiert %s einschließlich der Grenzen und fällt pro Feld zurück', (feld, min, max) => {
    for (const wert of [min, max]) expect(darstellungAusJson({ [feld]: wert })[feld]).toBe(wert);
    for (const wert of [min - 0.01, max + 0.01, NaN, Infinity, '20', null, true]) {
      expect(darstellungAusJson({ [feld]: wert })[feld]).toBe(STANDARD_DARSTELLUNG[feld]);
    }
    expect(darstellungAusJson({ schriftgroesse: 20, zeilenbreite: 900 })).toMatchObject({ schriftgroesse: 20, zeilenbreite: 530 });
  });
  it('akzeptiert nur unterstützte Skalierungsstufen', () => {
    expect(darstellungAusJson({ skalierung: 1.2 }).skalierung).toBe(1.2);
    for (const wert of [0, -1, 10, 1.234, '1.2', NaN]) expect(darstellungAusJson({ skalierung: wert }).skalierung).toBe(1);
  });
});
