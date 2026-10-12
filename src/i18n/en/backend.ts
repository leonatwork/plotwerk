import type { Form } from '@core/i18n';
import type { backend as de } from '../de/backend';

export const backend: Form<typeof de> = {
  aufrufFehlgeschlagen: '{kommando} failed: {fehler}',
  leererPfad: 'Empty path.',
  binaerNurRecherche: 'Binary files only under recherche/: {pfad}',
  keinEndpoint: {
    foundry: 'No AI endpoint set. Enter the Foundry URL in the AI settings (https://<resource>.services.ai.azure.com/anthropic).',
    claude: 'No base URL set for the Claude API. Check the AI settings (default: https://api.anthropic.com).',
    openai: 'No base URL set. Enter the address of the service in the AI settings (e.g. http://localhost:11434/v1).',
  },
  keinModell: 'No model set. Enter the model name of the service in the AI settings (e.g. qwen3:32b).',
  kontextZuGross:
    'At an estimated {tokens} tokens, the request is too large for the configured context length of {grenze} tokens. Increase the context length in the server and enter it in the AI settings, choose a model with a larger context or check a smaller scope.',
  keinZaehlen: 'This service cannot count tokens.',
  anfrageAbgebrochen: 'The request was cancelled.',
};
