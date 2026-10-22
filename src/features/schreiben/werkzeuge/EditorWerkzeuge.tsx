/**
 * Editor-Werkzeuge im Schreibbereich (G4), ohne eigene Oberfläche im Papier:
 *  - analysiert das offene Kapitel lokal (Wiederholungen, Marken) und legt das Ergebnis in den Store
 *  - setzt die Markierungen der Wiederholungen (nur Darstellung, nie im Dokument)
 *  - schaltet den Typewriter-Modus im Editor
 *  - liest vor (Satz für Satz, der gelesene Satz ist markiert)
 */
import type { Id } from '@core/model/types';
import { buchSprache, localeVon } from '@core/i18n';
import { findeMarken, markenKandidaten, stellenVon, stilBericht } from '@core/stil/index';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, type RefObject } from 'react';
import type { VorlesenStatus } from '../../../state/slices/editorwerkzeuge';
import { aktuelleBuchSprache } from '../../../i18n/buch';
import { f, texte } from '../../../i18n';
import { useStore } from '../../../state/store';
import { bereichZuPositionen, klartextKarte, positionenZuBereich, type KlartextKarte } from '../klartext';
import { docZuMarkdown } from '../markdown';
import { setzeTypewriter, setzeVorlesen, setzeWiederholungen, zeileMittig, type WiederholungsStelle } from './erweiterung';
import { setzeFortschritt, vorleseMeldung } from './fortschritt';
import { bekannteNamen, eigennamen, LEERE_MARKENLISTE } from './gemeinsam';
import { neueAeusserung, satzAb, sprachausgabe, vorleseSaetze, vorleseStartAbholen, waehleStimme, type VorleseSatz } from './vorlesen';
import type { Node as PMNode } from '@tiptap/pm/model';
import { oberflaechenSkalierung, useDarstellungsStore } from '../../../state/darstellung';

export interface EditorWerkzeugeProps {
  editor: Editor | null;
  /** scrollender Papierbereich (Typewriter-Modus, Vorlesen) */
  papierRef: RefObject<HTMLDivElement | null>;
  kapitelId: Id;
}

const ANALYSE_PAUSE = 150;

function wiederholungsStellen(live: NonNullable<ReturnType<typeof useStore.getState>['editorwerkzeuge']['live']>, an: boolean, fokus: string | null) {
  const stellen: { start: number; ende: number; art: WiederholungsStelle['art']; titel: string }[] = [];
  const T = texte().schreiben.werkzeuge;
  if (an) {
    for (const n of live.bericht.nah) {
      const titel = f(T.nahTitel, { wort: n.wort, anzahl: n.stellen.length, n: n.abstand });
      for (const s of n.stellen) stellen.push({ ...s, art: 'nah', titel });
    }
    for (const a of live.bericht.satzanfaenge) {
      const titel = f(T.anfangTitel, { n: a.saetze, wort: a.wort });
      for (const s of a.stellen) stellen.push({ ...s, art: 'anfang', titel });
    }
  }
  if (fokus) {
    const alle = stellenVon(live.text, fokus, aktuelleBuchSprache());
    for (const s of alle) stellen.push({ ...s, art: 'fokus', titel: f(T.fokusTitel, { n: alle.length }) });
  }
  return stellen;
}

/** Bereich so scrollen, dass die Stelle sichtbar ist (im Typewriter-Modus mittig). */
function inSicht(editor: Editor, papier: HTMLElement | null, pos: number, mittig: boolean): void {
  if (!papier) return;
  try {
    const c = editor.view.coordsAtPos(pos);
    const r = papier.getBoundingClientRect();
    const sichtbar = c.top > r.top + 48 && c.bottom < r.bottom - 64;
    if (sichtbar && !mittig) return;
    const anteil = mittig ? 0.5 : 0.35;
    const reduziert = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    papier.scrollTo({ top: Math.max(0, papier.scrollTop + (c.top - r.top) / oberflaechenSkalierung() - papier.clientHeight * anteil), behavior: reduziert ? 'auto' : 'smooth' });
  } catch {
    /* Position außerhalb des Dokuments */
  }
}

