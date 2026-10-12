/**
 * Gemeinsame Bausteine für G6 KI-Leser (Fragen an das Buch, Leser-Simulation, Karte im Kapitel-Überblick).
 * Besitzer: G6. Belege sind wörtliche Zitate (E6); ein Klick öffnet die Stelle im Editor.
 */
import type { ReactNode } from 'react';
import type { PlanBelegStatus } from '@core/ki/index';
import type { Id, ProjektDaten, TextAnker, Zitat } from '@core/model/types';
import { ankerErzeugen, findeZitat, klartext } from '@core/text/index';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import type { KiFehlerAnzeige } from '../../state/slices/ki';
import './fragen.css';

/** „Kap. 3“ bzw. „Kap. ?“ */
export function kapNr(daten: ProjektDaten, id: Id): string {
  const i = daten.projekt.kapitel.indexOf(id);
  return i >= 0 ? `Kap. ${i + 1}` : 'Kap. ?';
}

export function kapitelName(daten: ProjektDaten, id: Id): string {
  return daten.plaene[id]?.titel || daten.kapitel[id]?.titel || id;
}

/** „Kap. 3 · Lotte“ */
export function kapitelTitel(daten: ProjektDaten, id: Id): string {
  return `${kapNr(daten, id)} · ${kapitelName(daten, id)}`;
}

/** Anker für „Stelle öffnen“: gefundene Stelle, sonst das Zitat ohne Kontext (der Editor sucht selbst). */
export function ankerFuerZitat(daten: ProjektDaten, kapitel: Id, zitat: string): TextAnker {
  const md = daten.kapitel[kapitel]?.text;
  if (md && zitat.trim()) {
    const kt = klartext(md);
    const treffer = findeZitat(kt, zitat)[0];
    if (treffer) return ankerErzeugen(kapitel, kt, treffer.start, treffer.ende);
  }
  return { kapitel, exakt: zitat, davor: '', danach: '' };
}

/** Steht das Zitat (noch) wörtlich im Kapitel? (Text kann sich seit der Antwort geändert haben.) */
export function zitatGefunden(daten: ProjektDaten, z: Zitat): boolean {
  const md = daten.kapitel[z.kapitel]?.text;
  return !!md && findeZitat(klartext(md), z.text).length > 0;
}

export function formatiereDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return gleicherTag ? `heute, ${uhr}` : `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}, ${uhr}`;
}

export function formatiereKosten(usd: number | undefined): string {
  if (usd === undefined) return '';
  if (usd === 0) return '0 $';
  if (usd < 0.01) return '< 0,01 $';
  return `${usd.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** Klickbare Belegliste (Kapitel + Zitat). `nachOeffnen` z. B. Dialog schließen. */
export function Belege({ daten, belege, nachOeffnen, kompakt }: { daten: ProjektDaten; belege: Zitat[]; nachOeffnen?(): void; kompakt?: boolean }) {
  const markiere = useStore((s) => s.markiere);
  if (belege.length === 0) return null;
  return (
    <ul className={`pw-kl-belege${kompakt ? ' pw-kl-belege--kompakt' : ''}`} aria-label="Belege">
      {belege.map((b) => {
        const da = zitatGefunden(daten, b);
        return (
          <li key={`${b.kapitel}|${b.text}`}>
            <button
              type="button"
              className="pw-kl-beleg"
              title={da ? 'Stelle im Text öffnen' : 'Das Zitat steht so nicht mehr im Text – der Editor sucht die Stelle'}
              onClick={() => {
                markiere({ kapitel: b.kapitel, anker: ankerFuerZitat(daten, b.kapitel, b.text) });
                nachOeffnen?.();
              }}
            >
              <span className="pw-kl-beleg__kap">
                {kapitelTitel(daten, b.kapitel)}
                {!da && <span className="pw-kl-beleg__alt"> · geändert</span>}
              </span>
              <span className="pw-kl-beleg__text">„{b.text}“</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export const PLAN_STATUS_LABEL: Record<PlanBelegStatus, string> = {
  belegt: 'im Text belegt',
  teilweise: 'nur angedeutet',
  nicht_belegt: 'nicht belegt',
};

export function PlanStatus({ status }: { status: PlanBelegStatus }) {
  return <span className={`pw-kl-status pw-kl-status--${status}`}>{PLAN_STATUS_LABEL[status]}</span>;
}

export function Etikett({ children, art = 'neutral', title }: { children: ReactNode; art?: 'neutral' | 'warn' | 'accent'; title?: string }) {
  return (
    <span className={`pw-kl-etikett pw-kl-etikett--${art}`} title={title}>
      {children}
    </span>
  );
}

export function KiFehlerKasten({ fehler, onSchliessen }: { fehler: KiFehlerAnzeige; onSchliessen?(): void }) {
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  return (
    <div className="pw-kl-fehler" role="alert">
      <span>{fehler.text}</span>
      <span className="pw-kl-fehler__knoepfe">
        {fehler.art === 'nicht_bereit' && (
          <Button klein onClick={() => oeffneDialog('ki-einstellungen')}>
            Einstellungen öffnen
          </Button>
        )}
        {onSchliessen && (
          <Button klein variante="leise" onClick={onSchliessen} aria-label="Meldung schließen">
            OK
          </Button>
        )}
      </span>
    </div>
  );
}
