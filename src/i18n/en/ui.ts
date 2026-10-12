import type { Form } from '@core/i18n';
import type { ui as de } from '../de/ui';

export const ui: Form<typeof de> = {
  bestaetigung: { titel: 'Are you sure?' },
  inspektor: { label: 'Inspector' },
  realitaet: { label: 'Reality level' },
};
