/**
 * Slice „ki“. Besitzer: KI. Laufende Prüfung, Fortschritt, letzte Ergebnisse, Schlüssel-Status
 * (je Anbieter), Erwähnungs-Vorschläge. Der API-Schlüssel selbst wird hier nie gehalten.
 */
import type { StateCreator } from 'zustand';
import { hinweisSchluessel } from '@core/index/index';
import {
  KiFehler,
  kiAnbieter,
  kiMitStandards,
  pruefe,
  schaetzeLauf,
  schlageErwaehnungenVor,
  type ErwaehnungsVorschlag,
  type KiFehlerArt,
  type PruefAuftrag,
  type PruefErgebnis,
  type PruefFortschritt,
  type Schaetzung,
} from '@core/ki/index';
import type { Figur, Hinweis, Id, KiAnbieter, KiEinstellungen, Ort, TextAnker, Verweis } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import type { Store } from '../store';

export type SchluesselStatus = 'unbekannt' | 'vorhanden' | 'fehlt';

export interface KiFehlerAnzeige {
  text: string;
  /** nicht_bereit → Knopf „Einstellungen öffnen“ */
  art: KiFehlerArt;
}

export interface KiErgebnis extends PruefErgebnis {
  auftrag: PruefAuftrag;
  /** Hinweise, die vorher nicht in .plotwerk/hinweise.json standen */
  neu: number;
  zeit: number;
}

export interface KiVorschlagsListe {
  laedt: boolean;
  geholt: boolean;
  liste: ErwaehnungsVorschlag[];
  fehler: KiFehlerAnzeige | null;
}

export interface KiSlice {
  /** laufende Prüfung (null = keine) */
  kiLauf: { auftrag: PruefAuftrag; fortschritt: PruefFortschritt | null } | null;
  kiErgebnis: KiErgebnis | null;
  kiFehler: KiFehlerAnzeige | null;
  /** Schlüssel-Status des gewählten Anbieters */
  kiSchluessel: SchluesselStatus;
  /** Schlüssel-Status je Anbieter (eigener Schlüsselbund-Eintrag je Anbieter) */
  kiSchluesselJe: Record<KiAnbieter, SchluesselStatus>;
  kiVorschlaege: Record<Id, KiVorschlagsListe>;

  /** projekt.ki mit Standardwerten beider Anbieter ergänzt (fehlt der Anbieter: Foundry) */
  kiEinstellungen(): Required<KiEinstellungen>;
  kiEinstellungenSpeichern(ki: KiEinstellungen): Promise<void>;
  kiSchaetzen(auftrag: PruefAuftrag): Promise<Schaetzung>;
  /** Prüfung starten; speichert Hinweise (Merge nach Schlüssel) und Analysen */
  kiPruefen(auftrag: PruefAuftrag): Promise<void>;
  /** bricht nach der laufenden Anfrage ab (bisherige Ergebnisse werden gespeichert) */
  kiAbbrechen(): void;
  kiZuruecksetzen(): void;
  /** ohne `anbieter`: der gewählte Anbieter */
  kiSchluesselPruefen(anbieter?: KiAnbieter): Promise<void>;
  /** gibt den Wert direkt an den Schlüsselbund weiter, ohne ihn zu speichern */
  kiSchluesselSetzen(wert: string, anbieter?: KiAnbieter): Promise<void>;
  kiSchluesselLoeschen(anbieter?: KiAnbieter): Promise<void>;
  kiVorschlaegeHolen(kapitel: Id): Promise<void>;
  kiVorschlagEntscheiden(v: ErwaehnungsVorschlag, status: 'bestaetigt' | 'verworfen', ziel?: Verweis | null): Promise<void>;
  /** legt für einen unbekannten Namen eine Figur bzw. einen Ort an und bestätigt die Zuordnung */
  kiVorschlagAnlegen(v: ErwaehnungsVorschlag): Promise<Verweis>;
}

