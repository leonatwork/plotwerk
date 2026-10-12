/**
 * Kostenanzeige für KI-Läufe. Bei OpenAI-kompatiblen Diensten kennt Plotwerk keinen Listenpreis
 * (`kostenBekannt: false`, lokal kostet es nichts); dann steht statt eines Betrags ein Hinweis.
 */
import { formatiereUsd } from '@core/ki/index';
import { f, sprache, texte } from '../../i18n';

export interface MitKosten {
  kostenUsd?: number;
  kostenBekannt?: false;
}

export function kostenUnbekannt(w: MitKosten): boolean {
  return w.kostenBekannt === false || w.kostenUsd === undefined;
}

/** „≈ 0,12 $“ bzw. der Hinweis für unbekannte Kosten. */
export function kostenBetrag(w: MitKosten): string {
  return kostenUnbekannt(w) ? texte().ki.kostenUnbekannt : formatiereUsd(w.kostenUsd!, sprache());
}

/** Betrag in der Vorlage des Dialogs (z. B. „{betrag} (grob, Listenpreis)“); unbekannte Kosten ohne Vorlage. */
export function kostenWert(w: MitKosten, vorlage: string, platzhalter: string): string {
  return kostenUnbekannt(w) ? texte().ki.kostenUnbekannt : f(vorlage, { [platzhalter]: formatiereUsd(w.kostenUsd!, sprache()) });
}
