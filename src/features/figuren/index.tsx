/** Bereich „Figuren“ (F-01–F-06) nach docs/design/screens/Figur.dc.html. Besitzer: Planung. */
import { useEffect, useState } from 'react';
import { f, texte, useTexte, vergleich } from '../../i18n';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, Segment } from '../../ui';
import { FigurenBoegen } from './Boegen';
import { Besetzung } from './Besetzung';
import { Figurenkarte } from './Figurenkarte';
import { FigurenListe } from './Liste';
import { StimmeKnopf, StimmeSpalte } from './Stimme';
import { NurMit } from '../../app/NurMit';
import { useFunktion } from '../../state/funktionen';

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gewaehlt = useStore((s) => s.auswahl.figur);
  const waehle = useStore((s) => s.waehle);
  const figurenAnsicht = useStore((s) => s.figurenbogen.figurenAnsicht);
  const stimmeSpalte = useStore((s) => s.figurenbogen.stimmeSpalte);
  const mitBoegen = useFunktion('boegen');
  const mitStimme = useFunktion('kiStimme');
  const t = useTexte();
  const figuren = daten ? Object.values(daten.figuren).sort((a, b) => vergleich(a.name, b.name)) : [];
  const id =
    gewaehlt && daten?.figuren[gewaehlt]
      ? gewaehlt
      : (figuren.find((f) => f.rolle === 'haupt' && f.existenz === 'gesichert') ?? figuren[0])?.id;
  useEffect(() => {
    if (id && id !== gewaehlt) waehle({ figur: id });
  }, [id, gewaehlt, waehle]);
  if (!daten) return null;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', background: 'var(--surface)' }}>
      {figurenAnsicht !== 'besetzung' && <FigurenListe daten={daten} index={index} />}
      {figurenAnsicht === 'besetzung' ? (
        <Besetzung daten={daten} index={index} />
      ) : figurenAnsicht === 'boegen' && mitBoegen ? (
        <FigurenBoegen daten={daten} figur={id} />
      ) : id ? (
        <>
          <Figurenkarte key={id} id={id} daten={daten} index={index} />
          {stimmeSpalte && mitStimme && <StimmeSpalte key={`stimme-${id}`} daten={daten} figur={id} />}
        </>
      ) : (
        <div className="pw-leer">
          <h2 className="pw-leer__titel">{t.figuren.ansicht.leerTitel}</h2>
          <div className="pw-leer__text">{t.figuren.ansicht.leerText}</div>
        </div>
      )}
    </div>
  );
}

export function Titelaktionen() {
  const suche = useStore((s) => s.planung.figurenSuche);
  const setzeSuche = useStore((s) => s.planung.setzeFigurenSuche);
  const anlegen = useStore((s) => s.planung.figurAnlegen);
  const [neu, setNeu] = useState<string | null>(null);
  const figurenAnsicht = useStore((s) => s.figurenbogen.figurenAnsicht);
  const setzeFigurenAnsicht = useStore((s) => s.figurenbogen.setzeFigurenAnsicht);
  const mitBoegen = useFunktion('boegen');
  const t = useTexte();
  // ohne Bögen (E16) gibt es nur Karte und Besetzung
  const ansicht = mitBoegen || figurenAnsicht !== 'boegen' ? figurenAnsicht : 'karte';
  return (
    <>
      <Segment<'karte' | 'boegen' | 'besetzung'>
        rolle="group"
        label={t.figuren.ansicht.ansicht}
        hintergrund="selected"
        groesse="klein"
        wert={ansicht}
        onChange={setzeFigurenAnsicht}
        optionen={[
          { wert: 'karte', label: t.figuren.ansicht.karte },
          ...(mitBoegen ? [{ wert: 'boegen' as const, label: t.figuren.ansicht.boegen }] : []),
          { wert: 'besetzung', label: t.figuren.ansicht.besetzung },
        ]}
      />
      {ansicht === 'karte' && (
        <NurMit funktion="kiStimme">
          <StimmeKnopf />
        </NurMit>
      )}
      <label htmlFor="figuren-suche" className="pw-sr">
        {t.gemeinsam.suchen}
      </label>
      <input
        id="figuren-suche"
        type="search"
        placeholder={t.gemeinsam.suchen}
        value={suche}
        onChange={(e) => setzeSuche(e.target.value)}
        style={{
          font: 'inherit',
          fontSize: 12,
          height: 30,
          width: 200,
          padding: '0 10px',
          borderRadius: 6,
          border: '1px solid var(--border-strong)',
          background: 'var(--surface)',
          color: 'var(--ink)',
        }}
      />
      {neu === null ? (
        <Button variante="primaer" onClick={() => setNeu('')}>
          {t.figuren.ansicht.neueFigur}
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (neu.trim()) void anlegen(neu.trim());
            setNeu(null);
          }}
        >
          <input
            autoFocus
            aria-label={t.figuren.ansicht.nameNeu}
            placeholder={t.figuren.ansicht.namePlatzhalter}
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            onBlur={() => !neu.trim() && setNeu(null)}
            onKeyDown={(e) => e.key === 'Escape' && setNeu(null)}
            style={{
              font: 'inherit',
              fontSize: 12,
              height: 30,
              width: 160,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--ink)',
              background: 'var(--surface)',
              color: 'var(--ink)',
            }}
          />
        </form>
      )}
    </>
  );
}

export function kontext(state: Store): string {
  const id = state.auswahl.figur;
  const name = id ? state.daten?.figuren[id]?.name : undefined;
  const t = texte().figuren.ansicht;
  return name ? f(t.kontextMit, { name }) : t.kontext;
}
