/** Werkzeug-Dateien G1–G8: Roundtrips, unbekannte Felder, Laden, externe Änderungen, Binärdateien. */
import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type {
  BenannteFassung,
  BuchFrage,
  Fadenplanung,
  Figurenbogen,
  KapitelPlan,
  KiAblage,
  LektoratsAenderung,
  LeserStand,
  Markenliste,
  Recherche,
  Schreibstatistik,
  StimmenBeobachtung,
  Zeitleiste,
  ZeitVorschlag,
  ZustandVorschlag,
} from '../model/types';
import {
  binaerPfadErlaubt,
  binaerVersionsPfad,
  entferneBinaerMitSchnappschuss,
  ladeProjekt,
  ladeProjektMitBericht,
  leseBinaer,
  MemoryFs,
  parseBoegen,
  parseFadenplanung,
  parseFassungen,
  parseKapitelPlan,
  parseKiFragen,
  parseKiLeser,
  parseKiStimmen,
  parseKiZeitVorschlaege,
  parseKiZustandVorschlaege,
  parseLektorat,
  parseMarken,
  parseProjekt,
  parseRecherche,
  parseStatistik,
  parseZeitleiste,
  PFADE,
  schreibeBinaer,
  serializeBoegen,
  serializeFadenplanung,
  serializeFassungen,
  serializeKapitelPlan,
  serializeKiFragen,
  serializeKiLeser,
  serializeKiStimmen,
  serializeKiZeitVorschlaege,
  serializeKiZustandVorschlaege,
  serializeLektorat,
  serializeMarken,
  serializeProjekt,
  serializeRecherche,
  serializeStatistik,
  serializeZeitleiste,
  speichereZeitleiste,
  STANDARD_ZUSTANDSARTEN,
  uebernehmeExterneAenderungen,
} from './index';

const anker = { kapitel: 'lotte', exakt: 'Platte', davor: 'dieselbe ', danach: '.' };

