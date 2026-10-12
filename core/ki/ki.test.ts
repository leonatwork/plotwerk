import { demoDateien, demoFs } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import { berechneIndex, hinweisSchluessel, LEERER_INDEX } from '../index';
import type { Entscheidungen, KiEinstellungen } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { analysePfad, kapitelPfad, ladeProjekt, leereEntscheidungen, MemoryFs, parseKapitel, PFADE, serializeAnalyse, serializeEntscheidungen, serializeKapitel } from '../projekt';
import { ankerErzeugen, ankerFinden, klartext } from '../text';
import {
  ersatztextGrund,
  KiFehler,
  loseEndeId,
  pruefe,
  schaetzeLauf,
  schaetzeTokens,
  schlageErwaehnungenVor,
  STANDARD_KI,
  type KiTransport,
  type PruefFortschritt,
} from './index';

type Body = Record<string, unknown>;

function aufzeichnend(basis: KiTransport = erstelleDemoKiTransport({ verzoegerungMs: 0 })) {
  const bodies: Body[] = [];
  const zaehlBodies: Body[] = [];
  const transport: KiTransport = {
    bereit: () => basis.bereit(),
    async senden(b) {
      bodies.push(structuredClone(b));
      return basis.senden(b);
    },
    async tokenZaehlen(b) {
      zaehlBodies.push(structuredClone(b));
      return basis.tokenZaehlen(b);
    },
  };
  return { transport, bodies, zaehlBodies };
}

/** Kapitel-ID aus dem Aufgaben-Block eines Bodys */
function aufgabeKapitel(body: Body): string {
  const inhalt = (body.messages as { content: { text: string }[] }[])[0]!.content;
  return /kapitel="([^"]+)"/.exec(inhalt[1]!.text)?.[1] ?? '';
}

