/**
 * IndexSpeicher auf SQLite (tauri-plugin-sql, Datei im App-Support-Ordner). Nur Cache (E2).
 *
 * Tabellen (schema.sql): index_cache (übrige Index-Felder als JSON), erwaehnungen, hinweise,
 * faeden – abfragbar, jede Zeile zusätzlich vollständig als JSON in `daten`.
 * Ohne Transaktionen (das Plugin nutzt einen Verbindungspool), daher konsistent über eine
 * Stand-Markierung: Sie wird vor dem Schreiben entfernt und danach gesetzt; fehlt sie,
 * liefert laden() null und der Index wird neu berechnet.
 * Geschrieben wird nur, was sich geändert hat (Erwähnungen je Kapitel).
 */
import { LEERER_INDEX, type Index, type IndexSpeicher } from '@core/index/index';
import type { Erwaehnung, Faden, Hinweis } from '@core/model/types';

export const DATENBANK = 'sqlite:plotwerk-index.db';
/** Erhöhen, wenn sich die Ablage ändert – alte Einträge gelten dann als fehlend. */
export const FORMAT = 1;

const STAND = '#stand';
const KAPITELFOLGE = '#kapitelfolge';
const TABELLEN = new Set(['erwaehnungen', 'hinweise', 'faeden']);
const MAX_PARAMETER = 8000;

export interface SqlDatenbank {
  execute(sql: string, werte?: unknown[]): Promise<unknown>;
  select<T>(sql: string, werte?: unknown[]): Promise<T>;
}

interface Abbild {
  erwaehnungen: Map<string, string>;
  hinweise: string;
  faeden: string;
  cache: Map<string, string>;
}

export interface SqlIndexSpeicher extends IndexSpeicher {
  /** Wartet, bis alle angestoßenen Speichervorgänge erledigt sind. */
  warten(): Promise<void>;
}

const bit = (b: boolean | undefined | null): number | null => (b == null ? null : b ? 1 : 0);

function erwaehnungsZeile(projekt: string, kapitel: string, nr: number, e: Erwaehnung): unknown[] {
  return [
    projekt,
    kapitel,
    nr,
    e.zielTyp ?? '',
    e.ziel ?? '',
    e.absatz ?? 0,
    e.start ?? 0,
    e.ende ?? 0,
    e.treffer ?? '',
    e.art ?? '',
    e.quelle ?? '',
    bit(e.bestaetigt) ?? 0,
    JSON.stringify(e),
  ];
}

function hinweisZeile(projekt: string, nr: number, h: Hinweis): unknown[] {
  return [
    projekt,
    nr,
    h.schluessel ?? '',
    h.typ ?? '',
    h.titel ?? '',
    JSON.stringify(h.zitate ?? []),
    h.erklaerung ?? '',
    h.quelle ?? '',
    bit(h.offen),
    h.status ?? '',
    JSON.stringify(h),
  ];
}

function fadenZeile(projekt: string, nr: number, f: Faden): unknown[] {
  return [
    projekt,
    nr,
    f.id ?? '',
    f.name ?? '',
    f.eroeffnetIn ?? '',
    JSON.stringify(f.aufgegriffenIn ?? []),
    f.zuletztIn ?? '',
    f.status ?? '',
    JSON.stringify(f),
  ];
}

const SPALTEN = {
  erwaehnungen: ['projekt', 'kapitel', 'nr', 'ziel_typ', 'ziel', 'absatz', 'start', 'ende', 'treffer', 'art', 'quelle', 'bestaetigt', 'daten'],
  hinweise: ['projekt', 'nr', 'schluessel', 'typ', 'titel', 'zitate', 'erklaerung', 'quelle', 'offen', 'status', 'daten'],
  faeden: ['projekt', 'nr', 'id', 'name', 'eroeffnet_in', 'aufgegriffen_in', 'zuletzt_in', 'status', 'daten'],
} as const;

async function einfuegen(db: SqlDatenbank, tabelle: keyof typeof SPALTEN, zeilen: unknown[][]): Promise<void> {
  const spalten = SPALTEN[tabelle];
  const proStatement = Math.max(1, Math.floor(MAX_PARAMETER / spalten.length));
  const platzhalter = `(${spalten.map(() => '?').join(', ')})`;
  for (let i = 0; i < zeilen.length; i += proStatement) {
    const teil = zeilen.slice(i, i + proStatement);
    await db.execute(
      `INSERT INTO ${tabelle} (${spalten.join(', ')}) VALUES ${teil.map(() => platzhalter).join(', ')}`,
      teil.flat(),
    );
  }
}

