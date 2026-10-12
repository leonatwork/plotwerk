/**
 * Zwei Figuren zusammenführen (z. B. „Henrik“ und „der Alte“, die sich als dieselbe Person herausstellen).
 * Reine Funktion: liefert neue ProjektDaten; unveränderte Teile behalten ihre Referenz, damit der Store nur die
 * geänderten Dateien schreibt.
 *
 * Die bleibende Figur behält ID, Namen und Gewissheit. Von der aufgegebenen übernimmt sie Namen (als Aliase),
 * Formen, Beziehungen, Planfelder, Notizen, „Wahrheit“ und, wo bei ihr leer, Kurzbeschreibung, Gruppe und
 * Netzposition. Alle Verweise im Projekt (Beziehungen anderer Figuren, Gruppen, Kapitelpläne und Szenen,
 * Zeitleiste, Bögen, Anmerkungen, Recherche, Entscheidungen, KI-Ablagen, `[[figur:…]]`-Links in Notizen und
 * Planfeldern) zeigen danach auf die bleibende Figur.
 */
import type { Beziehung, Figur, Figurenbogen, Id, KiAblage, ProjektDaten, Verweis, VorschlagsVerweis } from '../model/types';

const vergleichsform = (s: string) => s.trim().toLocaleLowerCase('de');

