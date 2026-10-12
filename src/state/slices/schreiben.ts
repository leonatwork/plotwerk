/** Slice „schreiben“. Besitzer: Editor. Persistenz über get().speichereX. */
import type { StateCreator } from 'zustand';
import type { MotivTreffer } from '@core/erkennung/index';
import type {
  Abweichung,
  AbweichungsEntscheidung,
  Anmerkung,
  Erwaehnung,
  Id,
  Kapitel,
  KapitelPlan,
  TextAnker,
  Verweis,
} from '@core/model/types';
import { kapitelPfad, parseKapitel } from '@core/projekt';
import { f, texte } from '../../i18n';
import type { Store } from '../store';

/** Live-Stand des offenen Kapitels (vom Editor entprellt gesetzt, vor dem Speichern). */
export interface SchreibenLive {
  kapitel: Id;
  woerter: number;
  erwaehnungen: Erwaehnung[];
  /** IDs der Anmerkungen, deren Stelle nicht mehr gefunden wird */
  verwaist: Id[];
  /** Motive im Text (S-10), Offsets im Klartext */
  motive?: MotivTreffer[];
}

export interface AbweichungEingabe {
  notiz: string;
  entscheidung: AbweichungsEntscheidung;
  /** nur bei „Plan anpassen“: die Notiz wird zur neuen Plan-Notiz (alte bleibt in `alterPlan`) */
  planUebernehmen?: boolean;
}

export interface SchreibenSlice {
  schreibenLive: SchreibenLive | null;
  setzeSchreibenLive(live: SchreibenLive | null): void;
  /** Speichert ausstehende Eingaben im Editor sofort (vor Export, Prüfung, Versionsverlauf). */
  editorSichern(): Promise<void>;
  /** Vom Editor registriert; null meldet ab. */
  registriereEditorSichern(sichern: (() => Promise<void>) | null): void;

  /** Text eines Kapitels speichern; ein geplantes Kapitel mit Text wird zum Entwurf. */
  kapitelTextSpeichern(id: Id, text: string): Promise<void>;
  /** Titel in Manuskript und Plan (ein nur geplantes Kapitel bekommt keine Manuskriptdatei). */
  kapitelTitelSpeichern(id: Id, titel: string): Promise<void>;
  /** „+ Kapitel planen“: neuer Plan (Status geplant) am Ende, wird ausgewählt. */
  kapitelPlanen(titel?: string): Promise<Id>;
  /** Reihenfolge (Drag & Drop): Kapitel an die Stelle `nachIndex` in projekt.kapitel. */
  kapitelVerschieben(id: Id, nachIndex: number): Promise<void>;

  /** „Ich weiche hier ab“ (S-09). Die bisherige Plan-Notiz bleibt als `alterPlan` erhalten. */
  abweichungSpeichern(kapitel: Id, eingabe: AbweichungEingabe): Promise<Abweichung>;
  abweichungEntscheiden(kapitel: Id, abweichung: Id, entscheidung: AbweichungsEntscheidung, planUebernehmen?: boolean): Promise<void>;
  planNotizSpeichern(kapitel: Id, notiz: string): Promise<void>;

  anmerkungAnlegen(anker: TextAnker, notiz: string, ziel: Verweis | null): Promise<Anmerkung>;
  anmerkungAendern(id: Id, teil: Partial<Pick<Anmerkung, 'notiz' | 'ziel' | 'anker'>>): Promise<void>;
  anmerkungEntfernen(id: Id): Promise<void>;
  /** Anker nachführen, wenn sich der Text um die Stelle geändert hat (S-06 „wandert mit“). */
  anmerkungenVerankern(neu: { id: Id; anker: TextAnker }[]): Promise<void>;

  /** Vorher Schnappschuss der aktuellen Fassung (E8), dann den Text der Version übernehmen. */
  versionWiederherstellen(kapitel: Id, versionsPfad: string): Promise<void>;
}

