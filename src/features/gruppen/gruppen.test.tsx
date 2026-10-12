import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useStore } from '../../state/store';
import { GruppenInspektor, GruppenKarte, praesenzProAkt, praesenzProKapitel, spurPruefen } from './index';

beforeEach(async () => {
  await act(async () => {
    await useStore.getState().projektLaden(demoFs());
  });
  useStore.getState().indexNeuBerechnen();
});

const s = () => useStore.getState();

describe('Antagonisten (A-01, A-02)', () => {
  it('Präsenz pro Kapitel und Akt aus Mitglieder-Erwähnungen, Spuren und Plan', () => {
    const d = s().daten!;
    const nordhaven = praesenzProKapitel(d, s().index, d.gruppen.nordhaven!);
    expect(nordhaven.find((k) => k.kapitel === 'fassade')).toMatchObject({ zustand: 'im_text', mitglieder: ['herr-kessler'] });
    expect(nordhaven.find((k) => k.kapitel === 'grundriss')?.zustand).toBe('plan');
    const org = praesenzProKapitel(d, s().index, d.gruppen.konsortium!);
    expect(org.filter((k) => k.zustand === 'spur').map((k) => k.nummer)).toEqual([2, 10]);
    const akte = praesenzProAkt(d, s().index, d.gruppen.nordhaven!);
    expect(akte[0]).toMatchObject({ geplant: 'setzt die Frist' });
    expect(akte[0]!.imText).toContain('im Text: Kap. 2');
  });

  it('Spuren werden im Text gefunden (»Kranich«) und beim Bestätigen verankert', async () => {
    const d = s().daten!;
    const kranich = d.gruppen.konsortium!.spuren.find((x) => x.id === 'kranich')!;
    const p = spurPruefen(d, kranich);
    expect(p.zustand).toBe('gefunden');
    expect(p.ausschnitt).toBe('Vor dem Stand hält ein grauer Lieferwagen mit der Aufschrift Kranich.');
    await s().spurStatusSetzen('konsortium', 'kranich', 'bestaetigt');
    const neu = s().daten!.gruppen.konsortium!.spuren.find((x) => x.id === 'kranich')!;
    expect(neu).toMatchObject({ status: 'bestaetigt', anker: { kapitel: 'funkstille', exakt: 'Kranich' } });
    await s().spurStatusSetzen('konsortium', 'nordkai', 'verworfen');
    expect(praesenzProKapitel(s().daten!, s().index, s().daten!.gruppen.konsortium!).find((k) => k.kapitel === 'fassade')?.zustand).not.toBe(
      'spur',
    );
    await s().alleSpeichernAbwarten();
    expect(await s().fs!.lesen('gruppen/konsortium.md')).toContain('    anker:\n      kapitel: funkstille\n      exakt: Kranich');
  });

  it('nicht auffindbare Spur ist kenntlich; neue Spur wird verankert', async () => {
    const d = s().daten!;
    expect(spurPruefen(d, { id: 'x', text: 'gibt es nicht', kapitel: 'funkstille', status: 'vorschlag' }).zustand).toBe('nicht_gefunden');
    expect(
      spurPruefen(d, { id: 'y', text: 'Kranich', kapitel: 'funkstille', status: 'bestaetigt', anker: { kapitel: 'funkstille', exakt: 'Kranich', davor: 'völlig anders ', danach: '' } })
        .zustand,
    ).toBe('gefunden');
    const spur = await s().spurHinzufuegen('konsortium', { text: 'Nummer unterdrückt', kapitel: 'funkstille' });
    expect(spur).toMatchObject({ id: 'nummer-unterdrueckt', status: 'bestaetigt', anker: { exakt: 'Nummer unterdrückt' } });
  });

  it('Mitglieder: Hinzufügen setzt figur.gruppe und entfernt aus der alten Gruppe', async () => {
    await s().mitgliedHinzufuegen('konsortium', 'herr-kessler');
    expect(s().daten!.gruppen.konsortium!.mitglieder).toEqual(['herr-kessler']);
    expect(s().daten!.gruppen.nordhaven!.mitglieder).toEqual([]);
    expect(s().daten!.figuren['herr-kessler']!.gruppe).toBe('konsortium');
    await s().mitgliedEntfernen('konsortium', 'herr-kessler');
    expect(s().daten!.figuren['herr-kessler']!.gruppe).toBeNull();
  });

  it('Inspektor: Vorschlag verwerfen, Karte zeigt Mitglieder', async () => {
    render(
      <>
        <GruppenKarte gruppe="nordhaven" />
        <GruppenInspektor gruppe="konsortium" />
      </>,
    );
    expect(screen.getByText('Herr Kessler')).toBeInTheDocument();
    expect(screen.getByText(/3 Vorschläge/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Verwerfen' })[0]!);
    });
    expect(s().daten!.gruppen.konsortium!.spuren[0]!.status).toBe('verworfen');
    expect(screen.getByText(/2 Vorschläge/)).toBeInTheDocument();
  });
});
