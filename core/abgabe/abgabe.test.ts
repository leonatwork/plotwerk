import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import type { Hinweis, Kapitel, LektoratsAenderung, ProjektDaten } from '../model/types';
import { pdfSeiten } from '../pdf';
import { ankerErzeugen, klartext } from '../text';
import {
  aenderungAnsicht,
  exportiereLektoratsmappe,
  exportiereNormseite,
  exposeDocx,
  exposeGeruest,
  exposeMarkdown,
  exposePlatzhalter,
  lektoratsmappe,
  lektoratZaehlen,
  normseitenZaehlen,
  wendeAenderungAn,
  zeilenZaehlen,
} from './index';

const kap = (id: string, titel: string, text: string): Kapitel => ({ id, titel, text });

async function dokumentXml(docx: Uint8Array, pfad = 'word/document.xml'): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  return zip.file(pfad)!.async('string');
}

// ---------------------------------------------------------------------------
// Normseite
// ---------------------------------------------------------------------------

describe('Normseiten-Zählung', () => {
  it('bricht wie Word an Leerzeichen um (60 Anschläge je Zeile)', () => {
    expect(zeilenZaehlen('')).toBe(1);
    expect(zeilenZaehlen('a'.repeat(60))).toBe(1);
    expect(zeilenZaehlen('a'.repeat(61))).toBe(2);
    // 59 + Leerzeichen + Wort → zweite Zeile
    expect(zeilenZaehlen(`${'a'.repeat(59)} bb`)).toBe(2);
    // genau 60 mit Leerzeichen dazwischen
    expect(zeilenZaehlen(`${'a'.repeat(29)} ${'b'.repeat(30)}`)).toBe(1);
    // Leerzeichen am Zeilenende hängt über den Rand
    expect(zeilenZaehlen(`${'a'.repeat(60)} b`)).toBe(2);
    // überlange Wörter werden hart getrennt
    expect(zeilenZaehlen('x'.repeat(150))).toBe(3);
    // harter Umbruch
    expect(zeilenZaehlen('eins\nzwei')).toBe(2);
    // Umbruch nach Bindestrich
    expect(zeilenZaehlen(`${'a'.repeat(50)} Linden-Hof`)).toBe(2);
    expect(zeilenZaehlen(`${'a'.repeat(50)} Kaffee-Ko`, 58)).toBe(2);
    // Umlaute und typografische Zeichen zählen je einmal
    expect(zeilenZaehlen('ä'.repeat(60))).toBe(1);
  });

  it('zählt Titel, Leerzeile, Absätze und Trenner; jedes Kapitel beginnt auf neuer Seite', () => {
    const absatz = 'Wort '.repeat(24).trim(); // 119 Zeichen → 2 Zeilen
    const text = Array.from({ length: 20 }, () => absatz).join('\n\n') + '\n\n* * *\n\nEnde.';
    const z = normseitenZaehlen([kap('a', 'Eins', text), kap('b', 'Zwei', 'Kurz.')]);
    // Kapitel a: Titel 1 + Leerzeile 1 + 20×2 + Trenner 1 + 1 = 44 Zeilen → 2 Seiten
    expect(z.kapitel[0]).toMatchObject({ zeilen: 44, seiten: 2 });
    // Kapitel b: 3 Zeilen → 1 Seite
    expect(z.kapitel[1]).toMatchObject({ zeilen: 3, seiten: 1 });
    expect(z.seiten).toBe(3);
    expect(z.woerter).toBe(20 * 24 + 1 + 1);
    expect(z.anschlaege).toBe(20 * 119 + 5 + 5 + 5);
    expect(z.seitenNachAnschlaegen).toBe(Math.ceil(z.anschlaege / 1500));
  });

  it('lässt doppelte und randständige Trenner sowie leere Absätze weg', () => {
    const z = normseitenZaehlen([kap('a', 'Eins', '* * *\n\nText.\n\n* * *\n\n* * *\n\nMehr.\n\n* * *')]);
    expect(z.kapitel[0]!.zeilen).toBe(2 + 1 + 1 + 1);
  });

  it('schreibt eine .docx mit Courier 12 pt, genau 24 pt Zeilenabstand und 60 Zeichen Satzbreite', async () => {
    const datei = await exportiereNormseite([kap('a', 'Eins', 'Ein *kursiver* und **fetter** Satz.\n\n* * *\n\nZweiter Absatz.'), kap('b', 'Zwei', 'Text.')], 'Hafenlichter', {
      angaben: { autor: 'Leon Machnik' },
    });
    const doc = await dokumentXml(datei);
    const stile = await dokumentXml(datei, 'word/styles.xml');
    expect(stile).toContain('w:ascii="Courier New"');
    expect(stile).toMatch(/<w:sz w:val="24"\/>/);
    expect(stile).toMatch(/w:line="480"[^>]*w:lineRule="exact"|w:lineRule="exact"[^>]*w:line="480"/);
    // Satzbreite: Seitenbreite − Ränder = 8.650 Twips (60 × 7,2 pt + Luft)
    const pgSz = Number(/<w:pgSz w:w="(\d+)"/.exec(doc)![1]);
    const links = Number(/<w:pgMar[^>]*w:left="(\d+)"/.exec(doc)![1]);
    const rechts = Number(/<w:pgMar[^>]*w:right="(\d+)"/.exec(doc)![1]);
    expect(pgSz - links - rechts).toBe(8650);
    // 30 Zeilen passen zwischen die Ränder
    const hoehe = Number(/<w:pgSz[^>]*w:h="(\d+)"/.exec(doc)![1]);
    const oben = Number(/<w:pgMar[^>]*w:top="(\d+)"/.exec(doc)![1]);
    const unten = Number(/<w:pgMar[^>]*w:bottom="(\d+)"/.exec(doc)![1]);
    expect(Math.floor((hoehe - oben - unten) / 480)).toBe(30);
    // Hurenkinder-/Schusterjungen-Regel aus, sonst stimmen die 30 Zeilen nicht
    expect(doc).toContain('<w:widowControl w:val="false"/>');
    // Titelseite + Kapitel auf neuer Seite
    expect((doc.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(2);
    expect(doc).toContain('ca. 2 Normseiten');
    expect(doc).toContain('<w:i/>');
    // Kopfzeile mit Autor, Titel und Seitenzahl
    const zip = await JSZip.loadAsync(datei);
    const kopf = await Promise.all(Object.keys(zip.files).filter((p) => /word\/header\d+\.xml/.test(p)).map((p) => zip.file(p)!.async('string')));
    expect(kopf.join('')).toContain('Leon Machnik · Hafenlichter');
    expect(kopf.join('')).toContain('PAGE');
  });
});

// ---------------------------------------------------------------------------
// Exposé
// ---------------------------------------------------------------------------

describe('Exposé-Vorlage', () => {
  it('baut das Gerüst aus Leons Plan – ohne private Felder, mit klaren Platzhaltern', async () => {
    const daten = await ladeDemoProjekt();
    const md = exposeMarkdown(exposeGeruest(daten, { kapitel: 'keine' }));
    expect(md.startsWith(`# ${daten.projekt.titel}`)).toBe(true);
    for (const akt of daten.akte) {
      expect(md).toContain(`Akt ${akt.nummer}`);
      if (akt.quintessenz.trim()) expect(md).toContain(akt.quintessenz.trim().slice(0, 20));
    }
    for (const f of Object.values(daten.figuren)) {
      expect(md).toContain(`**${f.name}**`);
      if (f.wahrheit.trim()) expect(md).not.toContain(f.wahrheit.trim().slice(0, 30));
      if (f.notizen.trim()) expect(md).not.toContain(f.notizen.trim().slice(0, 30));
    }
    expect(md).toContain('\\[Platzhalter: Worum geht es');
    expect(md).not.toContain('Kapitelübersicht');
  });

  it('übernimmt nur von Leon freigegebene Zusammenfassungen, nie KI-Zusammenfassungen', async () => {
    const daten = await ladeDemoProjekt();
    const id = daten.projekt.kapitel[0]!;
    const zweite = daten.projekt.kapitel[1]!;
    const mit: ProjektDaten = {
      ...daten,
      entscheidungen: { ...daten.entscheidungen, zusammenfassungen: [{ kapitel: id, text: 'Meine eigene Zusammenfassung.', basisHash: 'x' }] },
      analysen: { ...daten.analysen, [zweite]: { ...(daten.analysen[zweite] ?? ({} as never)), kapitel: zweite, zusammenfassung: 'KI-TEXT-DARF-NICHT-REIN' } as never },
    };
    const geruest = exposeGeruest(mit, { kapitel: 'zusammenfassung' });
    const md = exposeMarkdown(geruest);
    expect(md).toContain('Meine eigene Zusammenfassung.');
    expect(md).not.toContain('KI-TEXT-DARF-NICHT-REIN');
    expect(md).toContain('Zusammenfassung (noch nicht freigegeben)');
    expect(exposePlatzhalter(geruest)).toBeGreaterThan(3);
  });

  it('nimmt im Modus „plan“ Szene und „Was soll hier passieren?“', async () => {
    const daten = await ladeDemoProjekt();
    const p = Object.values(daten.plaene).find((x) => x.szene.trim())!;
    const md = exposeMarkdown(exposeGeruest(daten, { kapitel: 'plan' }));
    expect(md).toContain(p.szene.trim().replace(/[*_[\]]/g, (c) => `\\${c}`).slice(0, 15));
  });

  it('schreibt eine .docx mit gelb hinterlegten Platzhaltern', async () => {
    const daten = await ladeDemoProjekt();
    const datei = await exposeDocx(exposeGeruest(daten, { kapitel: 'platzhalter' }));
    const doc = await dokumentXml(datei);
    expect(doc).toContain('<w:highlight w:val="yellow"/>');
    expect(doc).toContain('[Platzhalter: ');
    expect(doc).toContain(daten.projekt.titel);
  });
});

// ---------------------------------------------------------------------------
// Lektoratsmappe
// ---------------------------------------------------------------------------

function hinweis(teil: Partial<Hinweis> & Pick<Hinweis, 'schluessel'>): Hinweis {
  return { typ: 'pruefen', titel: 'Titel', zitate: [], erklaerung: '', quelle: 'lokal', status: 'neu', ...teil };
}

describe('Lektoratsmappe', () => {
  it('enthält nur offene Hinweise, nach Kapitel in Buchreihenfolge gruppiert', async () => {
    const daten = await ladeDemoProjekt();
    const [k1, k2] = daten.projekt.kapitel;
    const liste = [
      hinweis({ schluessel: 'a', zitate: [{ kapitel: k2!, text: 'Zitat zwei' }], titel: 'Hinweis zwei', erklaerung: 'Erklärung zwei' }),
      hinweis({ schluessel: 'b', typ: 'schreibweise', zitate: [{ kapitel: k1!, text: 'Zitat eins' }] }),
      hinweis({ schluessel: 'c', zitate: [{ kapitel: k1!, text: 'erledigt' }], status: 'erledigt' }),
      hinweis({ schluessel: 'd', typ: 'struktur', zitate: [] }),
    ];
    const m = lektoratsmappe(daten, liste, { jetzt: '2026-10-10T10:00:00Z' });
    expect(m.anzahl).toBe(3);
    expect(m.umfang).toBe('Ganzes Buch');
    expect(m.abschnitte.map((a) => a.kapitel)).toEqual([k1, k2, null]);
    expect(m.abschnitte[0]!.titel).toBe(`Kap. 1 · ${daten.kapitel[k1!]!.titel}`);
    expect(m.abschnitte[0]!.hinweise[0]).toMatchObject({ typName: 'Schreibweise', zitate: [{ text: 'Zitat eins' }] });

    const nurK2 = lektoratsmappe(daten, liste, { kapitel: k2 });
    expect(nurK2.anzahl).toBe(1);
    expect(nurK2.umfang).toBe(`Kapitel 2 · ${daten.kapitel[k2!]!.titel}`);
  });

  it('erzeugt ein PDF mit Typ, Titel, Zitat und Erklärung', async () => {
    const daten = await ladeDemoProjekt();
    const k1 = daten.projekt.kapitel[0]!;
    const m = lektoratsmappe(daten, [hinweis({ schluessel: 'a', titel: 'Widerspruch', zitate: [{ kapitel: k1, text: 'Der Wecker' }], erklaerung: 'Uhrzeit prüfen.' })]);
    const pdf = await exportiereLektoratsmappe(m);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdfSeiten(pdf)).toBeGreaterThanOrEqual(1);
    const leer = await exportiereLektoratsmappe(lektoratsmappe(daten, []));
    expect(pdfSeiten(leer)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Änderungen aus dem Lektorat annehmen
// ---------------------------------------------------------------------------

function aenderung(markdown: string, art: LektoratsAenderung['art'], stelle: string, neu: string, vorkommen = 0): LektoratsAenderung {
  const kt = klartext(markdown);
  let start = -1;
  for (let i = 0; i <= vorkommen; i++) start = kt.indexOf(stelle, start + 1);
  const ende = art === 'einfuegen' ? start + stelle.length : start + stelle.length;
  const anker = ankerErzeugen('k', kt, start, ende);
  return { id: 'x', anker, art, alt: art === 'einfuegen' ? '' : stelle, neu, status: 'offen' };
}

describe('Lektorats-Änderungen anwenden', () => {
  const md = 'Er steht im *Bad* und wartet ein zweites Mal.\n\nDann fährt er los. Der **Saab** springt an.';

  it('ersetzt nur die Stelle und lässt Auszeichnungen stehen', () => {
    const r = wendeAenderungAn(md, aenderung(md, 'ersetzen', 'ein zweites Mal', 'noch einmal'));
    expect(r).toEqual({ ok: true, text: 'Er steht im *Bad* und wartet noch einmal.\n\nDann fährt er los. Der **Saab** springt an.' });
  });

  it('löscht ohne doppelte Leerzeichen', () => {
    const r = wendeAenderungAn(md, aenderung(md, 'loeschen', 'Dann fährt er los. ', ''));
    expect(r).toEqual({ ok: true, text: 'Er steht im *Bad* und wartet ein zweites Mal.\n\nDer **Saab** springt an.' });
  });

  it('fügt hinter dem Ankerwort ein', () => {
    const r = wendeAenderungAn(md, aenderung(md, 'einfuegen', 'wartet', ' schon'));
    expect(r).toEqual({ ok: true, text: 'Er steht im *Bad* und wartet schon ein zweites Mal.\n\nDann fährt er los. Der **Saab** springt an.' });
  });

  it('ändert über eine Auszeichnung hinweg', () => {
    const r = wendeAenderungAn(md, aenderung(md, 'ersetzen', 'Der Saab springt', 'Der Wagen springt'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(klartext(r.text)).toBe('Er steht im Bad und wartet ein zweites Mal.\n\nDann fährt er los. Der Wagen springt an.');
  });

  it('meldet geänderte oder verschwundene Stellen und ändert dann nichts', () => {
    const a = aenderung(md, 'ersetzen', 'ein zweites Mal', 'noch einmal');
    const geaendert = md.replace('ein zweites Mal', 'seit zwei Stunden');
    expect(wendeAenderungAn(geaendert, a).ok).toBe(false);
    expect(wendeAenderungAn('Ganz anderer Text.', a)).toEqual({ ok: false, grund: 'Die Stelle steht so nicht mehr im Text.' });
    expect(aenderungAnsicht(klartext('Ganz anderer Text.'), a).lage).toBe('verwaist');
    expect(aenderungAnsicht(klartext(md), a)).toMatchObject({ lage: 'bereit', alt: 'ein zweites Mal', neu: 'noch einmal' });
  });

  it('zählt nach Status', () => {
    const a = aenderung(md, 'loeschen', 'Bad', '');
    expect(lektoratZaehlen([a, { ...a, status: 'angenommen' }, { ...a, status: 'abgelehnt' }, a])).toEqual({ offen: 2, angenommen: 1, abgelehnt: 1 });
  });
});