export function kiFehlerAnzeige(e: unknown): KiFehlerAnzeige {
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
  const art: KiFehlerArt = e instanceof KiFehler ? e.art : 'api';
  if (/\b401\b|unauthori[sz]ed|authentication_error|invalid (x-)?api[- ]?key/i.test(text)) {
    return { art: 'nicht_bereit', text: 'Der API-Schlüssel wurde abgelehnt (401). Bitte in den Einstellungen prüfen oder ersetzen.' };
  }
  if (/\b403\b|permission_error|forbidden/i.test(text)) {
    return { art: 'api', text: `Kein Zugriff auf das Deployment (403). ${text}` };
  }
  if (/\b404\b|not_found_error|DeploymentNotFound|not found/i.test(text)) {
    return { art: 'nicht_bereit', text: `Modell oder Endpoint nicht gefunden (404). Bitte in den Einstellungen prüfen. ${text}` };
  }
  if (/\b429\b|rate_limit|too many requests/i.test(text)) {
    return { art: 'api', text: 'Zu viele Anfragen an den KI-Dienst (429). Bitte einen Moment warten und später erneut prüfen.' };
  }
  if (/\b(529|503)\b|overloaded/i.test(text)) {
    return { art: 'api', text: 'Der KI-Dienst ist gerade überlastet. Bitte später erneut prüfen.' };
  }
  if (/network|failed to fetch|timed? ?out|dns|connection|verbindung/i.test(text)) {
    return { art: 'api', text: `Keine Verbindung zum KI-Dienst. Ohne Netz funktioniert alles außer der KI-Prüfung. (${text})` };
  }
  return { art, text };
}

function gleicherAnker(a: TextAnker, b: TextAnker): boolean {
  return a.kapitel === b.kapitel && a.exakt === b.exakt && a.davor === b.davor && a.danach === b.danach;
}

