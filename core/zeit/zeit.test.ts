import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { berechneIndex } from '../index/index';
import type { KapitelPlan, ProjektDaten, Zeitpunkt, ZeitVorschlag, ZustandVorschlag } from '../model/types';
import { leereZeitleiste } from '../projekt/lesen';
import {
  beginnVon,
  belegAusZitat,
  datumPlusTage,
  effektiverTag,
  einheitenAusZeitHinweis,
  enthaeltZeit,
  entferneZustandsart,
  erzaehlMinute,
  fuegeZustandsartHinzu,
  gleicheZeit,
  hauptfigur,
  mischeZeitVorschlaege,
  mischeZustandVorschlaege,
  normalisiereUhrzeit,
  offeneZeitVorschlaege,
  offeneZustandVorschlaege,
  ordneZeitleiste,
  parseUhrzeit,
  passtZurTageszeit,
  planMitZeit,
  relativerZeitpunkt,
  setzeVorschlagStatus,
  setzeZustand,
  tageszeitZu,
  vorigeEinheitMitTag,
  wochentagAusDatum,
  wochentagFuerTag,
  zeitAusVorschlag,
  zeitEinheiten,
  zeitHinweise,
  zeitleisteMitZustandVorschlag,
  zeitText,
  zustaendeImKapitel,
  zustandIn,
  zustandsId,
} from './index';

// ---------------------------------------------------------------------------
// Testdaten
// ---------------------------------------------------------------------------

function plan(id: string, zeit?: Zeitpunkt, extra: Partial<KapitelPlan> = {}): KapitelPlan {
  return {
    id,
    titel: id.toUpperCase(),
    akt: 1,
    status: 'entwurf',
    szene: '',
    straenge: [],
    figuren: [],
    orte: [],
    notiz: '',
    abweichungen: [],
    realitaet: [],
    ...(zeit ? { zeit } : {}),
    ...extra,
  };
}

/** Kleines Projekt: Kapitel a, b, c … in dieser Reihenfolge, Texte optional */
function projekt(plaene: KapitelPlan[], beginn?: { wochentag?: 'montag' | 'dienstag'; datum?: string }, texte: Record<string, string> = {}): ProjektDaten {
  const kapitel: ProjektDaten['kapitel'] = {};
  for (const p of plaene) kapitel[p.id] = { id: p.id, titel: p.titel, text: texte[p.id] ?? `Text von ${p.id}.` };
  return {
    projekt: { version: 1, titel: 'Test', kapitel: plaene.map((p) => p.id) },
    kapitel,
    plaene: Object.fromEntries(plaene.map((p) => [p.id, p])),
    akte: [],
    straenge: [],
    ideen: [],
    figuren: {},
    gruppen: {},
    orte: {},
    anmerkungen: [],
    entscheidungen: { version: 1, schreibweisen: [], hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] },
    analysen: {},
    kiHinweise: [],
    zeitleiste: { ...leereZeitleiste(), ...(beginn ? { beginn } : {}) },
  } as unknown as ProjektDaten;
}

const z = (teil: Partial<Zeitpunkt>): Zeitpunkt => ({ sicherheit: 'fest', ...teil });

// ---------------------------------------------------------------------------

