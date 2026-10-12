import type { Form } from '@core/i18n';
import type { sprache as de } from '../de/sprache';

export const sprache: Form<typeof de> = {
  abschnitt: 'Interface language',
  label: 'Interface language',
  system: 'System',
  systemMit: 'System ({sprache})',
  de: 'Deutsch',
  en: 'English',
  erklaerung:
    'Applies immediately to all projects. Typography, hyphenation, style tools and the language of the AI follow the language of the book (Book details).',
  buchsprache: 'Book language: {sprache}',
};
