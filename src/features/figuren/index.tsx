/** Bereich „Figuren“ (F-01–F-06) nach docs/design/screens/Figur.dc.html. Besitzer: Planung. */
import { useEffect, useState } from 'react';
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, Segment } from '../../ui';
import { FigurenBoegen } from './Boegen';
import { Figurenkarte } from './Figurenkarte';
import { FigurenListe } from './Liste';
import { StimmeKnopf, StimmeSpalte } from './Stimme';

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gewaehlt = useStore((s) => s.auswahl.figur);
  const waehle = useStore((s) => s.waehle);
  const figurenAnsicht = useStore((s) => s.figurenbogen.figurenAnsicht);
  const stimmeSpalte = useStore((s) => s.figurenbogen.stimmeSpalte);
  const figuren = daten ? Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de')) : [];
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
      <FigurenListe daten={daten} index={index} />
      {figurenAnsicht === 'boegen' ? (
        <FigurenBoegen daten={daten} figur={id} />
      ) : id ? (
        <>
          <Figurenkarte key={id} id={id} daten={daten} index={index} />
          {stimmeSpalte && <StimmeSpalte key={`stimme-${id}`} daten={daten} figur={id} />}
        </>
      ) : (
        <div className="pw-leer">
          <h2 className="pw-leer__titel">Noch keine Figuren</h2>
          <div className="pw-leer__text">Lege links eine Figur vorab an, auch bevor sie im Text vorkommt.</div>
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
  return (
    <>
      <Segment<'karte' | 'boegen'>
        rolle="group"
        label="Ansicht"
        hintergrund="selected"
        groesse="klein"
        wert={figurenAnsicht}
        onChange={setzeFigurenAnsicht}
        optionen={[
          { wert: 'karte', label: 'Karte' },
          { wert: 'boegen', label: 'Bögen' },
        ]}
      />
      {figurenAnsicht === 'karte' && <StimmeKnopf />}
      <label htmlFor="figuren-suche" className="pw-sr">
        Suchen
      </label>
      <input
        id="figuren-suche"
        type="search"
        placeholder="Suchen"
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
          + Neue Figur
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
            aria-label="Name der neuen Figur"
            placeholder="Name, Enter"
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
  return name ? `Figuren · ${name}` : 'Figuren';
}
