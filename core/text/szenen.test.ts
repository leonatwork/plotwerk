import { describe, expect, it } from 'vitest';
import { klartext, szenenAbschnitte } from './index';

describe('szenenAbschnitte', () => {
  it('ohne Trenner: ein Abschnitt mit dem ganzen Klartext', () => {
    const md = 'Erster Absatz.\n\nZweiter *Absatz*.';
    expect(szenenAbschnitte(md)).toEqual([{ index: 0, start: 0, ende: klartext(md).length, text: klartext(md) }]);
  });

  it('teilt an „* * *“, Bereiche zeigen in den Klartext', () => {
    const md = 'Eins.\n\nZwei.\n\n* * *\n\nDrei.\n\n* * *\n\nVier.';
    const kt = klartext(md);
    const s = szenenAbschnitte(md);
    expect(s.map((x) => x.text)).toEqual(['Eins.\n\nZwei.', 'Drei.', 'Vier.']);
    for (const x of s) expect(kt.slice(x.start, x.ende)).toBe(x.text);
    expect(s.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it('leerer Text und Trenner am Anfang/Ende ergeben leere Szenen', () => {
    expect(szenenAbschnitte('')).toEqual([{ index: 0, start: 0, ende: 0, text: '' }]);
    const s = szenenAbschnitte('* * *\n\nText.\n\n* * *');
    expect(s.map((x) => x.text)).toEqual(['', 'Text.', '']);
  });
});
