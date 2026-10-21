import { describe, expect, it } from 'vitest';
import { demoDateien, demoFs } from '../../fixtures/demoProjekt';
import { ladeProjekt, MemoryFs } from './index';
import { archiviereKapitel, stelleKapitelWiederHer } from './archiv';
import { uebernehmeExterneAenderungen } from './extern';

describe('Kapitelarchiv (Issue #13)', () => {
  it('archiviert Flut mit echten Demo-Ankern und kapitelübergreifenden Hinweisen; externe Archivänderungen bleiben auflösbar', async () => {
    const fs = demoFs();
    const original = await ladeProjekt(fs);
    const hinweise = original.kiHinweise.filter(h => h.zitate.some(z => z.kapitel === 'flut'));
    expect(hinweise.length).toBeGreaterThan(0);
    expect(original.anmerkungen.some(a => a.anker.kapitel === 'flut')).toBe(true);
    const d = await archiviereKapitel(fs, 'flut');
    expect(d.kiHinweise.filter(h => hinweise.some(alt => alt.schluessel === h.schluessel))).toEqual(hinweise.map(h => ({ ...h, veraltet: true })));
    expect(d.anmerkungen).toEqual(original.anmerkungen);
    await fs.schreiben('archiv/plan/kapitel/flut.md', (await fs.lesen('archiv/plan/kapitel/flut.md'))! + '\n');
    const geladen = await ladeProjekt(fs);
    expect(uebernehmeExterneAenderungen(d, geladen, ['archiv/plan/kapitel/flut.md']).archiv).toBe(geladen.archiv);
    const neu = await stelleKapitelWiederHer(fs, 'flut');
    expect(neu.anmerkungen).toEqual(original.anmerkungen);
    expect(neu.kapitel.flut).toEqual(original.kapitel.flut);
  });

  it('Sicherungsfehler beim Wiederherstellen lässt das vollständige Archiv unverändert', async () => {
    const fs = demoFs();
    await archiviereKapitel(fs, 'flut');
    class FehlerFs extends MemoryFs {
      override async schreiben(p: string, t: string) {
        if (p.startsWith('.versionen/')) throw new Error('disk full');
        return super.schreiben(p, t);
      }
    }
    const fehlerFs = new FehlerFs(fs.alleDateien());
    await expect(stelleKapitelWiederHer(fehlerFs, 'flut')).rejects.toThrow('Schnappschuss');
    expect(fehlerFs.alleDateien()).toEqual(fs.alleDateien());
  });

  it('überschreibt beim Wiederherstellen keinen aktiven Stand derselben ID', async () => {
    const fs = demoFs();
    await archiviereKapitel(fs, 'flut');
    await fs.schreiben('manuskript/flut.md', demoDateien()['manuskript/flut.md']!);
    const vorher = fs.alleDateien();
    await expect(stelleKapitelWiederHer(fs, 'flut')).rejects.toThrow();
    expect(fs.alleDateien()).toEqual(vorher);
  });
  it('erhält rohe Dateien, Notizen und IDs; neue Sicherung vor jeder Aktion, auch in derselben Sekunde', async () => {
    const fs = demoFs();
    const vorher = fs.alleDateien();
    const original = await ladeProjekt(fs);
    const zeit = new Date('2026-10-20T12:00:00Z');
    const d = await archiviereKapitel(fs, 'ebbe', zeit);
    expect(d.projekt.kapitel).not.toContain('ebbe');
    expect(d.kapitel.ebbe).toBeUndefined();
    expect(d.archiv?.ebbe.kapitel).toEqual(original.kapitel.ebbe);
    expect(await fs.lesen('archiv/manuskript/ebbe.md')).toBe(vorher['manuskript/ebbe.md']);
    expect(await fs.lesen('archiv/plan/kapitel/ebbe.md')).toBe(vorher['plan/kapitel/ebbe.md']);
    expect(await fs.lesen('manuskript/ebbe.md')).toBeNull();
    expect(await fs.lesen('plan/kapitel/ebbe.md')).toBeNull();
    expect(d.anmerkungen).toEqual(original.anmerkungen);
    expect(d.analysen.ebbe).toMatchObject({ ...original.analysen.ebbe, veraltet: true });
    const versionen = await fs.auflisten('.versionen');
    const neu = await stelleKapitelWiederHer(fs, 'ebbe', zeit);
    expect(neu.projekt.kapitel).toEqual(original.projekt.kapitel);
    expect(neu.kapitel.ebbe).toEqual(original.kapitel.ebbe);
    expect(neu.plaene.ebbe).toEqual(original.plaene.ebbe);
    expect(await fs.lesen('manuskript/ebbe.md')).toBe(vorher['manuskript/ebbe.md']);
    expect(await fs.lesen('plan/kapitel/ebbe.md')).toBe(vorher['plan/kapitel/ebbe.md']);
    expect((await fs.auflisten('.versionen')).length).toBe(versionen.length + 2);
    expect(neu.analysen.ebbe?.veraltet).toBe(true);
  });

  it('stellt mehrere archivierte Nachbarn unabhängig von der Wiederherstellungsreihenfolge richtig zurück', async () => {
    const fs = demoFs();
    const vorher = (await ladeProjekt(fs)).projekt.kapitel;
    await archiviereKapitel(fs, vorher[0]!);
    await archiviereKapitel(fs, vorher[1]!);
    await stelleKapitelWiederHer(fs, vorher[0]!);
    expect((await stelleKapitelWiederHer(fs, vorher[1]!)).projekt.kapitel).toEqual(vorher);
    await expect(stelleKapitelWiederHer(fs, vorher[1]!)).rejects.toThrow();
  });

  it.each(['de', 'en'] as const)('Sicherungsfehler (%s) hinterlässt auch bei der zweiten Sicherung keinerlei Änderung', async sprache => {
    class FehlerFs extends MemoryFs {
      n = 0;
      override async schreiben(p: string, t: string) {
        if (p.startsWith('.versionen/') && ++this.n === 2) throw new Error('disk full');
        return super.schreiben(p, t);
      }
    }
    const fs = new FehlerFs(demoDateien());
    const vorher = fs.alleDateien();
    await expect(archiviereKapitel(fs, 'ebbe', undefined, sprache)).rejects.toThrow(sprache === 'de' ? 'Schnappschuss' : 'snapshot');
    expect(fs.alleDateien()).toEqual(vorher);
  });

  it('rollt einen Fehler beim Verschieben zurück und überschreibt keine vorhandene Archivdatei', async () => {
    class FehlerFs extends MemoryFs {
      override async entfernen(p: string) {
        if (p === 'plan/kapitel/ebbe.md') throw new Error('disk full');
        return super.entfernen(p);
      }
    }
    const fs = new FehlerFs(demoDateien());
    const vorher = fs.alleDateien();
    await expect(archiviereKapitel(fs, 'ebbe')).rejects.toThrow();
    expect(fs.alleDateien()).toEqual(vorher);
    const normal = demoFs();
    await normal.schreiben('archiv/manuskript/ebbe.md', 'fremde Datei');
    const stand = normal.alleDateien();
    await expect(archiviereKapitel(normal, 'ebbe')).rejects.toThrow();
    expect(normal.alleDateien()).toEqual(stand);
  });
});
