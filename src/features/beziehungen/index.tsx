/** Bereich „Beziehungen“ (B-01–B-04, A-01, A-02) nach docs/design/screens/Beziehungen.dc.html. */
import { useEffect, useMemo, useRef } from 'react';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { f, texte, useI18n, useTexte } from '../../i18n';
import { Button, Chip, LeerZustand, Segment } from '../../ui';
import { KATEGORIEN, kategorieFarbe, kapitelTitel } from './gemeinsam';
import { aktStufen, freiePosition, KARTE, netzBerechnen, standIndex, standNotiz, STANDARD_FLAECHE } from './logik';
import { Netz } from './Netz';
import { NetzInspektor } from './NetzInspektor';
import { useOffeneVorschlaege, VorschlagDialog, VorschlaegePanel } from './Vorschlaege';
import './beziehungen.css';
import { NurMit } from '../../app/NurMit';
import { useFunktion } from '../../state/funktionen';

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const stand = useStore((s) => s.netzStand);
  const filter = useStore((s) => s.netzFilter);
  const verbinden = useStore((s) => s.netzVerbinden);
  const globaleFigur = useStore((s) => s.auswahl.figur);
  const globaleGruppe = useStore((s) => s.auswahl.gruppe);
  const setzeNetzStand = useStore((s) => s.setzeNetzStand);
  const umschalteNetzFilter = useStore((s) => s.umschalteNetzFilter);
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const figurImNetzSetzen = useStore((s) => s.figurImNetzSetzen);
  const gruppeImNetzSetzen = useStore((s) => s.gruppeImNetzSetzen);
  const vorschlagPanel = useStore((s) => s.vorschlagPanel);
  const vorschlagLaeuft = useStore((s) => s.vorschlagLaeuft);
  const oeffneVorschlaege = useStore((s) => s.oeffneVorschlaege);
  const offeneVorschlaege = useOffeneVorschlaege();
  const mitKi = useFunktion('kiErkennung');
  const netzAuswahl = useStore((s) => s.netzAuswahl);
  const schliesseVorschlagsPanel = useStore((s) => s.schliesseVorschlagsPanel);
  const flaeche = useRef<HTMLDivElement>(null);
  const { t, sprache } = useI18n();
  const ta = t.beziehungen.ansicht;

  // Auswahl im Netz (Karte, Linie, Fläche) zeigt wieder den Inspektor statt der Vorschläge –
  // nicht aber die Übernahme der Auswahl aus anderen Bereichen (unten)
  const vorigeAuswahl = useRef(netzAuswahl);
  const auswahlUebernommen = useRef(false);
  useEffect(() => {
    if (netzAuswahl && netzAuswahl !== vorigeAuswahl.current && !auswahlUebernommen.current) schliesseVorschlagsPanel();
    auswahlUebernommen.current = false;
    vorigeAuswahl.current = netzAuswahl;
  }, [netzAuswahl, schliesseVorschlagsPanel]);

  // Auswahl aus anderen Bereichen übernehmen (z. B. „Netz öffnen“ auf der Figurenkarte)
  useEffect(() => {
    const a = useStore.getState().netzAuswahl;
    if (globaleFigur && (!a || (a.typ === 'figur' && a.id !== globaleFigur))) {
      auswahlUebernommen.current = true;
      waehleImNetz({ typ: 'figur', id: globaleFigur });
    }
  }, [globaleFigur, waehleImNetz]);
  useEffect(() => {
    const a = useStore.getState().netzAuswahl;
    if (globaleGruppe && (!a || (a.typ === 'gruppe' && a.id !== globaleGruppe))) {
      auswahlUebernommen.current = true;
      waehleImNetz({ typ: 'gruppe', id: globaleGruppe });
    }
  }, [globaleGruppe, waehleImNetz]);

  const standIdx = daten ? standIndex(daten, stand) : 0;
  // Beschriftungen aus logik.ts folgen der Oberflächensprache: beim Umschalten neu berechnen
  const stufen = useMemo(() => (daten ? aktStufen(daten) : []), [daten, sprache]);
  const ansicht = useMemo(
    () => (daten ? netzBerechnen(daten, index, standIdx, filter) : null),
    [daten, index, standIdx, filter, sprache],
  );
  if (!daten || !ansicht) return null;

  const anzahl = daten.projekt.kapitel.length;
  // Panel mit KI-Vorschlägen: auf Wunsch (auch während eines Laufs) und immer, solange es ohne Figuren Offenes gibt
  const ohneFiguren = Object.keys(daten.figuren).length === 0;
  const panel = vorschlagPanel || (ohneFiguren && offeneVorschlaege.anzahl > 0);
  const mitText = daten.projekt.kapitel.some((id) => daten.kapitel[id]?.text.trim());
  if (anzahl === 0 || ohneFiguren)
    return (
      <div className="pw-bz">
        <LeerZustand
          titel={ta.titel}
          aktionen={
            mitKi && anzahl > 0 && mitText && offeneVorschlaege.anzahl === 0 ? (
              <Button variante="primaer" onClick={() => oeffneVorschlaege({ dialog: true })} disabled={vorschlagLaeuft}>
                {ta.vorschlagen}
              </Button>
            ) : undefined
          }
        >
          {anzahl === 0
            ? ta.keineKapitel
            : offeneVorschlaege.anzahl > 0
              ? f(ta.leerMitVorschlaegen, { n: offeneVorschlaege.anzahl })
              : mitText
              ? ta.leerMitText
              : ta.leerOhneText}
        </LeerZustand>
        {panel && <VorschlaegePanel daten={daten} />}
        <VorschlagDialog />
      </div>
    );

  const aktiveStufe = stufen.find((s) => s.bisIndex === standIdx);
  const standKapitel = daten.projekt.kapitel[standIdx]!;

  const platzieren = (art: 'figur' | 'gruppe', id: string) => {
    const breite = Math.max(400, (flaeche.current?.clientWidth ?? 880) - 8);
    const belegt = [...ansicht.karten.map((k) => k.rechteck), ...ansicht.flaechen.map((f) => f.rechteck), ...ansicht.platzhalter.map((p) => p.rechteck)];
    if (art === 'figur') {
      const pos = freiePosition(belegt, KARTE.breite, KARTE.hoehe, breite);
      void figurImNetzSetzen(id, pos).then(() => waehleImNetz({ typ: 'figur', id }));
    } else {
      const pos = freiePosition(belegt, STANDARD_FLAECHE.breite, STANDARD_FLAECHE.hoehe, breite);
      void gruppeImNetzSetzen(id, { ...pos, ...STANDARD_FLAECHE }).then(() => waehleImNetz({ typ: 'gruppe', id }));
    }
  };

  const ablage = [
    ...ansicht.ohnePosition.map((f) => ({ art: 'figur' as const, id: f.id, name: f.name })),
    ...ansicht.gruppenOhneFlaeche.map((g) => ({ art: 'gruppe' as const, id: g.id, name: g.name })),
  ];

  return (
    <div className="pw-bz">
      <div className="pw-bz-haupt">
        <div className="pw-bz-kopf">
          <div className="pw-bz-kopf__titel">
            <h1>{ta.titel}</h1>
            <span className="pw-bz-kopf__notiz">{standNotiz(standIdx)}</span>
          </div>
          {stufen.length > 0 && (
            <Segment
              rolle="group"
              label={ta.standDerGeschichte}
              groesse="gross"
              hintergrund="selected"
              voll={false}
              wert={aktiveStufe ? String(aktiveStufe.akt) : ''}
              onChange={(w) => setzeNetzStand(stufen.find((s) => String(s.akt) === w)?.bisKapitel ?? null)}
              optionen={stufen.map((s) => ({ wert: String(s.akt), label: s.label }))}
            />
          )}
        </div>

        <div className="pw-bz-flaeche" ref={flaeche}>
          <Netz daten={daten} index={index} ansicht={ansicht} standIdx={standIdx} filter={filter} />
        </div>

        <div className="pw-bz-leiste">
          <label className="pw-bz-regler">
            <span>{ta.kapitel}</span>
            <input
              type="range"
              min={1}
              max={anzahl}
              step={1}
              value={standIdx + 1}
              aria-valuetext={kapitelTitel(daten, standKapitel)}
              onChange={(e) => setzeNetzStand(daten.projekt.kapitel[Number(e.target.value) - 1] ?? null)}
            />
            <output>{kapitelTitel(daten, standKapitel)}</output>
          </label>
          <div className="pw-bz-filter" role="group" aria-label={ta.filter}>
            <span>{ta.filter}</span>
            {KATEGORIEN.map((k) => (
              <Chip key={k} variante="knopf" punkt={kategorieFarbe(k).farbe} aktiv={filter[k]} onClick={() => umschalteNetzFilter(k)}>
                {t.beziehungen.kategorie[k]}
              </Chip>
            ))}
          </div>
          {ablage.length > 0 && (
            <div className="pw-bz-ablage">
              <span>{ta.nichtImNetz}</span>
              {ablage.map((a) => (
                <Chip key={`${a.art}-${a.id}`} variante="gestrichelt" onClick={() => platzieren(a.art, a.id)} title={ta.insNetzLegen}>
                  + {a.name}
                </Chip>
              ))}
            </div>
          )}
          {verbinden && <span className="pw-bz-hinweis">{ta.verbindenHinweis}</span>}
          {!panel && offeneVorschlaege.anzahl > 0 && (
            <button type="button" className="pw-vs-chip" onClick={() => oeffneVorschlaege()} title={ta.vorschlaegeAnsehen}>
              {f(ta.vorschlaegeChip, { n: offeneVorschlaege.anzahl })}
            </button>
          )}
        </div>
      </div>
      {panel ? <VorschlaegePanel daten={daten} /> : <NetzInspektor daten={daten} index={index} ansicht={ansicht} standIdx={standIdx} />}
      <VorschlagDialog />
    </div>
  );
}

