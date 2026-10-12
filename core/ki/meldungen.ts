/**
 * Meldungen von core/ki für die Oberfläche (KiFehler-Texte, Gründe verworfener Antworten, Aufgabennamen).
 *
 * Sprache = Oberflächensprache (`oberflaeche`, Standard 'de'), nicht die Buchsprache: Prompts und Antworten
 * der KI richten sich nach dem Buch (sprache.ts), diese Texte nach der App. Platzhalter über `fmt`.
 * Ersatztext-Muster und Prompt-Inhalte stehen nicht hier.
 */
import { fmt, texteJe, type Sprache, type Werte } from '../i18n';

const de = {
  // KiFehler
  nichtBereit: 'Die KI ist noch nicht eingerichtet: API-Schlüssel oder Endpoint fehlt.',
  keinKapitelGewaehlt: 'Kein Kapitel gewählt.',
  kapitelFehlt: 'Das Kapitel „{kapitel}“ gibt es nicht.',
  kapitelOhneText: 'Kap. {nr} „{titel}“ hat noch keinen Text.',
  buchOhneText: 'Das Buch hat noch keinen Text.',
  keinKapitelMitText: 'Keines der gewählten Kapitel hat Text.',
  figurFehlt: 'Die Figur „{figur}“ gibt es nicht.',
  keineZustaende: 'Es sind keine Zustände angelegt.',
  pruefungAbgebrochen: 'Die Prüfung wurde abgebrochen.',
  vorschlaegeAbgebrochen: 'Die Vorschläge wurden abgebrochen.',
  aufgabeAbgebrochen: '{name}: abgebrochen.',
  antwortOhneDaten: 'Die Antwort enthält keine Daten.',
  keineDatenSatz: 'Keine Daten.',
  keineDaten: 'keine Daten',
  keinJson: 'Die Antwort ist kein gültiges JSON.',
  schemaFalsch: 'Die Antwort passt nicht zum Schema.',

  // Messages-API-Antwort (antwort.ts)
  leereAntwort: 'Leere Antwort vom KI-Dienst.',
  unbekannterFehler: 'unbekannter Fehler',
  dienstFehler: 'KI-Dienst meldet einen Fehler ({typ}): {text}',
  abgelehnt: 'Das Modell hat die Anfrage abgelehnt (refusal).',
  abgelehntKategorie: 'Das Modell hat die Anfrage abgelehnt (refusal, Kategorie {kategorie}).',
  abgeschnitten: 'Antwort abgeschnitten: Das Token-Limit (max_tokens) wurde erreicht.',
  unerwartetesEnde: 'Unerwartetes Antwortende (stop_reason: {stop}).',
  keinText: 'Die Antwort enthält keinen Text.',

  // Prüfung (index.ts, pruefung.ts)
  kapitelName: 'Kap. {nr} „{titel}“',
  mitName: '{name}: {text}',
  keineAnalyse: 'keine gültige Analyse geliefert',
  formulierungsvorschlag: 'Formulierungsvorschlag ({name})',
  zitatUnvollstaendig: 'Zitat unvollständig',
  zitatUnbekanntesKapitel: 'Zitat aus unbekanntem Kapitel „{kapitel}“',
  zitatZuKurz: 'Zitat zu kurz („{text}“)',
  zitatNichtWoertlich: 'Zitat steht nicht wörtlich in Kap. {nr} „{titel}“: „{text}“',
  betrifftFigur: 'Figur „{name}“',
  betrifftStelle: 'Stelle „{text}“',
  betrifftText: '„{text}“',
  hinweisFormat: 'Hinweis hat kein gültiges Format',
  hinweisTypUnbekannt: 'Unbekannter Hinweis-Typ „{typ}“',
  hinweisOhneTitel: 'Hinweis ohne Titel',
  hinweisOhneZitat: 'Hinweis ohne Zitat',
  hinweisNichtGeprueft: 'Hinweis betrifft kein geprüftes Kapitel',
  erklaerungZitiertFremd: 'Erklärung zitiert Text, der nicht im Buch steht („{zitat}“)',
  widerspruchVage: 'Widerspruch zu bewusst Vagem ({was})',
  planFigurUnbekannt: 'Plan-Bezug auf unbekannte Figur „{figur}“',
  planVageFigur: 'Plan-Widerspruch bei bewusst vager Figur „{name}“',
  planKapitelUnbekannt: 'Plan-Bezug auf unbekanntes Kapitel „{kapitel}“',
  analyseFormat: 'Analyse hat kein gültiges Format',
  analyseKapitelUnbekannt: 'Analyse für unbekanntes Kapitel „{kapitel}“',
  analyseNichtImAuftrag: 'Analyse für Kap. {nr} gehört nicht zum Auftrag',
  analyseOhneZusammenfassung: 'Analyse für Kap. {nr} ohne Zusammenfassung',

  // Aufgaben (aufgabe.ts)
  zitatAusserhalb: 'Zitat aus einem Kapitel außerhalb der Aufgabe ({kapitel})',
  ohneZitat: 'ohne wörtliches Zitat',
  wenigerZitate: 'weniger als {n} Zitate',
  textFehlt: 'Text fehlt',
  zitiertFremd: 'zitiert Text, der nicht im Buch steht („{zitat}“)',

  // Vorschläge (vorschlaege.ts)
  ohneBeleg: 'ohne Beleg',
  figurOhneNamen: 'Figur ohne Namen',
  figurGrund: 'Figur „{name}“: {grund}',
  figurKurz: 'Figur „{name}“: Kurzbeschreibung {grund}',
  figurVerworfen: 'Figur „{name}“ hast du verworfen',
  ortOhneNamen: 'Ort ohne Namen',
  ortGrund: 'Ort „{name}“: {grund}',
  beziehungTitel: 'Beziehung „{von}“ – „{zu}“',
  unbekannteFigur: 'unbekannte Figur „{name}“ (weder angelegt noch vorgeschlagen)',
  verworfeneFigur: 'verweist auf eine verworfene Figur ({grund})',
  zuSichSelbst: 'Beziehung einer Figur zu sich selbst',
  ohneBezeichnung: 'ohne Bezeichnung',
  bezeichnungZuLang: 'Bezeichnung „{art}“ hat mehr als {n} Wörter',

  // Zeitpunkte und Zustände (zeit.ts)
  nameZeit: 'Zeitpunkte',
  nameZustand: 'Zustände',
  szeneNichtGeplant: 'Szene {n} in Kap. {nr} ist nicht geplant',
  keinBelegAusKapitel: 'kein Beleg aus Kap. {nr} selbst',
  tagKeineZahl: 'Tag „{tag}“ ist keine ganze Zahl',
  wochentagUnbekannt: 'unbekannter Wochentag „{wochentag}“',
  datumUngueltig: 'ungültiges Datum „{datum}“',
  wochentagPasstNicht: 'Wochentag passt nicht zum Datum {datum}',
  tageszeitUnbekannt: 'unbekannte Tageszeit „{tageszeit}“',
  uhrzeitUngueltig: 'ungültige Uhrzeit „{uhrzeit}“',
  uhrzeitPasstNicht: 'Uhrzeit {uhrzeit} passt nicht zu „{tageszeit}“',
  ohneZeitangabe: 'ohne Zeitangabe',
  kapitelUnbekannt: 'unbekanntes Kapitel „{kapitel}“',
  kapitelNichtImAuftrag: 'Kap. {nr} gehört nicht zum Auftrag',
  kapitelGrund: 'Kap. {nr}: {grund}',
  doppelterEintrag: 'doppelter Eintrag für Kap. {nr}',
  doppelterEintragSzene: 'doppelter Eintrag für Kap. {nr}, Szene {szene}',
  zustandUnbekannt: 'unbekannter Zustand „{zustand}“',

  // Figurenstimme (stimme.ts)
  nameStimme: 'Figurenstimme',
  vergleichGleicheStelle: 'Vergleich nennt dieselbe Stelle wie die Auffälligkeit',
  vageFigurNurDeutlich: 'bewusst vage Figur „{name}“: nur deutliche Auffälligkeiten',

  // Leser-Simulation und Fragen (leser.ts, fragen.ts)
  nameLeser: 'Leser-Simulation',
  planAbgleichUnbekannt: 'Plan-Abgleich zu unbekanntem Kapitel „{kapitel}“',
  kapitelOhnePlan: 'Kap. {nr} hat keinen Plan',
  planAbgleichOhneStatus: 'Plan-Abgleich ohne gültigen Status',
  nameFrage: 'Frage an das Buch',
  antwortFehlt: 'Antwort fehlt',
};

