/**
 * Sprachabhängige Beschriftungen für Figuren/Bögen, die core/figuren nur deutsch liefert (stufenOrt, aktGruppen).
 * Lesen bei jedem Aufruf die aktuelle Oberflächensprache.
 */
import type { AktGruppe } from '@core/figuren/index';
import type { BogenStufe, ProjektDaten } from '@core/model/types';
import { f, texte } from '../../i18n';

/** „Kap. 3“ / „Ch. 3“ */
export function kapKurz(nr: number | string): string {
  return f(texte().gemeinsam.kapitelKurz, { nr });
}

/** „Kap. 3 „Rot““ / „Ch. 3 “Rot”“ */
export function kapMitTitel(nr: number | string, titel: string): string {
  return f(texte().figuren.kapitelMitTitel, { nr, titel });
}

/** Zitat in den Anführungszeichen der Oberflächensprache. */
export function zitat(text: string): string {
  return f(texte().figuren.zitat, { text });
}

/** Titel eines Akts (aus dem Projekt, sonst „Akt n“). */
export function aktTitel(daten: ProjektDaten, nummer: number): string {
  return daten.akte.find((a) => a.nummer === nummer)?.titel || f(texte().figuren.ort.akt, { nr: nummer });
}

/** Platz einer Bogen-Stufe wie stufenOrt aus core, aber in der Oberflächensprache. */
export function stufenOrtText(daten: ProjektDaten, stufe: BogenStufe): string {
  if (stufe.kapitel) {
    const i = daten.projekt.kapitel.indexOf(stufe.kapitel);
    if (i >= 0) return kapKurz(i + 1);
  }
  if (stufe.akt !== undefined) return aktTitel(daten, stufe.akt);
  return texte().figuren.ort.ohneKapitel;
}

/** Kopf einer Aktgruppe im Raster. */
export function aktGruppenTitel(daten: ProjektDaten, g: AktGruppe): string {
  return g.akt === null ? texte().figuren.ort.ohneAkt : aktTitel(daten, g.akt);
}
