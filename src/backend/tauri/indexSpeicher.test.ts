import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { LEERER_INDEX, type Index } from '@core/index/index';
import type { Erwaehnung, Hinweis } from '@core/model/types';
import schema from './schema.sql?raw';
import { erstelleSqlIndexSpeicher, type SqlDatenbank } from './indexSpeicher';

/** tauri-plugin-sql im Test: echtes SQLite (node:sqlite) mit demselben Schema wie die App. */
function testDatenbank() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const aufrufe: string[] = [];
  const adapter: SqlDatenbank = {
    async execute(sql, werte = []) {
      aufrufe.push(sql);
      db.prepare(sql).run(...(werte as SQLInputValue[]));
      return { rowsAffected: 0 };
    },
    async select<T>(sql: string, werte: unknown[] = []) {
      return db.prepare(sql).all(...(werte as SQLInputValue[])) as T;
    },
  };
  return { db, adapter, aufrufe };
}

function erw(kapitel: string, ziel: string, start: number, extra: Partial<Erwaehnung> = {}): Erwaehnung {
  return {
    zielTyp: 'figur',
    ziel,
    kapitel,
    absatz: 0,
    start,
    ende: start + ziel.length,
    treffer: ziel,
    art: 'auftritt',
    quelle: 'exakt',
    bestaetigt: true,
    ...extra,
  };
}

const hinweis: Hinweis = {
  schluessel: 'pruefen:lotte/Flut',
  typ: 'pruefen',
  titel: 'Kaffee?',
  zitate: [{ kapitel: 'lotte', text: 'Flut' }],
  erklaerung: 'Erst Latte, dann Grundriss.',
  quelle: 'ki',
  offen: true,
  status: 'neu',
};

function beispielIndex(): Index {
  return {
    ...LEERER_INDEX,
    erwaehnungen: [erw('lotte', 'paul', 0), erw('lotte', 'lotte', 10), erw('nebel', 'paul', 4, { zielTyp: 'ort', bestaetigt: false })],
    erstesVorkommen: { paul: 'lotte', lotte: 'lotte' },
    faeden: [{ id: 'nebel', name: 'Nebel', eroeffnetIn: 'nebel', aufgegriffenIn: [], zuletztIn: 'nebel', status: 'offen' }],
    hinweise: [hinweis],
    wortzahlen: { lotte: 1200, nebel: 800 },
    textHashes: { lotte: 'h1', nebel: 'h2' },
  };
}

