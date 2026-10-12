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
  TAGESZEIT_NAME,
  tagesSpanne,
  tageZwischen,
  WOCHENTAG_NAME,
  wochentagAusDatum,
  wochentagFuerTag,
  wochentagPlus,
  erzaehlMinute,
  type Beginn,
} from './zeitpunkt';

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

function pruefeEinzeln(daten: ProjektDaten, e: Eintrag, beginn: Beginn, ergebnis: Hinweis[]): void {
  const { zeit } = e;
  const name = einheitName(e.einheit);
  const u = parseUhrzeit(zeit.uhrzeit);
  if (zeit.uhrzeit && u === null) {
    ergebnis.push(hinweis(daten, 'ungueltig', [e], `uhrzeit=${zeit.uhrzeit}`, `Uhrzeit ungültig: ${name}`, `„${zeit.uhrzeit}“ ist keine Uhrzeit im Format HH:MM.`));
  }
  if (zeit.datum && !gueltigesDatum(zeit.datum)) {
    ergebnis.push(hinweis(daten, 'ungueltig', [e], `datum=${zeit.datum}`, `Datum ungültig: ${name}`, `„${zeit.datum}“ ist kein gültiges Datum (JJJJ-MM-TT).`));
  }
  if (u !== null && zeit.tageszeit && !passtZurTageszeit(zeit.tageszeit, u)) {
    ergebnis.push(
      hinweis(
        daten,
        'uhrzeit',
        [e],
        `${zeit.tageszeit}@${formatiereUhrzeit(u)}`,
        `Uhrzeit passt nicht zur Tageszeit: ${name}`,
        `Eingetragen sind „${TAGESZEIT_NAME[zeit.tageszeit]}“ und ${formatiereUhrzeit(u)} Uhr.`,
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
        `Datum und Wochentag passen nicht: ${name}`,
        `Der ${formatiereDatum(zeit.datum!)} ist ein ${WOCHENTAG_NAME[datumWochentag]}, eingetragen ist ${WOCHENTAG_NAME[zeit.wochentag]}.`,
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
          `Wochentag passt nicht: ${name}`,
          `${name} spielt an Tag ${t.tag}. Wenn Tag 1 ein ${WOCHENTAG_NAME[beginn.wochentag]} ist, ist Tag ${t.tag} ein ${WOCHENTAG_NAME[erwartet]} – eingetragen ist ${WOCHENTAG_NAME[zeit.wochentag]}.`,
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
          `Datum passt nicht zum Handlungstag: ${name}`,
          `Tag 1 ist der ${formatiereDatum(beginn.datum)}, Tag ${zeit.tag} wäre also der ${formatiereDatum(erwartet)} – eingetragen ist der ${formatiereDatum(zeit.datum)}.`,
        ),
      );
    }
  }
}

