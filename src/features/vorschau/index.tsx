/**
 * Lesevorschau (Buch / E-Book) – öffentliche API.
 *
 *   oeffneVorschau(kapitelId?)  öffnet die Vorschau (am Anfang des Kapitels; ohne ID an der zuletzt
 *                               gelesenen Stelle bzw. am Buchanfang)
 *   schliesseVorschau()         schließt sie
 *   <VorschauEbene />           einmal im App-Rahmen einhängen (lädt die Ansicht erst beim Öffnen)
 */
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from '../../state/store';
import { Button } from '../../ui';
import { schliesseVorschau, useVorschau } from './zustand';

export { oeffneVorschau, schliesseVorschau, useVorschau, vorschauOffen } from './zustand';
export type { Hintergrund, VorschauEinstellungen, VorschauModus } from './zustand';

const Vorschau = lazy(() => import('./Vorschau'));

class VorschauFehlergrenze extends Component<{ children: ReactNode }, { fehler: Error | null }> {
  state = { fehler: null as Error | null };
  static getDerivedStateFromError(fehler: Error) {
    return { fehler };
  }
  componentDidCatch(fehler: Error, info: ErrorInfo) {
    console.error('Buch-Vorschau:', fehler, info.componentStack);
  }
  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div role="alertdialog" aria-label="Buch-Vorschau" className="pw-fehler pw-fehler--voll" style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--surface)' }}>
        <strong>Die Vorschau konnte nicht angezeigt werden.</strong>
        <code>{this.state.fehler.message}</code>
        <Button
          variante="primaer"
          onClick={() => {
            this.setState({ fehler: null });
            schliesseVorschau();
          }}
        >
          Schließen
        </Button>
      </div>
    );
  }
}

/** Vollfenster-Ebene der Vorschau (nur bei geöffnetem Projekt). */
export function VorschauEbene() {
  const offen = useVorschau((s) => s.offen);
  const hatDaten = useStore((s) => !!s.daten);
  if (!offen || !hatDaten) return null;
  return (
    <VorschauFehlergrenze>
      <Suspense fallback={null}>
        <Vorschau />
      </Suspense>
    </VorschauFehlergrenze>
  );
}