/** Transport, der pro Anfrage `antwort(kapitel, nr)` als JSON zurückgibt. */
function festerTransport(antwort: (kapitel: string, nr: number) => unknown, roh?: (nr: number) => Body | null): KiTransport & { bodies: Body[] } {
  const bodies: Body[] = [];
  return {
    bodies,
    async bereit() {
      return true;
    },
    async senden(body) {
      bodies.push(body);
      const nr = bodies.length;
      const sonder = roh?.(nr);
      if (sonder) return sonder;
      return {
        type: 'message',
        content: [{ type: 'text', text: JSON.stringify(antwort(aufgabeKapitel(body), nr)) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      };
    },
    async tokenZaehlen() {
      return 100;
    },
  };
}

const analyseFuer = (kapitel: string) => ({
  kapitel,
  zusammenfassung: 'Etwas passiert.',
  kurz: 'Etwas passiert.',
  wendung: 'Keine.',
  antagonistenBezug: '–',
  loseEnden: [],
});

/** Demo-Projekt ohne frühere KI-Analysen (die Fixture kann aktuelle Analysen enthalten). */
function frischeDateien(): Record<string, string> {
  const d = demoDateien();
  for (const p of Object.keys(d)) if (p.startsWith(`${PFADE.analysen}/`)) delete d[p];
  return d;
}

function frischFs(): MemoryFs {
  return new MemoryFs(frischeDateien());
}

function fsMit(aendern: (dateien: Record<string, string>) => void): MemoryFs {
  const dateien = frischeDateien();
  aendern(dateien);
  return new MemoryFs(dateien);
}

function mitEntscheidungen(e: Partial<Entscheidungen>): MemoryFs {
  return fsMit((d) => {
    d[PFADE.entscheidungen] = serializeEntscheidungen({ ...leereEntscheidungen(), ...e });
  });
}

async function klartextVon(kapitel: string): Promise<string> {
  const daten = await ladeProjekt(demoFs());
  return klartext(daten.kapitel[kapitel]!.text);
}

// lokale Hinweise (core/index, Besitzer Kernlogik) – solange berechneIndex ein Stub ist, entfällt der kombinierte Test
const lokal = berechneIndex(await ladeProjekt(demoFs()));
const indexFertig = lokal !== LEERER_INDEX && lokal.hinweise.length > 0;

// ---------------------------------------------------------------------------

describe('Akzeptanz: Prüfung findet die Hinweise aus dem Mockup (Demo-Transport)', () => {
  it('liefert »Fiete«, die zweite Postkarte, Lotte zu spät/zu früh und die Zeitleiste – und verwirft die absichtlich falschen', async () => {
    const { transport, bodies } = aufzeichnend();
    const e = await pruefe(frischFs(), { umfang: 'buch' }, transport, STANDARD_KI);

    expect(bodies).toHaveLength(9);
    expect(e.geprueft).toHaveLength(9);
    expect(e.geprueft).not.toContain('regatta');

    const fiete = e.hinweise.find((h) => h.typ === 'unbekannt');
    expect(fiete?.titel).toContain('»Fiete«');
    expect(fiete?.zitate).toEqual([{ kapitel: 'funkstille', text: 'ob er die Krabben wieder für Fiete mitnimmt' }]);

    const postkarten = e.hinweise.find((h) => h.typ === 'offener_faden');
    expect(postkarten?.zitate.map((z) => z.kapitel)).toEqual(['bis-bald', 'funkstille']);
    expect(postkarten?.zitate[1]?.text).toBe('In der Manteltasche steckt eine neue Postkarte');

    const lotte = e.hinweise.find((h) => h.typ === 'pruefen');
    expect(lotte?.zitate.map((z) => z.kapitel)).toEqual(expect.arrayContaining(['lotte', 'flut']));
    expect(lotte?.zitate).toEqual([
      { kapitel: 'lotte', text: 'fährt mit seinem alten Saab 900 zum Lindenhof' },
      { kapitel: 'flut', text: 'dass ich eine halbe Stunde zu früh bin' },
    ]);
    expect(lotte?.offen).toBe(true);

    expect(e.hinweise.find((h) => h.typ === 'zeitleiste')?.titel).toBe('Nur Montag und Donnerstag sind verankert');

    const gruende = e.verworfen.map((v) => v.grund);
    expect(gruende.some((g) => g.startsWith('Zitat steht nicht wörtlich'))).toBe(true);
    expect(gruende.some((g) => g.startsWith('Formulierungsvorschlag'))).toBe(true);
    expect(gruende.some((g) => g.includes('bewusst Vagem') && g.includes('Die Fremde'))).toBe(true);
  });

  it('jedes Zitat jedes Hinweises steht wörtlich im Kapiteltext; jeder Hinweis hat ein Zitat und einen Schlüssel', async () => {
    const daten = await ladeProjekt(demoFs());
    const e = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    expect(e.hinweise.length).toBeGreaterThanOrEqual(4);
    for (const h of e.hinweise) {
      expect(h.zitate.length).toBeGreaterThan(0);
      expect(h.quelle).toBe('ki');
      expect(h.status).toBe('neu');
      expect(h.schluessel).toBe(hinweisSchluessel(h.typ, h.zitate));
      for (const z of h.zitate) expect(klartext(daten.kapitel[z.kapitel]!.text)).toContain(z.text);
    }
  });

  it('liefert Analysen mit Text-Hash, Modell und lose Enden als Slug', async () => {
    const e = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI, {
      jetzt: () => new Date('2026-10-09T12:00:00Z'),
    });
    expect(e.analysen.map((a) => a.kapitel)).toEqual(['grundriss', 'fassade', 'lotte', 'staub', 'weissraum', 'ebbe', 'bis-bald', 'flut', 'funkstille']);
    const funkstille = e.analysen.find((a) => a.kapitel === 'funkstille')!;
    expect(funkstille.textHash).toMatch(/^[0-9a-f]{8,}$/);
    expect(funkstille.modell).toBe('claude-sonnet-5-5');
    expect(funkstille.datum).toBe('2026-10-09T12:00:00.000Z');
    expect(funkstille.loseEnden).toEqual(
      expect.arrayContaining([
        { id: 'fiete', name: '»Fiete«', eroeffnet: true },
        { id: 'die-postkarten-in-der-manteltasche', name: 'Die Postkarten in der Manteltasche', eroeffnet: false },
      ]),
    );
  });

  it.runIf(indexFertig)('zusammen mit core/index: Lindenhof-Schreibweisen, Satzende Kap. 9, »Fiete«, zweite Postkarte', async () => {
    const e = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const alle = [...lokal.hinweise, ...e.hinweise];
    const zitate = (h: (typeof alle)[number]) => h.zitate.map((z) => z.text).join(' | ');
    expect(alle.some((h) => h.typ === 'schreibweise' && /Linden[ -]?Hof/i.test(`${h.titel} ${zitate(h)}`))).toBe(true);
    expect(alle.some((h) => h.typ === 'struktur' && h.zitate.some((z) => z.kapitel === 'flut'))).toBe(true);
    expect(alle.some((h) => h.typ === 'unbekannt' && h.titel.includes('Fiete'))).toBe(true);
    expect(alle.some((h) => h.typ === 'offener_faden' && zitate(h).includes('Postkarte'))).toBe(true);
  });
});

describe('Harte Regel 1: die KI schreibt nie (Laufzeit)', () => {
  it('voller Prüf- und Vorschlagslauf gegen ein Dateisystem, das bei jedem Schreibversuch wirft → 0 Schreibversuche', async () => {
    const innen = frischFs();
    const protokoll: string[] = [];
    const wachhund = {
      lesen: (p: string) => (protokoll.push(`lesen ${p}`), innen.lesen(p)),
      auflisten: (o: string) => (protokoll.push(`auflisten ${o}`), innen.auflisten(o)),
      existiert: (p: string) => (protokoll.push(`existiert ${p}`), innen.existiert(p)),
      async schreiben(p: string) {
        protokoll.push(`schreiben ${p}`);
        throw new Error(`Schreibversuch auf ${p}`);
      },
      async entfernen(p: string) {
        protokoll.push(`entfernen ${p}`);
        throw new Error(`Löschversuch auf ${p}`);
      },
    };
    const leser: ProjektLeser = wachhund;
    const transport = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    await schaetzeLauf(leser, { umfang: 'buch' }, transport, STANDARD_KI);
    await pruefe(leser, { umfang: 'buch' }, transport, STANDARD_KI);
    await pruefe(leser, { umfang: 'kapitel', kapitel: 'funkstille', tiefencheck: true }, transport, STANDARD_KI);
    for (const k of ['funkstille', 'ebbe', 'flut']) await schlageErwaehnungenVor(leser, k, transport, STANDARD_KI);

    expect(protokoll.some((z) => z.startsWith('lesen '))).toBe(true);
    expect(protokoll.filter((z) => z.startsWith('schreiben') || z.startsWith('entfernen'))).toEqual([]);
  });
});

describe('Allowlist (E12): private Felder gehen nie an das Modell', () => {
  const MARKER = 'GEHEIM';
  /** Plan-Felder von Figuren und Kapiteln sind seit 2026-10-09 freigegeben (F-05). */
  const ERLAUBT = 'PLANERLAUBT';
  function ersetze(d: Record<string, string>, pfad: string, alt: string | RegExp, neu: string) {
    const vorher = d[pfad];
    expect(vorher, pfad).toBeDefined();
    d[pfad] = vorher!.replace(alt, neu);
    expect(d[pfad], `${pfad}: ${String(alt)}`).not.toBe(vorher);
  }

  it('wahrheit, notizen, kurz, Beschreibungen, Anmerkungen, Ideen, Abweichungen, Akte, Stränge tauchen in keinem Body auf; Plan-Felder schon', async () => {
    const fs = fsMit((d) => {
      ersetze(d, 'figuren/paul.md', 'Privat (Testtext): Paul erinnert sich', `${MARKER}-WAHRHEIT Paul erinnert sich`);
      ersetze(d, 'figuren/paul.md', 'Privat (Testtext): Bleistift-Motiv', `${MARKER}-NOTIZ Bleistift-Motiv`);
      ersetze(d, 'figuren/paul.md', 'Beruf: Architekt', `Beruf: ${ERLAUBT}-PLANFELD`);
      ersetze(d, 'figuren/paul.md', 'kurz: Ich-Erzähler', `kurz: ${MARKER}-KURZ`);
      ersetze(d, 'figuren/herr-kessler.md', '  - Herrn Kessler', `  - ${MARKER}-FORM`);
      ersetze(d, 'figuren/lotte.md', 'art: Kleinanzeige, nur Chat', `art: ${MARKER}-BEZIEHUNG`);
      ersetze(d, 'plan/kapitel/ebbe.md', /\nPaul beendet den Abend mit einer Ausrede und meldet sich danach nicht mehr bei Vera\.\n$/, `\n${ERLAUBT}-PLANNOTIZ\n`);
      ersetze(d, 'plan/kapitel/ebbe.md', 'notiz: Paul schreibt Vera am Ende doch die Wahrheit.', `notiz: ${MARKER}-ABWEICHUNG`);
      ersetze(d, 'plan/kapitel/ebbe.md', 'szene: Der Abend mit Vera endet', `szene: ${ERLAUBT}-SZENE`);
      ersetze(d, 'anmerkungen.json', 'Wo setzen sie sich hin? Szene noch ausführen.', `${MARKER}-ANMERKUNG`);
      ersetze(d, 'plan/ideen.md', 'titel: Wer steckt die zweite Postkarte in Pauls Mantel?', `titel: ${MARKER}-IDEE`);
      ersetze(d, 'orte/lindenhof.md', 'Gartencafé unter Linden, Treffpunkt mit Lotte.', `${MARKER}-ORTBESCHREIBUNG`);
      ersetze(d, 'orte/lindenhof.md', 'Privat (Testtext): Schreibweise', `${MARKER}-ORTNOTIZ`);
      ersetze(d, 'gruppen/konsortium.md', 'Name, Mitglieder und erste Szene noch offen.', `${MARKER}-GRUPPENNOTIZ`);
      ersetze(d, 'gruppen/konsortium.md', 'tritt auf? (geplant)', `${MARKER}-PRAESENZ`);
      ersetze(d, 'plan/akte.md', 'Flut: Jemand kennt Pauls Wege besser als er selbst.', `${MARKER}-AKT`);
      ersetze(d, 'plan/straenge.md', 'name: Die Postkarten', `name: ${MARKER}-STRANG`);
      ersetze(d, 'projekt.md', 'Demo-Projekt mit Testdaten.', `${MARKER}-PROJEKTNOTIZ`);
    });
    const { transport, bodies, zaehlBodies } = aufzeichnend();
    await schaetzeLauf(fs, { umfang: 'buch' }, transport, STANDARD_KI);
    await pruefe(fs, { umfang: 'buch' }, transport, STANDARD_KI);
    await pruefe(fs, { umfang: 'buch', tiefencheck: true }, transport, STANDARD_KI);
    for (const k of ['funkstille', 'ebbe', 'lotte']) await schlageErwaehnungenVor(fs, k, transport, STANDARD_KI);

    expect(bodies.length).toBeGreaterThan(18);
    for (const body of [...bodies, ...zaehlBodies]) {
      const json = JSON.stringify(body);
      expect(json).not.toContain(MARKER);
      expect(json).not.toContain('Privat (Testtext)');
    }
    const prefix = (bodies[0]!.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(prefix).toContain(`  Planung · Beruf: ${ERLAUBT}-PLANFELD`);
    expect(prefix).toContain(`Geplante Szene: ${ERLAUBT}-SZENE`);
    expect(prefix).toContain(`Was hier passieren soll: ${ERLAUBT}-PLANNOTIZ`);
    expect(prefix).toContain('Herr Kessler (id: herr-kessler)');
    expect(prefix).toContain('Kornspeicher (id: kornspeicher) · auch: Silo');
    expect(prefix).toContain('Konsortium (id: konsortium) · Antagonist · geplant');
  });

  it('markiert bewusst Vages ausdrücklich als absichtlich mehrdeutig', async () => {
    const { transport, bodies } = aufzeichnend();
    await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'bis-bald' }, transport, STANDARD_KI);
    const prefix = (bodies[0]!.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(prefix).toMatch(/Die Fremde \(id: die-fremde\).*Existenz: bewusst vage – absichtlich mehrdeutig, nie als Widerspruch melden/);
    expect(prefix).toContain('- bewusst vage – absichtlich mehrdeutig, nie als Widerspruch melden: Was in der Nacht passiert ist');
    expect(prefix).toContain('- noch offen: Ob die Postkarte von der Fremden stammt');
    expect(prefix).toContain('<kapitel nr="4" id="regatta" titel="Regatta" ohneText="ja"></kapitel>');
  });
});

describe('Request-Format (Messages-API, Foundry)', () => {
  function alleObjekte(schema: unknown, f: (o: Record<string, unknown>) => void) {
    if (Array.isArray(schema)) schema.forEach((s) => alleObjekte(s, f));
    else if (schema && typeof schema === 'object') {
      const o = schema as Record<string, unknown>;
      if (o.type === 'object') f(o);
      Object.values(o).forEach((v) => alleObjekte(v, f));
    }
  }

  it('Prüfung: Deployment-Name, max_tokens, kein thinking/Prefill/tool_choice, Effort, Structured Outputs, Cache-Prefix', async () => {
    const einstellungen: KiEinstellungen = { endpoint: 'https://x.services.ai.azure.com/anthropic', deployments: { erkennung: 'h', pruefung: 'mein-sonnet', tiefencheck: 'mein-opus' } };
    const { transport, bodies } = aufzeichnend();
    await pruefe(frischFs(), { umfang: 'buch' }, transport, einstellungen);
    await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'ebbe', tiefencheck: true }, transport, einstellungen);
    const sonnet = bodies.slice(0, 9);
    const opus = bodies[9]!;

    for (const b of bodies) {
      expect(b.max_tokens).toBe(16000);
      expect(b).not.toHaveProperty('thinking');
      expect(b).not.toHaveProperty('tool_choice');
      expect(b).not.toHaveProperty('tools');
      const nachrichten = b.messages as { role: string; content: { type: string; text: string; cache_control?: unknown }[] }[];
      expect(nachrichten).toHaveLength(1);
      expect(nachrichten[0]!.role).toBe('user');
      expect(nachrichten[0]!.content[0]!.cache_control).toEqual({ type: 'ephemeral' });
      expect(nachrichten[0]!.content[1]!.cache_control).toBeUndefined();
      const format = (b.output_config as { format: { type: string; schema: unknown } }).format;
      expect(format.type).toBe('json_schema');
      alleObjekte(format.schema, (o) => expect(o.additionalProperties).toBe(false));
      const hinweis = ((format.schema as { properties: { hinweise: { items: { properties: object } } } }).properties.hinweise.items.properties);
      expect(Object.keys(hinweis).sort()).toEqual(['erklaerung', 'plan', 'titel', 'typ', 'zitate']);
      const plan = (hinweis as { plan: { properties: object } }).plan;
      expect(Object.keys(plan.properties).sort()).toEqual(['feld', 'figur', 'kapitel']);
    }
    expect(new Set(sonnet.map((b) => b.model))).toEqual(new Set(['mein-sonnet']));
    expect(new Set(sonnet.map((b) => (b.output_config as { effort: string }).effort))).toEqual(new Set(['medium']));
    expect(opus.model).toBe('mein-opus');
    expect((opus.output_config as { effort: string }).effort).toBe('high');
    // stabiler Prefix: system und Buchkontext sind in allen Anfragen identisch
    const prefixe = new Set(bodies.map((b) => JSON.stringify([b.system, (b.messages as { content: unknown[] }[])[0]!.content[0]])));
    expect(prefixe.size).toBe(1);
  });

  it('Erwähnungen: Haiku-Deployment mit effort low; count_tokens-Body ohne max_tokens und output_config', async () => {
    const { transport, bodies, zaehlBodies } = aufzeichnend();
    await schlageErwaehnungenVor(frischFs(), 'funkstille', transport, STANDARD_KI);
    expect(bodies[0]!.model).toBe('claude-haiku-5-5');
    expect((bodies[0]!.output_config as { effort: string }).effort).toBe('low');
    await schaetzeLauf(frischFs(), { umfang: 'buch' }, transport, STANDARD_KI);
    expect(zaehlBodies.length).toBe(2);
    for (const z of zaehlBodies) {
      expect(z).not.toHaveProperty('max_tokens');
      expect(z).not.toHaveProperty('output_config');
      expect(z.model).toBe('claude-sonnet-5-5');
    }
  });
});

