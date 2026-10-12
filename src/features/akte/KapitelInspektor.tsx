/** P-04: Kapitel vorab planen (Inspektor im Akt-Board) und Ideen bearbeiten. */
import { useId, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { AbweichungsEntscheidung, Id, Idee, KapitelPlan, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { kurzfassung } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Button, Chip, Inspektor } from '../../ui';
import { AngehefteteNotizen, AuswahlMenue, EntfernbarerChip, EntwurfBereich, EntwurfFeld, strangFarbe, strangGeplant, strangKurzname } from './gemeinsam';
import { VerweisText } from '../schreiben/VerweisFeld';

const kopfLabel: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--accent-dark)' };
const feldLabel: CSSProperties = { fontSize: 12, color: 'var(--ink-quiet)' };
const titelFeld: CSSProperties = {
  fontFamily: 'var(--schrift-titel)',
  fontSize: 24,
  height: 40,
  padding: '0 10px',
  marginTop: -8,
  border: '1px solid var(--line)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--ink)',
  minWidth: 0,
};
const planFeld: CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  padding: 10,
  marginTop: -8,
  border: '1px solid var(--line)',
  borderRadius: 6,
  resize: 'none',
  color: 'var(--ink)',
  background: 'var(--surface)',
};
const primaer: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  borderRadius: 8,
  border: 0,
  background: 'var(--ink)',
  color: 'var(--on-ink)',
  fontSize: 13,
  fontWeight: 600,
  flexShrink: 0,
  cursor: 'pointer',
};

const ENTSCHEIDUNG_TEXT: Record<AbweichungsEntscheidung, string> = {
  plan_anpassen: 'Plan anpassen',
  alternative: 'Als Alternative merken',
  spaeter: 'Später entscheiden',
};

function StrangWahl({ gewaehlt, daten, onChange }: { gewaehlt: Id[]; daten: ProjektDaten; onChange(ids: Id[]): void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
      {daten.straenge.map((s) => {
        const aktiv = gewaehlt.includes(s.id);
        return (
          <Chip
            key={s.id}
            variante="knopf"
            aktiv={aktiv}
            punkt={strangGeplant(s, daten) ? undefined : strangFarbe(s.farbe)}
            title={s.name}
            onClick={() => onChange(aktiv ? gewaehlt.filter((x) => x !== s.id) : [...gewaehlt, s.id])}
          >
            {strangGeplant(s, daten) && (
              <span className="pw-punkt" style={{ width: 8, height: 8, border: `2px solid ${strangFarbe(s.farbe)}` }} aria-hidden="true" />
            )}
            {strangKurzname(s)}
          </Chip>
        );
      })}
      {daten.straenge.length === 0 && <span style={feldLabel}>Keine Stränge angelegt (plan/straenge.md)</span>}
    </div>
  );
}

function Nachbar({ richtung, id, daten, index }: { richtung: 'Davor' | 'Danach'; id: Id | undefined; daten: ProjektDaten; index: Index }) {
  const oeffne = useStore((s) => s.waehle);
  if (!id) return <span>{richtung}: –</span>;
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  return (
    <span>
      {richtung}:{' '}
      <button type="button" className="pl-link" style={{ fontSize: 12, color: 'inherit' }} onClick={() => oeffne({ plan: id })}>
        Kap. {nr}
      </button>
      , {kurzfassung(daten, index, id)}
    </span>
  );
}

