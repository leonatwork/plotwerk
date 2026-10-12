/** Meldungen und Startwerte des Stores in der englischen Oberfläche (setup.ts stellt vor jedem Test wieder Deutsch ein). */
import { describe, expect, it } from 'vitest';
import { KiFehler } from '@core/ki/index';
import { demoFs } from '../../fixtures/demoProjekt';
import { festeSprache } from '../i18n';
import { abgabeDateiname } from './slices/abgabe';
import { exportDateiname, ImportAbgebrochen } from './slices/importexport';
import { kiFehlerAnzeige } from './slices/ki';
import { eindeutigerName, kurzfassung } from './slices/planung';
import { erstelleStore } from './store';

async function geladen() {
  const store = erstelleStore();
  await store.getState().projektLaden(demoFs());
  return store;
}

describe('KI-Fehleranzeige auf Englisch', () => {
  it('übersetzt HTTP- und Netzfehler, die Meldung des Dienstes bleibt angehängt', () => {
    festeSprache('en');
    expect(kiFehlerAnzeige(new Error('HTTP 401 Unauthorized'))).toEqual({
      art: 'nicht_bereit',
      text: 'The API key was rejected (401). Check or replace it in Settings.',
    });
    expect(kiFehlerAnzeige(new Error('rate_limit_error')).text).toBe('Too many requests to the AI service (429). Wait a moment and try again later.');
    expect(kiFehlerAnzeige('Failed to fetch')).toEqual({
      art: 'api',
      text: 'Can’t connect to the AI service. Without a network connection, everything except AI checks still works. (Failed to fetch)',
    });
    expect(kiFehlerAnzeige(new Error('DeploymentNotFound')).text).toBe('Model or endpoint not found (404). Check your settings. DeploymentNotFound');
  });

  it('deutet eigene Meldungen (Auftrag, Abbruch, Antwort) nicht als HTTP-Fehler', () => {
    festeSprache('en');
    expect(kiFehlerAnzeige(new KiFehler('auftrag', 'Chapter “x” not found.'))).toEqual({ art: 'auftrag', text: 'Chapter “x” not found.' });
  });

  it('bleibt auf Deutsch, solange die Oberfläche deutsch ist', () => {
    expect(kiFehlerAnzeige(new Error('429')).text).toBe('Zu viele Anfragen an den KI-Dienst (429). Bitte einen Moment warten und später erneut prüfen.');
  });
});

describe('Store-Meldungen auf Englisch', () => {
  it('Fehler ohne Projekt und abgelehnte Aktionen', async () => {
    festeSprache('en');
    const leer = erstelleStore();
    await expect(leer.getState().planung.kapitelPlanen(1)).rejects.toThrow('No project is open.');
    await expect(leer.getState().kiSchluesselSetzen('   ')).rejects.toThrow('Please enter a key.');
    expect(new ImportAbgebrochen().message).toBe('No new project was created.');

    const store = await geladen();
    await expect(store.getState().statistik.fassungSichern({ name: ' ', kapitel: 'buch' })).rejects.toThrow('Please give the draft version a name.');
    await expect(store.getState().planung.figurAendern('gibt-es-nicht', { name: 'X' })).rejects.toThrow('Character “gibt-es-nicht” not found.');
    expect(store.getState().recherche.dateiPruefen('notiz.txt', 10)).toBe('“notiz.txt” isn’t an image (allowed: JPG, PNG, GIF, WebP, HEIC, TIFF, SVG …).');
  });

  it('Leser-Simulation: Schreibauftrag wird auf Englisch abgelehnt', async () => {
    festeSprache('en');
    const store = await geladen();
    expect(await store.getState().kileser.fragen('Schreib mir das nächste Kapitel')).toBe(false);
    expect(store.getState().kileser.frageFehler).toEqual({
      art: 'auftrag',
      text: 'The AI doesn’t write text for the book. Ask about passages, characters or events in the text.',
    });
  });

  it('Startwerte neuer Einträge folgen der Oberflächensprache', async () => {
    festeSprache('en');
    const store = await geladen();
    const p = () => store.getState().planung;
    const kapitel = await p().kapitelPlanen(null);
    expect(store.getState().daten!.plaene[kapitel]!.titel).toBe('New chapter');
    const idee = await p().ideeAnlegen();
    expect(store.getState().daten!.ideen.find((i) => i.id === idee)!.titel).toBe('New idea');
    const akt = await p().aktHinzufuegen();
    expect(store.getState().daten!.akte.find((a) => a.nummer === akt)!.titel).toMatch(/^Act [IVX]+$/);
    const figur = await p().figurAnlegen('Zoe');
    expect(Object.keys(store.getState().daten!.figuren[figur]!.plan)).toEqual(['Age', 'Occupation', 'Appearance']);
    expect(eindeutigerName('', ['New field'])).toBe('New field 2');
  });

  it('Kurzfassung und Dateinamen', async () => {
    festeSprache('en');
    const store = await geladen();
    const id = await store.getState().planung.kapitelPlanen(null, 'Leer');
    expect(kurzfassung(store.getState().daten!, store.getState().index, id)).toBe('Still empty.');
    expect(abgabeDateiname('Hafenlichter', 'normseite')).toBe('Hafenlichter (standard pages).docx');
    expect(abgabeDateiname('Hafenlichter', 'mappe')).toBe('Hafenlichter – Editing packet.pdf');
    expect(abgabeDateiname('Hafenlichter', 'epub')).toBe('Hafenlichter.epub');
    expect(exportDateiname(' ', 'pdf')).toBe('Manuscript.pdf');
  });
});
