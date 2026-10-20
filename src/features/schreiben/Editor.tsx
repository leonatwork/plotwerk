/**
 * Editor des offenen Kapitels (S-02–S-06, S-10): TipTap mit Typografie, Autosave, Schnappschüssen,
 * Figuren-Unterstreichung, Anmerkungen am Rand und Sprung zu markierten Stellen.
 *
 * Eigene Speichervorgänge setzen den Inhalt nie neu (Cursor und ⌘Z bleiben). Neu geladen wird nur
 * beim Kapitelwechsel oder wenn sich der Text im Store von außen ändert (Datei, Wiederherstellen).
 */
import { erkenneKapitel, motiveImText } from '@core/erkennung/index';
import { buchSprache } from '@core/i18n';
import type { Erwaehnung, Id, Realitaet, TextAnker } from '@core/model/types';
import { kapitelPfad } from '@core/projekt';
import { ankerErzeugen, ankerFinden, findeZitat, woerterZaehlen } from '@core/text/index';
import Placeholder from '@tiptap/extension-placeholder';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { EditorWerkzeuge, editorErweiterungen } from './werkzeuge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ankerGleich } from '../../state/slices/schreiben';
import { useStore } from '../../state/store';
import { f, texte, useTexte } from '../../i18n';
import { useBuchSprache } from '../../i18n/buch';
import { klassen } from '../../ui';
import { Autosave } from './autosave';
import { Blase, BLASE_SCHLIESSEN, type BlasenPanel } from './Blase';
import { FigurPanel } from './FigurPanel';
import { setzeBruecke, titelFokusAbholen } from './bruecke';
import {
  Dekorationen,
  figurenBei,
  notizBereiche,
  setzeEbenen,
  setzeLektorat,
  setzeFiguren,
  setzeMarkierung,
  setzeNotizen,
  type DekoHandler,
  type EbenenStelle,
  type LektoratStelle,
  type NotizStelle,
} from './dekorationen';
import { bereichZuPositionen, klartextKarte, positionenZuBereich, type KlartextKarte } from './klartext';
import { docZuMarkdown, markdownZuDoc } from './markdown';
import { ENTWURF, Randnotizen, type NotizEntwurf } from './Randnotizen';
import { basisErweiterungen } from './schema';
import { Statusleiste } from './Statusleiste';
import { Typografie } from './typografie';
import { fokusFiguren, notizFarbe } from './ziele';
import { Kapitelsuche } from './Kapitelsuche';
import { SuchDekorationen } from './suchdekorationen';

/** Cursor und Scrollstand je Kapitel (für die Rückkehr) */
const auswahlSpeicher = new Map<Id, { anker: number; kopf: number; scroll: number }>();
const beendenRegistriert = new WeakSet<object>();
const ANALYSE_PAUSE = 400;
const INTERVALL = 10 * 60 * 1000;
const LEER: { anker: TextAnker; stufe: Realitaet }[] = [];

