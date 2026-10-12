import { describe, expect, it } from 'vitest';
import { MemoryFs, schnappschuss } from '../projekt';
import { aufbewahrungAnwenden, isoWoche, sollSchnappschuss, standGesichert, versionenAuflisten, versionsPfad, wortDiff, zuLoeschen, type Version } from './index';

const lokal = (j: number, m: number, t: number, h = 12, mi = 0, s = 0) => new Date(j, m - 1, t, h, mi, s);

describe('versionsPfad / versionenAuflisten', () => {
  it('Pfadformat in lokaler Zeit', () => {
    expect(versionsPfad('manuskript/lotte.md', lokal(2026, 10, 8, 9, 5, 7))).toBe('.versionen/manuskript/lotte.md/2026-10-08T09-05-07.md');
  });

  it('listet die Schnappschüsse einer Datei, neueste zuerst, ignoriert Fremdes', async () => {
    const fs = new MemoryFs({ 'manuskript/lotte.md': 'v3' });
    await fs.schreiben(versionsPfad('manuskript/lotte.md', lokal(2026, 10, 1)), 'v1');
    await fs.schreiben(versionsPfad('manuskript/lotte.md', lokal(2026, 10, 2)), 'v2');
    await fs.schreiben('.versionen/manuskript/lotte.md/notiz.txt', 'x');
    await fs.schreiben(versionsPfad('manuskript/lotte-2.md', lokal(2026, 10, 3)), 'fremd');
    await schnappschuss(fs, 'manuskript/lotte.md', lokal(2026, 10, 5));
    const v = await versionenAuflisten(fs, 'manuskript/lotte.md');
    expect(v.map((x) => x.versionsPfad)).toEqual([
      '.versionen/manuskript/lotte.md/2026-10-05T12-00-00.md',
      '.versionen/manuskript/lotte.md/2026-10-02T12-00-00.md',
      '.versionen/manuskript/lotte.md/2026-10-01T12-00-00.md',
    ]);
    expect(v[0]).toEqual({ pfad: 'manuskript/lotte.md', zeit: lokal(2026, 10, 5).toISOString(), versionsPfad: v[0]!.versionsPfad });
    expect(await fs.lesen(v[0]!.versionsPfad)).toBe('v3');
    expect(await versionenAuflisten(fs, 'manuskript/fehlt.md')).toEqual([]);
  });
});

describe('sollSchnappschuss', () => {
  const jetzt = lokal(2026, 10, 8, 12, 0);
  const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000);
  it.each([
    ['kapitelwechsel', vor(1), true, true],
    ['kapitelwechsel', vor(1), false, false],
    ['beenden', vor(1), true, true],
    ['beenden', null, false, false],
    ['intervall', vor(9), true, false],
    ['intervall', vor(10), true, true],
    ['intervall', vor(30), false, false],
    ['intervall', null, true, true],
    ['wiederherstellen', vor(1), true, true],
    ['wiederherstellen', vor(1), false, false],
    ['wiederherstellen', null, false, true],
    ['entfernen', null, false, true],
    ['entfernen', vor(1), true, true],
  ] as const)('%s, letzter %s, geändert %s → %s', (anlass, letzter, geaendert, erwartet) => {
    expect(sollSchnappschuss(anlass, letzter, jetzt, geaendert)).toBe(erwartet);
  });
});

describe('zuLoeschen (90 Tage alle, danach eine pro Woche)', () => {
  const jetzt = lokal(2026, 10, 8);
  const v = (pfad: string, d: Date): Version => ({ pfad, zeit: d.toISOString(), versionsPfad: versionsPfad(pfad, d) });
  const tageZurueck = (t: number, h = 12) => new Date(jetzt.getTime() - t * 86_400_000 + (h - 12) * 3_600_000);

  it('behält alles der letzten 90 Tage', () => {
    const liste = [v('a.md', tageZurueck(1)), v('a.md', tageZurueck(1, 13)), v('a.md', tageZurueck(89))];
    expect(zuLoeschen(liste, jetzt)).toEqual([]);
  });

  it('ältere: je Datei und ISO-Woche nur die neueste', () => {
    // 2026-06-01 ist ein Montag; 01.–07.06. = KW 23
    const mo = v('a.md', lokal(2026, 6, 1, 9));
    const mi = v('a.md', lokal(2026, 6, 3, 9));
    const so = v('a.md', lokal(2026, 6, 7, 20));
    const naechsterMo = v('a.md', lokal(2026, 6, 8, 9));
    const andereDatei = v('b.md', lokal(2026, 6, 2, 9));
    const neu = v('a.md', tageZurueck(3));
    const weg = zuLoeschen([mo, neu, so, mi, naechsterMo, andereDatei], jetzt);
    expect(weg.map((x) => x.versionsPfad)).toEqual([mo.versionsPfad, mi.versionsPfad]);
    expect(isoWoche(lokal(2026, 6, 1))).toBe('2026-W23');
    expect(isoWoche(lokal(2026, 6, 7))).toBe('2026-W23');
    expect(isoWoche(lokal(2027, 1, 1))).toBe('2026-W53');
  });
});

