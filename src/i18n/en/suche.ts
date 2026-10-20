import type { Form } from '@core/i18n';
import type { suche as de } from '../de/suche';
export const suche: Form<typeof de> = {
  titel: 'Find and Replace in Project', kapitel: 'Find and Replace in Chapter',
  suchen: 'Find text', ersatz: 'Replace with', wort: 'Whole word', case: 'Match case',
  vorher: 'Previous match', weiter: 'Next match', ersetzen: 'Replace', alle: 'Replace all', undo: 'Undo replacement in plan and notes',
  leer: 'Enter a search term.', keine: 'No matches.', zahl: '{n} matches', position: '{nr} of {n}',
  bestaetigung: 'Replace {n} matches in {kapitel} chapters, plan and notes? Chapters will be saved as snapshots first. Changes to plan and notes can be undone as one action.',
  bereiche: {manuskript: 'Manuscript', plan: 'Plan', notizen: 'Notes (including private)'},
  kapitelTreffer: 'Ch. {nr} · {titel}', feld: 'Field: {feld}',
  fehler: 'Replacement failed: {name} · {grund}', snapshot: 'Snapshot could not be created.',
  verweis: 'The replacement contains characters that would damage a structured reference (], | or a line break).',
  konflikt: 'The text has changed. Please search again.', undoKonflikt: 'A replaced field has since been edited. Undo was not applied.',
  fertig: '{n} matches replaced.',
};
