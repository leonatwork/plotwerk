/** Nur für Tests (Node): liest fixtures/demo-projekt direkt von der Platte. */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjektDaten } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { ladeProjekt } from '../projekt/lesen';

export const DEMO_WURZEL = join(__dirname, '../../fixtures/demo-projekt');

export class NodeLeser implements ProjektLeser {
  private wurzel: string;
  constructor(wurzel: string) {
    this.wurzel = wurzel;
  }

  async lesen(pfad: string): Promise<string | null> {
    try {
      return await readFile(join(this.wurzel, pfad), 'utf8');
    } catch {
      return null;
    }
  }

  async auflisten(ordner: string): Promise<string[]> {
    const ergebnis: string[] = [];
    const lauf = async (rel: string) => {
      let eintraege;
      try {
        eintraege = await readdir(join(this.wurzel, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of eintraege) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await lauf(p);
        else if (e.isFile() && e.name !== '.DS_Store') ergebnis.push(p);
      }
    };
    await lauf(ordner);
    return ergebnis.sort();
  }

  async existiert(pfad: string): Promise<boolean> {
    return (await this.lesen(pfad)) !== null || (await this.auflisten(pfad)).length > 0;
  }
}

export function ladeDemo(): Promise<ProjektDaten> {
  return ladeProjekt(new NodeLeser(DEMO_WURZEL));
}
