/** Antagonisten/Gruppen (A-02): Präsenz pro Kapitel und Akt, Prüfung der Spuren. Reine Funktionen. */
import type { Index } from '@core/index/index';
import type { Akt, Gruppe, Id, ProjektDaten, Spur } from '@core/model/types';
import { f, texte } from '../../i18n';
import { ausschnitt, findeAnker, findeStelle, kapLabel, type Stelle } from '../beziehungen/gemeinsam';

/** im_text: ein Mitglied kommt vor · spur: nur eine Spur · plan: nur im Kapitelplan (Strang) · leer */
export type PraesenzZustand = 'im_text' | 'spur' | 'plan' | 'leer';

export interface KapitelPraesenz {
  kapitel: Id;
  nummer: number;
  zustand: PraesenzZustand;
  mitglieder: Id[];
  spuren: Spur[];
  /** Kapitel hat noch keinen Text */
  ohneText: boolean;
}

export function praesenzProKapitel(daten: ProjektDaten, index: Index, g: Gruppe): KapitelPraesenz[] {
  const mitglieder = new Set(g.mitglieder);
  const proKapitel = new Map<Id, Set<Id>>();
  for (const e of index.erwaehnungen) {
    if (e.zielTyp !== 'figur' || !mitglieder.has(e.ziel)) continue;
    if (!proKapitel.has(e.kapitel)) proKapitel.set(e.kapitel, new Set());
    proKapitel.get(e.kapitel)!.add(e.ziel);
  }
  return daten.projekt.kapitel.map((k, i) => {
    const m = [...(proKapitel.get(k) ?? [])];
    const spuren = g.spuren.filter((s) => s.kapitel === k && s.status !== 'verworfen');
    const imPlan = !!g.strang && !!daten.plaene[k]?.straenge.includes(g.strang);
    return {
      kapitel: k,
      nummer: i + 1,
      zustand: m.length > 0 ? 'im_text' : spuren.length > 0 ? 'spur' : imPlan ? 'plan' : 'leer',
      mitglieder: m,
      spuren,
      ohneText: !daten.kapitel[k]?.text.trim(),
    };
  });
}

export interface AktPraesenz {
  akt: Akt;
  kapitel: KapitelPraesenz[];
  /** manuell geplant (gruppe.praesenz) */
  geplant: string;
  /** aus dem Text abgeleitet, z. B. „im Text: Kap. 2 · Spur: Kap. 10“ */
  imText: string;
}

export function praesenzProAkt(daten: ProjektDaten, index: Index, g: Gruppe): AktPraesenz[] {
  const kap = praesenzProKapitel(daten, index, g);
  const t = texte().gruppen.praesenz;
  return [...daten.akte]
    .sort((a, b) => a.nummer - b.nummer)
    .map((akt) => {
      const eigene = kap.filter((k) => daten.plaene[k.kapitel]?.akt === akt.nummer);
      const liste = (z: PraesenzZustand) =>
        eigene
          .filter((k) => k.zustand === z)
          .map((k) => k.nummer)
          .join(', ');
      const teile = [
        liste('im_text') && f(t.imText, { liste: liste('im_text') }),
        liste('spur') && f(t.spur, { liste: liste('spur') }),
        liste('plan') && f(t.plan, { liste: liste('plan') }),
      ].filter(Boolean);
      return { akt, kapitel: eigene, geplant: g.praesenz[akt.nummer] ?? '', imText: teile.join(' · ') || t.nochNicht };
    });
}

export type SpurZustand = 'gefunden' | 'verwaist' | 'nicht_gefunden';

export interface SpurPruefung {
  spur: Spur;
  zustand: SpurZustand;
  stelle: Stelle | null;
  /** Satz um die Fundstelle */
  ausschnitt: string;
  kapitelLabel: string;
}

/** Gespeicherten Anker wiederfinden (sonst verwaist), ohne Anker das Zitat im Kapitel suchen (E4/E6). */
export function spurPruefen(daten: ProjektDaten, spur: Spur): SpurPruefung {
  const stelle = spur.anker ? findeAnker(daten, spur.anker) : findeStelle(daten, spur.kapitel, spur.text);
  return {
    spur,
    zustand: stelle ? 'gefunden' : spur.anker ? 'verwaist' : 'nicht_gefunden',
    stelle,
    ausschnitt: stelle ? ausschnitt(stelle.klartext, stelle.bereich.start, stelle.bereich.ende) : '',
    kapitelLabel: kapLabel(daten, spur.kapitel),
  };
}
