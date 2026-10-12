/**
 * Karte „Leserin nach Kap. n“ im Kapitel-Überblick (G6 Leser-Simulation). Besitzer: G6.
 * Zeigt den gespeicherten Stand aus .plotwerk/leser.json kompakt; Details, Kostenschätzung und Start im Dialog
 * „leser-simulation“.
 */
import { useMemo } from 'react';
import { ausLeserStand, leserStandVeraltet, offeneFragen } from '@core/ki/index';
import type { Id } from '@core/model/types';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import { Etikett, formatiereDatum } from '../fragen/gemeinsam';

export function LeserSimulationKarte({ kapitelId }: { kapitelId: Id }) {
  const daten = useStore((s) => s.daten);
  const lauf = useStore((s) => s.kileser.simLauf);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const stand = daten?.kiLeser?.eintraege.find((e) => e.kapitel === kapitelId);
  const sim = useMemo(() => (stand ? ausLeserStand(stand) : null), [stand]);
  if (!daten) return null;
  const nr = daten.projekt.kapitel.indexOf(kapitelId) + 1;
  const oeffnen = () => oeffneDialog('leser-simulation', { kapitel: kapitelId });
  const laeuft = lauf?.kapitel === kapitelId;
  const veraltet = stand ? leserStandVeraltet(daten, stand) : false;
  const textBisN = daten.projekt.kapitel.slice(0, nr).some((id) => daten.kapitel[id]?.text.trim());

  const offen = sim ? offeneFragen(sim) : [];
  const planBelegt = sim?.plan.filter((p) => p.status === 'belegt').length ?? 0;
  const planNicht = sim?.plan.filter((p) => p.status !== 'belegt').length ?? 0;

  return (
    <section className="pw-kl-karte" aria-label={`Leserin nach Kapitel ${nr}`}>
      <div className="pw-kl-karte__kopf">
        <span className="pw-kl-karte__titel">LESERIN NACH KAP. {nr}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {laeuft ? (
            <span className="pw-kl-klein">liest Kap. 1–{nr} …</span>
          ) : (
            stand && <span className="pw-kl-klein">{formatiereDatum(stand.datum)}</span>
          )}
          {veraltet && !laeuft && (
            <Etikett art="warn" title="Text oder Plan bis hier hat sich seit der Simulation geändert">
              veraltet
            </Etikett>
          )}
        </span>
      </div>

      {!sim ? (
        <>
          <p className="pw-kl-klein">
            {textBisN
              ? `Was weiß eine Erstleserin hier, welche Fragen hat sie offen – und passt das zu deinem Plan? Die KI liest dafür nur Kapitel 1 bis ${nr}.`
              : 'Bis hier gibt es noch keinen Text.'}
          </p>
          {textBisN && (
            <div className="pw-kl-karte__knoepfe">
              <Button klein onClick={oeffnen} disabled={laeuft}>
                Leserin simulieren …
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="pw-kl-karte__zahlen">
            <span>
              <b>{offen.length}</b> {offen.length === 1 ? 'offene Frage' : 'offene Fragen'}
            </span>
            <span>
              <b>{sim.weiss.length}</b> weiß
            </span>
            <span>
              <b>{sim.vermutungen.length}</b> ahnt
            </span>
            {sim.plan.length > 0 && (
              <span title="Kapitelpläne bis hier, im Text belegt / nur angedeutet oder nicht belegt">
                Plan <b>{planBelegt}</b> belegt
                {planNicht > 0 && (
                  <>
                    , <b style={{ color: 'var(--accent-dark)' }}>{planNicht}</b> offen
                  </>
                )}
              </span>
            )}
          </div>
          {offen.length > 0 && (
            <ul className="pw-kl-karte__fragen" aria-label="Offene Fragen der Leserin">
              {offen.slice(0, 3).map((f) => (
                <li key={f.id}>
                  <button type="button" className="pw-kl-karte__frage" onClick={oeffnen} title="Leser-Simulation mit Belegen öffnen">
                    {f.frage}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pw-kl-karte__knoepfe">
            <Button klein onClick={oeffnen}>
              {offen.length > 3 ? `Alle ${offen.length} ansehen` : 'Ansehen'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
