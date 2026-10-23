import type { Form } from '@core/i18n';
import type { sicherungen as de } from '../de/sicherungen';
export const sicherungen: Form<typeof de> = {
  titel: 'Automatic backup', automatisch: 'Back up on the first opening each day', versionen: 'Include snapshots (.versionen/)',
  standard: 'Default: ~/Library/Application Support/app.plotwerk.mac/Sicherungen/<Projekt>/', ordner: 'Choose Folder…', zurueck: 'Use Default Location',
  erklaerung: 'ZIP outside the project folder, including research images and AI results. Retention: 7 daily versions and 4 older weekly versions.',
  fehler: 'Backup failed: {grund}. Writing and autosave continue.', fertig: 'Project backed up as an archive.',
  wiederherstellen: 'Restore Backup…', leer: 'No backups yet.',
  ziel: 'The backup will be extracted into a new, empty folder. The project will then open.',
  laedt: 'Loading backups…', entpackt: 'Restoring backup…',
};