export const createKiSlice: StateCreator<Store, [], [], KiSlice> = (set, get) => {
  let abbruch: AbortController | null = null;

  /** Nur-Lese-Sicht auf das Projekt (harte Regel 1: core/ki bekommt nie das schreibende Dateisystem). */
  async function leser(): Promise<ProjektLeser> {
    const fs = get().fs;
    if (!fs || !get().daten) throw new KiFehler('auftrag', 'Kein Projekt geöffnet.');
    await get().editorSichern();
    await get().alleSpeichernAbwarten();
    return {
      lesen: (p) => fs.lesen(p),
      auflisten: (o) => fs.auflisten(o),
      existiert: (p) => fs.existiert(p),
    };
  }

  function backend() {
    const b = get().backend;
    if (!b) throw new KiFehler('nicht_bereit', 'Die App ist noch nicht bereit.');
    return b;
  }

  const LEER: KiVorschlagsListe = { laedt: false, geholt: false, liste: [], fehler: null };

  function vorschlaegeSetzen(kapitel: Id, teil: Partial<KiVorschlagsListe>) {
    set((s) => ({
      kiVorschlaege: { ...s.kiVorschlaege, [kapitel]: { ...(s.kiVorschlaege[kapitel] ?? LEER), ...teil } },
    }));
  }

  function vorschlagEntfernen(v: ErwaehnungsVorschlag) {
    const eintrag = get().kiVorschlaege[v.anker.kapitel];
    if (!eintrag) return;
    vorschlaegeSetzen(v.anker.kapitel, { liste: eintrag.liste.filter((x) => !gleicherAnker(x.anker, v.anker)) });
  }

  return {
    kiLauf: null,
    kiErgebnis: null,
    kiFehler: null,
    kiSchluessel: 'unbekannt',
    kiSchluesselJe: { foundry: 'unbekannt', claude: 'unbekannt' },
    kiVorschlaege: {},

    kiEinstellungen() {
      return kiMitStandards(get().daten?.projekt.ki);
    },

    async kiEinstellungenSpeichern(ki) {
      const projekt = get().daten?.projekt;
      if (!projekt) throw new Error('Kein Projekt geöffnet.');
      // Die Einstellungen des anderen Anbieters bleiben erhalten, auch wenn `ki` sie nicht enthält.
      const alt = projekt.ki;
      const claude = ki.claude ?? alt?.claude;
      await get().speichereProjekt({ ...projekt, ki: { ...ki, ...(claude ? { claude } : {}) } });
      // kiSchluessel zeigt den Status des (ggf. neu) gewählten Anbieters
      if (kiAnbieter(ki) !== kiAnbieter(alt)) await get().kiSchluesselPruefen(kiAnbieter(ki));
    },

    async kiSchaetzen(auftrag) {
      return schaetzeLauf(await leser(), auftrag, backend().ki, get().kiEinstellungen());
    },

    async kiPruefen(auftrag) {
      if (get().kiLauf) return;
      const steuerung = new AbortController();
      abbruch = steuerung;
      set({ kiLauf: { auftrag, fortschritt: null }, kiFehler: null, kiErgebnis: null });
      try {
        const ergebnis = await pruefe(await leser(), auftrag, backend().ki, get().kiEinstellungen(), {
          signal: steuerung.signal,
          fortschritt: (f) => set((s) => ({ kiLauf: s.kiLauf ? { ...s.kiLauf, fortschritt: f } : s.kiLauf })),
        });
        // Merge nach Schlüssel; gespeicherte Schlüssel werden neu berechnet (robust gegen ältere Formate)
        const vorhanden = get().daten?.kiHinweise ?? [];
        const nachSchluessel = new Map(vorhanden.map((h) => [hinweisSchluessel(h.typ, h.zitate), h]));
        let neu = 0;
        for (const h of ergebnis.hinweise) {
          const alt = nachSchluessel.get(h.schluessel);
          if (!alt) neu += 1;
          nachSchluessel.set(h.schluessel, alt ? ({ ...h, status: alt.status } satisfies Hinweis) : h);
        }
        if (ergebnis.hinweise.length) await get().speichereKiHinweise([...nachSchluessel.values()]);
        if (ergebnis.analysen.length) await get().speichereAnalysen(ergebnis.analysen);
        set({ kiErgebnis: { ...ergebnis, auftrag, neu, zeit: Date.now() } });
      } catch (e) {
        set({ kiFehler: kiFehlerAnzeige(e) });
      } finally {
        if (abbruch === steuerung) abbruch = null;
        set({ kiLauf: null });
      }
    },

    kiAbbrechen() {
      abbruch?.abort();
    },

    kiZuruecksetzen() {
      if (get().kiLauf) return;
      set({ kiErgebnis: null, kiFehler: null });
    },

    async kiSchluesselPruefen(anbieter) {
      const b = get().backend;
      if (!b) return;
      const a = anbieter ?? kiAnbieter(get().daten?.projekt.ki);
      let status: SchluesselStatus;
      try {
        status = (await b.schluessel.vorhanden(a)) ? 'vorhanden' : 'fehlt';
      } catch {
        status = 'unbekannt';
      }
      set((s) => ({
        kiSchluesselJe: { ...s.kiSchluesselJe, [a]: status },
        ...(a === kiAnbieter(get().daten?.projekt.ki) ? { kiSchluessel: status } : {}),
      }));
    },

    async kiSchluesselSetzen(wert, anbieter) {
      const sauber = wert.trim();
      if (!sauber) throw new Error('Bitte einen Schlüssel eingeben.');
      const a = anbieter ?? kiAnbieter(get().daten?.projekt.ki);
      await backend().schluessel.setzen(sauber, a);
      await get().kiSchluesselPruefen(a);
    },

    async kiSchluesselLoeschen(anbieter) {
      const a = anbieter ?? kiAnbieter(get().daten?.projekt.ki);
      await backend().schluessel.loeschen(a);
      await get().kiSchluesselPruefen(a);
    },

    async kiVorschlaegeHolen(kapitel) {
      if (get().kiVorschlaege[kapitel]?.laedt) return;
      vorschlaegeSetzen(kapitel, { laedt: true, fehler: null });
      try {
        const liste = await schlageErwaehnungenVor(await leser(), kapitel, backend().ki, get().kiEinstellungen());
        vorschlaegeSetzen(kapitel, { laedt: false, geholt: true, liste });
      } catch (e) {
        vorschlaegeSetzen(kapitel, { laedt: false, fehler: kiFehlerAnzeige(e) });
      }
    },

    async kiVorschlagEntscheiden(v, status, ziel) {
      const daten = get().daten;
      if (!daten) throw new Error('Kein Projekt geöffnet.');
      const e = daten.entscheidungen;
      const zuordnungen = [
        ...e.zuordnungen.filter((z) => !gleicherAnker(z.anker, v.anker)),
        { anker: v.anker, ziel: ziel === undefined ? v.ziel : ziel, status },
      ];
      vorschlagEntfernen(v);
      await get().speichereEntscheidungen({ ...e, zuordnungen });
    },

    async kiVorschlagAnlegen(v) {
      const daten = get().daten;
      if (!daten) throw new Error('Kein Projekt geöffnet.');
      const name = v.text.charAt(0).toLocaleUpperCase('de') + v.text.slice(1);
      let ziel: Verweis;
      if (v.zielTyp === 'ort') {
        const id = get().neueId(name, Object.keys(daten.orte));
        const ort: Ort = { id, name, aliase: [], beschreibung: '', notizen: '' };
        await get().speichereOrt(ort);
        ziel = { typ: 'ort', id };
      } else {
        const id = get().neueId(name, Object.keys(daten.figuren));
        const figur: Figur = {
          id,
          name,
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
        ziel = { typ: 'figur', id };
      }
      await get().kiVorschlagEntscheiden(v, 'bestaetigt', ziel);
      return ziel;
    },
  };
};