describe('wortDiff', () => {
  it('gleich, neu, entfernt mit Leerraum', () => {
    expect(wortDiff('Ich steige aus, schließe die Tür', 'Ich steige ein, schließe die Tür.')).toEqual([
      { typ: 'gleich', text: 'Ich steige ' },
      { typ: 'entfernt', text: 'aus' },
      { typ: 'neu', text: 'ein' },
      { typ: 'gleich', text: ', schließe die Tür' },
      { typ: 'neu', text: '.' },
    ]);
  });

  it('identisch und leer', () => {
    expect(wortDiff('a b', 'a b')).toEqual([{ typ: 'gleich', text: 'a b' }]);
    expect(wortDiff('', 'neu')).toEqual([{ typ: 'neu', text: 'neu' }]);
    expect(wortDiff('alt', '')).toEqual([{ typ: 'entfernt', text: 'alt' }]);
  });

  it('Teile ergeben zusammengesetzt alt bzw. neu', () => {
    const alt = 'Paul setzt sich auf einen Stuhl von Karl Hansen.';
    const neu = 'Paul setzt sich  auf den Stuhl von Carl Hansen und wartet.';
    const d = wortDiff(alt, neu);
    expect(d.filter((t) => t.typ !== 'neu').map((t) => t.text).join('')).toBe(alt);
    expect(d.filter((t) => t.typ !== 'entfernt').map((t) => t.text).join('')).toBe(neu);
  });
});

describe('Schnappschüsse in derselben Sekunde', () => {
  it('überschreibt nicht, sondern hängt -2, -3 an; neueste zuerst; identische nicht doppelt', async () => {
    const fs = new MemoryFs({ 'manuskript/lotte.md': 'v1' });
    const t = lokal(2026, 10, 8, 9, 5, 7);
    const a = await schnappschuss(fs, 'manuskript/lotte.md', t);
    expect(await schnappschuss(fs, 'manuskript/lotte.md', t)).toBe(a);
    await fs.schreiben('manuskript/lotte.md', 'v2');
    const b = await schnappschuss(fs, 'manuskript/lotte.md', t);
    await fs.schreiben('manuskript/lotte.md', 'v3');
    const c = await schnappschuss(fs, 'manuskript/lotte.md', t);
    expect([a, b, c]).toEqual([
      '.versionen/manuskript/lotte.md/2026-10-08T09-05-07.md',
      '.versionen/manuskript/lotte.md/2026-10-08T09-05-07-2.md',
      '.versionen/manuskript/lotte.md/2026-10-08T09-05-07-3.md',
    ]);
    const v = await versionenAuflisten(fs, 'manuskript/lotte.md');
    expect(await Promise.all(v.map((x) => fs.lesen(x.versionsPfad)))).toEqual(['v3', 'v2', 'v1']);
  });
});

describe('standGesichert', () => {
  it('true nur, wenn der neueste Schnappschuss dem aktuellen Inhalt entspricht', async () => {
    const fs = new MemoryFs({ 'manuskript/lotte.md': 'v1' });
    expect(await standGesichert(fs, 'manuskript/lotte.md')).toBe(false);
    await schnappschuss(fs, 'manuskript/lotte.md', lokal(2026, 10, 1));
    expect(await standGesichert(fs, 'manuskript/lotte.md')).toBe(true);
    await fs.schreiben('manuskript/lotte.md', 'v2');
    expect(await standGesichert(fs, 'manuskript/lotte.md')).toBe(false);
    expect(await standGesichert(fs, 'manuskript/fehlt.md')).toBe(true);
  });

  it('Anlass „extern“ sichert immer', () => {
    expect(sollSchnappschuss('extern', new Date(), new Date(), false)).toBe(true);
  });
});

describe('aufbewahrungAnwenden', () => {
  it('behält 90 Tage alle, danach je Datei und Woche den neuesten', async () => {
    const fs = new MemoryFs({ 'manuskript/lotte.md': 'jetzt', 'figuren/paul.md': 'x' });
    const jetzt = lokal(2026, 10, 8);
    const alt1 = versionsPfad('manuskript/lotte.md', lokal(2026, 5, 4, 9));
    const alt2 = versionsPfad('manuskript/lotte.md', lokal(2026, 5, 5, 9));
    const frisch = versionsPfad('manuskript/lotte.md', lokal(2026, 10, 1));
    const andere = versionsPfad('figuren/paul.md', lokal(2026, 5, 4, 9));
    for (const p of [alt1, alt2, frisch, andere]) await fs.schreiben(p, 'v');
    expect(await aufbewahrungAnwenden(fs, jetzt)).toBe(1);
    expect(await fs.existiert(alt1)).toBe(false);
    expect(await fs.existiert(alt2)).toBe(true);
    expect(await fs.existiert(frisch)).toBe(true);
    expect(await fs.existiert(andere)).toBe(true);
  });
});

