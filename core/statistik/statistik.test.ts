import { afterEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type { BenannteFassung, ProjektDaten, Schreibstatistik } from '../model/types';
import { ladeProjekt } from '../projekt';
import type { MemoryFs } from '../projekt/memoryFs';
import {
  aenderungsBloecke,
  AKTUELL,
  BLOCK_WOERTER,
  bucheAenderung,
  datumAusSchluessel,
  diffSpalten,
  durchschnitt,
  fassungenJeVersion,
  fassungenSortiert,
  fassungsQuelle,
  fortschrittJeAkt,
  gesamtFortschritt,
  kalender,
  kapitelAusPfad,
  kapitelAusVersionsPfad,
  kapitelFuerFassung,
  neueFassung,
  offeneUebernehmen,
  offenHinzufuegen,
  PUFFER_MINUTEN,
  quellenText,
  serie,
  tagSchluessel,
  tageZwischen,
  tagVerschieben,
  vergleicheBuch,
  vergleicheTexte,
  versionsQuelle,
  wochentagMo,
  WortzahlSpeicher,
  zaehleDiff,
  zielTage,
} from './index';

const st = (tage: Record<string, number>, tagWoerter = 0, extra: Partial<Schreibstatistik['ziel']> = {}): Schreibstatistik => ({
  version: 1,
  ziel: { tagWoerter, ...extra },
  tage: Object.fromEntries(Object.entries(tage).map(([t, g]) => [t, { geschrieben: g, stand: 0 }])),
});

describe('Tage in lokaler Zeit', () => {
  const tzVorher = process.env.TZ;
  afterEach(() => {
    if (tzVorher === undefined) delete process.env.TZ;
    else process.env.TZ = tzVorher;
  });

  it('Tagesgrenze ist die lokale Mitternacht', () => {
    expect(tagSchluessel(new Date(2026, 9, 10, 23, 59, 59))).toBe('2026-10-10');
    expect(tagSchluessel(new Date(2026, 9, 11, 0, 0, 0))).toBe('2026-10-11');
    expect(tagSchluessel(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });

  it('nutzt die Zeitzone des Rechners, nicht UTC', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 06:30 UTC am 11. ist in Kalifornien noch der 10. Oktober (23:30 PDT)
    expect(tagSchluessel(new Date('2026-10-11T06:30:00Z'))).toBe('2026-10-10');
    process.env.TZ = 'Pacific/Auckland';
    // 12:30 UTC am 10. ist in Neuseeland schon der 11. Oktober (01:30 NZDT)
    expect(tagSchluessel(new Date('2026-10-10T12:30:00Z'))).toBe('2026-10-11');
    process.env.TZ = 'Europe/Berlin';
    expect(tagSchluessel(new Date('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
    expect(tagSchluessel(new Date('2026-10-10T21:30:00Z'))).toBe('2026-10-10');
  });

  it('rechnet über Sommerzeit-Umstellungen hinweg in Kalendertagen', () => {
    process.env.TZ = 'Europe/Berlin';
    expect(tagVerschieben('2026-10-24', 1)).toBe('2026-10-25');
    expect(tagVerschieben('2026-10-25', 1)).toBe('2026-10-26');
    expect(tagVerschieben('2026-03-29', -1)).toBe('2026-03-28');
    expect(tageZwischen('2026-10-20', '2026-10-30')).toBe(10);
    expect(tageZwischen('2026-03-25', '2026-04-02')).toBe(8);
    expect(tagVerschieben('2026-12-31', 1)).toBe('2027-01-01');
    expect(tagVerschieben('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('prüft Datumsangaben und Wochentage', () => {
    expect(datumAusSchluessel('2026-02-30')).toBeNull();
    expect(datumAusSchluessel('kein Datum')).toBeNull();
    expect(wochentagMo('2026-10-05')).toBe(0); // Montag
    expect(wochentagMo('2026-10-11')).toBe(6); // Sonntag
  });
});

describe('Buchen nach der Zählregel', () => {
  const t = new Date(2026, 9, 10, 10, 0, 0);
  const spaeter = (min: number) => new Date(t.getTime() + min * 60_000);

  it('zählt Zunahmen, Löschen zieht nichts ab', () => {
    const a = bucheAenderung(1000, 1012, t, null);
    expect(a).toMatchObject({ tag: '2026-10-10', geschrieben: 12, stand: 1012 });
    const b = bucheAenderung(1012, 950, spaeter(1), a.puffer);
    expect(b).toMatchObject({ geschrieben: 0, stand: 950 });
    expect(b.puffer?.woerter).toBe(62);
    // weitertippen in kleinen Schritten wird nie verrechnet
    const c = bucheAenderung(950, 955, spaeter(2), b.puffer);
    expect(c.geschrieben).toBe(5);
    expect(c.puffer?.woerter).toBe(62);
  });

  it('verrechnet eingefügte Blöcke mit kurz vorher gelöschten Wörtern (Verschieben)', () => {
    const aus = bucheAenderung(2000, 1700, t, null);
    const ein = bucheAenderung(1700, 2000, spaeter(1), aus.puffer);
    expect(ein.geschrieben).toBe(0);
    expect(ein.puffer).toBeNull();
    // größerer Block als gelöscht: der Rest zählt
    const aus2 = bucheAenderung(2000, 1960, t, null);
    expect(bucheAenderung(1960, 2060, spaeter(1), aus2.puffer).geschrieben).toBe(60);
  });

  it('der Puffer verfällt nach der Frist', () => {
    const aus = bucheAenderung(2000, 1700, t, null);
    expect(bucheAenderung(1700, 2000, spaeter(PUFFER_MINUTEN + 1), aus.puffer).geschrieben).toBe(300);
    expect(bucheAenderung(1700, 1700 + BLOCK_WOERTER - 1, spaeter(1), aus.puffer).geschrieben).toBe(BLOCK_WOERTER - 1);
  });

  it('nurStand zählt nicht (Import, Wiederherstellen, Änderung von außen)', () => {
    expect(bucheAenderung(0, 5000, t, null, true)).toMatchObject({ geschrieben: 0, stand: 5000 });
  });

  it('bucht nach Mitternacht auf den neuen Tag', () => {
    expect(bucheAenderung(10, 20, new Date(2026, 9, 10, 23, 59, 59), null).tag).toBe('2026-10-10');
    expect(bucheAenderung(10, 20, new Date(2026, 9, 11, 0, 0, 1), null).tag).toBe('2026-10-11');
  });

  it('offene Tageswerte addieren und übernehmen', () => {
    let offen = offenHinzufuegen({}, { tag: '2026-10-10', geschrieben: 10, stand: 110 });
    offen = offenHinzufuegen(offen, { tag: '2026-10-10', geschrieben: 5, stand: 115 });
    offen = offenHinzufuegen(offen, { tag: '2026-10-11', geschrieben: 0, stand: 90 });
    const basis = st({ '2026-10-10': 100, '2026-10-01': 3 });
    const neu = offeneUebernehmen(basis, offen);
    expect(neu.tage['2026-10-10']).toEqual({ geschrieben: 115, stand: 115 });
    expect(neu.tage['2026-10-11']).toEqual({ geschrieben: 0, stand: 90 });
    expect(Object.keys(neu.tage)).toEqual(['2026-10-01', '2026-10-10', '2026-10-11']);
    expect(offeneUebernehmen(basis, {})).toBe(basis);
  });
});

describe('Auswertung', () => {
  it('Serie: Tage in Folge, heute zählt erst, wenn geschrieben', () => {
    const s = st({ '2026-10-01': 100, '2026-10-02': 50, '2026-10-03': 20, '2026-10-05': 10, '2026-10-06': 0, '2026-10-07': 5, '2026-10-08': 30, '2026-10-09': 40 });
    expect(serie(s, '2026-10-10')).toEqual({ aktuell: 3, laengste: 3, heuteGeschrieben: false });
    expect(serie(s, '2026-10-09')).toMatchObject({ aktuell: 3, heuteGeschrieben: true });
    expect(serie(s, '2026-10-11').aktuell).toBe(0);
    expect(serie(st({}), '2026-10-10')).toEqual({ aktuell: 0, laengste: 0, heuteGeschrieben: false });
    const lang = st({ '2026-09-29': 1, '2026-09-30': 1, '2026-10-01': 1, '2026-10-02': 1, '2026-10-09': 1, '2026-10-10': 1 });
    expect(serie(lang, '2026-10-10')).toEqual({ aktuell: 2, laengste: 4, heuteGeschrieben: true });
  });

  it('Durchschnitt und Zieltage', () => {
    const s = st({ '2026-10-10': 700, '2026-10-09': 300, '2026-10-04': 1000 }, 500);
    expect(durchschnitt(s, '2026-10-10', 7)).toBe(Math.round(2000 / 7));
    expect(zielTage(s, '2026-10-10', 7)).toBe(2);
    expect(zielTage(st({ '2026-10-10': 700 }), '2026-10-10', 7)).toBe(0);
  });

  it('Kalender: ganze Wochen Mo–So, Stufen relativ zum Tagesziel', () => {
    const s = st({ '2026-10-05': 100, '2026-10-06': 260, '2026-10-07': 500, '2026-10-08': 800 }, 500);
    const k = kalender(s, '2026-10-08', 2);
    expect(k).toHaveLength(2);
    expect(k[0]!.beginn).toBe('2026-09-28');
    expect(k[1]!.beginn).toBe('2026-10-05');
    expect(k[1]!.tage.map((d) => d.stufe)).toEqual([1, 2, 3, 4, 0, 0, 0]);
    expect(k[1]!.tage[3]).toMatchObject({ zielErreicht: true, zukunft: false });
    expect(k[1]!.tage[4]!.zukunft).toBe(true);
    // ohne Ziel: relativ zum besten Tag
    const ohne = kalender(st({ '2026-10-05': 100, '2026-10-06': 400 }), '2026-10-06', 1);
    expect(ohne[0]!.tage.slice(0, 2).map((d) => d.stufe)).toEqual([1, 4]);
  });

  it('Gesamtfortschritt mit Zielumfang und Abgabe', () => {
    const s = st({}, 0, { buchWoerter: 80_000, abgabe: '2026-10-19' });
    expect(gesamtFortschritt(s, 20_000, '2026-10-10')).toEqual({
      woerter: 20_000,
      ziel: 80_000,
      anteil: 0.25,
      rest: 60_000,
      tageBisAbgabe: 10,
      proTagNoetig: 6000,
    });
    expect(gesamtFortschritt(st({}), 100, '2026-10-10')).toMatchObject({ ziel: null, anteil: null, proTagNoetig: null });
    expect(gesamtFortschritt(st({}, 0, { buchWoerter: 100 }), 150, '2026-10-10')).toMatchObject({ anteil: 1, rest: 0 });
  });
});

describe('mit dem Demo-Projekt', () => {
  async function demo(): Promise<{ daten: ProjektDaten; fs: MemoryFs }> {
    const fs = demoFs();
    return { daten: await ladeProjekt(fs), fs };
  }

  it('Wortzahl inkrementell, gleich der Summe der Kapitel', async () => {
    const { daten } = await demo();
    const sp = new WortzahlSpeicher();
    const gesamt = sp.buch(daten);
    expect(gesamt).toBeGreaterThan(0);
    const id = daten.projekt.kapitel[0]!;
    const k = daten.kapitel[id]!;
    const mehr = { ...daten, kapitel: { ...daten.kapitel, [id]: { ...k, text: `${k.text}\n\nDrei neue Wörter.` } } };
    expect(sp.buch(mehr)).toBe(gesamt + 3);
  });

  it('Fortschritt je Akt enthält jedes Kapitel genau einmal', async () => {
    const { daten } = await demo();
    const sp = new WortzahlSpeicher();
    const akte = fortschrittJeAkt(daten, (id) => sp.kapitel(id, daten.kapitel[id]?.text ?? ''));
    const ids = akte.flatMap((a) => a.kapitel.map((k) => k.id));
    expect(ids.sort()).toEqual([...daten.projekt.kapitel].sort());
    expect(akte.reduce((n, a) => n + a.woerter, 0)).toBe(sp.buch(daten));
    for (const a of daten.akte) expect(akte.some((x) => x.nummer === a.nummer)).toBe(true);
  });

  it('Fassungen: Quellen lesen und zwei Fassungen vergleichen', async () => {
    const { daten, fs } = await demo();
    const [a, b] = kapitelFuerFassung(daten);
    expect(a && b).toBeTruthy();
    const pa = `manuskript/${a}.md`;
    const pb = `manuskript/${b}.md`;
    const va = '.versionen/' + pa + '/2026-10-01T10-00-00.md';
    const vb = '.versionen/' + pb + '/2026-10-01T10-00-00.md';
    const ta = (await fs.lesen(pa))!;
    await fs.schreiben(va, ta.replace(/\n*$/, '\n\nEin alter Satz am Ende.\n'));
    await fs.schreiben(vb, (await fs.lesen(pb))!);
    const fassung: BenannteFassung = neueFassung('vor-lektorat', ' Vor Lektorat ', new Date(2026, 9, 1, 10), [
      { pfad: pa, version: va },
      { pfad: pb, version: vb },
      { pfad: 'manuskript/weg.md', version: '.versionen/manuskript/weg.md/2026-10-01T10-00-00.md' },
    ]);
    expect(fassung.name).toBe('Vor Lektorat');
    expect(fassung.notiz).toBeUndefined();
    const liste = [fassung];

    const links = await quellenText(fs, daten, liste, fassungsQuelle('vor-lektorat'), a!);
    expect(links.status).toBe('ok');
    expect(await quellenText(fs, daten, liste, fassungsQuelle('vor-lektorat'), 'gibt-es-nicht')).toEqual({ status: 'fehlt-in-fassung' });
    expect((await quellenText(fs, daten, liste, versionsQuelle(vb), b!)).status).toBe('ok');
    expect((await quellenText(fs, daten, liste, AKTUELL, a!)).status).toBe('ok');

    const buch = await vergleicheBuch(fs, daten, liste, fassungsQuelle('vor-lektorat'), AKTUELL);
    expect(buch.find((k) => k.id === a)).toMatchObject({ status: 'geaendert' });
    expect(buch.find((k) => k.id === b)).toMatchObject({ status: 'gleich' });
    expect(buch.find((k) => k.id === 'weg')).toMatchObject({ status: 'datei-fehlt' });
    const nurRechts = buch.filter((k) => k.status === 'nur-rechts').map((k) => k.id);
    // aktuell zählen nur Kapitel mit Text (leere Kapitel erscheinen nicht als „neu“)
    expect(nurRechts.length).toBe(kapitelFuerFassung(daten).length - 2);

    if (links.status !== 'ok') throw new Error('unerwartet');
    const diff = vergleicheTexte(links.text, daten.kapitel[a!]!.text);
    expect(zaehleDiff(diff)).toEqual({ neu: 0, entfernt: 5 });
  });

  it('Hilfen rund um Fassungen', () => {
    const f1 = neueFassung('a', 'A', new Date(2026, 0, 1), [{ pfad: 'manuskript/x.md', version: 'v1' }], ' Notiz ');
    const f2 = neueFassung('b', 'B', new Date(2026, 5, 1), [{ pfad: 'manuskript/x.md', version: 'v1' }]);
    expect(f1.notiz).toBe('Notiz');
    expect(fassungenSortiert([f1, f2]).map((f) => f.id)).toEqual(['b', 'a']);
    expect(fassungenJeVersion([f1, f2]).get('v1')?.map((f) => f.id)).toEqual(['a', 'b']);
    expect(kapitelAusPfad('manuskript/lotte.md')).toBe('lotte');
    expect(kapitelAusPfad('plan/akte.md')).toBeNull();
  });
});

describe('Diff in zwei Spalten', () => {
  it('gleiche Teile tragen in beiden Spalten denselben Anker', () => {
    const diff = vergleicheTexte('Paul trinkt Kaffee im Büro.', 'Paul trinkt Tee im Büro.');
    const { links, rechts } = diffSpalten(diff);
    expect(links.map((t) => t.text).join('')).toBe('Paul trinkt Kaffee im Büro.');
    expect(rechts.map((t) => t.text).join('')).toBe('Paul trinkt Tee im Büro.');
    expect(links.filter((t) => t.anker !== null).map((t) => t.anker)).toEqual(rechts.filter((t) => t.anker !== null).map((t) => t.anker));
    expect(links.some((t) => t.typ === 'entfernt' && t.text.includes('Kaffee'))).toBe(true);
    expect(rechts.some((t) => t.typ === 'neu' && t.text.includes('Tee'))).toBe(true);
  });
});


describe('Vergleich nebeneinander', () => {
  it('teilt gleiche Passagen an Absätzen, damit beide Spalten oft gemeinsame Anker haben', () => {
    const a = 'Erster Absatz bleibt.\n\nZweiter Absatz bleibt.\n\nDritter mit Kaffee.';
    const b = 'Erster Absatz bleibt.\n\nZweiter Absatz bleibt.\n\nDritter mit Tee.';
    const { links, rechts } = diffSpalten(vergleicheTexte(a, b));
    expect(links.map((t) => t.text).join('')).toBe(a);
    expect(rechts.map((t) => t.text).join('')).toBe(b);
    const anker = links.filter((t) => t.anker !== null);
    expect(anker.length).toBeGreaterThanOrEqual(3);
    expect(anker[0]!.text).toBe('Erster Absatz bleibt.\n\n');
    // Positionen im Diff sind über beide Spalten eindeutig und aufsteigend
    const nrLinks = links.map((t) => t.nr);
    expect([...nrLinks].sort((x, y) => x - y)).toEqual(nrLinks);
  });

  it('fasst benachbarte Änderungen zu Blöcken zusammen', () => {
    const diff = vergleicheTexte('Paul trinkt Kaffee. Lotte lacht laut.', 'Paul trinkt Tee. Lotte lacht.');
    const bloecke = aenderungsBloecke(diff);
    expect(bloecke.length).toBe(2);
    expect(diff[bloecke[0]!]!.typ).not.toBe('gleich');
    expect(aenderungsBloecke(vergleicheTexte('gleich', 'gleich'))).toEqual([]);
  });

  it('liest das Kapitel aus einem Schnappschuss-Pfad', () => {
    expect(kapitelAusVersionsPfad('.versionen/manuskript/grundriss.md/2026-10-01T20-00-00.md')).toBe('grundriss');
    expect(kapitelAusVersionsPfad('.versionen/manuskript/grundriss.md/2026-10-01T20-00-00-2.md')).toBe('grundriss');
    expect(kapitelAusVersionsPfad('.versionen/plan/akte.md/2026-10-01T20-00-00.md')).toBeNull();
    expect(kapitelAusVersionsPfad('manuskript/grundriss.md')).toBeNull();
  });
});

describe('Tagesgrenzen beim Buchen in anderen Zeitzonen', () => {
  const tzVorher = process.env.TZ;
  afterEach(() => {
    if (tzVorher === undefined) delete process.env.TZ;
    else process.env.TZ = tzVorher;
  });

  it('derselbe Zeitpunkt landet je nach Zeitzone des Macs auf dem lokalen Tag', () => {
    const zeitpunkt = new Date('2026-10-10T22:30:00Z');
    process.env.TZ = 'Europe/Berlin';
    expect(bucheAenderung(0, 10, zeitpunkt, null).tag).toBe('2026-10-11');
    process.env.TZ = 'America/New_York';
    expect(bucheAenderung(0, 10, zeitpunkt, null).tag).toBe('2026-10-10');
  });

  it('Serie und Kalender bleiben über die Zeitumstellung lückenlos', () => {
    process.env.TZ = 'Europe/Berlin';
    // 25.10.2026: Umstellung auf Winterzeit (der Tag hat 25 Stunden)
    const s = st({ '2026-10-24': 10, '2026-10-25': 10, '2026-10-26': 10 });
    expect(serie(s, '2026-10-26')).toMatchObject({ aktuell: 3, laengste: 3 });
    const k = kalender(s, '2026-10-26', 2);
    const tage = k.flatMap((w) => w.tage.map((t) => t.tag));
    expect(new Set(tage).size).toBe(14);
    expect(tage).toContain('2026-10-25');
    expect(k.every((w) => wochentagMo(w.beginn) === 0)).toBe(true);
  });
});