const en: typeof de = {
  nichtBereit: 'The AI is not set up yet: API key or endpoint missing.',
  keinKapitelGewaehlt: 'No chapter selected.',
  kapitelFehlt: 'The chapter “{kapitel}” does not exist.',
  kapitelOhneText: 'Ch. {nr} “{titel}” has no text yet.',
  buchOhneText: 'The book has no text yet.',
  keinKapitelMitText: 'None of the selected chapters has any text.',
  figurFehlt: 'The character “{figur}” does not exist.',
  keineZustaende: 'No states have been set up.',
  pruefungAbgebrochen: 'The check was cancelled.',
  vorschlaegeAbgebrochen: 'The suggestions were cancelled.',
  aufgabeAbgebrochen: '{name}: cancelled.',
  antwortOhneDaten: 'The response contains no data.',
  keineDatenSatz: 'No data.',
  keineDaten: 'no data',
  keinJson: 'The response is not valid JSON.',
  schemaFalsch: 'The response does not match the schema.',

  leereAntwort: 'Empty response from the AI service.',
  unbekannterFehler: 'unknown error',
  dienstFehler: 'The AI service reported an error ({typ}): {text}',
  abgelehnt: 'The model refused the request (refusal).',
  abgelehntKategorie: 'The model refused the request (refusal, category {kategorie}).',
  abgeschnitten: 'Response cut off: the token limit (max_tokens) was reached.',
  unerwartetesEnde: 'Unexpected end of response (stop_reason: {stop}).',
  keinText: 'The response contains no text.',

  kapitelName: 'Ch. {nr} “{titel}”',
  mitName: '{name}: {text}',
  keineAnalyse: 'no valid analysis returned',
  formulierungsvorschlag: 'Wording suggestion ({name})',
  zitatUnvollstaendig: 'Incomplete quote',
  zitatUnbekanntesKapitel: 'Quote from unknown chapter “{kapitel}”',
  zitatZuKurz: 'Quote too short (“{text}”)',
  zitatNichtWoertlich: 'Quote does not appear verbatim in Ch. {nr} “{titel}”: “{text}”',
  betrifftFigur: 'character “{name}”',
  betrifftStelle: 'passage “{text}”',
  betrifftText: '“{text}”',
  hinweisFormat: 'Note has no valid format',
  hinweisTypUnbekannt: 'Unknown note type “{typ}”',
  hinweisOhneTitel: 'Note without a title',
  hinweisOhneZitat: 'Note without a quote',
  hinweisNichtGeprueft: 'Note does not concern a checked chapter',
  erklaerungZitiertFremd: 'Explanation quotes text that is not in the book (“{zitat}”)',
  widerspruchVage: 'Contradicts something deliberately vague ({was})',
  planFigurUnbekannt: 'Plan reference to unknown character “{figur}”',
  planVageFigur: 'Plan contradiction for deliberately vague character “{name}”',
  planKapitelUnbekannt: 'Plan reference to unknown chapter “{kapitel}”',
  analyseFormat: 'Analysis has no valid format',
  analyseKapitelUnbekannt: 'Analysis for unknown chapter “{kapitel}”',
  analyseNichtImAuftrag: 'Analysis for Ch. {nr} is not part of the request',
  analyseOhneZusammenfassung: 'Analysis for Ch. {nr} without a summary',

  zitatAusserhalb: 'Quote from a chapter outside the task ({kapitel})',
  ohneZitat: 'no verbatim quote',
  wenigerZitate: 'fewer than {n} quotes',
  textFehlt: 'Text missing',
  zitiertFremd: 'quotes text that is not in the book (“{zitat}”)',

  ohneBeleg: 'no evidence',
  figurOhneNamen: 'Character without a name',
  figurGrund: 'Character “{name}”: {grund}',
  figurKurz: 'Character “{name}”: short description {grund}',
  figurVerworfen: 'You rejected the character “{name}”',
  ortOhneNamen: 'Place without a name',
  ortGrund: 'Place “{name}”: {grund}',
  beziehungTitel: 'Relationship “{von}” – “{zu}”',
  unbekannteFigur: 'unknown character “{name}” (neither created nor suggested)',
  verworfeneFigur: 'refers to a rejected character ({grund})',
  zuSichSelbst: 'Relationship of a character with themselves',
  ohneBezeichnung: 'no label',
  bezeichnungZuLang: 'Label “{art}” has more than {n} words',

  nameZeit: 'Points in time',
  nameZustand: 'States',
  szeneNichtGeplant: 'Scene {n} in Ch. {nr} is not planned',
  keinBelegAusKapitel: 'no evidence from Ch. {nr} itself',
  tagKeineZahl: 'Day “{tag}” is not a whole number',
  wochentagUnbekannt: 'unknown weekday “{wochentag}”',
  datumUngueltig: 'invalid date “{datum}”',
  wochentagPasstNicht: 'Weekday does not match the date {datum}',
  tageszeitUnbekannt: 'unknown time of day “{tageszeit}”',
  uhrzeitUngueltig: 'invalid time “{uhrzeit}”',
  uhrzeitPasstNicht: 'Time {uhrzeit} does not match “{tageszeit}”',
  ohneZeitangabe: 'no time given',
  kapitelUnbekannt: 'unknown chapter “{kapitel}”',
  kapitelNichtImAuftrag: 'Ch. {nr} is not part of the request',
  kapitelGrund: 'Ch. {nr}: {grund}',
  doppelterEintrag: 'duplicate entry for Ch. {nr}',
  doppelterEintragSzene: 'duplicate entry for Ch. {nr}, scene {szene}',
  zustandUnbekannt: 'unknown state “{zustand}”',

  nameStimme: 'Character voice',
  vergleichGleicheStelle: 'Comparison cites the same passage as the observation',
  vageFigurNurDeutlich: 'deliberately vague character “{name}”: only clear observations',

  nameLeser: 'Reader simulation',
  planAbgleichUnbekannt: 'Plan comparison for unknown chapter “{kapitel}”',
  kapitelOhnePlan: 'Ch. {nr} has no plan',
  planAbgleichOhneStatus: 'Plan comparison without a valid status',
  nameFrage: 'Question to the book',
  antwortFehlt: 'Answer missing',
};

/** Wörterbuch der core/ki-Meldungen je Oberflächensprache. */
export const kiMeldungen = texteJe(de, en);

export type KiMeldung = keyof typeof de;

/** Meldung in der Oberflächensprache mit eingesetzten Werten. Zahlen bleiben roh (Kapitelnummern, Anzahl). */
export function meldung(schluessel: KiMeldung, werte: Werte = {}, oberflaeche: Sprache = 'de'): string {
  return fmt(kiMeldungen(oberflaeche)[schluessel], werte);
}

/** Kurzform für eine Sprache: `const m = meldungenIn(oberflaeche); m('keinJson')`. */
export function meldungenIn(oberflaeche: Sprache = 'de'): (schluessel: KiMeldung, werte?: Werte) => string {
  return (schluessel, werte) => meldung(schluessel, werte, oberflaeche);
}
