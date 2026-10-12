/**
 * Lokale Zeitprüfung (G1, ohne KI): Widersprüche zwischen Leons Zeitpunkten als Hinweise vom Typ
 * „zeitleiste“ (quelle „lokal“). Wird von core/index mit den Struktur-Hinweisen zusammengeführt.
 *
 * Geprüft werden:
 * - Wochentag passt nicht zum Handlungstag (Beginn in plan/zeitleiste.md) bzw. zu einem anderen Zeitpunkt
 * - Datum passt nicht zum Wochentag, zum Handlungstag oder zu einem anderen Zeitpunkt
 * - Uhrzeit passt nicht zur Tageszeit; ungültige Uhrzeit/ungültiges Datum
 * - Reihenfolge: eine Einheit spielt früher als die davor gelesene (Rückblenden mit Tag ≤ 0 ausgenommen,
 *   Platzhalter mit Sicherheit „offen“ ebenfalls)
 * - Dauer: eine Einheit beginnt, bevor die vorige (mit Uhrzeit und Dauer) zu Ende ist
 * - Szene: eine Szene spielt an einem früheren Tag als ihr Kapitel (Rückblenden mit Tag ≤ 0 ausgenommen)
 *
 * Schlüssel: „zeitleiste:<art>:<Einheiten>:<Werte>“ – ändert Leon die Angaben, entsteht ein neuer Hinweis;
 * „Ist Absicht“ bleibt für genau diese Angaben bestehen.
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Hinweis, ProjektDaten, Zeitpunkt, Zitat } from '../model/types';
import { findeZitat, klartext } from '../text';
import { einheitName, zeitEinheiten, type ZeitEinheit } from './leiste';
import {
  beginnVon,
  datumPlusTage,
  effektiverTag,
  formatiereDatum,
  formatiereUhrzeit,
  gueltigesDatum,
  parseUhrzeit,
  passtZurTageszeit,
  tagesSpanne,
  tageszeitImSatz,
  tageszeitName,
  tageZwischen,
  wochentagAusDatum,
  wochentagFuerTag,
  wochentagName,
  wochentagPlus,
  erzaehlMinute,
  type Beginn,
} from './zeitpunkt';

/** Titel und Erklärungen in der Oberflächensprache; Schlüssel und Werte im Schlüssel bleiben sprachneutral. */
const T = texteJe(
  {
    uhrzeitUngueltig: 'Uhrzeit ungültig: {name}',
    uhrzeitUngueltigErklaerung: '„{wert}“ ist keine Uhrzeit im Format HH:MM.',
    datumUngueltig: 'Datum ungültig: {name}',
    datumUngueltigErklaerung: '„{wert}“ ist kein gültiges Datum (JJJJ-MM-TT).',
    uhrzeitTageszeit: 'Uhrzeit passt nicht zur Tageszeit: {name}',
    uhrzeitTageszeitErklaerung: 'Eingetragen sind „{tageszeit}“ und {uhrzeit} Uhr.',
    datumWochentag: 'Datum und Wochentag passen nicht: {name}',
    datumWochentagErklaerung: 'Der {datum} ist ein {wochentag}, eingetragen ist {eingetragen}.',
    wochentag: 'Wochentag passt nicht: {name}',
    wochentagErklaerung:
      '{name} spielt an Tag {tag}. Wenn Tag 1 ein {beginn} ist, ist Tag {tag} ein {erwartet} – eingetragen ist {eingetragen}.',
    datumTag: 'Datum passt nicht zum Handlungstag: {name}',
    datumTagErklaerung: 'Tag 1 ist der {beginn}, Tag {tag} wäre also der {erwartet} – eingetragen ist der {eingetragen}.',
    wochentagePaar: 'Wochentage passen nicht zusammen: {name}',
    wochentagePaarErklaerung: '{a} spielt an Tag {tagA} ({wochentagA}), {b} an Tag {tagB} ({wochentagB}). {abstand} {richtung} wäre {erwartet}.',
    abstand: { one: 'Einen Tag', other: '{n} Tage' },
    spaeter: 'später',
    frueher: 'früher',
    datenPaar: 'Daten passen nicht zu den Handlungstagen: {name}',
    datenPaarErklaerung:
      '{a} spielt an Tag {tagA} ({datumA}), {b} an Tag {tagB} ({datumB}). Zwischen den Daten liegen {tage} Tage, zwischen den Handlungstagen {diff}.',
    szene: 'Szene früher als ihr Kapitel: {name}',
    szeneErklaerung:
      'Das Kapitel ist für Tag {kapitelTag} eingetragen, {name} für Tag {szenenTag}. Ist die Szene eine Rückblende, trag Tag 0 oder einen negativen Tag ein – oder markiere den Hinweis als Absicht.',
    zurueck: 'Zeitsprung zurück: {name}',
    zurueckErklaerung:
      '{name} spielt an Tag {tag}, wird aber nach {vorige} (Tag {vorigerTag}) gelesen. Ist es eine Rückblende, trag Tag 0 oder einen negativen Tag ein – oder markiere den Hinweis als Absicht.',
    frueherAlsDavor: 'Früher als die Stelle davor: {name}',
    frueherAlsDavorErklaerung: '{name} spielt an Tag {tag} {zeit}, die davor gelesene Stelle {vorige} am selben Tag {vorigeZeit}.',
    ueberschneidung: 'Überschneidung: {name}',
    ueberschneidungErklaerung:
      '{vorige} beginnt um {von} und dauert {dauer} Minuten (bis {bis}), {name} beginnt schon um {beginn}.',
    umUhrzeit: 'um {uhrzeit}',
    ohneTageszeit: 'ohne Tageszeit',
  },
  {
    uhrzeitUngueltig: 'Invalid time: {name}',
    uhrzeitUngueltigErklaerung: '“{wert}” is not a time in HH:MM format.',
    datumUngueltig: 'Invalid date: {name}',
    datumUngueltigErklaerung: '“{wert}” is not a valid date (YYYY-MM-DD).',
    uhrzeitTageszeit: 'Time doesn’t match the time of day: {name}',
    uhrzeitTageszeitErklaerung: 'The entries are “{tageszeit}” and {uhrzeit}.',
    datumWochentag: 'Date and weekday don’t match: {name}',
    datumWochentagErklaerung: '{datum} is a {wochentag}, but {eingetragen} is entered.',
    wochentag: 'Weekday doesn’t match: {name}',
    wochentagErklaerung: '{name} takes place on Day {tag}. If Day 1 is a {beginn}, Day {tag} is a {erwartet} – but {eingetragen} is entered.',
    datumTag: 'Date doesn’t match the story day: {name}',
    datumTagErklaerung: 'Day 1 is {beginn}, so Day {tag} would be {erwartet} – but {eingetragen} is entered.',
    wochentagePaar: 'Weekdays don’t fit together: {name}',
    wochentagePaarErklaerung: '{a} takes place on Day {tagA} ({wochentagA}), {b} on Day {tagB} ({wochentagB}). {abstand} {richtung} would be a {erwartet}.',
    abstand: { one: 'One day', other: '{n} days' },
    spaeter: 'later',
    frueher: 'earlier',
    datenPaar: 'Dates don’t match the story days: {name}',
    datenPaarErklaerung:
      '{a} takes place on Day {tagA} ({datumA}), {b} on Day {tagB} ({datumB}). The dates are {tage} days apart, the story days {diff}.',
    szene: 'Scene earlier than its chapter: {name}',
    szeneErklaerung:
      'The chapter is set on Day {kapitelTag}, {name} on Day {szenenTag}. If the scene is a flashback, enter Day 0 or a negative day – or mark the note as intentional.',
    zurueck: 'Jump back in time: {name}',
    zurueckErklaerung:
      '{name} takes place on Day {tag} but is read after {vorige} (Day {vorigerTag}). If it is a flashback, enter Day 0 or a negative day – or mark the note as intentional.',
    frueherAlsDavor: 'Earlier than the passage before: {name}',
    frueherAlsDavorErklaerung: '{name} takes place on Day {tag} {zeit}, the passage read before it, {vorige}, on the same day {vorigeZeit}.',
    ueberschneidung: 'Overlap: {name}',
    ueberschneidungErklaerung: '{vorige} starts at {von} and lasts {dauer} minutes (until {bis}), but {name} already starts at {beginn}.',
    umUhrzeit: 'at {uhrzeit}',
    ohneTageszeit: 'with no time of day',
  },
);

