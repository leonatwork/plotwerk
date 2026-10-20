import { describe, expect, it } from 'vitest';
import { ladeProjekt } from '../projekt';
import { demoFs } from '../../fixtures/demoProjekt';
import { sucheText, ersetzeText, projektFelder, sucheProjekt } from './index';
import { klartext } from '../text';

describe('Suchen und Ersetzen', () => {
  it('ersetzt in Plan- und Notizfeldern wörtlich, ohne Markdown auszuwerten oder zu maskieren', async () => {
    const d = await ladeProjekt(demoFs());
    d.figuren.paul!.notizen = '**Hafen**';
    d.orte.lindenhof!.notizen = '**Hafen**';
    d.plaene.flut!.szenen = [{ id: 'szene', kapitel: 'flut', index: 0, titel: 'Szene', figuren: [], notiz: '**Hafen**' }];
    d.recherche!.eintraege = [{ id: 'notiz', art: 'notiz', titel: 'Notiz', text: '**Hafen**', verweise: [], erstellt: '' }];
    const pfade = ['figuren.paul.notizen', 'orte.lindenhof.notizen', 'plaene.flut.szenen.0.notiz', 'recherche.eintraege.0.text'];
    const felder = projektFelder(d).filter(feld => pfade.includes(feld.pfad.join('.')));
    expect(felder).toHaveLength(pfade.length);
    const ersatz = '"Ole-Jan" \\ * _ # = -\nOle';
    for (const feld of felder) {
      expect(ersetzeText(feld.text, 'Hafen', ersatz, {}, feld.markdown)).toBe(`**${ersatz}**`);
      expect(sucheText(feld.text, '**Hafen**', {}, feld.markdown)).toHaveLength(1);
      expect(feld.markdown).toBe(false);
    }
  });
  it('überspringt vollständige interne Verweise und behält Klartextoffsets außerhalb bei', () => {
    const verweise = ['figur', 'ort', 'kapitel', 'plan', 'idee', 'gruppe']
      .map(typ => `[[${typ}:paul|Paul]]`).join(' ');
    const text = `Paul ${verweise} Paul [[figur:paul]]`;
    expect(sucheText(text, 'Paul')).toMatchObject([
      { start: 0, ende: 4 }, { start: 5 + verweise.length + 1, ende: 5 + verweise.length + 5 },
    ]);
    expect(ersetzeText(text, 'Paul', 'Ole')).toBe(`Ole ${verweise} Ole [[figur:paul]]`);
    expect(sucheText(text, 'Paul', { caseSensitiv: true, ganzesWort: true })).toHaveLength(2);
    expect(sucheText(text, 'figur')).toEqual([]);
    expect(sucheText(text, '|Paul]] Paul')).toEqual([]);
    expect(sucheText(text, 'Paul [[figur')).toEqual([]);
    expect(sucheText('[[unbekannt:paul|Paul]]', 'Paul')).toHaveLength(2);
  });
  it('ersetzt sichtbaren Leerraum und maskierte Zeichen ohne Markdown zu beschädigen', () => {
    expect(klartext(ersetzeText('Hafen\nHafen', 'Hafen Hafen', 'Ole', {}, true))).toBe('Ole');
    expect(klartext(ersetzeText('Hafen', 'Hafen', '===', {}, true))).toBe('===');
    expect(klartext(ersetzeText('Hafen\n\nHafen', 'Hafen', 'Ole\n===', {}, true))).toBe('Ole\n===\n\nOle\n===');
    expect(klartext(ersetzeText('\\*Hafen\\*', '*Hafen*', 'Ole', {}, true))).toBe('Ole');
    expect(ersetzeText('**Hafen** Hafen', 'Hafen', 'Ole', {}, true)).toBe('**Ole** Ole');
  });
  it('durchsucht auch Zeitnotizen, verwaiste Kapitelpläne und bearbeitete Wendungen', async () => {
    const d = await ladeProjekt(demoFs());
    d.plaene.flut!.zeit = { sicherheit: 'fest', notiz: 'Hafen' };
    d.plaene['plan-ohne-manuskript'] = { ...d.plaene.flut!, id: 'plan-ohne-manuskript', notiz: 'Hafen' };
    d.entscheidungen.zusammenfassungen = [{ kapitel: 'flut', text: 'Ole', basisHash: '', wendung: 'Hafen' }];
    d.recherche!.eintraege = [{ id: 'notiz', art: 'notiz', titel: 'Ole', text: '**Hafen**', verweise: [], erstellt: '' }];
    const treffer = sucheProjekt(d, 'Hafen');
    expect(treffer.map(x => x.feld.pfad.join('.'))).toEqual(expect.arrayContaining([
      'plaene.flut.zeit.notiz', 'plaene.plan-ohne-manuskript.notiz', 'entscheidungen.zusammenfassungen.0.wendung', 'recherche.eintraege.0.text',
    ]));
    expect(treffer.find(x => x.feld.pfad.join('.') === 'recherche.eintraege.0.text')!.feld).toMatchObject({ markdown: false, bereich: 'notizen' });
  });
  it('findet mehrere Treffer mit Kontext, Unicode-Wortgrenzen und Case-Option', () => {
    expect(sucheText('Ole Oleander OLE ÄOle Olé Ole2', 'Ole', { ganzesWort: true })).toHaveLength(2);
    expect(sucheText('Hafen hafen', 'hafen', { caseSensitiv: true })).toMatchObject([{ start: 6, ende: 11, kontext: 'Hafen hafen' }]);
    expect(sucheText('Hafen Hafen', 'hafen')).toHaveLength(2);
    expect(sucheText('Hafen', '')).toEqual([]);
    expect(sucheText('Hafen', '.*')).toEqual([]);
  });
  it('sucht Absatz für Absatz und erhält Markdown und wörtlichen Ersatz', () => {
    const md = '# Hafen\n\nAm **Hafen** und *Hafen*.\n\nHafen';
    expect(sucheText(md, 'hafen', {}, true)).toHaveLength(4);
    expect(sucheText(md, 'Hafen Am', {}, true)).toEqual([]);
    expect(ersetzeText(md, 'Hafen', '"Ole"', {}, true)).toBe('# "Ole"\n\nAm **"Ole"** und *"Ole"*.\n\n"Ole"');
    expect(ersetzeText('Hafen Hafen', 'Hafen', '$&')).toBe('$& $&');
    expect(ersetzeText('**Hafen**', 'Hafen', '*Ole*', {}, true)).toBe('**\\*Ole\\***');
    expect(klartext(ersetzeText('**Ha**fen', 'Hafen', 'Ole', {}, true))).toBe('Ole');
    expect(klartext(ersetzeText('Ha**fen**', 'Hafen', 'Ole', {}, true))).toBe('Ole');
    expect(klartext(ersetzeText('Hafen', 'Hafen', '---', {}, true))).toBe('---');
    expect(klartext(ersetzeText('Hafen\n\nHafen', 'Hafen', '"Ole"\\*', {}, true))).toBe('"Ole"\\*\n\n"Ole"\\*');
    expect(ersetzeText('Hafen\nHafen', 'Hafen Hafen', 'Ole', {}, true)).toBe('Ole');
  });
  it('findet Manuskript in Buchreihenfolge und sämtliche Plan-/Privatfelder ohne IDs oder Anker', async () => {
    const d = await ladeProjekt(demoFs());
    d.figuren.paul!.plan['Hafen'] = 'Hafen';
    d.figuren.paul!.plan['anker'] = 'Hafen';
    d.figuren.paul!.notizen = 'Hafen';
    d.orte.lindenhof!.notizen = 'Hafen';
    d.plaene.flut!.funktion = 'Hafen';
    d.plaene.flut!.szenen = [{ id: 'Hafen', kapitel: 'flut', index: 0, titel: 'Hafen', figuren: [], notiz: 'Hafen' }];
    const felder = projektFelder(d);
    expect(felder.filter(x => x.text === 'Hafen').map(x => x.pfad.join('.'))).toEqual(expect.arrayContaining([
      'figuren.paul.plan.Hafen', 'figuren.paul.plan.anker', 'figuren.paul.notizen', 'orte.lindenhof.notizen', 'plaene.flut.funktion', 'plaene.flut.szenen.0.notiz',
    ]));
    expect(felder.some(x => (x.pfad.includes('anker') && !x.pfad.includes('plan')) || x.pfad.at(-1) === 'id')).toBe(false);
    expect(felder.some(x => x.pfad.at(-1) === 'art' && x.pfad[0] === 'recherche')).toBe(false);
    const treffer = sucheProjekt(d, 'ich').filter(x => x.feld.bereich === 'manuskript');
    const nummern = treffer.map(x => x.feld.nummer!);
    expect(nummern).toEqual([...nummern].sort((a, b) => a - b));
  });
});
