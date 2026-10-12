/** Schnell ablegen: gezogene/eingefügte Bilder und Adressen direkt als Einträge anlegen (ohne Dialog). */
import type { RechercheEintrag, Verweis } from '@core/model/types';
import { useStore } from '../../state/store';
import { titelAusDateiname } from '@core/recherche/index';
import { sprache, texte } from '../../i18n';
import { mitteilen } from '../../ui';
import { ausUebergabe } from './gemeinsam';

export async function ablegen(dt: DataTransfer | null, verweise: Verweis[] = []): Promise<RechercheEintrag[]> {
  const { dateien, links } = ausUebergabe(dt);
  const r = useStore.getState().recherche;
  const angelegt: RechercheEintrag[] = [];
  const fehler: string[] = [];
  for (const f of dateien) {
    const problem = r.dateiPruefen(f.name, f.size);
    if (problem) {
      fehler.push(problem);
      continue;
    }
    try {
      const daten = new Uint8Array(await f.arrayBuffer());
      angelegt.push(await r.speichern({ art: 'bild', titel: titelAusDateiname(f.name, sprache()), text: '', verweise }, { neueDatei: { name: f.name, daten } }));
    } catch (e) {
      fehler.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const url of links) {
    try {
      angelegt.push(await r.speichern({ art: 'link', titel: '', text: '', url, verweise }));
    } catch (e) {
      fehler.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const letzter = angelegt[angelegt.length - 1];
  if (letzter) r.waehle(letzter.id);
  const t = texte().recherche.ablegen;
  if (fehler.length) await mitteilen(fehler.join('\n'), angelegt.length ? t.nichtAlles : t.nichts);
  return angelegt;
}
