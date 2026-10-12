import { describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import {
  aufgabenAnfrage,
  leseAufgabenKopf,
  leseZeitAngaben,
  schlageZeitpunkteVor,
  szenenImText,
  werteAufgabenAntwortAus,
  zeitDefinition,
  zeitUhrzeit,
  zustandDefinition,
  type KiTransport,
  type ZeitAuftrag,
  type ZustandAuftrag,
} from './index';

const SZENEN: ZeitAuftrag['szenen'] = {
  ebbe: [
    { id: 'ebbe-s1', index: 0 },
    { id: 'ebbe-s2', index: 1 },
    { id: 'ebbe-s3', index: 2 },
  ],
};

const ARTEN = [
  { id: 'ausgeruht', name: 'ausgeruht' },
  { id: 'erschoepft', name: 'erschöpft' },
  { id: 'schlaflos', name: 'schlaflos' },
  { id: 'verwirrt', name: 'verwirrt' },
  { id: 'gedaechtnisluecke', name: 'Gedächtnislücke' },
];

const leer = { tag: '', wochentag: '', datum: '', tageszeit: '', uhrzeit: '', dauer: 0 };

function aufgabeAus(body: Record<string, unknown>): string {
  const msgs = body.messages as { content: { type: string; text: string }[] }[];
  return msgs[0]!.content.map((c) => c.text).join('\n');
}

describe('KI-Aufgabe Zeitpunkte (G1)', () => {
  it('schickt keine eingetragenen Zeitpunkte, Szenentitel oder Zustände an das Modell (E12)', async () => {
    const body = await aufgabenAnfrage(demoFs(), zeitDefinition({ szenen: SZENEN }));
    const text = JSON.stringify(body);
    // Leons Zeitpunkte (Notizen/Belege aus plan/kapitel) und die Zeitleiste stehen nicht im Body
    expect(text).not.toContain('Absichtlich: Tag 9 wäre ein Dienstag');
    expect(text).not.toContain('Treffen am Abend');
    expect(text).not.toContain('Fischrestaurant mit Vera');
    expect(text).not.toContain('Kai bei Nacht');
    expect(text).not.toContain('Die Ausrede mit Kopenhagen');
    expect(text).not.toContain('nach dem Fischrestaurant');
    expect(text).not.toContain('Testdaten: Tag 1 ist ein Montag');
    const aufgabe = aufgabeAus(body);
    expect(leseAufgabenKopf(aufgabe)?.art).toBe('zeit');
    expect(aufgabe).toContain('- Kap. 7 (id: ebbe) · 3 Szenen');
    expect(aufgabe).toContain('- Kap. 1 (id: grundriss) · als Ganzes');
  });

  it('beschränkt den Auftrag auf gewählte Kapitel', async () => {
    const body = await aufgabenAnfrage(demoFs(), zeitDefinition({ kapitel: ['funkstille'] }));
    const aufgabe = aufgabeAus(body);
    expect(aufgabe).toContain('(id: funkstille)');
    expect(aufgabe).not.toContain('(id: grundriss)');
  });

  it('liest Zeitangaben und lehnt Ungültiges ab', () => {
    expect(zeitUhrzeit('7.05')).toBe('07:05');
    expect(zeitUhrzeit('23 Uhr')).toBe('23:00');
    expect(zeitUhrzeit('25:00')).toBeNull();
    expect(leseZeitAngaben({ ...leer, tag: '8', tageszeit: 'nachts', uhrzeit: '23:00', sicherheit: 'fest' })).toEqual({
      tag: 8,
      tageszeit: 'nachts',
      uhrzeit: '23:00',
      sicherheit: 'fest',
    });
    expect(leseZeitAngaben({ ...leer, tag: 'acht' })).toBe('Tag „acht“ ist keine ganze Zahl');
    expect(leseZeitAngaben({ ...leer, datum: '2026-10-10', wochentag: 'montag' })).toBe('Wochentag passt nicht zum Datum 2026-10-10');
    expect(leseZeitAngaben({ ...leer, tageszeit: 'morgens', uhrzeit: '23:30' })).toBe('Uhrzeit 23:30 passt nicht zu „morgens“');
    expect(leseZeitAngaben({ ...leer, sicherheit: 'fest' })).toBe('ohne Zeitangabe');
    expect(leseZeitAngaben({ ...leer, tag: '-2', uhrzeit: '01:30', tageszeit: 'nachts' })).toMatchObject({ tag: -2, uhrzeit: '01:30' });
  });

  it('zählt Szenen an den Trennern', () => {
    expect(szenenImText('a\n\n* * *\n\nb\n\n* * *\n\nc')).toBe(3);
    expect(szenenImText('a')).toBe(1);
  });

  it('prüft Belege wörtlich, ordnet Szenen zu und verwirft Ersatztext', async () => {
    const antwort = {
      zeitpunkte: [
        {
          kapitel: 'ebbe',
          szene: 2,
          ...leer,
          tag: '8',
          tageszeit: 'nachts',
          sicherheit: 'ungefaehr',
          belege: [{ kapitel: 'ebbe', text: 'Am Kai ist Ebbe, die Boote liegen schief im Schlick.' }],
          begruendung: 'Folgt unmittelbar auf das Ende des Abendessens.',
        },
        {
          kapitel: 'funkstille',
          szene: 0,
          ...leer,
          tag: '11',
          wochentag: 'donnerstag',
          sicherheit: 'fest',
          belege: [
            { kapitel: 'funkstille', text: 'Heute ist Donnerstag.' },
            { kapitel: 'weissraum', text: 'Am Montag ist im Büro jeder Zeichentisch voller Papierrollen und Kaffeebecher' },
          ],
          begruendung: 'Montag ist Tag 8, Donnerstag danach Tag 11.',
        },
        // erfundenes Zitat
        { kapitel: 'staub', szene: 0, ...leer, tag: '5', sicherheit: 'fest', belege: [{ kapitel: 'staub', text: 'Es ist Samstagmorgen im Kornspeicher.' }], begruendung: 'Steht da.' },
        // Formulierungsvorschlag
        {
          kapitel: 'bis-bald',
          szene: 0,
          ...leer,
          tageszeit: 'morgens',
          sicherheit: 'ungefaehr',
          belege: [{ kapitel: 'bis-bald', text: 'Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.' }],
          begruendung: 'Besser wäre hier: „Am Morgen danach wacht Paul auf.“',
        },
        // Beleg nur aus einem anderen Kapitel
        { kapitel: 'lotte', szene: 0, ...leer, tageszeit: 'abends', sicherheit: 'ungefaehr', belege: [{ kapitel: 'grundriss', text: 'Ole sitzt auf der Fensterbank' }], begruendung: 'x' },
        // Beleg aus einem späteren Kapitel
        { kapitel: 'grundriss', szene: 0, ...leer, tag: '1', sicherheit: 'ungefaehr', belege: [{ kapitel: 'grundriss', text: 'Ole sitzt auf der Fensterbank' }, { kapitel: 'funkstille', text: 'Heute ist Donnerstag.' }], begruendung: 'x' },
        // Szene, die es nicht gibt
        { kapitel: 'ebbe', szene: 5, ...leer, tag: '8', sicherheit: 'ungefaehr', belege: [{ kapitel: 'ebbe', text: 'Gegen elf' }], begruendung: 'x' },
        // Uhrzeit passt nicht zur Tageszeit
        { kapitel: 'ebbe', szene: 3, ...leer, tageszeit: 'morgens', uhrzeit: '23:30', sicherheit: 'ungefaehr', belege: [{ kapitel: 'ebbe', text: 'Zu Hause schreibt er Vera' }], begruendung: 'x' },
      ],
    };
    const r = await werteAufgabenAntwortAus(demoFs(), zeitDefinition({ szenen: SZENEN }), antwort);
    expect(r.ergebnis.vorschlaege.map((v) => v.schluessel)).toEqual(['zeit:ebbe#ebbe-s2', 'zeit:funkstille']);
    expect(r.ergebnis.vorschlaege[0]).toMatchObject({ kapitel: 'ebbe', szene: 'ebbe-s2', zeit: { tag: 8, tageszeit: 'nachts', sicherheit: 'ungefaehr' }, status: 'neu' });
    expect(r.ergebnis.vorschlaege[1]?.belege).toHaveLength(2);
    const gruende = r.verworfen.map((v) => v.grund);
    expect(gruende).toHaveLength(6);
    expect(gruende.some((g) => g.startsWith('Zitat steht nicht wörtlich'))).toBe(true);
    expect(gruende.some((g) => g.startsWith('Formulierungsvorschlag'))).toBe(true);
    expect(gruende).toContain('kein Beleg aus Kap. 3 selbst');
    expect(gruende.some((g) => g.startsWith('Zitat aus einem Kapitel außerhalb der Aufgabe'))).toBe(true);
    expect(gruende).toContain('Szene 5 in Kap. 7 ist nicht geplant');
    expect(gruende).toContain('Kap. 7: Uhrzeit 23:30 passt nicht zu „morgens“');
  });

  it('verwirft Kapitel außerhalb des Auftrags und doppelte Einträge', async () => {
    const e = (kapitel: string, text: string) => ({ kapitel, szene: 0, ...leer, tageszeit: 'abends', sicherheit: 'ungefaehr', belege: [{ kapitel, text }], begruendung: 'x' });
    const r = await werteAufgabenAntwortAus(demoFs(), zeitDefinition({ kapitel: ['lotte'] }), {
      zeitpunkte: [e('lotte', 'um halb acht am Lindenhof'), e('lotte', 'Er stellt den Motor ab'), e('ebbe', 'Gegen elf')],
    });
    expect(r.ergebnis.vorschlaege).toHaveLength(1);
    expect(r.ergebnis.kapitel).toEqual(['lotte']);
    expect(r.verworfen.map((v) => v.grund)).toEqual(['doppelter Eintrag für Kap. 3', 'Kap. 7 gehört nicht zum Auftrag']);
  });

  it('schreibt nie: voller Lauf gegen ein Dateisystem, das jeden Schreibversuch ablehnt', async () => {
    const fs = demoFs();
    const leser = {
      lesen: (p: string) => fs.lesen(p),
      auflisten: (o: string) => fs.auflisten(o),
      existiert: (p: string) => fs.existiert(p),
      schreiben: () => {
        throw new Error('Schreibversuch');
      },
      entfernen: () => {
        throw new Error('Schreibversuch');
      },
    };
    const transport: KiTransport = {
      bereit: async () => true,
      tokenZaehlen: async () => 1000,
      senden: async () => ({
        type: 'message',
        content: [{ type: 'text', text: JSON.stringify({ zeitpunkte: [] }) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    };
    const r = await schlageZeitpunkteVor(leser, transport, undefined, {});
    expect(r.ergebnis.vorschlaege).toEqual([]);
  });
});

describe('KI-Aufgabe Zustände (G1)', () => {
  const auftrag: ZustandAuftrag = { figur: 'paul', arten: ARTEN, szenen: SZENEN };

  it('nennt Figur und Zustandsvokabular, aber keine eingetragenen Zustände', async () => {
    const body = await aufgabenAnfrage(demoFs(), zustandDefinition(auftrag));
    const aufgabe = aufgabeAus(body);
    expect(leseAufgabenKopf(aufgabe)).toEqual({ art: 'zustand', attribute: { figur: 'paul' } });
    expect(aufgabe).toContain('- erschoepft: „erschöpft“');
    expect(JSON.stringify(body)).not.toContain('nach dem Fischrestaurant');
  });

  it('prüft Zustand, Belege aus dem Kapitel und Szenen', async () => {
    const r = await werteAufgabenAntwortAus(demoFs(), zustandDefinition(auftrag), {
      zustaende: [
        { kapitel: 'funkstille', szene: 0, zustand: 'schlaflos', belege: [{ kapitel: 'funkstille', text: 'Er hat seit zwei Nächten nicht geschlafen.' }], begruendung: 'Paul schläft nicht.' },
        { kapitel: 'ebbe', szene: 2, zustand: 'erschoepft', belege: [{ kapitel: 'ebbe', text: 'er rührt sich nicht' }], begruendung: 'Paul bleibt am Kai stehen.' },
        { kapitel: 'ebbe', szene: 1, zustand: 'erschoepft', belege: [{ kapitel: 'ebbe', text: 'Paul gähnt zum dritten Mal.' }], begruendung: 'x' },
        { kapitel: 'lotte', szene: 0, zustand: 'gluecklich', belege: [{ kapitel: 'lotte', text: 'das helle Hemd' }], begruendung: 'x' },
        { kapitel: 'bis-bald', szene: 0, zustand: 'verwirrt', belege: [{ kapitel: 'funkstille', text: 'Heute ist Donnerstag.' }], begruendung: 'x' },
      ],
    });
    expect(r.ergebnis.vorschlaege.map((v) => v.schluessel)).toEqual(['zustand:paul@ebbe#ebbe-s2', 'zustand:paul@funkstille']);
    expect(r.verworfen).toHaveLength(3);
    expect(r.verworfen.map((v) => v.grund)).toContain('unbekannter Zustand „gluecklich“');
  });
});
