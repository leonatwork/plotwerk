/**
 * Slice „netz“: Beziehungsnetz (B-01–B-04) und Gruppen/Antagonisten (A-01, A-02). Besitzer: Netz & Hinweise.
 * Persistenz ausschließlich über get().speichereFigur / speichereGruppe.
 */
import type { StateCreator } from 'zustand';
import type { Beziehung, BeziehungsKategorie, Figur, Gruppe, GruppenTyp, Id, ProjektDaten, Spur } from '@core/model/types';
import { findeStelle, kapitelIndex } from '../../features/beziehungen/gemeinsam';
import { freiePosition, KARTE, paarSchluessel, STANDARD_FLAECHE } from '../../features/beziehungen/logik';
import { belegteFlaechen } from '../../features/beziehungen/vorschlagLogik';
import { f as fmt, texte } from '../../i18n';
import type { Store } from '../store';

export type NetzAuswahl =
  | { typ: 'figur'; id: Id }
  /** paar = paarSchluessel(a, b); eintrag = bearbeitete Bezeichnung (sonst die am Stand gültige) */
  | { typ: 'beziehung'; paar: string; eintrag?: { von: Id; index: number } }
  | { typ: 'gruppe'; id: Id };

export interface NetzSlice {
  /** Kapitel-ID des Zeitreglers; null = Ende des Buchs */
  netzStand: Id | null;
  netzFilter: Record<BeziehungsKategorie, boolean>;
  netzAuswahl: NetzAuswahl | null;
  /** „+ Beziehung“: Karten verbinden statt verschieben */
  netzVerbinden: boolean;
  setzeNetzStand(kapitel: Id | null): void;
  umschalteNetzFilter(k: BeziehungsKategorie): void;
  waehleImNetz(a: NetzAuswahl | null): void;
  setzeNetzVerbinden(an: boolean): void;

  /** Legt `von → zu` an (oder liefert die bestehende Beziehung des Paars). */
  beziehungAnlegen(von: Id, zu: Id, teil?: Partial<Beziehung>): Promise<{ von: Id; index: number } | null>;
  /** Weitere Bezeichnung desselben Paars ab einem späteren Kapitel (Zeitregler), übernimmt Kategorie/Strang. */
  bezeichnungHinzufuegen(von: Id, zu: Id, abKapitel: Id | undefined): Promise<{ von: Id; index: number }>;
  /** undefined-Werte im Teil entfernen das Feld. */
  beziehungAendern(von: Id, index: number, teil: Partial<Beziehung>): Promise<void>;
  beziehungEntfernen(von: Id, index: number): Promise<void>;
  figurImNetzSetzen(id: Id, pos: { x: number; y: number } | null): Promise<void>;
  gruppeImNetzSetzen(id: Id, netz: Gruppe['netz'] | null): Promise<void>;

  /**
   * Legt eine Gruppe an (Status „im Text“) und gibt ihr gleich eine Fläche im Netz: um die Karten der
   * Mitglieder, sonst an einer freien Stelle. Mitglieder wechseln aus ihrer bisherigen Gruppe.
   */
  gruppeAnlegen(name: string, teil?: { typ?: GruppenTyp; mitglieder?: Id[] }): Promise<Id>;
  /** undefined-Werte im Teil entfernen das Feld. */
  gruppeAendern(id: Id, teil: Partial<Gruppe>): Promise<void>;
  /** setzt auch figur.gruppe (eine Figur gehört zu höchstens einer Gruppe) */
  mitgliedHinzufuegen(gruppe: Id, figur: Id): Promise<void>;
  mitgliedEntfernen(gruppe: Id, figur: Id): Promise<void>;
  /** beim Bestätigen wird der Textanker der Spur gesetzt (E4) */
  spurStatusSetzen(gruppe: Id, spur: Id, status: Spur['status']): Promise<void>;
  spurHinzufuegen(gruppe: Id, spur: { text: string; kapitel: Id }): Promise<Spur | null>;
}

/** Abstand der Gruppenfläche um die Karten ihrer Mitglieder (oben Platz für die Beschriftung). */
const RAND = { seite: 20, oben: 34, unten: 20 } as const;

/**
 * Fläche einer neuen Gruppe und Positionen für Mitglieder ohne Platz im Netz: Liegen Mitglieder schon im Netz,
 * umschließt die Fläche ihre Karten; sonst kommt sie an eine freie Stelle innerhalb der bisherigen Netzbreite
 * und die Mitglieder untereinander hinein.
 */