export function EditorWerkzeuge({ editor, papierRef, kapitelId }: EditorWerkzeugeProps) {
  const darstellung = useDarstellungsStore((s) => s.werte);
  const typewriter = useStore((s) => s.editorwerkzeuge.typewriter);
  const karteRef = useRef<{ doc: PMNode; karte: KlartextKarte } | null>(null);

  // ------------------------------------------------------------ Analyse + Markierungen
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const dekorieren = () => {
      if (editor.isDestroyed) return;
      const { live, wiederholungen, fokusWort } = useStore.getState().editorwerkzeuge;
      const k = karteRef.current;
      if (!live || live.kapitel !== kapitelId || !k || k.doc !== editor.state.doc) return;
      setzeWiederholungen(
        editor.view,
        wiederholungsStellen(live, wiederholungen, fokusWort).map((s) => ({ ...bereichZuPositionen(k.karte, s.start, s.ende), art: s.art, titel: s.titel })),
      );
    };

    const analysieren = () => {
      timer = null;
      if (editor.isDestroyed) return;
      const s = useStore.getState();
      const d = s.daten;
      // erst, wenn der Editor dieses Kapitel geladen und einmal ausgewertet hat
      if (!d || s.schreibenLive?.kapitel !== kapitelId) return;
      const doc = editor.state.doc;
      const vorher = karteRef.current;
      const karte = vorher && vorher.doc === doc ? vorher.karte : klartextKarte(doc, docZuMarkdown(doc));
      karteRef.current = { doc, karte };
      const ew = s.editorwerkzeuge;
      const liste = d.marken ?? LEERE_MARKENLISTE;
      const sprache = buchSprache(d.projekt.angaben);
      ew.setzeLive({
        kapitel: kapitelId,
        text: karte.text,
        bericht: stilBericht(karte.text, { abstand: ew.abstand, ignorieren: eigennamen(d), sprache }),
        marken: findeMarken(karte.text, liste),
        kandidaten: markenKandidaten(karte.text, liste, bekannteNamen(d), sprache),
      });
      dekorieren();
    };

    const planen = (pause = ANALYSE_PAUSE) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(analysieren, pause);
    };

    const ab = useStore.subscribe((s, p) => {
      const ew = s.editorwerkzeuge;
      const alt = p.editorwerkzeuge;
      if (
        s.schreibenLive !== p.schreibenLive ||
        s.daten?.marken !== p.daten?.marken ||
        s.daten?.figuren !== p.daten?.figuren ||
        s.daten?.orte !== p.daten?.orte ||
        ew.abstand !== alt.abstand
      ) {
        planen();
      } else if (ew.wiederholungen !== alt.wiederholungen || ew.fokusWort !== alt.fokusWort) {
        // sofort zeigen; ist der Text seit der letzten Analyse geändert, erst neu analysieren
        if (karteRef.current?.doc === editor.state.doc) dekorieren();
        else analysieren();
      }
    });
    planen(0);
    return () => {
      ab();
      if (timer) clearTimeout(timer);
      if (!editor.isDestroyed) setzeWiederholungen(editor.view, []);
      const ew = useStore.getState().editorwerkzeuge;
      if (ew.live?.kapitel === kapitelId) ew.setzeLive(null);
      if (ew.fokusWort) ew.setzeFokusWort(null);
    };
  }, [editor, kapitelId]);

  // ------------------------------------------------------------ Typewriter
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setzeTypewriter(editor.view, typewriter);
    const rahmen = typewriter ? requestAnimationFrame(() => !editor.isDestroyed && zeileMittig(editor.view, false)) : 0;
    return () => cancelAnimationFrame(rahmen);
  }, [editor, typewriter, kapitelId, darstellung]);

  // ------------------------------------------------------------ Vorlesen
  useEffect(() => {
    if (!editor) return;
    let lauf: { saetze: VorleseSatz[]; i: number; karte: KlartextKarte } | null = null;
    let token = 0;
    let weiterTimer: ReturnType<typeof setTimeout> | null = null;
    const setze = (v: VorlesenStatus) => useStore.getState().editorwerkzeuge.setzeVorlesen(v);

    const markieren = (satz: VorleseSatz | null) => {
      if (editor.isDestroyed) return;
      if (!satz || !lauf) {
        setzeVorlesen(editor.view, null);
        return;
      }
      const b = bereichZuPositionen(lauf.karte, satz.start, satz.ende);
      setzeVorlesen(editor.view, b);
      inSicht(editor, papierRef.current, b.from, useStore.getState().editorwerkzeuge.typewriter);
    };

    const anhalten = () => {
      token++;
      if (weiterTimer) clearTimeout(weiterTimer);
      weiterTimer = null;
      sprachausgabe()?.cancel();
    };

    const beenden = () => {
      anhalten();
      lauf = null;
      markieren(null);
      setzeFortschritt({ satz: 0, von: 0, auswahl: false });
    };

    const sprechen = (i: number) => {
      const synth = sprachausgabe();
      if (!synth || !lauf) return;
      if (i >= lauf.saetze.length) {
        beenden();
        setze('aus');
        vorleseMeldung(texte().schreiben.werkzeuge.beendet);
        return;
      }
      lauf.i = i;
      const satz = lauf.saetze[i]!;
      const ew = useStore.getState().editorwerkzeuge;
      const sprache = aktuelleBuchSprache();
      const u = neueAeusserung(satz.text, sprache);
      const stimme = waehleStimme(synth.getVoices(), ew.stimme, sprache);
      if (stimme) {
        u.voice = stimme;
        u.lang = stimme.lang;
      } else u.lang = localeVon(sprache);
      u.rate = ew.tempo;
      const t = ++token;
      u.onend = () => {
        if (t === token && useStore.getState().editorwerkzeuge.vorlesen === 'laeuft') sprechen(i + 1);
      };
      u.onerror = (e) => {
        if (t !== token || e.error === 'interrupted' || e.error === 'canceled') return;
        beenden();
        setze('aus');
        vorleseMeldung(f(texte().schreiben.werkzeuge.abgebrochen, { fehler: e.error }));
      };
      markieren(satz);
      setzeFortschritt({ satz: i, von: lauf.saetze.length });
      synth.speak(u);
    };

    const starten = () => {
      const synth = sprachausgabe();
      if (!synth) {
        setze('aus');
        vorleseMeldung(texte().schreiben.werkzeuge.nichtHier);
        return;
      }
      if (editor.isDestroyed) return;
      const doc = editor.state.doc;
      const karte = klartextKarte(doc, docZuMarkdown(doc));
      const ab = vorleseStartAbholen();
      const { from, to, empty } = editor.state.selection;
      let saetze: VorleseSatz[];
      let i = 0;
      const auswahl = !empty && ab === 'cursor';
      if (auswahl) {
        const b = positionenZuBereich(karte, from, to);
        saetze = vorleseSaetze(karte.text, b.start, b.ende, aktuelleBuchSprache());
      } else {
        saetze = vorleseSaetze(karte.text, 0, karte.text.length, aktuelleBuchSprache());
        if (ab === 'cursor') i = satzAb(saetze, positionenZuBereich(karte, from, from).start);
      }
      if (!saetze.length) {
        setze('aus');
        vorleseMeldung(texte().schreiben.werkzeuge.nichtsVorzulesen);
        return;
      }
      anhalten();
      lauf = { saetze, i, karte };
      setzeFortschritt({ auswahl, von: saetze.length, satz: i });
      sprechen(i);
    };

    const weiter = () => {
      if (!lauf) return starten();
      const i = lauf.i;
      anhalten();
      // nach cancel() verschluckt WebKit sonst gelegentlich die nächste Ausgabe
      weiterTimer = setTimeout(() => sprechen(i), 60);
    };

    const ab = useStore.subscribe((s, p) => {
      const neu = s.editorwerkzeuge.vorlesen;
      const alt = p.editorwerkzeuge.vorlesen;
      if (neu === alt) return;
      if (neu === 'laeuft') {
        if (alt === 'pausiert' && lauf) weiter();
        else starten();
      } else if (neu === 'pausiert') {
        if (lauf) anhalten();
        else setze('aus');
      } else beenden();
    });
    // Geänderter Text: die Satzgrenzen stimmen nicht mehr – Vorlesen beenden
    const textGeaendert = () => {
      if (!lauf) return;
      beenden();
      setze('aus');
      vorleseMeldung(texte().schreiben.werkzeuge.textGeaendert);
    };
    editor.on('update', textGeaendert);
    // Escape beendet das Vorlesen (vor dem Fokus-Modus)
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !lauf || e.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setze('aus');
    };
    window.addEventListener('keydown', taste, true);
    // war schon „läuft“ (z. B. Befehl aus einem anderen Bereich) → jetzt starten
    if (useStore.getState().editorwerkzeuge.vorlesen === 'laeuft') setTimeout(() => useStore.getState().editorwerkzeuge.vorlesen === 'laeuft' && !lauf && starten(), 0);
    else if (useStore.getState().editorwerkzeuge.vorlesen === 'pausiert') setze('aus');
    return () => {
      ab();
      editor.off('update', textGeaendert);
      window.removeEventListener('keydown', taste, true);
      const lief = !!lauf;
      beenden();
      if (lief || useStore.getState().editorwerkzeuge.vorlesen !== 'aus') setze('aus');
    };
  }, [editor, kapitelId, papierRef]);

  return null;
}