describe('Zitatprüfung (harte Regel 3, E6)', () => {
  it('akzeptiert Zitate mit abweichenden Anführungszeichen/Leerraum, verwirft erfundene, falsch zugeordnete und fremde', async () => {
    const transport = festerTransport((kapitel) => ({
      hinweise: [
        { typ: 'sprache', titel: 'A', zitate: [{ kapitel, text: 'Nur eine halbe Stunde,   Papa, ich rudere auch ganz allein' }], erklaerung: 'Beobachtung.' },
        { typ: 'sprache', titel: 'B', zitate: [{ kapitel, text: '„Schön, dass du da bist“ sage ich' }], erklaerung: 'Beobachtung.' },
        { typ: 'pruefen', titel: 'C', zitate: [{ kapitel, text: 'Lotte trägt ein rotes Kleid' }], erklaerung: 'Erfunden.' },
        { typ: 'pruefen', titel: 'D', zitate: [{ kapitel, text: 'fährt mit seinem alten Saab 900 zum Lindenhof' }], erklaerung: 'Steht in Kap. 3.' },
        { typ: 'pruefen', titel: 'E', zitate: [{ kapitel: 'kapitel-99', text: 'Ich steige aus' }], erklaerung: 'Unbekannt.' },
        { typ: 'pruefen', titel: 'F', zitate: [], erklaerung: 'Ohne Zitat.' },
        { typ: 'pruefen', titel: 'G', zitate: [{ kapitel: 'lotte', text: 'fährt mit seinem alten Saab 900 zum Lindenhof' }], erklaerung: 'Nur anderes Kapitel.' },
        { typ: 'schreibweise', titel: 'H', zitate: [{ kapitel, text: 'Ich steige aus' }], erklaerung: 'Lokaler Typ.' },
      ],
      analysen: [analyseFuer(kapitel)],
    }));
    const e = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'flut' }, transport, STANDARD_KI);
    expect(e.hinweise.map((h) => h.titel)).toEqual(['A', 'B']);
    expect(e.hinweise[0]!.zitate[0]!.text).toBe('Nur eine halbe Stunde, Papa, ich rudere auch ganz allein');
    // Text steht im Kapitel mit „…" – das mitzitierte öffnende Anführungszeichen bleibt im gespeicherten Zitat
    expect(e.hinweise[1]!.zitate[0]!.text).toBe('„Schön, dass du da bist" sage ich');
    const gruende = e.verworfen.map((v) => v.grund);
    expect(gruende).toHaveLength(6);
    expect(gruende.filter((g) => g.startsWith('Zitat steht nicht wörtlich in Kap. 9'))).toHaveLength(2);
    expect(gruende).toContain('Zitat aus unbekanntem Kapitel „kapitel-99“');
    expect(gruende).toContain('Hinweis ohne Zitat');
    expect(gruende).toContain('Hinweis betrifft kein geprüftes Kapitel');
    expect(gruende).toContain('Unbekannter Hinweis-Typ „schreibweise“');
  });
});

