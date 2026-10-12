import { describe, expect, it } from 'vitest';
import { LEERER_INDEX } from '@core/index/index';
import type { Faden } from '@core/model/types';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleStore } from '../../state/store';
import {
  faedenBisKapitel,
  feldUmbenennen,
  figurenBereiche,
  findeVarianten,
  istVeraltet,
  kapitelImAkt,
  verschiebeKapitel,
  zusammenfassungFuer,
} from '../../state/slices/planung';

async function geladen() {
  const store = erstelleStore();
  const fs = demoFs();
  await store.getState().projektLaden(fs);
  return { store, fs };
}

const REIHENFOLGE = ['grundriss', 'fassade', 'lotte', 'regatta', 'staub', 'weissraum', 'ebbe', 'bis-bald', 'flut', 'funkstille'];

describe('Kapitel zwischen Akten verschieben', () => {
  it('verschiebeKapitel: in einen anderen Akt an eine Position', async () => {
    const { store } = await geladen();
    const d = store.getState().daten!;
    expect(d.projekt.kapitel).toEqual(REIHENFOLGE);
    // Regatta (Akt I) an Position 1 in Akt II (nach Staub)
    const plaene = { ...d.plaene, regatta: { ...d.plaene.regatta!, akt: 2 } };
    const neu = verschiebeKapitel(d.projekt.kapitel, plaene, 'regatta', 2, 1);
    expect(neu).toEqual(['grundriss', 'fassade', 'lotte', 'staub', 'regatta', 'weissraum', 'ebbe', 'bis-bald', 'flut', 'funkstille']);
    // ans Ende von Akt III
    expect(verschiebeKapitel(d.projekt.kapitel, d.plaene, 'grundriss', 3, Infinity).at(-1)).toBe('grundriss');
    // an den Anfang von Akt I
    expect(verschiebeKapitel(d.projekt.kapitel, d.plaene, 'lotte', 1, 0).slice(0, 2)).toEqual(['lotte', 'grundriss']);
  });

  it('verschiebeKapitel: in einen leeren Akt zwischen die Nachbarakte', () => {
    const plaene = {
      a: { akt: 1 },
      b: { akt: 1 },
      c: { akt: 3 },
    } as unknown as Parameters<typeof verschiebeKapitel>[1];
    expect(verschiebeKapitel(['a', 'b', 'c'], plaene, 'a', 2, 0)).toEqual(['b', 'a', 'c']);
    expect(verschiebeKapitel(['a', 'b', 'c'], plaene, 'c', 0, 0)).toEqual(['c', 'a', 'b']);
    expect(verschiebeKapitel(['a', 'b', 'c'], plaene, 'a', null, 0)).toEqual(['b', 'c', 'a']);
  });

  it('kapitelVerschieben speichert Akt im Plan und Reihenfolge in projekt.md', async () => {
    const { store, fs } = await geladen();
    await store.getState().planung.kapitelVerschieben('flut', 2, 0);
    const d = store.getState().daten!;
    expect(d.plaene['flut']!.akt).toBe(2);
    expect(kapitelImAkt(d.projekt.kapitel, d.plaene, 2)).toEqual(['flut', 'staub', 'weissraum', 'ebbe', 'bis-bald']);
    expect(d.projekt.kapitel.indexOf('flut')).toBe(4);
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.lesen('plan/kapitel/flut.md')).toContain('akt: 2\n');
    const projekt = (await fs.lesen('projekt.md'))!;
    expect(projekt.indexOf('- flut')).toBeLessThan(projekt.indexOf('- staub'));
  });

  it('Reihenfolge innerhalb eines Akts ändern, ohne den Plan zu schreiben', async () => {
    const { store, fs } = await geladen();
    const vorher = await fs.lesen('plan/kapitel/funkstille.md');
    await store.getState().planung.kapitelVerschieben('funkstille', 3, 0);
    expect(store.getState().daten!.projekt.kapitel.slice(-2)).toEqual(['funkstille', 'flut']);
    expect(await fs.lesen('plan/kapitel/funkstille.md')).toBe(vorher);
  });

  it('Idee in einen Akt ziehen: wird geplantes Kapitel, Idee verschwindet', async () => {
    const { store, fs } = await geladen();
    const id = await store.getState().planung.ideeEinplanen('was-passiert-bei-der-regatta', 1, 1);
    const d = store.getState().daten!;
    expect(d.ideen.map((i) => i.id)).not.toContain('was-passiert-bei-der-regatta');
    expect(d.plaene[id]).toMatchObject({ akt: 1, status: 'geplant', straenge: ['begegnungen'], titel: 'Was passiert bei der »Regatta«?' });
    expect(kapitelImAkt(d.projekt.kapitel, d.plaene, 1)).toEqual(['grundriss', id, 'fassade', 'lotte', 'regatta']);
    expect(store.getState().auswahl.plan).toBe(id);
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.existiert(`plan/kapitel/${id}.md`)).toBe(true);
    expect(await fs.existiert(`manuskript/${id}.md`)).toBe(false);
  });

  it('Mit dem Schreiben beginnen: leeres Manuskript, Status Entwurf, öffnet Schreiben', async () => {
    const { store, fs } = await geladen();
    store.getState().setzeBereich('akte');
    await store.getState().planung.schreibenBeginnen('regatta');
    expect(store.getState().bereich).toBe('schreiben');
    expect(store.getState().auswahl.kapitel).toBe('regatta');
    expect(store.getState().daten!.plaene.regatta!.status).toBe('entwurf');
    expect(await fs.lesen('manuskript/regatta.md')).toContain('titel: Regatta');
  });

  it('Abweichung „Plan anpassen“ übernimmt die Notiz, alter Plan bleibt erhalten', async () => {
    const { store } = await geladen();
    const alt = store.getState().daten!.plaene.ebbe!.notiz;
    await store.getState().planung.abweichungEntscheiden('ebbe', 'wahrheit-an-vera', 'plan_anpassen');
    const p = store.getState().daten!.plaene.ebbe!;
    expect(p.notiz).toBe('Paul schreibt Vera am Ende doch die Wahrheit.');
    expect(p.abweichungen[0]).toMatchObject({ entscheidung: 'plan_anpassen', alterPlan: alt });
  });
});

