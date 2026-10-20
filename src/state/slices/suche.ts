/** Lokale Volltext-Aktionen; Persistenz über öffentliche Store-Aktionen, ohne KI. */
import type { StateCreator } from 'zustand';
import type { ProjektDaten } from '@core/model/types';
import { kapitelPfad } from '@core/projekt';
import { ersetzeTreffer, feldSetzen, projektFelder, sucheProjekt, type ProjektTreffer, type SuchFeld, type SuchOptionen } from '@core/suche';
import { texte, f } from '../../i18n';
import type { Store } from '../store';
interface UndoFeld { feld: SuchFeld; vorher: string; nachher: string }
export interface SucheSlice {
  volltext: {
    kapitelOffen: boolean; oeffneKapitel(offen: boolean): void; laeuft: boolean; kannUndo: boolean;
    ersetzen(suche: string, ersatz: string, optionen: SuchOptionen, umfang: { kapitel?: string; einzeln?: ProjektTreffer }): Promise<{ fehler: string[] }>;
    undo(): Promise<void>;
    editorErsetzungAbholen(kapitel: string, text: string): boolean;
  };
}
export const createSucheSlice: StateCreator<Store, [], [], SucheSlice> = (set, get, api) => {
  let undo: UndoFeld[] = [];
  let reserviert = false;
  const editorErsetzungen = new Map<string, string>();
  const setze = (teil: Partial<SucheSlice['volltext']>) => set(s => ({ volltext: { ...s.volltext, ...teil } }));
  api.subscribe((s, vorher) => {
    if (s.fs !== vorher.fs || (s.ladeStatus === 'bereit' && vorher.ladeStatus !== 'bereit')) {
      undo = []; editorErsetzungen.clear(); setze({ kannUndo: false, kapitelOffen: false });
    }
  });
  async function speichern(d: ProjektDaten, feld: SuchFeld): Promise<void> {
    const s = get(), [root, id] = feld.pfad;
    switch (root) {
      case 'kapitel': return s.kapitelTextSpeichern(String(id), d.kapitel[String(id)]!.text);
      case 'plaene': return s.speicherePlan(d.plaene[String(id)]!);
      case 'figuren': return s.speichereFigur(d.figuren[String(id)]!);
      case 'orte': return s.speichereOrt(d.orte[String(id)]!);
      case 'gruppen': return s.speichereGruppe(d.gruppen[String(id)]!);
      case 'projekt': return s.speichereProjekt(d.projekt);
      case 'akte': return s.speichereAkte(d.akte);
      case 'straenge': return s.speichereStraenge(d.straenge);
      case 'ideen': return s.speichereIdeen(d.ideen);
      case 'motive': return s.speichereMotive(d.motive ?? []);
      case 'zeitleiste': return s.speichereZeitleiste(d.zeitleiste!);
      case 'fadenplanung': return s.speichereFadenplanung(d.fadenplanung!);
      case 'boegen': return s.speichereBoegen(d.boegen ?? []);
      case 'marken': return s.speichereMarken(d.marken!);
      case 'anmerkungen': return s.speichereAnmerkungen(d.anmerkungen);
      case 'recherche': return s.speichereRecherche(d.recherche!);
      case 'entscheidungen': return s.speichereEntscheidungen(d.entscheidungen);
    }
  }
  return { volltext: {
    kapitelOffen: false, laeuft: false, kannUndo: false,
    oeffneKapitel: kapitelOffen => setze({ kapitelOffen }),
    editorErsetzungAbholen(kapitel, text) {
      if (editorErsetzungen.get(kapitel) !== text) return false;
      editorErsetzungen.delete(kapitel);
      return true;
    },
    async ersetzen(suche, ersatz, optionen, umfang) {
      if (reserviert || get().volltext.laeuft) return { fehler: [] };
      reserviert = true;
      try {
        await get().editorSichern();
        await get().alleSpeichernAbwarten();
        const basis = get().daten, fs = get().fs;
        if (!basis) return { fehler: [] };
        const alle = sucheProjekt(basis, suche, optionen).filter(t => !umfang.kapitel || (t.feld.bereich === 'manuskript' && t.feld.kapitel === umfang.kapitel));
        const treffer = umfang.einzeln ? alle.filter(t => JSON.stringify(t.feld.pfad) === JSON.stringify(umfang.einzeln!.feld.pfad) && t.start === umfang.einzeln!.start && t.feld.text === umfang.einzeln!.feld.text) : alle;
        if (!treffer.length) return { fehler: [] };
        const gruppen = new Map<string, ProjektTreffer[]>();
        for (const t of treffer) { const key = JSON.stringify(t.feld.pfad); gruppen.set(key, [...(gruppen.get(key) ?? []), t]); }
        const fehler: string[] = [];
        undo = []; setze({ laeuft: true, kannUndo: false });
        try {
          for (const liste of gruppen.values()) {
            const feld = liste[0]!.feld;
            const nachher = ersetzeTreffer(feld.text, liste, ersatz, feld.markdown);
            if (nachher === feld.text) continue;
            try {
              if (get().fs !== fs || !get().daten) break;
              if (feld.bereich === 'manuskript') {
                const version = await get().schnappschuss(kapitelPfad(feld.kapitel!), 'ersetzen');
                if (!version) throw new Error(texte().suche.sicherungFehlt);
                editorErsetzungen.set(feld.kapitel!, nachher);
              }
              if (get().fs !== fs || !get().daten) break;
              const aktuellesFeld = projektFelder(get().daten!).find(x => JSON.stringify(x.pfad) === JSON.stringify(feld.pfad));
              if (aktuellesFeld?.text !== feld.text) throw new Error(texte().suche.feldGeaendert);
              // Store-Persistenz aktualisiert optimistisch. Auch ein fehlgeschlagener Schreibversuch
              // behält daher das Sicherheitsnetz für die Änderung im Speicher.
              if (feld.bereich !== 'manuskript') undo.push({ feld, vorher: feld.text, nachher });
              await speichern(feldSetzen(get().daten!, feld.pfad, nachher), feld);
            } catch (e) { fehler.push(f(texte().suche.fehler, { titel: feld.titel, grund: e instanceof Error ? e.message : String(e) })); }
          }
          await get().statistik.sichern();
        } finally { setze({ laeuft: false, kannUndo: undo.length > 0 }); }
        return { fehler };
      } finally { reserviert = false; }
    },
    async undo() {
      if (!undo.length || get().volltext.laeuft || !get().daten) return;
      const aktuell = projektFelder(get().daten!);
      if (undo.some(u => !aktuell.some(x => JSON.stringify(x.pfad) === JSON.stringify(u.feld.pfad) && x.text === u.nachher))) throw new Error(texte().suche.undoKonflikt);
      setze({ laeuft: true });
      try {
        for (const u of [...undo].reverse()) await speichern(feldSetzen(get().daten!, u.feld.pfad, u.vorher), u.feld);
        undo = []; setze({ kannUndo: false });
      } finally { setze({ laeuft: false }); }
    },
  } };
};
