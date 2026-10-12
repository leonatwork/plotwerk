/** P-04: Kapitel vorab planen (Inspektor im Akt-Board) und Ideen bearbeiten. */
import { useId, type CSSProperties } from 'react';
import type { Index } from '@core/index/index';
import type { AbweichungsEntscheidung, Id, Idee, KapitelPlan, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { kurzfassung } from '../../state/slices/planung';
import { bestaetigen as rueckfrage, Button, Chip, Inspektor } from '../../ui';
import { AngehefteteNotizen, AuswahlMenue, EntfernbarerChip, EntwurfBereich, EntwurfFeld, strangFarbe, strangGeplant, strangKurzname } from './gemeinsam';
import { VerweisText } from '../schreiben/VerweisFeld';
import { FaedenAlsStraenge, KapitelStrangVorschlaege } from '../faeden/StrangVorschlaege';
import { straengeSortiert } from '@core/struktur/straenge';
import { datum, f, useTexte, vergleich, woerterbuch } from '../../i18n';

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

const ENTSCHEIDUNGEN: AbweichungsEntscheidung[] = ['plan_anpassen', 'alternative', 'spaeter'];

/** Standardtitel neuer Ideen (der Store legt sie an); in beiden Sprachen erkennen. */
const istNeueIdee = (titel: string) => titel === woerterbuch('de').akte.karte.neueIdee || titel === woerterbuch('en').akte.karte.neueIdee;

function StrangWahl({ gewaehlt, daten, onChange }: { gewaehlt: Id[]; daten: ProjektDaten; onChange(ids: Id[]): void }) {
  const t = useTexte();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
      {straengeSortiert(daten.straenge).map((s) => {
        const aktiv = gewaehlt.includes(s.id);
        return (
          <Chip
            key={s.id}
            variante="knopf"
            aktiv={aktiv}
            punkt={strangGeplant(s, daten) ? undefined : strangFarbe(s.farbe)}
            title={s.rolle ? `${s.name} · ${t.faeden.raster.rolle[s.rolle]}` : s.name}
            style={s.rolle === 'haupt' ? { fontWeight: 600 } : undefined}
            onClick={() => onChange(aktiv ? gewaehlt.filter((x) => x !== s.id) : [...gewaehlt, s.id])}
          >
            {strangGeplant(s, daten) && (
              <span className="pw-punkt" style={{ width: 8, height: 8, border: `2px solid ${strangFarbe(s.farbe)}` }} aria-hidden="true" />
            )}
            {strangKurzname(s)}
          </Chip>
        );
      })}
      {daten.straenge.length === 0 && <span style={feldLabel}>{t.akte.inspektor.keineStraenge}</span>}
    </div>
  );
}

