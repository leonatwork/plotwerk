/**
 * Rückfrage vor Löschen/Verwerfen. Ersetzt window.confirm: WKWebView (Tauri) zeigt confirm()
 * nicht an und liefert immer false.
 */
import { useSyncExternalStore } from 'react';
import { texte, useTexte } from '../i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface BestaetigungOptionen {
  titel?: string;
  /** Beschriftung des Bestätigen-Knopfs, Standard „OK“ */
  knopf?: string;
  /** nur ein Knopf (Mitteilung statt Frage) */
  nurOk?: boolean;
}

interface Anfrage extends BestaetigungOptionen {
  text: string;
  antwort(ok: boolean): void;
}

let offen: Anfrage | null = null;
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((h) => h());

/** Fragt nach; true = bestätigt. Eine neue Frage beantwortet eine noch offene mit false. */
export function bestaetigen(text: string, optionen: BestaetigungOptionen = {}): Promise<boolean> {
  return new Promise((resolve) => {
    offen?.antwort(false);
    const anfrage: Anfrage = {
      ...optionen,
      text,
      antwort(ok) {
        if (offen === anfrage) {
          offen = null;
          melden();
        }
        resolve(ok);
      },
    };
    offen = anfrage;
    melden();
  });
}

/** Mitteilung mit einem OK-Knopf (Ersatz für window.alert). */
export function mitteilen(text: string, titel = texte().gemeinsam.hinweis): Promise<void> {
  return bestaetigen(text, { titel, nurOk: true }).then(() => undefined);
}

/** Einmal im Fenster einbinden (App). */
export function BestaetigungHost() {
  const anfrage = useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => hoerer.delete(h);
    },
    () => offen,
  );
  const t = useTexte();
  if (!anfrage) return null;
  return (
    <Dialog
      titel={anfrage.titel ?? t.ui.bestaetigung.titel}
      breite={420}
      onSchliessen={() => anfrage.antwort(false)}
      aktionen={
        <>
          {!anfrage.nurOk && <Button onClick={() => anfrage.antwort(false)}>{t.gemeinsam.abbrechen}</Button>}
          <Button variante="primaer" data-autofocus onClick={() => anfrage.antwort(true)}>
            {anfrage.knopf ?? t.gemeinsam.ok}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{anfrage.text}</p>
    </Dialog>
  );
}