function Abweichungen({ plan }: { plan: KapitelPlan }) {
  const entscheiden = useStore((s) => s.planung.abweichungEntscheiden);
  if (plan.abweichungen.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={kopfLabel}>{plan.abweichungen.length === 1 ? 'ABWEICHUNG VOM PLAN' : 'ABWEICHUNGEN VOM PLAN'}</span>
      {plan.abweichungen.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            borderRadius: 8,
            background: a.entscheidung === 'plan_anpassen' ? 'var(--inspector)' : 'var(--accent-flaeche)',
            border: `1px solid ${a.entscheidung === 'plan_anpassen' ? 'var(--line-soft)' : 'var(--accent-line)'}`,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <span>{a.notiz ? <VerweisText text={a.notiz} /> : 'Ohne Notiz'}</span>
          {a.alterPlan && a.alterPlan !== a.notiz && (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <b>Alter Plan:</b> <VerweisText text={a.alterPlan} />
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>{new Date(a.datum).toLocaleDateString('de-DE')}</span>
          <div role="group" aria-label="Was passiert mit dem Plan?" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(Object.keys(ENTSCHEIDUNG_TEXT) as AbweichungsEntscheidung[]).map((e) => (
              <button
                key={e}
                type="button"
                className="pl-kleinknopf"
                aria-pressed={a.entscheidung === e}
                onClick={async () => {
                  if (e === a.entscheidung) return;
                  if (
                    e === 'plan_anpassen' &&
                    !(await rueckfrage('Die Notiz der Abweichung wird zum neuen Plan, der alte bleibt hier sichtbar.', { titel: 'Plan an den Text anpassen?', knopf: 'Plan anpassen' }))
                  )
                    return;
                  void entscheiden(plan.id, a.id, e);
                }}
              >
                {ENTSCHEIDUNG_TEXT[e]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KapitelPlanInspektor({ id, daten, index }: { id: Id; daten: ProjektDaten; index: Index }) {
  const plan = daten.plaene[id];
  const aendern = useStore((s) => s.planung.kapitelPlanAendern);
  const schreibenBeginnen = useStore((s) => s.planung.schreibenBeginnen);
  const oeffne = useStore((s) => s.oeffne);
  const entfernen = useStore((s) => s.planung.geplantesKapitelEntfernen);
  const figurAnlegen = useStore((s) => s.planung.figurAnlegen);
  const ortAnlegen = useStore((s) => s.planung.ortAnlegen);
  const uid = useId();
  if (!plan) return null;
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const hatText = !!daten.kapitel[id]?.text.trim();
  const geplant = plan.status === 'geplant';
  const reihenfolge = daten.projekt.kapitel;
  const pos = reihenfolge.indexOf(id);
  const speichern = (teil: Partial<KapitelPlan>) => void aendern(id, teil);
  const statusText = plan.status === 'geplant' ? 'GEPLANT' : plan.status === 'entwurf' ? 'ENTWURF' : 'GESCHRIEBEN';

  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label="Kapitel planen">
      <span style={kopfLabel}>
        KAPITEL {nr} · {statusText}
      </span>
      <label htmlFor={`${uid}-titel`} style={feldLabel}>
        Titel
      </label>
      <EntwurfFeld key={`${id}-titel`} id={`${uid}-titel`} style={titelFeld} wert={plan.titel} onSpeichern={(titel) => titel.trim() && speichern({ titel: titel.trim() })} />
      <label htmlFor={`${uid}-szene`} style={feldLabel}>
        Geplante Szene
      </label>
      <EntwurfFeld
        key={`${id}-szene`}
        id={`${uid}-szene`}
        className="pl-eingabe"
        style={{ marginTop: -8 }}
        placeholder="z. B. Paul trifft Lotte am Lindenhof"
        wert={plan.szene}
        onSpeichern={(szene) => speichern({ szene })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>Strang</span>
        <StrangWahl gewaehlt={plan.straenge} daten={daten} onChange={(straenge) => speichern({ straenge })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>Figuren</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {plan.figuren.map((f) => (
            <EntfernbarerChip
              key={f}
              title="Figurenkarte öffnen"
              onClick={() => oeffne('figuren', { figur: f })}
              onEntfernen={() => speichern({ figuren: plan.figuren.filter((x) => x !== f) })}
            >
              {daten.figuren[f]?.name ?? f}
            </EntfernbarerChip>
          ))}
          <AuswahlMenue
            knopf="+ Figur"
            optionen={Object.values(daten.figuren)
              .filter((f) => !plan.figuren.includes(f.id))
              .sort((a, b) => a.name.localeCompare(b.name, 'de'))
              .map((f) => ({ wert: f.id, label: f.name, suche: f.aliase.join(' ') }))}
            onWaehle={(f) => speichern({ figuren: [...plan.figuren, f] })}
            zusatz={{
              label: (suche) => (suche ? `+ Figur „${suche}“ anlegen` : '+ Neue Figur anlegen'),
              onClick: (suche) => {
                const name = suche.trim() || 'Neue Figur';
                void figurAnlegen(name).then((neu) => aendern(id, { figuren: [...(useStore.getState().daten?.plaene[id]?.figuren ?? []), neu] }));
              },
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>Ort</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {plan.orte.map((o) => (
            <EntfernbarerChip
              key={o}
              variante="umrandet"
              title="Ort öffnen"
              onClick={() => oeffne('orte', { ort: o })}
              onEntfernen={() => speichern({ orte: plan.orte.filter((x) => x !== o) })}
            >
              {daten.orte[o]?.name ?? o}
            </EntfernbarerChip>
          ))}
          <AuswahlMenue
            knopf="+ Ort"
            optionen={Object.values(daten.orte)
              .filter((o) => !plan.orte.includes(o.id))
              .sort((a, b) => a.name.localeCompare(b.name, 'de'))
              .map((o) => ({ wert: o.id, label: o.name, suche: o.aliase.join(' ') }))}
            onWaehle={(o) => speichern({ orte: [...plan.orte, o] })}
            zusatz={{
              label: (suche) => (suche ? `+ Ort „${suche}“ anlegen` : '+ Neuen Ort anlegen'),
              onClick: (suche) => {
                const name = suche.trim() || 'Neuer Ort';
                void ortAnlegen(name).then((neu) => aendern(id, { orte: [...(useStore.getState().daten?.plaene[id]?.orte ?? []), neu] }));
              },
            }}
          />
        </div>
      </div>
      <label htmlFor={`${uid}-plan`} style={feldLabel}>
        Was soll hier passieren?
      </label>
      <EntwurfBereich
        key={`${id}-plan`}
        id={`${uid}-plan`}
        rows={6}
        style={planFeld}
        placeholder="Stichpunkte, Szenenidee, Stimmung … mit [[ auf Figuren, Orte oder Kapitel verweisen"
        verweise={{ typ: 'plan', id }}
        wert={plan.notiz}
        onSpeichern={(notiz) => speichern({ notiz })}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '10px 12px',
          background: 'var(--inspector)',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.45,
          color: 'var(--ink-soft)',
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 12, color: 'var(--ink)' }}>Kontext aus dem Text</strong>
        <Nachbar richtung="Davor" id={pos > 0 ? reihenfolge[pos - 1] : undefined} daten={daten} index={index} />
        <Nachbar richtung="Danach" id={pos >= 0 && pos < reihenfolge.length - 1 ? reihenfolge[pos + 1] : undefined} daten={daten} index={index} />
      </div>
      <Abweichungen plan={plan} />
      <AngehefteteNotizen
        ziele={[
          { typ: 'plan', id },
          { typ: 'kapitel', id },
        ]}
        daten={daten}
      />
      <span style={{ flexGrow: 1 }} />
      {geplant && !hatText ? (
        <button type="button" style={primaer} onClick={() => void schreibenBeginnen(id)}>
          Mit dem Schreiben beginnen
        </button>
      ) : (
        <button type="button" style={primaer} onClick={() => oeffne('schreiben', { kapitel: id })}>
          Im Editor öffnen
        </button>
      )}
      {!hatText && (
        <button
          type="button"
          className="pl-link"
          style={{ alignSelf: 'center', color: 'var(--ink-quiet)', flexShrink: 0 }}
          onClick={async () => {
            if (await rueckfrage(`Geplantes Kapitel „${plan.titel}“ löschen? Vorher wird ein Schnappschuss angelegt.`, { knopf: 'Löschen' })) void entfernen(id);
          }}
        >
          Geplantes Kapitel löschen
        </button>
      )}
    </Inspektor>
  );
}

export function IdeeInspektor({ idee, daten }: { idee: Idee; daten: ProjektDaten }) {
  const aendern = useStore((s) => s.planung.ideeAendern);
  const entfernen = useStore((s) => s.planung.ideeEntfernen);
  const einplanen = useStore((s) => s.planung.ideeEinplanen);
  const uid = useId();
  const akte = [...daten.akte].sort((a, b) => a.nummer - b.nummer);
  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label="Idee">
      <span style={{ ...kopfLabel, color: 'var(--warm-dark)' }}>IDEE · NOCH OHNE PLATZ</span>
      <label htmlFor={`${uid}-titel`} style={feldLabel}>
        Idee
      </label>
      <EntwurfBereich
        key={`${idee.id}-titel`}
        id={`${uid}-titel`}
        autoHoehe
        autoFocus={idee.titel === 'Neue Idee'}
        onFocus={(e) => idee.titel === 'Neue Idee' && e.currentTarget.select()}
        rows={1}
        style={{ ...planFeld, fontFamily: 'var(--schrift-titel)', fontSize: 22, lineHeight: 1.2, padding: '6px 10px' }}
        wert={idee.titel}
        onSpeichern={(titel) => titel.trim() && void aendern(idee.id, { titel: titel.trim() })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>Strang</span>
        <StrangWahl gewaehlt={idee.straenge} daten={daten} onChange={(straenge) => void aendern(idee.id, { straenge })} />
      </div>
      <label htmlFor={`${uid}-notiz`} style={feldLabel}>
        Notiz
      </label>
      <EntwurfBereich
        key={`${idee.id}-notiz`}
        id={`${uid}-notiz`}
        rows={6}
        style={planFeld}
        placeholder="Was steckt hinter der Idee? Mit [[ verweisen"
        verweise={{ typ: 'idee', id: idee.id }}
        wert={idee.notiz}
        onSpeichern={(notiz) => void aendern(idee.id, { notiz })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>Als geplantes Kapitel einordnen</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {akte.map((a) => (
            <Button key={a.nummer} klein onClick={() => void einplanen(idee.id, a.nummer)}>
              {a.titel || `Akt ${a.nummer}`}
            </Button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>oder die Karte in einen Akt ziehen</span>
      </div>
      <span style={{ flexGrow: 1 }} />
      <button
        type="button"
        className="pl-link"
        style={{ alignSelf: 'center', color: 'var(--ink-quiet)' }}
        onClick={async () => {
          if (await rueckfrage(`Idee „${idee.titel}“ löschen?`, { knopf: 'Löschen' })) void entfernen(idee.id);
        }}
      >
        Idee löschen
      </button>
    </Inspektor>
  );
}
