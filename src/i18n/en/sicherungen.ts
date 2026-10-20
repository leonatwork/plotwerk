import type { Form } from '@core/i18n';
import type { sicherungen as de } from '../de/sicherungen';
export const sicherungen: Form<typeof de> = {
  titel: 'Backups', aktiv: 'Back up automatically each day', versionen: 'Include snapshots (.versionen)',
  standard: 'Default: app folder / Sicherungen / project', ort: 'Choose Folder…', zurueck: 'Use default location',
  erklaerung: 'ZIP outside the project folder. Retention: 7 daily and 4 older weekly backups. Research images and .plotwerk are included.',
  fehler: 'Backup failed: {grund}. Writing and autosave continue.',
  wiederherstellen: 'Restore Backup…', leer: 'No backups yet.', zip: 'Choose ZIP File…',
  ziel: 'The backup will be extracted into a new, empty folder and opened. Choose the destination in the next dialog.',
  restoreFehler: 'Restore failed: {grund}',
};
