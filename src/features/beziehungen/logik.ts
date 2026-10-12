/**
 * Beziehungsnetz: Zeitregler (B-02), Sichtbarkeit, Filter (B-03), Kartenstil und Linienführung (B-01).
 * Reine Funktionen ohne Store und DOM.
 */
import type { Index } from '@core/index/index';
import type { Beziehung, BeziehungsKategorie, Erwaehnung, Figur, Gruppe, Id, ProjektDaten, Spur, TextAnker } from '@core/model/types';
import { ankerErzeugen, findeZitat, klartext } from '@core/text/index';
/** `fmt` statt `f`: `f` heißt hier oft eine Figur. */
import { f as fmt, texte } from '../../i18n';
import {
  ausschnitt,
  farbSatz,
  kapitelIndex,
  kapLabel,
  kategorieFarbe,
  roemisch,
  strangVon,
  type FarbSatz,
} from './gemeinsam';

export const KARTE = { breite: 152, hoehe: 60 } as const;
export const STANDARD_FLAECHE = { breite: 184, hoehe: 156 } as const;

export type NetzFilter = Record<BeziehungsKategorie, boolean>;
export const ALLE_KATEGORIEN: NetzFilter = { arbeit: true, dates: true, sonstige: true };

// ---------------------------------------------------------------------------
// Zeitregler
// ---------------------------------------------------------------------------

export interface Stufe {
  akt: number;
  label: string;
  /** letztes Kapitel des Akts (Stand am Ende des Akts) */
  bisKapitel: Id;
  bisIndex: number;
}

