import { describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import { sucheText, ersetzeText, projektFelder, sucheProjekt } from './index';

describe('lokale Volltextsuche', () => {
  it('bildet weiche und harte Markdown-Umbrüche ohne Verlust nachfolgender Treffer ab', () => {
    expect(ersetzeText('Hafen\nLotte am Hafen', 'Hafen', 'Kai', {}, true)).toBe('Kai\nLotte am Kai');
    expect(sucheText('Hafen\nLotte am Hafen', 'Lotte', {}, true)).toHaveLength(1);
    expect(ersetzeText('Hafen\nLotte', 'Hafen Lotte', 'Kai', {}, true)).toBe('Kai');
    expect(ersetzeText('Hafen  \nLotte', 'Lotte', 'Paul', {}, true)).toBe('Hafen  \nPaul');
  });
  it('findet Kontext ab Absatzanfang und fügt Markdown-Trenner als sichtbaren Text ein', () => {
    expect(sucheText('Hafen danach', 'Hafen')[0]!.kontext).toBe('Hafen danach');
    expect(ersetzeText('Hafen', 'Hafen', '---', {}, true)).toBe('\\-\\-\\-');
  });
  it('durchsucht Szenen-Referenzen, Enumwerte und Fassungen nicht; erfasst bearbeitete Zusammenfassungen vollständig', async () => {
    const d = await ladeDemoProjekt();
    d.zeitleiste!.zustaende = [{id:'z',figur:'lotte',kapitel:'flut',szene:'Suchprobe',zustand:'nuechtern',notiz:'Suchprobe'}];
    d.figuren.lotte!.beziehungen = [{zu:'paul',art:'Suchprobe',kategorie:'dates'}];
    d.entscheidungen.zusammenfassungen = [{kapitel:'flut',text:'Suchprobe',kurz:'Suchprobe',wendung:'Suchprobe',basisHash:'Suchprobe'}];
    d.fassungen = [{id:'f',name:'Suchprobe',notiz:'Suchprobe',datum:'2026-10-20',dateien:[]}];
    const pfade = sucheProjekt(d,'Suchprobe').map(t => t.feld.pfad.join('/'));
    expect(pfade).toEqual(expect.arrayContaining(['zeitleiste/zustaende/0/notiz','figuren/lotte/beziehungen/0/art','entscheidungen/zusammenfassungen/0/wendung']));
    expect(pfade).not.toContain('zeitleiste/zustaende/0/szene');
    expect(pfade.some(p => p.startsWith('fassungen/'))).toBe(false);
    expect(sucheProjekt(d,'dates').some(t => t.feld.pfad.at(-1) === 'kategorie')).toBe(false);
  });
  it('sucht wörtlich, Unicode-Wortgrenzen, Case und mehrere Treffer je Absatz', () => {
    expect(sucheText('Ole Oleander ole ÖlOle Ole\u0301 Ole2 _Ole_', 'Ole', { ganzesWort: true })).toHaveLength(3);
    expect(sucheText('hafen Hafen', 'hafen', { case: true })).toHaveLength(1);
    expect(sucheText('Hafen Hafen\n\nHafen', 'hafen').map(t => t.start)).toEqual([0, 6, 13]);
    expect(sucheText('a.b aXb', 'a.b')).toHaveLength(1);
    expect(sucheText('Hafen\n\nLotte', 'Hafen\n\nLotte')).toEqual([]);
    expect(sucheText('Hafen', '')).toEqual([]);
  });
  it('liefert Kontext und erhält Markdown; Ersetzung ist wörtlich', () => {
    expect(sucheText('Vorher **Hafen** danach Hafen.', 'hafen', {}, true).map(t => t.kontext)).toEqual(['Vorher Hafen danach Hafen.', 'Vorher Hafen danach Hafen.']);
    expect(ersetzeText('Vorher **Hafen** danach _Hafen_.', 'hafen', '"$&"', {}, true)).toBe('Vorher **"$&"** danach _"$&"_.');
    expect(sucheText('**Hafen**', '*', {}, true)).toEqual([]);
    expect(sucheText('*Hafen*', '*', {}, false)).toHaveLength(2);
    expect(ersetzeText('**Hafen**', 'Hafen', '*neu*', {}, true)).toBe('**\\*neu\\***');
    expect(ersetzeText('Ein \\* und **Hafen**', '*', 'Stern', {}, true)).toBe('Ein Stern und **Hafen**');
    expect(ersetzeText('Ha**fen**', 'Hafen', 'Kai', {}, true)).toBe('Kai');
    expect(ersetzeText('**Ha**fen', 'Hafen', 'Kai', {}, true)).toBe('**Kai**');
    expect(ersetzeText('# Hafen\n\n_Hafen_', 'Hafen', '', {}, true)).toBe('# \n\n');
    expect(ersetzeText('**Hafen** und \\*', '*', 'Stern', {}, true)).toBe('**Hafen** und Stern');
    expect(ersetzeText('Ha*fen* und __Hafen__', 'Hafen', 'Kai', {}, true)).toBe('Kai und __Kai__');
    expect(ersetzeText('**Hafen Hafen**', 'Hafen', 'Kai', {}, true)).toBe('**Kai Kai**');
    expect(ersetzeText('*Hafen Hafen*', 'Hafen', 'Kai', {}, true)).toBe('*Kai Kai*');
    expect(ersetzeText('**Hafen Hafen**', 'Hafen', '', {}, true)).toBe('** **');
  });
  it('schützt IDs und Verweissyntax, ersetzt die Anzeige', () => {
    const text = 'Hafen [[ort:hafen|Hafen]] [[ort:hafen]]';
    expect(sucheText(text, 'hafen')).toHaveLength(2);
    expect(ersetzeText(text, 'hafen', 'Kai')).toBe('Kai [[ort:hafen|Kai]] [[ort:hafen]]');
    expect(() => ersetzeText(text, 'Hafen', ']]|\n')).toThrow('verweis');
  });
  it('findet Manuskript in Buchreihenfolge, alle Plan-/Notizfelder einschließlich privater, keine KI-Ablagen', async () => {
    const d = await ladeDemoProjekt();
    d.figuren.lotte!.notizen = 'Suchprobe privat';
    d.figuren.lotte!.plan.Eigenes = 'Suchprobe Plan';
    d.orte.lindenhof!.notizen = 'Suchprobe Ort';
    d.plaene.lotte!.funktion = 'Suchprobe Funktion';
    d.projekt.notiz = 'Suchprobe Projekt';
    d.kiHinweise = [{ titel: 'Suchprobe KI' } as never];
    expect(sucheProjekt(d, 'Suchprobe')).toHaveLength(5);
    const felder = projektFelder(d);
    expect(felder.some(f => f.pfad.includes('id') || f.pfad[0].startsWith('ki'))).toBe(false);
    expect(sucheProjekt(d, 'ich').filter(t => t.feld.bereich === 'manuskript').map(t => t.feld.nummer)).toEqual(expect.arrayContaining([1, 3, 9]));
    const nr = sucheProjekt(d, 'ich').filter(t => t.feld.bereich === 'manuskript').map(t => t.feld.nummer!);
    expect(nr).toEqual([...nr].sort((a,b) => a-b));
  });
});
