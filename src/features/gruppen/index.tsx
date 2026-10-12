/**
 * Antagonisten/Gruppen (A-01, A-02). Öffentliche API für andere Bereiche:
 *   <GruppenKarte gruppe={id} kompakt? aktiv? onClick? />   Karte mit Typ, Mitgliedern, Präsenzstreifen
 *   <PraesenzStreifen gruppe={id} kompakt? />               Präsenz pro Kapitel (klickbar → Stelle im Text)
 *   <GruppenInspektor gruppe={id} onFigur? />                Inspektor-Inhalt zum Bearbeiten
 *   praesenzProKapitel / praesenzProAkt / spurPruefen        reine Funktionen
 * Aktionen im Store (Slice „netz“): gruppeAendern, mitgliedHinzufuegen/-Entfernen, spurStatusSetzen, spurHinzufuegen.
 */
import { useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { LeerZustand } from '../../ui';
import { GruppenKarte } from './Gruppen';

export { GruppenInspektor, GruppenKarte, PraesenzStreifen, type GruppenInspektorProps, type GruppenKarteProps } from './Gruppen';
export { praesenzProAkt, praesenzProKapitel, spurPruefen, type AktPraesenz, type KapitelPraesenz, type SpurPruefung } from './logik';

/** Übersicht aller Gruppen; Klick öffnet die Gruppe im Beziehungsnetz. */
export default function GruppenAnsicht() {
  const gruppen = useStore((s) => s.daten?.gruppen);
  const oeffne = useStore((s) => s.oeffne);
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const liste = Object.values(gruppen ?? {});
  const t = useTexte().gruppen;
  if (liste.length === 0) return <LeerZustand titel={t.leerTitel}>{t.leerText}</LeerZustand>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {liste.map((g) => (
        <GruppenKarte
          key={g.id}
          gruppe={g.id}
          onClick={() => {
            oeffne('beziehungen', { gruppe: g.id });
            waehleImNetz({ typ: 'gruppe', id: g.id });
          }}
        />
      ))}
    </div>
  );
}