describe('Roundtrip parse(serialize(x)) – Werkzeuge', () => {
  it('KapitelPlan mit Zeitpunkt und Szenen; Projekt mit Angaben', () => {
    const plan: KapitelPlan = {
      id: 'lotte', titel: 'Lotte', akt: 1, status: 'geschrieben', szene: 'S', straenge: [], figuren: [], orte: [], notiz: '', abweichungen: [], realitaet: [],
      zeit: { tag: 2, wochentag: 'montag', tageszeit: 'abends', uhrzeit: '19:30', dauer: 90, sicherheit: 'fest', beleg: anker, notiz: 'n' },
      szenen: [
        { id: 'lotte-s1', kapitel: 'lotte', index: 0, titel: 'Bad', figuren: ['paul'], notiz: '' },
        { id: 'lotte-s2', kapitel: 'lotte', index: 1, titel: 'Lindenhof', ort: 'lindenhof', figuren: ['paul', 'lotte'], zeit: { sicherheit: 'ungefaehr', datum: '2024-05-06' }, notiz: 'Zwei\nZeilen' },
      ],
    };
    expect(parseKapitelPlan(serializeKapitelPlan(plan))).toEqual(plan);
    const ohne: KapitelPlan = { ...plan, zeit: undefined, szenen: undefined };
    delete ohne.zeit;
    delete ohne.szenen;
    expect(serializeKapitelPlan(ohne)).not.toMatch(/zeit|szenen/);
    expect(parseKapitelPlan(serializeKapitelPlan(ohne))).toEqual(ohne);
    const projekt = { version: 1 as const, titel: 'T', kapitel: ['a'], angaben: { autor: 'Leon', genre: 'Roman', sprache: 'de' }, notiz: '' };
    expect(parseProjekt(serializeProjekt(projekt))).toEqual(projekt);
  });

  it('Markdown-Dateien: Zeitleiste, Fäden, Bögen, Marken', () => {
    const z: Zeitleiste = {
      beginn: { wochentag: 'freitag', datum: '2024-05-03' },
      zustandsarten: [{ id: 'ausgeruht', name: 'ausgeruht', farbe: 'real-gesichert' }, { id: 'muede', name: 'müde', farbe: 'ink-quiet' }],
      zustaende: [{ id: 'z1', figur: 'paul', kapitel: 'lotte', szene: 'lotte-s2', zustand: 'muede', notiz: 'n', beleg: anker }, { id: 'z2', figur: 'paul', kapitel: 'ebbe', zustand: 'ausgeruht' }],
      notiz: 'Freie Notiz',
    };
    expect(parseZeitleiste(serializeZeitleiste(z))).toEqual(z);
    const f: Fadenplanung = { ruheSchwelle: 4, faeden: [{ id: 'postkarten', aufloesungIn: 'funkstille', notiz: 'n', ruheSchwelle: 2, strang: 'postkarten' }, { id: 'eigen', name: 'Eigener', eroeffnetIn: 'lotte' }] };
    expect(parseFadenplanung(serializeFadenplanung(f))).toEqual(f);
    const b: Figurenbogen[] = [{ figur: 'paul', stufen: [{ id: 's1', kapitel: 'lotte', titel: 'Im Lot', belege: [anker] }, { id: 's2', akt: 3, titel: 'Ohne Schlaf', notiz: 'n', belege: [] }] }];
    expect(parseBoegen(serializeBoegen(b))).toEqual(b);
    const m: Markenliste = { marken: [{ id: 'saab', name: 'Saab', aliase: ['Saab 900'], kategorie: 'Auto' }, { id: 'aperol', name: 'Aperol', aliase: [], notiz: 'n' }], ignoriert: ['Kleinanzeigen'] };
    expect(parseMarken(serializeMarken(m))).toEqual(m);
  });

  it('JSON-Dateien: Statistik, Fassungen, Lektorat, Recherche', () => {
    const st: Schreibstatistik = { version: 1, ziel: { tagWoerter: 800, buchWoerter: 80000, abgabe: '2027-03-01' }, tage: { '2026-10-10': { geschrieben: 812, stand: 23000 }, '2026-10-09': { geschrieben: 0, stand: 22188 } } };
    const st2 = parseStatistik(serializeStatistik(st));
    expect(st2).toEqual(st);
    expect(Object.keys(st2.tage)).toEqual(['2026-10-09', '2026-10-10']);
    const fa: BenannteFassung[] = [{ id: 'vor-lektorat', name: 'Fassung vor Lektorat', datum: '2026-10-10T10:00:00.000Z', notiz: 'n', dateien: [{ pfad: 'manuskript/lotte.md', version: '.versionen/manuskript/lotte.md/2026-10-10T12-00-00.md' }] }];
    expect(parseFassungen(serializeFassungen(fa))).toEqual(fa);
    const le: LektoratsAenderung[] = [
      { id: 'a1', anker, art: 'ersetzen', alt: 'Platte', neu: 'Musik', autor: 'Lektorin', datum: '2026-10-01T09:00:00Z', quelle: 'Hafenlichter_lektoriert.docx', status: 'offen' },
      { id: 'a2', anker, art: 'einfuegen', alt: '', neu: ' laut', status: 'angenommen' },
    ];
    expect(parseLektorat(serializeLektorat(le))).toEqual(le);
    const re: Recherche = {
      version: 1,
      eintraege: [
        { id: 'r1', art: 'bild', titel: 'Lindenhof', datei: 'recherche/dateien/lindenhof.svg', text: '', verweise: [{ typ: 'ort', id: 'lindenhof' }], erstellt: '2026-10-10T10:00:00Z', schlagworte: ['Hafen'] },
        { id: 'r2', art: 'link', titel: 'Saab 900', url: 'https://example.org', text: 'Notiz', verweise: [], erstellt: '' },
      ],
    };
    expect(parseRecherche(serializeRecherche(re))).toEqual(re);
  });

  it('KI-Ablagen', () => {
    const zitat = { kapitel: 'lotte', text: 'dieselbe Platte' };
    const lauf = { datum: '2026-10-10T10:00:00Z', modell: 'claude-sonnet-5-5', kostenUsd: 0.12 };
    const zv: KiAblage<ZeitVorschlag> = { version: 1, eintraege: [{ schluessel: 'zeit:lotte', kapitel: 'lotte', zeit: { tageszeit: 'abends', sicherheit: 'ungefaehr' }, belege: [zitat], begruendung: 'b', status: 'neu' }], lauf };
    expect(parseKiZeitVorschlaege(serializeKiZeitVorschlaege(zv))).toEqual(zv);
    const zu: KiAblage<ZustandVorschlag> = { version: 1, eintraege: [{ schluessel: 'zustand:paul@lotte', figur: 'paul', kapitel: 'lotte', szene: 'lotte-s1', zustand: 'ausgeruht', belege: [zitat], begruendung: 'b', status: 'verworfen' }] };
    expect(parseKiZustandVorschlaege(serializeKiZustandVorschlaege(zu))).toEqual(zu);
    const sb: KiAblage<StimmenBeobachtung> = { version: 1, eintraege: [{ schluessel: 'stimme:paul|x', figur: 'paul', kapitel: 'lotte', titel: 't', erklaerung: 'e', zitate: [zitat], vergleich: [], status: 'absicht' }] };
    expect(parseKiStimmen(serializeKiStimmen(sb))).toEqual(sb);
    const ls: KiAblage<LeserStand> = { version: 1, eintraege: [{ kapitel: 'lotte', basisHash: 'h', weiss: [{ text: 'w', belege: [zitat] }], fragen: [{ id: 'f1', frage: 'Wer?', belege: [zitat], beantwortetIn: 'ebbe' }], modell: 'm', datum: 'd' }] };
    expect(parseKiLeser(serializeKiLeser(ls))).toEqual(ls);
    const bf: KiAblage<BuchFrage> = { version: 1, eintraege: [{ id: 'q1', frage: 'Wo erwähne ich Pauls Bleistifte?', datum: 'd', antwort: 'In Kap. 2 und 9.', belege: [zitat], modell: 'm', kostenUsd: 0.01 }] };
    expect(parseKiFragen(serializeKiFragen(bf))).toEqual(bf);
    // G6: eigene Felder für Vermutungen, Spannung, Plan-Abgleich und „steht nicht im Buch“
    const ls2: KiAblage<LeserStand> = {
      version: 1,
      eintraege: [
        {
          ...ls.eintraege[0]!,
          vermutungen: [{ text: 'v', belege: [zitat] }],
          spannung: [{ text: 's', belege: [zitat] }],
          plan: [{ kapitel: 'lotte', aussage: 'Paul trifft Lotte', status: 'teilweise', erklaerung: 'e', belege: [zitat] }],
        },
      ],
    };
    expect(parseKiLeser(serializeKiLeser(ls2))).toEqual(ls2);
    const bf2: KiAblage<BuchFrage> = { version: 1, eintraege: [{ ...bf.eintraege[0]!, belege: [], imBuch: false }] };
    expect(parseKiFragen(serializeKiFragen(bf2))).toEqual(bf2);
  });
});

