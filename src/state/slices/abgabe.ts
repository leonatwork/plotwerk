/**
 * Slice „abgabe“ (G7 Abgabe: Normseite, Exposé, EPUB, Lektoratsmappe, Rückimport). Besitzer: G7. Zustand im Store unter `abgabe` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki – G7 nutzt keine KI.
 *
 * Exporte laufen über backend.dateiSpeichern (wie der normale Export). Der Rückimport legt Word-Kommentare als
 * Anmerkungen und nachverfolgte Änderungen als offene Vorschläge (lektorat/aenderungen.json) an. Annehmen ändert
 * den Kapiteltext erst auf Leons Klick, über die normale Speicherung und mit Schnappschuss davor (E8).
 */
import type { StateCreator } from 'zustand';
import type { ExposeKapitelQuelle, PersonenOptionen } from '@core/abgabe/index';
import type { Rueckimport } from '@core/docx/rueckimport';
import type { Id, Kapitel, LektoratsAenderung, ProjektAngaben } from '@core/model/types';
import { buchSprache } from '@core/i18n';
import { kapitelPfad } from '@core/projekt';
import { sprache, texte } from '../../i18n';
import type { Store } from '../store';

export type AbgabeFormat = 'normseite' | 'expose' | 'epub' | 'mappe' | 'personen';
export type ExposeDateiformat = 'docx' | 'md';

export interface AbgabeEinstellungen {
  format: AbgabeFormat;
  /** Normseite/EPUB: ganzes Buch oder Auswahl */
  umfang: 'buch' | 'auswahl';
  auswahl: Id[];
  titelseite: boolean;
  exposeKapitel: ExposeKapitelQuelle;
  exposeFormat: ExposeDateiformat;
  exposeNebenfiguren: boolean;
  /** EPUB: Newsreader einbetten */
  epubSchrift: boolean;
  /** Lektoratsmappe: Kapitel; null = ganzes Buch */
  mappeKapitel: Id | null;
  /** Personenverzeichnis (eigene Datei und Vorspann) */
  personen: PersonenOptionen;
  personenFormat: ExposeDateiformat;
  /** Normseite/EPUB: Personenverzeichnis als Vorspann */
  personenVorspann: boolean;
}

export type AbgabeAuftrag =
  | { format: 'normseite'; kapitel: Id[]; titelseite: boolean; personen?: PersonenOptionen }
  | { format: 'expose'; ziel: ExposeDateiformat; kapitel: ExposeKapitelQuelle; nebenfiguren: boolean }
  | { format: 'epub'; kapitel: Id[]; titelseite: boolean; schrift: boolean; personen?: PersonenOptionen }
  | { format: 'mappe'; kapitel: Id | null }
  | { format: 'personen'; ziel: ExposeDateiformat; optionen: PersonenOptionen };

export interface RueckimportOptionen {
  /** Dateiname der .docx */
  quelle: string;
  kommentare: boolean;
  aenderungen: boolean;
}

export interface RueckimportBericht {
  anmerkungen: number;
  aenderungen: number;
  /** Kommentare an Kapiteln ohne Stelle → Plan-Notiz, vor dem ersten Kapitel → Projekt-Notiz */
  notizen: number;
  nichtGefunden: number;
  doppelt: number;
}

export type LektoratEntscheidung = LektoratsAenderung['status'];
export type EntscheidungsErgebnis = { ok: true } | { ok: false; grund: string };

export interface Abgabe {
  einstellungen: AbgabeEinstellungen;
  setzeEinstellungen(teil: Partial<AbgabeEinstellungen>): void;
  /** Angaben zum Buch (projekt.md `angaben`) – für Titelseite, Kopfzeile, EPUB-Metadaten, Exposé */
  angabenSpeichern(angaben: ProjektAngaben): Promise<void>;
  /** Erzeugt die Datei, ohne sie zu speichern. */
  erstellen(auftrag: AbgabeAuftrag): Promise<Uint8Array>;
  /** Erzeugt die Datei und speichert sie über backend.dateiSpeichern; false = abgebrochen. */
  exportieren(auftrag: AbgabeAuftrag, dateiname: string): Promise<boolean>;
  /** Kommentare → Anmerkungen, Änderungen → offene Vorschläge; `zuordnung[i]` = Projektkapitel des i-ten Word-Kapitels. */
  rueckimportUebernehmen(r: Rueckimport, zuordnung: (Id | null)[], optionen: RueckimportOptionen): Promise<RueckimportBericht>;
  /** Annehmen ändert den Kapiteltext (Schnappschuss vorher); Ablehnen/„offen“ ändern nur den Status. */
  lektoratEntscheiden(id: Id, entscheidung: LektoratEntscheidung): Promise<EntscheidungsErgebnis>;
}

export interface AbgabeSlice {
  abgabe: Abgabe;
}