describe('Zeitpunkte rechnen', () => {
  it('liest und normalisiert Uhrzeiten', () => {
    expect(parseUhrzeit('23:00')).toBe(1380);
    expect(parseUhrzeit('7.05')).toBe(425);
    expect(parseUhrzeit('25:00')).toBeNull();
    expect(parseUhrzeit('elf')).toBeNull();
    expect(normalisiereUhrzeit('7')).toBe('07:00');
    expect(normalisiereUhrzeit('23 Uhr')).toBe('23:00');
    expect(normalisiereUhrzeit('7.5')).toBeNull();
  });

  it('zählt die Nacht bis 5 Uhr zum Vortag', () => {
    expect(erzaehlMinute(90)).toBe(1530);
    expect(erzaehlMinute(600)).toBe(600);
    expect(tageszeitZu(90)).toBe('nachts');
    expect(tageszeitZu(1380)).toBe('nachts');
    expect(tageszeitZu(480)).toBe('morgens');
    expect(passtZurTageszeit('nachts', 90)).toBe(true);
    expect(passtZurTageszeit('abends', 1380)).toBe(true);
    expect(passtZurTageszeit('morgens', 1380)).toBe(false);
  });

  it('rechnet Wochentage und Daten', () => {
    expect(wochentagFuerTag('montag', 9)).toBe('dienstag');
    expect(wochentagFuerTag('montag', 0)).toBe('sonntag');
    expect(wochentagAusDatum('2026-10-10')).toBe('samstag');
    expect(wochentagAusDatum('2026-02-30')).toBeNull();
    expect(datumPlusTage('2026-12-31', 1)).toBe('2027-01-01');
    expect(effektiverTag(z({ datum: '2026-03-05' }), { datum: '2026-03-01' })).toEqual({ tag: 5, abgeleitet: true });
    expect(beginnVon({ ...leereZeitleiste(), beginn: { datum: '2026-10-12' } })).toEqual({ wochentag: 'montag', datum: '2026-10-12' });
  });

  it('beschriftet Zeitpunkte', () => {
    expect(zeitText(z({ tag: 8, tageszeit: 'nachts', uhrzeit: '23:00' }), { wochentag: 'montag' })).toBe('Tag 8 · Montag · nachts · 23:00');
    expect(zeitText(z({ tag: 8 }), { wochentag: 'montag' }, { kurz: true })).toBe('Tag 8 · Mo');
    expect(zeitText(undefined)).toBe('Zeitpunkt offen');
  });

  it('setzt relative Zeitpunkte („am nächsten Morgen“)', () => {
    expect(relativerZeitpunkt(z({ tag: 3, tageszeit: 'abends' }), 'naechster-morgen')).toEqual({ tag: 4, tageszeit: 'morgens' });
    expect(relativerZeitpunkt(z({ tag: 3, wochentag: 'freitag' }), 'spaeter', {}, 3)).toEqual({ tag: 6, wochentag: 'montag' });
    // mit Beginn leitet die Zeitleiste den Wochentag selbst ab
    expect(relativerZeitpunkt(z({ tag: 3, wochentag: 'mittwoch' }), 'naechster-tag', { wochentag: 'montag' })).toEqual({ tag: 4 });
    expect(relativerZeitpunkt(z({ tageszeit: 'abends' }), 'naechster-morgen')).toBeNull();
  });

  it('vergleicht Zeitangaben ohne Sicherheit/Beleg', () => {
    expect(gleicheZeit(z({ tag: 1, uhrzeit: '7:00' }), { tag: 1, uhrzeit: '07:00', sicherheit: 'unklar' })).toBe(true);
    expect(enthaeltZeit(z({ tag: 1, tageszeit: 'abends' }), { tageszeit: 'abends' })).toBe(true);
    expect(enthaeltZeit(z({ tag: 1 }), { tag: 1, tageszeit: 'abends' })).toBe(false);
  });
});

