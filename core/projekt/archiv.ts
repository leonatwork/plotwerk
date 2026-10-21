/** Kapitelumbau ohne DOM/Tauri. Rohe Dateien bewegen, niemals Manuskript neu serialisieren. */
import type { ProjektDateisystem } from './fs';
import type { Id, ProjektDaten } from '../model/types';
import { analysePfad, kapitelPfad, ladeProjekt, parseArchivIndex, parseFrontmatter, parseProjekt, PFADE, planPfad } from './lesen';
import { serializeProjekt } from './schreiben';
import { versionsPfadMitZusatz } from '../versionen';

export const ARCHIV_FEHLER = {
  de: { sicherung: 'Schnappschuss fehlgeschlagen. Die Kapitelaktion wurde abgebrochen.', ungueltig: 'Kapitelaktion nicht möglich: Dateien fehlen, sind widersprüchlich oder das Ziel ist bereits belegt.' },
  en: { sicherung: 'The snapshot failed. The chapter action was cancelled.', ungueltig: 'Chapter action unavailable: files are missing, inconsistent or the destination already exists.' },
};

/** Neue aktive Reihenfolge respektieren; archivierte Nachbarn bleiben an ihren alten Ankern. */
function volleReihenfolge(aktiv: Id[], alt: Id[], archiviert: Id[]): Id[] {
  const neu = [...aktiv];
  for (const id of alt.filter(id => archiviert.includes(id))) {
    const danach = alt.slice(alt.indexOf(id) + 1).find(k => neu.includes(k));
    neu.splice(danach ? neu.indexOf(danach) : neu.length, 0, id);
  }
  return neu;
}

async function umbauen(fs: ProjektDateisystem, id: Id, wiederherstellen: boolean, zeit: Date, sprache: 'de' | 'en'): Promise<ProjektDaten> {
  const t = ARCHIV_FEHLER[sprache];
  const ungueltig = () => new Error(t.ungueltig);
  if (!id || /[/\\]|^\.{1,2}$/.test(id)) throw ungueltig();
  const projektText = await fs.lesen(PFADE.projekt);
  if (projektText === null || parseFrontmatter(projektText).fehler) throw ungueltig();
  const projekt = parseProjekt(projektText);
  const geladen = await ladeProjekt(fs);
  if (geladen.manuskriptKonflikte?.some(k => k.kapitelIds.includes(id))) throw ungueltig();
  const indexText = await fs.lesen(PFADE.archiv);
  let index;
  try { index = indexText === null ? { version: 1 as const, kapitel: [], reihenfolge: [] } : parseArchivIndex(indexText); }
  catch { throw ungueltig(); }
  if (wiederherstellen ? (!index.kapitel.includes(id) || projekt.kapitel.includes(id)) : (!projekt.kapitel.includes(id) || index.kapitel.includes(id))) throw ungueltig();
  const reihenfolge = volleReihenfolge(projekt.kapitel, index.reihenfolge, index.kapitel);
  const dateien: { quelle: string; ziel: string; inhalt: string }[] = [];
  for (const pfad of [kapitelPfad(id), planPfad(id)]) {
    const quelle = wiederherstellen ? `archiv/${pfad}` : pfad;
    const ziel = wiederherstellen ? pfad : `archiv/${pfad}`;
    if (await fs.existiert(ziel)) throw ungueltig();
    const inhalt = await fs.lesen(quelle);
    // Ohne Manuskriptdatei gibt es keinen Textstand zu archivieren; ein Plan darf fehlen.
    if (inhalt === null) {
      if (pfad === kapitelPfad(id)) throw ungueltig();
      continue;
    }
    const fm = parseFrontmatter(inhalt);
    if (fm.fehler || (fm.daten.id !== undefined && fm.daten.id !== id)) throw ungueltig();
    dateien.push({ quelle, ziel, inhalt });
  }

  // Änderungsjournal: auch bereits geschriebene Sicherungen bei einem Fehler entfernen.
  const journal = new Map<string, string | null>();
  async function aendere(pfad: string, inhalt: string | null) {
    if (!journal.has(pfad)) journal.set(pfad, await fs.lesen(pfad));
    if (inhalt === null) await fs.entfernen(pfad);
    else await fs.schreiben(pfad, inhalt);
  }
  let sichert = true;
  try {
    for (const d of dateien) {
      // Archiv-Sicherungen liegen im ursprünglichen Kapitel-Versionsverlauf.
      const pfad = d.quelle.replace(/^archiv\//, '');
      let n = 1;
      while (await fs.existiert(versionsPfadMitZusatz(pfad, zeit, n))) n++;
      await aendere(versionsPfadMitZusatz(pfad, zeit, n), d.inhalt);
    }
    sichert = false;
    for (const d of dateien) await aendere(d.ziel, d.inhalt);
    if (!wiederherstellen) {
      const analyse = await fs.lesen(analysePfad(id));
      if (analyse !== null) await aendere(analysePfad(id), JSON.stringify({ ...JSON.parse(analyse), veraltet: true }, null, 2) + '\n');
      const hinweise = await fs.lesen(PFADE.hinweise);
      if (hinweise !== null) {
        const roh: unknown = JSON.parse(hinweise);
        if (!Array.isArray(roh)) throw ungueltig();
        const neu = roh.map(h => h.zitate?.some((z: { kapitel: Id }) => z.kapitel === id) || h.plan?.kapitel === id ? { ...h, veraltet: true } : h);
        await aendere(PFADE.hinweise, JSON.stringify(neu, null, 2) + '\n');
      }
    }
    for (const d of dateien) await aendere(d.quelle, null);
    const archiviert = wiederherstellen ? index.kapitel.filter(k => k !== id) : [...index.kapitel, id];
    await aendere(PFADE.archiv, JSON.stringify({ version: 1, kapitel: archiviert, reihenfolge }, null, 2) + '\n');
    const kapitel = wiederherstellen ? reihenfolge.filter(k => !archiviert.includes(k)) : projekt.kapitel.filter(k => k !== id);
    await aendere(PFADE.projekt, serializeProjekt({ ...projekt, kapitel }, projektText));
    return await ladeProjekt(fs);
  } catch (fehler) {
    const rollbackFehler: unknown[] = [];
    for (const [pfad, alt] of [...journal].reverse()) {
      try {
        if (await fs.lesen(pfad) === alt) continue;
        if (alt === null) await fs.entfernen(pfad);
        else await fs.schreiben(pfad, alt);
      } catch (e) { rollbackFehler.push(e); }
    }
    if (rollbackFehler.length) throw new AggregateError([fehler, ...rollbackFehler], sprache === 'de' ? 'Rücksetzen fehlgeschlagen. Bitte Projektdateien und Schnappschüsse prüfen.' : 'Rollback failed. Please check project files and snapshots.');
    if (sichert) throw new Error(t.sicherung, { cause: fehler });
    throw fehler;
  }
}

export const archiviereKapitel = (fs: ProjektDateisystem, id: Id, zeit = new Date(), sprache: 'de' | 'en' = 'de') => umbauen(fs, id, false, zeit, sprache);
export const stelleKapitelWiederHer = (fs: ProjektDateisystem, id: Id, zeit = new Date(), sprache: 'de' | 'en' = 'de') => umbauen(fs, id, true, zeit, sprache);