/** Ohne Beginn: Wochentage bzw. Daten zweier Zeitpunkte mit Handlungstag müssen zueinander passen. */
function pruefePaare(daten: ProjektDaten, eintraege: Eintrag[], beginn: Beginn, ergebnis: Hinweis[]): void {
  if (!beginn.wochentag) {
    const mit = eintraege.filter((e) => e.zeit.wochentag && typeof e.zeit.tag === 'number');
    const bezug = mit[0];
    for (const e of mit.slice(1)) {
      if (!bezug) break;
      const diff = e.zeit.tag! - bezug.zeit.tag!;
      const erwartet = wochentagPlus(bezug.zeit.wochentag!, diff);
      if (erwartet === e.zeit.wochentag) continue;
      const a = einheitName(bezug.einheit);
      const b = einheitName(e.einheit);
      ergebnis.push(
        hinweis(
          daten,
          'wochentag',
          [bezug, e],
          `tag${bezug.zeit.tag}=${bezug.zeit.wochentag}|tag${e.zeit.tag}=${e.zeit.wochentag}`,
          `Wochentage passen nicht zusammen: ${b}`,
          `${a} spielt an Tag ${bezug.zeit.tag} (${WOCHENTAG_NAME[bezug.zeit.wochentag!]}), ${b} an Tag ${e.zeit.tag} (${WOCHENTAG_NAME[e.zeit.wochentag!]}). ${Math.abs(diff) === 1 ? 'Einen Tag' : `${Math.abs(diff)} Tage`} ${diff >= 0 ? 'später' : 'früher'} wäre ${WOCHENTAG_NAME[erwartet]}.`,
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
      const a = einheitName(bezug.einheit);
      const b = einheitName(e.einheit);
      ergebnis.push(
        hinweis(
          daten,
          'datum',
          [bezug, e],
          `tag${bezug.zeit.tag}=${bezug.zeit.datum}|tag${e.zeit.tag}=${e.zeit.datum}`,
          `Daten passen nicht zu den Handlungstagen: ${b}`,
          `${a} spielt an Tag ${bezug.zeit.tag} (${formatiereDatum(bezug.zeit.datum!)}), ${b} an Tag ${e.zeit.tag} (${formatiereDatum(e.zeit.datum!)}). Zwischen den Daten liegen ${tage} Tage, zwischen den Handlungstagen ${diff}.`,
        ),
      );
    }
  }
}

/** Szenen dürfen nicht vor dem Tag ihres Kapitels spielen (außer Rückblenden). */
function pruefeSzenen(daten: ProjektDaten, eintraege: Eintrag[], beginn: Beginn, ergebnis: Hinweis[]): void {
  for (const k of eintraege) {
    if (k.einheit.szene) continue;
    const kt = effektiverTag(k.zeit, beginn);
    if (!kt || k.zeit.sicherheit === 'unklar') continue;
    for (const s of eintraege) {
      if (s.einheit.kapitel !== k.einheit.kapitel || !s.einheit.szene || s.zeit.sicherheit === 'unklar') continue;
      const st = effektiverTag(s.zeit, beginn);
      if (!st || st.tag < 1 || st.tag >= kt.tag) continue;
      const name = einheitName(s.einheit);
      ergebnis.push(
        hinweis(
          daten,
          'szene',
          [k, s],
          `tag${kt.tag}>tag${st.tag}`,
          `Szene früher als ihr Kapitel: ${name}`,
          `Das Kapitel ist für Tag ${kt.tag} eingetragen, ${name} für Tag ${st.tag}. Ist die Szene eine Rückblende, trag Tag 0 oder einen negativen Tag ein – oder markiere den Hinweis als Absicht.`,
        ),
      );
    }
  }
}

/** Reihenfolge und Dauer: jede Einheit gegen die zuletzt gelesene vergleichbare Einheit. */
function pruefeReihenfolge(daten: ProjektDaten, beginn: Beginn, ergebnis: Hinweis[]): void {
  const einheiten = zeitEinheiten(daten, { szenen: true });
  let vorige: { einheit: ZeitEinheit; zeit: Zeitpunkt; tag: number } | null = null;
  for (const e of einheiten) {
    const zeit = e.zeit;
    const t = effektiverTag(zeit, beginn);
    if (!zeit || !t || zeit.sicherheit === 'unklar') continue;
    if (vorige && t.tag >= 1) {
      const [vVon] = tagesSpanne(vorige.zeit);
      const [von, bis] = tagesSpanne(zeit);
      const vName = einheitName(vorige.einheit);
      const name = einheitName(e);
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
            `Zeitsprung zurück: ${name}`,
            `${name} spielt an Tag ${t.tag}, wird aber nach ${vName} (Tag ${vorige.tag}) gelesen. Ist es eine Rückblende, trag Tag 0 oder einen negativen Tag ein – oder markiere den Hinweis als Absicht.`,
          ),
        );
      } else if (t.tag === vorige.tag && bis < vVon) {
        ergebnis.push(
          hinweis(
            daten,
            'reihenfolge',
            eintraege,
            `tag${t.tag}:${vVon}>${bis}`,
            `Früher als die Stelle davor: ${name}`,
            `${name} spielt an Tag ${t.tag} ${zeitBeschreibung(zeit)}, die davor gelesene Stelle ${vName} am selben Tag ${zeitBeschreibung(vorige.zeit)}.`,
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
              `Überschneidung: ${name}`,
              `${vName} beginnt um ${formatiereUhrzeit(vVon)} und dauert ${vorige.zeit.dauer} Minuten (bis ${formatiereUhrzeit(vEnde)}), ${name} beginnt schon um ${formatiereUhrzeit(von)}.`,
            ),
          );
        }
      }
    }
    if (t.tag >= 1 || !vorige) vorige = { einheit: e, zeit, tag: t.tag };
  }
}

function zeitBeschreibung(z: Zeitpunkt): string {
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) return `um ${formatiereUhrzeit(u)}`;
  if (z.tageszeit) return TAGESZEIT_NAME[z.tageszeit];
  return 'ohne Tageszeit';
}

/** Lokale Zeit-Hinweise (Typ „zeitleiste“, quelle „lokal“). */
export function zeitHinweise(daten: ProjektDaten): Hinweis[] {
  if (!daten?.projekt) return [];
  const beginn = beginnVon(daten.zeitleiste);
  const ergebnis: Hinweis[] = [];
  const eintraege = eigeneZeitpunkte(daten);
  for (const e of eintraege) pruefeEinzeln(daten, e, beginn, ergebnis);
  pruefePaare(daten, eintraege, beginn, ergebnis);
  pruefeSzenen(daten, eintraege, beginn, ergebnis);
  pruefeReihenfolge(daten, beginn, ergebnis);
  const gesehen = new Set<string>();
  return ergebnis.filter((h) => !gesehen.has(h.schluessel) && gesehen.add(h.schluessel));
}

/** Einheiten-Schlüssel („kapitel“ bzw. „kapitel#szene“), die ein Zeit-Hinweis betrifft (für Sprünge in die Zeitleiste). */
export function einheitenAusZeitHinweis(schluessel: string): string[] {
  const m = /^zeitleiste:[a-z]+:([^:]*):/.exec(schluessel);
  return m?.[1] ? m[1].split('|').filter(Boolean) : [];
}