describe('Ersatztext-Filter (harte Regel 2)', () => {
  it.each([
    'Stattdessen sollte Paul zögern.',
    'Besser: „Ich nehme sie in den Arm“.',
    'Formuliere den Satz neutraler.',
    'Man müsste den Absatz umformulieren.',
    'Schreib lieber „sie“.',
    'Schreibe besser im Präteritum.',
    'Vorschlag: den Absatz kürzen.',
    '„Sie“ → „sie“',
    'Ersetze „Sie“ durch „sie“.',
    'Statt „Sie“ lieber „sie“.',
    'Hier könnte man schreiben, dass er zögert.',
    'Ändere den Satz in „Er zögert.“',
    'Das wäre besser im Präsens.',
    'Ich schlage vor, den Satz zu kürzen.',
    'Alternative: Er kommt pünktlich.',
    'Streiche den Nebensatz.',
    'Ergänze einen Satz über das Wetter.',
    'Ein Formulierungsvorschlag folgt.',
  ])('verwirft „%s“', (text) => {
    expect(ersatztextGrund(text)).not.toBeNull();
  });

  it.each([
    'In Kap. 3 fährt Paul selbst und kommt wegen der Klappbrücke zu spät, in Kap. 9 steigt er aus einem fremden Volvo und ist eine halbe Stunde zu früh. Wenn beide Kapitel dasselbe Treffen meinen, widersprechen sich die Angaben.',
    'Die erste Postkarte taucht nach der Nacht im Fährhaus in Kap. 8 auf, die zweite in Kap. 10. Woher die zweite kommt, bleibt bisher unbeantwortet.',
    'Der Name Fiete kommt nur hier vor und gehört zu keiner angelegten Figur.',
    'Nur Kap. 6 und Kap. 10 nennen einen Wochentag. Die Abstände zwischen den übrigen Kapiteln sind offen.',
    'Die Formulierung „Sie“ ist großgeschrieben, obwohl die dritte Person gemeint ist.',
    'Ab Kap. 5 ändert sich der Ton, Paul antwortet nur noch knapp.',
    'Statt im Saab fährt Paul in Kap. 9 offenbar in einem Volvo mit.',
  ])('lässt „%s“ durch', (text) => {
    expect(ersatztextGrund(text)).toBeNull();
  });

  it('verwirft Erklärungen, die längeren Text zitieren, der nicht im Buch steht', async () => {
    const transport = festerTransport((kapitel) => ({
      hinweise: [
        { typ: 'sprache', titel: 'Begrüßung', zitate: [{ kapitel, text: 'Schön, dass du da bist' }], erklaerung: 'Gemeint ist wohl „Du siehst wirklich umwerfend aus heute“.' },
        { typ: 'sprache', titel: 'Begrüßung 2', zitate: [{ kapitel, text: 'Ich nehme Sie in den Arm' }], erklaerung: 'Neben „Ich nehme Sie in den Arm“ steht die Begrüßung.' },
      ],
      analysen: [analyseFuer(kapitel)],
    }));
    const e = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'flut' }, transport, STANDARD_KI);
    expect(e.hinweise.map((h) => h.titel)).toEqual(['Begrüßung 2']);
    expect(e.verworfen[0]!.grund).toMatch(/nicht im Buch steht/);
  });
});

