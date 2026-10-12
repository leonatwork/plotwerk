import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { parseRecherche } from '../projekt/lesen';
import { serializeRecherche } from '../projekt/schreiben';
import {
  bildMimeTyp,
  eintragAendern,
  eintragAnlegen,
  eintraegeFuer,
  eintragEntfernen,
  entwurfPruefen,
  fehlendeZiele,
  filtereEintraege,
  freieDateien,
  heften,
  heftZiele,
  heftZielVorschlaege,
  istBildDatei,
  leereRechercheAblage,
  linkHost,
  linkPruefen,
  loesen,
  schlagworteAusText,
  schlagwortListe,
  sortiereEintraege,
  standardTitel,
  szenenVerweis,
  textVerweise,
  titelAusDateiname,
  titelAusLink,
  verweiseAlsText,
  verwendeteZiele,
  zielDateipfad,
  zielInfo,
} from './index';

const JETZT = new Date('2026-10-10T12:00:00.000Z');

describe('Bilddateien', () => {
  it('erkennt Bilder an der Endung und liefert den MIME-Typ', () => {
    expect(istBildDatei('Foto.JPG')).toBe(true);
    expect(istBildDatei('skizze.svg')).toBe(true);
    expect(istBildDatei('text.docx')).toBe(false);
    expect(istBildDatei('ohne-endung')).toBe(false);
    expect(bildMimeTyp('a.jpeg')).toBe('image/jpeg');
    expect(bildMimeTyp('a.svg')).toBe('image/svg+xml');
    expect(bildMimeTyp('a.xyz')).toBe('application/octet-stream');
  });

  it('Zielpfad: Slug mit Umlauten, Endung klein, eindeutig', () => {
    expect(zielDateipfad('Lindenhof Außen (2).JPG', [])).toBe('recherche/dateien/lindenhof-aussen-2.jpg');
    expect(zielDateipfad('bild.jpeg', ['recherche/dateien/bild.jpg'])).toBe('recherche/dateien/bild-2.jpg');
    expect(zielDateipfad('Bild.png', ['recherche/dateien/bild.png', 'recherche/dateien/bild-2.png'])).toBe('recherche/dateien/bild-3.png');
    expect(zielDateipfad('../../etc/passwd.png', [])).toBe('recherche/dateien/passwd.png');
    expect(zielDateipfad('???.png', [])).toBe('recherche/dateien/bild.png');
  });

  it('Titel aus dem Dateinamen', () => {
    expect(titelAusDateiname('kaffee_kontor-2024.JPG')).toBe('kaffee kontor 2024');
    expect(titelAusDateiname('recherche/dateien/x.png')).toBe('x');
  });
});

describe('Links (nur prüfen, nie laden)', () => {
  it('ergänzt https und lehnt fremde Schemata ab', () => {
    expect(linkPruefen('www.hamburg.de/hafen')).toEqual({ url: 'https://www.hamburg.de/hafen', host: 'hamburg.de' });
    expect(linkPruefen(' http://example.org ')).toEqual({ url: 'http://example.org/', host: 'example.org' });
    expect(linkPruefen('javascript:alert(1)')).toBeNull();
    expect(linkPruefen('file:///etc/passwd')).toBeNull();
    expect(linkPruefen('data:text/html,hallo')).toBeNull();
    expect(linkPruefen('mit leerzeichen.de')).toBeNull();
    expect(linkPruefen('kein-host')).toBeNull();
    expect(linkPruefen('https://nutzer:pw@example.org')).toBeNull();
    expect(linkPruefen('')).toBeNull();
  });

  it('Host und Titel-Vorschlag ohne Abruf', () => {
    expect(linkHost('https://www.saab.com/de/900.html')).toBe('saab.com');
    expect(linkHost(undefined)).toBe('');
    expect(titelAusLink('https://de.wikipedia.org/wiki/Speicherstadt')).toBe('Speicherstadt (de.wikipedia.org)');
    expect(titelAusLink('https://example.org/')).toBe('example.org');
    expect(titelAusLink('https://example.org/artikel/12345')).toBe('example.org');
    expect(titelAusLink('https://example.org/stadt-plan_hamburg.html')).toBe('Stadt plan hamburg (example.org)');
  });
});

