/** Bereich „Akte planen“ (P-01–P-06, A-03) nach docs/design/screens/Akte.dc.html. Besitzer: Planung. */
import type { Store } from '../../state/store';
import { useStore } from '../../state/store';
import { Button, LeerZustand, Segment, StrangPunkt } from '../../ui';
import type { AkteAnsicht } from '../../state/slices/planung';
import { Board } from './Board';
import { IdeeInspektor, KapitelPlanInspektor } from './KapitelInspektor';
import { strangFarbe, strangGeplant } from './gemeinsam';
import { Inspektor } from '../../ui';
import { StrangRaster } from '../faeden/StrangRaster';
import { StrangInspektor } from '../faeden/StrangInspektor';
import { straengeSortiert } from '@core/struktur/straenge';
import { texte, useTexte } from '../../i18n';

/** Segment in der Titelleiste: zwei Board-Ansichten (Planung) und das Strang-Raster (G2). */
type AkteSegment = AkteAnsicht | 'straenge';

export default function Ansicht() {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const ansicht = useStore((s) => s.planung.akteAnsicht);
  const planId = useStore((s) => s.auswahl.plan ?? s.auswahl.kapitel);
  const ideeId = useStore((s) => s.planung.ideeAuswahl);
  const aktHinzufuegen = useStore((s) => s.planung.aktHinzufuegen);
  const darstellung = useStore((s) => s.struktur.akteDarstellung);
  const rasterKapitel = useStore((s) => s.struktur.rasterKapitel);
  const waehleStrang = useStore((s) => s.struktur.waehleStrang);
  const t = useTexte();
  if (!daten) return null;
  const idee = ideeId ? daten.ideen.find((i) => i.id === ideeId) : undefined;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          background: 'var(--canvas)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--schrift-titel)', fontWeight: 400, fontSize: 34, lineHeight: 1, whiteSpace: 'nowrap' }}>{t.akte.ansicht.titel}</h1>
          <span style={{ minWidth: 0, fontSize: 12, color: 'var(--ink-quiet)', textAlign: 'right' }}>
            {darstellung === 'straenge' ? t.akte.ansicht.hinweisStraenge : t.akte.ansicht.hinweisBoard}
          </span>
        </div>
        {daten.akte.length === 0 && daten.projekt.kapitel.length === 0 && daten.ideen.length === 0 ? (
          <LeerZustand titel={t.akte.ansicht.leerTitel} aktionen={<Button onClick={() => void aktHinzufuegen()}>{t.akte.ansicht.plusAkt}</Button>}>
            {t.akte.ansicht.leerText}
          </LeerZustand>
        ) : darstellung === 'straenge' ? (
          <StrangRaster daten={daten} />
        ) : (
          <Board daten={daten} index={index} ansicht={ansicht} />
        )}
      </div>
      {darstellung === 'straenge' && !(rasterKapitel && planId && daten.plaene[planId]) ? (
        <StrangInspektor daten={daten} />
      ) : darstellung === 'straenge' && planId ? (
        <KapitelPlanInspektor key={planId} id={planId} daten={daten} index={index} zurueck={() => waehleStrang(null)} />
      ) : idee ? (
        <IdeeInspektor idee={idee} daten={daten} />
      ) : planId && daten.plaene[planId] ? (
        <KapitelPlanInspektor key={planId} id={planId} daten={daten} index={index} />
      ) : (
        <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={t.akte.ansicht.kapitelPlanen}>
          <span style={{ fontSize: 13, color: 'var(--ink-quiet)', lineHeight: 1.5 }}>{t.akte.ansicht.inspektorLeer}</span>
        </Inspektor>
      )}
    </div>
  );
}

/** Legende unter der Navigation: Stränge (inkl. Antagonisten) und Kartenstatus. */
export function Seitenleiste() {
  const daten = useStore((s) => s.daten);
  const t = useTexte();
  if (!daten) return null;
  const zeile = { display: 'flex', alignItems: 'center', gap: 8 } as const;
  const kopf = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-quiet)' } as const;
  const muster = { width: 18, height: 12, borderRadius: 3, flex: '0 0 auto' } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
      {daten.straenge.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px', fontSize: 12 }}>
          <span style={kopf}>{t.akte.legende.straenge}</span>
          {straengeSortiert(daten.straenge).map((s) => {
            const geplant = strangGeplant(s, daten);
            return (
              <span key={s.id} style={zeile} title={s.beschreibung}>
                <StrangPunkt farbe={strangFarbe(s.farbe)} groesse={10} geplant={geplant} />
                <span style={s.rolle === 'haupt' ? { fontWeight: 600 } : undefined}>{s.name}</span>
                {s.rolle && <span style={{ fontSize: 10, color: 'var(--ink-quiet)' }}>{t.faeden.raster.rolle[s.rolle]}</span>}
                {geplant && <span style={{ fontSize: 10, color: 'var(--ink-quiet)' }}>{t.akte.legende.geplant}</span>}
              </span>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px', fontSize: 12 }}>
        <span style={kopf}>{t.akte.legende.status}</span>
        <span style={zeile}>
          <span style={{ ...muster, background: 'var(--surface)', border: '1px solid var(--border-strong)' }} />
          {t.akte.legende.geschrieben}
        </span>
        <span style={zeile}>
          <span style={{ ...muster, background: 'var(--surface-muted)', border: '1px solid var(--border-strong)' }} />
          {t.akte.legende.entwurf}
        </span>
        <span style={zeile}>
          <span style={{ ...muster, border: '1.5px dashed var(--dotted)' }} />
          {t.akte.legende.geplant}
        </span>
        <span style={zeile}>
          <span style={{ ...muster, border: '1px solid var(--border-strong)', boxShadow: 'inset 3px 0 0 var(--accent)' }} />
          {t.akte.legende.weichtAb}
        </span>
      </div>
    </div>
  );
}

export function Titelaktionen() {
  const ansicht = useStore((s) => s.planung.akteAnsicht);
  const setze = useStore((s) => s.planung.setzeAkteAnsicht);
  const darstellung = useStore((s) => s.struktur.akteDarstellung);
  const setzeDarstellung = useStore((s) => s.struktur.setzeAkteDarstellung);
  const aktHinzufuegen = useStore((s) => s.planung.aktHinzufuegen);
  const t = useTexte();
  return (
    <>
      <Segment<AkteSegment>
        rolle="group"
        label={t.akte.ansicht.segment}
        hintergrund="selected"
        groesse="klein"
        wert={darstellung === 'straenge' ? 'straenge' : ansicht}
        onChange={(w) => {
          if (w === 'straenge') return setzeDarstellung('straenge');
          setzeDarstellung('board');
          setze(w);
        }}
        optionen={[
          { wert: 'plan', label: t.akte.ansicht.nurPlan },
          { wert: 'plantext', label: t.akte.ansicht.planText },
          { wert: 'straenge', label: t.akte.ansicht.straenge },
        ]}
      />
      <Button onClick={() => void aktHinzufuegen()}>{t.akte.ansicht.plusAkt}</Button>
    </>
  );
}

export function kontext(state: Store): string {
  void state;
  return texte().akte.ansicht.titel;
}