describe('SQLite-IndexSpeicher', () => {
  it('speichert und lädt den Index unverändert', async () => {
    const { adapter } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/Projekte/Hafenlichter');
    expect(await speicher.laden()).toBeNull();
    const index = beispielIndex();
    await speicher.speichern(index);
    const zweiter = erstelleSqlIndexSpeicher(async () => adapter, () => '/Projekte/Hafenlichter');
    expect(await zweiter.laden()).toEqual(index);
  });

  it('legt abfragbare Tabellen an', async () => {
    const { adapter, db } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/p');
    await speicher.speichern(beispielIndex());
    const paul = db
      .prepare("SELECT kapitel, start, bestaetigt FROM erwaehnungen WHERE projekt = ? AND ziel = 'paul' ORDER BY kapitel")
      .all('/p');
    expect(paul).toEqual([
      { kapitel: 'lotte', start: 0, bestaetigt: 1 },
      { kapitel: 'nebel', start: 4, bestaetigt: 0 },
    ]);
    const h = db.prepare('SELECT typ, titel, offen, status, zitate FROM hinweise WHERE projekt = ?').get('/p');
    expect(h).toEqual({ typ: 'pruefen', titel: 'Kaffee?', offen: 1, status: 'neu', zitate: JSON.stringify(hinweis.zitate) });
    const f = db.prepare('SELECT id, eroeffnet_in FROM faeden WHERE projekt = ?').get('/p');
    expect(f).toEqual({ id: 'nebel', eroeffnet_in: 'nebel' });
  });

  it('schreibt nur geänderte Kapitel neu', async () => {
    const { adapter, aufrufe } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/p');
    const index = beispielIndex();
    await speicher.speichern(index);
    aufrufe.length = 0;
    const neu: Index = {
      ...index,
      erwaehnungen: [...index.erwaehnungen.filter((e) => e.kapitel === 'lotte'), erw('nebel', 'ole', 7)],
      wortzahlen: { ...index.wortzahlen, nebel: 801 },
    };
    await speicher.speichern(neu);
    expect(aufrufe.some((s) => s.startsWith('DELETE FROM erwaehnungen') && !s.includes('kapitel'))).toBe(false);
    expect(aufrufe.filter((s) => s.startsWith('INSERT INTO erwaehnungen'))).toHaveLength(1);
    expect(aufrufe.some((s) => s.includes('INSERT INTO hinweise'))).toBe(false);
    const neuGeladen = await erstelleSqlIndexSpeicher(async () => adapter, () => '/p').laden();
    expect(neuGeladen).toEqual(neu);
  });

  it('entfernt Kapitel ohne Erwähnungen und unbekannte Felder bleiben erhalten', async () => {
    const { adapter } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/p');
    await speicher.speichern(beispielIndex());
    const neu = { ...beispielIndex(), erwaehnungen: [erw('lotte', 'paul', 0)], zusatz: { x: 1 } } as Index;
    await speicher.speichern(neu);
    expect(await erstelleSqlIndexSpeicher(async () => adapter, () => '/p').laden()).toEqual(neu);
  });

  it('trennt Projekte und leert nur das aktuelle', async () => {
    const { adapter } = testDatenbank();
    let projekt = '/a';
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => projekt);
    await speicher.speichern(beispielIndex());
    projekt = '/b';
    expect(await speicher.laden()).toBeNull();
    await speicher.speichern({ ...LEERER_INDEX, wortzahlen: { x: 1 } });
    await speicher.leeren();
    expect(await speicher.laden()).toBeNull();
    projekt = '/a';
    expect(await speicher.laden()).toEqual(beispielIndex());
  });

  it('fehlende Stand-Markierung (abgebrochenes Schreiben) ergibt null', async () => {
    const { adapter, db } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/p');
    await speicher.speichern(beispielIndex());
    db.prepare("DELETE FROM index_cache WHERE schluessel = '#stand'").run();
    expect(await erstelleSqlIndexSpeicher(async () => adapter, () => '/p').laden()).toBeNull();
  });

  it('fasst schnelle Speicheraufrufe zusammen, der neueste gewinnt', async () => {
    const { adapter, aufrufe } = testDatenbank();
    const speicher = erstelleSqlIndexSpeicher(async () => adapter, () => '/p');
    const versprechen = [1, 2, 3, 4, 5].map((n) => speicher.speichern({ ...LEERER_INDEX, wortzahlen: { a: n } }));
    await Promise.all(versprechen);
    await speicher.warten();
    // ein einziger Schreibvorgang: erstesVorkommen, wortzahlen, textHashes, Kapitelfolge, Stand
    expect(aufrufe.filter((s) => s.startsWith('INSERT OR REPLACE')).length).toBe(5);
    expect((await erstelleSqlIndexSpeicher(async () => adapter, () => '/p').laden())?.wortzahlen).toEqual({ a: 5 });
  });

  it('ohne Projekt passiert nichts', async () => {
    const speicher = erstelleSqlIndexSpeicher(async () => {
      throw new Error('keine Verbindung erwartet');
    }, () => null);
    expect(await speicher.laden()).toBeNull();
    await speicher.speichern(beispielIndex());
    await speicher.leeren();
  });

  it('Verbindungsfehler wird gemeldet und später erneut versucht', async () => {
    const { adapter } = testDatenbank();
    let versuche = 0;
    const speicher = erstelleSqlIndexSpeicher(async () => {
      versuche += 1;
      if (versuche === 1) throw new Error('gesperrt');
      return adapter;
    }, () => '/p');
    await expect(speicher.speichern(beispielIndex())).rejects.toThrow('gesperrt');
    await speicher.speichern(beispielIndex());
    expect(await speicher.laden()).toEqual(beispielIndex());
  });
});