export type ZeitHinweisArt = 'wochentag' | 'datum' | 'uhrzeit' | 'ungueltig' | 'reihenfolge' | 'dauer' | 'szene';

/** Ein Zeitpunkt mit Herkunft (Kapitel oder Szene) */
interface Eintrag {
  einheit: ZeitEinheit;
  zeit: Zeitpunkt;
}

function belegZitate(daten: ProjektDaten, eintraege: Eintrag[]): Zitat[] {
  const zitate: Zitat[] = [];
  for (const { zeit } of eintraege) {
    const b = zeit.beleg;
    if (!b?.exakt) continue;
    const md = daten.kapitel?.[b.kapitel]?.text;
    if (!md || findeZitat(klartext(md), b.exakt).length === 0) continue;
    if (!zitate.some((z) => z.kapitel === b.kapitel && z.text === b.exakt)) zitate.push({ kapitel: b.kapitel, text: b.exakt });
  }
  return zitate;
}

function hinweis(daten: ProjektDaten, art: ZeitHinweisArt, eintraege: Eintrag[], werte: string, titel: string, erklaerung: string): Hinweis {
  const einheiten = eintraege.map((e) => e.einheit.schluessel).join('|');
  return {
    schluessel: `zeitleiste:${art}:${einheiten}:${werte}`,
    typ: 'zeitleiste',
    titel,
    zitate: belegZitate(daten, eintraege),
    erklaerung,
    quelle: 'lokal',
    status: 'neu',
  };
}

