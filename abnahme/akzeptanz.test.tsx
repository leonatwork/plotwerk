/**
 * Abnahme: je ein Test pro Akzeptanzkriterium aus docs/anforderungen-v1.0.md (AK-1 … AK-10).
 * Ergänzende Tests liegen bei den Modulen; die Zuordnung steht in docs/abnahme.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { importiereDocx } from '@core/docx/index';
import type { Hinweis, ProjektDaten } from '@core/model/types';
import { kapitelPfad, MemoryFs, parseKapitel, PFADE, serializeProjekt, type ProjektDateisystem } from '@core/projekt';
import { STANDARD_KI } from '@core/ki/index';
import { ankerErzeugen, findeZitat, klartext } from '@core/text/index';
import { demoDateien, demoFs, ladeDemoProjekt } from '../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../src/backend/demo';
import { erstelleDemoKiTransport } from '../src/backend/ki/demo';
import type { Backend } from '../src/backend/types';
import { aktStufen, ALLE_KATEGORIEN, netzBerechnen } from '../src/features/beziehungen/logik';
import { SchreibEditor } from '../src/features/schreiben/Editor';
import { docZuMarkdown } from '../src/features/schreiben/markdown';
import { zusammenfassungFuer } from '../src/state/slices/planung';
import { erstelleStore, useStore } from '../src/state/store';
import { berechneIndex } from '@core/index/index';

const FIXTURE_DOCX = join(__dirname, '../fixtures/test-manuskript.docx');

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Leerraum vereinheitlichen – Formatierung (Absatzgrenzen, Einzüge, Tabs) zählt nicht als Text. */
const fliesstext = (teile: string[]) =>
  teile
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Text einer .docx über einen unabhängigen Leser (mammoth), nicht über den eigenen Import.
 * Über HTML statt extractRawText, weil mammoth dort harte Zeilenumbrüche verschluckt.
 */
async function rohtextDocx(datei: Uint8Array): Promise<string> {
  const html = (await mammoth.convertToHtml({ buffer: Buffer.from(datei) })).value;
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|h\d|li|td)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function testBackend(): Backend {
  return { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) };
}

/** Demo-Projekt ohne gespeicherte KI-Ergebnisse: was die Prüfung findet, stammt aus dem Lauf. */
function demoOhneKiErgebnisse(): MemoryFs {
  const d = demoDateien();
  for (const p of Object.keys(d)) if (p.startsWith('.plotwerk/')) delete d[p];
  return new MemoryFs(d);
}

/** Zeichnet alle Schreibzugriffe auf. */
class ProtokollFs implements ProjektDateisystem {
  geschrieben: string[] = [];
  entfernt: string[] = [];
  constructor(private readonly innen: ProjektDateisystem) {}
  lesen(p: string) {
    return this.innen.lesen(p);
  }
  auflisten(o: string) {
    return this.innen.auflisten(o);
  }
  existiert(p: string) {
    return this.innen.existiert(p);
  }
  async schreiben(p: string, inhalt: string) {
    this.geschrieben.push(p);
    await this.innen.schreiben(p, inhalt);
  }
  async entfernen(p: string) {
    this.entfernt.push(p);
    await this.innen.entfernen(p);
  }
}

async function geladenerStore(fs: ProjektDateisystem, backend: Backend = testBackend()) {
  const store = erstelleStore();
  store.setState({ backend });
  await store.getState().projektLaden(fs);
  return store;
}

async function buchPruefen(store: Awaited<ReturnType<typeof geladenerStore>>, erzwingen = false): Promise<Hinweis[]> {
  await store.getState().kiPruefen({ umfang: 'buch', ...(erzwingen ? { erzwingen } : {}) });
  expect(store.getState().kiFehler).toBeNull();
  await store.getState().alleSpeichernAbwarten();
  store.getState().indexNeuBerechnen();
  return store.getState().index.hinweise;
}

function zitatImText(daten: ProjektDaten, z: { kapitel: string; text: string }): boolean {
  const md = daten.kapitel[z.kapitel]?.text ?? '';
  return md !== '' && findeZitat(klartext(md), z.text).length > 0;
}

// ---------------------------------------------------------------------------

