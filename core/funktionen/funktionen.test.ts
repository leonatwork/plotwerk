import { describe, expect, it } from 'vitest';
import {
  abhaengigeVon,
  aktiveFunktionen,
  ausschalten,
  eigenesPresetLoeschen,
  eigenesPresetSpeichern,
  einschalten,
  FUNKTION_IDS,
  FUNKTIONEN,
  kiFunktionen,
  kiKontextUmfang,
  kiStufe,
  normalisiere,
  PRESET_IDS,
  PRESETS,
  presetKennung,
  profilAusJson,
  profilMitAuswahl,
  profilMitEigenemPreset,
  profilMitPreset,
  standardProfil,
} from './index';

describe('Katalog', () => {
  it('jede Abhängigkeit zeigt auf eine bekannte Funktion, ohne Kreise', () => {
    for (const f of FUNKTIONEN) {
      for (const b of f.braucht ?? []) expect(FUNKTION_IDS).toContain(b);
      expect(abhaengigeVon(f.id)).not.toContain(f.id);
    }
  });

  it('KI-Funktionen haben eine Last, andere nicht', () => {
    for (const f of FUNKTIONEN) expect(!!f.kiLast).toBe(!!f.ki);
  });

  it('Presets sind normalisiert und wachsen von Stufe zu Stufe', () => {
    let vorher: readonly string[] = [];
    for (const id of PRESET_IDS) {
      const p = PRESETS[id];
      expect(normalisiere(p)).toEqual([...p].sort((a, b) => FUNKTION_IDS.indexOf(a) - FUNKTION_IDS.indexOf(b)));
      for (const f of vorher) expect(p).toContain(f);
      expect(p.length).toBeGreaterThan(vorher.length);
      vorher = p;
    }
    expect(PRESETS.autor).toEqual(FUNKTION_IDS);
  });

  it('KI-Stufe steigt mit dem Preset', () => {
    expect(PRESET_IDS.map((p) => kiStufe(PRESETS[p]))).toEqual(['gering', 'mittel', 'mittel', 'hoch']);
    expect(kiStufe(PRESETS.autor, true)).toBe('aus');
    expect(kiStufe(['editor'])).toBe('keine');
  });
});

describe('Auswahl', () => {
  it('normalisiere ergänzt Pflicht und Abhängigkeiten, verwirft Unbekanntes', () => {
    expect(normalisiere(['kiPlanAbgleich', 'gibtsnicht'])).toEqual(['editor', 'hinweise', 'kiPruefung', 'kiPlanAbgleich']);
  });

  it('einschalten nimmt Benötigtes mit', () => {
    expect(einschalten(['editor'], 'boegen')).toEqual(['editor', 'figuren', 'boegen']);
  });

  it('ausschalten nimmt Abhängige mit, Pflicht bleibt', () => {
    const alle = [...FUNKTION_IDS];
    const ohneFiguren = ausschalten(alle, 'figuren');
    expect(ohneFiguren).not.toContain('figuren');
    expect(ohneFiguren).not.toContain('boegen');
    expect(ohneFiguren).not.toContain('beziehungen');
    expect(ohneFiguren).not.toContain('kiStimme');
    expect(ohneFiguren).toContain('orte');
    expect(ausschalten(alle, 'editor')).toContain('editor');
    expect(ausschalten(alle, 'hinweise')).not.toContain('kiTiefencheck');
  });
});

