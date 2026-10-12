import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave } from './autosave';

describe('Autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('speichert 1,5 s nach einer einzelnen Eingabe', () => {
    const speichern = vi.fn();
    const a = new Autosave(speichern);
    a.aenderung();
    vi.advanceTimersByTime(1499);
    expect(speichern).not.toHaveBeenCalled();
    expect(a.ausstehend).toBe(true);
    vi.advanceTimersByTime(1);
    expect(speichern).toHaveBeenCalledTimes(1);
    expect(a.ausstehend).toBe(false);
  });

  it('speichert bei Dauertippen spätestens 2 s nach der ersten Änderung', () => {
    const zeiten: number[] = [];
    const start = Date.now();
    const a = new Autosave(() => {
      zeiten.push(Date.now() - start);
    });
    for (let t = 0; t < 6000; t += 100) {
      a.aenderung();
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(2000);
    expect(zeiten[0]).toBeLessThanOrEqual(2000);
    for (let i = 1; i < zeiten.length; i++) expect(zeiten[i]! - zeiten[i - 1]!).toBeLessThanOrEqual(2100);
    expect(a.ausstehend).toBe(false);
  });

  it('liegt jede Eingabe nach höchstens 2 s im Speichern', () => {
    const gespeichert: number[] = [];
    let stand = 0;
    const a = new Autosave(() => {
      gespeichert.push(stand);
    });
    const eingaben = [0, 300, 900, 1400, 2600, 2700, 5200];
    let jetzt = 0;
    for (const t of eingaben) {
      vi.advanceTimersByTime(t - jetzt);
      jetzt = t;
      stand = t;
      a.aenderung();
    }
    // nach jeder Eingabe t muss innerhalb von 2 s ein Speichern mit Stand ≥ t erfolgen
    vi.advanceTimersByTime(2000);
    for (const t of eingaben) expect(gespeichert.some((s) => s >= t)).toBe(true);
    expect(gespeichert.at(-1)).toBe(5200);
  });

  it('jetzt() speichert sofort und synchron, verwerfen() hebt auf', () => {
    const speichern = vi.fn();
    const a = new Autosave(speichern);
    a.aenderung();
    void a.jetzt();
    expect(speichern).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(speichern).toHaveBeenCalledTimes(1);

    a.aenderung();
    a.verwerfen();
    vi.advanceTimersByTime(5000);
    expect(speichern).toHaveBeenCalledTimes(1);
    void a.jetzt();
    expect(speichern).toHaveBeenCalledTimes(1);
  });

  it('versucht es nach einem Fehler erneut', async () => {
    let versuche = 0;
    const fehler = vi.fn();
    const a = new Autosave(
      () => {
        versuche++;
        if (versuche === 1) throw new Error('Platte voll');
      },
      undefined,
      fehler,
    );
    a.aenderung();
    vi.advanceTimersByTime(1500);
    await vi.runAllTicks();
    await Promise.resolve();
    expect(fehler).toHaveBeenCalledTimes(1);
    expect(a.ausstehend).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(versuche).toBe(2);
    expect(a.ausstehend).toBe(false);
  });
});