/** Lokales Datum JJJJ-MM-TT */
export function heute(jetzt = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`;
}

export function ankerGleich(a: TextAnker, b: TextAnker): boolean {
  return a.kapitel === b.kapitel && a.exakt === b.exakt && a.davor === b.davor && a.danach === b.danach;
}

export const createSchreibenSlice: StateCreator<Store, [], [], SchreibenSlice> = (set, get) => {
  let sichern: (() => Promise<void>) | null = null;

  const daten = () => {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  };

  const plan = (id: Id): KapitelPlan => {
    const p = daten().plaene[id];
    if (!p) throw new Error(f(texte().state.fehler.planFehlt, { id }));
    return p;
  };

  const kapitel = (id: Id): Kapitel => {
    const d = daten();
    return d.kapitel[id] ?? { id, titel: d.plaene[id]?.titel ?? id, text: '' };
  };

  return {
    schreibenLive: null,
    setzeSchreibenLive: (schreibenLive) => set({ schreibenLive }),
    editorSichern: () => (sichern ? sichern() : Promise.resolve()),
    registriereEditorSichern: (f) => {
      sichern = f;
    },

    async kapitelTextSpeichern(id, text) {
      const k = kapitel(id);
      if (k.text === text && get().daten?.kapitel[id]) return;
      const laeuft = [get().speichereKapitel({ ...k, text })];
      const p = get().daten?.plaene[id];
      if (p && p.status === 'geplant' && text.trim()) laeuft.push(get().speicherePlan({ ...p, status: 'entwurf' }));
      await Promise.all(laeuft);
    },

    async kapitelTitelSpeichern(id, titel) {
      const neu = titel.trim();
      if (!neu) return;
      const d = daten();
      const k = kapitel(id);
      const p = d.plaene[id];
      const laeuft: Promise<void>[] = [];
      const nurGeplant = !k.text.trim() && p?.status === 'geplant';
      if (k.titel !== neu) {
        if (nurGeplant) set({ daten: { ...d, kapitel: { ...d.kapitel, [id]: { ...k, titel: neu } } } });
        else laeuft.push(get().speichereKapitel({ ...k, titel: neu }));
      }
      const aktuellerPlan = get().daten?.plaene[id];
      if (aktuellerPlan && aktuellerPlan.titel !== neu) laeuft.push(get().speicherePlan({ ...aktuellerPlan, titel: neu }));
      await Promise.all(laeuft);
    },

    async kapitelPlanen(titel = texte().state.standard.kapitel) {
      const d = daten();
      const vorhanden = [...new Set([...d.projekt.kapitel, ...Object.keys(d.plaene), ...Object.keys(d.kapitel)])];
      const id = get().neueId(titel, vorhanden);
      const letztes = d.projekt.kapitel[d.projekt.kapitel.length - 1];
      const neu: KapitelPlan = {
        id,
        titel,
        akt: letztes ? (d.plaene[letztes]?.akt ?? null) : null,
        status: 'geplant',
        szene: '',
        straenge: [],
        figuren: [],
        orte: [],
        notiz: '',
        abweichungen: [],
        realitaet: [],
      };
      const speichern = get().speicherePlan(neu);
      get().waehle({ kapitel: id });
      await speichern;
      return id;
    },

    async kapitelVerschieben(id, nachIndex) {
      const p = daten().projekt;
      if (!p.kapitel.includes(id)) return;
      const liste = p.kapitel.filter((k) => k !== id);
      liste.splice(Math.max(0, Math.min(nachIndex, liste.length)), 0, id);
      if (liste.every((k, i) => k === p.kapitel[i])) return;
      await get().speichereProjekt({ ...p, kapitel: liste });
    },

    async abweichungSpeichern(kapitelId, { notiz, entscheidung, planUebernehmen }) {
      const p = plan(kapitelId);
      const text = notiz.trim();
      if (!text) throw new Error(texte().state.fehler.abweichungOhneNotiz);
      const id = get().neueId(text.split(/\s+/).slice(0, 6).join(' ') || 'abweichung', p.abweichungen.map((a) => a.id));
      const abweichung: Abweichung = { id, notiz: text, entscheidung, datum: heute() };
      if (p.notiz.trim()) abweichung.alterPlan = p.notiz;
      await get().speicherePlan({
        ...p,
        notiz: entscheidung === 'plan_anpassen' && planUebernehmen ? text : p.notiz,
        abweichungen: [...p.abweichungen, abweichung],
      });
      return abweichung;
    },

    async abweichungEntscheiden(kapitelId, abweichungId, entscheidung, planUebernehmen) {
      const p = plan(kapitelId);
      const a = p.abweichungen.find((x) => x.id === abweichungId);
      if (!a) return;
      const uebernehmen = entscheidung === 'plan_anpassen' && planUebernehmen;
      await get().speicherePlan({
        ...p,
        notiz: uebernehmen ? a.notiz : p.notiz,
        abweichungen: p.abweichungen.map((x) =>
          x.id === abweichungId ? { ...x, entscheidung, ...(uebernehmen && !x.alterPlan && p.notiz.trim() ? { alterPlan: p.notiz } : {}) } : x,
        ),
      });
    },

    async planNotizSpeichern(kapitelId, notiz) {
      const p = plan(kapitelId);
      if (p.notiz === notiz) return;
      await get().speicherePlan({ ...p, notiz });
    },

    async anmerkungAnlegen(anker, notiz, ziel) {
      const liste = daten().anmerkungen;
      const id = get().neueId(notiz.trim().split(/\s+/).slice(0, 5).join(' ') || 'notiz', liste.map((a) => a.id));
      const neu: Anmerkung = { id, anker, notiz: notiz.trim(), ziel, erstellt: new Date().toISOString() };
      await get().speichereAnmerkungen([...liste, neu]);
      return neu;
    },

    async anmerkungAendern(id, teil) {
      const liste = daten().anmerkungen;
      if (!liste.some((a) => a.id === id)) return;
      await get().speichereAnmerkungen(liste.map((a) => (a.id === id ? { ...a, ...teil } : a)));
    },

    async anmerkungEntfernen(id) {
      const liste = daten().anmerkungen;
      if (!liste.some((a) => a.id === id)) return;
      await get().speichereAnmerkungen(liste.filter((a) => a.id !== id));
    },

    async anmerkungenVerankern(neu) {
      const liste = daten().anmerkungen;
      const karte = new Map(neu.map((n) => [n.id, n.anker]));
      let geaendert = false;
      const ergebnis = liste.map((a) => {
        const anker = karte.get(a.id);
        if (!anker || ankerGleich(anker, a.anker)) return a;
        geaendert = true;
        return { ...a, anker };
      });
      if (geaendert) await get().speichereAnmerkungen(ergebnis);
    },

    async versionWiederherstellen(kapitelId, versionsPfad) {
      await get().editorSichern();
      const fs = get().fs;
      if (!fs) throw new Error(texte().state.fehler.keinProjekt);
      const inhalt = await fs.lesen(versionsPfad);
      if (inhalt === null) throw new Error(texte().state.fehler.versionFehlt);
      const alt = parseKapitel(inhalt, kapitelId);
      await get().alleSpeichernAbwarten();
      await get().schnappschuss(kapitelPfad(kapitelId), 'wiederherstellen');
      await get().kapitelTextSpeichern(kapitelId, alt.text);
    },
  };
};
