import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { ladeProjekt, uebernehmeExterneAenderungen } from './index';

describe('uebernehmeExterneAenderungen', () => {
  it('übernimmt nur die geänderten Dateien, der Rest bleibt der Stand im Speicher', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    const imSpeicher = { ...alt, kapitel: { ...alt.kapitel, lotte: { ...alt.kapitel.lotte!, text: 'Noch nicht geschrieben.' } } };
    await fs.schreiben('manuskript/ebbe.md', '---\nid: ebbe\ntitel: Ebbe\n---\n\nVon außen.\n');
    await fs.schreiben('manuskript/lotte.md', '---\nid: lotte\ntitel: Lotte\n---\n\nAlte Platte.\n');
    const neu = await ladeProjekt(fs);
    const d = uebernehmeExterneAenderungen(imSpeicher, neu, ['manuskript/ebbe.md']);
    expect(d.kapitel.ebbe!.text).toBe('Von außen.');
    expect(d.kapitel.lotte!.text).toBe('Noch nicht geschrieben.');
    expect(d.figuren).toBe(imSpeicher.figuren);
  });

  it('neue Kapiteldatei wird angehängt und bekommt einen Plan; gelöschte Figur verschwindet', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    await fs.schreiben('manuskript/epilog.md', '---\nid: epilog\ntitel: Epilog\n---\n\nEnde.\n');
    await fs.entfernen('figuren/vera.md');
    const neu = await ladeProjekt(fs);
    const d = uebernehmeExterneAenderungen(alt, neu, ['manuskript/epilog.md', 'figuren/vera.md']);
    expect(d.projekt.kapitel.at(-1)).toBe('epilog');
    expect(d.plaene.epilog?.status).toBe('entwurf');
    expect(d.figuren.vera).toBeUndefined();
    expect(d.figuren.lotte).toBeDefined();
  });

  it('projekt.md und JSON-Dateien', async () => {
    const fs = demoFs();
    const alt = await ladeProjekt(fs);
    await fs.schreiben('entscheidungen.json', JSON.stringify({ hinweise: [], schreibweisen: [], faeden: [{ id: 'fiete', status: 'erledigt' }], zuordnungen: [] }));
    const neu = await ladeProjekt(fs);
    const d = uebernehmeExterneAenderungen(alt, neu, ['entscheidungen.json']);
    expect(d.entscheidungen.faeden).toEqual([{ id: 'fiete', status: 'erledigt' }]);
    expect(d.projekt).toBe(alt.projekt);
  });
});