describe('Bewusst vage (harte Regel 4) und Etikett „offen“', () => {
  it('kein „pruefen“ zu einer bewusst vagen Figur oder Stelle; andere Typen bleiben', async () => {
    const transport = festerTransport((kapitel) =>
      kapitel === 'bis-bald'
        ? {
            hinweise: [
              { typ: 'pruefen', titel: 'Wer ist sie?', zitate: [{ kapitel, text: 'Die Fremde auf der Bank gegenüber schläft noch' }], erklaerung: 'Widerspruch.' },
              { typ: 'offener_faden', titel: 'Wer ist sie? (Faden)', zitate: [{ kapitel, text: 'Die Fremde auf der Bank gegenüber schläft noch' }], erklaerung: 'Bleibt offen.' },
            ],
            analysen: [analyseFuer(kapitel)],
          }
        : {
            hinweise: [
              { typ: 'pruefen', titel: 'Fenster zweimal', zitate: [{ kapitel, text: 'Achtzehn Fenster auf jeder Seite' }], erklaerung: 'Er zählt die Fenster zweimal.' },
              { typ: 'pruefen', titel: 'Staub', zitate: [{ kapitel, text: 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen' }], erklaerung: 'Später ist der Boden sauber, ohne dass jemand fegt.' },
            ],
            analysen: [analyseFuer(kapitel)],
          },
    );
    const a = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'bis-bald' }, transport, STANDARD_KI);
    expect(a.hinweise.map((h) => h.titel)).toEqual(['Wer ist sie? (Faden)']);
    expect(a.verworfen[0]!.grund).toBe('Widerspruch zu bewusst Vagem (Figur „Die Fremde“)');

    const b = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'staub' }, transport, STANDARD_KI);
    expect(b.hinweise.map((h) => h.titel)).toEqual(['Staub']);
    expect(b.verworfen[0]!.grund).toContain('Paul zählt die Fenster immer wieder');
  });

  it('verankerte bewusst vage Textstelle (entscheidungen.realitaet) blockiert „pruefen“ mit überlappendem Zitat', async () => {
    const text = await klartextVon('funkstille');
    const start = text.indexOf('Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich');
    const anker = ankerErzeugen('funkstille', text, start, start + 'Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich'.length);
    const fs = mitEntscheidungen({ realitaet: [{ anker, stufe: 'bewusst_vage' }] });
    const transport = festerTransport((kapitel) => ({
      hinweise: [
        { typ: 'pruefen', titel: 'Lieferwagen', zitate: [{ kapitel, text: 'Aufschrift Kranich' }], erklaerung: 'Wer fährt da?' },
        { typ: 'pruefen', titel: 'Fischstand', zitate: [{ kapitel, text: 'Erst am Fischstand dreht er sie um' }], erklaerung: 'Warum erst dort?' },
      ],
      analysen: [analyseFuer(kapitel)],
    }));
    const e = await pruefe(fs, { umfang: 'kapitel', kapitel: 'funkstille' }, transport, STANDARD_KI);
    expect(e.hinweise.map((h) => h.titel)).toEqual(['Fischstand']);
    expect(e.verworfen[0]!.grund).toBe('Widerspruch zu bewusst Vagem (Stelle „Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich“)');
  });

  it('setzt „offen“ bei Figuren mit Existenz „noch offen“ und offenen Realitätseinträgen', async () => {
    const transport = festerTransport((kapitel) => ({
      hinweise: [
        { typ: 'offener_faden', titel: 'Der Mann', zitate: [{ kapitel, text: 'Ein alter Mann bleibt neben ihm stehen' }], erklaerung: 'Taucht nie wieder auf.' },
        { typ: 'pruefen', titel: 'Kopenhagen', zitate: [{ kapitel, text: 'Das stimmt nicht' }], erklaerung: 'Er lügt Vera an.' },
      ],
      analysen: [analyseFuer(kapitel)],
    }));
    const e = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'ebbe' }, transport, STANDARD_KI);
    expect(e.hinweise.find((h) => h.titel === 'Der Mann')?.offen).toBe(true);
    expect(e.hinweise.find((h) => h.titel === 'Kopenhagen')?.offen).toBeUndefined();
  });
});

