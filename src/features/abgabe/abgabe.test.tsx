import JSZip from 'jszip';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportiereDocxMit } from '@core/docx/exportieren';
import type { Kapitel } from '@core/model/types';
import { klartext } from '@core/text/index';
import { demoFs } from '../../../fixtures/demoProjekt';
import type { Backend } from '../../backend';
import { abgabeDateiname, mitAbgabeEndung } from '../../state/slices/abgabe';
import { erstelleStore, useStore } from '../../state/store';
import AbgabeDialog from './AbgabeDialog';
import RueckimportDialog from './RueckimportDialog';

vi.mock('../importexport/pdfSchriften', async (original) => ({ ...(await original<typeof import('../importexport/pdfSchriften')>()), ladePdfSchriften: async () => [] }));

function fakeBackend(teil: Partial<Backend> = {}): Backend {
  return {
    art: 'demo',
    projektOeffnen: vi.fn(async () => null),
    neuesProjekt: vi.fn(async () => null),
    letztesProjekt: vi.fn(async () => null),
    dateiWaehlen: vi.fn(async () => null),
    dateiSpeichern: vi.fn(async () => true),
    ki: { senden: vi.fn(), tokenZaehlen: vi.fn(), bereit: vi.fn(async () => false) } as unknown as Backend['ki'],
    indexSpeicher: { laden: async () => null, speichern: async () => undefined, leeren: async () => undefined },
    schluessel: { setzen: async () => undefined, vorhanden: async () => false, loeschen: async () => undefined },
    beimBeenden: () => undefined,
    aufExterneAenderung: () => undefined,
    ...teil,
  };
}

async function demoStore(backend = fakeBackend()) {
  const store = erstelleStore();
  const fs = demoFs();
  store.setState({ backend });
  await store.getState().projektLaden(fs);
  return { store, fs, backend };
}

const LEKTORIN = 'w:author="Mia Lektorin" w:date="2026-10-08T09:00:00Z"';

