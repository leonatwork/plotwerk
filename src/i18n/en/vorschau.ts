import type { Form } from '@core/i18n';
import type { vorschau as de } from '../de/vorschau';

export const vorschau: Form<typeof de> = {
  titel: 'Book preview',
  fehler: 'The preview couldn’t be shown.',
  hintergrund: { papier: 'Paper', sepia: 'Sepia', nacht: 'Night' },
  zeilen: { eng: 'Tight', normal: 'Normal', weit: 'Loose' },
  seite: { leer: 'Blank page', titelseite: 'Title page', nummer: 'Page {nr}' },
  inhalt: { label: 'Table of contents', titel: 'Contents', leer: 'No chapter with text yet.' },
  darstellung: {
    titel: 'Appearance',
    schriftgroesse: 'Font size',
    stufe: 'Font size {nr} of {n}',
    zeilenabstand: 'Line spacing',
    hintergrund: 'Background',
  },
  leiste: { ansicht: 'View', buch: 'Book', ebook: 'E-book', schliessenTitel: 'Close (Esc)' },
  leer: 'No chapter with text yet – the preview only shows written text.',
  vorige: 'Previous page',
  naechste: 'Next page',
  fortschritt: 'Reading progress',
  fuss: {
    ca: 'about {n}',
    seite: 'Page {nr} of {gesamt}',
    doppelseite: 'Pages {von}–{bis} of {gesamt}',
    imKapitel: 'Page {nr} of {gesamt} in this chapter',
  },
  buch: { kapitelKopf: 'Chapter {nr}', ohneTitel: 'Untitled', szenenwechsel: 'Scene break' },
};
