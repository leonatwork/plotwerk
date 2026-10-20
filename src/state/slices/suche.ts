/** Benutzerinitiierte, rein lokale Ersetzung. Persistenz über die Store-APIs. */
import type { StateCreator } from 'zustand';
import type { ProjektDaten } from '@core/model/types';
import { kapitelPfad } from '@core/projekt';
import { ersetzeTreffer, feldWert, setzeFeld, sucheProjekt, type ProjektTreffer, type SuchOptionen } from '@core/suche';
import { f, texte } from '../../i18n';
import type { Store } from '../store';

export interface SuchUmfang { kapitel?: string; einzeln?: ProjektTreffer; erwartet?: ProjektTreffer[] }
export interface ErsetzErgebnis { anzahl: number; fehler: string[] }
interface UndoFeld { pfad: string[]; vorher: string; nachher: string }
export interface SucheSlice {
  suche: {
    kapitelOffen: boolean; setzeKapitelOffen(offen: boolean): void;
    laeuft: boolean; kannUndo: boolean;
    ersetzen(suche: string, ersatz: string, optionen: SuchOptionen, umfang: SuchUmfang): Promise<ErsetzErgebnis>;
    undo(): Promise<void>;
  };
}

export const createSucheSlice: StateCreator<Store, [], [], SucheSlice> = (set, get, api) => {
  let undo: UndoFeld[] = [];
  const setze = (teil: Partial<Store['suche']>) => set(s => ({suche: {...s.suche,...teil}}));
  api.subscribe((s, vorher) => {
    if (s.fs !== vorher.fs) { undo = []; setze({kannUndo: false, kapitelOffen: false}); }
  });
  async function speichern(neu: ProjektDaten, felder: UndoFeld[]) {
    const pfad = felder[0]!.pfad;
    const s = get(); const key = pfad[0]; const id = pfad[1]!;
    switch (key) {
      case 'kapitel': return s.speichereKapitel(neu.kapitel[id]!);
      case 'plaene':
        await s.speicherePlan(neu.plaene[id]!);
        if (felder.some(x => x.pfad[0] === 'kapitel')) await s.speichereKapitel(neu.kapitel[id]!);
        return;
      case 'figuren': return s.speichereFigur(neu.figuren[id]!);
      case 'orte': return s.speichereOrt(neu.orte[id]!);
      case 'gruppen': return s.speichereGruppe(neu.gruppen[id]!);
      case 'projekt': return s.speichereProjekt(neu.projekt);
      case 'akte': return s.speichereAkte(neu.akte);
      case 'straenge': return s.speichereStraenge(neu.straenge);
      case 'ideen': return s.speichereIdeen(neu.ideen);
      case 'motive': return s.speichereMotive(neu.motive!);
      case 'anmerkungen': return s.speichereAnmerkungen(neu.anmerkungen);
      case 'zeitleiste': return s.speichereZeitleiste(neu.zeitleiste!);
      case 'fadenplanung': return s.speichereFadenplanung(neu.fadenplanung!);
      case 'boegen': return s.speichereBoegen(neu.boegen!);
      case 'marken': return s.speichereMarken(neu.marken!);
      case 'recherche': return s.speichereRecherche(neu.recherche!);
      case 'fassungen': return s.speichereFassungen(neu.fassungen!);
      case 'entscheidungen': return s.speichereEntscheidungen(neu.entscheidungen);
    }
  }
  const gruppen = (felder: UndoFeld[]) => {
    const map = new Map<string, UndoFeld[]>();
    for (const feld of felder) {
      // Der Manuskripttitel ist die synchronisierte Kopie des Plan-Titels, Teil derselben Undo-Gruppe.
      const key = feld.pfad[0] === 'kapitel' && feld.pfad[2] === 'titel' ? `plaene/${feld.pfad[1]}`
        : ['kapitel','plaene','figuren','orte','gruppen'].includes(feld.pfad[0]!) ? feld.pfad.slice(0,2).join('/') : feld.pfad[0]!;
      map.set(key,[...(map.get(key) ?? []),feld]);
    }
    return [...map.values()];
  };
  return {suche: {
    kapitelOffen: false, setzeKapitelOffen: kapitelOffen => setze({kapitelOffen}),
    laeuft: false, kannUndo: false,
    async ersetzen(suche, ersatz, optionen, umfang) {
      if (get().suche.laeuft) throw new Error(texte().suche.konflikt);
      setze({laeuft: true});
      const ergebnis: ErsetzErgebnis = {anzahl: 0, fehler: []};
      try {
        await get().editorSichern(); await get().alleSpeichernAbwarten();
        const fs = get().fs; const d = get().daten;
        if (!d || !fs) return ergebnis;
        let treffer = sucheProjekt(d,suche,optionen);
        if (umfang.erwartet) {
          if (umfang.erwartet.some(t => feldWert(d,t.feld.pfad) !== t.feld.text)) throw new Error(texte().suche.konflikt);
          const erlaubt = new Set(umfang.erwartet.map(t => `${t.feld.pfad.join('/')}@${t.start}`));
          treffer = treffer.filter(t => erlaubt.has(`${t.feld.pfad.join('/')}@${t.start}`));
        }
        if (umfang.kapitel) treffer = treffer.filter(t => t.feld.bereich === 'manuskript' && t.feld.kapitel === umfang.kapitel);
        if (umfang.einzeln) {
          const e = umfang.einzeln;
          if (feldWert(d,e.feld.pfad) !== e.feld.text) throw new Error(texte().suche.konflikt);
          treffer = treffer.filter(t => t.feld.pfad.join('/') === e.feld.pfad.join('/') && t.start === e.start).slice(0,1);
        }
        const aenderungen: UndoFeld[] = []; const anzahl = new Map<string,number>();
        for (const t of treffer) {
          const key = t.feld.pfad.join('/'); if (anzahl.has(key)) continue;
          const alle = treffer.filter(x => x.feld.pfad.join('/') === key);
          let nachher: string;
          try { nachher = ersetzeTreffer(t.feld.text,alle,ersatz,t.feld.markdown); }
          catch { throw new Error(texte().suche.verweis); }
          if (nachher !== t.feld.text) { aenderungen.push({pfad:t.feld.pfad,vorher:t.feld.text,nachher}); anzahl.set(key,alle.length); }
        }
        // Gleiche Titelsynchronisierung wie kapitelPlanAendern; nicht als zweiten Treffer zählen.
        for (const x of [...aenderungen]) {
          const [art,id,feld] = x.pfad;
          const k = d.kapitel[id!]; const plan = d.plaene[id!];
          if (art === 'plaene' && feld === 'titel' && k && k.titel !== x.nachher && (plan!.status !== 'geplant' || k.text.trim()))
            aenderungen.push({pfad:['kapitel',id!,'titel'],vorher:k.titel,nachher:x.nachher});
        }
        // Vorprüfung aller Felder; keine halbe Aktion wegen ungültiger Verweissyntax.
        const neuUndo: UndoFeld[] = [];
        for (const gruppe of gruppen(aenderungen)) {
          const p = gruppe[0]!.pfad; const id = p[1]!;
          try {
            if (get().fs !== fs || gruppe.some(x => feldWert(get().daten!,x.pfad) !== x.vorher)) throw new Error(texte().suche.konflikt);
            if (gruppe.some(x => x.pfad[0] === 'kapitel')) {
              if (d.manuskriptKonflikte?.some(k => k.kapitelIds.includes(id))) throw new Error(texte().suche.konflikt);
              if (!await get().schnappschuss(kapitelPfad(id),'ersetzen')) throw new Error(texte().suche.snapshot);
              if (get().fs !== fs || gruppe.some(x => feldWert(get().daten!,x.pfad) !== x.vorher)) throw new Error(texte().suche.konflikt);
            }
            let neu = get().daten!; for (const x of gruppe) neu = setzeFeld(neu,x.pfad,x.nachher);
            await get().statistik.ohneZaehlen(() => speichern(neu,gruppe));
            ergebnis.anzahl += gruppe.reduce((n,x) => n + (anzahl.get(x.pfad.join('/')) ?? 0),0);
            if (p[0] !== 'kapitel') neuUndo.push(...gruppe);
          } catch (e) {
            // Auch fehlgeschlagene optimistische Store-Schreibvorgänge bleiben rücknehmbar.
            if (p[0] !== 'kapitel' && get().fs === fs) neuUndo.push(...gruppe.filter(x => feldWert(get().daten!,x.pfad) === x.nachher));
            ergebnis.fehler.push(f(texte().suche.fehler,{name: gruppe.some(x => x.pfad[0] === 'kapitel') ? d.kapitel[id]?.titel ?? id : p.join('/'), grund: e instanceof Error ? e.message : String(e)}));
          }
        }
        if (neuUndo.length && get().fs === fs) { undo = neuUndo; setze({kannUndo:true}); }
        get().indexNeuBerechnen();
        return ergebnis;
      } finally { setze({laeuft:false}); }
    },
    async undo() {
      if (!undo.length || get().suche.laeuft || !get().daten) return;
      if (undo.some(x => ![x.nachher,x.vorher].includes(feldWert(get().daten!,x.pfad)))) throw new Error(texte().suche.undoKonflikt);
      setze({laeuft:true});
      const fs = get().fs;
      const felder = undo;
      try {
         for (const gruppe of gruppen(felder)) {
           if (get().fs !== fs) throw new Error(texte().suche.konflikt);
           if (gruppe.some(x => ![x.nachher,x.vorher].includes(feldWert(get().daten!,x.pfad)))) throw new Error(texte().suche.undoKonflikt);
          let neu = get().daten!; for (const x of gruppe) neu = setzeFeld(neu,x.pfad,x.vorher);
           await get().statistik.ohneZaehlen(() => speichern(neu,gruppe));
        }
        if (get().fs === fs) {undo = []; setze({kannUndo:false});}
      } finally { setze({laeuft:false}); }
    },
  }};
};