/** Ein Segment je Akt mit zugeordneten Kapiteln: „Akt I · Kap. 1–4“. */
export function aktStufen(daten: ProjektDaten): Stufe[] {
  const stufen: Stufe[] = [];
  const t = texte();
  const akte = [...daten.akte].sort((a, b) => a.nummer - b.nummer);
  for (const akt of akte) {
    const idx = daten.projekt.kapitel
      .map((id, i) => (daten.plaene[id]?.akt === akt.nummer ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const von = Math.min(...idx) + 1;
    const bis = Math.max(...idx) + 1;
    stufen.push({
      akt: akt.nummer,
      label: fmt(t.beziehungen.logik.aktStufe, {
        akt: roemisch(akt.nummer),
        kapitel: von === bis ? fmt(t.gemeinsam.kapitelKurz, { nr: von }) : fmt(t.beziehungen.logik.kapBereich, { von, bis }),
      }),
      bisKapitel: daten.projekt.kapitel[bis - 1]!,
      bisIndex: bis - 1,
    });
  }
  return stufen;
}

/** Index des Stand-Kapitels; null/unbekannt = letztes Kapitel. */
export function standIndex(daten: ProjektDaten, stand: Id | null | undefined): number {
  const i = kapitelIndex(daten, stand);
  return i >= 0 ? i : daten.projekt.kapitel.length - 1;
}

export function standNotiz(standIdx: number): string {
  return fmt(texte().beziehungen.logik.standNotiz, { nr: standIdx + 1 });
}

/** Figur noch nicht im Text (kein Vorkommen). */
export function istGeplant(index: Index, figur: Id): boolean {
  return !index.erstesVorkommen[figur];
}

/**
 * Figur ist bis zum Stand bekannt: ab ihrem ersten Vorkommen. Figuren ohne Vorkommen (nur geplant)
 * zeigt das Netz erst beim Stand „Ende des Buchs“.
 */
export function figurSichtbar(daten: ProjektDaten, index: Index, figur: Id, standIdx: number): boolean {
  const erst = index.erstesVorkommen[figur];
  if (erst) {
    const i = kapitelIndex(daten, erst);
    return i >= 0 && i <= standIdx;
  }
  return standIdx >= daten.projekt.kapitel.length - 1;
}

/** Bezeichnung gilt ab `abKapitel`; ohne Angabe von Anfang an. */
export function beziehungGilt(daten: ProjektDaten, b: Beziehung, standIdx: number): boolean {
  const i = kapitelIndex(daten, b.abKapitel);
  return i < 0 || i <= standIdx;
}

// ---------------------------------------------------------------------------
// Beziehungspaare
// ---------------------------------------------------------------------------

export interface BeziehungsEintrag {
  von: Id;
  zu: Id;
  /** Index in figuren[von].beziehungen */
  index: number;
  beziehung: Beziehung;
}

export interface BeziehungsPaar {
  schluessel: string;
  a: Id;
  b: Id;
  /** nach abKapitel sortiert (ohne Angabe zuerst) */
  eintraege: BeziehungsEintrag[];
}

export function paarSchluessel(a: Id, b: Id): string {
  return [a, b].sort().join('|');
}

export function beziehungsPaare(daten: ProjektDaten): BeziehungsPaar[] {
  const paare = new Map<string, BeziehungsPaar>();
  for (const f of Object.values(daten.figuren)) {
    f.beziehungen.forEach((b, index) => {
      if (!b.zu || b.zu === f.id || !daten.figuren[b.zu]) return;
      const schluessel = paarSchluessel(f.id, b.zu);
      let p = paare.get(schluessel);
      if (!p) {
        const [a, bb] = schluessel.split('|') as [Id, Id];
        p = { schluessel, a, b: bb, eintraege: [] };
        paare.set(schluessel, p);
      }
      p.eintraege.push({ von: f.id, zu: b.zu, index, beziehung: b });
    });
  }
  for (const p of paare.values())
    p.eintraege.sort((x, y) => kapitelIndex(daten, x.beziehung.abKapitel) - kapitelIndex(daten, y.beziehung.abKapitel));
  return [...paare.values()];
}

/** Gültiger Eintrag am Stand (der zuletzt eingeführte), sonst null = „Noch nicht eingeführt“. */
export function aktuellerEintrag(daten: ProjektDaten, paar: BeziehungsPaar, standIdx: number): BeziehungsEintrag | null {
  let treffer: BeziehungsEintrag | null = null;
  for (const e of paar.eintraege) if (beziehungGilt(daten, e.beziehung, standIdx)) treffer = e;
  return treffer;
}

export function eintragFarbe(daten: ProjektDaten, b: Beziehung): FarbSatz {
  const s = strangVon(daten, b.strang);
  return s ? farbSatz(s.farbe) : kategorieFarbe(b.kategorie);
}

// ---------------------------------------------------------------------------
// Netz berechnen
// ---------------------------------------------------------------------------

export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export type KartenVariante = 'zentrum' | 'normal' | 'erwaehnt' | 'unsicher' | 'geplant';

export interface NetzKarte {
  figur: Figur;
  rechteck: Rechteck;
  variante: KartenVariante;
  untertitel: string;
  farben: FarbSatz;
}

export interface NetzFlaeche {
  gruppe: Gruppe;
  rechteck: Rechteck;
  farben: FarbSatz;
  label: string;
  /** A-05: am Stand bekannte Mitglieder, deren Karte nicht in der Fläche liegt (z. B. andere Hauptgruppe) */
  aussen: { id: Id; name: string }[];
}

export interface NetzPlatzhalter {
  gruppe: Gruppe;
  rechteck: Rechteck;
  /** kandidat: Spur, die eine Person sein könnte (»Kranich«); leer: noch keine Figur */
  variante: 'kandidat' | 'leer';
  titel: string;
  untertitel: string;
  spur: Spur | null;
  farben: FarbSatz;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LinienStil {
  farbe: string;
  gestrichelt: boolean;
}

export interface NetzLinie {
  /** Paar-Schlüssel oder „spur:<gruppe>“ */
  id: string;
  /** sichtbare Segmente in eigener Farbe */
  segmente: (Segment & LinienStil)[];
  /** gesamter Weg (Trefferfläche, Hervorhebung) */
  weg: Segment[];
  label: { text: string; x: number; y: number; zentriert: boolean; farbe: string; leer: boolean };
}

export interface NetzPaarSicht {
  paar: BeziehungsPaar;
  eintrag: BeziehungsEintrag;
  stil: LinienStil;
  farben: FarbSatz;
}

export interface NetzAnsicht {
  standIdx: number;
  karten: NetzKarte[];
  flaechen: NetzFlaeche[];
  platzhalter: NetzPlatzhalter[];
  linien: NetzLinie[];
  /** sichtbare Paare am Stand (nach Filter) */
  paare: NetzPaarSicht[];
  zentrum: Id | null;
  /** sichtbar, aber vom Filter ausgeblendet */
  ausgeblendet: Figur[];
  /** am Stand bekannt, aber ohne Position im Netz */
  ohnePosition: Figur[];
  gruppenOhneFlaeche: Gruppe[];
  /** Größe der Zeichenfläche */
  breite: number;
  hoehe: number;
}

/** Figur kommt bis zum Stand nur erwähnt vor (Erkennung) bzw. alle ihre Beziehungen sind unsicher. */
function nurErwaehnt(
  daten: ProjektDaten,
  index: Index,
  figur: Id,
  standIdx: number,
  eigenePaare: NetzPaarSicht[],
): boolean {
  const arten = index.erwaehnungen
    .filter((e) => e.zielTyp === 'figur' && e.ziel === figur && kapitelIndex(daten, e.kapitel) <= standIdx)
    .map((e) => e.art);
  if (arten.includes('auftritt')) return false;
  if (arten.some((a) => a === 'erwaehnt' || a === 'nachricht')) return true;
  return eigenePaare.length > 0 && eigenePaare.every((p) => p.eintrag.beziehung.unsicher);
}

function rechteckVon(f: Figur): Rechteck | null {
  return f.netz ? { x: f.netz.x, y: f.netz.y, breite: KARTE.breite, hoehe: KARTE.hoehe } : null;
}

const einWort = (s: string) => !/\s/.test(s.trim()) && s.trim().length > 0 && s.trim().length <= 24;

export function netzBerechnen(daten: ProjektDaten, index: Index, standIdx: number, filter: NetzFilter, statisten = false): NetzAnsicht {
  const t = texte();
  const tl = t.beziehungen.logik;
  // F-14: Statisten nur auf Wunsch
  const figuren = Object.values(daten.figuren).filter((f) => statisten || f.rolle !== 'statist');
  const sichtbar = new Set(figuren.filter((f) => figurSichtbar(daten, index, f.id, standIdx)).map((f) => f.id));

  // Paare am Stand
  const amStand: NetzPaarSicht[] = [];
  for (const paar of beziehungsPaare(daten)) {
    if (!sichtbar.has(paar.a) || !sichtbar.has(paar.b)) continue;
    const eintrag = aktuellerEintrag(daten, paar, standIdx);
    if (!eintrag) continue;
    const fa = daten.figuren[paar.a]!;
    const fb = daten.figuren[paar.b]!;
    const unsicher =
      !!eintrag.beziehung.unsicher ||
      fa.existenz !== 'gesichert' ||
      fb.existenz !== 'gesichert' ||
      istGeplant(index, fa.id) ||
      istGeplant(index, fb.id);
    const farben = eintragFarbe(daten, eintrag.beziehung);
    amStand.push({ paar, eintrag, farben, stil: { farbe: farben.farbe, gestrichelt: unsicher } });
  }
  const paare = amStand.filter((p) => filter[p.eintrag.beziehung.kategorie] !== false);

  // Filter blendet Figuren aus, deren Beziehungen alle gefiltert sind
  const ausgeblendet: Figur[] = [];
  const gezeigt = new Set<Id>();
  for (const id of sichtbar) {
    const alle = amStand.filter((p) => p.paar.a === id || p.paar.b === id);
    const bleiben = paare.filter((p) => p.paar.a === id || p.paar.b === id);
    if (alle.length > 0 && bleiben.length === 0) ausgeblendet.push(daten.figuren[id]!);
    else gezeigt.add(id);
  }

  // Zentrum = meiste Beziehungen (mind. 2)
  const grad = new Map<Id, number>();
  for (const p of paare) {
    grad.set(p.paar.a, (grad.get(p.paar.a) ?? 0) + 1);
    grad.set(p.paar.b, (grad.get(p.paar.b) ?? 0) + 1);
  }
  let zentrum: Id | null = null;
  for (const [id, g] of grad) {
    const bisher = zentrum ? grad.get(zentrum)! : 1;
    if (g > bisher || (g === bisher && zentrum && daten.figuren[id]?.rolle === 'haupt' && daten.figuren[zentrum]?.rolle !== 'haupt'))
      zentrum = id;
  }

  // Karten
  const karten: NetzKarte[] = [];
  const ohnePosition: Figur[] = [];
  const rechtecke = new Map<string, Rechteck>();
  for (const f of figuren) {
    if (!gezeigt.has(f.id)) continue;
    const r = rechteckVon(f);
    if (!r) {
      ohnePosition.push(f);
      continue;
    }
    const eigene = paare.filter((p) => p.paar.a === f.id || p.paar.b === f.id);
    const bevorzugt = eigene.find((p) => p.eintrag.von === f.id) ?? eigene[0];
    const gruppe = f.gruppe ? daten.gruppen[f.gruppe] : undefined;
    const farben = bevorzugt?.farben ?? (gruppe?.strang ? farbSatz(strangVon(daten, gruppe.strang)?.farbe) : farbSatz(null));
    const erst = index.erstesVorkommen[f.id];
    let variante: KartenVariante;
    let untertitel: string;
    if (f.id === zentrum) {
      variante = 'zentrum';
      untertitel = f.kurz ?? '';
    } else if (f.existenz !== 'gesichert') {
      variante = 'unsicher';
      untertitel = tl.existiertSie;
    } else if (!erst) {
      variante = 'geplant';
      untertitel = f.kurz ? fmt(tl.geplantMit, { kurz: f.kurz }) : tl.geplant;
    } else if (nurErwaehnt(daten, index, f.id, standIdx, eigene)) {
      variante = 'erwaehnt';
      untertitel = f.kurz ? fmt(tl.erwaehntMit, { kurz: f.kurz }) : tl.erwaehnt;
    } else {
      variante = 'normal';
      untertitel = f.kurz ?? kapLabel(daten, erst);
    }
    // A-06: Rolle in der Hauptgruppe ersetzt die Kurzbeschreibung bei gesicherten Figuren
    const rolle = gruppe?.rollen?.[f.id];
    if (rolle && (variante === 'normal' || variante === 'zentrum')) untertitel = rolle;
    karten.push({ figur: f, rechteck: r, variante, untertitel, farben });
    rechtecke.set(f.id, r);
  }

  // Gruppenflächen und Platzhalter
  const flaechen: NetzFlaeche[] = [];
  const platzhalter: NetzPlatzhalter[] = [];
  const gruppenOhneFlaeche: Gruppe[] = [];
  for (const g of Object.values(daten.gruppen)) {
    if (!g.netz) {
      gruppenOhneFlaeche.push(g);
      continue;
    }
    const farben = farbSatz(strangVon(daten, g.strang)?.farbe);
    const rechteck = { x: g.netz.x, y: g.netz.y, breite: g.netz.breite, hoehe: g.netz.hoehe };
    const innen = (r: Rechteck) => {
      const cx = r.x + r.breite / 2;
      const cy = r.y + r.hoehe / 2;
      return cx >= rechteck.x && cx <= rechteck.x + rechteck.breite && cy >= rechteck.y && cy <= rechteck.y + rechteck.hoehe;
    };
    const aussen = g.mitglieder
      .filter((m) => sichtbar.has(m) && daten.figuren[m] && !(rechtecke.has(m) && innen(rechtecke.get(m)!)))
      .map((m) => ({ id: m, name: daten.figuren[m]!.name }));
    flaechen.push({ gruppe: g, rechteck, farben, label: fmt(tl.flaecheLabel, { typ: t.beziehungen.gruppenTyp[g.typ], name: g.name }), aussen });
    // Platzhalter nur, wenn keine Mitgliedskarte in der Fläche liegt (Mitglieder anderer Hauptgruppen zählen nicht)
    const mitgliedSichtbar = g.mitglieder.some((m) => rechtecke.has(m) && innen(rechtecke.get(m)!));
    if (mitgliedSichtbar) continue;
    const spuren = g.spuren
      .filter((s) => s.status !== 'verworfen')
      .map((s) => ({ s, i: kapitelIndex(daten, s.kapitel) }))
      .filter(({ i }) => i >= 0 && i <= standIdx)
      .sort((x, y) => y.i - x.i || Number(einWort(y.s.text)) - Number(einWort(x.s.text)));
    const spur = spuren[0]?.s ?? null;
    const kandidat = !!spur && einWort(spur.text);
    platzhalter.push({
      gruppe: g,
      rechteck: { x: rechteck.x + 16, y: rechteck.y + 48, breite: KARTE.breite, hoehe: KARTE.hoehe },
      variante: kandidat ? 'kandidat' : 'leer',
      titel: kandidat ? fmt(tl.kandidatTitel, { text: spur!.text.trim() }) : tl.nochKeineFigur,
      untertitel: spur
        ? kandidat
          ? fmt(tl.kandidatUnter, { kap: kapLabel(daten, spur.kapitel) })
          : fmt(tl.spurUnter, { text: spur.text, kap: kapLabel(daten, spur.kapitel) })
        : '',
      spur,
      farben,
    });
  }

  // Linien
  const verbindungen: Verbindung[] = [];
  for (const p of paare) {
    const ra = rechtecke.get(p.paar.a);
    const rb = rechtecke.get(p.paar.b);
    if (!ra || !rb) continue;
    const e = p.eintrag;
    verbindungen.push({
      id: p.paar.schluessel,
      a: p.paar.a,
      b: p.paar.b,
      ra,
      rb,
      // Beschriftung an der Karte, an der die Beziehung steht („von“)
      bevorzugtAst: e.von,
      stil: p.stil,
      label: e.beziehung.art.trim() || tl.ohneBezeichnung,
      leer: !e.beziehung.art.trim(),
      labelFarbe: p.farben.dunkel,
    });
  }
  const zr = zentrum ? rechtecke.get(zentrum) : undefined;
  for (const ph of platzhalter) {
    if (ph.variante !== 'kandidat' || !zentrum || !zr) continue;
    verbindungen.push({
      id: `spur:${ph.gruppe.id}`,
      a: `spur:${ph.gruppe.id}`,
      b: zentrum,
      ra: ph.rechteck,
      rb: zr,
      bevorzugtAst: `spur:${ph.gruppe.id}`,
      stil: { farbe: ph.farben.farbe, gestrichelt: true },
      label: tl.kontakt,
      leer: false,
      labelFarbe: ph.farben.dunkel,
    });
  }
  const linien = linienFuehren(verbindungen, grad);

  let breite = 0;
  let hoehe = 0;
  for (const r of [...rechtecke.values(), ...flaechen.map((f) => f.rechteck)]) {
    breite = Math.max(breite, r.x + r.breite);
    hoehe = Math.max(hoehe, r.y + r.hoehe);
  }

  return {
    standIdx,
    karten,
    flaechen,
    platzhalter,
    linien,
    paare,
    zentrum,
    ausgeblendet,
    ohnePosition,
    gruppenOhneFlaeche,
    breite: breite + 24,
    hoehe: hoehe + 24,
  };
}

// ---------------------------------------------------------------------------
// Linienführung: gleiche Zeile → gerade Linie; sonst Stamm am Knoten, Sammelschiene, Ast zur Karte
// ---------------------------------------------------------------------------

interface Verbindung {
  id: string;
  a: string;
  b: string;
  ra: Rechteck;
  rb: Rechteck;
  bevorzugtAst: string;
  stil: LinienStil;
  label: string;
  leer: boolean;
  labelFarbe: string;
}

const mitteX = (r: Rechteck) => r.x + r.breite / 2;
const mitteY = (r: Rechteck) => r.y + r.hoehe / 2;

export function linienFuehren(verbindungen: Verbindung[], grad: Map<string, number>): NetzLinie[] {
  const linien: NetzLinie[] = [];
  const buendel = new Map<string, { knoten: Rechteck; oben: boolean; aeste: { v: Verbindung; ast: Rechteck }[] }>();

  for (const v of verbindungen) {
    const { ra, rb } = v;
    const zeileGleich = ra.y < rb.y + rb.hoehe && rb.y < ra.y + ra.hoehe;
    if (zeileGleich) {
      const [l, r] = mitteX(ra) <= mitteX(rb) ? [ra, rb] : [rb, ra];
      const y = Math.round((Math.max(ra.y, rb.y) + Math.min(ra.y + ra.hoehe, rb.y + rb.hoehe)) / 2);
      const x1 = l.x + l.breite;
      const x2 = r.x;
      const seg = x2 > x1 ? { x1, y1: y, x2, y2: y } : { x1: mitteX(l), y1: mitteY(l), x2: mitteX(r), y2: mitteY(r) };
      linien.push({
        id: v.id,
        segmente: [{ ...seg, ...v.stil }],
        weg: [seg],
        label: { text: v.label, x: Math.round((seg.x1 + seg.x2) / 2), y: y - 28, zentriert: true, farbe: v.labelFarbe, leer: v.leer },
      });
      continue;
    }
    // Knoten = Karte mit mehr Beziehungen; Beschriftung am Ast
    const ga = grad.get(v.a) ?? 0;
    const gb = grad.get(v.b) ?? 0;
    const knotenIstA = ga !== gb ? ga > gb : v.bevorzugtAst === v.b;
    const knoten = knotenIstA ? ra : rb;
    const ast = knotenIstA ? rb : ra;
    const oben = ast.y + ast.hoehe <= knoten.y;
    const schluessel = `${knotenIstA ? v.a : v.b}|${oben ? 'o' : 'u'}`;
    let b = buendel.get(schluessel);
    if (!b) {
      b = { knoten, oben, aeste: [] };
      buendel.set(schluessel, b);
    }
    b.aeste.push({ v, ast });
  }

  for (const { knoten, oben, aeste } of buendel.values()) {
    const kante = oben ? knoten.y : knoten.y + knoten.hoehe;
    const naechste = oben ? Math.max(...aeste.map((a) => a.ast.y + a.ast.hoehe)) : Math.min(...aeste.map((a) => a.ast.y));
    const abstand = Math.abs(kante - naechste);
    const stamm = Math.max(0, Math.floor((abstand - 1) / 2));
    const y = oben ? kante - stamm : kante + stamm;
    const kx = Math.round(mitteX(knoten));

    // Stamm und Schiene in der häufigsten durchgezogenen Farbe
    const zaehler = new Map<string, number>();
    for (const { v } of aeste) if (!v.stil.gestrichelt) zaehler.set(v.stil.farbe, (zaehler.get(v.stil.farbe) ?? 0) + 1);
    const haupt = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0];
    const schienenStil: LinienStil = haupt ? { farbe: haupt[0], gestrichelt: false } : aeste[0]!.v.stil;
    const xs = [kx, ...aeste.map((a) => Math.round(mitteX(a.ast)))];
    const stammSeg = { x1: kx, y1: kante, x2: kx, y2: y };
    const schiene = { x1: Math.min(...xs), y1: y, x2: Math.max(...xs), y2: y };

    aeste.forEach(({ v, ast }, i) => {
      const ax = Math.round(mitteX(ast));
      const astKante = oben ? ast.y + ast.hoehe : ast.y;
      const astSeg = { x1: ax, y1: y, x2: ax, y2: astKante };
      const segmente: NetzLinie['segmente'] = [{ ...astSeg, ...v.stil }];
      if (i === 0) {
        if (stamm > 0) segmente.unshift({ ...stammSeg, ...schienenStil });
        if (schiene.x2 > schiene.x1) segmente.unshift({ ...schiene, ...schienenStil });
      }
      const mitte = (Math.min(y, astKante) + Math.max(y, astKante)) / 2;
      linien.push({
        id: v.id,
        segmente,
        weg: [astSeg, { x1: ax, y1: y, x2: kx, y2: y }, stammSeg],
        label: { text: v.label, x: ax + 12, y: Math.floor(mitte - 8), zentriert: false, farbe: v.labelFarbe, leer: v.leer },
      });
    });
  }
  return linien;
}

// ---------------------------------------------------------------------------
// Belege aus dem Text (Inspektor einer Beziehung)
// ---------------------------------------------------------------------------

export interface Beleg {
  kapitel: Id;
  /** Satz um die Stelle */
  text: string;
  anker: TextAnker;
}

/** Stelle einer Erwähnung im Klartext: Offsets aus dem Index, sonst nächster Treffer des Wortlauts. */
function stelleDerErwaehnung(kt: string, e: Erwaehnung): { start: number; ende: number } | null {
  if (kt.slice(e.start, e.ende) === e.treffer) return { start: e.start, ende: e.ende };
  const treffer = findeZitat(kt, e.treffer);
  if (treffer.length === 0) return null;
  return treffer.reduce((a, b) => (Math.abs(b.start - e.start) < Math.abs(a.start - e.start) ? b : a));
}

/**
 * Kapitel, in denen beide Figuren vorkommen (Erkennung; eine Figur darf auch nur im Kapitelplan
 * stehen, z. B. der Ich-Erzähler), mit Ausschnitt um die Erwähnung der selteneren Figur.
 */
export function belege(daten: ProjektDaten, index: Index, a: Id, b: Id): Beleg[] {
  const proKapitel = (f: Id) => {
    const m = new Map<Id, Erwaehnung[]>();
    for (const e of index.erwaehnungen)
      if (e.zielTyp === 'figur' && e.ziel === f) m.set(e.kapitel, [...(m.get(e.kapitel) ?? []), e]);
    return m;
  };
  const ea = proKapitel(a);
  const eb = proKapitel(b);
  const ergebnis: Beleg[] = [];
  for (const k of daten.projekt.kapitel) {
    const la = ea.get(k) ?? [];
    const lb = eb.get(k) ?? [];
    const plan = daten.plaene[k]?.figuren ?? [];
    const beide =
      (la.length > 0 && lb.length > 0) || (la.length > 0 && plan.includes(b)) || (lb.length > 0 && plan.includes(a));
    if (!beide) continue;
    const md = daten.kapitel[k]?.text;
    if (!md) continue;
    const absaetzeB = new Set(lb.map((e) => e.absatz));
    const gemeinsam = la.find((e) => absaetzeB.has(e.absatz));
    const selten = la.length > 0 && (lb.length === 0 || la.length <= lb.length) ? la[0] : lb[0];
    const e = gemeinsam ?? selten;
    if (!e) continue;
    const kt = klartext(md);
    const s = stelleDerErwaehnung(kt, e);
    if (!s) continue;
    ergebnis.push({ kapitel: k, text: ausschnitt(kt, s.start, s.ende), anker: ankerErzeugen(k, kt, s.start, s.ende) });
  }
  return ergebnis;
}

/** Was der Leser bis zum Stand über eine Figur weiß (Kurzfassungen der Kapitel mit Vorkommen). */
export function figurBisher(daten: ProjektDaten, index: Index, figur: Id, standIdx: number): string {
  const tl = texte().beziehungen.logik;
  if (!figurSichtbar(daten, index, figur, standIdx) || istGeplant(index, figur)) {
    return istGeplant(index, figur) && standIdx >= daten.projekt.kapitel.length - 1 ? tl.nurGeplant : tl.nichtEingefuehrt;
  }
  const kapitel = [
    ...new Set(
      index.erwaehnungen
        .filter((e) => e.zielTyp === 'figur' && e.ziel === figur && kapitelIndex(daten, e.kapitel) <= standIdx)
        .map((e) => e.kapitel),
    ),
  ].sort((x, y) => kapitelIndex(daten, x) - kapitelIndex(daten, y));
  if (kapitel.length === 0) return '';
  const teile = kapitel.map((k) => {
    const kurz = daten.analysen[k]?.kurz?.trim();
    return kurz ? fmt(tl.bisherKurz, { kap: kapLabel(daten, k), kurz }) : fmt(tl.bisherKommtVor, { kap: kapLabel(daten, k) });
  });
  return teile.join(' ');
}

/** Freie Position für eine neue Karte (Raster, keine Überlappung). */
export function freiePosition(belegt: Rechteck[], breite: number, hoehe: number, maxBreite: number): { x: number; y: number } {
  const passt = (x: number, y: number) =>
    belegt.every((r) => x + breite + 12 <= r.x || r.x + r.breite + 12 <= x || y + hoehe + 12 <= r.y || r.y + r.hoehe + 12 <= y);
  const spalten = Math.max(1, Math.floor((maxBreite - 24) / 20));
  for (let y = 24; y < 4000; y += 20)
    for (let i = 0; i < spalten; i++) {
      const x = 24 + i * 20;
      if (x + breite > maxBreite - 8) break;
      if (passt(x, y)) return { x, y };
    }
  return { x: 24, y: 24 };
}
