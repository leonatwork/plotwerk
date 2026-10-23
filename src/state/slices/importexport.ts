/** Slice „importexport“ (S-11, S-12). Besitzer: Import/Export. Persistenz über get().speichereX. */
import type { StateCreator } from 'zustand';
import { kommentareAlsAnmerkungen, type ImportErgebnis } from '@core/docx/index';
import type { Id, Kapitel, KapitelPlan } from '@core/model/types';
import { standardPlan } from '@core/projekt';
import { klartext } from '@core/text/index';
import { buchSprache } from '@core/i18n';
import { texte } from '../../i18n';
import type { Store } from '../store';

export type ExportFormat = 'docx' | 'pdf';

export interface ExportEinstellungen {
  format: ExportFormat;
  umfang: 'buch' | 'auswahl';
  /** gewählte Kapitel bei umfang „auswahl“ */
  auswahl: Id[];
  /** Kapitel ohne Text (nur geplant) weglassen */
  ohneLeere: boolean;
  /** Schrift im Word-Dokument */
  schrift: string;
  titelseite: boolean;
}

export interface ExportAuftrag {
  format: ExportFormat;
  /** Kapitel-IDs; Reihenfolge wie im Projekt */
  kapitel: Id[];
  dateiname: string;
  schrift?: string;
  titelseite?: boolean;
}

export interface ImportUebernahme {
  /** in das geöffnete Projekt (leer oder anhängen) oder in ein neues Projekt */
  ziel: 'aktuell' | 'neu';
  /** Titel des neuen Projekts */
  projektTitel?: string;
  /** Text vor der ersten Überschrift als eigenes Kapitel vorn einfügen */
  vorspannAlsKapitel?: boolean;
  vorspannTitel?: string;
  /** Word-Kommentare als Anmerkungen übernehmen (Standard: ja) */
  kommentare?: boolean;
}

export interface ImportBericht {
  /** IDs der angelegten Kapitel in Reihenfolge */
  ids: Id[];
  /** davon ohne Text (als geplant angelegt) */
  geplant: number;
  /** aus Word-Kommentaren angelegte Anmerkungen */
  anmerkungen: number;
}

export interface ImportExportSlice {
  exportEinstellungen: ExportEinstellungen;
  setzeExportEinstellungen(teil: Partial<ExportEinstellungen>): void;
  /** Legt Manuskripte und Pläne für die importierten Kapitel an (leere Kapitel: Status geplant). */
  importUebernehmen(ergebnis: ImportErgebnis, optionen: ImportUebernahme): Promise<ImportBericht>;
  /** Erzeugt die Datei, ohne sie zu speichern. */
  exportErstellen(auftrag: Omit<ExportAuftrag, 'dateiname'>): Promise<Uint8Array>;
  /** Erzeugt die Datei und speichert sie über backend.dateiSpeichern; false = abgebrochen. */
  exportieren(auftrag: ExportAuftrag): Promise<boolean>;
}

/** „<Titel>.docx“ ohne Zeichen, die macOS/Windows in Dateinamen nicht mögen. */
export function exportDateiname(titel: string, format: ExportFormat): string {
  const basis =
    titel.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || texte().state.standard.manuskript;
  return `${basis}.${format}`;
}

export class ImportAbgebrochen extends Error {
  constructor() {
    super(texte().state.importexport.keinNeuesProjekt);
  }
}