describe('Ziele und Verweise (Demo-Projekt)', () => {
  it('Heft-Ziele: Figuren, Orte, Kapitel, Szenen', async () => {
    const d = await ladeDemoProjekt();
    const ziele = heftZiele(d);
    const arten = new Set(ziele.map((z) => z.art));
    expect([...arten]).toEqual(['figur', 'ort', 'kapitel', 'szene']);
    const szene = ziele.find((z) => z.art === 'szene' && z.verweis.id === 'ebbe-s1');
    expect(szene?.verweis).toEqual({ typ: 'plan', id: 'ebbe-s1' });
    expect(szene?.name).toMatch(/^Kap\. \d+\.1 · Fischrestaurant mit Vera$/);
  });

  it('zielInfo unterscheidet Plan-Karte und Szene; fehlende Ziele sind null', async () => {
    const d = await ladeDemoProjekt();
    expect(zielInfo(d, { typ: 'figur', id: 'paul' }).name).toBe('Paul');
    expect(zielInfo(d, { typ: 'kapitel', id: 'lotte' })).toMatchObject({ art: 'kapitel', kapitel: 'lotte' });
    expect(zielInfo(d, szenenVerweis('ebbe-s1'))).toMatchObject({ art: 'szene', kapitel: 'ebbe' });
    expect(zielInfo(d, { typ: 'plan', id: 'lotte' }).art).toBe('plan');
    expect(zielInfo(d, { typ: 'figur', id: 'gibt-es-nicht' }).name).toBeNull();
    expect(zielInfo(d, { typ: 'plan', id: 'gibt-es-nicht' })).toMatchObject({ art: 'szene', name: null });
  });

  it('Vorschläge fürs Heften: Wortanfänge, ohne bereits gewählte', async () => {
    const d = await ladeDemoProjekt();
    const v = heftZielVorschlaege(d, 'pau', [], 3);
    expect(v[0]?.verweis).toEqual({ typ: 'figur', id: 'paul' });
    expect(heftZielVorschlaege(d, 'pau', [{ typ: 'figur', id: 'paul' }]).some((z) => z.verweis.id === 'paul')).toBe(false);
    expect(heftZielVorschlaege(d, 'fischrestaurant mit').map((z) => z.verweis.id)).toContain('ebbe-s1');
    expect(heftZielVorschlaege(d, '', [], 5)).toHaveLength(5);
  });

  it('[[-Verweise im Text: als Text und als Liste', () => {
    const t = 'Siehe [[figur:die-fremde|Die Fremde]] und [[ort:lindenhof]].';
    expect(verweiseAlsText(t)).toBe('Siehe Die Fremde und lindenhof.');
    expect(textVerweise(t)).toEqual([
      { typ: 'figur', id: 'die-fremde' },
      { typ: 'ort', id: 'lindenhof' },
    ]);
  });
});