/** „Funktion im Buch“: eigenes Feld plus Schnellauswahl (Opening, Wendepunkt …); leer = nicht festgelegt. */
function FunktionWahl({ id, wert, onChange }: { id: string; wert: string; onChange(w: string): void }) {
  const t = useTexte();
  const ti = t.akte.inspektor;
  const vorschlaege = Object.values(ti.funktionen);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -8 }}>
      <EntwurfFeld id={id} className="pl-eingabe" placeholder={ti.funktionPlatzhalter} wert={wert} onSpeichern={(w) => onChange(w.trim())} />
      <div role="group" aria-label={ti.funktionWaehlen} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {vorschlaege.map((v) => (
          <button key={v} type="button" className="pl-kleinknopf" aria-pressed={wert === v} onClick={() => onChange(wert === v ? '' : v)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function Nachbar({ richtung, id, daten, index }: { richtung: string; id: Id | undefined; daten: ProjektDaten; index: Index }) {
  const oeffne = useStore((s) => s.waehle);
  const t = useTexte();
  if (!id) return <span>{richtung}: –</span>;
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  return (
    <span>
      {richtung}:{' '}
      <button type="button" className="pl-link" style={{ fontSize: 12, color: 'inherit' }} onClick={() => oeffne({ plan: id })}>
        {f(t.gemeinsam.kapitelKurz, { nr })}
      </button>
      , {kurzfassung(daten, index, id)}
    </span>
  );
}

function Abweichungen({ plan }: { plan: KapitelPlan }) {
  const entscheiden = useStore((s) => s.planung.abweichungEntscheiden);
  const t = useTexte();
  const ta = t.akte.abweichung;
  if (plan.abweichungen.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={kopfLabel}>{f(ta.kopf, { n: plan.abweichungen.length })}</span>
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
          <span>{a.notiz ? <VerweisText text={a.notiz} /> : ta.ohneNotiz}</span>
          {a.alterPlan && a.alterPlan !== a.notiz && (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <b>{ta.alterPlan}</b> <VerweisText text={a.alterPlan} />
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>{datum(new Date(a.datum), { day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
          <div role="group" aria-label={ta.gruppe} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ENTSCHEIDUNGEN.map((e) => (
              <button
                key={e}
                type="button"
                className="pl-kleinknopf"
                aria-pressed={a.entscheidung === e}
                onClick={async () => {
                  if (e === a.entscheidung) return;
                  if (
                    e === 'plan_anpassen' &&
                    !(await rueckfrage(ta.frage, { titel: ta.frageTitel, knopf: ta.frageKnopf }))
                  )
                    return;
                  void entscheiden(plan.id, a.id, e);
                }}
              >
                {ta.entscheidung[e]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KapitelPlanInspektor({ id, daten, index, zurueck }: { id: Id; daten: ProjektDaten; index: Index; zurueck?: () => void }) {
  const plan = daten.plaene[id];
  const aendern = useStore((s) => s.planung.kapitelPlanAendern);
  const schreibenBeginnen = useStore((s) => s.planung.schreibenBeginnen);
  const oeffne = useStore((s) => s.oeffne);
  const entfernen = useStore((s) => s.planung.geplantesKapitelEntfernen);
  const figurAnlegen = useStore((s) => s.planung.figurAnlegen);
  const ortAnlegen = useStore((s) => s.planung.ortAnlegen);
  const uid = useId();
  const t = useTexte();
  const ti = t.akte.inspektor;
  if (!plan) return null;
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const hatText = !!daten.kapitel[id]?.text.trim();
  const geplant = plan.status === 'geplant';
  const reihenfolge = daten.projekt.kapitel;
  const pos = reihenfolge.indexOf(id);
  const speichern = (teil: Partial<KapitelPlan>) => void aendern(id, teil);
  const statusText = ti.status[plan.status];

  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={t.akte.ansicht.kapitelPlanen}>
      {zurueck && (
        <button type="button" className="pl-link" style={{ alignSelf: 'flex-start' }} onClick={zurueck}>
          {t.faeden.strang.uebersicht}
        </button>
      )}
      <span style={kopfLabel}>{f(ti.kopf, { nr, status: statusText })}</span>
      <label htmlFor={`${uid}-titel`} style={feldLabel}>
        {ti.titel}
      </label>
      <EntwurfFeld key={`${id}-titel`} id={`${uid}-titel`} style={titelFeld} wert={plan.titel} onSpeichern={(titel) => titel.trim() && speichern({ titel: titel.trim() })} />
      <label htmlFor={`${uid}-szene`} style={feldLabel}>
        {ti.kurzbeschreibung}
      </label>
      <EntwurfFeld
        key={`${id}-szene`}
        id={`${uid}-szene`}
        className="pl-eingabe"
        style={{ marginTop: -8 }}
        placeholder={ti.szenePlatzhalter}
        wert={plan.szene}
        onSpeichern={(szene) => speichern({ szene })}
      />
      <label htmlFor={`${uid}-funktion`} style={feldLabel}>
        {ti.funktion} <span style={{ fontSize: 11 }}>· {ti.funktionHinweis}</span>
      </label>
      <FunktionWahl key={`${id}-funktion`} id={`${uid}-funktion`} wert={plan.funktion ?? ''} onChange={(funktion) => speichern({ funktion: funktion || undefined })} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>{ti.strang}</span>
        <StrangWahl gewaehlt={plan.straenge} daten={daten} onChange={(straenge) => speichern({ straenge })} />
        <FaedenAlsStraenge daten={daten} kapitel={id} />
        <KapitelStrangVorschlaege kapitel={id} daten={daten} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>{ti.figuren}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {plan.figuren.map((fid) => (
            <EntfernbarerChip
              key={fid}
              title={ti.figurOeffnen}
              onClick={() => oeffne('figuren', { figur: fid })}
              onEntfernen={() => speichern({ figuren: plan.figuren.filter((x) => x !== fid) })}
            >
              {daten.figuren[fid]?.name ?? fid}
            </EntfernbarerChip>
          ))}
          <AuswahlMenue
            knopf={ti.plusFigur}
            optionen={Object.values(daten.figuren)
              .filter((x) => !plan.figuren.includes(x.id))
              .sort((a, b) => vergleich(a.name, b.name))
              .map((x) => ({ wert: x.id, label: x.name, suche: x.aliase.join(' ') }))}
            onWaehle={(fid) => speichern({ figuren: [...plan.figuren, fid] })}
            zusatz={{
              label: (suche) => (suche ? f(ti.figurAnlegen, { name: suche }) : ti.neueFigurAnlegen),
              onClick: (suche) => {
                const name = suche.trim() || ti.neueFigur;
                void figurAnlegen(name).then((neu) => aendern(id, { figuren: [...(useStore.getState().daten?.plaene[id]?.figuren ?? []), neu] }));
              },
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>{ti.ort}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {plan.orte.map((o) => (
            <EntfernbarerChip
              key={o}
              variante="umrandet"
              title={ti.ortOeffnen}
              onClick={() => oeffne('orte', { ort: o })}
              onEntfernen={() => speichern({ orte: plan.orte.filter((x) => x !== o) })}
            >
              {daten.orte[o]?.name ?? o}
            </EntfernbarerChip>
          ))}
          <AuswahlMenue
            knopf={ti.plusOrt}
            optionen={Object.values(daten.orte)
              .filter((o) => !plan.orte.includes(o.id))
              .sort((a, b) => vergleich(a.name, b.name))
              .map((o) => ({ wert: o.id, label: o.name, suche: o.aliase.join(' ') }))}
            onWaehle={(o) => speichern({ orte: [...plan.orte, o] })}
            zusatz={{
              label: (suche) => (suche ? f(ti.ortAnlegen, { name: suche }) : ti.neuenOrtAnlegen),
              onClick: (suche) => {
                const name = suche.trim() || ti.neuerOrt;
                void ortAnlegen(name).then((neu) => aendern(id, { orte: [...(useStore.getState().daten?.plaene[id]?.orte ?? []), neu] }));
              },
            }}
          />
        </div>
      </div>
      <label htmlFor={`${uid}-plan`} style={feldLabel}>
        {ti.wasPassiert}
      </label>
      <EntwurfBereich
        key={`${id}-plan`}
        id={`${uid}-plan`}
        rows={6}
        style={planFeld}
        placeholder={ti.planPlatzhalter}
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
        <strong style={{ fontSize: 12, color: 'var(--ink)' }}>{ti.kontext}</strong>
        <Nachbar richtung={ti.davor} id={pos > 0 ? reihenfolge[pos - 1] : undefined} daten={daten} index={index} />
        <Nachbar richtung={ti.danach} id={pos >= 0 && pos < reihenfolge.length - 1 ? reihenfolge[pos + 1] : undefined} daten={daten} index={index} />
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
          {ti.schreibenBeginnen}
        </button>
      ) : (
        <button type="button" style={primaer} onClick={() => oeffne('schreiben', { kapitel: id })}>
          {ti.imEditorOeffnen}
        </button>
      )}
      {!hatText && (
        <button
          type="button"
          className="pl-link"
          style={{ alignSelf: 'center', color: 'var(--ink-quiet)', flexShrink: 0 }}
          onClick={async () => {
            if (await rueckfrage(f(ti.loeschenFrage, { titel: plan.titel }), { knopf: t.gemeinsam.loeschen })) void entfernen(id);
          }}
        >
          {ti.loeschen}
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
  const t = useTexte();
  const ti = t.akte.idee;
  const akte = [...daten.akte].sort((a, b) => a.nummer - b.nummer);
  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={ti.label}>
      <span style={{ ...kopfLabel, color: 'var(--warm-dark)' }}>{ti.kopf}</span>
      <label htmlFor={`${uid}-titel`} style={feldLabel}>
        {ti.feld}
      </label>
      <EntwurfBereich
        key={`${idee.id}-titel`}
        id={`${uid}-titel`}
        autoHoehe
        autoFocus={istNeueIdee(idee.titel)}
        onFocus={(e) => istNeueIdee(idee.titel) && e.currentTarget.select()}
        rows={1}
        style={{ ...planFeld, fontFamily: 'var(--schrift-titel)', fontSize: 22, lineHeight: 1.2, padding: '6px 10px' }}
        wert={idee.titel}
        onSpeichern={(titel) => titel.trim() && void aendern(idee.id, { titel: titel.trim() })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>{ti.strang}</span>
        <StrangWahl gewaehlt={idee.straenge} daten={daten} onChange={(straenge) => void aendern(idee.id, { straenge })} />
      </div>
      <label htmlFor={`${uid}-notiz`} style={feldLabel}>
        {ti.notiz}
      </label>
      <EntwurfBereich
        key={`${idee.id}-notiz`}
        id={`${uid}-notiz`}
        rows={6}
        style={planFeld}
        placeholder={ti.notizPlatzhalter}
        verweise={{ typ: 'idee', id: idee.id }}
        wert={idee.notiz}
        onSpeichern={(notiz) => void aendern(idee.id, { notiz })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={feldLabel}>{ti.einordnen}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {akte.map((a) => (
            <Button key={a.nummer} klein onClick={() => void einplanen(idee.id, a.nummer)}>
              {a.titel || f(t.akte.board.aktTitel, { nr: a.nummer })}
            </Button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-quiet)' }}>{ti.oderZiehen}</span>
      </div>
      <span style={{ flexGrow: 1 }} />
      <button
        type="button"
        className="pl-link"
        style={{ alignSelf: 'center', color: 'var(--ink-quiet)' }}
        onClick={async () => {
          if (await rueckfrage(f(ti.loeschenFrage, { titel: idee.titel }), { knopf: t.gemeinsam.loeschen })) void entfernen(idee.id);
        }}
      >
        {ti.loeschen}
      </button>
    </Inspektor>
  );
}