function KapitelTitel({ kapitelId, titel, editor }: { kapitelId: Id; titel: string; editor: Editor | null }) {
  const speichern = useStore((s) => s.kapitelTitelSpeichern);
  const ref = useRef<HTMLHeadingElement>(null);
  const fokus = useRef(false);
  const T = useTexte().schreiben.editor;
  const buchLang = useBuchSprache();
  useEffect(() => {
    if (ref.current && !fokus.current && ref.current.textContent !== titel) ref.current.textContent = titel;
  }, [titel, kapitelId]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !titelFokusAbholen(kapitelId)) return;
    el.focus();
    const bereich = document.createRange();
    bereich.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(bereich);
  }, [kapitelId]);
  const uebernehmen = () => {
    const el = ref.current;
    if (!el) return;
    const neu = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (neu && neu !== titel) void speichern(kapitelId, neu);
    else el.textContent = titel;
  };
  return (
    <h1
      ref={ref}
      className="pw-s-titel"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={T.titelLabel}
      aria-multiline="false"
      data-leer={T.titelLeer}
      spellCheck
      lang={buchLang}
      onFocus={() => {
        fokus.current = true;
      }}
      onBlur={() => {
        fokus.current = false;
        uebernehmen();
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
          e.preventDefault();
          editor?.commands.focus('start');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (ref.current) ref.current.textContent = titel;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function SchreibEditor({ kapitelId }: { kapitelId: Id }) {
  const t = useTexte();
  /** Buchsprache für Rechtschreibprüfung und Silbentrennung des WebViews */
  const buchLang = useBuchSprache();
  const fokusModus = useStore((s) => s.fokusModus);
  const sucheOffen = useStore((s) => s.suche.kapitelOffen);
  const typewriter = useStore((s) => s.editorwerkzeuge.typewriter);
  const kapitelText = useStore((s) => s.daten?.kapitel[kapitelId]?.text ?? '');
  const titel = useStore((s) => s.daten?.kapitel[kapitelId]?.titel ?? s.daten?.plaene[kapitelId]?.titel ?? '');
  const nummer = useStore((s) => (s.daten?.projekt.kapitel.indexOf(kapitelId) ?? -1) + 1);
  const status = useStore((s) => s.daten?.plaene[kapitelId]?.status);
  const alleAnmerkungen = useStore((s) => s.daten?.anmerkungen);
  const markierung = useStore((s) => s.markierung);
  const backend = useStore((s) => s.backend);
  const verwaist = useStore((s) => (s.schreibenLive?.kapitel === kapitelId ? s.schreibenLive.verwaist : undefined));
  const anmerkungen = useMemo(() => (alleAnmerkungen ?? []).filter((a) => a.anker.kapitel === kapitelId), [alleAnmerkungen, kapitelId]);
  const motivListe = useStore((s) => s.daten?.motive);
  const stellenEntscheidungen = useStore((s) => s.daten?.entscheidungen.realitaet);
  const stellenPlan = useStore((s) => s.daten?.plaene[kapitelId]?.realitaet);
  const ebenen = useMemo(
    () => [
      ...(stellenEntscheidungen ?? LEER).filter((r) => r.anker.kapitel === kapitelId),
      ...(stellenPlan ?? []).flatMap((r) => (r.anker && r.anker.kapitel === kapitelId ? [{ anker: r.anker, stufe: r.stufe }] : [])),
    ],
    [stellenEntscheidungen, stellenPlan, kapitelId],
  );

  const alleLektorat = useStore((s) => s.daten?.lektorat);
  const lektorat = useMemo(() => (alleLektorat ?? []).filter((a) => a.status === 'offen' && a.anker.kapitel === kapitelId), [alleLektorat, kapitelId]);

  const papierRef = useRef<HTMLDivElement>(null);
  const randRef = useRef<HTMLDivElement>(null);
  const [handler] = useState<DekoHandler>(() => ({}));
  const [ungespeichert, setUngespeichert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<NotizEntwurf | null>(null);
  const [aktiveNotiz, setAktiveNotiz] = useState<Id | null>(null);

  /** Was im Editor steht: Kapitel, zuletzt geladener/gespeicherter Text, aktuelles Dokument */
  const geladen = useRef<{ editor: Editor | null; kapitel: Id | null; text: string; doc: PMNode | null }>({ editor: null, kapitel: null, text: '', doc: null });
  const karteCache = useRef<{ doc: PMNode; karte: KlartextKarte } | null>(null);
  const analyseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const aktuell = useRef({ anmerkungen, entwurf, aktiveNotiz, ungespeichert, ebenen, lektorat });
  aktuell.current = { anmerkungen, entwurf, aktiveNotiz, ungespeichert, ebenen, lektorat };

  const meldungZeigen = useCallback((text: string) => {
    setMeldung(text);
    window.setTimeout(() => setMeldung((m) => (m === text ? null : m)), 4000);
  }, []);

  // ---------------------------------------------------------------- Klartext, Analyse
  const karteVon = useCallback((doc: PMNode, markdown?: string): KlartextKarte => {
    const c = karteCache.current;
    if (c && c.doc === doc) return c.karte;
    const karte = klartextKarte(doc, markdown);
    karteCache.current = { doc, karte };
    return karte;
  }, []);

  /** Anmerkungen des Kapitels mit dem Text abgleichen; gibt verwaiste IDs zurück. */
  const notizenAbgleichen = useCallback(
    (ed: Editor, karte: KlartextKarte): Id[] => {
      const d = useStore.getState().daten;
      const { anmerkungen: liste, entwurf: e, aktiveNotiz: aktiv } = aktuell.current;
      const fokus = d ? fokusFiguren(d.plaene[kapitelId], d.figuren) : new Set<Id>();
      const bereiche = notizBereiche(ed.state);
      const stellen: NotizStelle[] = [];
      const verwaiste: Id[] = [];
      for (const a of liste) {
        let b = bereiche.get(a.id);
        if (!b) {
          const f = ankerFinden(karte.text, a.anker);
          if (f && f.ende > f.start) b = bereichZuPositionen(karte, f.start, f.ende);
        }
        if (b && b.to > b.from) stellen.push({ ...b, id: a.id, farbe: notizFarbe(a.ziel, fokus), aktiv: a.id === aktiv });
        else verwaiste.push(a.id);
      }
      if (e) {
        const b = bereiche.get(ENTWURF) ?? { from: e.from, to: e.to };
        stellen.push({ ...b, id: ENTWURF, farbe: 'rosa', aktiv: true });
      }
      setzeNotizen(ed.view, stellen);
      return verwaiste;
    },
    [kapitelId],
  );

  /** Stellen mit Realitätsebene im Text kennzeichnen (nicht gefundene Stellen bleiben unsichtbar). */
  const ebenenAbgleichen = useCallback((ed: Editor, karte: KlartextKarte) => {
    const stellen: EbenenStelle[] = [];
    for (const r of aktuell.current.ebenen) {
      const b = ankerFinden(karte.text, r.anker);
      if (b && b.ende > b.start) stellen.push({ ...bereichZuPositionen(karte, b.start, b.ende), stufe: r.stufe });
    }
    setzeEbenen(ed.view, stellen);
    // offene Lektorats-Änderungen (Rückimport aus Word) markieren; angenommen/abgelehnt wird im Dialog
    const lk: LektoratStelle[] = [];
    const L = texte().schreiben.editor.lektorat;
    for (const a of aktuell.current.lektorat) {
      const b = ankerFinden(karte.text, a.anker);
      if (!b || b.ende <= b.start) continue;
      const werte = { alt: a.alt, neu: a.neu };
      const titel = f(a.art === 'einfuegen' ? L.einfuegen : a.art === 'loeschen' ? L.loeschen : L.ersetzen, werte);
      const mitAutor = a.autor ? f(L.autor, { titel, autor: a.autor }) : titel;
      lk.push({ ...bereichZuPositionen(karte, b.start, b.ende), art: a.art, titel: f(L.hinweis, { titel: mitAutor }) });
    }
    setzeLektorat(ed.view, lk);
  }, []);

  const analysieren = useCallback(() => {
    if (analyseTimer.current) clearTimeout(analyseTimer.current);
    analyseTimer.current = null;
    const ed = editorRef.current;
    const id = geladen.current.kapitel;
    const s = useStore.getState();
    const d = s.daten;
    if (!ed || ed.isDestroyed || id !== kapitelId || !d) return;
    const doc = ed.state.doc;
    const md = docZuMarkdown(doc);
    const karte = karteVon(doc, md);
    let erwaehnungen: Erwaehnung[] = [];
    try {
      erwaehnungen = erkenneKapitel({ id, titel: d.kapitel[id]?.titel ?? '', text: md }, d);
    } catch (e) {
      console.warn('Erkennung fehlgeschlagen:', e);
    }
    const fokus = fokusFiguren(d.plaene[id], d.figuren);
    setzeFiguren(
      ed.view,
      erwaehnungen
        .filter((e) => e.zielTyp === 'figur' && d.figuren[e.ziel])
        .map((e) => ({ ...bereichZuPositionen(karte, e.start, e.ende), figur: e.ziel, name: d.figuren[e.ziel]!.name, fokus: fokus.has(e.ziel) })),
    );
    const verwaiste = notizenAbgleichen(ed, karte);
    ebenenAbgleichen(ed, karte);
    const vorher = s.schreibenLive;
    const gleich = vorher?.kapitel === id && vorher.verwaist.join('\n') === verwaiste.join('\n');
    const motive = motiveImText(karte.text, d.motive ?? [], buchSprache(d.projekt.angaben));
    s.setzeSchreibenLive({ kapitel: id, woerter: woerterZaehlen(karte.text), erwaehnungen, verwaist: gleich ? vorher.verwaist : verwaiste, motive });
  }, [kapitelId, karteVon, notizenAbgleichen, ebenenAbgleichen]);

  const analysePlanen = useCallback(() => {
    if (analyseTimer.current) clearTimeout(analyseTimer.current);
    analyseTimer.current = setTimeout(analysieren, ANALYSE_PAUSE);
  }, [analysieren]);
  const analysePlanenRef = useRef(analysePlanen);
  analysePlanenRef.current = analysePlanen;

  // ---------------------------------------------------------------- Speichern
  /** Anker der Notizen an den aktuellen Text anpassen (sie wandern mit). */
  const ankerNachfuehren = useCallback((ed: Editor, id: Id, doc: PMNode, md: string) => {
    if (ed.isDestroyed || ed.state.doc !== doc) return;
    const liste = aktuell.current.anmerkungen.filter((a) => a.anker.kapitel === id);
    if (!liste.length) return;
    const bereiche = notizBereiche(ed.state);
    const karte = karteVon(doc, md);
    const neu: { id: Id; anker: ReturnType<typeof ankerErzeugen> }[] = [];
    for (const a of liste) {
      const b = bereiche.get(a.id);
      if (!b) continue;
      const { start, ende } = positionenZuBereich(karte, b.from, b.to);
      if (ende <= start) continue;
      const anker = ankerErzeugen(id, karte.text, start, ende);
      if (!ankerGleich(anker, a.anker)) neu.push({ id: a.id, anker });
    }
    if (neu.length) void useStore.getState().anmerkungenVerankern(neu).catch((e) => console.error('Anmerkungen nicht nachgeführt:', e));
  }, [karteVon]);

  const speichern = useCallback(async () => {
    const { kapitel: id, doc } = geladen.current;
    setUngespeichert(false);
    if (!id || !doc) return;
    const s = useStore.getState();
    if (!s.daten?.projekt.kapitel.includes(id)) return;
    const md = docZuMarkdown(doc);
    if (md === geladen.current.text) return;
    geladen.current = { ...geladen.current, text: md };
    const laeuft = s.kapitelTextSpeichern(id, md);
    const ed = editorRef.current;
    if (ed) ankerNachfuehren(ed, id, doc, md);
    await laeuft;
  }, [ankerNachfuehren]);
  const speichernRef = useRef(speichern);
  speichernRef.current = speichern;

  const autosave = useMemo(() => new Autosave(() => speichernRef.current(), undefined, (e) => console.error('Automatisches Speichern fehlgeschlagen:', e)), []);

  // ---------------------------------------------------------------- Editor
  const editor = useEditor({
    extensions: [
      ...basisErweiterungen(),
      Typografie,
      SuchDekorationen,
      Dekorationen.configure({ handler }),
      Placeholder.configure({ placeholder: () => texte().schreiben.editor.platzhalter }),
      ...editorErweiterungen(),
    ],
    editorProps: {
      attributes: {
        class: 'pw-s-prosemirror',
        spellcheck: 'true',
        lang: 'de',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': t.schreiben.editor.textLabel,
      },
    },
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: ed }) => {
      if (geladen.current.editor !== ed) return;
      geladen.current.doc = ed.state.doc;
      const id = geladen.current.kapitel;
      if (id && !autosave.ausstehend) void useStore.getState().sitzungSichern(kapitelPfad(id)).catch(() => undefined);
      autosave.aenderung();
      if (!aktuell.current.ungespeichert) setUngespeichert(true);
      analysePlanenRef.current();
    },
  });
  editorRef.current = editor;

  handler.figurOeffnen = (figur) => useStore.getState().oeffne('figuren', { figur });
  handler.notizGeklickt = (id) => {
    if (id !== ENTWURF) setAktiveNotiz(id);
  };

  const scrolleZu = useCallback((pos: number) => {
    const ed = editorRef.current;
    const papier = papierRef.current;
    if (!ed || !papier) return;
    try {
      const c = ed.view.coordsAtPos(pos);
      const r = papier.getBoundingClientRect();
      papier.scrollTo({ top: Math.max(0, papier.scrollTop + (c.top - r.top) - papier.clientHeight * 0.3), behavior: 'smooth' });
    } catch {
      /* außerhalb des Dokuments */
    }
  }, []);

  const zeigeBereich = useCallback(
    (b: { from: number; to: number }) => {
      const ed = editorRef.current;
      if (!ed) return;
      setzeMarkierung(ed.view, b);
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, b.from)));
      scrolleZu(b.from);
    },
    [scrolleZu],
  );

  const laden = useCallback(
    (ed: Editor, id: Id, text: string, auswahlWiederherstellen: boolean) => {
      const doc = markdownZuDoc(text, ed.schema);
      let selection: TextSelection | undefined;
      const gemerkt = auswahlWiederherstellen ? auswahlSpeicher.get(id) : undefined;
      if (gemerkt && gemerkt.kopf <= doc.content.size && gemerkt.anker <= doc.content.size) {
        try {
          selection = TextSelection.create(doc, gemerkt.anker, gemerkt.kopf);
        } catch {
          selection = undefined;
        }
      }
      ed.view.updateState(EditorState.create({ schema: ed.schema, doc, plugins: ed.state.plugins, selection }));
      geladen.current = { editor: ed, kapitel: id, text, doc };
      karteCache.current = null;
      setEntwurf(null);
      setAktiveNotiz(null);
      // updateState löst keine Transaktion aus: Auswahl-Leiste ausdrücklich schließen
      papierRef.current?.dispatchEvent(new Event(BLASE_SCHLIESSEN));
      if (papierRef.current) papierRef.current.scrollTop = gemerkt?.scroll ?? 0;
      analysieren();
    },
    [analysieren],
  );

  // Kapitel laden bzw. nach Änderung von außen neu laden
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const g = geladen.current;
    if (g.editor === editor && g.kapitel === kapitelId && g.text === kapitelText) return;
    const vonAussen = g.editor === editor && g.kapitel === kapitelId;
    if (vonAussen) {
      const extern = useStore.getState().externeAenderung;
      const vonDatei = !!extern && Date.now() - extern.zeit < 5000 && extern.pfade.includes(kapitelPfad(kapitelId));
      const lokal = g.doc ? docZuMarkdown(g.doc) : g.text;
      if (lokal !== g.text && lokal !== kapitelText) {
        // Ungespeicherte Eingaben und gleichzeitig eine andere Fassung: Eingaben bleiben im Editor,
        // die andere Fassung wird vorher als Schnappschuss gesichert – nichts geht verloren.
        // Reihenfolge: Schnappschuss und Speichern laufen je Datei nacheinander (store: inReihe).
        geladen.current = { ...g, text: kapitelText };
        useStore
          .getState()
          .schnappschuss(kapitelPfad(kapitelId), 'extern')
          .catch((e) => console.error('Andere Fassung nicht gesichert:', e));
        void autosave.jetzt();
        const E = texte().schreiben.editor;
        meldungZeigen(vonDatei ? E.externBehalten : E.andereFassung);
        return;
      }
      autosave.verwerfen();
      setUngespeichert(false);
      if (vonDatei) meldungZeigen(texte().schreiben.editor.externNeuGeladen);
    }
    laden(editor, kapitelId, kapitelText, !vonAussen);
  }, [editor, kapitelId, kapitelText, autosave, laden, meldungZeigen]);

  // Vor dem Kapitelwechsel (und beim Verlassen): sichern, Auswahl merken, Schnappschuss (E8)
  useEffect(() => {
    const id = kapitelId;
    return () => {
      const ed = editorRef.current;
      if (ed && geladen.current.kapitel === id) {
        try {
          auswahlSpeicher.set(id, { anker: ed.state.selection.anchor, kopf: ed.state.selection.head, scroll: papierRef.current?.scrollTop ?? 0 });
        } catch {
          /* Editor schon zerstört */
        }
      }
      if (analyseTimer.current) clearTimeout(analyseTimer.current);
      void autosave
        .jetzt()
        .then(async () => {
          const s = useStore.getState();
          if (!s.daten?.projekt.kapitel.includes(id)) return;
          await s.alleSpeichernAbwarten();
          await s.schnappschuss(kapitelPfad(id), 'kapitelwechsel');
        })
        .catch((e) => console.error('Schnappschuss beim Kapitelwechsel fehlgeschlagen:', e));
    };
  }, [kapitelId, autosave]);

  // Schnappschuss spätestens alle 10 Minuten (nur bei Änderungen, siehe core/versionen)
  useEffect(() => {
    const t = window.setInterval(async () => {
      const id = geladen.current.kapitel;
      if (!id) return;
      await autosave.jetzt();
      const s = useStore.getState();
      await s.alleSpeichernAbwarten();
      await s.schnappschuss(kapitelPfad(id), 'intervall').catch((e) => console.error('Schnappschuss fehlgeschlagen:', e));
    }, INTERVALL);
    return () => window.clearInterval(t);
  }, [autosave]);

  // Beenden: ausstehende Eingaben sichern, dann Schnappschuss
  useEffect(() => {
    const s = useStore.getState();
    s.registriereEditorSichern(() => autosave.jetzt());
    const vorDemSchliessen = () => void autosave.jetzt();
    window.addEventListener('beforeunload', vorDemSchliessen);
    return () => {
      window.removeEventListener('beforeunload', vorDemSchliessen);
      useStore.getState().registriereEditorSichern(null);
    };
  }, [autosave]);
  useEffect(() => {
    if (!backend || beendenRegistriert.has(backend)) return;
    beendenRegistriert.add(backend);
    backend.beimBeenden(async () => {
      const s = useStore.getState();
      await s.editorSichern();
      await s.alleSpeichernAbwarten();
      const id = s.auswahl.kapitel;
      if (id && s.daten?.projekt.kapitel.includes(id)) await s.schnappschuss(kapitelPfad(id), 'beenden');
    });
  }, [backend]);

  // Anmerkungen, Entwurf oder aktive Notiz geändert → Hinterlegung neu setzen
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || geladen.current.kapitel !== kapitelId) return;
    const verwaiste = notizenAbgleichen(ed, karteVon(ed.state.doc));
    const s = useStore.getState();
    const live = s.schreibenLive;
    if (live && live.kapitel === kapitelId && live.verwaist.join() !== verwaiste.join()) s.setzeSchreibenLive({ ...live, verwaist: verwaiste });
  }, [anmerkungen, entwurf, aktiveNotiz, kapitelId, notizenAbgleichen, karteVon]);

  // Motive geändert (Tab „Erkannt“) → neu zählen
  useEffect(() => {
    if (geladen.current.kapitel === kapitelId) analysePlanenRef.current();
  }, [motivListe, kapitelId]);

  // Realitätsebenen geändert (Blase, Kapitel-Überblick) → Kennzeichnung neu setzen
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || geladen.current.kapitel !== kapitelId) return;
    ebenenAbgleichen(ed, karteVon(ed.state.doc));
  }, [ebenen, lektorat, kapitelId, ebenenAbgleichen, karteVon]);

  // Sprung zu einer Stelle (store.markiere, z. B. aus Hinweisen oder Figurenkarte)
  useEffect(() => {
    if (!markierung || markierung.kapitel !== kapitelId || !editor || geladen.current.kapitel !== kapitelId) return;
    const karte = karteVon(editor.state.doc);
    const b = ankerFinden(karte.text, markierung.anker);
    if (b) zeigeBereich(bereichZuPositionen(karte, b.start, b.ende));
    else meldungZeigen(texte().schreiben.editor.stelleFehlt);
    useStore.getState().markiere(null);
  }, [markierung, kapitelId, editor, karteVon, zeigeBereich, meldungZeigen]);

  // Inspektor → Editor
  useEffect(() => {
    setzeBruecke({
      markiereZitat: (k, zitat) => {
        const ed = editorRef.current;
        if (!ed || k !== geladen.current.kapitel) return false;
        const karte = karteVon(ed.state.doc);
        const t = findeZitat(karte.text, zitat)[0];
        if (!t) return false;
        zeigeBereich(bereichZuPositionen(karte, t.start, t.ende));
        return true;
      },
    });
    return () => setzeBruecke(null);
  }, [karteVon, zeigeBereich]);

  // ---------------------------------------------------------------- Notizen
  const notizBeginnen = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to, empty, $from } = ed.state.selection;
    if (empty) return;
    const karte = karteVon(ed.state.doc);
    const { start, ende } = positionenZuBereich(karte, from, to);
    if (ende <= start) return;
    const kandidaten = figurenBei(ed.state, $from.start(), to).filter((f) => f.from < to);
    kandidaten.sort((a, b) => b.from - a.from);
    const figur = kandidaten[0]?.figur;
    // Im Fokus-Modus gibt es keinen Rand: erst verlassen, sonst entstünde ein unsichtbarer Entwurf
    if (useStore.getState().fokusModus) useStore.getState().umschalteFokus();
    setAktiveNotiz(null);
    setEntwurf({
      anker: ankerErzeugen(kapitelId, karte.text, start, ende),
      from,
      to,
      ziel: figur ? { typ: 'figur', id: figur } : { typ: 'kapitel', id: kapitelId },
      notiz: '',
    });
  };

  /** Realitätsebene der markierten Stelle festlegen (entscheidungen.realitaet, siehe Kapitel-Überblick). */
  const ebeneSetzen = async (stufe: Realitaet) => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to, empty } = ed.state.selection;
    if (empty) return;
    const karte = karteVon(ed.state.doc);
    const { start, ende } = positionenZuBereich(karte, from, to);
    if (ende <= start) return;
    const anker = ankerErzeugen(kapitelId, karte.text, start, ende);
    try {
      // erst den Text sichern, damit die Stelle im gespeicherten Kapitel genauso steht
      await autosave.jetzt();
      await useStore.getState().planung.stelleRealitaetSetzen(anker, stufe);
      meldungZeigen(texte().schreiben.editor.ebeneMeldung[stufe]);
    } catch (e) {
      console.error('Realitätsebene nicht gespeichert:', e);
      meldungZeigen(texte().schreiben.editor.ebeneFehler);
    }
  };

  /** F-09: markierter Text (ein Absatz, 2–60 Zeichen) und die dort schon erkannten Figuren */
  const figurAuswahl = (): { text: string; erkannt: Id[] } | null => {
    const ed = editorRef.current;
    if (!ed) return null;
    const { from, to, empty, $from, $to } = ed.state.selection;
    if (empty || !$from.sameParent($to)) return null;
    const text = ed.state.doc.textBetween(from, to, ' ').trim();
    if (text.length < 2 || text.length > 60) return null;
    const erkannt = [...new Set(figurenBei(ed.state, $from.start(), $from.end()).filter((x) => x.from < to && x.to > from).map((x) => x.figur))];
    return { text, erkannt };
  };
  const figurPanel: BlasenPanel = {
    id: 'figur',
    knopf: t.schreiben.blase.figur,
    titel: t.schreiben.blase.figurTitel,
    nurStelle: true,
    zeigen: () => figurAuswahl() !== null,
    inhalt: (schliessen) => {
      const m = figurAuswahl();
      if (!m) return null;
      return (
        <FigurPanel
          key={m.text}
          markiert={m.text}
          erkannt={m.erkannt}
          onFertig={(text) => {
            schliessen();
            editorRef.current?.commands.focus();
            meldungZeigen(text);
          }}
        />
      );
    },
  };

  const zuStelle = (id: Id) => {
    const ed = editorRef.current;
    const b = ed ? notizBereiche(ed.state).get(id) : undefined;
    if (!ed || !b) return;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, b.from, b.to)));
    scrolleZu(b.from);
  };

  const neuVerankern = (id: Id) => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to, empty } = ed.state.selection;
    if (empty) return;
    const karte = karteVon(ed.state.doc);
    const { start, ende } = positionenZuBereich(karte, from, to);
    if (ende <= start) return;
    void useStore.getState().anmerkungAendern(id, { anker: ankerErzeugen(kapitelId, karte.text, start, ende) });
  };

  const label = f(status === 'geplant' && !kapitelText.trim() ? t.schreiben.editor.kopfGeplant : t.schreiben.editor.kopf, { nr: nummer });

  return (
    <div className="pw-s-mitte">
      {sucheOffen && editor && <Kapitelsuche editor={editor} kapitelId={kapitelId} text={kapitelText} />}
      <div ref={papierRef} className={klassen('pw-s-papier', fokusModus && 'pw-s-papier--fokus', typewriter && 'pw-s-papier--typewriter')}>
        <article className="pw-s-text" lang={buchLang}>
          <span className="pw-s-kopf-label">{label}</span>
          <KapitelTitel kapitelId={kapitelId} titel={titel} editor={editor} />
          <EditorContent editor={editor} />
        </article>
        {!fokusModus && (
          <div ref={randRef} className="pw-s-rand" aria-label={t.schreiben.editor.randLabel}>
            {editor && (
              <Randnotizen
                editor={editor}
                kapitelId={kapitelId}
                randRef={randRef}
                anmerkungen={anmerkungen}
                verwaist={verwaist ?? []}
                entwurf={entwurf}
                setEntwurf={setEntwurf}
                aktiv={aktiveNotiz}
                setAktiv={setAktiveNotiz}
                zuStelle={zuStelle}
                neuVerankern={neuVerankern}
              />
            )}
          </div>
        )}
        {editor && <Blase editor={editor} papierRef={papierRef} onNotiz={notizBeginnen} onEbene={(stufe) => void ebeneSetzen(stufe)} panels={[figurPanel]} />}
        <EditorWerkzeuge editor={editor} papierRef={papierRef} kapitelId={kapitelId} />
      </div>
      <Statusleiste kapitelId={kapitelId} ungespeichert={ungespeichert} meldung={meldung} />
    </div>
  );
}
