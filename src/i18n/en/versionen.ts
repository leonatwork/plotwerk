import type { Form } from '@core/i18n';
import type { versionen as de } from '../de/versionen';

export const versionen: Form<typeof de> = {
  spalten: {
    leer: '(empty)',
    neu: '[added:] ',
    entfernt: '[removed:] ',
    links: 'Left version',
    linksText: 'Text of the left version',
    rechts: 'Right version',
    rechtsText: 'Text of the right version',
  },
};