export const createImportExportSlice: StateCreator<Store, [], [], ImportExportSlice> = (set, get) => ({
  exportEinstellungen: { format: 'docx', umfang: 'buch', auswahl: [], ohneLeere: true, schrift: 'Newsreader', titelseite: true },

  setzeExportEinstellungen: (teil) => set((s) => ({ exportEinstellungen: { ...s.exportEinstellungen, ...teil } })),

  async importUebernehmen(ergebnis, optionen) {
    if (optionen.ziel === 'neu') {
      const vorher = get().fs;
      await get().neuesProjekt(optionen.projektTitel?.trim() || ergebnis.buchtitel || texte().state.standard.projekt);
      if (get().fs === vorher || get().ladeStatus !== 'bereit') throw new ImportAbgebrochen();
    }
    const daten = get().daten;
    if (!daten) throw new Error(texte().state.fehler.keinProjekt);

    const liste: { titel: string; text: string }[] = [];
    const mitVorspann = !!(optionen.vorspannAlsKapitel && klartext(ergebnis.vorspann).trim());
    if (mitVorspann) liste.push({ titel: optionen.vorspannTitel?.trim() || texte().state.standard.vorspann, text: ergebnis.vorspann });
    liste.push(...ergebnis.kapitel);

    const vergeben = new Set<string>([...daten.projekt.kapitel, ...Object.keys(daten.kapitel), ...Object.keys(daten.plaene)]);
    const ids: Id[] = [];
    for (const k of liste) {
      const id = get().neueId(k.titel, [...vergeben]);
      vergeben.add(id);
      ids.push(id);
    }

    const kommentare = optionen.kommentare === false ? [] : (ergebnis.kommentare ?? []);
    const uebernahme = kommentareAlsAnmerkungen(
      kommentare,
      ids.slice(mitVorspann ? 1 : 0),
      mitVorspann ? ids[0]! : null,
      daten.anmerkungen.map((a) => a.id),
      get().neueId,
      new Date().toISOString(),
    );

    const auftraege: Promise<void>[] = [];
    let geplant = 0;
    liste.forEach((k, i) => {
      const id = ids[i]!;
      const kapitel: Kapitel = { id, titel: k.titel, text: k.text, ...(ergebnis.textUnveraendert ? { textUnveraendert: true } : {}) };
      const leer = klartext(k.text).trim() === '';
      const basis = standardPlan(kapitel);
      const notiz = [basis.notiz, uebernahme.planNotizen[id]].filter((t) => t?.trim()).join('\n\n');
      const plan: KapitelPlan = { ...basis, notiz, status: leer ? 'geplant' : 'geschrieben' };
      // Reihenfolge der Aufrufe = Reihenfolge in projekt.kapitel (der Zustand ändert sich synchron)
      if (leer) {
        geplant++;
        auftraege.push(get().speicherePlan(plan));
      } else {
        auftraege.push(get().speichereKapitel(kapitel));
        auftraege.push(get().speicherePlan(plan));
      }
    });
    await Promise.all(auftraege);

    if (uebernahme.anmerkungen.length) await get().speichereAnmerkungen([...(get().daten?.anmerkungen ?? []), ...uebernahme.anmerkungen]);
    const projekt = get().daten?.projekt;
    if (uebernahme.projektNotiz && projekt)
      await get().speichereProjekt({ ...projekt, notiz: [projekt.notiz, uebernahme.projektNotiz].filter((t) => t.trim()).join('\n\n') });
    return { ids, geplant, anmerkungen: uebernahme.anmerkungen.length };
  },

  async exportErstellen(auftrag) {
    await get().editorSichern();
    const daten = get().daten;
    if (!daten) throw new Error(texte().state.fehler.keinProjekt);
    const gewaehlt = new Set(auftrag.kapitel);
    const kapitel = daten.projekt.kapitel
      .filter((id) => gewaehlt.has(id))
      .map((id) => daten.kapitel[id] ?? { id, titel: daten.plaene[id]?.titel ?? id, text: '' });
    const titel = daten.projekt.titel;
    if (auftrag.format === 'docx') {
      const { exportiereDocxMit } = await import('@core/docx/index');
      return exportiereDocxMit(kapitel, titel, { schrift: auftrag.schrift, titelseite: auftrag.titelseite, sprache: buchSprache(daten.projekt.angaben) });
    }
    const [{ exportierePdfMit }, { ladePdfSchriften }] = await Promise.all([
      import('@core/pdf/index'),
      import('../../features/importexport/pdfSchriften'),
    ]);
    return exportierePdfMit(kapitel, titel, { schriften: await ladePdfSchriften(), titelseite: auftrag.titelseite, sprache: buchSprache(daten.projekt.angaben) });
  },

  async exportieren(auftrag) {
    const backend = get().backend;
    if (!backend) throw new Error(texte().state.fehler.keinBackend);
    const datei = await get().exportErstellen(auftrag);
    return backend.dateiSpeichern(auftrag.dateiname, datei);
  },
});