export function Titelaktionen() {
  const verbinden = useStore((s) => s.netzVerbinden);
  const setzeNetzVerbinden = useStore((s) => s.setzeNetzVerbinden);
  const bereit = useStore((s) => !!s.daten);
  const mitText = useStore((s) => !!s.daten && s.daten.projekt.kapitel.some((id) => s.daten!.kapitel[id]?.text.trim()));
  const laeuft = useStore((s) => s.vorschlagLaeuft);
  const oeffneVorschlaege = useStore((s) => s.oeffneVorschlaege);
  const ta = useTexte().beziehungen.ansicht;
  return (
    <>
      <NurMit funktion="kiErkennung">
        <Button disabled={!bereit || !mitText} onClick={() => oeffneVorschlaege({ dialog: true })} title={ta.vorschlagenTitel}>
          {laeuft ? ta.kiLiest : ta.beziehungenVorschlagen}
        </Button>
      </NurMit>
      <Button variante="primaer" aria-pressed={verbinden} disabled={!bereit} onClick={() => setzeNetzVerbinden(!verbinden)}>
        {verbinden ? ta.verbindenBeenden : ta.plusBeziehung}
      </Button>
    </>
  );
}

export function kontext(state: Store): string {
  void state;
  return texte().beziehungen.ansicht.kontext;
}
