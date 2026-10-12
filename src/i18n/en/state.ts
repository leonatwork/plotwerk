import type { Form } from '@core/i18n';
import type { state as de } from '../de/state';

export const state: Form<typeof de> = {
  fehler: {
    keinProjekt: 'No project is open.',
    keinBackend: 'No backend available.',
    nichtBereit: 'The app isn’t ready yet.',
    planFehlt: 'No plan for chapter “{id}”.',
    figurFehlt: 'Character “{id}” not found.',
    ortFehlt: 'Place “{id}” not found.',
    gruppeFehlt: 'Group “{id}” not found.',
    ideeFehlt: 'Idea not found.',
    nameFehlt: 'Name is missing.',
    versionFehlt: 'This version no longer exists.',
    eintragFehlt: 'This entry no longer exists.',
    abweichungOhneNotiz: 'The deviation needs a note.',
    kapitelMitText: 'Chapters with text can’t be deleted here.',
    aktNichtLeer: 'The act still contains chapters.',
  },
  standard: {
    kapitel: 'New chapter',
    idee: 'New idea',
    stufe: 'New stage',
    feld: 'New field',
    projekt: 'New project',
    akt: 'Act {nr}',
    vorspann: 'Front matter',
    manuskript: 'Manuscript',
    figurPlan: { alter: 'Age', beruf: 'Occupation', aussehen: 'Appearance' },
  },
  planung: {
    nochLeer: 'Still empty.',
    nichtGeprueft: 'Not checked yet.',
  },
  ki: {
    schluesselAbgelehnt: 'The API key was rejected (401). Check or replace it in Settings.',
    keinZugriff: 'No access to the deployment (403). {text}',
    nichtGefunden: 'Model or endpoint not found (404). Check your settings. {text}',
    zuVieleAnfragen: 'Too many requests to the AI service (429). Wait a moment and try again later.',
    ueberlastet: 'The AI service is overloaded right now. Try again later.',
    keineVerbindung: 'Can’t connect to the AI service. Without a network connection, everything except AI checks still works. ({text})',
    schluesselEingeben: 'Please enter a key.',
    pruefungAbgebrochen: 'The check was cancelled.',
    abgebrochen: 'Cancelled.',
    figurWaehlen: 'Choose a character first.',
  },
  kileser: {
    schreibAuftrag: 'The AI doesn’t write text for the book. Ask about passages, characters or events in the text.',
    antwortVerworfen: 'The answer was discarded ({grund}). Nothing was saved.',
    belegeVerworfen: {
      one: '{n} quote discarded – not verbatim in the book.',
      other: '{n} quotes discarded – not verbatim in the book.',
    },
  },
  statistik: {
    fassungOhneName: 'Please give the draft version a name.',
    keinKapitelMitText: 'There’s no chapter with text to save yet.',
    fassungFehlt: 'This draft version no longer exists.',
    nichtInFassung: 'not part of the draft version',
    nichtImBuch: 'chapter is no longer in the book',
    schnappschussFehlt: 'snapshot missing',
  },
  abgabe: {
    aenderungFehlt: 'This change no longer exists.',
    schonImText: 'The change is already in the text. You’ll find the previous state under the chapter’s “Versions”.',
    kapitelFehlt: 'The chapter no longer exists.',
    zusatz: { normseite: ' (standard pages)', expose: ' – Synopsis', mappe: ' – Editing packet' },
  },
  importexport: {
    keinNeuesProjekt: 'No new project was created.',
  },
  recherche: {
    keinBild: '“{name}” isn’t an image (allowed: JPG, PNG, GIF, WebP, HEIC, TIFF, SVG …).',
    zuGross: '“{name}” is {groesse} – the maximum is {max}.',
  },
};
