/**
 * Slice „hinweise“: Filter der Hinweise-Ansicht und Leons Entscheidungen (entscheidungen.json).
 * Besitzer: Netz & Hinweise. Auch für den Tab „Hinweise“ im Editor nutzbar (hinweisEntscheiden, hinweisStelleOeffnen).
 */
import type { StateCreator } from 'zustand';
import type { Figur, Hinweis, HinweisEntscheidung, Id, Zitat } from '@core/model/types';
import { ankerErzeugen, findeZitat, klartext } from '@core/text/index';
import { ankerFuerZitat } from '../../features/beziehungen/gemeinsam';
import { schreibweisenZiel, STANDARD_FILTER, type HinweisFilter } from '../../features/hinweise/logik';
import { f as fmt, texte } from '../../i18n';
import type { Store } from '../store';

export type { HinweisFilter };

export interface HinweiseSlice {
  hinweisFilter: HinweisFilter;
  setzeHinweisFilter(teil: Partial<HinweisFilter>): void;
  /** „Ist Absicht“ / „Erledigt“; null setzt zurück. Entschiedene Hinweise werden nicht erneut gemeldet. */
  hinweisEntscheiden(schluessel: string, entscheidung: HinweisEntscheidung | null): Promise<void>;
  /** Springt im Editor zur Stelle des Zitats und hebt sie hervor. */
  hinweisStelleOeffnen(zitat: Zitat): void;
  /** Legt die gültige Schreibweise fest (entscheidungen.schreibweisen) und erledigt den Hinweis. */
  schreibweiseFestlegen(hinweis: Hinweis, gueltig: string, varianten: string[]): Promise<void>;
  /** Hinweis „unbekannt“: neue Figur mit dem Namen anlegen, Hinweis erledigt. Rückgabe: Figur-ID. */
  unbekannteFigurAnlegen(hinweis: Hinweis, name: string): Promise<Id>;
  /** Hinweis „unbekannt“: Name wird Alias der Figur, Zuordnung bestätigt, Hinweis erledigt. */
  unbekanntZuordnen(hinweis: Hinweis, figur: Id, name: string): Promise<void>;
}

const jetzt = () => new Date().toISOString();

export const createHinweiseSlice: StateCreator<Store, [], [], HinweiseSlice> = (set, get) => {
  const daten = () => {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  };

  /** Entscheidungsliste mit gesetzter/entfernter Entscheidung für `schluessel`. */
  const mitEntscheidung = (schluessel: string, entscheidung: HinweisEntscheidung | null) => {
    const rest = daten().entscheidungen.hinweise.filter((h) => h.schluessel !== schluessel);
    return entscheidung ? [...rest, { schluessel, entscheidung, datum: jetzt() }] : rest;
  };

  return {
    hinweisFilter: STANDARD_FILTER,
    setzeHinweisFilter: (teil) => set((s) => ({ hinweisFilter: { ...s.hinweisFilter, ...teil } })),

    async hinweisEntscheiden(schluessel, entscheidung) {
      const e = daten().entscheidungen;
      await get().speichereEntscheidungen({ ...e, hinweise: mitEntscheidung(schluessel, entscheidung) });
    },

    hinweisStelleOeffnen(zitat) {
      const anker = ankerFuerZitat(daten(), zitat.kapitel, zitat.text);
      get().markiere({ kapitel: zitat.kapitel, anker });
      get().oeffne('schreiben', { kapitel: zitat.kapitel });
    },

    async schreibweiseFestlegen(hinweis, gueltig, varianten) {
      const d = daten();
      const alle = [...new Set([gueltig, ...varianten])];
      const klein = new Set(alle.map((v) => v.toLocaleLowerCase('de')));
      const vorhanden = d.entscheidungen.schreibweisen.find((s) => s.varianten.some((v) => klein.has(v.toLocaleLowerCase('de'))));
      const ziel = schreibweisenZiel(d, alle) ?? vorhanden?.ziel;
      // Wie in der Orte-Ansicht (O-02): Eintrag in entscheidungen.schreibweisen, Ziel bekommt den gültigen
      // Namen, die anderen Schreibweisen werden Aliase.
      await get().planung.schreibweiseFestlegen([...new Set([...(vorhanden?.varianten ?? []), ...alle])], gueltig, ziel);
      await get().hinweisEntscheiden(hinweis.schluessel, 'erledigt');
    },

    async unbekannteFigurAnlegen(hinweis, name) {
      const d = daten();
      const n = name.trim();
      if (!n) throw new Error(texte().state.fehler.nameFehlt);
      const id = get().neueId(n, Object.keys(d.figuren));
      const figur: Figur = {
        id,
        name: n,
        aliase: [],
        rolle: 'neben',
        existenz: 'gesichert',
        gruppe: null,
        beziehungen: [],
        plan: {},
        wahrheit: '',
        notizen: '',
      };
      await get().speichereFigur(figur);
      await get().hinweisEntscheiden(hinweis.schluessel, 'erledigt');
      return id;
    },

    async unbekanntZuordnen(hinweis, figurId, name) {
      const d = daten();
      const f = d.figuren[figurId];
      if (!f) throw new Error(fmt(texte().state.fehler.figurFehlt, { id: figurId }));
      const n = name.trim();
      const bekannt = [f.name, ...f.aliase].some((x) => x.toLocaleLowerCase('de') === n.toLocaleLowerCase('de'));
      if (n && !bekannt) await get().speichereFigur({ ...f, aliase: [...f.aliase, n] });

      // Zuordnung der konkreten Stelle festhalten (E4-Anker auf den Namen im Zitat)
      const zuordnungen = [...d.entscheidungen.zuordnungen];
      for (const z of hinweis.zitate) {
        const md = d.kapitel[z.kapitel]?.text;
        if (!md || !n) continue;
        const kt = klartext(md);
        const zitat = findeZitat(kt, z.text)[0];
        const imZitat = zitat ? findeZitat(kt.slice(zitat.start, zitat.ende), n)[0] : undefined;
        if (!zitat || !imZitat) continue;
        const anker = ankerErzeugen(z.kapitel, kt, zitat.start + imZitat.start, zitat.start + imZitat.ende);
        zuordnungen.push({ anker, ziel: { typ: 'figur', id: figurId }, status: 'bestaetigt' });
      }
      const e = get().daten!.entscheidungen;
      await get().speichereEntscheidungen({
        ...e,
        zuordnungen,
        hinweise: mitEntscheidung(hinweis.schluessel, 'erledigt'),
      });
    },
  };
};