describe('Zeitleiste anordnen', () => {
  it('teilt Kapitel mit geplanten Szenen und vererbt den Tag', async () => {
    const daten = await ladeDemoProjekt();
    const einheiten = zeitEinheiten(daten);
    const ebbe = einheiten.filter((e) => e.kapitel === 'ebbe');
    expect(ebbe.map((e) => e.szene)).toEqual(['ebbe-s1', 'ebbe-s2', 'ebbe-s3']);
    expect(ebbe[1]).toMatchObject({ tag: 8, geerbt: true, titel: 'Kai bei Nacht' });
    expect(ebbe[2]?.orte).toEqual(['pauls-wohnung']);
    expect(zeitEinheiten(daten, { szenen: false }).filter((e) => e.kapitel === 'ebbe')).toHaveLength(1);
  });

  it('ordnet nach Tag und Uhrzeit, zeigt Lücken und unbekannte Abstände', async () => {
    const daten = await ladeDemoProjekt();
    const spalten = ordneZeitleiste(zeitEinheiten(daten), beginnVon(daten.zeitleiste));
    const tage = spalten.filter((s) => s.art === 'tag');
    expect(tage.map((s) => (s.art === 'tag' ? s.tag : null))).toEqual([1, 3, 8, 9]);
    const t3 = tage[1]!;
    expect(t3.art === 'tag' && t3.luecke).toBe(1);
    const t8 = tage[2]!;
    expect(t8.art === 'tag' && t8.luecke).toBe(4);
    expect(t8.art === 'tag' && t8.wochentag).toBe('montag');
    // Kap. 1 vormittags vor Kap. 2 mittags
    const t1 = tage[0]!;
    expect(t1.einheiten.map((e) => e.kapitel)).toEqual(['grundriss', 'fassade']);
    // Kapitel ohne Tag hängen hinter der Einheit, nach der sie gelesen werden
    const unbekannt = spalten.filter((s) => s.art === 'unbekannt').flatMap((s) => s.einheiten.map((e) => e.kapitel));
    expect(unbekannt).toEqual(expect.arrayContaining(['staub', 'bis-bald', 'flut']));
    const iStaub = spalten.findIndex((s) => s.einheiten.some((e) => e.kapitel === 'staub'));
    const iLotte = spalten.findIndex((s) => s.einheiten.some((e) => e.kapitel === 'lotte'));
    expect(iStaub).toBe(iLotte + 1);
  });

  it('findet die vorige Einheit mit Tag (Bezug für relative Angaben)', async () => {
    const daten = await ladeDemoProjekt();
    const einheiten = zeitEinheiten(daten);
    expect(vorigeEinheitMitTag(einheiten, 'bis-bald')?.schluessel).toBe('ebbe#ebbe-s3');
    expect(vorigeEinheitMitTag(einheiten, 'grundriss')).toBeUndefined();
  });

  it('sortiert Uhrzeiten nach Mitternacht hinter den Abend', () => {
    const d = projekt([plan('a', z({ tag: 2, uhrzeit: '01:30' })), plan('b', z({ tag: 2, uhrzeit: '22:00' }))]);
    const [spalte] = ordneZeitleiste(zeitEinheiten(d));
    expect(spalte?.einheiten.map((e) => e.kapitel)).toEqual(['b', 'a']);
  });
});