describe('Filtern und Zusammenstellen', () => {
  it('Suche über Titel, Text, Adresse, Schlagworte und Zielnamen', async () => {
    const d = await ladeDemoProjekt();
    const alle = d.recherche!.eintraege;
    const ids = (f: Parameters<typeof filtereEintraege>[2]) => filtereEintraege(d, alle, f).map((e) => e.id);
    expect(ids({ suche: 'handschrift' })).toEqual(['postkarten-handschrift']);
    expect(ids({ suche: 'wikipedia.org' })).toEqual(['saab-900']);
    expect(ids({ suche: 'hafen' })).toEqual(['lindenhof-skizze']);
    expect(ids({ suche: 'fremde postkarten' })).toEqual(['postkarten-handschrift']);
    expect(ids({ art: 'link' })).toEqual(['saab-900']);
    expect(ids({ ziel: { typ: 'kapitel', id: 'lotte' } })).toEqual(['lindenhof-skizze', 'saab-900']);
    expect(ids({ schlagwort: 'HAFEN' })).toEqual(['lindenhof-skizze']);
    expect(ids({ suche: 'nichts-dergleichen' })).toEqual([]);
  });

  it('Kapitel-Filter umfasst Szenen des Kapitels', async () => {
    const d = await ladeDemoProjekt();
    const { recherche } = eintragAnlegen(leereRechercheAblage(), 'bar', { art: 'notiz', titel: 'Bar', text: '', verweise: [szenenVerweis('ebbe-s1')] }, JETZT);
    expect(filtereEintraege(d, recherche.eintraege, { ziel: { typ: 'kapitel', id: 'ebbe' } })).toHaveLength(1);
    expect(filtereEintraege(d, recherche.eintraege, { ziel: { typ: 'kapitel', id: 'lotte' } })).toHaveLength(0);
  });

  it('eintraegeFuer: geheftet und per [[ erwähnt', async () => {
    const d = await ladeDemoProjekt();
    const unbekannte = eintraegeFuer(d, { typ: 'figur', id: 'die-fremde' });
    expect(unbekannte.map((x) => [x.eintrag.id, x.geheftet])).toEqual([['postkarten-handschrift', true]]);
    const r = heften(loesen(d.recherche!, 'postkarten-handschrift', { typ: 'figur', id: 'die-fremde' }), 'postkarten-handschrift', { typ: 'ort', id: 'lindenhof' });
    const d2 = { ...d, recherche: r };
    expect(eintraegeFuer(d2, { typ: 'figur', id: 'die-fremde' }).map((x) => x.geheftet)).toEqual([false]);
    expect(eintraegeFuer(d2, { typ: 'ort', id: 'lindenhof' }).map((x) => x.eintrag.id).sort()).toEqual(['lindenhof-skizze', 'postkarten-handschrift']);
  });

  it('Schlagworte und verwendete Ziele zählen', async () => {
    const d = await ladeDemoProjekt();
    expect(schlagworteAusText('Hafen, Kiez ; hafen\n#Nacht')).toEqual(['Hafen', 'Kiez', 'Nacht']);
    expect(schlagwortListe(d.recherche!.eintraege)).toEqual([{ wert: 'Hafen', anzahl: 1 }]);
    const ziele = verwendeteZiele(d, d.recherche!.eintraege);
    expect(ziele.find((z) => z.verweis.id === 'lotte' && z.art === 'kapitel')?.anzahl).toBe(2);
    expect(ziele.map((z) => z.art)).toEqual([...ziele.map((z) => z.art)].sort((a, b) => ['figur', 'ort', 'kapitel', 'szene'].indexOf(a) - ['figur', 'ort', 'kapitel', 'szene'].indexOf(b)));
  });

  it('sortiert neueste zuerst', async () => {
    const d = await ladeDemoProjekt();
    expect(sortiereEintraege(d.recherche!.eintraege).map((e) => e.id)).toEqual(['postkarten-handschrift', 'saab-900', 'lindenhof-skizze']);
  });
});

