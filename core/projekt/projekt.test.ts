import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Figur, Gruppe, KapitelPlan, Ort } from '../model/types';
import type { ProjektLeser } from './fs';
import {
  entferneMitSchnappschuss,
  ladeProjekt,
  ladeProjektMitBericht,
  MemoryFs,
  parseAkte,
  parseAnalyse,
  parseAnmerkungen,
  parseEntscheidungen,
  parseFigur,
  parseGruppe,
  parseHinweise,
  parseIdeen,
  parseMotive,
  parseKapitel,
  parseKapitelPlan,
  parseOrt,
  parseProjekt,
  parseStraenge,
  pruefePfad,
  schnappschuss,
  serializeAkte,
  serializeAnalyse,
  serializeAnmerkungen,
  serializeEntscheidungen,
  serializeFigur,
  serializeGruppe,
  serializeHinweise,
  serializeIdeen,
  serializeMotive,
  serializeKapitel,
  serializeKapitelPlan,
  serializeOrt,
  serializeProjekt,
  serializeStraenge,
  speichereAnmerkungen,
  speichereFigur,
  speichereKapitel,
  speicherePlan,
} from './index';
import * as w from './index';
import { PFADE } from './index';

const DEMO = join(__dirname, '..', '..', 'fixtures', 'demo-projekt');

