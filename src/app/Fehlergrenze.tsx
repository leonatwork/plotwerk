import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui';

interface Props {
  /** Wechselt der Schlüssel (z. B. Bereich), wird der Fehler zurückgesetzt. */
  schluessel?: string;
  bereich: string;
  children: ReactNode;
  /** eigene Darstellung des Fehlers (z. B. als Dialog) */
  ersatz?(fehler: Error, erneut: () => void): ReactNode;
}

interface State {
  fehler: Error | null;
  schluessel?: string;
}

/** Fängt Fehler eines Bereichs ab, damit Rahmen und Navigation benutzbar bleiben. */
export class Fehlergrenze extends Component<Props, State> {
  state: State = { fehler: null, schluessel: this.props.schluessel };

  static getDerivedStateFromError(fehler: Error): Partial<State> {
    return { fehler };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.schluessel !== state.schluessel ? { fehler: null, schluessel: props.schluessel } : null;
  }

  componentDidCatch(fehler: Error, info: ErrorInfo): void {
    console.error(`Fehler im Bereich ${this.props.bereich}:`, fehler, info.componentStack);
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    if (this.props.ersatz) return this.props.ersatz(this.state.fehler, () => this.setState({ fehler: null }));
    return (
      <div role="alert" className="pw-fehler">
        <strong>„{this.props.bereich}“ konnte nicht angezeigt werden.</strong>
        <code>{this.state.fehler.message}</code>
        <Button onClick={() => this.setState({ fehler: null })}>Erneut versuchen</Button>
      </div>
    );
  }
}
