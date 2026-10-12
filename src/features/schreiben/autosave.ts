/**
 * Automatisches Speichern (E9, S-04): 1,5 s nach der letzten Eingabe, bei Dauertippen spätestens
 * 1,8 s nach der ersten ungespeicherten Änderung. Die restlichen 0,2 s sind für das atomare Schreiben
 * (temp + fsync + rename) reserviert: Jede Eingabe liegt nach höchstens 2 s auf der Platte.
 */
export interface AutosaveOptionen {
  /** Ruhezeit nach der letzten Änderung (ms) */
  warten: number;
  /** Höchstens so lange nach der ersten ungespeicherten Änderung (ms) */
  maxWarten: number;
  /** Erneuter Versuch nach einem Fehler (ms) */
  wiederholen: number;
}

export const AUTOSAVE_STANDARD: AutosaveOptionen = { warten: 1500, maxWarten: 1800, wiederholen: 5000 };

export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private erste: number | null = null;
  private laufend: Promise<void> | null = null;

  constructor(
    private readonly speichern: () => Promise<void> | void,
    private readonly optionen: AutosaveOptionen = AUTOSAVE_STANDARD,
    private readonly beiFehler?: (e: unknown) => void,
  ) {}

  /** Gibt es Änderungen, die noch nicht an das Speichern übergeben wurden? */
  get ausstehend(): boolean {
    return this.erste !== null;
  }

  /** Nach jeder Änderung aufrufen. */
  aenderung(): void {
    const jetzt = Date.now();
    if (this.erste === null) this.erste = jetzt;
    const rest = this.erste + this.optionen.maxWarten - jetzt;
    this.planen(Math.max(0, Math.min(this.optionen.warten, rest)));
  }

  /** Sofort speichern (z. B. beim Kapitelwechsel). Der Speicheraufruf startet synchron. */
  jetzt(): Promise<void> {
    this.abbrechen();
    if (this.erste === null) return this.laufend ?? Promise.resolve();
    this.erste = null;
    let ergebnis: Promise<void>;
    try {
      ergebnis = Promise.resolve(this.speichern());
    } catch (e) {
      ergebnis = Promise.reject(e);
    }
    const lauf = ergebnis.catch((e: unknown) => {
      this.beiFehler?.(e);
      if (this.erste === null) {
        this.erste = Date.now();
        this.planen(this.optionen.wiederholen);
      }
    });
    this.laufend = lauf.finally(() => {
      if (this.laufend === lauf) this.laufend = null;
    });
    return lauf;
  }

  /** Ausstehende Änderungen verwerfen (z. B. wenn der Inhalt von außen neu geladen wurde). */
  verwerfen(): void {
    this.abbrechen();
    this.erste = null;
  }

  private planen(ms: number): void {
    this.abbrechen();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.jetzt();
    }, ms);
  }

  private abbrechen(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