/** Kleiner Leser auf dem echten Dateisystem (nur für Tests). */
class NodeLeser implements ProjektLeser {
  constructor(private readonly wurzel: string) {}
  async lesen(pfad: string) {
    try {
      return await readFile(join(this.wurzel, pfad), 'utf8');
    } catch {
      return null;
    }
  }
  async auflisten(ordner: string) {
    const ergebnis: string[] = [];
    const lauf = (o: string) => {
      let eintraege;
      try {
        eintraege = readdirSync(o, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of eintraege) {
        const voll = join(o, e.name);
        if (e.isDirectory()) lauf(voll);
        else ergebnis.push(relative(this.wurzel, voll).split(sep).join('/'));
      }
    };
    lauf(join(this.wurzel, ordner));
    return ergebnis.sort();
  }
  async existiert(pfad: string) {
    return (await this.lesen(pfad)) !== null;
  }
}

describe('ladeProjekt auf fixtures/demo-projekt', () => {
  it('lädt alle Teile', async () => {
    const { daten, warnungen } = await ladeProjektMitBericht(new NodeLeser(DEMO));
    expect(warnungen).toEqual([]);
    expect(daten.projekt.titel).toBe('Hafenlichter');
    expect(daten.projekt.kapitel).toEqual([
      'grundriss', 'fassade', 'lotte', 'regatta', 'staub', 'weissraum', 'ebbe', 'bis-bald', 'flut', 'funkstille',
    ]);
    expect(daten.projekt.ki?.deployments.pruefung).toBe('claude-sonnet-5-5');
    expect(Object.keys(daten.kapitel)).toHaveLength(10);
    expect(Object.keys(daten.plaene)).toHaveLength(10);
    expect(daten.kapitel.regatta).toEqual({ id: 'regatta', titel: 'Regatta', text: '' });
    expect(daten.plaene.regatta?.status).toBe('geplant');
    expect(daten.plaene.weissraum?.status).toBe('entwurf');
    expect(daten.plaene['flut']).toMatchObject({
      akt: 3,
      szene: 'Paul trifft Lotte am Lindenhof',
      straenge: ['begegnungen'],
      figuren: ['paul', 'lotte'],
      orte: ['lindenhof'],
    });
    expect(daten.plaene.ebbe?.abweichungen).toHaveLength(1);
    expect(daten.akte.map((a) => a.nummer)).toEqual([1, 2, 3]);
    expect(daten.straenge.map((s) => s.id)).toEqual(['nordhaven', 'konsortium', 'begegnungen', 'postkarten', 'schlaflos']);
    expect(daten.ideen).toHaveLength(3);
    expect(Object.keys(daten.figuren).sort()).toEqual(
      ['alter-mann-am-kai', 'die-fremde', 'herr-kessler', 'konrad', 'lotte', 'malte', 'ole', 'paul', 'vera'],
    );
    expect(daten.figuren['die-fremde']?.existenz).toBe('bewusst_vage');
    expect(daten.figuren['herr-kessler']?.gruppe).toBe('nordhaven');
    expect(Object.keys(daten.gruppen).sort()).toEqual(['konsortium', 'nordhaven']);
    expect(daten.orte.zeichensaal?.in).toBe('buero');
    expect(daten.orte.lindenhof?.aliase).toEqual([]);
    expect(daten.anmerkungen.map((a) => a.anker.exakt)).toEqual(['Bleistifte', 'nach einem freien Tisch suche']);
    expect(daten.entscheidungen.version).toBe(1);
    expect(Object.keys(daten.analysen)).toHaveLength(9);
    expect(daten.kiHinweise).toHaveLength(4);
  });

  it('jede Datei ist kanonisch (serialize(parse(datei)) === datei)', async () => {
    const leser = new NodeLeser(DEMO);
    const dateien = await leser.auflisten('');
    expect(dateien.length).toBeGreaterThan(40);
    for (const pfad of dateien) {
      const text = (await leser.lesen(pfad))!;
      const id = pfad.split('/').pop()!.replace(/\.(md|json)$/, '');
      let neu: string;
      if (pfad === 'projekt.md') neu = serializeProjekt(parseProjekt(text), text);
      else if (pfad.startsWith('manuskript/')) neu = serializeKapitel(parseKapitel(text, id), text);
      else if (pfad.startsWith('plan/kapitel/')) neu = serializeKapitelPlan(parseKapitelPlan(text, id), text);
      else if (pfad === 'plan/akte.md') neu = serializeAkte(parseAkte(text), text);
      else if (pfad === 'plan/straenge.md') neu = serializeStraenge(parseStraenge(text), text);
      else if (pfad === 'plan/ideen.md') neu = serializeIdeen(parseIdeen(text), text);
      else if (pfad === 'plan/motive.md') neu = serializeMotive(parseMotive(text), text);
      else if (pfad.startsWith('figuren/')) neu = serializeFigur(parseFigur(text, id), text);
      else if (pfad.startsWith('gruppen/')) neu = serializeGruppe(parseGruppe(text, id), text);
      else if (pfad.startsWith('orte/')) neu = serializeOrt(parseOrt(text, id), text);
      else if (pfad === 'anmerkungen.json') neu = serializeAnmerkungen(parseAnmerkungen(text));
      else if (pfad === 'entscheidungen.json') neu = serializeEntscheidungen(parseEntscheidungen(text));
      else if (pfad.startsWith('.plotwerk/analysen/')) neu = serializeAnalyse(parseAnalyse(text, id));
      else if (pfad === '.plotwerk/hinweise.json') neu = serializeHinweise(parseHinweise(text));
      // Werkzeuge G1–G8
      else if (pfad === PFADE.zeitleiste) neu = w.serializeZeitleiste(w.parseZeitleiste(text), text);
      else if (pfad === PFADE.faeden) neu = w.serializeFadenplanung(w.parseFadenplanung(text), text);
      else if (pfad === PFADE.boegen) neu = w.serializeBoegen(w.parseBoegen(text), text);
      else if (pfad === PFADE.marken) neu = w.serializeMarken(w.parseMarken(text), text);
      else if (pfad === PFADE.statistik) neu = w.serializeStatistik(w.parseStatistik(text));
      else if (pfad === PFADE.fassungen) neu = w.serializeFassungen(w.parseFassungen(text));
      else if (pfad === PFADE.lektorat) neu = w.serializeLektorat(w.parseLektorat(text));
      else if (pfad === PFADE.recherche) neu = w.serializeRecherche(w.parseRecherche(text));
      else if (pfad === PFADE.kiZeit) neu = w.serializeKiZeitVorschlaege(w.parseKiZeitVorschlaege(text));
      else if (pfad === PFADE.kiZustand) neu = w.serializeKiZustandVorschlaege(w.parseKiZustandVorschlaege(text));
      else if (pfad === PFADE.kiStimmen) neu = w.serializeKiStimmen(w.parseKiStimmen(text));
      else if (pfad === PFADE.kiLeser) neu = w.serializeKiLeser(w.parseKiLeser(text));
      else if (pfad === PFADE.kiFragen) neu = w.serializeKiFragen(w.parseKiFragen(text));
      else if (pfad.startsWith(`${PFADE.rechercheDateien}/`)) continue;
      else throw new Error(`unbekannte Datei ${pfad}`);
      expect(neu, pfad).toBe(text);
    }
  });
});

describe('Roundtrip parse(serialize(x))', () => {
  it('Figur mit leeren und optionalen Feldern', () => {
    const figuren: Figur[] = [
      {
        id: 'x', name: 'X', aliase: ['Ix', 'Iks'], formen: ['Xens'], rolle: 'haupt', kurz: 'Test', existenz: 'offen', gruppe: 'g',
        beziehungen: [{ zu: 'y', art: 'Freund: alt', abKapitel: 'k1', kategorie: 'sonstige', strang: 's', notiz: 'n', unsicher: true }],
        plan: { 'Was will er?': 'Ruhe', Alter: '12', leer: '' }, wahrheit: 'W\n\nzwei Absätze', notizen: 'N', netz: { x: 1.5, y: -2 },
      },
      { id: 'leer', name: 'Leer', aliase: [], rolle: 'neben', existenz: 'gesichert', gruppe: null, beziehungen: [], plan: {}, wahrheit: '', notizen: '' },
      { id: 'nur-notiz', name: 'yes', aliase: ['null', '123'], rolle: 'neben', existenz: 'bewusst_vage', gruppe: null, beziehungen: [], plan: {}, wahrheit: '', notizen: 'nur Notiz' },
    ];
    for (const f of figuren) expect(parseFigur(serializeFigur(f))).toEqual(f);
  });

  it('KapitelPlan, Gruppe, Ort, Kapitel, Projekt', () => {
    const plan: KapitelPlan = {
      id: 'p', titel: 'Plan: mit Doppelpunkt', akt: null, status: 'entwurf', szene: '', straenge: [], figuren: ['a'], orte: [],
      notiz: 'Was soll hier passieren?\n\n- Punkt',
      abweichungen: [{ id: 'a1', notiz: 'n', entscheidung: 'spaeter', datum: '2026-01-02' }],
      realitaet: [{ id: 'r', text: 't', stufe: 'gesichert', anker: { kapitel: 'p', exakt: 'e', davor: ' d', danach: 'n ' } }],
    };
    expect(parseKapitelPlan(serializeKapitelPlan(plan))).toEqual(plan);
    const gruppe: Gruppe = {
      id: 'g', name: 'G', typ: 'firma', status: 'im_text', mitglieder: ['a'], spuren: [{ id: 's', text: 'T', kapitel: 'k', status: 'verworfen' }],
      praesenz: { 1: 'eingeführt', 10: 'Druck' }, notizen: '',
    };
    expect(parseGruppe(serializeGruppe(gruppe))).toEqual(gruppe);
    const orte: Ort[] = [
      { id: 'o', name: 'O', aliase: [], in: 'p', beschreibung: 'B\n\n## Licht\n\nhell', notizen: 'N' },
      { id: 'o2', name: 'O2', aliase: ['Oh'], beschreibung: '', notizen: '' },
    ];
    for (const o of orte) expect(parseOrt(serializeOrt(o))).toEqual(o);
    const kapitel = { id: 'k', titel: 'K', text: '**Fett** und *kursiv*\n\n* * *\n\nEnde ohne Punkt' };
    expect(parseKapitel(serializeKapitel(kapitel))).toEqual(kapitel);
    expect(parseKapitel(serializeKapitel({ id: 'leer', titel: 'Leer', text: '' }))).toEqual({ id: 'leer', titel: 'Leer', text: '' });
    const projekt = { version: 1 as const, titel: 'T', kapitel: ['a', 'b'], notiz: '' };
    expect(parseProjekt(serializeProjekt(projekt))).toEqual(projekt);
  });

  it('JSON-Dateien', () => {
    const e = parseEntscheidungen('{}');
    expect(e).toEqual({ version: 1, schreibweisen: [], hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] });
    e.schreibweisen.push({ varianten: ['A', 'B'], gueltig: 'A', ziel: { typ: 'ort', id: 'a' } });
    e.zusammenfassungen.push({ kapitel: 'k', text: 't', basisHash: 'h' });
    expect(parseEntscheidungen(serializeEntscheidungen(e))).toEqual(e);
  });
});