/** Alle eigenen Zeitpunkte (Kapitel ohne Szenen, Kapitel mit Szenen und deren Szenen) in Lesereihenfolge. */
function eigeneZeitpunkte(daten: ProjektDaten): Eintrag[] {
  const kapitelweise = zeitEinheiten(daten, { szenen: false });
  const szenenweise = zeitEinheiten(daten, { szenen: true });
  const ergebnis: Eintrag[] = [];
  for (const k of kapitelweise) {
    if (k.eigen) ergebnis.push({ einheit: k, zeit: k.eigen });
    for (const s of szenenweise) if (s.kapitel === k.kapitel && s.szene && s.eigen) ergebnis.push({ einheit: s, zeit: s.eigen });
  }
  return ergebnis;
}

function pruefeEinzeln(daten: ProjektDaten, e: Eintrag, beginn: Beginn, ergebnis: Hinweis[], sprache: Sprache): void {
  const t_ = T(sprache);
  const wt = (w: Parameters<typeof wochentagName>[0]) => wochentagName(w, sprache);
  const datum = (iso: string) => formatiereDatum(iso, sprache);
  const { zeit } = e;
  const name = einheitName(e.einheit, sprache);
  const u = parseUhrzeit(zeit.uhrzeit);
  if (zeit.uhrzeit && u === null) {
    ergebnis.push(
      hinweis(daten, 'ungueltig', [e], `uhrzeit=${zeit.uhrzeit}`, fmt(t_.uhrzeitUngueltig, { name }), fmt(t_.uhrzeitUngueltigErklaerung, { wert: zeit.uhrzeit })),
    );
  }
  if (zeit.datum && !gueltigesDatum(zeit.datum)) {
    ergebnis.push(hinweis(daten, 'ungueltig', [e], `datum=${zeit.datum}`, fmt(t_.datumUngueltig, { name }), fmt(t_.datumUngueltigErklaerung, { wert: zeit.datum })));
  }
  if (u !== null && zeit.tageszeit && !passtZurTageszeit(zeit.tageszeit, u)) {
    ergebnis.push(
      hinweis(
        daten,
        'uhrzeit',
        [e],
        `${zeit.tageszeit}@${formatiereUhrzeit(u)}`,
        fmt(t_.uhrzeitTageszeit, { name }),
        fmt(t_.uhrzeitTageszeitErklaerung, { tageszeit: tageszeitName(zeit.tageszeit, sprache), uhrzeit: formatiereUhrzeit(u) }),
      ),
    );
  }
  const t = effektiverTag(zeit, beginn);
  const datumWochentag = zeit.datum ? wochentagAusDatum(zeit.datum) : null;
  if (zeit.wochentag && datumWochentag && datumWochentag !== zeit.wochentag) {
    ergebnis.push(
      hinweis(
        daten,
        'datum',
        [e],
        `${zeit.datum}=${zeit.wochentag}`,
        fmt(t_.datumWochentag, { name }),
        fmt(t_.datumWochentagErklaerung, { datum: datum(zeit.datum!), wochentag: wt(datumWochentag), eingetragen: wt(zeit.wochentag) }),
      ),
    );
  } else if (zeit.wochentag && t && !t.abgeleitet && beginn.wochentag) {
    const erwartet = wochentagFuerTag(beginn.wochentag, t.tag);
    if (erwartet !== zeit.wochentag) {
      ergebnis.push(
        hinweis(
          daten,
          'wochentag',
          [e],
          `tag${t.tag}=${zeit.wochentag}`,
          fmt(t_.wochentag, { name }),
          fmt(t_.wochentagErklaerung, { name, tag: t.tag, beginn: wt(beginn.wochentag), erwartet: wt(erwartet), eingetragen: wt(zeit.wochentag) }),
        ),
      );
    }
  }
  if (zeit.datum && gueltigesDatum(zeit.datum) && typeof zeit.tag === 'number' && beginn.datum) {
    const erwartet = datumPlusTage(beginn.datum, zeit.tag - 1);
    if (erwartet && erwartet !== zeit.datum) {
      ergebnis.push(
        hinweis(
          daten,
          'datum',
          [e],
          `tag${zeit.tag}=${zeit.datum}`,
          fmt(t_.datumTag, { name }),
          fmt(t_.datumTagErklaerung, { beginn: datum(beginn.datum), tag: zeit.tag, erwartet: datum(erwartet), eingetragen: datum(zeit.datum) }),
        ),
      );
    }
  }
}

