import type { Form } from '@core/i18n';
import type { de } from './de';

/** Form des Wörterbuchs (aus dem deutschen abgeleitet); jede Sprache muss sie erfüllen. */
export type Woerterbuch = Form<typeof de>;

/** „system“ folgt der macOS-Sprache (Deutsch → de, sonst en). */
export type SprachWahl = 'system' | 'de' | 'en';