const ENDUNG: Record<AbgabeFormat, string> = { normseite: 'docx', expose: 'docx', epub: 'epub', mappe: 'pdf', personen: 'docx' };
/** Formate mit wählbarer Endung (.docx oder .md) */
const MIT_DATEIFORMAT: AbgabeFormat[] = ['expose', 'personen'];
/** Zusatz im Dateinamen je Format (Sprache der Oberfläche). */
function zusatz(format: AbgabeFormat): string {
  return format === 'epub' ? '' : texte().state.abgabe.zusatz[format];
}

/** Dateiname-Vorschlag, z. B. „Hafenlichter (Normseiten).docx“. */
export function abgabeDateiname(titel: string, format: AbgabeFormat, exposeFormat: ExposeDateiformat = 'docx'): string {
  const basis =
    titel.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || texte().state.standard.manuskript;
  const endung = MIT_DATEIFORMAT.includes(format) ? exposeFormat : ENDUNG[format];
  return `${basis}${zusatz(format)}.${endung}`;
}

/** Endung des Dateinamens an das Format anpassen. */
export function mitAbgabeEndung(name: string, format: AbgabeFormat, exposeFormat: ExposeDateiformat = 'docx'): string {
  const endung = MIT_DATEIFORMAT.includes(format) ? exposeFormat : ENDUNG[format];
  const basis = name.trim().replace(/\.(docx|pdf|epub|md)$/i, '');
  return `${basis || texte().state.standard.manuskript}.${endung}`;
}