/** Ohne Beginn: Wochentage bzw. Daten zweier Zeitpunkte mit Handlungstag müssen zueinander passen. */
function pruefePaare(daten: ProjektDaten, eintraege: Eintrag[], beginn: Beginn, ergebnis: Hinweis[], sprache: Sprache): void {
  const t_ = T(sprache);
  const wt = (w: Parameters<typeof wochentagName>[0]) => wochentagName(w, sprache);
  if (!beginn.wochentag) {
    const mit = eintraege.filter((e) => e.zeit.wochentag && typeof e.zeit.tag === 'number');
    const bezug = mit[0];
    for (const e of mit.slice(1)) {
      if (!bezug) break;
      const diff = e.zeit.tag! - bezug.zeit.tag!;
      const erwartet = wochentagPlus(bezug.zeit.wochentag!, diff);
      if (erwartet === e.zeit.wochentag) continue;
      const a = einheitName(bezug.einheit, sprache);
      const b = einheitName(e.einheit, sprache);
      ergebnis.push(
        hinweis(
          daten,
          'wochentag',
          [bezug, e],
          `tag${bezug.zeit.tag}=${bezug.zeit.wochentag}|tag${e.zeit.tag}=${e.zeit.wochentag}`,
          fmt(t_.wochentagePaar, { name: b }),
          fmt(t_.wochentagePaarErklaerung, {
            a,
            b,
            tagA: bezug.zeit.tag,
            wochentagA: wt(bezug.zeit.wochentag!),
            tagB: e.zeit.tag,
            wochentagB: wt(e.zeit.wochentag!),
            abstand: fmt(t_.abstand, { n: Math.abs(diff) }),
            richtung: diff >= 0 ? t_.spaeter : t_.frueher,
            erwartet: wt(erwartet),
          }),
        ),
      );
    }
  }
  if (!beginn.datum) {
    const mit = eintraege.filter((e) => gueltigesDatum(e.zeit.datum) && typeof e.zeit.tag === 'number');
    const bezug = mit[0];
    for (const e of mit.slice(1)) {
      if (!bezug) break;
      const tage = tageZwischen(bezug.zeit.datum!, e.zeit.datum!);
      const diff = e.zeit.tag! - bezug.zeit.tag!;
      if (tage === null || tage === diff) continue;
      const a = einheitName(bezug.einheit, sprache);
      const b = einheitName(e.einheit, sprache);
      ergebnis.push(
        hinweis(
          daten,
          'datum',
          [bezug, e],
          `tag${bezug.zeit.tag}=${bezug.zeit.datum}|tag${e.zeit.tag}=${e.zeit.datum}`,
          fmt(t_.datenPaar, { name: b }),
          fmt(t_.datenPaarErklaerung, {
            a,
            b,
            tagA: bezug.zeit.tag,
            datumA: formatiereDatum(bezug.zeit.datum!, sprache),
            tagB: e.zeit.tag,
            datumB: formatiereDatum(e.zeit.datum!, sprache),
            tage,
            diff,
          }),
        ),
      );
    }
  }
}

