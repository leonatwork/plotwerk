import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { ladeProjekt, ladeProjektMitBericht, MemoryFs, uebernehmeExterneAenderungen } from './index';

describe('Manuskript-Konflikte (Issue #11)', () => {
  it('meldet alle Pfade einer doppelten ID und lädt keine Fassung', async () => {
    const fs = demoFs();
    const original = (await fs.lesen('manuskript/grundriss.md'))!;
    await fs.schreiben('manuskript/grundriss 2.md', original);
    await fs.schreiben('manuskript/grundriss-PC.md', original);
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.daten.kapitel.grundriss).toBeUndefined();
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'doppelte_id', kapitelIds: ['grundriss'],
      pfade: ['manuskript/grundriss 2.md', 'manuskript/grundriss-PC.md', 'manuskript/grundriss.md'],
    }));
    expect(bericht.daten.manuskriptKonflikte).toEqual(bericht.konflikte);
  });

  it('meldet Dateiname ungleich Frontmatter-ID und übernimmt den Text nicht', async () => {
    const bericht = await ladeProjektMitBericht(new MemoryFs({
      'projekt.md': '---\nkapitel: [y]\n---',
      'manuskript/x.md': '---\nid: y\n---\nFalscher Pfad',
    }));
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'name_id_abweichung', kapitelIds: ['y', 'x'], pfade: ['manuskript/x.md'],
    }));
    expect(bericht.daten.kapitel.y).toBeUndefined();
    expect(bericht.daten.projekt.kapitel).toEqual(['y']);
  });

  it.each(['de', 'en'] as const)('meldet Platzhalter als nicht geladen (%s), ohne ihn zu lesen', async (sprache) => {
    const fs = demoFs();
    await fs.entfernen('manuskript/grundriss.md');
    await fs.schreiben('manuskript/.grundriss.md.icloud', 'Kein Kapiteltext');
    const lesen = fs.lesen.bind(fs);
    fs.lesen = async (pfad) => {
      if (pfad.endsWith('.icloud')) throw new Error('Platzhalter darf nicht gelesen werden');
      return lesen(pfad);
    };
    const bericht = await ladeProjektMitBericht(fs, sprache);
    expect(bericht.daten.kapitel.grundriss).toBeUndefined();
    expect(bericht.daten.plaene.grundriss).toBeDefined();
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'icloud_platzhalter', kapitelIds: ['grundriss'],
      pfade: ['manuskript/.grundriss.md.icloud'],
      grund: expect.stringContaining(sprache === 'de' ? 'nicht geladen' : 'not loaded'),
    }));
  });

  it('meldet eine fehlende Datei; ausdrücklich geplante Kapitel bleiben wie bisher leer', async () => {
    const fs = demoFs();
    await fs.entfernen('manuskript/grundriss.md');
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'datei_fehlt', kapitelIds: ['grundriss'], pfade: ['manuskript/grundriss.md'],
    }));
    expect(bericht.daten.kapitel.grundriss).toBeUndefined();
  });

  it.each(['grundriss 2', 'grundriss 10', 'grundriss-LAPTOP', 'grundriss-leonsmac', 'grundriss (conflicted copy)'])('hängt Kopie ohne ID nicht an: %s', async (name) => {
    const fs = demoFs();
    await fs.schreiben(`manuskript/${name}.md`, 'Kopie ohne Frontmatter');
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.daten.projekt.kapitel).not.toContain(name);
    expect(bericht.daten.kapitel[name]).toBeUndefined();
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'konfliktname', kapitelIds: ['grundriss'], pfade: [`manuskript/${name}.md`],
    }));
  });

  it.each(['grundriss-2', 'grundriss-3', 'grundriss-lotte'])('lädt registriertes Kapitel mit eigener passender ID: %s', async (id) => {
    const fs = demoFs();
    const projekt = (await fs.lesen('projekt.md'))!;
    await fs.schreiben('projekt.md', projekt.replace('kapitel:', `kapitel:\n  - ${id}`));
    await fs.schreiben(`manuskript/${id}.md`, `---\nid: ${id}\n---\nEigener Kapiteltext`);
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.konflikte).toEqual([]);
    expect(bericht.warnungen).toEqual([]);
    expect(bericht.daten.kapitel[id]?.text).toBe('Eigener Kapiteltext');
    expect(bericht.daten.projekt.kapitel).toContain(id);
  });

  it('übernimmt externe Änderungen an einem regulären Kapitel mit nummerierter ID', async () => {
    const fs = demoFs();
    const projekt = (await fs.lesen('projekt.md'))!;
    await fs.schreiben('projekt.md', projekt.replace('kapitel:', 'kapitel:\n  - grundriss-2'));
    const pfad = 'manuskript/grundriss-2.md';
    await fs.schreiben(pfad, '---\nid: grundriss-2\n---\nEigener Kapiteltext');
    const alt = await ladeProjekt(fs);
    await fs.schreiben(pfad, '---\nid: grundriss-2\n---\nExtern geändert');
    const d = uebernehmeExterneAenderungen(alt, await ladeProjekt(fs), [pfad]);
    expect(d.manuskriptKonflikte).toEqual([]);
    expect(d.kapitel['grundriss-2']?.text).toBe('Extern geändert');
    expect(d.projekt.kapitel).toEqual(alt.projekt.kapitel);
  });

  it('schützt planregistrierte Kapitel vor der OneDrive-Heuristik', async () => {
    const fs = demoFs();
    await fs.schreiben('plan/kapitel/grundriss-2.md', '---\nid: grundriss-2\n---');
    await fs.schreiben('manuskript/grundriss-2.md', '---\nid: grundriss-2\n---\nEigener Kapiteltext');
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.konflikte).toEqual([]);
    expect(bericht.daten.kapitel['grundriss-2']?.text).toBe('Eigener Kapiteltext');
    expect(bericht.daten.projekt.kapitel).toContain('grundriss-2');
  });

  it('meldet weiterhin doppelte IDs und Namensabweichungen bei registrierten Bindestrich-IDs', async () => {
    const fs = demoFs();
    const projekt = (await fs.lesen('projekt.md'))!;
    await fs.schreiben('projekt.md', projekt.replace('kapitel:', 'kapitel:\n  - grundriss-2'));
    const original = '---\nid: grundriss-2\n---\nEigener Kapiteltext';
    await fs.schreiben('manuskript/grundriss-2.md', original);
    await fs.schreiben('manuskript/grundriss-2-PC.md', original);
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.daten.kapitel['grundriss-2']).toBeUndefined();
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'doppelte_id', kapitelIds: ['grundriss-2'],
      pfade: ['manuskript/grundriss-2-PC.md', 'manuskript/grundriss-2.md'],
    }));
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'name_id_abweichung', pfade: ['manuskript/grundriss-2-PC.md'],
    }));
    expect(bericht.konflikte).toContainEqual(expect.objectContaining({
      art: 'konfliktname', kapitelIds: ['grundriss-2'], pfade: ['manuskript/grundriss-2-PC.md'],
    }));
  });

  it('aktualisiert Konflikte während der Sitzung und nach Entfernen der Kopie; lokale Texte bleiben erhalten', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    alt.kapitel.lotte!.text = 'Noch nicht geschrieben.';
    const kopie = 'manuskript/grundriss 2.md';
    await fs.schreiben(kopie, (await fs.lesen('manuskript/grundriss.md'))!);
    const d = uebernehmeExterneAenderungen(alt, await ladeProjekt(fs), [kopie]);
    expect(d.manuskriptKonflikte).toContainEqual(expect.objectContaining({ art: 'doppelte_id' }));
    expect(d.kapitel.grundriss).toBeUndefined();
    expect(d.kapitel.lotte!.text).toBe('Noch nicht geschrieben.');
    expect(d.projekt.kapitel).toEqual(alt.projekt.kapitel);
    await fs.entfernen(kopie);
    const bereinigt = uebernehmeExterneAenderungen(d, await ladeProjekt(fs), [kopie]);
    expect(bereinigt.manuskriptKonflikte).toEqual([]);
    expect(bereinigt.kapitel.grundriss).toEqual(alt.kapitel.grundriss);
    expect(bereinigt.kapitel.lotte!.text).toBe('Noch nicht geschrieben.');
  });

  it('übernimmt Platzhalterereignisse und Kopien ohne ID während der Sitzung', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    alt.kapitel.grundriss!.text = 'Noch nicht geschriebener Grundriss.';
    await fs.schreiben('manuskript/grundriss 2.md', 'Kopie');
    let d = uebernehmeExterneAenderungen(alt, await ladeProjekt(fs), ['manuskript/grundriss 2.md']);
    expect(d.manuskriptKonflikte).toContainEqual(expect.objectContaining({ art: 'konfliktname' }));
    expect(d.projekt.kapitel).toEqual(alt.projekt.kapitel);
    expect(d.kapitel.grundriss!.text).toBe('Noch nicht geschriebener Grundriss.');
    await fs.entfernen('manuskript/grundriss.md');
    await fs.schreiben('manuskript/.grundriss.md.icloud', '');
    d = uebernehmeExterneAenderungen(d, await ladeProjekt(fs), ['manuskript/.grundriss.md.icloud']);
    expect(d.kapitel.grundriss).toBeUndefined();
    expect(d.manuskriptKonflikte).toContainEqual(expect.objectContaining({ art: 'icloud_platzhalter' }));
  });

  it('lädt konfliktfreie Projekte unverändert; normale Slugs und andere Ordner sind keine Konfliktkopien', async () => {
    const fs = demoFs();
    await fs.schreiben('manuskript/neues-kapitel.md', 'Neuer Text ohne Frontmatter');
    await fs.schreiben('figuren/lotte 2.md', (await fs.lesen('figuren/lotte.md'))!);
    const bericht = await ladeProjektMitBericht(fs);
    expect(bericht.konflikte).toEqual([]);
    expect(bericht.warnungen).toEqual([]);
    expect(bericht.daten.kapitel['neues-kapitel']?.text).toBe('Neuer Text ohne Frontmatter');
    expect(bericht.daten.projekt.kapitel.at(-1)).toBe('neues-kapitel');
  });
});
