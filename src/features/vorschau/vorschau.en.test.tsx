import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { festeSprache } from '../../i18n';
import { useStore } from '../../state/store';
import { buchAusProjekt, kapitelHtml } from './buch';
import { VorschauEbene } from './index';
import { oeffneVorschau, schliesseVorschau, STANDARD_EINSTELLUNGEN, useVorschau } from './zustand';

/** Demo-Projekt, wahlweise mit anderer Buchsprache */
async function demo(sprache?: string) {
  const daten = await ladeDemoProjekt();
  return sprache ? { ...daten, projekt: { ...daten.projekt, angaben: { ...daten.projekt.angaben, sprache } } } : daten;
}

describe('Buch-Vorschau: Oberflächensprache und Buchsprache', () => {
  beforeEach(() => {
    localStorage.clear();
    useVorschau.setState({ offen: false, letzteStelle: null, einstellungen: { ...STANDARD_EINSTELLUNGEN } });
  });
  afterEach(() => act(() => schliesseVorschau()));

  it('englische Oberfläche, deutsches Buch: Leisten englisch, Satz mit lang="de"', async () => {
    festeSprache('en');
    useStore.setState({ daten: await demo() });
    render(<VorschauEbene />);
    act(() => oeffneVorschau('lotte'));
    const dialog = await screen.findByRole('dialog', { name: 'Book preview' });
    expect(within(dialog).getByText('Ch. 3 · Lotte')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Contents/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(await within(dialog).findByLabelText(/^Page \d+$/)).toBeInTheDocument();
    expect(dialog.querySelector('.pw-v-fuss__text')?.textContent).toMatch(/^Pages \d+–\d+ of (about )?\d+$/);
    expect(dialog.querySelector('.pw-v-fluss')?.getAttribute('lang')).toBe('de');
    const leisten = [...dialog.querySelectorAll('.pw-v-leiste, .pw-v-fuss')].map((el) => el.textContent).join(' ');
    for (const wort of ['Inhalt', 'Schließen', 'Seite', 'Kap.', 'Buch']) expect(leisten).not.toContain(wort);
  });

  it('deutsche Oberfläche, englisches Buch: Kapitelkopf und lang folgen der Buchsprache', async () => {
    useStore.setState({ daten: await demo('en-GB') });
    useVorschau.setState({ einstellungen: { ...STANDARD_EINSTELLUNGEN, modus: 'ebook' } });
    render(<VorschauEbene />);
    act(() => oeffneVorschau('lotte'));
    const dialog = await screen.findByRole('dialog', { name: 'Buch-Vorschau' });
    await within(dialog).findByText(/im Kapitel/);
    const fluss = dialog.querySelector('.pw-v-fluss')!;
    expect(fluss.getAttribute('lang')).toBe('en');
    expect(fluss.querySelector('.pw-v-kopf__nummer')?.textContent).toBe('Chapter 3');
  });

  it('Kapitelkopf und Szenentrenner in der Buchsprache', async () => {
    festeSprache('en');
    const deBuch = buchAusProjekt(await demo());
    const enBuch = buchAusProjekt(await demo('en'));
    expect(kapitelHtml(deBuch.kapitel[0]!, 'ebook', 'de')).toContain('Kapitel 1');
    expect(kapitelHtml(enBuch.kapitel[0]!, 'ebook', 'en')).toContain('Chapter 1');
    const mitTrenner = (b: typeof deBuch) => b.kapitel.find((k) => k.html.includes('pw-v-trenner'));
    if (mitTrenner(deBuch)) {
      expect(mitTrenner(deBuch)!.html).toContain('aria-label="Szenenwechsel"');
      expect(mitTrenner(enBuch)!.html).toContain('aria-label="Scene break"');
    }
  });
});