/** Szenen dürfen nicht vor dem Tag ihres Kapitels spielen (außer Rückblenden). */
function pruefeSzenen(daten: ProjektDaten, eintraege: Eintrag[], beginn: Beginn, ergebnis: Hinweis[], sprache: Sprache): void {
  const t_ = T(sprache);
  for (const k of eintraege) {
    if (k.einheit.szene) continue;
    const kt = effektiverTag(k.zeit, beginn);
    if (!kt || k.zeit.sicherheit === 'unklar') continue;
    for (const s of eintraege) {
      if (s.einheit.kapitel !== k.einheit.kapitel || !s.einheit.szene || s.zeit.sicherheit === 'unklar') continue;
      const st = effektiverTag(s.zeit, beginn);
      if (!st || st.tag < 1 || st.tag >= kt.tag) continue;
      const name = einheitName(s.einheit, sprache);
      ergebnis.push(
        hinweis(
          daten,
          'szene',
          [k, s],
          `tag${kt.tag}>tag${st.tag}`,
          fmt(t_.szene, { name }),
          fmt(t_.szeneErklaerung, { name, kapitelTag: kt.tag, szenenTag: st.tag }),
        ),
      );
    }
  }
}

/** Reihenfolge und Dauer: jede Einheit gegen die zuletzt gelesene vergleichbare Einheit. */
function pruefeReihenfolge(daten: ProjektDaten, beginn: Beginn, ergebnis: Hinweis[], sprache: Sprache): void {
  const t_ = T(sprache);
  const zb = (z: Zeitpunkt) => zeitBeschreibung(z, sprache);
  const einheiten = zeitEinheiten(daten, { szenen: true });
  let vorige: { einheit: ZeitEinheit; zeit: Zeitpunkt; tag: number } | null = null;
  for (const e of einheiten) {
    const zeit = e.zeit;
    const t = effektiverTag(zeit, beginn);
    if (!zeit || !t || zeit.sicherheit === 'unklar') continue;
    if (vorige && t.tag >= 1) {
      const [vVon] = tagesSpanne(vorige.zeit);
      const [von, bis] = tagesSpanne(zeit);
      const vName = einheitName(vorige.einheit, sprache);
      const name = einheitName(e, sprache);
      const eintraege: Eintrag[] = [
        { einheit: vorige.einheit, zeit: vorige.zeit },
        { einheit: e, zeit },
      ];
      if (t.tag < vorige.tag) {
        ergebnis.push(
          hinweis(
            daten,
            'reihenfolge',
            eintraege,
            `tag${vorige.tag}>tag${t.tag}`,
            fmt(t_.zurueck, { name }),
            fmt(t_.zurueckErklaerung, { name, tag: t.tag, vorige: vName, vorigerTag: vorige.tag }),
          ),
        );
      } else if (t.tag === vorige.tag && bis < vVon) {
        ergebnis.push(
          hinweis(
            daten,
            'reihenfolge',
            eintraege,
            `tag${t.tag}:${vVon}>${bis}`,
            fmt(t_.frueherAlsDavor, { name }),
            fmt(t_.frueherAlsDavorErklaerung, { name, tag: t.tag, zeit: zb(zeit), vorige: vName, vorigeZeit: zb(vorige.zeit) }),
          ),
        );
      } else if (t.tag === vorige.tag && vorige.zeit.dauer && parseUhrzeit(vorige.zeit.uhrzeit) !== null && parseUhrzeit(zeit.uhrzeit) !== null) {
        const vEnde = erzaehlMinute(parseUhrzeit(vorige.zeit.uhrzeit)!) + vorige.zeit.dauer;
        if (von < vEnde && von >= vVon && zeit.uhrzeit !== vorige.zeit.uhrzeit) {
          ergebnis.push(
            hinweis(
              daten,
              'dauer',
              eintraege,
              `${vVon}+${vorige.zeit.dauer}>${von}`,
              fmt(t_.ueberschneidung, { name }),
              fmt(t_.ueberschneidungErklaerung, {
                vorige: vName,
                von: formatiereUhrzeit(vVon),
                dauer: vorige.zeit.dauer,
                bis: formatiereUhrzeit(vEnde),
                name,
                beginn: formatiereUhrzeit(von),
              }),
            ),
          );
        }
      }
    }
    if (t.tag >= 1 || !vorige) vorige = { einheit: e, zeit, tag: t.tag };
  }
}

