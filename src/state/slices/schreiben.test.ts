import { afterEach, describe, expect, it, vi } from 'vitest';
import { kapitelPfad, parseAnmerkungen, parseKapitelPlan, parseProjekt, planPfad as kapitelPlanPfad } from '@core/projekt';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleStore } from '../store';

async function geladen() {
  const fs = demoFs();
  const store = erstelleStore();
  await store.getState().projektLaden(fs);
  return { fs, store, s: () => store.getState() };
}

describe('Schreiben-Slice', () => {
  it('speichert eine Abweichung und behält den alten Plan', async () => {
    const { fs, s } = await geladen();
    const vorher = s().daten!.plaene['flut']!.notiz;
    const a = await s().abweichungSpeichern('flut', { notiz: 'Lotte kommt mit dem Fahrrad.', entscheidung: 'alternative' });
    await s().alleSpeichernAbwarten();
    expect(a.entscheidung).toBe('alternative');
    expect(a.alterPlan).toBe(vorher);
    expect(a.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const datei = parseKapitelPlan((await fs.lesen(kapitelPlanPfad('flut')))!);
    expect(datei.notiz).toBe(vorher);
    expect(datei.abweichungen).toHaveLength(1);
    expect(datei.abweichungen[0]).toMatchObject({ notiz: 'Lotte kommt mit dem Fahrrad.', entscheidung: 'alternative', alterPlan: vorher });
  });

  it('„Plan anpassen“ übernimmt die Notiz auf Wunsch als neuen Plan', async () => {
    const { fs, s } = await geladen();
    const vorher = s().daten!.plaene['flut']!.notiz;
    await s().abweichungSpeichern('flut', { notiz: 'Paul ist zu spät.', entscheidung: 'plan_anpassen', planUebernehmen: true });
    await s().alleSpeichernAbwarten();
    const datei = parseKapitelPlan((await fs.lesen(kapitelPlanPfad('flut')))!);
    expect(datei.notiz).toBe('Paul ist zu spät.');
    expect(datei.abweichungen[0]!.alterPlan).toBe(vorher);
  });

  it('entscheidet eine spätere Abweichung nachträglich', async () => {
    const { s } = await geladen();
    const a = await s().abweichungSpeichern('funkstille', { notiz: 'Kein Anruf.', entscheidung: 'spaeter' });
    await s().abweichungEntscheiden('funkstille', a.id, 'plan_anpassen', true);
    const p = s().daten!.plaene.funkstille!;
    expect(p.abweichungen[0]!.entscheidung).toBe('plan_anpassen');
    expect(p.notiz).toBe('Kein Anruf.');
  });

  it('lehnt eine leere Abweichung ab', async () => {
    const { s } = await geladen();
    await expect(s().abweichungSpeichern('funkstille', { notiz: '  ', entscheidung: 'spaeter' })).rejects.toThrow();
  });

  it('plant ein Kapitel am Ende und wählt es aus', async () => {
    const { fs, s } = await geladen();
    const id = await s().kapitelPlanen();
    await s().alleSpeichernAbwarten();
    expect(s().auswahl.kapitel).toBe(id);
    expect(s().daten!.projekt.kapitel.at(-1)).toBe(id);
    expect(s().daten!.plaene[id]!.status).toBe('geplant');
    expect(await fs.existiert(kapitelPfad(id))).toBe(false);
    expect(parseProjekt((await fs.lesen('projekt.md'))!).kapitel.at(-1)).toBe(id);

    await s().kapitelTitelSpeichern(id, 'Rooftop');
    expect(s().daten!.kapitel[id]!.titel).toBe('Rooftop');
    expect(s().daten!.plaene[id]!.titel).toBe('Rooftop');
    expect(await fs.existiert(kapitelPfad(id))).toBe(false);

    await s().kapitelTextSpeichern(id, 'Erster Satz.');
    await s().alleSpeichernAbwarten();
    expect(await fs.existiert(kapitelPfad(id))).toBe(true);
    expect(s().daten!.plaene[id]!.status).toBe('entwurf');
  });

  it('verschiebt Kapitel', async () => {
    const { s } = await geladen();
    await s().kapitelVerschieben('funkstille', 0);
    expect(s().daten!.projekt.kapitel.slice(0, 2)).toEqual(['funkstille', 'grundriss']);
    await s().kapitelVerschieben('funkstille', 9);
    expect(s().daten!.projekt.kapitel.at(-1)).toBe('funkstille');
  });

  it('legt Anmerkungen an, ändert, verankert und entfernt sie', async () => {
    const { fs, s } = await geladen();
    const anker = { kapitel: 'flut', exakt: 'Volvo', davor: 'winke dem wegfahrenden ', danach: ' hinterher.' };
    const a = await s().anmerkungAnlegen(anker, 'Welche Farbe?', { typ: 'figur', id: 'paul' });
    await s().anmerkungAendern(a.id, { notiz: 'Welche Farbe hat der Volvo?' });
    await s().anmerkungenVerankern([{ id: a.id, anker: { ...anker, danach: ' hinterher, langsam.' } }]);
    await s().alleSpeichernAbwarten();
    let datei = parseAnmerkungen((await fs.lesen('anmerkungen.json'))!);
    expect(datei.find((x) => x.id === a.id)).toMatchObject({ notiz: 'Welche Farbe hat der Volvo?', anker: { danach: ' hinterher, langsam.' } });
    await s().anmerkungEntfernen(a.id);
    await s().alleSpeichernAbwarten();
    datei = parseAnmerkungen((await fs.lesen('anmerkungen.json'))!);
    expect(datei.some((x) => x.id === a.id)).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stellt eine Version wieder her und sichert vorher die aktuelle Fassung', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T10:00:00'));
    const { fs, s } = await geladen();
    const pfad = kapitelPfad('flut');
    const original = s().daten!.kapitel['flut']!.text;
    await s().kapitelTextSpeichern('flut', `${original}\n\nNeuer Absatz.`);
    await s().alleSpeichernAbwarten();
    const version = await s().schnappschuss(pfad, 'intervall');
    expect(version).toBeTruthy();
    vi.setSystemTime(new Date('2026-10-09T10:20:00'));
    await s().kapitelTextSpeichern('flut', 'Ganz anders.');
    await s().alleSpeichernAbwarten();
    let gesichert = false;
    s().registriereEditorSichern(async () => {
      gesichert = true;
    });
    await s().versionWiederherstellen('flut', version!);
    await s().alleSpeichernAbwarten();
    expect(gesichert).toBe(true);
    expect(s().daten!.kapitel['flut']!.text).toBe(`${original}\n\nNeuer Absatz.`);
    const versionen = (await fs.auflisten('.versionen')).filter((p) => p.includes('flut'));
    expect(versionen.length).toBeGreaterThanOrEqual(2);
    const inhalte = await Promise.all(versionen.map((p) => fs.lesen(p)));
    expect(inhalte.some((t) => t?.includes('Ganz anders.'))).toBe(true);
  });
});
