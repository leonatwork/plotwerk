import type { Form } from '@core/i18n';
import type { sicherungen as de } from '../de/sicherungen';
export const sicherungen: Form<typeof de> = {
  titel: 'External backups',
  aktiv: 'Back up automatically every day',
  versionen: 'Include snapshots (.versionen/)',
  standard: 'Default: app folder / Sicherungen / project',
  ordner: 'Choose Folder…',
  zuruecksetzen: 'Use Default Location',
  erklaerung: 'On the first opening each day. Retention: 7 daily and 4 older weekly copies. Research images and .plotwerk/ are included.',
  fehler: 'Backup failed: {grund}. Writing and autosave continue.',
  wiederherstellen: 'Restore Backup…',
  leer: 'No backups yet.',
  zipWaehlen: 'Choose ZIP File…',
  ziel: 'The backup will be extracted into a new, empty folder and opened.',
  laden: 'Loading backups…',
};