function zeitBeschreibung(z: Zeitpunkt, sprache: Sprache): string {
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) return fmt(T(sprache).umUhrzeit, { uhrzeit: formatiereUhrzeit(u) });
  if (z.tageszeit) return tageszeitImSatz(z.tageszeit, sprache);
  return T(sprache).ohneTageszeit;
}

/**
 * Lokale Zeit-Hinweise (Typ „zeitleiste“, quelle „lokal“). Titel und Erklärung in `sprache`
 * (Oberflächensprache); der Schlüssel ist in jeder Sprache derselbe.
 */
export function zeitHinweise(daten: ProjektDaten, sprache: Sprache = 'de'): Hinweis[] {
  if (!daten?.projekt) return [];
  const beginn = beginnVon(daten.zeitleiste);
  const ergebnis: Hinweis[] = [];
  const eintraege = eigeneZeitpunkte(daten);
  for (const e of eintraege) pruefeEinzeln(daten, e, beginn, ergebnis, sprache);
  pruefePaare(daten, eintraege, beginn, ergebnis, sprache);
  pruefeSzenen(daten, eintraege, beginn, ergebnis, sprache);
  pruefeReihenfolge(daten, beginn, ergebnis, sprache);
  const gesehen = new Set<string>();
  return ergebnis.filter((h) => !gesehen.has(h.schluessel) && gesehen.add(h.schluessel));
}

/** Einheiten-Schlüssel („kapitel“ bzw. „kapitel#szene“), die ein Zeit-Hinweis betrifft (für Sprünge in die Zeitleiste). */
export function einheitenAusZeitHinweis(schluessel: string): string[] {
  const m = /^zeitleiste:[a-z]+:([^:]*):/.exec(schluessel);
  return m?.[1] ? m[1].split('|').filter(Boolean) : [];
}