describe('Ergebnis-Cache pro Kapitel-Hash (E13)', () => {
  it('überspringt unveränderte Kapitel mit Analyse, prüft geänderte; Tiefencheck und „erzwingen“ prüfen alles', async () => {
    const fs = frischFs();
    const erst = aufzeichnend();
    const r1 = await pruefe(fs, { umfang: 'buch' }, erst.transport, STANDARD_KI);
    expect(erst.bodies).toHaveLength(9);
    for (const a of r1.analysen) await fs.schreiben(analysePfad(a.kapitel), serializeAnalyse(a));

    const zweit = aufzeichnend();
    const r2 = await pruefe(fs, { umfang: 'buch' }, zweit.transport, STANDARD_KI);
    expect(zweit.bodies).toHaveLength(0);
    expect(r2.uebersprungen).toHaveLength(9);
    expect(await schaetzeTokens(fs, { umfang: 'buch' }, zweit.transport, STANDARD_KI)).toBe(0);

    const einzeln = aufzeichnend();
    const r3 = await pruefe(fs, { umfang: 'kapitel', kapitel: 'ebbe' }, einzeln.transport, STANDARD_KI);
    expect(einzeln.bodies).toHaveLength(0);
    expect(r3.uebersprungen).toEqual(['ebbe']);

    const alt = (await fs.lesen(kapitelPfad('ebbe')))!;
    const k = parseKapitel(alt, 'ebbe');
    await fs.schreiben(kapitelPfad('ebbe'), serializeKapitel({ ...k, text: `${k.text}\n\nEin neuer Absatz.` }, alt));
    const dritt = aufzeichnend();
    const r4 = await pruefe(fs, { umfang: 'buch' }, dritt.transport, STANDARD_KI);
    expect(dritt.bodies.map(aufgabeKapitel)).toEqual(['ebbe']);
    expect(r4.uebersprungen).toHaveLength(8);
    expect(r4.analysen[0]!.textHash).not.toBe(r1.analysen.find((a) => a.kapitel === 'ebbe')!.textHash);

    const tief = aufzeichnend();
    await pruefe(fs, { umfang: 'buch', tiefencheck: true }, tief.transport, STANDARD_KI);
    expect(tief.bodies).toHaveLength(9);
    expect(tief.bodies[0]!.model).toBe('claude-opus-5-5');

    const erzwungen = aufzeichnend();
    await pruefe(fs, { umfang: 'kapitel', kapitel: 'lotte', erzwingen: true }, erzwungen.transport, STANDARD_KI);
    expect(erzwungen.bodies.map(aufgabeKapitel)).toEqual(['lotte']);
  });

  it('Analyse mit leerem oder abweichendem textHash gilt als veraltet', async () => {
    const fs = frischFs();
    const r1 = await pruefe(fs, { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    for (const a of r1.analysen) {
      const textHash = a.kapitel === 'funkstille' ? '' : a.kapitel === 'lotte' ? 'abc' : a.textHash;
      await fs.schreiben(analysePfad(a.kapitel), serializeAnalyse({ ...a, textHash }));
    }
    const { transport, bodies } = aufzeichnend();
    await pruefe(fs, { umfang: 'buch' }, transport, STANDARD_KI);
    expect(bodies.map(aufgabeKapitel)).toEqual(['lotte', 'funkstille']);
  });
});

describe('Entscheidungen, Antwortfehler, Abbruch', () => {
  it('gibt bereits entschiedene Hinweise nicht zurück', async () => {
    const schluessel = hinweisSchluessel('unbekannt', [{ kapitel: 'funkstille', text: 'ob er die Krabben wieder für Fiete mitnimmt' }]);
    const fs = mitEntscheidungen({ hinweise: [{ schluessel, entscheidung: 'absicht', datum: '2026-10-08' }] });
    const e = await pruefe(fs, { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    expect(e.hinweise.some((h) => h.schluessel === schluessel)).toBe(false);
    expect(e.bereitsEntschieden).toBe(1);
  });

  it('behandelt refusal und max_tokens als verworfen mit Grund und prüft weiter', async () => {
    const transport = festerTransport(
      (kapitel) => ({ hinweise: [], analysen: [analyseFuer(kapitel)] }),
      (nr) =>
        nr === 1
          ? { type: 'message', content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, usage: { input_tokens: 5, output_tokens: 0 } }
          : nr === 2
            ? { type: 'message', content: [{ type: 'text', text: '{"hinweise":[' }], stop_reason: 'max_tokens', usage: { input_tokens: 5, output_tokens: 16000 } }
            : nr === 3
              ? { type: 'message', content: [{ type: 'text', text: 'kein json' }], stop_reason: 'end_turn', usage: {} }
              : null,
    );
    const e = await pruefe(frischFs(), { umfang: 'buch' }, transport, STANDARD_KI);
    expect(e.geprueft).toHaveLength(9);
    expect(e.analysen).toHaveLength(6);
    const gruende = e.verworfen.map((v) => v.grund);
    expect(gruende[0]).toBe('Kap. 1 „Grundriss“: Das Modell hat die Anfrage abgelehnt (refusal, Kategorie cyber).');
    expect(gruende[1]).toBe('Kap. 2 „Fassade“: Antwort abgeschnitten: Das Token-Limit (max_tokens) wurde erreicht.');
    expect(gruende[2]).toBe('Kap. 3 „Lotte“: Die Antwort ist kein gültiges JSON.');
    expect(e.tokens.ausgabe).toBeGreaterThanOrEqual(16000);
  });

  it('Fehler bei der ersten Anfrage → KiFehler; bei einer späteren → Teilergebnis mit fehler', async () => {
    const wirft = (ab: number): KiTransport => {
      const basis = erstelleDemoKiTransport({ verzoegerungMs: 0 });
      let n = 0;
      return {
        bereit: () => basis.bereit(),
        tokenZaehlen: (b) => basis.tokenZaehlen(b),
        async senden(b) {
          n += 1;
          if (n >= ab) throw 'HTTP 401: invalid api key';
          return basis.senden(b);
        },
      };
    };
    await expect(pruefe(frischFs(), { umfang: 'buch' }, wirft(1), STANDARD_KI)).rejects.toMatchObject({ name: 'KiFehler', art: 'api', message: 'HTTP 401: invalid api key' });
    const teil = await pruefe(frischFs(), { umfang: 'buch' }, wirft(3), STANDARD_KI);
    expect(teil.geprueft).toEqual(['grundriss', 'fassade']);
    expect(teil.analysen).toHaveLength(2);
    expect(teil.fehler).toBe('Kap. 3 „Lotte“: HTTP 401: invalid api key');
  });

  it('Fehlerantwort der API (type: error) wird zum KiFehler', async () => {
    const transport = festerTransport(() => ({}), () => ({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    await expect(pruefe(frischFs(), { umfang: 'buch' }, transport, STANDARD_KI)).rejects.toThrow('KI-Dienst meldet einen Fehler (authentication_error): invalid x-api-key');
  });

  it('nicht bereit → KiFehler „nicht_bereit“, ohne Anfrage', async () => {
    const t = festerTransport(() => ({}));
    t.bereit = async () => false;
    await expect(pruefe(frischFs(), { umfang: 'buch' }, t, STANDARD_KI)).rejects.toBeInstanceOf(KiFehler);
    await expect(schlageErwaehnungenVor(frischFs(), 'funkstille', t, STANDARD_KI)).rejects.toMatchObject({ art: 'nicht_bereit' });
    expect(t.bodies).toHaveLength(0);
  });

  it('ungültiger Auftrag: Kapitel ohne Text oder unbekannt', async () => {
    const t = festerTransport(() => ({}));
    await expect(pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'regatta' }, t, STANDARD_KI)).rejects.toThrow('Kap. 4 „Regatta“ hat noch keinen Text.');
    await expect(pruefe(frischFs(), { umfang: 'kapitel' }, t, STANDARD_KI)).rejects.toMatchObject({ art: 'auftrag' });
  });

  it('meldet Fortschritt und bricht zwischen zwei Anfragen ab', async () => {
    const steuerung = new AbortController();
    const schritte: PruefFortschritt[] = [];
    const e = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI, {
      signal: steuerung.signal,
      fortschritt(f) {
        schritte.push(f);
        if (f.erledigt === 2) steuerung.abort();
      },
    });
    expect(schritte[0]).toEqual({ erledigt: 0, gesamt: 9, kapitel: 'grundriss', titel: 'Grundriss' });
    expect(e.geprueft).toHaveLength(3);
    expect(e.fehler).toBe('Die Prüfung wurde abgebrochen.');
    expect(schritte[schritte.length - 1]).toMatchObject({ erledigt: 3, kapitel: null });
  });
});

describe('Token- und Kostenschätzung', () => {
  it('nutzt count_tokens, rechnet Prefix-Cache ein und fällt ohne count_tokens auf Zeichen/3 zurück', async () => {
    const t = erstelleDemoKiTransport({ verzoegerungMs: 0 });
    const s = await schaetzeLauf(frischFs(), { umfang: 'buch' }, t, STANDARD_KI);
    expect(s.anfragen).toBe(9);
    expect(s.gezaehlt).toBe(true);
    expect(s.prefixTokens).toBeGreaterThan(1000);
    expect(s.eingabeTokens).toBeGreaterThan(s.prefixTokens * 9);
    expect(await schaetzeTokens(frischFs(), { umfang: 'buch' }, t, STANDARD_KI)).toBe(s.eingabeTokens);

    const ohne: KiTransport = { ...t, tokenZaehlen: async () => Promise.reject(new Error('404')) };
    const f = await schaetzeLauf(frischFs(), { umfang: 'buch' }, ohne, STANDARD_KI);
    expect(f.gezaehlt).toBe(false);
    expect(f.eingabeTokens).toBeGreaterThan(0);

    const tief = await schaetzeLauf(frischFs(), { umfang: 'buch', tiefencheck: true }, t, STANDARD_KI);
    expect(tief.modell).toBe('claude-opus-5-5');
    expect(tief.kostenUsd).toBeGreaterThan(s.kostenUsd);
    // Sonnet 5.5: 2 $/10 $ pro Mio.; Cache-Lesen 10 %, Cache-Schreiben 125 %
    const rest = (s.eingabeTokens / 9 - s.prefixTokens) * 9;
    const erwartet = (rest * 2 + s.prefixTokens * 8 * 0.2 + s.prefixTokens * 2.5 + s.ausgabeTokens * 10) / 1e6;
    expect(s.kostenUsd).toBeCloseTo(erwartet, 6);
  });
});

describe('Erwähnungs-Vorschläge (Haiku)', () => {
  it('schlägt »Fiete«, „Der Mann am Fischstand“ und „Linden-Hof“ vor – mit gültigem Anker', async () => {
    const v = await schlageErwaehnungenVor(frischFs(), 'funkstille', erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    expect(v.map((x) => x.text)).toEqual(['Linden-Hof', 'Der Mann am Fischstand', 'Fiete']);
    expect(v[0]!.ziel).toEqual({ typ: 'ort', id: 'lindenhof' });
    expect(v[2]).toMatchObject({ ziel: null, zielTyp: 'figur' });
    const text = await klartextVon('funkstille');
    for (const x of v) {
      const b = ankerFinden(text, x.anker);
      expect(b).not.toBeNull();
      expect(text.slice(b!.start, b!.ende)).toBe(x.text);
    }
  });

  it('filtert entschiedene Stellen, falsche Zitate, unbekannte Ziele und exakt bekannte Namen', async () => {
    const text = await klartextVon('funkstille');
    const p = text.indexOf('Fiete');
    const fs = mitEntscheidungen({ zuordnungen: [{ anker: ankerErzeugen('funkstille', text, p, p + 5), ziel: null, status: 'verworfen' }] });
    const transport = festerTransport(() => ({
      vorschlaege: [
        { text: 'Fiete', zitat: 'ob er die Krabben wieder für Fiete mitnimmt', zielTyp: 'unbekannte_figur', zielId: '', begruendung: 'x' },
        { text: 'Hafenmeister', zitat: 'Der Hafenmeister winkt', zielTyp: 'unbekannte_figur', zielId: '', begruendung: 'x' },
        { text: 'Kranich', zitat: 'ob er die Krabben wieder für Fiete mitnimmt', zielTyp: 'unbekannte_figur', zielId: '', begruendung: 'nicht im Zitat' },
        { text: 'Paul', zitat: 'Paul dreht leiser', zielTyp: 'figur', zielId: 'paul', begruendung: 'exakt bekannt' },
        { text: 'Möwen', zitat: 'Paul hört Möwen', zielTyp: 'figur', zielId: 'gibt-es-nicht', begruendung: 'falsche ID' },
        { text: 'Fischstand', zitat: 'Erst am Fischstand dreht er sie um', zielTyp: 'unbekannter_ort', zielId: '', begruendung: 'ist bekannt' },
        { text: 'Mann', zitat: 'Der Mann am Fischstand fragt', zielTyp: 'unbekannte_figur', zielId: '', begruendung: 'Verkäufer' },
      ],
    }));
    const v = await schlageErwaehnungenVor(fs, 'funkstille', transport, STANDARD_KI);
    expect(v.map((x) => x.text)).toEqual(['Mann']);
    expect(v[0]!.begruendung).toBe('Verkäufer');
  });
});

describe('Lose Enden', () => {
  it('IDs sind stabile Slugs', () => {
    expect(loseEndeId('»Fiete«')).toBe('fiete');
    expect(loseEndeId('Die Fremde und die Postkarten')).toBe('die-fremde-und-die-postkarten');
    expect(loseEndeId('Speicher wechseln den Besitzer')).toBe('speicher-wechseln-den-besitzer');
    expect(loseEndeId('Größe & Übermut')).toBe('groesse-uebermut');
  });
});

describe('F-05: Planung gegen Text', () => {
  it('ohne Plan-Abgleich (E16) gehen keine Plan-Felder an das Modell und die Anfrage wird kleiner', async () => {
    const mit = aufzeichnend();
    const ohne = aufzeichnend();
    const sMit = await schaetzeLauf(frischFs(), { umfang: 'buch' }, mit.transport, STANDARD_KI);
    const sOhne = await schaetzeLauf(frischFs(), { umfang: 'buch', ohnePlan: true }, ohne.transport, STANDARD_KI);
    await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'flut', ohnePlan: true }, ohne.transport, STANDARD_KI);
    expect(sOhne.prefixTokens).toBeLessThan(sMit.prefixTokens);
    expect(ohne.bodies.length).toBeGreaterThan(0);
    for (const body of [...ohne.bodies, ...ohne.zaehlBodies]) {
      // der System-Prompt erklärt <plan> weiterhin; im Buchkontext (messages) steht nichts davon
      const kontext = JSON.stringify(body.messages);
      expect(kontext).not.toContain('Alkohol');
      expect(kontext).not.toContain('<plan>');
      expect(kontext).not.toContain('Planung ·');
    }
    expect(JSON.stringify(mit.zaehlBodies)).toContain('Alkohol');
  });

  it('Demo-KI meldet den Plan-Widerspruch bei Paul mit Plan-Bezug', async () => {
    const e = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const h = e.hinweise.find((x) => x.plan?.figur === 'paul');
    expect(h).toBeDefined();
    expect(h!.typ).toBe('pruefen');
    expect(h!.plan).toEqual({ figur: 'paul', feld: 'Alkohol' });
    expect(h!.zitate).toEqual([{ kapitel: 'flut', text: 'dass ich eine halbe Stunde zu früh bin und bestelle einen Aperol Spritz' }]);
  });

  it('Plan-Bezug: Kapitelplan bleibt, Plan-Zitat in der Erklärung ist kein fremdes Zitat; bewusst vage und unbekannte Figur werden verworfen', async () => {
    const transport = festerTransport((kapitel) => ({
      hinweise: [
        {
          typ: 'pruefen',
          titel: 'Ebbe läuft anders als geplant',
          zitate: [{ kapitel, text: 'Zu Hause schreibt er Vera, dass es keinen Termin in Kopenhagen gibt.' }],
          erklaerung: 'Im Plan steht „meldet sich danach nicht mehr bei Vera“, im Text schreibt er ihr.',
          plan: { figur: '', kapitel: 'ebbe', feld: 'Was hier passieren soll' },
        },
        {
          typ: 'pruefen',
          titel: 'Aussehen der Fremden',
          zitate: [{ kapitel, text: 'Zu Hause schreibt er Vera, dass es keinen Termin in Kopenhagen gibt.' }],
          erklaerung: 'Passt nicht zur Planung.',
          plan: { figur: 'die-fremde', kapitel: '', feld: 'Aussehen' },
        },
        {
          typ: 'pruefen',
          titel: 'Unbekannte Figur',
          zitate: [{ kapitel, text: 'Zu Hause schreibt er Vera, dass es keinen Termin in Kopenhagen gibt.' }],
          erklaerung: 'Passt nicht zur Planung.',
          plan: { figur: 'gibt-es-nicht', kapitel: '', feld: '' },
        },
        { typ: 'zeitleiste', titel: 'Ohne Plan-Bezug', zitate: [{ kapitel, text: 'Gegen elf sagt er' }], erklaerung: 'Uhrzeit.', plan: { figur: '', kapitel: '', feld: '' } },
      ],
      analysen: [analyseFuer(kapitel)],
    }));
    const e = await pruefe(frischFs(), { umfang: 'kapitel', kapitel: 'ebbe' }, transport, STANDARD_KI);
    expect(e.hinweise.map((h) => [h.titel, h.plan])).toEqual([
      ['Ebbe läuft anders als geplant', { kapitel: 'ebbe', feld: 'Was hier passieren soll' }],
      ['Ohne Plan-Bezug', undefined],
    ]);
    expect(e.verworfen.map((v) => v.grund)).toEqual([
      'Plan-Widerspruch bei bewusst vager Figur „Die Fremde“',
      'Plan-Bezug auf unbekannte Figur „gibt-es-nicht“',
    ]);
  });
});
