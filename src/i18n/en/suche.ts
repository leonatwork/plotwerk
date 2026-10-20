import type { Form } from '@core/i18n';
import type { suche as de } from '../de/suche';
export const suche: Form<typeof de> = {
  kapitel: 'Find and replace', projekt: 'Find and replace in project',
  suchen: 'Find', ersatz: 'Replace with', ersetzen: 'Replace', alle: 'Replace all',
  wort: 'Whole word', case: 'Match case',
  leer: 'Enter a search term.', keine: 'No matches.', treffer: '{n} matches',
  weiter: 'Next match', zurueck: 'Previous match', schliessen: 'Close search',
  bereiche: { manuskript: 'Manuscript', plan: 'Plan', notizen: 'Notes (including private)' },
  kapitelTreffer: 'Chapter {nr} · {titel}',
  rueckfrage: 'Replace {n} matches in {kapitel} chapters, plan and notes? Chapters will be backed up first. Plan and notes can be undone as one action.',
  bestaetigen: 'Confirm replacement', undo: 'Undo replacement in plan and notes',
  undoKonflikt: 'Plan or notes have been edited since replacement. Undo would overwrite those changes.',
  fehler: '{titel}: {grund}', sicherungFehlt: 'No snapshot created; chapter remains unchanged.',
  feldGeaendert: 'Text changed during the action; this match was skipped.',
};
