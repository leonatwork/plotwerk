import { texteJe } from '../i18n';

export const SCRIVENER_TEXTE = texteJe(
  {
    alt: 'Scrivener 1 und 2 werden nicht unterstützt (Files/Docs). Bitte das Projekt in Scrivener 3 öffnen und im neuen Format speichern.',
    paket: 'Das Scrivener-Paket ist ungültig oder mehrdeutig. Erwartet wird genau eine .scrivx-Datei im Paket und sichere relative Dateipfade.',
    binder: 'Der Scrivener-Binder ist beschädigt oder enthält keinen eindeutigen Manuskript-Ordner (Draft).',
    rtf: 'RTF nicht lesbar',
    rtfErklaerung: 'Kapitel {n} „{titel}“: {datei} ist beschädigt. Dieses Feld wird mit leerem Text importiert.',
  },
  {
    alt: 'Scrivener 1 and 2 are not supported (Files/Docs). Please open the project in Scrivener 3 and save it in the new format.',
    paket: 'The Scrivener package is invalid or ambiguous. Exactly one .scrivx file at the package root and safe relative file paths are required.',
    binder: 'The Scrivener binder is damaged or does not contain a unique manuscript folder (Draft).',
    rtf: 'RTF cannot be read',
    rtfErklaerung: 'Chapter {n} “{titel}”: {datei} is damaged. This field will be imported with empty text.',
  },
);