export const createAbgabeSlice: StateCreator<Store, [], [], AbgabeSlice> = (set, get) => {
  const setze = (teil: Partial<Abgabe>) => set((s) => ({ abgabe: { ...s.abgabe, ...teil } }));

  const daten = () => {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  };

  /** Personenverzeichnis als Vorspann-Kapitel (Buchsprache) */
  const vorspann = async (optionen: PersonenOptionen | undefined): Promise<Kapitel[]> => {
    if (!optionen) return [];
    const { personenverzeichnis, personenKapitel } = await import('@core/abgabe/index');
    get().indexNeuBerechnen();
    return [personenKapitel(personenverzeichnis(daten(), get().index.erstesVorkommen, optionen, buchSprache(daten().projekt.angaben)))];
  };

  /** Kapitel in Projektreihenfolge (fehlende Manuskripte als leere Kapitel). */
  const kapitelListe = (ids: Id[]): Kapitel[] => {
    const d = daten();
    const gewaehlt = new Set(ids);
    return d.projekt.kapitel.filter((id) => gewaehlt.has(id)).map((id) => d.kapitel[id] ?? { id, titel: d.plaene[id]?.titel ?? id, text: '' });
  };

  return {
    abgabe: {
      einstellungen: {
        format: 'normseite',
        umfang: 'buch',
        auswahl: [],
        titelseite: true,
        exposeKapitel: 'platzhalter',
        exposeFormat: 'docx',
        exposeNebenfiguren: true,
        epubSchrift: true,
        mappeKapitel: null,
        personen: { gliederung: 'gruppen', statisten: false, spitznamen: true },
        personenFormat: 'docx',
        personenVorspann: false,
      },

      setzeEinstellungen: (teil) => setze({ einstellungen: { ...get().abgabe.einstellungen, ...teil } }),

      async angabenSpeichern(angaben) {
        const projekt = daten().projekt;
        const sauber: ProjektAngaben = {};
        for (const k of ['autor', 'untertitel', 'genre', 'sprache'] as const) {
          const v = angaben[k]?.trim();
          if (v) sauber[k] = v;
        }
        if (angaben.anfuehrung) sauber.anfuehrung = angaben.anfuehrung;
        const alt = projekt.angaben ?? {};
        const gleich = JSON.stringify(Object.entries(alt).sort()) === JSON.stringify(Object.entries(sauber).sort());
        if (gleich) return;
        const { angaben: _weg, ...rest } = projekt;
        void _weg;
        await get().speichereProjekt(Object.keys(sauber).length ? { ...rest, angaben: sauber } : rest);
      },

      async erstellen(auftrag) {
        await get().editorSichern();
        const d = daten();
        const titel = d.projekt.titel;
        const angaben = d.projekt.angaben;
        switch (auftrag.format) {
          case 'normseite': {
            const { exportiereNormseite } = await import('@core/abgabe/index');
            return exportiereNormseite([...(await vorspann(auftrag.personen)), ...kapitelListe(auftrag.kapitel)], titel, { angaben, titelseite: auftrag.titelseite });
          }
          case 'expose': {
            const { exposeGeruest, exposeDocx, exposeMarkdown } = await import('@core/abgabe/index');
            const geruest = exposeGeruest(d, { kapitel: auftrag.kapitel, nebenfiguren: auftrag.nebenfiguren });
            if (auftrag.ziel === 'md') return new TextEncoder().encode(exposeMarkdown(geruest, buchSprache(angaben)));
            return exposeDocx(geruest, { autor: angaben?.autor, sprache: buchSprache(angaben) });
          }
          case 'epub': {
            const [{ exportiereEpub }, { ladePdfSchriften }] = await Promise.all([import('@core/epub/index'), import('../../features/importexport/pdfSchriften')]);
            let schrift = null;
            if (auftrag.schrift) {
              const s = (await ladePdfSchriften())[0]!;
              schrift = { name: s.name, normal: s.normal, kursiv: s.kursiv, fett: s.fett, fettKursiv: s.fettKursiv };
            }
            return exportiereEpub([...(await vorspann(auftrag.personen)), ...kapitelListe(auftrag.kapitel)], titel, { angaben, schrift, titelseite: auftrag.titelseite });
          }
          case 'mappe': {
            const [{ lektoratsmappe, exportiereLektoratsmappe }, { ladePdfSchriften }] = await Promise.all([
              import('@core/abgabe/index'),
              import('../../features/importexport/pdfSchriften'),
            ]);
            get().indexNeuBerechnen();
            const mappe = lektoratsmappe(daten(), get().index.hinweise, { kapitel: auftrag.kapitel });
            return exportiereLektoratsmappe(mappe, await ladePdfSchriften());
          }
          case 'personen': {
            const { personenverzeichnis, exposeDocx, exposeMarkdown } = await import('@core/abgabe/index');
            get().indexNeuBerechnen();
            const sprache = buchSprache(angaben);
            const bloecke = personenverzeichnis(daten(), get().index.erstesVorkommen, auftrag.optionen, sprache);
            if (auftrag.ziel === 'md') return new TextEncoder().encode(exposeMarkdown(bloecke, sprache));
            return exposeDocx(bloecke, { autor: angaben?.autor, sprache });
          }
        }
      },

      async exportieren(auftrag, dateiname) {
        const backend = get().backend;
        if (!backend) throw new Error(texte().state.fehler.keinBackend);
        const datei = await get().abgabe.erstellen(auftrag);
        return backend.dateiSpeichern(dateiname, datei);
      },

      async rueckimportUebernehmen(r, zuordnung, optionen) {
        const { rueckimportUebernahme } = await import('@core/docx/rueckimport');
        await get().editorSichern();
        await get().alleSpeichernAbwarten();
        const d = daten();
        const quelle = optionen.kommentare ? r : { ...r, kommentare: [] };
        const u = rueckimportUebernahme(quelle, zuordnung, {
          kapitel: d.kapitel,
          vorhandeneAnmerkungen: d.anmerkungen,
          vorhandeneAenderungen: d.lektorat ?? [],
          neueId: get().neueId,
          jetzt: new Date().toISOString(),
          quelle: optionen.quelle,
        });
        const aenderungen = optionen.aenderungen ? u.aenderungen : [];
        const auftraege: Promise<void>[] = [];
        if (u.anmerkungen.length) auftraege.push(get().speichereAnmerkungen([...d.anmerkungen, ...u.anmerkungen]));
        if (aenderungen.length) auftraege.push(get().speichereLektorat([...(d.lektorat ?? []), ...aenderungen]));
        let notizen = 0;
        for (const [id, text] of Object.entries(u.planNotizen)) {
          const plan = get().daten?.plaene[id];
          if (!plan || !text.trim()) continue;
          notizen++;
          auftraege.push(get().speicherePlan({ ...plan, notiz: [plan.notiz, text].filter((t) => t.trim()).join('\n\n') }));
        }
        await Promise.all(auftraege);
        const projekt = get().daten?.projekt;
        if (u.projektNotiz.trim() && projekt) {
          notizen++;
          await get().speichereProjekt({ ...projekt, notiz: [projekt.notiz, u.projektNotiz].filter((t) => t.trim()).join('\n\n') });
        }
        return {
          anmerkungen: u.anmerkungen.length,
          aenderungen: aenderungen.length,
          notizen,
          nichtGefunden: u.nichtGefunden,
          doppelt: u.doppelt,
        };
      },

      async lektoratEntscheiden(id, entscheidung) {
        const liste = daten().lektorat ?? [];
        const a = liste.find((x) => x.id === id);
        const t = texte().state.abgabe;
        if (!a) return { ok: false, grund: t.aenderungFehlt };
        if (a.status === entscheidung) return { ok: true };
        if (a.status === 'angenommen') return { ok: false, grund: t.schonImText };
        if (entscheidung === 'angenommen') {
          const { wendeAenderungAn } = await import('@core/abgabe/index');
          await get().editorSichern();
          await get().alleSpeichernAbwarten();
          const kapitel = get().daten?.kapitel[a.anker.kapitel];
          if (!kapitel) return { ok: false, grund: t.kapitelFehlt };
          const ergebnis = wendeAenderungAn(kapitel.text, a, sprache());
          if (!ergebnis.ok) return ergebnis;
          await get().schnappschuss(kapitelPfad(kapitel.id), 'wiederherstellen');
          await get().kapitelTextSpeichern(kapitel.id, ergebnis.text);
        }
        const aktuell = get().daten?.lektorat ?? [];
        await get().speichereLektorat(aktuell.map((x) => (x.id === id ? { ...x, status: entscheidung } : x)));
        return { ok: true };
      },
    },
  };
};
