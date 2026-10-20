import { describe, expect, it, vi } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleStore } from '../store';
import { tagSchluessel } from '@core/statistik';
import { sucheProjekt } from '@core/suche';

async function laden() {
  const fs = demoFs();
  const store = erstelleStore();
  await store.getState().projektLaden(fs);
  return { fs, store, s: () => store.getState() };
}
describe('Ersetzen-Sicherheitsnetz', () => {
  it('speichert Sonderzeichen in privaten Figur- und Ortsnotizen wörtlich und nimmt die ganze Aktion zurück', async () => {
    const { fs, s } = await laden();
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Hafen' });
    await s().speichereOrt({ ...s().daten!.orte.lindenhof!, notizen: 'Hafen' });
    const ersatz = '"Ole-Jan" \\ * _ # = -';
    expect((await s().volltext.ersetzen('Hafen', ersatz, {}, {})).fehler).toEqual([]);
    const neu = erstelleStore();
    await neu.getState().projektLaden(fs);
    expect(neu.getState().daten!.figuren.paul!.notizen).toBe(ersatz);
    expect(neu.getState().daten!.orte.lindenhof!.notizen).toBe(ersatz);
    await s().volltext.undo();
    await neu.getState().projektLaden(fs);
    expect(neu.getState().daten!.figuren.paul!.notizen).toBe('Hafen');
    expect(neu.getState().daten!.orte.lindenhof!.notizen).toBe('Hafen');
  });
  it('erhält Verweisziele und Anzeigen bei einer projektweiten Namensersetzung und nach Undo', async () => {
    const { fs, s } = await laden();
    const vorher = 'Paul und [[figur:paul|Paul]] bei [[ort:lindenhof|Paul]]';
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: vorher, plan: { Ziel: vorher } });
    expect((await s().volltext.ersetzen('Paul', 'Ole', {}, {})).fehler).toEqual([]);
    const neu = erstelleStore();
    await neu.getState().projektLaden(fs);
    expect(neu.getState().daten!.figuren.paul!.notizen).toBe('Ole und [[figur:paul|Paul]] bei [[ort:lindenhof|Paul]]');
    expect(neu.getState().daten!.figuren.paul!.plan.Ziel).toBe('Ole und [[figur:paul|Paul]] bei [[ort:lindenhof|Paul]]');
    expect(neu.getState().daten!.figuren.paul!.id).toBe('paul');
    await s().volltext.undo();
    await neu.getState().projektLaden(fs);
    expect(neu.getState().daten!.figuren.paul!.notizen).toBe(vorher);
    expect(neu.getState().daten!.figuren.paul!.plan.Ziel).toBe(vorher);
  });
  it('sichert im Projekt jedes betroffene Kapitel vor dem Schreiben und überspringt nur fehlgeschlagene Sicherungen', async () => {
    const { fs, s } = await laden();
    await s().kapitelTextSpeichern('flut', 'Hafen Hafen');
    await s().kapitelTextSpeichern('lotte', 'Hafen');
    await s().kapitelTextSpeichern('grundriss', 'Ole');
    const vorher = await fs.lesen('manuskript/lotte.md');
    const schreiben = fs.schreiben.bind(fs);
    const spy = vi.spyOn(fs, 'schreiben').mockImplementation(async (pfad, text) => {
      if (pfad.startsWith('.versionen/manuskript/flut.md/')) throw new Error('Test');
      if (pfad === 'manuskript/lotte.md') {
        const versionen = await fs.auflisten('.versionen/manuskript/lotte.md');
        expect(await Promise.all(versionen.map(pfad => fs.lesen(pfad)))).toContain(vorher);
      }
      return schreiben(pfad, text);
    });
    const r = await s().volltext.ersetzen('Hafen', 'Ole', {}, {});
    expect(r.fehler).toHaveLength(1);
    expect(r.fehler[0]).toContain('Flut');
    expect(s().daten!.kapitel.flut!.text).toBe('Hafen Hafen');
    expect(s().daten!.kapitel.lotte!.text).toBe('Ole');
    expect(spy.mock.calls.some(([pfad]) => pfad === 'manuskript/grundriss.md')).toBe(false);
  });
  it('legt beim ersten Ersetzen eines Tages einen Stand mit null geschrieben in statistik.json ab', async () => {
    const { fs, s } = await laden();
    await s().volltext.ersetzen('Volvo', 'Volvo am Hafen', {}, { kapitel: 'flut' });
    const statistik = JSON.parse((await fs.lesen('statistik.json'))!);
    expect(statistik.tage[tagSchluessel(new Date())]).toMatchObject({ geschrieben: 0 });
    expect(statistik.tage[tagSchluessel(new Date())].stand).toBeGreaterThan(0);
  });
  it('führt gleichzeitig gestartete Aktionen nur einmal aus', async () => {
    const { s } = await laden();
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Hafen' });
    await Promise.all([
      s().volltext.ersetzen('Hafen', 'Ole', {}, {}),
      s().volltext.ersetzen('Hafen', 'Lotte', {}, {}),
    ]);
    expect(s().daten!.figuren.paul!.notizen).toBe('Ole');
    expect(s().volltext.kannUndo).toBe(true);
    await s().volltext.undo();
    expect(s().daten!.figuren.paul!.notizen).toBe('Hafen');
  });
  it('legt vor jedem Lauf einen neuen Schnappschuss an, auch in derselben Sekunde', async () => {
    const { fs, s } = await laden();
    await s().volltext.ersetzen('Volvo', 'Hafen', {}, { kapitel: 'flut' });
    await s().volltext.ersetzen('Hafen', 'Volvo', {}, { kapitel: 'flut' });
    expect(await fs.auflisten('.versionen/manuskript/flut.md')).toHaveLength(2);
  });
  it('lässt bei Undo spätere Feldänderungen erhalten', async () => {
    const { s } = await laden();
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Hafen' });
    await s().volltext.ersetzen('Hafen', 'Ole', {}, {});
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Lotte' });
    await expect(s().volltext.undo()).rejects.toThrow();
    expect(s().daten!.figuren.paul!.notizen).toBe('Lotte');
  });
  it('sichert nur betroffene Kapitel vorher und führt nur stand nach', async () => {
    const { fs, s } = await laden();
    const tag = tagSchluessel(new Date());
    await s().speichereStatistik({ version: 1, ziel: { tagWoerter: 0 }, tage: { [tag]: { geschrieben: 7, stand: 0 } } });
    const vorher = await fs.lesen('manuskript/flut.md');
    const schreiben = vi.spyOn(fs, 'schreiben');
    await s().volltext.ersetzen('Volvo', '"Volvo am Hafen"', {}, { kapitel: 'flut' });
    await s().statistik.sichern();
    const versionen = await fs.auflisten('.versionen/manuskript/flut.md');
    expect(versionen.length).toBeGreaterThan(0);
    expect(await fs.lesen(versionen[0]!)).toBe(vorher);
    expect(s().daten!.kapitel.flut!.text).toContain('"Volvo am Hafen"');
    expect(s().daten!.statistik!.tage[tag]!.geschrieben).toBe(7);
    expect(s().daten!.statistik!.tage[tag]!.stand).toBeGreaterThan(0);
    expect(schreiben.mock.calls.some(([pfad]) => pfad === 'manuskript/lotte.md')).toBe(false);
  });
  it('lässt ein Kapitel bei fehlgeschlagenem Schnappschuss unverändert und nennt es', async () => {
    const { fs, s } = await laden();
    const vorher = s().daten!.kapitel.flut!.text;
    const schreiben = fs.schreiben.bind(fs);
    vi.spyOn(fs, 'schreiben').mockImplementation(async (pfad, text) => {
      if (pfad.startsWith('.versionen/')) throw new Error('Test');
      return schreiben(pfad, text);
    });
    const r = await s().volltext.ersetzen('Volvo', 'Hafen', {}, { kapitel: 'flut' });
    expect(s().daten!.kapitel.flut!.text).toBe(vorher);
    expect(r.fehler[0]).toContain('Flut');
  });
  it('nimmt Plan und private Notizen als ganze Aktion zurück, auch nach erneutem Laden', async () => {
    const { fs, s, store } = await laden();
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Hafen', plan: { Ziel: 'Hafen' } });
    await s().speichereOrt({ ...s().daten!.orte.lindenhof!, notizen: 'Hafen' });
    const vorher = structuredClone(s().daten!);
    await s().volltext.ersetzen('Hafen', 'Ole', {}, {});
    expect(s().daten!.figuren.paul!.notizen).toBe('Ole');
    expect(s().daten!.orte.lindenhof!.notizen).toBe('Ole');
    await s().volltext.undo();
    expect(s().daten!.figuren).toEqual(vorher.figuren);
    expect(s().daten!.orte).toEqual(vorher.orte);
    await store.getState().projektLaden(fs);
    expect(s().daten!.figuren).toEqual(vorher.figuren);
    expect(s().volltext.kannUndo).toBe(false);
  });
  it('ersetzt gezielt einen einzelnen Projekttreffer', async () => {
    const { s } = await laden();
    await s().speichereFigur({ ...s().daten!.figuren.paul!, notizen: 'Paul Paul' });
    const treffer = sucheProjekt(s().daten!, 'Paul').find(x => x.feld.pfad.join('.') === 'figuren.paul.notizen');
    expect(treffer).toBeDefined();
    await s().volltext.ersetzen('Paul', 'Ole', {}, { einzeln: treffer });
    expect(s().daten!.figuren.paul!.notizen).toContain('Ole');
    expect(s().daten!.kapitel.flut!.text).not.toContain('Ole');
  });
});