describe('unbekannte Felder bleiben erhalten', () => {
  it('Frontmatter oben und in Listeneinträgen', () => {
    const alt = [
      '---',
      'id: ebbe',
      'titel: Ebbe',
      'tags: [roman, entwurf]',
      'akt: 2',
      'status: geschrieben',
      'szene: S',
      'straenge: []',
      'figuren: []',
      'orte: []',
      'abweichungen:',
      '  - id: a1',
      '    notiz: N',
      '    entscheidung: spaeter',
      '    datum: 2026-01-01',
      '    farbe: rot',
      'realitaet: []',
      'obsidian:',
      '  cssclass: breit',
      '---',
      '',
      'Notiz',
      '',
    ].join('\n');
    const plan = parseKapitelPlan(alt);
    const neu = serializeKapitelPlan({ ...plan, szene: 'Neu', abweichungen: [...plan.abweichungen, { id: 'a2', notiz: 'x', entscheidung: 'alternative', datum: 'd' }] }, alt);
    expect(neu).toContain('tags:\n  - roman\n  - entwurf');
    expect(neu).toContain('obsidian:\n  cssclass: breit');
    expect(neu).toContain('farbe: rot');
    expect(neu).toContain('szene: Neu');
    expect(parseKapitelPlan(neu).abweichungen.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('Body von akte.md und fremde Abschnitte in Figuren', () => {
    const akte = '---\nakte:\n  - nummer: 1\n    titel: Akt I\n    farbe: blau\n---\n\nFreie Notizen zu den Akten.\n';
    const neu = serializeAkte([{ ...parseAkte(akte)[0]!, titel: 'Erster Akt' }], akte);
    expect(neu).toContain('farbe: blau');
    expect(neu).toContain('titel: Erster Akt');
    expect(neu.endsWith('\nFreie Notizen zu den Akten.\n')).toBe(true);

    const figur = '---\nname: Paul\nicon: 🦩\n---\nVorspann\n\n## Aussehen\n\nGroß\n\n## Notizen\n\nN\n\n## Wahrheit hinter den Kulissen\n\nW\n';
    const f = parseFigur(figur, 'paul');
    expect(f.wahrheit).toBe('W');
    expect(f.notizen).toBe('N\n\nVorspann\n\n## Aussehen\n\nGroß');
    const gespeichert = serializeFigur(f, figur);
    expect(gespeichert).toContain('icon: 🦩');
    expect(parseFigur(gespeichert, 'paul')).toEqual(f);
    expect(serializeFigur(parseFigur(gespeichert, 'paul'), gespeichert)).toBe(gespeichert);
  });

  it('kaputtes YAML verliert keinen Text', () => {
    const text = '---\nname: [kaputt\n---\nInhalt\n';
    const f = parseFigur(text, 'x');
    expect(f.id).toBe('x');
    expect(f.notizen).toContain('name: [kaputt');
    expect(f.notizen).toContain('Inhalt');
  });
});

describe('Speichern über ProjektDateisystem', () => {
  it('schreibt nur bei Änderung und bewahrt Fremdfelder', async () => {
    const fs = new MemoryFs({ 'manuskript/a.md': '---\nid: a\ntitel: A\nlektorat: offen\n---\n\nText\n' });
    expect(await speichereKapitel(fs, { id: 'a', titel: 'A', text: 'Text' })).toBe(false);
    expect(await speichereKapitel(fs, { id: 'a', titel: 'A', text: 'Neuer Text' })).toBe(true);
    expect(await fs.lesen('manuskript/a.md')).toBe('---\nid: a\ntitel: A\nlektorat: offen\n---\n\nNeuer Text\n');
    expect(await speichereFigur(fs, parseFigur('', 'neu'))).toBe(true);
    expect(await fs.existiert('figuren/neu.md')).toBe(true);
    expect(await speicherePlan(fs, parseKapitelPlan('', 'a'))).toBe(true);
    expect(await fs.auflisten('plan')).toEqual(['plan/kapitel/a.md']);
  });

  it('kaputtes JSON wird vor dem Überschreiben gesichert', async () => {
    const fs = new MemoryFs({ 'anmerkungen.json': '[{kaputt' });
    await speichereAnmerkungen(fs, []);
    expect(await fs.lesen('anmerkungen.json')).toBe('[]\n');
    const versionen = await fs.auflisten('.versionen/anmerkungen.json');
    expect(versionen).toHaveLength(1);
    expect(await fs.lesen(versionen[0]!)).toBe('[{kaputt');
  });

  it('Schnappschuss und Entfernen', async () => {
    const fs = new MemoryFs({ 'figuren/ole.md': 'T' });
    const zeit = new Date(2026, 9, 9, 8, 5, 3);
    expect(await schnappschuss(fs, 'figuren/ole.md', zeit)).toBe('.versionen/figuren/ole.md/2026-10-09T08-05-03.md');
    expect(await schnappschuss(fs, 'fehlt.md', zeit)).toBeNull();
    const pfad = await entferneMitSchnappschuss(fs, 'figuren/ole.md', new Date(2026, 9, 9, 9, 0, 0));
    expect(pfad).toBe('.versionen/figuren/ole.md/2026-10-09T09-00-00.md');
    expect(await fs.existiert('figuren/ole.md')).toBe(false);
    expect(await fs.lesen(pfad!)).toBe('T');
  });
});

describe('MemoryFs', () => {
  it('Pfade relativ zum Projekt, sortiert, rekursiv', async () => {
    const fs = new MemoryFs({ 'b/z.md': '', 'b/a/y.md': '', 'c.md': '' });
    expect(await fs.auflisten('b')).toEqual(['b/a/y.md', 'b/z.md']);
    expect(await fs.auflisten('')).toEqual(['b/a/y.md', 'b/z.md', 'c.md']);
    expect(await fs.auflisten('fehlt')).toEqual([]);
    expect(await fs.existiert('b/a')).toBe(true);
    expect(await fs.lesen('./b//z.md')).toBe('');
  });

  it('lehnt absolute Pfade und .. ab', () => {
    expect(() => pruefePfad('/etc/passwd')).toThrow();
    expect(() => pruefePfad('a/../../b')).toThrow();
    expect(pruefePfad('a/./b')).toBe('a/b');
  });

  it('meldet Änderungen', async () => {
    const fs = new MemoryFs();
    const meldungen: [string, string | null][] = [];
    const ab = fs.beobachten((p, i) => meldungen.push([p, i]));
    await fs.schreiben('a.md', 'x');
    await fs.entfernen('a.md');
    ab();
    await fs.schreiben('b.md', 'y');
    expect(meldungen).toEqual([['a.md', 'x'], ['a.md', null]]);
  });
});

describe('ladeProjekt mit fehlenden Dateien', () => {
  it('leerer Ordner ergibt Leerwerte', async () => {
    const daten = await ladeProjekt(new MemoryFs());
    expect(daten.projekt).toEqual({ version: 1, titel: '', kapitel: [], notiz: '' });
    expect(daten.entscheidungen.hinweise).toEqual([]);
    expect(daten.kiHinweise).toEqual([]);
  });

  it('Manuskript ohne Eintrag in projekt.md wird angehängt und bekommt einen Standardplan', async () => {
    const daten = await ladeProjekt(
      new MemoryFs({
        'projekt.md': '---\ntitel: T\nkapitel: [b]\n---\n',
        'manuskript/a.md': 'Nur Text ohne Frontmatter',
        'plan/kapitel/b.md': '---\ntitel: Bee\nstatus: geplant\n---\n',
      }),
    );
    expect(daten.projekt.kapitel).toEqual(['b', 'a']);
    expect(daten.kapitel.a).toEqual({ id: 'a', titel: 'a', text: 'Nur Text ohne Frontmatter' });
    expect(daten.kapitel.b).toEqual({ id: 'b', titel: 'Bee', text: '' });
    expect(daten.plaene.a?.status).toBe('entwurf');
  });
});