describe('AK-1 Import ergibt 10 Kapitel mit identischem Text; leere Schlussüberschrift wird gemeldet', () => {
  it('fixtures/test-manuskript.docx: Text identisch laut unabhängigem Leser, 10 Kapitel, Hinweis mit Zitat', async () => {
    const datei = new Uint8Array(readFileSync(FIXTURE_DOCX));
    const ergebnis = await importiereDocx(datei);
    expect(ergebnis.kapitel).toHaveLength(10);

    const unsere = [
      ergebnis.buchtitel ?? '',
      klartext(ergebnis.vorspann),
      ...ergebnis.kapitel.flatMap((k) => [k.titel, klartext(k.text)]),
    ];
    expect(fliesstext(unsere)).toBe(fliesstext([await rohtextDocx(datei)]));

    const schluss = ergebnis.hinweise.find((h) => h.titel === 'Leere Überschrift am Ende');
    expect(schluss).toBeDefined();
    // Zitat = letzte Wörter des Kapitels davor, wörtlich im importierten Text
    expect(schluss!.zitate).toHaveLength(1);
    const nr = Number(schluss!.zitate[0]!.kapitel.slice(1));
    expect(findeZitat(klartext(ergebnis.kapitel[nr - 1]!.text), schluss!.zitate[0]!.text)).not.toHaveLength(0);
  });

  it('nach der Übernahme stehen 10 Kapitel mit unverändertem Text im Projektordner', async () => {
    const datei = new Uint8Array(readFileSync(FIXTURE_DOCX));
    const ergebnis = await importiereDocx(datei);
    const fs = new MemoryFs({ 'projekt.md': serializeProjekt({ version: 1, titel: 'Hafenlichter', kapitel: [], ki: STANDARD_KI, notiz: '' }) });
    const store = await geladenerStore(fs);
    const bericht = await store.getState().importUebernehmen(ergebnis, { ziel: 'aktuell' });
    await store.getState().alleSpeichernAbwarten();

    const d = store.getState().daten!;
    expect(d.projekt.kapitel).toEqual(bericht.ids);
    expect(bericht.ids).toHaveLength(10);
    for (const [i, id] of bericht.ids.entries()) {
      const quelle = ergebnis.kapitel[i]!;
      const datei = await fs.lesen(kapitelPfad(id));
      if (!klartext(quelle.text).trim()) {
        expect(datei).toBeNull();
        expect(d.plaene[id]!.status).toBe('geplant');
        continue;
      }
      const gespeichert = parseKapitel(datei!, id);
      expect(gespeichert.titel).toBe(quelle.titel);
      expect(gespeichert.text).toBe(quelle.text);
    }
  });
});