/** Plotwerk-Export des Demo-Projekts, in „Word“ mit einer nachverfolgten Änderung und einem Kommentar versehen */
async function lektorierterExport(kapitel: Kapitel[], titel: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await exportiereDocxMit(kapitel, titel));
  let xml = await zip.file('word/document.xml')!.async('string');
  const vorher = xml;
  xml = xml.replace('Zeichentisch aus Eiche, den', `Zeichentisch aus <w:del w:id="91" ${LEKTORIN}><w:r><w:delText>Eiche</w:delText></w:r></w:del><w:ins w:id="92" ${LEKTORIN}><w:r><w:t>Buche</w:t></w:r></w:ins>, den`);
  // die Ersetzung muss im Lauftext liegen (Text eines w:t)
  xml = xml.replace(/<w:t xml:space="preserve">([^<]*)Zeichentisch aus <w:del/, '<w:t xml:space="preserve">$1Zeichentisch aus </w:t></w:r><w:del').replace(
    /<\/w:ins>, den([^<]*)<\/w:t><\/w:r>/,
    '</w:ins><w:r><w:t xml:space="preserve">, den$1</w:t></w:r>',
  );
  expect(xml).not.toBe(vorher);
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('Slice abgabe', () => {
  it('schlägt Dateinamen vor und passt Endungen an', () => {
    expect(abgabeDateiname('Hafenlichter', 'normseite')).toBe('Hafenlichter (Normseiten).docx');
    expect(abgabeDateiname('Hafenlichter', 'expose', 'md')).toBe('Hafenlichter – Exposé.md');
    expect(abgabeDateiname('A/B', 'epub')).toBe('A-B.epub');
    expect(abgabeDateiname('Hafenlichter', 'mappe')).toBe('Hafenlichter – Lektoratsmappe.pdf');
    expect(mitAbgabeEndung('Buch.docx', 'epub')).toBe('Buch.epub');
  });

  it('erstellt alle vier Formate aus dem Demo-Projekt', async () => {
    const { store } = await demoStore();
    const d = store.getState().daten!;
    const kapitel = d.projekt.kapitel.filter((id) => d.kapitel[id]?.text.trim());
    const a = store.getState().abgabe;

    const normseite = await a.erstellen({ format: 'normseite', kapitel, titelseite: true });
    expect(await (await JSZip.loadAsync(normseite)).file('word/document.xml')!.async('string')).toContain('Normseiten');

    const md = new TextDecoder().decode(await a.erstellen({ format: 'expose', ziel: 'md', kapitel: 'plan', nebenfiguren: true }));
    expect(md.startsWith(`# ${d.projekt.titel}`)).toBe(true);
    expect(md).toContain('Platzhalter');

    const epub = await JSZip.loadAsync(await a.erstellen({ format: 'epub', kapitel, titelseite: true, schrift: false }));
    expect(await epub.file('mimetype')!.async('string')).toBe('application/epub+zip');

    const pdf = await a.erstellen({ format: 'mappe', kapitel: null });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('speichert Angaben zum Buch in projekt.md', async () => {
    const { store, fs } = await demoStore();
    await store.getState().abgabe.angabenSpeichern({ autor: ' Leon Machnik ', genre: '', untertitel: 'Roman' });
    await store.getState().alleSpeichernAbwarten();
    expect(store.getState().daten!.projekt.angaben).toEqual({ autor: 'Leon Machnik', untertitel: 'Roman' });
    expect(await fs.lesen('projekt.md')).toContain('autor: Leon Machnik');
  });

  it('nimmt eine Änderung an: Text geändert, Schnappschuss davor, Status gespeichert', async () => {
    const { store, fs } = await demoStore();
    const vorher = store.getState().daten!.kapitel.lotte!.text;
    const e = await store.getState().abgabe.lektoratEntscheiden('lektorat-1', 'angenommen');
    await store.getState().alleSpeichernAbwarten();
    expect(e).toEqual({ ok: true });
    const d = store.getState().daten!;
    expect(d.kapitel.lotte!.text).toBe(vorher.replace('ein zweites Mal', 'noch einmal'));
    expect(await fs.lesen('manuskript/lotte.md')).toContain('Hemd noch einmal und');
    expect(d.lektorat!.find((a) => a.id === 'lektorat-1')!.status).toBe('angenommen');
    expect(await fs.lesen('lektorat/aenderungen.json')).toContain('"status": "angenommen"');
    const versionen = Object.keys(fs.alleDateien()).filter((p) => p.startsWith('.versionen/manuskript/lotte'));
    expect(versionen.length).toBeGreaterThan(0);
    expect(fs.alleDateien()[versionen[0]!]).toContain('ein zweites Mal');

    // zurück auf „offen“ geht nicht (steht schon im Text)
    const zurueck = await store.getState().abgabe.lektoratEntscheiden('lektorat-1', 'offen');
    expect(zurueck.ok).toBe(false);
  });

  it('lehnt ab, ohne den Text zu ändern, und kann wieder öffnen', async () => {
    const { store } = await demoStore();
    const vorher = store.getState().daten!.kapitel.staub!.text;
    expect(await store.getState().abgabe.lektoratEntscheiden('lektorat-2', 'abgelehnt')).toEqual({ ok: true });
    expect(store.getState().daten!.kapitel.staub!.text).toBe(vorher);
    expect(store.getState().daten!.lektorat!.find((a) => a.id === 'lektorat-2')!.status).toBe('abgelehnt');
    await store.getState().abgabe.lektoratEntscheiden('lektorat-2', 'offen');
    expect(store.getState().daten!.lektorat!.find((a) => a.id === 'lektorat-2')!.status).toBe('offen');
  });

  it('meldet, wenn die Stelle nicht mehr im Text steht', async () => {
    const { store } = await demoStore();
    const lotte = store.getState().daten!.kapitel.lotte!;
    await store.getState().kapitelTextSpeichern('lotte', lotte.text.replace('ein zweites Mal', 'seit zwei Stunden'));
    const e = await store.getState().abgabe.lektoratEntscheiden('lektorat-1', 'angenommen');
    expect(e.ok).toBe(false);
    expect(store.getState().daten!.lektorat!.find((a) => a.id === 'lektorat-1')!.status).toBe('offen');
  });

  it('übernimmt eine lektorierte .docx: Änderungen als Vorschläge, Leons Text unverändert', async () => {
    const { store } = await demoStore();
    const d = store.getState().daten!;
    const kapitel = d.projekt.kapitel.map((id) => d.kapitel[id]).filter((k): k is Kapitel => !!k && !!k.text.trim());
    const { leseRueckimport, kapitelZuordnen } = await import('@core/docx/rueckimport');
    const r = await leseRueckimport(await lektorierterExport(kapitel, d.projekt.titel));
    const zuordnung = kapitelZuordnen(r, kapitel);
    expect(zuordnung.every((z) => z.art === 'titel')).toBe(true);
    const vorher = store.getState().daten!.kapitel.lotte!.text;
    const anzahl = d.lektorat!.length;
    const bericht = await store.getState().abgabe.rueckimportUebernehmen(r, zuordnung.map((z) => z.kapitel), { quelle: 'lektoriert.docx', kommentare: true, aenderungen: true });
    expect(bericht).toMatchObject({ aenderungen: 1, nichtGefunden: 0 });
    const neu = store.getState().daten!.lektorat!;
    expect(neu).toHaveLength(anzahl + 1);
    expect(neu[neu.length - 1]).toMatchObject({ art: 'ersetzen', alt: 'Eiche', neu: 'Buche', status: 'offen', quelle: 'lektoriert.docx', anker: { kapitel: 'lotte' } });
    expect(store.getState().daten!.kapitel.lotte!.text).toBe(vorher);

    // zweites Einlesen derselben Datei: nichts doppelt
    const zweit = await store.getState().abgabe.rueckimportUebernehmen(r, zuordnung.map((z) => z.kapitel), { quelle: 'lektoriert.docx', kommentare: true, aenderungen: true });
    expect(zweit).toMatchObject({ aenderungen: 0, doppelt: 1 });

    const id = neu[neu.length - 1]!.id;
    expect(await store.getState().abgabe.lektoratEntscheiden(id, 'angenommen')).toEqual({ ok: true });
    expect(klartext(store.getState().daten!.kapitel.lotte!.text)).toContain('Zeichentisch aus Buche, den');
  });
});

describe('AbgabeDialog', () => {
  beforeEach(() => {
    useStore.setState({ dialog: null, daten: null, fs: null });
  });

  it('wählt den Stil, speichert ohne Export und erhält ihn beim Sprachwechsel und Neuladen', async () => {
    const fs = demoFs();
    await useStore.getState().projektLaden(fs);
    const vorher = useStore.getState().daten!.kapitel;
    const ui = render(<AbgabeDialog schliessen={vi.fn()} />);
    const auswahl = screen.getByLabelText('Anführungszeichen-Stil');
    expect(auswahl).toHaveValue('de');
    expect(within(auswahl).getAllByRole('option').map((o) => o.textContent)).toEqual(['Deutsch „…“ ‚…‘', 'Verlag »…« ›…‹', 'Schweiz «…» ‹…›']);
    await act(async () => {
      fireEvent.change(auswahl, { target: { value: 'verlag' } });
    });
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.projekt.angaben?.anfuehrung).toBe('verlag');
    expect(await fs.lesen('projekt.md')).toContain('anfuehrung: verlag');
    expect(useStore.getState().daten!.kapitel).toEqual(vorher);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Sprache'), { target: { value: 'fr' } });
      fireEvent.blur(screen.getByLabelText('Sprache'));
    });
    expect(screen.queryByLabelText('Anführungszeichen-Stil')).toBeNull();
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.projekt.angaben).toMatchObject({ sprache: 'fr', anfuehrung: 'verlag' });
    ui.unmount();
    await useStore.getState().projektLaden(fs);
    render(<AbgabeDialog schliessen={vi.fn()} />);
    expect(screen.queryByLabelText('Anführungszeichen-Stil')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sprache'), { target: { value: 'de-CH' } });
    expect(screen.getByLabelText('Anführungszeichen-Stil')).toHaveValue('verlag');
  });

  it('zeigt die Normseitenzahl vorab und exportiert über backend.dateiSpeichern', async () => {
    const backend = fakeBackend();
    useStore.setState({ backend });
    await useStore.getState().projektLaden(demoFs());
    render(<AbgabeDialog schliessen={vi.fn()} />);
    expect(screen.getByText('Normseiten')).toBeTruthy();
    const titel = useStore.getState().daten!.projekt.titel;
    expect((screen.getByLabelText('Dateiname') as HTMLInputElement).value).toBe(`${titel} (Normseiten).docx`);

    fireEvent.click(screen.getByRole('button', { name: 'Exposé' }));
    expect((screen.getByLabelText('Dateiname') as HTMLInputElement).value).toBe(`${titel} – Exposé.docx`);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown (.md)' }));
    expect((screen.getByLabelText('Dateiname') as HTMLInputElement).value).toBe(`${titel} – Exposé.md`);
    fireEvent.change(screen.getByLabelText('Autor'), { target: { value: 'Leon Machnik' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    });
    await waitFor(() => expect(backend.dateiSpeichern).toHaveBeenCalled());
    const [name, inhalt] = vi.mocked(backend.dateiSpeichern).mock.calls[0]!;
    expect(name).toBe(`${titel} – Exposé.md`);
    expect(new TextDecoder().decode(inhalt)).toContain('**Autor:** Leon Machnik');
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(useStore.getState().daten!.projekt.angaben?.autor).toBe('Leon Machnik');
    expect(useStore.getState().abgabe.einstellungen).toMatchObject({ format: 'expose', exposeFormat: 'md' });
  });

  it('sperrt die Lektoratsmappe ohne offene Hinweise', async () => {
    useStore.setState({ backend: fakeBackend() });
    await useStore.getState().projektLaden(demoFs());
    useStore.setState({ index: { ...useStore.getState().index, hinweise: [] } });
    render(<AbgabeDialog param={{ format: 'mappe' }} schliessen={vi.fn()} />);
    expect(screen.getByText('Es gibt keine offenen Hinweise.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Exportieren' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('RueckimportDialog', () => {
  beforeEach(() => {
    useStore.setState({ dialog: null, daten: null, fs: null });
  });

  it('zeigt offene Änderungen und nimmt per Taste A an', async () => {
    useStore.setState({ backend: fakeBackend() });
    await useStore.getState().projektLaden(demoFs());
    render(<RueckimportDialog schliessen={vi.fn()} />);
    const liste = screen.getByRole('listbox', { name: 'Änderungen aus dem Lektorat' });
    const karten = within(liste).getAllByRole('option');
    expect(karten).toHaveLength(2);
    expect(within(karten[0]!).getByText('ein zweites Mal').tagName).toBe('DEL');
    expect(within(karten[0]!).getByText('noch einmal').tagName).toBe('INS');
    await act(async () => {
      fireEvent.keyDown(karten[0]!, { key: 'a' });
    });
    await waitFor(() => expect(useStore.getState().daten!.lektorat!.find((a) => a.id === 'lektorat-1')!.status).toBe('angenommen'));
    expect(useStore.getState().daten!.kapitel.lotte!.text).toContain('noch einmal');
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1));

    // Alle zeigen: auch Abgelehntes und Angenommenes
    fireEvent.click(screen.getByRole('button', { name: /^Alle/ }));
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('Angenommen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wieder öffnen' })).toBeTruthy();
  });

  it('liest eine Datei ein, ordnet zu und übernimmt', async () => {
    const backendTmp = fakeBackend();
    useStore.setState({ backend: backendTmp });
    await useStore.getState().projektLaden(demoFs());
    const d = useStore.getState().daten!;
    const kapitel = d.projekt.kapitel.map((id) => d.kapitel[id]).filter((k): k is Kapitel => !!k && !!k.text.trim());
    const datei = await lektorierterExport(kapitel, d.projekt.titel);
    backendTmp.dateiWaehlen = vi.fn(async () => ({ name: 'lektoriert.docx', daten: datei }));
    useStore.setState({ daten: { ...d, lektorat: [] } });

    render(<RueckimportDialog schliessen={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Word-Datei wählen …' }));
    });
    expect(await screen.findByText('lektoriert.docx')).toBeTruthy();
    expect(screen.getAllByRole('combobox').length).toBe(kapitel.length);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    });
    expect(await screen.findByText(/1 Änderung und 0 Anmerkungen übernommen/)).toBeTruthy();
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });
});