function eindeutig<T>(liste: T[], schluessel: (x: T) => string = String): T[] {
  const gesehen = new Set<string>();
  return liste.filter((x) => {
    const k = schluessel(x);
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

/** Ersetzt `aus` durch `nach` in einer ID-Liste; gleiche Referenz, wenn `aus` nicht vorkommt. */
function idsErsetzen(ids: Id[], aus: Id, nach: Id): Id[] {
  if (!ids.includes(aus)) return ids;
  return eindeutig(ids.map((i) => (i === aus ? nach : i)));
}

/** Zwei Freitexte verbinden (leere fallen weg, gleiche nur einmal). */
function textVerbinden(a: string | undefined, b: string | undefined): string {
  const teile = eindeutig([a ?? '', b ?? ''].map((t) => t.trim()).filter(Boolean));
  return teile.join('\n\n');
}

const beziehungsSchluessel = (b: Beziehung) => `${b.zu}|${vergleichsform(b.art)}|${b.abKapitel ?? ''}`;

/** Beziehungen auf `nach` umbiegen; Beziehungen zu sich selbst fallen weg, doppelte nur einmal. */
function beziehungenUmbiegen(liste: Beziehung[], eigene: Id, aus: Id, nach: Id): Beziehung[] {
  if (!liste.some((b) => b.zu === aus)) return liste;
  return eindeutig(
    liste.map((b) => (b.zu === aus ? { ...b, zu: nach } : b)).filter((b) => b.zu !== eigene),
    beziehungsSchluessel,
  );
}

/** `[[figur:aus|…]]` → `[[figur:nach|…]]` in allen Zeichenketten eines Werts (gleiche Referenz ohne Treffer). */
function linksErsetzen<T>(wert: T, aus: Id, nach: Id): T {
  const muster = new RegExp(`\\[\\[figur:\\s*${aus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?=[|\\]])`, 'g');
  const ersetzt = `[[figur:${nach}`;
  const gehe = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes('[[figur:') ? v.replace(muster, ersetzt) : v;
    if (Array.isArray(v)) {
      const neu = v.map(gehe);
      return neu.some((x, i) => x !== v[i]) ? neu : v;
    }
    if (v && typeof v === 'object') {
      let geaendert = false;
      const neu: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        neu[k] = gehe(x);
        if (neu[k] !== x) geaendert = true;
      }
      return geaendert ? neu : v;
    }
    return v;
  };
  return gehe(wert) as T;
}

function verweisErsetzen<V extends Verweis | null | undefined>(v: V, aus: Id, nach: Id): V {
  return v && v.typ === 'figur' && v.id === aus ? ({ ...v, id: nach } as V) : v;
}

/** Die zusammengeführte Figur (ohne Verweise anderer Dateien). */
export function zusammengefuehrteFigur(a: Figur, b: Figur): Figur {
  const vergeben = new Set([vergleichsform(a.name)]);
  const aliase = [...a.aliase, b.name, ...b.aliase].filter((n) => {
    const k = vergleichsform(n);
    if (!k || vergeben.has(k)) return false;
    vergeben.add(k);
    return true;
  });
  const formen = eindeutig([...(a.formen ?? []), ...(b.formen ?? [])], vergleichsform);
  const plan: Record<string, string> = { ...a.plan };
  for (const [feld, wert] of Object.entries(b.plan)) plan[feld] = feld in plan ? textVerbinden(plan[feld], wert) : wert;
  const beziehungen = eindeutig(
    [...a.beziehungen, ...b.beziehungen]
      .map((x) => (x.zu === b.id ? { ...x, zu: a.id } : x))
      .filter((x) => x.zu !== a.id),
    beziehungsSchluessel,
  );
  const neu: Figur = {
    ...a,
    aliase,
    rolle: a.rolle === 'haupt' || b.rolle === 'haupt' ? 'haupt' : a.rolle,
    gruppe: a.gruppe ?? b.gruppe,
    beziehungen,
    plan,
    wahrheit: textVerbinden(a.wahrheit, b.wahrheit),
    notizen: textVerbinden(a.notizen, b.notizen),
  };
  const kontexte = eindeutig([...(a.spitznamen ?? []), ...(b.spitznamen ?? [])], (k) => vergleichsform(k.name));
  if (kontexte.length) neu.spitznamen = kontexte;
  if (formen.length) neu.formen = formen;
  else delete neu.formen;
  const kurz = a.kurz?.trim() || b.kurz?.trim();
  if (kurz) neu.kurz = kurz;
  const netz = a.netz ?? b.netz;
  if (netz) neu.netz = netz;
  return neu;
}

function boegenZusammenfuehren(boegen: Figurenbogen[], aus: Id, nach: Id): Figurenbogen[] {
  const alt = boegen.find((b) => b.figur === aus);
  if (!alt) return boegen;
  const ziel = boegen.find((b) => b.figur === nach);
  if (!ziel) return boegen.map((b) => (b === alt ? { ...b, figur: nach } : b));
  return boegen.filter((b) => b !== alt).map((b) => (b === ziel ? { ...b, stufen: [...b.stufen, ...alt.stufen] } : b));
}

/**
 * Führt die Figur `aufgeben` in `behalten` zusammen. Unbekannte IDs oder dieselbe ID → Daten unverändert.
 */
export function figurenZusammenfuehren(daten: ProjektDaten, behalten: Id, aufgeben: Id): ProjektDaten {
  const a = daten.figuren[behalten];
  const b = daten.figuren[aufgeben];
  if (!a || !b || behalten === aufgeben) return daten;
  const aus = aufgeben;
  const nach = behalten;

  const figuren: Record<Id, Figur> = {};
  for (const f of Object.values(daten.figuren)) {
    if (f.id === aus) continue;
    figuren[f.id] = f.id === nach ? zusammengefuehrteFigur(a, b) : { ...f, beziehungen: beziehungenUmbiegen(f.beziehungen, f.id, aus, nach) };
    if (f.id !== nach && figuren[f.id]!.beziehungen === f.beziehungen) figuren[f.id] = f;
  }

  const gruppen = Object.fromEntries(
    Object.entries(daten.gruppen).map(([id, g]) => {
      const mitglieder = idsErsetzen(g.mitglieder, aus, nach);
      let rollen = g.rollen;
      if (rollen && aus in rollen) {
        const { [aus]: alt, ...rest } = rollen;
        rollen = { ...rest, ...(rest[nach] ? {} : { [nach]: alt! }) };
      }
      return [id, mitglieder === g.mitglieder && rollen === g.rollen ? g : { ...g, mitglieder, ...(rollen ? { rollen } : {}) }];
    }),
  );

  const plaene = Object.fromEntries(
    Object.entries(daten.plaene).map(([id, p]) => {
      const pf = idsErsetzen(p.figuren, aus, nach);
      const szenen = p.szenen?.map((s) => {
        const sf = idsErsetzen(s.figuren, aus, nach);
        return sf === s.figuren ? s : { ...s, figuren: sf };
      });
      const szenenGeaendert = !!szenen && szenen.some((s, i) => s !== p.szenen![i]);
      if (pf === p.figuren && !szenenGeaendert) return [id, p];
      return [id, { ...p, figuren: pf, ...(szenenGeaendert ? { szenen } : {}) }];
    }),
  );

  const anmerkungen = daten.anmerkungen.some((x) => x.ziel?.typ === 'figur' && x.ziel.id === aus)
    ? daten.anmerkungen.map((x) => ({ ...x, ziel: verweisErsetzen(x.ziel, aus, nach) }))
    : daten.anmerkungen;

  const e = daten.entscheidungen;
  const betrifft = (v: Verweis | null | undefined) => v?.typ === 'figur' && v.id === aus;
  const entscheidungen =
    e.schreibweisen.some((s) => betrifft(s.ziel)) || e.zuordnungen.some((z) => betrifft(z.ziel))
      ? {
          ...e,
          schreibweisen: e.schreibweisen.map((s) => (betrifft(s.ziel) ? { ...s, ziel: verweisErsetzen(s.ziel, aus, nach) } : s)),
          zuordnungen: e.zuordnungen.map((z) => (betrifft(z.ziel) ? { ...z, ziel: verweisErsetzen(z.ziel, aus, nach) } : z)),
        }
      : e;

  const kiHinweise = daten.kiHinweise.some((h) => h.plan?.figur === aus)
    ? daten.kiHinweise.map((h) => (h.plan?.figur === aus ? { ...h, plan: { ...h.plan, figur: nach } } : h))
    : daten.kiHinweise;

  let kiVorschlaege = daten.kiVorschlaege;
  if (kiVorschlaege) {
    const v = kiVorschlaege;
    const ref = (r: VorschlagsVerweis): VorschlagsVerweis => (r.typ === 'angelegt' && r.id === aus ? { ...r, id: nach, name: a.name } : r);
    const betroffen =
      v.figuren.some((f) => f.figur === aus) || v.beziehungen.some((x) => [x.von, x.zu].some((r) => r.typ === 'angelegt' && r.id === aus));
    if (betroffen)
      kiVorschlaege = {
        ...v,
        figuren: v.figuren.map((f) => (f.figur === aus ? { ...f, figur: nach } : f)),
        beziehungen: v.beziehungen.map((x) => ({ ...x, von: ref(x.von), zu: ref(x.zu) })),
      };
  }

  let zeitleiste = daten.zeitleiste;
  if (zeitleiste?.zustaende.some((z) => z.figur === aus)) {
    // ein Zustand pro Figur und Kapitel/Szene: bei Überschneidung gilt der der bleibenden Figur
    const belegt = new Set(zeitleiste.zustaende.filter((z) => z.figur === nach).map((z) => `${z.kapitel}#${z.szene ?? ''}`));
    zeitleiste = {
      ...zeitleiste,
      zustaende: zeitleiste.zustaende
        .filter((z) => z.figur !== aus || !belegt.has(`${z.kapitel}#${z.szene ?? ''}`))
        .map((z) => (z.figur === aus ? { ...z, figur: nach } : z)),
    };
  }

  const boegen = daten.boegen ? boegenZusammenfuehren(daten.boegen, aus, nach) : daten.boegen;

  const recherche =
    daten.recherche && daten.recherche.eintraege.some((r) => r.verweise.some(betrifft))
      ? {
          ...daten.recherche,
          eintraege: daten.recherche.eintraege.map((r) =>
            r.verweise.some(betrifft)
              ? { ...r, verweise: eindeutig(r.verweise.map((x) => verweisErsetzen(x, aus, nach)), (x) => `${x.typ}:${x.id}`) }
              : r,
          ),
        }
      : daten.recherche;

  const ablage = <T extends { figur: Id }>(x: KiAblage<T> | undefined): KiAblage<T> | undefined =>
    x && x.eintraege.some((y) => y.figur === aus) ? { ...x, eintraege: x.eintraege.map((y) => (y.figur === aus ? { ...y, figur: nach } : y)) } : x;

  const ergebnis: ProjektDaten = {
    ...daten,
    figuren,
    gruppen,
    plaene,
    anmerkungen,
    entscheidungen,
    kiHinweise,
    ...(kiVorschlaege ? { kiVorschlaege } : {}),
    ...(zeitleiste ? { zeitleiste } : {}),
    ...(boegen ? { boegen } : {}),
    ...(recherche ? { recherche } : {}),
    ...(daten.kiZustandVorschlaege ? { kiZustandVorschlaege: ablage(daten.kiZustandVorschlaege) } : {}),
    ...(daten.kiStimmen ? { kiStimmen: ablage(daten.kiStimmen) } : {}),
  };

  // `[[figur:…]]`-Links in Notizen und Planfeldern (nicht im Manuskript, S-07)
  const { kapitel, ...rest } = ergebnis;
  return { ...linksErsetzen(rest, aus, nach), kapitel };
}