describe('Werkzeug-Dateien tolerant und verlustfrei', () => {
  it('fehlende Zustandsliste → Standard; leere Liste bleibt leer; Wochentag tolerant', () => {
    expect(parseZeitleiste('---\nzustaende: []\n---\n').zustandsarten).toEqual(STANDARD_ZUSTANDSARTEN);
    expect(parseZeitleiste('---\nzustandsarten: []\n---\n').zustandsarten).toEqual([]);
    expect(parseZeitleiste('---\nbeginn:\n  wochentag: Montag\n---\n').beginn).toEqual({ wochentag: 'montag' });
    expect(parseKapitelPlan('---\nid: a\nzeit:\n  wochentag: Do\n  sicherheit: quatsch\n---\n').zeit).toEqual({ wochentag: 'donnerstag', sicherheit: 'ungefaehr' });
    expect(parseFadenplanung('---\nfaeden: [{name: ohne id}]\n---\n')).toEqual({ ruheSchwelle: 3, faeden: [] });
    expect(parseStatistik('{"tage": {"kein-datum": {"geschrieben": 5}, "2026-01-01": {"geschrieben": -3}}}').tage).toEqual({ '2026-01-01': { geschrieben: 0, stand: 0 } });
  });

  it('unbekannte Felder in Frontmatter, Listen und Body bleiben beim Speichern erhalten', () => {
    const alt = '---\nobsidian: ja\nzustandsarten:\n  - id: ausgeruht\n    name: ausgeruht\n    farbe: real-gesichert\n    symbol: 🙂\nzustaende: []\n---\n\nNotiz\n';
    const z = parseZeitleiste(alt);
    const neu = serializeZeitleiste({ ...z, zustandsarten: [...z.zustandsarten, { id: 'krank', name: 'krank', farbe: 'strang-violett' }] }, alt);
    expect(neu).toContain('obsidian: ja');
    expect(neu).toContain('symbol: 🙂');
    expect(neu).toContain('Notiz');
    const fAlt = '---\nruheSchwelle: 3\nfaeden:\n  - id: postkarten\n    farbe: gelb\n---\n\nFreitext\n';
    const fNeu = serializeFadenplanung({ ...parseFadenplanung(fAlt), ruheSchwelle: 5 }, fAlt);
    expect(fNeu).toContain('farbe: gelb');
    expect(fNeu).toContain('Freitext');
    const bAlt = '---\nboegen:\n  - figur: paul\n    farbe: rot\n    stufen:\n      - id: s1\n        titel: A\n        extra: 1\n---\n';
    const bNeu = serializeBoegen(parseBoegen(bAlt), bAlt);
    expect(bNeu).toContain('farbe: rot');
    expect(bNeu).toContain('extra: 1');
  });
});