describe('AK-2 Export nach .docx unterscheidet sich nur in der Formatierung', () => {
  it('ganzes Demo-Buch: Klartext der .docx (unabhängiger Leser) = Titel + Kapiteltitel + Kapiteltext aus der App', async () => {
    const store = await geladenerStore(demoFs());
    const d = store.getState().daten!;
    const datei = await store.getState().exportErstellen({ format: 'docx', kapitel: d.projekt.kapitel, titelseite: true });

    const erwartet = [d.projekt.titel, ...d.projekt.kapitel.flatMap((id) => [d.kapitel[id]?.titel ?? d.plaene[id]!.titel, klartext(d.kapitel[id]?.text ?? '')])];
    expect(fliesstext([await rohtextDocx(datei)])).toBe(fliesstext(erwartet));

    // Typografie bleibt Zeichen für Zeichen erhalten (keine Normalisierung von „“ – …)
    const roh = await rohtextDocx(datei);
    expect(roh).toContain('„Und was sagt Nordhaven zu so vielen Fenstern?“');

    // ohne Anmerkungen und Markierungen; Kapitel als Überschrift 1
    for (const a of d.anmerkungen) expect(roh).not.toContain(a.notiz);
    expect(roh).not.toMatch(/\[\[|\*\*|<mark/);
    const dok = await (await JSZip.loadAsync(datei)).file('word/document.xml')!.async('string');
    const ueberschriften = dok.match(/<w:pStyle w:val="Heading1"\/>/g) ?? [];
    expect(ueberschriften).toHaveLength(d.projekt.kapitel.length);
  });
});

describe('AK-3 Nach Absturz gehen höchstens die letzten 2 Sekunden verloren', () => {
  /** Dateisystem mit Schreibdauer (fsync, OneDrive): ein Schreibvorgang braucht `dauer` ms. */
  class LangsamesFs extends ProtokollFs {
    constructor(
      innen: ProjektDateisystem,
      private readonly dauer: number,
    ) {
      super(innen);
    }
    override async schreiben(p: string, inhalt: string) {
      await new Promise((r) => setTimeout(r, this.dauer));
      await super.schreiben(p, inhalt);
    }
  }

  it('Tippen mit zufälligen Pausen über 20 s: zu jedem Zeitpunkt liegt jede Eingabe, die älter als 2 s ist, auf der Platte', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const innen = demoFs();
    const fs = new LangsamesFs(innen, 150);
    useStore.setState({ backend: testBackend() });
    await act(async () => {
      const laden = useStore.getState().projektLaden(fs);
      await vi.runAllTimersAsync();
      await laden;
    });
    const { container, unmount } = render(<SchreibEditor kapitelId="weissraum" />);
    const el = container.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null;
    const ed = el!.editor!;
    const pfad = kapitelPfad('weissraum');
    const aufPlatte = async () => parseKapitel((await innen.lesen(pfad))!, 'weissraum').text;

    const verlauf: { zeit: number; text: string }[] = [{ zeit: Date.now(), text: await aufPlatte() }];
    let zufall = 7;
    const naechste = () => (zufall = (zufall * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const ende = Date.now() + 20_000;
    let pruefungen = 0;

    const pruefen = async () => {
      const platte = await aufPlatte();
      const stand = verlauf.findLastIndex((v) => v.text === platte);
      expect(stand, 'Platte enthält einen Stand, den es im Editor nie gab').toBeGreaterThanOrEqual(0);
      const muss = verlauf.findLastIndex((v) => v.zeit <= Date.now() - 2000);
      expect(stand, `Absturz bei ${Date.now() - verlauf[0]!.zeit} ms: Eingabe von vor mehr als 2 s fehlt`).toBeGreaterThanOrEqual(muss);
      pruefungen++;
    };

    while (Date.now() < ende) {
      act(() => {
        ed.commands.insertContentAt(ed.state.doc.content.size - 1, String.fromCharCode(97 + Math.floor(naechste() * 26)));
      });
      verlauf.push({ zeit: Date.now(), text: docZuMarkdown(ed.state.doc) });
      // Pause bis zur nächsten Eingabe: meist Tippen, manchmal Nachdenken
      let pause = naechste() < 0.85 ? 40 + naechste() * 260 : 500 + naechste() * 3500;
      while (pause > 0) {
        const schritt = Math.min(pause, 50);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(schritt);
        });
        pause -= schritt;
        await pruefen();
      }
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await pruefen();
    expect(await aufPlatte()).toBe(verlauf.at(-1)!.text);
    expect(pruefungen).toBeGreaterThan(300);
    // atomar: jede Datei wird über ProjektDateisystem.schreiben ersetzt (Rust: temp + fsync + rename,
    // siehe src-tauri/src/dateien.rs, Tests absturz_*), nie stückweise
    expect(fs.geschrieben.filter((p) => p === pfad).length).toBeGreaterThan(5);
    unmount();
  });
});

describe('AK-4 Der Projektordner ist ohne App lesbar (Obsidian, VS Code)', () => {
  it('nach einer Sitzung mit allen Dateiarten: nur .md und .json, gültiges YAML-Frontmatter, gültiges JSON, kein Binärinhalt', async () => {
    const fs = demoOhneKiErgebnisse();
    const store = await geladenerStore(fs);
    const s = store.getState();
    await s.kapitelTextSpeichern('weissraum', `${s.daten!.kapitel.weissraum!.text}\n\nEin neuer Absatz mit „Anführungszeichen“ – und *Kursiv*.`);
    const figur = await s.planung.figurAnlegen('Fiete');
    await s.planung.planFeldSetzen(figur, 'Beruf', 'Fischstand: »unklar«');
    await s.planung.figurNotizHinzufuegen(figur, 'Siehe [[kapitel:funkstille|Funkstille]]');
    await s.planung.kapitelPlanen(3, 'Neues Kapitel: Test');
    await s.planung.ideeAnlegen('Idee mit: Doppelpunkt');
    await s.speichereMotive([...(s.daten!.motive ?? []), { id: 'kola', name: 'Schwip Schwap', aliase: ['Kola'] }]);
    const kt = klartext(s.daten!.kapitel.ebbe!.text);
    await s.anmerkungAnlegen(ankerErzeugen('ebbe', kt, 0, 10), 'Notiz mit "Zeichen"', { typ: 'kapitel', id: 'ebbe' });
    await buchPruefen(store);
    await s.hinweisEntscheiden(store.getState().index.hinweise[0]!.schluessel, 'absicht');
    await store.getState().schnappschuss(kapitelPfad('weissraum'), 'beenden');
    await store.getState().entferneFigur(figur);
    await store.getState().alleSpeichernAbwarten();

    const dateien = fs.alleDateien();
    const pfade = Object.keys(dateien);
    expect(pfade.some((p) => p.startsWith('.versionen/'))).toBe(true);
    expect(pfade.some((p) => p.startsWith('.plotwerk/analysen/'))).toBe(true);
    for (const [pfad, inhalt] of Object.entries(dateien)) {
      // Recherche-Dateien (G8: Bilder unter recherche/dateien/) sind bewusst Mediendateien, keine Projektdaten
      if (/^(\.versionen\/)?recherche\/dateien\//.test(pfad)) continue;
      expect(pfad, pfad).toMatch(/\.(md|json)$/);
      // kein Binärinhalt: nur Text-Steuerzeichen \n und \t
      expect(/[\u0000-\u0008\u000b-\u001f\u007f�]/.test(inhalt), pfad).toBe(false);
      if (pfad.endsWith('.json')) {
        expect(() => JSON.parse(inhalt), pfad).not.toThrow();
        continue;
      }
      expect(inhalt.endsWith('\n'), pfad).toBe(true);
      const m = /^---\n([\s\S]*?)\n---\n/.exec(inhalt);
      if (!pfad.startsWith('.versionen/') || m) {
        expect(m, `${pfad}: Frontmatter fehlt`).not.toBeNull();
        const yaml = parseDocument(m![1]!, { strict: true, uniqueKeys: true });
        expect(yaml.errors, pfad).toEqual([]);
        expect(typeof yaml.toJS(), pfad).toBe('object');
      }
    }
    // Manuskript = reines Markdown: Frontmatter nur id und titel, Text ohne App-Auszeichnung
    for (const pfad of pfade.filter((p) => p.startsWith('manuskript/'))) {
      const yaml = parseDocument(/^---\n([\s\S]*?)\n---\n/.exec(dateien[pfad]!)![1]!).toJS() as Record<string, unknown>;
      expect(Object.keys(yaml).sort(), pfad).toEqual(['id', 'titel']);
      expect(dateien[pfad], pfad).not.toMatch(/<\/?(span|mark|div)\b|data-|\{\{/);
    }
    // der SQLite-Index liegt nicht im Projektordner
    expect(pfade.some((p) => /\.(db|sqlite|sqlite3)(-wal|-shm)?$/.test(p))).toBe(false);
  });
});

describe('AK-5 Nach Löschen des Index baut ein Neustart alle Auswertungen ohne Verlust wieder auf', () => {
  it('Entscheidungen, Zusammenfassungen und KI-Ergebnisse bleiben; Index nach Neustart identisch', async () => {
    const fs = demoFs();
    const backend = testBackend();
    const vorher = await geladenerStore(fs, backend);
    const s = vorher.getState();
    await buchPruefen(vorher);
    const hinweise = vorher.getState().index.hinweise;
    const fiete = hinweise.find((h) => h.typ === 'unbekannt')!;
    await s.hinweisEntscheiden(fiete.schluessel, 'absicht');
    const kontor = hinweise.find((h) => h.typ === 'schreibweise' && h.titel.includes('Lindenhof'))!;
    await s.schreibweiseFestlegen(kontor, 'Lindenhof', ['Linden Hof', 'Linden-Hof']);
    const faden = vorher.getState().index.faeden[0]!;
    await s.planung.fadenStatusSetzen(faden.id, 'erledigt');
    await s.planung.zusammenfassungSpeichern('ebbe', { text: 'Eigene Fassung von Leon.' });
    await vorher.getState().alleSpeichernAbwarten();
    vorher.getState().indexNeuBerechnen();
    const indexVorher = vorher.getState().index;
    const datenVorher = vorher.getState().daten!;
    expect(indexVorher.hinweise.find((h) => h.schluessel === fiete.schluessel)?.status).toBe('absicht');
    expect(indexVorher.faeden.find((f) => f.id === faden.id)?.status).toBe('erledigt');

    // Index löschen (SQLite-Cache weg) und neu starten
    await backend.indexSpeicher.leeren();
    expect(await backend.indexSpeicher.laden()).toBeNull();
    const nachher = await geladenerStore(fs, backend);
    expect(nachher.getState().daten).toEqual(datenVorher);
    expect(nachher.getState().index).toEqual(indexVorher);
    const z = (st: typeof nachher) => zusammenfassungFuer(st.getState().daten!, st.getState().index, 'ebbe');
    expect(z(nachher)).toEqual(z(vorher));
    expect(z(nachher)).toMatchObject({ quelle: 'bearbeitet', text: 'Eigene Fassung von Leon.', veraltet: false });
    // auch eine reine Neuberechnung ohne jeden Vorstand ergibt dasselbe
    expect(berechneIndex(nachher.getState().daten!)).toEqual(indexVorher);
  });
});

describe('AK-6 Die KI-Komponente kann keine Manuskriptdatei schreiben', () => {
  it('voller Prüf- und Vorschlagslauf über die App schreibt nur KI-Ergebnisse unter .plotwerk/', async () => {
    const fs = new ProtokollFs(demoOhneKiErgebnisse());
    const store = await geladenerStore(fs);
    fs.geschrieben = [];
    await buchPruefen(store, true);
    await store.getState().kiPruefen({ umfang: 'kapitel', kapitel: 'funkstille', tiefencheck: true });
    await store.getState().kiVorschlaegeHolen('funkstille');
    await store.getState().alleSpeichernAbwarten();
    expect(fs.geschrieben.length).toBeGreaterThan(0);
    expect(fs.geschrieben.filter((p) => !p.startsWith('.plotwerk/'))).toEqual([]);
    expect(fs.entfernt).toEqual([]);
  });
  // statisch (Importe) und gegen ein Dateisystem, das bei jedem Schreibversuch wirft: core/ki/importe.test.ts,
  // core/ki/ki.test.ts; Rust: src-tauri/crates/plotwerk-ki/tests/kein_dateizugriff.rs
});

describe('AK-7 Jeder Hinweis enthält mindestens ein Zitat, das wörtlich im Text steht', () => {
  it('alle Hinweise nach „Buch prüfen“ (lokal + KI); Ausnahme nur „Kapitel ohne Text“', async () => {
    const store = await geladenerStore(demoOhneKiErgebnisse());
    const hinweise = await buchPruefen(store);
    const d = store.getState().daten!;
    expect(hinweise.length).toBeGreaterThan(5);
    const ausnahmen = hinweise.filter((h) => h.zitate.length === 0);
    for (const h of ausnahmen) {
      expect(h.typ).toBe('struktur');
      expect(h.schluessel).toMatch(/#ohne-text$/);
      expect(klartext(d.kapitel[h.schluessel.slice('struktur:'.length, -'#ohne-text'.length)]?.text ?? '')).toBe('');
    }
    for (const h of hinweise.filter((x) => x.zitate.length > 0))
      for (const z of h.zitate) expect(zitatImText(d, z), `${h.titel}: »${z.text}«`).toBe(true);
  });
});

describe('AK-8 Eine als bewusst vage markierte Stelle erzeugt keinen Widerspruchs-Hinweis', () => {
  it('Stelle in Kap. 9 als bewusst vage markieren → kein „pruefen“ mehr dazu, auch nicht nach erneuter Prüfung', async () => {
    const store = await geladenerStore(demoOhneKiErgebnisse());
    const vorher = await buchPruefen(store);
    const widerspruch = vorher.find((h) => h.typ === 'pruefen' && h.zitate.some((z) => z.kapitel === 'flut'));
    expect(widerspruch, 'ohne Markierung meldet die Prüfung den Widerspruch').toBeDefined();
    // keine „pruefen“-Hinweise zur bewusst vagen Figur (die Demo-KI liefert absichtlich einen, er wird verworfen)
    expect(vorher.filter((h) => h.typ === 'pruefen' && /Fremde/.test(`${h.titel} ${h.erklaerung}`))).toEqual([]);
    expect(store.getState().kiErgebnis!.verworfen.some((v) => /bewusst Vage/.test(v.grund))).toBe(true);

    const zitat = widerspruch!.zitate.find((z) => z.kapitel === 'flut')!;
    const kt = klartext(store.getState().daten!.kapitel['flut']!.text);
    const [b] = findeZitat(kt, zitat.text);
    await store.getState().planung.stelleRealitaetSetzen(ankerErzeugen('flut', kt, b!.start, b!.ende), 'bewusst_vage');
    await store.getState().alleSpeichernAbwarten();
    store.getState().indexNeuBerechnen();
    expect(store.getState().index.hinweise.filter((h) => h.typ === 'pruefen' && h.zitate.some((z) => z.kapitel === 'flut'))).toEqual([]);

    const nachher = await buchPruefen(store, true);
    expect(nachher.filter((h) => h.typ === 'pruefen' && h.zitate.some((z) => z.kapitel === 'flut'))).toEqual([]);
    expect(store.getState().kiErgebnis!.verworfen.some((v) => /Widerspruch zu bewusst Vagem \(Stelle/.test(v.grund))).toBe(true);
  });
});

describe('AK-9 Der Beziehungs-Zeitregler auf Akt I zeigt weder Vera noch die Fremde', () => {
  it('Akt I: Vera und die Fremde fehlen, beide erscheinen ab ihrem ersten Auftritt', async () => {
    const daten = await ladeDemoProjekt();
    const index = berechneIndex(daten);
    const stufen = aktStufen(daten);
    const ids = (bis: number) => netzBerechnen(daten, index, bis, ALLE_KATEGORIEN).karten.map((k) => k.figur.id);
    expect(ids(stufen[0]!.bisIndex)).not.toContain('vera');
    expect(ids(stufen[0]!.bisIndex)).not.toContain('die-fremde');
    expect(ids(stufen[1]!.bisIndex)).toEqual(expect.arrayContaining(['vera', 'die-fremde']));
  });
  // Klick auf „Akt I“ in der Oberfläche: src/features/beziehungen/beziehungen.test.tsx
});

describe('AK-10 Die Prüfung findet die Hinweise aus dem Mockup', () => {
  it('Lindenhof-Schreibweisen, »Fiete«, Satzende in Kap. 9, zweite Postkarte – aus einem Lauf ohne gespeicherte Ergebnisse', async () => {
    const store = await geladenerStore(demoOhneKiErgebnisse());
    expect(store.getState().daten!.kiHinweise).toEqual([]);
    const hinweise = await buchPruefen(store);
    const d = store.getState().daten!;
    const nr = (id: string) => d.projekt.kapitel.indexOf(id) + 1;

    const kontor = hinweise.find((h) => h.typ === 'schreibweise' && h.zitate.some((z) => z.text.includes('Lindenhof')));
    expect(kontor?.zitate.map((z) => z.text)).toEqual(expect.arrayContaining(['Lindenhof', 'Linden Hof', 'Linden-Hof']));

    const fiete = hinweise.find((h) => h.typ === 'unbekannt' && h.titel.includes('»Fiete«'));
    expect(fiete).toBeDefined();
    expect(fiete!.zitate.every((z) => nr(z.kapitel) === 10)).toBe(true);

    const satzende = hinweise.find((h) => h.typ === 'struktur' && h.titel === 'Kap. 9 endet mitten im Satz');
    expect(satzende?.zitate[0]).toEqual({ kapitel: 'flut', text: expect.stringContaining('nach einem freien Tisch suche') });

    const postkarten = hinweise.find((h) => h.typ === 'offener_faden' && /zweite[n]? Postkarte/.test(h.titel));
    expect(postkarten).toBeDefined();
    expect(postkarten!.zitate.map((z) => nr(z.kapitel)).sort((a, b) => a - b)).toEqual([8, 10]);

    for (const h of [kontor!, fiete!, satzende!, postkarten!]) for (const z of h.zitate) expect(zitatImText(d, z)).toBe(true);
  });
});

// kleine Absicherung der Hilfen: der unabhängige Leser sieht Kapitel als eigene Absätze
describe('Hilfen der Abnahme', () => {
  it('mammoth liest Überschriften und Absätze der exportierten Datei', async () => {
    const store = await geladenerStore(demoFs());
    const datei = await store.getState().exportErstellen({ format: 'docx', kapitel: ['weissraum'], titelseite: false });
    const roh = await rohtextDocx(datei);
    expect(roh.split(/\n+/).filter(Boolean)[0]).toBe('Weißraum');
    expect(PFADE.manuskript).toBe('manuskript');
  });
});
