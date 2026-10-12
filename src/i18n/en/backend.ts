import type { Form } from '@core/i18n';
import type { backend as de } from '../de/backend';

export const backend: Form<typeof de> = {
  aufrufFehlgeschlagen: '{kommando} failed: {fehler}',
  leererPfad: 'Empty path.',
  binaerNurRecherche: 'Binary files only under recherche/: {pfad}',
  keinEndpoint: {
    foundry: 'No AI endpoint set. Enter the Foundry URL in the AI settings (https://<resource>.services.ai.azure.com/anthropic).',
    claude: 'No base URL set for the Claude API. Check the AI settings (default: https://api.anthropic.com).',
  },
  anfrageAbgebrochen: 'The request was cancelled.',
};
