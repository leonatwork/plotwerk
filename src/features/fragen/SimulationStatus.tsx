/**
 * Leser-Simulation im Hintergrund (G6): Laufanzeige unten rechts, solange der Dialog geschlossen ist, und eine
 * Meldung, wenn der Lauf fertig ist oder fehlschlägt – ein Fehler darf nicht unbemerkt verschwinden. Besitzer: G6.
 */
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import './simulationStatus.css';

export function SimulationStatus() {
  const lauf = useStore((s) => s.kileser.simLauf);
  const meldung = useStore((s) => s.kileser.simMeldung);
  const dialogOffen = useStore((s) => s.dialog?.id === 'leser-simulation');
  const nrLauf = useStore((s) => (s.kileser.simLauf ? (s.daten?.projekt.kapitel.indexOf(s.kileser.simLauf.kapitel) ?? -1) + 1 : 0));
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const schliessen = useStore((s) => s.kileser.meldungSchliessen);
  const t = useTexte().fragen.status;
  if (dialogOffen || (!lauf && !meldung)) return null;

  if (lauf) {
    return (
      <div className="pw-sim-status" role="status" aria-label={t.label}>
        <span className="pw-sim-status__punkt pw-sim-status__punkt--laeuft" aria-hidden="true" />
        <span className="pw-sim-status__text">{f(t.laeuft, { nr: nrLauf })}</span>
        <Button klein onClick={() => oeffneDialog('leser-simulation', { kapitel: lauf.kapitel })}>
          {t.ansehen}
        </Button>
      </div>
    );
  }

  const m = meldung!;
  const fehler = m.art === 'fehler';
  return (
    <div className={`pw-sim-status${fehler ? ' pw-sim-status--fehler' : ''}`} role={fehler ? 'alert' : 'status'} aria-label={t.label}>
      <span className={`pw-sim-status__punkt pw-sim-status__punkt--${m.art}`} aria-hidden="true" />
      <span className="pw-sim-status__text">{fehler ? f(t.fehler, { nr: m.nr, text: m.text ?? '' }) : f(t.fertig, { nr: m.nr })}</span>
      <Button
        klein
        variante={fehler ? 'sekundaer' : 'primaer'}
        onClick={() => {
          // Ein Fehler steht danach im Dialog (simFehler), die Meldung ist erledigt
          schliessen();
          oeffneDialog('leser-simulation', { kapitel: m.kapitel, ...(m.stand ? { stand: m.stand } : {}) });
        }}
      >
        {fehler ? t.details : t.ansehen}
      </Button>
      <button type="button" className="pw-sim-status__zu" aria-label={t.schliessen} title={t.schliessen} onClick={schliessen}>
        ×
      </button>
    </div>
  );
}