export function gruppeImNetzPlanen(
  daten: ProjektDaten,
  mitglieder: Id[],
): { netz: NonNullable<Gruppe['netz']>; positionen: Record<Id, { x: number; y: number }> } {
  const karten = mitglieder.map((m) => daten.figuren[m]?.netz).filter((n): n is { x: number; y: number } => !!n);
  if (karten.length > 0) {
    const links = Math.min(...karten.map((k) => k.x));
    const oben = Math.min(...karten.map((k) => k.y));
    const rechts = Math.max(...karten.map((k) => k.x + KARTE.breite));
    const unten = Math.max(...karten.map((k) => k.y + KARTE.hoehe));
    const x = Math.max(0, links - RAND.seite);
    const y = Math.max(0, oben - RAND.oben);
    const netz = {
      x,
      y,
      breite: Math.max(STANDARD_FLAECHE.breite, rechts + RAND.seite - x),
      hoehe: Math.max(STANDARD_FLAECHE.hoehe, unten + RAND.unten - y),
    };
    return { netz, positionen: {} };
  }
  const ohne = mitglieder.filter((m) => daten.figuren[m]);
  const breite = Math.max(STANDARD_FLAECHE.breite, KARTE.breite + 2 * RAND.seite);
  const hoehe = Math.max(STANDARD_FLAECHE.hoehe, RAND.oben + ohne.length * (KARTE.hoehe + 12) - 12 + RAND.unten);
  const belegt = belegteFlaechen(daten);
  const netzBreite = Math.max(880, ...belegt.map((r) => r.x + r.breite));
  const pos = freiePosition(belegt, breite, hoehe, netzBreite);
  const positionen: Record<Id, { x: number; y: number }> = {};
  ohne.forEach((m, i) => (positionen[m] = { x: pos.x + RAND.seite, y: pos.y + RAND.oben + i * (KARTE.hoehe + 12) }));
  return { netz: { ...pos, breite, hoehe }, positionen };
}

function ohneUndefined<T extends object>(o: T): T {
  const kopie = { ...o };
  for (const k of Object.keys(kopie) as (keyof T)[]) if (kopie[k] === undefined) delete kopie[k];
  return kopie;
}