describe('Anlegen, Ändern, Entfernen', () => {
  it('prüft Entwürfe', () => {
    expect(entwurfPruefen({ art: 'bild', titel: '', text: '', verweise: [] })).toHaveLength(1);
    expect(entwurfPruefen({ art: 'link', titel: '', text: '', url: 'javascript:x', verweise: [] })).toHaveLength(1);
    expect(entwurfPruefen({ art: 'link', titel: '', text: '', url: 'hamburg.de', verweise: [] })).toEqual([]);
    expect(entwurfPruefen({ art: 'notiz', titel: ' ', text: '', verweise: [] })).toHaveLength(1);
    expect(entwurfPruefen({ art: 'notiz', titel: '', text: 'x', verweise: [] })).toEqual([]);
  });

  it('Standardtitel aus Datei, Adresse oder erster Zeile', () => {
    expect(standardTitel({ art: 'bild', titel: '', text: '', datei: 'recherche/dateien/hafen-nacht.jpg', verweise: [] })).toBe('hafen nacht');
    expect(standardTitel({ art: 'link', titel: '', text: '', url: 'https://example.org/', verweise: [] })).toBe('example.org');
    expect(standardTitel({ art: 'notiz', titel: '', text: 'Erste Zeile mit [[figur:paul|Paul]]\nzweite', verweise: [] })).toBe('Erste Zeile mit Paul');
    expect(standardTitel({ art: 'notiz', titel: '', text: 'x'.repeat(80), verweise: [] })).toHaveLength(59);
  });

  it('legt an (normalisierte Adresse, doppelte Verweise entfernt) und ändert ohne ID/Zeit zu verlieren', () => {
    const { recherche, eintrag } = eintragAnlegen(
      leereRechercheAblage(),
      'hafen',
      { art: 'link', titel: '', text: 'Notiz', url: 'hamburg.de', verweise: [{ typ: 'ort', id: 'x' }, { typ: 'ort', id: 'x' }], schlagworte: [] },
      JETZT,
    );
    expect(eintrag).toEqual({ id: 'hafen', art: 'link', titel: 'hamburg.de', url: 'https://hamburg.de/', text: 'Notiz', verweise: [{ typ: 'ort', id: 'x' }], erstellt: JETZT.toISOString() });
    const geaendert = eintragAendern(recherche, 'hafen', { art: 'link', titel: 'Kiel', text: '', url: 'https://kiel.de/', verweise: [], schlagworte: ['Stadt'] });
    expect(geaendert.eintraege[0]).toEqual({ id: 'hafen', art: 'link', titel: 'Kiel', url: 'https://kiel.de/', text: '', verweise: [], erstellt: JETZT.toISOString(), schlagworte: ['Stadt'] });
  });

  it('Entfernen gibt die Datei nur frei, wenn kein anderer Eintrag sie nutzt', () => {
    let r = leereRechercheAblage();
    r = eintragAnlegen(r, 'a', { art: 'bild', titel: 'A', text: '', datei: 'recherche/dateien/a.png', verweise: [] }, JETZT).recherche;
    r = eintragAnlegen(r, 'b', { art: 'bild', titel: 'B', text: '', datei: 'recherche/dateien/a.png', verweise: [] }, JETZT).recherche;
    const eins = eintragEntfernen(r, 'a');
    expect(eins.dateiFrei).toBeNull();
    expect(eintragEntfernen(eins.recherche, 'b').dateiFrei).toBe('recherche/dateien/a.png');
    expect(eintragEntfernen(r, 'gibt-es-nicht').recherche.eintraege).toHaveLength(2);
  });

  it('Heften und Lösen, fehlende Ziele erkennen, freie Dateien finden', async () => {
    const d = await ladeDemoProjekt();
    let r = heften(d.recherche!, 'saab-900', { typ: 'figur', id: 'paul' });
    expect(r.eintraege.find((e) => e.id === 'saab-900')!.verweise).toHaveLength(2);
    r = heften(r, 'saab-900', { typ: 'figur', id: 'gibt-es-nicht' });
    expect(fehlendeZiele(d, r.eintraege.find((e) => e.id === 'saab-900')!)).toEqual([{ typ: 'figur', id: 'gibt-es-nicht' }]);
    r = loesen(r, 'saab-900', { typ: 'figur', id: 'gibt-es-nicht' });
    expect(fehlendeZiele(d, r.eintraege.find((e) => e.id === 'saab-900')!)).toEqual([]);
    expect(freieDateien(r, ['recherche/dateien/lindenhof.svg', 'recherche/dateien/neu.jpg', 'recherche/dateien/liesmich.txt', 'recherche/recherche.json'])).toEqual([
      'recherche/dateien/neu.jpg',
    ]);
  });

  it('Szenen-Verweis übersteht Speichern und Laden', () => {
    const { recherche } = eintragAnlegen(leereRechercheAblage(), 'bar', { art: 'notiz', titel: 'Bar', text: '', verweise: [szenenVerweis('ebbe-s1')] }, JETZT);
    expect(parseRecherche(serializeRecherche(recherche)).eintraege[0]!.verweise).toEqual([{ typ: 'plan', id: 'ebbe-s1' }]);
  });
});