describe('Laden, Speichern, externe Änderungen', () => {
  it('ladeProjekt füllt Standardwerte für fehlende Werkzeug-Dateien; KI-Ablagen fehlen', async () => {
    const fs = new MemoryFs({ 'projekt.md': '---\nversion: 1\ntitel: Leer\nkapitel: []\n---\n' });
    const { daten, warnungen } = await ladeProjektMitBericht(fs);
    expect(warnungen).toEqual([]);
    expect(daten.zeitleiste?.zustandsarten.map((z) => z.name)).toEqual(['ausgeruht', 'erschöpft', 'krank', 'verletzt', 'betrunken']);
    expect(daten.fadenplanung).toEqual({ ruheSchwelle: 3, faeden: [] });
    expect(daten.boegen).toEqual([]);
    expect(daten.marken).toEqual({ marken: [], ignoriert: [] });
    expect(daten.statistik).toEqual({ version: 1, ziel: { tagWoerter: 0 }, tage: {} });
    expect(daten.fassungen).toEqual([]);
    expect(daten.lektorat).toEqual([]);
    expect(daten.recherche).toEqual({ version: 1, eintraege: [] });
    for (const k of ['kiZeitVorschlaege', 'kiZustandVorschlaege', 'kiStimmen', 'kiLeser', 'kiFragen'] as const) expect(daten[k]).toBeUndefined();
  });

  it('kaputtes JSON → Warnung, Standardwert; Speichern schreibt nur bei Änderung', async () => {
    const fs = new MemoryFs({ 'projekt.md': '---\nversion: 1\ntitel: X\nkapitel: []\n---\n', 'statistik.json': '{kaputt' });
    const { daten, warnungen } = await ladeProjektMitBericht(fs);
    expect(warnungen.map((w) => w.pfad)).toEqual(['statistik.json']);
    expect(daten.statistik?.tage).toEqual({});
    expect(await speichereZeitleiste(fs, daten.zeitleiste!)).toBe(true);
    expect(await speichereZeitleiste(fs, daten.zeitleiste!)).toBe(false);
  });

  it('externe Änderung einer Werkzeug-Datei übernimmt nur dieses Feld; gelöschte KI-Ablage verschwindet', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    expect(alt.kiFragen).toBeDefined();
    await fs.schreiben(PFADE.marken, '---\nmarken:\n  - id: ikea\n    name: IKEA\n---\n');
    await fs.entfernen(PFADE.kiFragen);
    const neu = await ladeProjekt(fs);
    const d = uebernehmeExterneAenderungen(alt, neu, [PFADE.marken, PFADE.kiFragen]);
    expect(d.marken?.marken.map((m) => m.name)).toEqual(['IKEA']);
    expect('kiFragen' in d).toBe(false);
    expect(d.zeitleiste).toBe(alt.zeitleiste);
  });
});

describe('Binärdateien (G8)', () => {
  it('nur unter recherche/, Schnappschuss vor dem Entfernen', async () => {
    expect(binaerPfadErlaubt('recherche/dateien/a.png')).toBe(true);
    expect(binaerPfadErlaubt('recherche/recherche.json')).toBe(false);
    expect(binaerPfadErlaubt('manuskript/a.md')).toBe(false);
    expect(binaerPfadErlaubt('../recherche/a.png')).toBe(false);
    expect(binaerVersionsPfad('recherche/dateien/a.png', new Date(2026, 9, 10, 12, 0, 0))).toBe('.versionen/recherche/dateien/a.png/2026-10-10T12-00-00.png');

    const fs = new MemoryFs();
    const bytes = new Uint8Array([0, 1, 2, 255, 254]);
    await schreibeBinaer(fs, 'recherche/dateien/a.png', bytes);
    expect(await leseBinaer(fs, 'recherche/dateien/a.png')).toEqual(bytes);
    await expect(fs.lesen('recherche/dateien/a.png')).rejects.toThrow('UTF-8');
    await expect(schreibeBinaer(fs, 'projekt.md', bytes)).rejects.toThrow('recherche/');
    // Persistenz der Browser-Demo: Binärdateien überstehen alleDateien() → new MemoryFs()
    const kopie = new MemoryFs(fs.alleDateien());
    expect(await leseBinaer(kopie, 'recherche/dateien/a.png')).toEqual(bytes);
    const ziel = await entferneBinaerMitSchnappschuss(fs, 'recherche/dateien/a.png', new Date(2026, 9, 10, 12, 0, 0));
    expect(ziel).toBe('.versionen/recherche/dateien/a.png/2026-10-10T12-00-00.png');
    expect(await fs.existiert('recherche/dateien/a.png')).toBe(false);
    expect(await leseBinaer(fs, ziel!)).toEqual(bytes);
    // Textdateien (SVG im Demo-Projekt) kommen als UTF-8-Bytes
    await fs.schreiben('recherche/dateien/b.svg', '<svg/>');
    expect(new TextDecoder().decode((await leseBinaer(fs, 'recherche/dateien/b.svg'))!)).toBe('<svg/>');
  });
});