export const createNetzSlice: StateCreator<Store, [], [], NetzSlice> = (set, get) => {
  const daten = () => {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  };
  const figur = (id: Id): Figur => {
    const f = daten().figuren[id];
    if (!f) throw new Error(fmt(texte().state.fehler.figurFehlt, { id }));
    return f;
  };
  const gruppe = (id: Id): Gruppe => {
    const g = daten().gruppen[id];
    if (!g) throw new Error(fmt(texte().state.fehler.gruppeFehlt, { id }));
    return g;
  };

  return {
    netzStand: null,
    netzFilter: { arbeit: true, dates: true, sonstige: true },
    netzAuswahl: null,
    netzVerbinden: false,

    setzeNetzStand: (kapitel) => set({ netzStand: kapitel }),
    umschalteNetzFilter: (k) => set((s) => ({ netzFilter: { ...s.netzFilter, [k]: !s.netzFilter[k] } })),
    waehleImNetz(a) {
      set({ netzAuswahl: a });
      if (a?.typ === 'figur') get().waehle({ figur: a.id });
      if (a?.typ === 'gruppe') get().waehle({ gruppe: a.id });
    },
    setzeNetzVerbinden: (an) => set({ netzVerbinden: an }),

    async beziehungAnlegen(von, zu, teil) {
      if (von === zu) return null;
      const d = daten();
      const fv = figur(von);
      figur(zu);
      const vorhanden = fv.beziehungen.findIndex((b) => b.zu === zu);
      if (vorhanden >= 0) return { von, index: vorhanden };
      const rueck = d.figuren[zu]!.beziehungen.findIndex((b) => b.zu === von);
      if (rueck >= 0) return { von: zu, index: rueck };

      // Vorschläge aus vorhandenen Beziehungen und dem ersten Vorkommen beider Figuren
      const eigene = [...fv.beziehungen, ...d.figuren[zu]!.beziehungen];
      const index = get().index;
      const erst = [index.erstesVorkommen[von], index.erstesVorkommen[zu]];
      const abKapitel =
        erst[0] && erst[1] ? (kapitelIndex(d, erst[0]) >= kapitelIndex(d, erst[1]) ? erst[0] : erst[1]) : undefined;
      const neu: Beziehung = ohneUndefined({
        zu,
        art: '',
        abKapitel,
        kategorie: eigene[0]?.kategorie ?? 'sonstige',
        strang: eigene.find((b) => b.strang)?.strang,
        ...teil,
      });
      const beziehungen = [...fv.beziehungen, neu];
      await get().speichereFigur({ ...fv, beziehungen });
      return { von, index: beziehungen.length - 1 };
    },

    async bezeichnungHinzufuegen(von, zu, abKapitel) {
      const f = figur(von);
      const vorlage = [...f.beziehungen].reverse().find((b) => b.zu === zu);
      const neu: Beziehung = ohneUndefined({
        zu,
        art: '',
        abKapitel,
        kategorie: vorlage?.kategorie ?? 'sonstige',
        strang: vorlage?.strang,
        unsicher: vorlage?.unsicher,
      });
      const beziehungen = [...f.beziehungen, neu];
      await get().speichereFigur({ ...f, beziehungen });
      return { von, index: beziehungen.length - 1 };
    },

    async beziehungAendern(von, index, teil) {
      const f = figur(von);
      const alt = f.beziehungen[index];
      if (!alt) return;
      const beziehungen = f.beziehungen.map((b, i) => (i === index ? ohneUndefined({ ...b, ...teil }) : b));
      await get().speichereFigur({ ...f, beziehungen });
    },

    async beziehungEntfernen(von, index) {
      const f = figur(von);
      const b = f.beziehungen[index];
      if (!b) return;
      const auswahl = get().netzAuswahl;
      if (auswahl?.typ === 'beziehung') {
        const rest = Object.values(daten().figuren).some((x) =>
          x.beziehungen.some((y, i) => !(x.id === von && i === index) && paarSchluessel(x.id, y.zu) === auswahl.paar),
        );
        set({ netzAuswahl: rest ? { typ: 'beziehung', paar: auswahl.paar } : null });
      }
      await get().speichereFigur({ ...f, beziehungen: f.beziehungen.filter((_, i) => i !== index) });
    },

    async figurImNetzSetzen(id, pos) {
      const f = figur(id);
      if (pos) await get().speichereFigur({ ...f, netz: { x: Math.round(pos.x), y: Math.round(pos.y) } });
      else {
        const { netz: _weg, ...rest } = f;
        void _weg;
        await get().speichereFigur(rest);
      }
    },

    async gruppeImNetzSetzen(id, netz) {
      const g = gruppe(id);
      if (netz)
        await get().speichereGruppe({
          ...g,
          netz: {
            x: Math.round(netz.x),
            y: Math.round(netz.y),
            breite: Math.max(120, Math.round(netz.breite)),
            hoehe: Math.max(80, Math.round(netz.hoehe)),
          },
        });
      else {
        const { netz: _weg, ...rest } = g;
        void _weg;
        await get().speichereGruppe(rest);
      }
    },

    async gruppeAnlegen(name, teil = {}) {
      const d = daten();
      const id = get().neueId(name, [...Object.keys(d.gruppen), ...Object.keys(d.figuren)]);
      const mitglieder = (teil.mitglieder ?? []).filter((m) => d.figuren[m]);
      const g: Gruppe = {
        id,
        name: name.trim(),
        typ: teil.typ ?? 'sonstige',
        status: 'im_text',
        mitglieder: [],
        spuren: [],
        praesenz: {},
        notizen: '',
      };
      const { netz, positionen } = gruppeImNetzPlanen(d, mitglieder);
      g.netz = netz;
      await get().speichereGruppe(g);
      for (const [m, p] of Object.entries(positionen)) await get().figurImNetzSetzen(m, p);
      for (const m of mitglieder) await get().mitgliedHinzufuegen(id, m);
      return id;
    },

    async gruppeAendern(id, teil) {
      await get().speichereGruppe(ohneUndefined({ ...gruppe(id), ...teil }));
    },

    async mitgliedHinzufuegen(gid, fid) {
      const g = gruppe(gid);
      const f = figur(fid);
      const auftraege: Promise<void>[] = [];
      if (f.gruppe && f.gruppe !== gid) {
        const alt = daten().gruppen[f.gruppe];
        if (alt?.mitglieder.includes(fid))
          auftraege.push(get().speichereGruppe({ ...alt, mitglieder: alt.mitglieder.filter((m) => m !== fid) }));
      }
      if (!g.mitglieder.includes(fid)) auftraege.push(get().speichereGruppe({ ...g, mitglieder: [...g.mitglieder, fid] }));
      if (f.gruppe !== gid) auftraege.push(get().speichereFigur({ ...f, gruppe: gid }));
      await Promise.all(auftraege);
    },

    async mitgliedEntfernen(gid, fid) {
      const g = gruppe(gid);
      const f = daten().figuren[fid];
      await Promise.all([
        g.mitglieder.includes(fid)
          ? get().speichereGruppe({ ...g, mitglieder: g.mitglieder.filter((m) => m !== fid) })
          : undefined,
        f && f.gruppe === gid ? get().speichereFigur({ ...f, gruppe: null }) : undefined,
      ]);
    },

    async spurStatusSetzen(gid, sid, status) {
      const g = gruppe(gid);
      const d = daten();
      const spuren = g.spuren.map((s) => {
        if (s.id !== sid) return s;
        const anker = s.anker ?? (status === 'bestaetigt' ? findeStelle(d, s.kapitel, s.text)?.anker : undefined);
        return ohneUndefined({ ...s, status, anker });
      });
      await get().speichereGruppe({ ...g, spuren });
    },

    async spurHinzufuegen(gid, { text, kapitel }) {
      const g = gruppe(gid);
      const t = text.trim();
      if (!t || !kapitel) return null;
      const id = get().neueId(t, g.spuren.map((s) => s.id));
      const anker = findeStelle(daten(), kapitel, t)?.anker;
      const spur: Spur = ohneUndefined({ id, text: t, kapitel, anker, status: 'bestaetigt' as const });
      await get().speichereGruppe({ ...g, spuren: [...g.spuren, spur] });
      return spur;
    },
  };
};