describe('Zeitprüfung (lokal, ohne KI)', () => {
  it('meldet im Demo-Projekt den falschen Wochentag von Kap. 10 mit Beleg', async () => {
    const daten = await ladeDemoProjekt();
    const hinweise = zeitHinweise(daten);
    const wt = hinweise.find((h) => h.schluessel.startsWith('zeitleiste:wochentag:funkstille'));
    expect(wt).toMatchObject({ typ: 'zeitleiste', quelle: 'lokal', status: 'neu' });
    expect(wt?.erklaerung).toContain('Dienstag');
    expect(wt?.zitate).toEqual([{ kapitel: 'funkstille', text: 'Heute ist Donnerstag' }]);
    expect(einheitenAusZeitHinweis(wt!.schluessel)).toEqual(['funkstille']);
    // die übrigen Demo-Zeitpunkte sind stimmig
    expect(hinweise).toHaveLength(1);
  });

  it('fließt in die Hinweise des Index ein', async () => {
    const daten = await ladeDemoProjekt();
    const index = berechneIndex(daten);
    expect(index.hinweise.some((h) => h.typ === 'zeitleiste' && h.schluessel.startsWith('zeitleiste:wochentag:funkstille'))).toBe(true);
  });

  it('meldet Zeitsprünge zurück, aber keine Rückblenden und keine offenen Platzhalter', () => {
    const d = projekt([plan('a', z({ tag: 5 })), plan('b', z({ tag: 3 })), plan('c', z({ tag: 0 })), plan('d', z({ tag: 1, sicherheit: 'unklar' })), plan('e', z({ tag: 6 }))]);
    const h = zeitHinweise(d);
    expect(h.map((x) => x.schluessel)).toEqual(['zeitleiste:reihenfolge:a|b:tag5>tag3']);
    expect(h[0]?.titel).toContain('Zeitsprung zurück');
  });

  it('meldet am selben Tag eine frühere Tageszeit nach einer späteren', () => {
    const d = projekt([plan('a', z({ tag: 2, tageszeit: 'abends' })), plan('b', z({ tag: 2, tageszeit: 'morgens' }))]);
    expect(zeitHinweise(d).map((x) => x.schluessel)).toEqual(['zeitleiste:reihenfolge:a|b:tag2:1020>630']);
  });

  it('prüft Uhrzeit gegen Tageszeit, Datum gegen Wochentag und ungültige Angaben', () => {
    const d = projekt([
      plan('a', z({ tag: 1, tageszeit: 'morgens', uhrzeit: '23:00' })),
      plan('b', z({ tag: 2, datum: '2026-10-10', wochentag: 'montag' })),
      plan('c', z({ tag: 3, uhrzeit: '25:99', datum: '2026-13-01' })),
    ]);
    const arten = zeitHinweise(d).map((x) => x.schluessel.split(':')[1]);
    expect(arten).toEqual(['uhrzeit', 'datum', 'ungueltig', 'ungueltig']);
  });

  it('prüft Datum gegen den Beginn und Daten untereinander', () => {
    const mitBeginn = projekt([plan('a', z({ tag: 3, datum: '2026-10-15' }))], { datum: '2026-10-12' });
    expect(zeitHinweise(mitBeginn)[0]?.erklaerung).toContain('14.10.2026');
    const ohne = projekt([plan('a', z({ tag: 1, datum: '2026-10-12' })), plan('b', z({ tag: 3, datum: '2026-10-13' }))]);
    expect(zeitHinweise(ohne).map((h) => h.schluessel)).toEqual(['zeitleiste:datum:a|b:tag1=2026-10-12|tag3=2026-10-13']);
  });

  it('prüft ohne Beginn Wochentage untereinander', () => {
    const d = projekt([plan('a', z({ tag: 1, wochentag: 'montag' })), plan('b', z({ tag: 4, wochentag: 'freitag' }))]);
    const [h] = zeitHinweise(d);
    expect(h?.schluessel).toBe('zeitleiste:wochentag:a|b:tag1=montag|tag4=freitag');
    expect(h?.erklaerung).toContain('Donnerstag');
  });

  it('meldet Überschneidungen über die Dauer', () => {
    const d = projekt([plan('a', z({ tag: 1, uhrzeit: '20:00', dauer: 120 })), plan('b', z({ tag: 1, uhrzeit: '21:00' }))]);
    expect(zeitHinweise(d).map((h) => h.schluessel.split(':')[1])).toEqual(['dauer']);
  });

  it('meldet Szenen, die vor ihrem Kapitel spielen', () => {
    const p = plan('a', z({ tag: 5 }), {
      szenen: [
        { id: 'a-s1', kapitel: 'a', index: 0, titel: 'Eins', figuren: [], notiz: '' },
        { id: 'a-s2', kapitel: 'a', index: 1, titel: 'Zwei', figuren: [], notiz: '', zeit: z({ tag: 4 }) },
      ],
    });
    const h = zeitHinweise(projekt([p]));
    expect(h.some((x) => x.schluessel === 'zeitleiste:szene:a|a#a-s2:tag5>tag4')).toBe(true);
  });

  it('hat stabile Schlüssel: Absicht bleibt, solange die Angaben gleich sind', () => {
    const d = projekt([plan('a', z({ tag: 5 })), plan('b', z({ tag: 3 }))]);
    expect(zeitHinweise(d)[0]?.schluessel).toBe(zeitHinweise(structuredClone(d))[0]?.schluessel);
    d.plaene.b = plan('b', z({ tag: 2 }));
    expect(zeitHinweise(d)[0]?.schluessel).toBe('zeitleiste:reihenfolge:a|b:tag5>tag2');
  });
});

