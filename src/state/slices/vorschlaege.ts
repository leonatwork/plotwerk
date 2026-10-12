/**
 * Slice „vorschlaege“: KI-Vorschläge für Figuren, Orte und Beziehungen (Lauf, Ablage, Übernehmen/Verwerfen).
 *
 * Die KI-Funktion (core/ki schlageVorschlaegeVor) bekommt nur einen ProjektLeser und legt nichts an. Gespeichert
 * wird ausschließlich hier über die speichereX-Aktionen des Stores: speichereKiVorschlaege (Ablage
 * .plotwerk/vorschlaege.json), speichereFigur, speichereOrt. Übernommen wird nur auf Leons Klick.
 */
import type { StateCreator } from 'zustand';
import {
  figurMitNamen,
  figurVerweisAufloesen,
  KiFehler,
  leereVorschlaege,
  mischeVorschlaege,
  offeneVorschlaege,
  ortMitNamen,
  schaetzeVorschlaege,
  schlageVorschlaegeVor,
  type Schaetzung,
  type VorschlagsErgebnis,
} from '@core/ki/index';
import type { Beziehung, Figur, FigurVorschlag, Id, KiVorschlaege, Ort, ProjektDaten } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import { belegteFlaechen, figurAusVorschlag, kreisPositionen } from '../../features/beziehungen/vorschlagLogik';
import { sprache, texte } from '../../i18n';
import type { Store } from '../store';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from './ki';

export type VorschlagsArt = 'figur' | 'ort' | 'beziehung';

export interface VorschlagsLaufErgebnis extends Omit<VorschlagsErgebnis, 'figuren' | 'orte' | 'beziehungen'> {
  /** neu in die Ablage aufgenommen */
  neu: number;
  /** offene Vorschläge, die der Lauf erneut geliefert hat (aktualisiert) */
  aktualisiert: number;
  tiefencheck: boolean;
  zeit: number;
}

export interface VorschlaegeSlice {
  /** Vorschläge-Panel im Bereich „Beziehungen“ sichtbar */
  vorschlagPanel: boolean;
  /** Dialog „Beziehungen vorschlagen“ (Bestätigung, Fortschritt, Ergebnis) offen */
  vorschlagDialog: boolean;
  vorschlagLaeuft: boolean;
  vorschlagFehler: KiFehlerAnzeige | null;
  vorschlagErgebnis: VorschlagsLaufErgebnis | null;

  /** wechselt zu „Beziehungen“ und zeigt das Panel; `dialog` öffnet zusätzlich den Dialog zum Starten */
  oeffneVorschlaege(teil?: { dialog?: boolean }): void;
  schliesseVorschlagsPanel(): void;
  schliesseVorschlagsDialog(): void;
  vorschlaegeSchaetzen(optionen?: { tiefencheck?: boolean }): Promise<Schaetzung>;
  /** Lauf starten; das Ergebnis wird in die Ablage gemischt und gespeichert */
  vorschlaegeHolen(optionen?: { tiefencheck?: boolean }): Promise<void>;
  /** Figur: legt sie an · Ort: legt ihn an (übergeordneten Ort auflösen) · Beziehung: an der Figur „von“, nötige Figuren mit */
  vorschlagUebernehmen(art: VorschlagsArt, schluessel: string): Promise<void>;
  /** Verworfenes kommt nicht wieder; eine verworfene Figur nimmt ihre offenen Beziehungsvorschläge mit */
  vorschlagVerwerfen(art: VorschlagsArt, schluessel: string): Promise<void>;
  /** Figuren → Orte → Beziehungen */
  alleVorschlaegeUebernehmen(): Promise<{ figuren: number; orte: number; beziehungen: number }>;
}