/** Erwähnungen nach Kapitel gruppiert, Reihenfolge des ersten Auftretens. */
function nachKapitel(erwaehnungen: Erwaehnung[]): Map<string, Erwaehnung[]> {
  const gruppen = new Map<string, Erwaehnung[]>();
  for (const e of erwaehnungen) {
    const liste = gruppen.get(e.kapitel);
    if (liste) liste.push(e);
    else gruppen.set(e.kapitel, [e]);
  }
  return gruppen;
}

export function erstelleSqlIndexSpeicher(
  verbinden: () => Promise<SqlDatenbank>,
  projekt: () => string | null,
): SqlIndexSpeicher {
  let verbindung: Promise<SqlDatenbank> | null = null;
  const abbilder = new Map<string, Abbild>();
  let naechster: { projekt: string; index: Index } | null = null;
  let lauf: Promise<void> | null = null;

  function db(): Promise<SqlDatenbank> {
    verbindung ??= verbinden().then(
      async (d) => {
        try {
          await d.execute('PRAGMA journal_mode=WAL');
        } catch {
          // nicht wichtig
        }
        return d;
      },
      (e) => {
        verbindung = null;
        throw e;
      },
    );
    return verbindung;
  }

  async function schreiben(p: string, index: Index): Promise<void> {
    const d = await db();
    const alt = abbilder.get(p);
    abbilder.delete(p);
    await d.execute('DELETE FROM index_cache WHERE projekt = ? AND schluessel = ?', [p, STAND]);
    if (!alt) {
      for (const t of ['index_cache', 'erwaehnungen', 'hinweise', 'faeden']) {
        await d.execute(`DELETE FROM ${t} WHERE projekt = ?`, [p]);
      }
    }
    const neu: Abbild = { erwaehnungen: new Map(), hinweise: '', faeden: '', cache: new Map() };

    const gruppen = nachKapitel(index.erwaehnungen ?? []);
    for (const [kapitel, liste] of gruppen) {
      const json = JSON.stringify(liste);
      neu.erwaehnungen.set(kapitel, json);
      if (alt?.erwaehnungen.get(kapitel) === json) continue;
      if (alt) await d.execute('DELETE FROM erwaehnungen WHERE projekt = ? AND kapitel = ?', [p, kapitel]);
      await einfuegen(d, 'erwaehnungen', liste.map((e, nr) => erwaehnungsZeile(p, kapitel, nr, e)));
    }
    if (alt) {
      for (const kapitel of alt.erwaehnungen.keys()) {
        if (!gruppen.has(kapitel)) {
          await d.execute('DELETE FROM erwaehnungen WHERE projekt = ? AND kapitel = ?', [p, kapitel]);
        }
      }
    }

    neu.hinweise = JSON.stringify(index.hinweise ?? []);
    if (alt?.hinweise !== neu.hinweise) {
      if (alt) await d.execute('DELETE FROM hinweise WHERE projekt = ?', [p]);
      await einfuegen(d, 'hinweise', (index.hinweise ?? []).map((h, nr) => hinweisZeile(p, nr, h)));
    }
    neu.faeden = JSON.stringify(index.faeden ?? []);
    if (alt?.faeden !== neu.faeden) {
      if (alt) await d.execute('DELETE FROM faeden WHERE projekt = ?', [p]);
      await einfuegen(d, 'faeden', (index.faeden ?? []).map((f, nr) => fadenZeile(p, nr, f)));
    }

    const eintraege: [string, string][] = Object.entries(index)
      .filter(([k, v]) => !TABELLEN.has(k) && v !== undefined)
      .map(([k, v]) => [k, JSON.stringify(v)]);
    eintraege.push([KAPITELFOLGE, JSON.stringify([...gruppen.keys()])]);
    for (const [k, json] of eintraege) {
      neu.cache.set(k, json);
      if (alt?.cache.get(k) === json) continue;
      await d.execute('INSERT OR REPLACE INTO index_cache (projekt, schluessel, wert) VALUES (?, ?, ?)', [p, k, json]);
    }
    if (alt) {
      for (const k of alt.cache.keys()) {
        if (!neu.cache.has(k)) await d.execute('DELETE FROM index_cache WHERE projekt = ? AND schluessel = ?', [p, k]);
      }
    }

    await d.execute('INSERT OR REPLACE INTO index_cache (projekt, schluessel, wert) VALUES (?, ?, ?)', [
      p,
      STAND,
      JSON.stringify({ format: FORMAT, zeit: new Date().toISOString() }),
    ]);
    abbilder.set(p, neu);
  }

  async function abarbeiten(): Promise<void> {
    // erst nach der Zuweisung an `lauf` beginnen
    await Promise.resolve();
    let fehler: unknown = null;
    try {
      while (naechster) {
        const auftrag = naechster;
        naechster = null;
        try {
          await schreiben(auftrag.projekt, auftrag.index);
          fehler = null;
        } catch (e) {
          fehler = e;
        }
      }
    } finally {
      // synchron nach der letzten Prüfung: ein neuer Auftrag startet einen neuen Lauf
      lauf = null;
    }
    if (fehler) throw fehler;
  }

  async function warten(): Promise<void> {
    while (lauf) await lauf.catch(() => undefined);
  }

  return {
    async laden() {
      const p = projekt();
      if (!p) return null;
      await warten();
      const d = await db();
      const cache = await d.select<{ schluessel: string; wert: string }[]>(
        'SELECT schluessel, wert FROM index_cache WHERE projekt = ?',
        [p],
      );
      const werte = new Map(cache.map((z) => [z.schluessel, z.wert]));
      const stand = werte.get(STAND);
      if (!stand) return null;
      try {
        if ((JSON.parse(stand) as { format?: number }).format !== FORMAT) return null;
        const index: Record<string, unknown> = { ...LEERER_INDEX };
        const abbild: Abbild = { erwaehnungen: new Map(), hinweise: '[]', faeden: '[]', cache: new Map() };
        for (const [k, v] of werte) {
          if (k === STAND) continue;
          abbild.cache.set(k, v);
          if (!k.startsWith('#')) index[k] = JSON.parse(v);
        }
        const folge = JSON.parse(werte.get(KAPITELFOLGE) ?? '[]') as string[];
        const zeilen = await d.select<{ kapitel: string; daten: string }[]>(
          'SELECT kapitel, daten FROM erwaehnungen WHERE projekt = ? ORDER BY kapitel, nr',
          [p],
        );
        const gruppen = new Map<string, Erwaehnung[]>(folge.map((k) => [k, []]));
        for (const z of zeilen) {
          const liste = gruppen.get(z.kapitel);
          const e = JSON.parse(z.daten) as Erwaehnung;
          if (liste) liste.push(e);
          else gruppen.set(z.kapitel, [e]);
        }
        const erwaehnungen: Erwaehnung[] = [];
        for (const [kapitel, liste] of gruppen) {
          if (liste.length === 0) continue;
          abbild.erwaehnungen.set(kapitel, JSON.stringify(liste));
          erwaehnungen.push(...liste);
        }
        index.erwaehnungen = erwaehnungen;
        const hinweise = (
          await d.select<{ daten: string }[]>('SELECT daten FROM hinweise WHERE projekt = ? ORDER BY nr', [p])
        ).map((z) => JSON.parse(z.daten) as Hinweis);
        const faeden = (
          await d.select<{ daten: string }[]>('SELECT daten FROM faeden WHERE projekt = ? ORDER BY nr', [p])
        ).map((z) => JSON.parse(z.daten) as Faden);
        index.hinweise = hinweise;
        index.faeden = faeden;
        abbild.hinweise = JSON.stringify(hinweise);
        abbild.faeden = JSON.stringify(faeden);
        abbilder.set(p, abbild);
        return index as unknown as Index;
      } catch (e) {
        console.warn('Gespeicherter Index unbrauchbar, wird neu berechnet:', e);
        abbilder.delete(p);
        return null;
      }
    },

    speichern(index) {
      const p = projekt();
      if (!p) return Promise.resolve();
      naechster = { projekt: p, index };
      lauf ??= abarbeiten();
      return lauf;
    },

    async leeren() {
      const p = projekt();
      if (!p) return;
      naechster = null;
      await warten();
      const d = await db();
      abbilder.delete(p);
      for (const t of ['index_cache', 'erwaehnungen', 'hinweise', 'faeden']) {
        await d.execute(`DELETE FROM ${t} WHERE projekt = ?`, [p]);
      }
    },

    warten,
  };
}
