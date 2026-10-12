/**
 * Inspektor im Segment „Stränge“ (Akte planen): gewählter Strang (Name, Haupt-/Nebenhandlung, „Wofür steht der
 * Strang?“, Farbe, Kapitel im Plan, KI-Vorschläge zu ihm) oder – ohne Auswahl – alle KI-Vorschläge. Besitzer: G2.
 */
import { useId } from 'react';
import type { ProjektDaten, Strang, StrangRolle } from '@core/model/types';
import { STRANG_FARBEN } from '@core/struktur/straenge';
import { useStore } from '../../state/store';
import { Inspektor, Segment } from '../../ui';
import { EntwurfBereich, EntwurfFeld, strangFarbe } from '../akte/gemeinsam';
import { kapitelVoll } from './gemeinsam';
import { FaedenAlsStraenge, StrangVorschlaegeListe } from './StrangVorschlaege';
import { f, useTexte } from '../../i18n';
import './faeden.css';

type RolleWahl = StrangRolle | 'offen';

function StrangBearbeiten({ strang, daten }: { strang: Strang; daten: ProjektDaten }) {
  const aendern = useStore((s) => s.struktur.strangAendern);
  const waehleStrang = useStore((s) => s.struktur.waehleStrang);
  const waehle = useStore((s) => s.waehle);
  const uid = useId();
  const t = useTexte();
  const ts = t.faeden.strang;
  const kapitel = daten.projekt.kapitel.filter((k) => daten.plaene[k]?.straenge.includes(strang.id));
  const gruppe = strang.gruppe ? daten.gruppen[strang.gruppe] : undefined;
  return (
    <>
      <button type="button" className="pl-link" style={{ alignSelf: 'flex-start' }} onClick={() => waehleStrang(null)}>
        {ts.uebersicht}
      </button>
      <span className="fd-label" style={{ color: 'var(--accent-dark)' }}>
        {ts.kopf}
      </span>
      <label htmlFor={`${uid}-name`} className="fd-feldlabel">
        {ts.name}
      </label>
      <EntwurfFeld
        key={`${strang.id}-name`}
        id={`${uid}-name`}
        className="pl-eingabe fd-strang-name"
        style={{ marginTop: -8 }}
        wert={strang.name}
        onSpeichern={(name) => name.trim() && void aendern(strang.id, { name: name.trim() })}
      />
      {gruppe && <span className="fd-leise">{f(ts.antagonist, { name: gruppe.name })}</span>}
      <span className="fd-feldlabel">{ts.rolle}</span>
      <Segment<RolleWahl>
        rolle="group"
        label={ts.rolle}
        style={{ marginTop: -8 }}
        voll
        wert={strang.rolle ?? 'offen'}
        onChange={(w) => void aendern(strang.id, { rolle: w === 'offen' ? undefined : w })}
        optionen={[
          { wert: 'haupt', label: t.faeden.raster.rolle.haupt },
          { wert: 'neben', label: t.faeden.raster.rolle.neben },
          { wert: 'offen', label: ts.rolleOffen },
        ]}
      />
      <label htmlFor={`${uid}-beschreibung`} className="fd-feldlabel">
        {ts.beschreibung}
      </label>
      <EntwurfBereich
        key={`${strang.id}-beschreibung`}
        id={`${uid}-beschreibung`}
        rows={5}
        className="pl-bereich"
        style={{ marginTop: -8 }}
        placeholder={ts.beschreibungPlatzhalter}
        verweise
        wert={strang.beschreibung ?? ''}
        onSpeichern={(beschreibung) => void aendern(strang.id, { beschreibung })}
      />
      <span className="fd-feldlabel">{ts.farbe}</span>
      <div role="radiogroup" aria-label={ts.farbe} className="fd-farbwahl" style={{ marginTop: -8 }}>
        {STRANG_FARBEN.map((fb) => (
          <button
            key={fb.hex}
            type="button"
            role="radio"
            aria-checked={strang.farbe.toLowerCase() === fb.hex.toLowerCase()}
            aria-label={t.faeden.raster.farben[fb.name]}
            title={t.faeden.raster.farben[fb.name]}
            className="fd-farbwahl__knopf"
            style={{ background: strangFarbe(fb.hex) }}
            onClick={() => void aendern(strang.id, { farbe: fb.hex })}
          />
        ))}
      </div>
      <span className="fd-feldlabel">{ts.kapitel}</span>
      {kapitel.length === 0 ? (
        <span className="fd-leise" style={{ marginTop: -8 }}>
          {ts.keineKapitel}
        </span>
      ) : (
        <ul className="fd-strang-kapitel" style={{ marginTop: -8 }}>
          {kapitel.map((k) => (
            <li key={k}>
              <button type="button" className="pl-link" style={{ color: 'var(--ink)', textAlign: 'left' }} onClick={() => waehle({ plan: k, kapitel: k })}>
                {kapitelVoll(daten, k)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <StrangVorschlaegeListe daten={daten} strang={strang.id} />
    </>
  );
}

/** Rechte Spalte im Segment „Stränge“. */
export function StrangInspektor({ daten }: { daten: ProjektDaten }) {
  const auswahl = useStore((s) => s.struktur.strangAuswahl);
  const t = useTexte();
  const strang = auswahl ? daten.straenge.find((s) => s.id === auswahl) : undefined;
  return (
    <Inspektor className="pl-inspektor" breite={330} hintergrund="weiss" label={strang ? t.faeden.strang.label : t.faeden.vorschlaege.kopf}>
      {strang ? (
        <StrangBearbeiten key={strang.id} strang={strang} daten={daten} />
      ) : (
        <>
          <FaedenAlsStraenge daten={daten} wenige={6} />
          <StrangVorschlaegeListe daten={daten} />
        </>
      )}
    </Inspektor>
  );
}