describe('Zusammenfassung (K-03)', () => {
  it('bearbeitete Fassung hat Vorrang und wird veraltet, wenn sich der Text-Hash ändert', async () => {
    const { store, fs } = await geladen();
    store.setState({ index: { ...LEERER_INDEX, textHashes: { ebbe: 'h1' } } });
    expect(zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe').quelle).toBe('ki');

    await store.getState().planung.zusammenfassungSpeichern('ebbe', { text: 'Meine Fassung.', kurz: 'Kurz.' });
    let z = zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe');
    expect(z).toMatchObject({ quelle: 'bearbeitet', text: 'Meine Fassung.', kurz: 'Kurz.', veraltet: false });
    expect(z.wendung).toBe(store.getState().daten!.analysen.ebbe!.wendung);
    expect(store.getState().daten!.entscheidungen.zusammenfassungen[0]!.basisHash).toBe('h1');

    // Text geändert → neuer Hash → „veraltet“, Fassung bleibt
    store.setState({ index: { ...LEERER_INDEX, textHashes: { ebbe: 'h2' } } });
    z = zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe');
    expect(z).toMatchObject({ quelle: 'bearbeitet', text: 'Meine Fassung.', veraltet: true });

    // neue KI-Analyse überschreibt die bearbeitete Fassung nicht
    const analyse = { ...store.getState().daten!.analysen.ebbe!, zusammenfassung: 'KI neu', textHash: 'h2' };
    await store.getState().speichereAnalysen([analyse]);
    expect(zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe').text).toBe('Meine Fassung.');

    await store.getState().planung.zusammenfassungBestaetigen('ebbe');
    expect(zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe').veraltet).toBe(false);
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.lesen('entscheidungen.json')).toContain('"basisHash": "h2"');

    await store.getState().planung.zusammenfassungZuruecksetzen('ebbe');
    expect(zusammenfassungFuer(store.getState().daten!, store.getState().index, 'ebbe').text).toBe('KI neu');
  });

  it('ohne Analyse: „keine“; ohne bekannten Hash nie veraltet', async () => {
    const { store } = await geladen();
    expect(zusammenfassungFuer(store.getState().daten!, LEERER_INDEX, 'regatta').quelle).toBe('keine');
    expect(istVeraltet('', 'x')).toBe(false);
    expect(istVeraltet('a', undefined)).toBe(false);
    expect(istVeraltet('a', 'b')).toBe(true);
  });
});

describe('Lose Enden (K-02)', () => {
  const faeden: Faden[] = [
    { id: 'nordhaven', name: 'Glasfassade', eroeffnetIn: 'grundriss', aufgegriffenIn: ['fassade', 'staub'], zuletztIn: 'staub', status: 'offen' },
    { id: 'lotte', name: 'Treffen mit Lotte', eroeffnetIn: 'lotte', aufgegriffenIn: ['flut'], zuletztIn: 'flut', status: 'offen' },
    { id: 'postkarten', name: 'Die Postkarten', eroeffnetIn: 'bis-bald', aufgegriffenIn: ['funkstille'], zuletztIn: 'funkstille', status: 'offen' },
    { id: 'schluessel', name: 'Der Messingschlüssel', eroeffnetIn: 'bis-bald', aufgegriffenIn: [], zuletztIn: 'bis-bald', status: 'offen' },
  ];

  it('ruhend ab 3 Kapiteln ohne Aufgreifen, nur bis zum gewählten Kapitel', () => {
    const bis8 = faedenBisKapitel(faeden, REIHENFOLGE, 'bis-bald');
    expect(bis8.map((f) => f.faden.id)).toEqual(['postkarten', 'schluessel', 'lotte', 'nordhaven']);
    const nach = Object.fromEntries(bis8.map((f) => [f.faden.id, f]));
    // Nordhaven zuletzt in staub (Pos 4), Kapitel 8 = Pos 7 → 3 Kapitel ruhend
    expect(nach.nordhaven).toMatchObject({ ruhendSeit: 3, ruhend: true });
    // Lotte: Aufgreifen in Kap. 9 zählt bis Kap. 8 noch nicht → seit Kap. 3 ruhend
    expect(nach.lotte).toMatchObject({ zuletztPos: 2, ruhendSeit: 5, ruhend: true });
    expect(nach.postkarten).toMatchObject({ ruhendSeit: 0, ruhend: false });

    const bis7 = faedenBisKapitel(faeden, REIHENFOLGE, 'ebbe');
    expect(bis7.find((f) => f.faden.id === 'nordhaven')).toMatchObject({ ruhendSeit: 2, ruhend: false });
    expect(bis7.some((f) => f.faden.id === 'postkarten')).toBe(false);
  });

  it('erledigt / bewusst offen aus entscheidungen.faeden, dann nie ruhend', async () => {
    const { store } = await geladen();
    await store.getState().planung.fadenStatusSetzen('nordhaven', 'bewusst_offen');
    const e = store.getState().daten!.entscheidungen;
    expect(e.faeden).toEqual([{ id: 'nordhaven', status: 'bewusst_offen' }]);
    const f = faedenBisKapitel(faeden, REIHENFOLGE, 'funkstille', e).find((x) => x.faden.id === 'nordhaven')!;
    expect(f).toMatchObject({ status: 'bewusst_offen', ruhend: false, ruhendSeit: 5 });
    await store.getState().planung.fadenStatusSetzen('nordhaven', 'offen');
    expect(store.getState().daten!.entscheidungen.faeden).toEqual([]);
  });
});

describe('Figuren, Orte, Realität', () => {
  it('figurenBereiche: Realität offen, geplant nur mit berechnetem Index', async () => {
    const { store } = await geladen();
    const d = store.getState().daten!;
    const ohneIndex = figurenBereiche(d, LEERER_INDEX);
    expect(ohneIndex.offen.map((f) => f.id).sort()).toEqual(['alter-mann-am-kai', 'die-fremde']);
    expect(ohneIndex.geplant).toEqual([]);
    expect(ohneIndex.haupt.map((f) => f.id)).toContain('lotte');
    const mitIndex = figurenBereiche(d, { ...LEERER_INDEX, textHashes: { lotte: 'x' }, erstesVorkommen: { paul: 'grundriss', lotte: 'lotte' } });
    expect(mitIndex.haupt.map((f) => f.id)).toEqual(['lotte', 'paul']);
    expect(mitIndex.geplant.map((f) => f.id)).toContain('vera');
  });

  it('Figur vorab anlegen, eigene Felder anlegen/umbenennen/löschen, Notizen', async () => {
    const { store, fs } = await geladen();
    const p = () => store.getState().planung;
    const id = await p().figurAnlegen('Fiete');
    expect(id).toBe('fiete');
    expect(store.getState().auswahl.figur).toBe('fiete');
    const feld = await p().planFeldHinzufuegen(id, 'Alter');
    expect(feld).toBe('Alter 2');
    await p().planFeldSetzen(id, 'Beruf', 'Fischer?');
    await p().planFeldUmbenennen(id, 'Beruf', 'Rolle');
    expect(Object.keys(store.getState().daten!.figuren.fiete!.plan)).toEqual(['Alter', 'Rolle', 'Aussehen', 'Alter 2']);
    expect(store.getState().daten!.figuren.fiete!.plan.Rolle).toBe('Fischer?');
    await p().planFeldEntfernen(id, 'Alter 2');
    await p().figurNotizHinzufuegen(id, 'Erste Notiz');
    await p().figurNotizHinzufuegen(id, 'Zweite Notiz');
    await p().figurNotizEntfernen(id, 0);
    expect(store.getState().daten!.figuren.fiete!.notizen).toBe('Zweite Notiz');
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.lesen('figuren/fiete.md')).toContain('Rolle: Fischer?');
    expect(feldUmbenennen({ a: '1', b: '2' }, 'a', 'c')).toEqual({ c: '1', b: '2' });
  });

  it('Schreibweisen finden und festlegen (O-02)', async () => {
    const { store } = await geladen();
    const texte = [
      { kapitel: 'lotte', text: 'zum Lindenhof und' },
      { kapitel: 'ebbe', text: 'am Linden Hof vorbei' },
      { kapitel: 'funkstille', text: 'vom Linden-Hof. Lindenhofs nicht' },
    ];
    const v = findeVarianten(['Lindenhof'], texte);
    expect(v.map((x) => x.text).sort()).toEqual(['Linden Hof', 'Linden-Hof', 'Lindenhof']);
    expect(v.find((x) => x.text === 'Linden Hof')!.erste).toEqual({ kapitel: 'ebbe', start: 3, ende: 13 });

    await store.getState().planung.schreibweiseFestlegen(['Linden Hof', 'Linden-Hof'], 'Lindenhof', { typ: 'ort', id: 'lindenhof' });
    const d = store.getState().daten!;
    expect(d.entscheidungen.schreibweisen).toEqual([
      { varianten: ['Lindenhof', 'Linden Hof', 'Linden-Hof'], gueltig: 'Lindenhof', ziel: { typ: 'ort', id: 'lindenhof' } },
    ]);
    expect(d.orte.lindenhof!.aliase).toEqual(['Linden Hof', 'Linden-Hof']);
  });

  it('Realitätsebene: Eintrag anlegen, Stufe ändern, entfernen', async () => {
    const { store } = await geladen();
    const p = () => store.getState().planung;
    const id = await p().realitaetHinzufuegen('regatta', 'Ob Paul wirklich dort war');
    expect(store.getState().daten!.plaene.regatta!.realitaet).toEqual([{ id, text: 'Ob Paul wirklich dort war', stufe: 'offen' }]);
    await p().realitaetAendern('regatta', id, { stufe: 'bewusst_vage' });
    expect(store.getState().daten!.plaene.regatta!.realitaet[0]!.stufe).toBe('bewusst_vage');
    await p().realitaetEntfernen('regatta', id);
    expect(store.getState().daten!.plaene.regatta!.realitaet).toEqual([]);
  });

  it('Akt anlegen und Kopfkarte bearbeiten', async () => {
    const { store, fs } = await geladen();
    const p = () => store.getState().planung;
    const n = await p().aktHinzufuegen();
    expect(n).toBe(4);
    expect(store.getState().daten!.akte.at(-1)).toMatchObject({ nummer: 4, titel: 'Akt IV' });
    await p().aktAendern(4, { quintessenz: 'Auflösung', antagonisten: ['konsortium'] });
    await p().praesenzSetzen('konsortium', 4, 'zeigt sich');
    expect(store.getState().daten!.gruppen.konsortium!.praesenz[4]).toBe('zeigt sich');
    await store.getState().alleSpeichernAbwarten();
    expect(await fs.lesen('plan/akte.md')).toContain('quintessenz: Auflösung');
    await expect(p().aktEntfernen(1)).rejects.toThrow();
    await p().aktEntfernen(4);
    expect(store.getState().daten!.akte).toHaveLength(3);
  });
});
