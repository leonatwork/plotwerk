import type { ImportErgebnis } from '../docx';
import { fmt, type Sprache } from '../i18n';
import { parseBinder, ScrivenerFehler } from './binder';
import { rtfUmwandeln } from './rtf';
import { SCRIVENER_TEXTE } from './texte';

/** Dateien relativ zum .scriv-Paket; Windows-Backslashes werden akzeptiert, absolute Pfade nicht. */
export type ScrivenerDateien = Readonly<Record<string, string | Uint8Array>>;

/** Kein Dateisystemzugriff: Auswahl und Lesen des Pakets sind Verantwortung des Backends (#14). */
export function importiereScrivener(eingabe: ScrivenerDateien, sprache: Sprache = 'de'): ImportErgebnis {
  const t = SCRIVENER_TEXTE(sprache);
  const dateien = new Map<string, string | Uint8Array>();
  for (const [roh, inhalt] of Object.entries(eingabe)) {
    const pfad = roh.replaceAll('\\', '/');
    const teile = pfad.split('/');
    if (teile.some((p) => !p || p === '.' || p === '..' || p.includes(':')) || dateien.has(pfad)) throw new ScrivenerFehler(t.paket);
    dateien.set(pfad, inhalt);
  }
  if ([...dateien.keys()].some((p) => /^Files\/Docs(?:\/|$)/i.test(p))) throw new ScrivenerFehler(t.alt);
  const binderDateien = [...dateien.keys()].filter((p) => !p.includes('/') && /\.scrivx$/i.test(p));
  if (binderDateien.length !== 1) throw new ScrivenerFehler(t.paket);
  const utf8 = (inhalt: string | Uint8Array) => typeof inhalt === 'string' ? inhalt : new TextDecoder('utf-8', { fatal: true }).decode(inhalt);
  let xml: string;
  try { xml = utf8(dateien.get(binderDateien[0]!)!); }
  catch { throw new ScrivenerFehler(t.binder); }
  const binder = parseBinder(xml, sprache);
  const ergebnis: ImportErgebnis = { kapitel: [], akte: binder.akte, hinweise: [], vorspann: '' };
  for (const [index, dok] of binder.dokumente.entries()) {
    const ordner = `Files/Data/${dok.uuid}`;
    const rtf = (datei: string, markdown: boolean) => {
      const inhalt = dateien.get(`${ordner}/${datei}`);
      if (inhalt === undefined) return '';
      try {
        const r = rtfUmwandeln(inhalt);
        return markdown ? r.markdown : r.text;
      } catch {
        ergebnis.hinweise.push({
          schluessel: `struktur:import:scrivener-rtf-${datei}-${index + 1}`,
          typ: 'struktur', titel: t.rtf,
          erklaerung: fmt(t.rtfErklaerung, { n: index + 1, titel: dok.titel, datei }),
          zitate: [], quelle: 'lokal', status: 'neu',
        });
        return '';
      }
    };
    const synopsis = dateien.get(`${ordner}/synopsis.txt`);
    let szene = '';
    if (synopsis !== undefined) {
      try { szene = utf8(synopsis); }
      catch { throw new ScrivenerFehler(t.paket); }
    }
    ergebnis.kapitel.push({ titel: dok.titel, text: rtf('content.rtf', true), szene, notiz: rtf('notes.rtf', false), notizPrivat: true, akt: dok.akt });
  }
  return ergebnis;
}