describe('Zustände („Pauls Zustand“)', () => {
  it('findet die Hauptfigur', async () => {
    expect(hauptfigur(await ladeDemoProjekt())).toBe('paul');
  });

  it('übernimmt den Kapitel-Zustand für Szenen ohne eigenen', async () => {
    const daten = await ladeDemoProjekt();
    const zl = daten.zeitleiste!;
    expect(zustandIn(zl, 'paul', 'ebbe', 'ebbe-s2')).toMatchObject({ geerbt: false, art: { id: 'erschoepft' } });
    expect(zustandIn(zl, 'paul', 'ebbe', 'ebbe-s1')).toBeUndefined();
    expect(zustandIn(zl, 'paul', 'lotte', 'irgendeine')).toMatchObject({ geerbt: true, art: { id: 'ausgeruht' } });
    expect(zustaendeImKapitel(daten, 'paul', 'ebbe').map((t) => t.zustand.szene)).toEqual(['ebbe-s2']);
  });

  it('setzt, ändert und entfernt Zustände', () => {
    let zl = leereZeitleiste();
    const id = (v: string[]) => zustandsId('paul', 'a', undefined, v);
    zl = setzeZustand(zl, { figur: 'paul', kapitel: 'a', zustand: 'erschoepft', notiz: ' Kai ' }, id);
    expect(zl.zustaende).toEqual([{ id: 'paul-a', figur: 'paul', kapitel: 'a', zustand: 'erschoepft', notiz: 'Kai' }]);
    zl = setzeZustand(zl, { figur: 'paul', kapitel: 'a', zustand: 'verwirrt' }, id);
    expect(zl.zustaende[0]).toMatchObject({ id: 'paul-a', zustand: 'verwirrt', notiz: 'Kai' });
    zl = setzeZustand(zl, { figur: 'paul', kapitel: 'a', zustand: null }, id);
    expect(zl.zustaende).toEqual([]);
  });

  it('erweitert die Zustandsliste frei', () => {
    const zl = leereZeitleiste();
    const r = fuegeZustandsartHinzu(zl, 'Kater am Morgen')!;
    expect(r.id).toBe('kater-am-morgen');
    const neu = r.zeitleiste.zustandsarten.at(-1)!;
    expect(zl.zustandsarten.map((a) => a.farbe)).not.toContain(neu.farbe);
    expect(fuegeZustandsartHinzu(r.zeitleiste, 'kater am morgen')?.id).toBe('kater-am-morgen');
    expect(fuegeZustandsartHinzu(zl, '   ')).toBeNull();
    const mit = setzeZustand(r.zeitleiste, { figur: 'paul', kapitel: 'a', zustand: 'kater-am-morgen' }, () => 'x');
    expect(entferneZustandsart(mit, 'kater-am-morgen').zustaende).toEqual([]);
  });
});