export const createVorschlaegeSlice: StateCreator<Store, [], [], VorschlaegeSlice> = (set, get) => {
  function daten(): ProjektDaten {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  }

  function ablage(): KiVorschlaege {
    return get().daten?.kiVorschlaege ?? leereVorschlaege();
  }

  /** Ablage immer vom neuesten Stand aus ändern und speichern. */
  async function ablageAendern(aendern: (a: KiVorschlaege) => KiVorschlaege): Promise<void> {
    await get().speichereKiVorschlaege(aendern(ablage()));
  }

  /** Nur-Lese-Sicht auf das Projekt (harte Regel 1: core/ki bekommt nie das schreibende Dateisystem). */
  async function leser(): Promise<ProjektLeser> {
    const fs = get().fs;
    if (!fs || !get().daten) throw new KiFehler('auftrag', texte().state.fehler.keinProjekt);
    await get().editorSichern();
    await get().alleSpeichernAbwarten();
    return { lesen: (p) => fs.lesen(p), auflisten: (o) => fs.auflisten(o), existiert: (p) => fs.existiert(p) };
  }

  function transport() {
    const b = get().backend;
    if (!b) throw new KiFehler('nicht_bereit', texte().state.fehler.nichtBereit);
    return b.ki;
  }

  /** Reihenfolge für das Netz: Figuren mit den meisten Beziehungen zuerst (die erste liegt bei leerem Netz in der Mitte). */
  function nachGewicht(schluessel: string[]): string[] {
    const a = ablage();
    const gewicht = (k: string) => {
      const v = a.figuren.find((f) => f.schluessel === k);
      const bez = a.beziehungen.filter((b) => b.status !== 'verworfen' && [b.von, b.zu].some((r) => r.typ === 'vorschlag' && r.id === k)).length;
      return bez * 2 + (v?.rolle === 'haupt' ? 1 : 0);
    };
    return [...schluessel].sort((x, y) => gewicht(y) - gewicht(x));
  }

  /** Legt Figuren aus Vorschlägen an (kreisförmig im Netz). Rückgabe: Schlüssel → Figur-ID. */
  async function figurenUebernehmen(schluessel: string[]): Promise<Map<string, Id>> {
    const d = daten();
    const a = ablage();
    const zuordnung = new Map<string, Id>();
    const anlegen: { v: FigurVorschlag; id: Id }[] = [];
    const ids = new Set(Object.keys(d.figuren));
    for (const k of schluessel) {
      const v = a.figuren.find((f) => f.schluessel === k);
      if (!v || v.status === 'verworfen' || zuordnung.has(k)) continue;
      if (v.status === 'uebernommen' && v.figur && d.figuren[v.figur]) {
        zuordnung.set(k, v.figur);
        continue;
      }
      // F-10: Spitznamen für eine angelegte Figur
      if (v.ziel) {
        if (!d.figuren[v.ziel]) continue;
        for (const n of [v.name, ...v.aliase]) await get().planung.spitznameHinzufuegen(v.ziel, n);
        zuordnung.set(k, v.ziel);
        continue;
      }
      const vorhanden = figurMitNamen(d, v.name, ...v.aliase);
      if (vorhanden) {
        zuordnung.set(k, vorhanden);
        continue;
      }
      const id = get().neueId(v.name, [...ids]);
      ids.add(id);
      anlegen.push({ v, id });
      zuordnung.set(k, id);
    }
    const positionen = kreisPositionen(belegteFlaechen(d), anlegen.length);
    await Promise.all(anlegen.map(({ v, id }, i) => get().speichereFigur(figurAusVorschlag(v, id, positionen[i]))));
    if (zuordnung.size > 0) {
      await ablageAendern((x) => ({
        ...x,
        figuren: x.figuren.map((f) => (zuordnung.has(f.schluessel) ? { ...f, status: 'uebernommen', figur: zuordnung.get(f.schluessel)! } : f)),
      }));
    }
    return zuordnung;
  }

  async function orteUebernehmen(schluessel: string[]): Promise<number> {
    const d = daten();
    const a = ablage();
    const gewaehlt = schluessel
      .map((k) => a.orte.find((o) => o.schluessel === k))
      .filter((o): o is NonNullable<typeof o> => !!o && o.status === 'neu');
    // übergeordnete Orte zuerst
    const reihenfolge: typeof gewaehlt = [];
    const rest = [...gewaehlt];
    while (rest.length) {
      const i = rest.findIndex((o) => !(o.in?.typ === 'vorschlag' && rest.some((x) => x !== o && x.schluessel === o.in!.id)));
      reihenfolge.push(...rest.splice(i < 0 ? 0 : i, 1));
    }
    const zuordnung = new Map<string, Id>();
    const ids = new Set(Object.keys(d.orte));
    const neu: Ort[] = [];
    for (const v of reihenfolge) {
      const vorhanden = ortMitNamen(d, v.name);
      if (vorhanden) {
        zuordnung.set(v.schluessel, vorhanden);
        continue;
      }
      const id = get().neueId(v.name, [...ids]);
      ids.add(id);
      zuordnung.set(v.schluessel, id);
      let in_: Id | undefined;
      if (v.in?.typ === 'angelegt' && d.orte[v.in.id]) in_ = v.in.id;
      else if (v.in?.typ === 'vorschlag') {
        const eltern = a.orte.find((o) => o.schluessel === v.in!.id);
        in_ = zuordnung.get(v.in.id) ?? (eltern?.status === 'uebernommen' && eltern.ort && d.orte[eltern.ort] ? eltern.ort : undefined);
      }
      neu.push({ id, name: v.name, aliase: [...v.aliase], ...(in_ ? { in: in_ } : {}), beschreibung: '', notizen: '' });
    }
    // früher übernommene Orte, deren übergeordneter Ort erst jetzt angelegt wird, nachträglich einhängen
    const nachtraeglich: Ort[] = [];
    for (const o of a.orte) {
      if (o.status !== 'uebernommen' || o.in?.typ !== 'vorschlag' || !o.ort) continue;
      const eltern = zuordnung.get(o.in.id);
      const ort = d.orte[o.ort];
      if (eltern && ort && !ort.in && eltern !== ort.id) nachtraeglich.push({ ...ort, in: eltern });
    }
    await Promise.all([...neu, ...nachtraeglich].map((o) => get().speichereOrt(o)));
    if (zuordnung.size > 0) {
      await ablageAendern((x) => ({
        ...x,
        orte: x.orte.map((o) => (zuordnung.has(o.schluessel) ? { ...o, status: 'uebernommen', ort: zuordnung.get(o.schluessel)! } : o)),
      }));
    }
    return zuordnung.size;
  }

  async function beziehungenUebernehmen(schluessel: string[]): Promise<number> {
    const a0 = ablage();
    const liste = schluessel
      .map((k) => a0.beziehungen.find((b) => b.schluessel === k))
      .filter((b): b is NonNullable<typeof b> => !!b && b.status === 'neu');
    // verweist eine Beziehung auf noch nicht übernommene vorgeschlagene Figuren, diese mit übernehmen
    const noetig: string[] = [];
    for (const b of liste) {
      for (const r of [b.von, b.zu]) {
        const x = figurVerweisAufloesen(a0, daten(), r);
        if (x && 'vorschlag' in x && !noetig.includes(x.vorschlag.schluessel)) noetig.push(x.vorschlag.schluessel);
      }
    }
    if (noetig.length) await figurenUebernehmen(nachGewicht(noetig));

    const d = daten();
    const a = ablage();
    const geaendert = new Map<Id, Figur>();
    const erledigt = new Set<string>();
    for (const b of liste) {
      const von = figurVerweisAufloesen(a, d, b.von);
      const zu = figurVerweisAufloesen(a, d, b.zu);
      if (!von || !zu || !('figur' in von) || !('figur' in zu) || von.figur === zu.figur) continue;
      const f = geaendert.get(von.figur) ?? d.figuren[von.figur]!;
      const doppelt = f.beziehungen.some((x) => x.zu === zu.figur && (x.abKapitel ?? '') === (b.abKapitel ?? ''));
      if (!doppelt) {
        const neu: Beziehung = {
          zu: zu.figur,
          art: b.art,
          ...(b.abKapitel ? { abKapitel: b.abKapitel } : {}),
          kategorie: b.kategorie,
          ...(b.unsicher ? { unsicher: true } : {}),
        };
        geaendert.set(von.figur, { ...f, beziehungen: [...f.beziehungen, neu] });
      }
      erledigt.add(b.schluessel);
    }
    await Promise.all([...geaendert.values()].map((f) => get().speichereFigur(f)));
    if (erledigt.size > 0) {
      await ablageAendern((x) => ({
        ...x,
        beziehungen: x.beziehungen.map((b) => (erledigt.has(b.schluessel) ? { ...b, status: 'uebernommen' } : b)),
      }));
    }
    return erledigt.size;
  }

  return {
    vorschlagPanel: false,
    vorschlagDialog: false,
    vorschlagLaeuft: false,
    vorschlagFehler: null,
    vorschlagErgebnis: null,

    oeffneVorschlaege(teil) {
      set({ bereich: 'beziehungen', vorschlagPanel: true, ...(teil?.dialog ? { vorschlagDialog: true } : {}) });
    },
    schliesseVorschlagsPanel: () => set({ vorschlagPanel: false }),
    schliesseVorschlagsDialog() {
      set((s) => (s.vorschlagLaeuft ? { vorschlagDialog: false } : { vorschlagDialog: false, vorschlagErgebnis: null, vorschlagFehler: null }));
    },

    async vorschlaegeSchaetzen(optionen) {
      return schaetzeVorschlaege(await leser(), transport(), get().kiEinstellungen(), { tiefencheck: !!optionen?.tiefencheck, oberflaeche: sprache() });
    },

    async vorschlaegeHolen(optionen) {
      if (get().vorschlagLaeuft) return;
      const tiefencheck = !!optionen?.tiefencheck;
      set({ vorschlagLaeuft: true, vorschlagFehler: null, vorschlagErgebnis: null, vorschlagPanel: true });
      try {
        const e = await schlageVorschlaegeVor(await leser(), transport(), get().kiEinstellungen(), { tiefencheck, oberflaeche: sprache() });
        const { ablage: neueAblage, neu, aktualisiert } = mischeVorschlaege(get().daten?.kiVorschlaege, e, { datum: e.datum, modell: e.modell });
        await get().speichereKiVorschlaege(neueAblage);
        const { figuren: _f, orte: _o, beziehungen: _b, ...rest } = e;
        void _f;
        void _o;
        void _b;
        set({ vorschlagErgebnis: { ...rest, neu, aktualisiert, tiefencheck, zeit: Date.now() }, vorschlagPanel: true });
      } catch (e) {
        set({ vorschlagFehler: kiFehlerAnzeige(e) });
      } finally {
        set({ vorschlagLaeuft: false });
      }
    },

    async vorschlagUebernehmen(art, schluessel) {
      if (art === 'figur') await figurenUebernehmen([schluessel]);
      else if (art === 'ort') await orteUebernehmen([schluessel]);
      else await beziehungenUebernehmen([schluessel]);
    },

    async vorschlagVerwerfen(art, schluessel) {
      await ablageAendern((a) => {
        const weg = <T extends { schluessel: string; status: string }>(v: T): T =>
          v.schluessel === schluessel && v.status === 'neu' ? { ...v, status: 'verworfen' } : v;
        if (art === 'figur') {
          return {
            ...a,
            figuren: a.figuren.map(weg),
            beziehungen: a.beziehungen.map((b) =>
              b.status === 'neu' && [b.von, b.zu].some((r) => r.typ === 'vorschlag' && r.id === schluessel) ? { ...b, status: 'verworfen' } : b,
            ),
          };
        }
        if (art === 'ort') return { ...a, orte: a.orte.map(weg) };
        return { ...a, beziehungen: a.beziehungen.map(weg) };
      });
    },

    async alleVorschlaegeUebernehmen() {
      const offen = offeneVorschlaege(ablage(), daten());
      const figuren = offen.figuren.length ? (await figurenUebernehmen(nachGewicht(offen.figuren.map((f) => f.schluessel)))).size : 0;
      const orte = offen.orte.length ? await orteUebernehmen(offen.orte.map((o) => o.schluessel)) : 0;
      const danach = offeneVorschlaege(ablage(), daten());
      const beziehungen = danach.beziehungen.length ? await beziehungenUebernehmen(danach.beziehungen.map((b) => b.schluessel)) : 0;
      return { figuren, orte, beziehungen };
    },
  };
};