describe('Profil', () => {
  it('Preset wählen und frei ändern: Basis wird „eigen“, zurück zum Preset wieder das Preset', () => {
    const p = profilMitPreset(standardProfil(), 'einsteiger');
    expect(p.basis).toBe('einsteiger');
    const mehr = profilMitAuswahl(p, einschalten(p.funktionen, 'recherche'));
    expect(mehr.basis).toBe('eigen');
    const zurueck = profilMitAuswahl({ ...mehr, basis: 'einsteiger' }, PRESETS.einsteiger);
    expect(zurueck.basis).toBe('einsteiger');
  });

  it('No-AI-Modus blendet KI-Funktionen aus, behält aber die Auswahl', () => {
    const p = { ...profilMitPreset(standardProfil(), 'profi'), kiAus: true };
    const aktiv = aktiveFunktionen(p);
    expect([...aktiv].some((id) => id.startsWith('ki'))).toBe(false);
    expect(aktiv.has('zeitleiste')).toBe(true);
    expect(p.funktionen).toContain('kiZeit');
    expect(kiFunktionen(p.funktionen)).toEqual(['kiPruefung', 'kiPlanAbgleich', 'kiErkennung', 'kiZeit', 'kiStimme', 'kiLeser']);
  });

  it('Plan-Felder gehen nur mit Plan-Abgleich an die KI', () => {
    expect(kiKontextUmfang(profilMitPreset(standardProfil(), 'einsteiger')).plan).toBe(false);
    expect(kiKontextUmfang(profilMitPreset(standardProfil(), 'fortgeschritten')).plan).toBe(true);
    expect(kiKontextUmfang({ ...profilMitPreset(standardProfil(), 'autor'), kiAus: true }).plan).toBe(false);
  });

  it('eigene Presets speichern, überschreiben, wählen und löschen', () => {
    let p = profilMitAuswahl(profilMitPreset(standardProfil(), 'einsteiger'), ['editor', 'recherche']);
    p = eigenesPresetSpeichern(p, '  Mein Krimi ');
    expect(p.eigenePresets).toEqual([{ id: 'eigen-mein-krimi', name: 'Mein Krimi', funktionen: ['editor', 'recherche'], kiAus: false }]);
    expect(p.basis).toBe('eigen-mein-krimi');

    p = eigenesPresetSpeichern(profilMitAuswahl(p, ['editor', 'orte']), 'mein krimi');
    expect(p.eigenePresets).toHaveLength(1);
    expect(p.eigenePresets[0]!.funktionen).toEqual(['editor', 'orte']);

    p = profilMitEigenemPreset(profilMitPreset(p, 'autor'), 'eigen-mein-krimi');
    expect(p.funktionen).toEqual(['editor', 'orte']);

    p = eigenesPresetLoeschen(p, 'eigen-mein-krimi');
    expect(p.eigenePresets).toEqual([]);
    expect(p.basis).toBe('eigen');
  });

  it('Kennungen sind eindeutig und ohne Sonderzeichen', () => {
    expect(presetKennung('Größe & Übermut', [])).toBe('eigen-grosse-ubermut');
    expect(presetKennung('A', ['eigen-a'])).toBe('eigen-a-2');
    expect(presetKennung('!!!', [])).toBe('eigen-preset');
  });
});

describe('profilAusJson', () => {
  it('liest ein gespeichertes Profil zurück', () => {
    const p = eigenesPresetSpeichern(profilMitPreset(standardProfil(), 'profi'), 'X');
    expect(profilAusJson(JSON.parse(JSON.stringify({ ...p, eingerichtet: true })))).toEqual({ ...p, eingerichtet: true });
  });

  it('Unbrauchbares ergibt null', () => {
    expect(profilAusJson(null)).toBeNull();
    expect(profilAusJson({ version: 2, funktionen: [] })).toBeNull();
    expect(profilAusJson('profi')).toBeNull();
  });

  it('neue Funktionen: nach Preset der Basis, bei eigener Auswahl eingeschaltet', () => {
    const ohneZeit = FUNKTION_IDS.filter((id) => id !== 'zeitleiste' && id !== 'kiZeit');
    const einsteiger = profilAusJson({ version: 1, basis: 'einsteiger', funktionen: PRESETS.einsteiger, bekannt: ohneZeit });
    expect(einsteiger!.funktionen).not.toContain('zeitleiste');
    const profi = profilAusJson({ version: 1, basis: 'profi', funktionen: ['editor'], bekannt: ohneZeit });
    expect(profi!.funktionen).toEqual(['editor', 'zeitleiste', 'kiZeit']);
    const eigen = profilAusJson({ version: 1, basis: 'eigen', funktionen: ['editor'], bekannt: ohneZeit });
    expect(eigen!.funktionen).toContain('kiZeit');
  });

  it('ohne „bekannt“ gilt der ganze Katalog als bekannt (nichts wird nachträglich eingeschaltet)', () => {
    expect(profilAusJson({ version: 1, basis: 'eigen', funktionen: ['editor'] })!.funktionen).toEqual(['editor']);
  });

  it('kaputte eigene Presets fallen weg, unbekannte Basis wird „eigen“', () => {
    const p = profilAusJson({
      version: 1,
      basis: 'eigen-weg',
      funktionen: ['editor'],
      eigenePresets: [{ id: 'eigen-ok', name: 'OK', funktionen: ['orte'] }, { id: 'kaputt', name: 'x' }, { id: 'eigen-leer', name: ' ' }],
    })!;
    expect(p.basis).toBe('eigen');
    expect(p.eigenePresets).toEqual([{ id: 'eigen-ok', name: 'OK', funktionen: ['editor', 'orte'], kiAus: false }]);
  });
});