describe('KI-Vorschläge verwalten', () => {
  const lauf = { datum: '2026-10-10T10:00:00.000Z', modell: 'demo' };
  const vorschlag = (teil: Partial<ZeitVorschlag>): ZeitVorschlag => ({
    schluessel: 'zeit:bis-bald',
    kapitel: 'bis-bald',
    zeit: { tag: 9, tageszeit: 'morgens', sicherheit: 'ungefaehr' },
    belege: [{ kapitel: 'bis-bald', text: 'Paul wacht auf einer Holzbank im Fährhaus auf, den Kopf an der kalten Scheibe.' }],
    begruendung: 'Der Morgen nach Kap. 7.',
    status: 'neu',
    ...teil,
  });

  it('blendet aus, was schon so im Plan steht', async () => {
    const daten = await ladeDemoProjekt();
    // Demo: „zeit:lotte“ (abends) steht schon im Plan
    expect(offeneZeitVorschlaege(daten)).toEqual([]);
    // Demo: Paul in Kap. 10 „schlaflos“ ist schon eingetragen
    expect(offeneZustandVorschlaege(daten, 'paul')).toEqual([]);
  });

  it('mischt neue Vorschläge, ohne Verworfenes zu wiederholen', async () => {
    const daten = await ladeDemoProjekt();
    const erst = mischeZeitVorschlaege(undefined, [vorschlag({}), vorschlag({ schluessel: 'zeit:lotte', kapitel: 'lotte', zeit: { tageszeit: 'abends', sicherheit: 'ungefaehr' } })], lauf, daten, ['bis-bald', 'lotte']);
    expect(erst).toMatchObject({ neu: 1, schonEingetragen: 1, bereitsEntschieden: 0 });
    const verworfen = setzeVorschlagStatus(erst.ablage, 'zeit:bis-bald', 'verworfen');
    const zweit = mischeZeitVorschlaege(verworfen, [vorschlag({})], lauf, daten, ['bis-bald']);
    expect(zweit).toMatchObject({ neu: 0, bereitsEntschieden: 1 });
    expect(zweit.ablage.eintraege[0]?.status).toBe('verworfen');
    // anderer Inhalt ist ein neuer Vorschlag
    const dritt = mischeZeitVorschlaege(verworfen, [vorschlag({ zeit: { tag: 10, sicherheit: 'ungefaehr' } })], lauf, daten, ['bis-bald']);
    expect(dritt.neu).toBe(1);
    expect(dritt.ablage.eintraege[0]).toMatchObject({ status: 'neu', zeit: { tag: 10 } });
  });

  it('ersetzt offene Vorschläge im Umfang des Laufs, behält andere', async () => {
    const daten = await ladeDemoProjekt();
    const alt = { version: 1 as const, eintraege: [vorschlag({}), vorschlag({ schluessel: 'zeit:staub', kapitel: 'staub', belege: [] })] };
    const r = mischeZeitVorschlaege(alt, [], lauf, daten, ['bis-bald']);
    expect(r.ablage.eintraege.map((e) => e.schluessel)).toEqual(['zeit:staub']);
    expect(r.ablage.lauf).toEqual(lauf);
  });

  it('übernimmt einen Zeitpunkt mit Beleg und behält Leons Notiz', async () => {
    const daten = await ladeDemoProjekt();
    const zeit = zeitAusVorschlag(daten, vorschlag({ schluessel: 'zeit:lotte', kapitel: 'lotte', zeit: { tag: 4, tageszeit: 'abends', sicherheit: 'fest' }, belege: [{ kapitel: 'lotte', text: 'um halb acht am Lindenhof' }] }));
    expect(zeit).toMatchObject({ tag: 4, tageszeit: 'abends', sicherheit: 'fest', notiz: 'Treffen am Abend' });
    expect(zeit.beleg?.exakt).toBe('um halb acht am Lindenhof');
    const p = planMitZeit(daten.plaene.ebbe!, 'ebbe-s2', zeit);
    expect(p.szenen?.find((s) => s.id === 'ebbe-s2')?.zeit?.tag).toBe(4);
    expect(p.zeit).toEqual(daten.plaene.ebbe!.zeit);
    expect(planMitZeit(p, undefined, undefined).zeit).toBeUndefined();
  });

  it('übernimmt einen Zustand mit Beleg', async () => {
    const daten = await ladeDemoProjekt();
    const v: ZustandVorschlag = {
      schluessel: 'zustand:paul@bis-bald',
      figur: 'paul',
      kapitel: 'bis-bald',
      zustand: 'verwirrt',
      belege: [{ kapitel: 'bis-bald', text: 'Er weiß nicht, wie er hierhergekommen ist.' }],
      begruendung: 'b',
      status: 'neu',
    };
    const zl = zeitleisteMitZustandVorschlag(daten, v);
    const e = zl.zustaende.find((x) => x.figur === 'paul' && x.kapitel === 'bis-bald');
    expect(e).toMatchObject({ id: 'paul-bis-bald', zustand: 'verwirrt' });
    expect(e?.beleg?.exakt).toBe('Er weiß nicht, wie er hierhergekommen ist.');
    const gemischt = mischeZustandVorschlaege(undefined, [v], lauf, { ...daten, zeitleiste: zl }, 'paul');
    expect(gemischt.schonEingetragen).toBe(1);
  });

  it('erzeugt Belege nur aus wörtlichen Stellen', async () => {
    const daten = await ladeDemoProjekt();
    expect('anker' in belegAusZitat(daten, 'ebbe', 'Gegen elf')).toBe(true);
    expect(belegAusZitat(daten, 'ebbe', 'Kurz vor zwölf')).toEqual({ fehler: 'Die Stelle steht so nicht in Kap. 7.' });
    expect(belegAusZitat(daten, 'ebbe', 'Ku')).toEqual({ fehler: 'Das Zitat ist zu kurz.' });
  });
});

describe('Zustand: Beleg entfernen', () => {
  it('entfernt den Beleg nur, wenn er ausdrücklich übergeben wird', () => {
    const anker = { kapitel: 'a', exakt: 'x', davor: '', danach: '' };
    let zl = setzeZustand(leereZeitleiste(), { figur: 'paul', kapitel: 'a', zustand: 'schlaflos', beleg: anker }, () => 'i');
    zl = setzeZustand(zl, { figur: 'paul', kapitel: 'a', zustand: 'schlaflos', notiz: 'n' }, () => 'i');
    expect(zl.zustaende[0]?.beleg).toEqual(anker);
    zl = setzeZustand(zl, { figur: 'paul', kapitel: 'a', zustand: 'schlaflos', beleg: undefined }, () => 'i');
    expect(zl.zustaende[0]?.beleg).toBeUndefined();
    expect(zl.zustaende[0]?.notiz).toBe('n');
  });
});
