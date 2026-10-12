/** Inspektor des Beziehungsnetzes: Figur, Beziehung (B-04), Gruppe (A-02) oder Übersicht mit Legende. */
import { useMemo } from 'react';
import type { Index } from '@core/index/index';
import type { BeziehungsKategorie, Id, ProjektDaten } from '@core/model/types';
import { f, useTexte, vergleich } from '../../i18n';
import { useStore } from '../../state/store';
import { Abschnittslabel, bestaetigen as rueckfrage, Button, Checkbox, Chip, Inspektor, klassen, RealitaetsUmschalter, Segment } from '../../ui';
import { GruppenInspektor } from '../gruppen';
import { EntwurfFeld } from './EntwurfFeld';
import { farbSatz, KATEGORIEN, kapitelIndex, kapitelTitel, kapLabel } from './gemeinsam';
import {
  aktuellerEintrag,
  beziehungsPaare,
  belege,
  eintragFarbe,
  figurBisher,
  figurSichtbar,
  paarSchluessel,
  type BeziehungsEintrag,
  type NetzAnsicht,
} from './logik';

interface Props {
  daten: ProjektDaten;
  index: Index;
  ansicht: NetzAnsicht;
  standIdx: number;
}

export function NetzInspektor(props: Props) {
  const auswahl = useStore((s) => s.netzAuswahl);
  const t = useTexte();
  let inhalt;
  if (auswahl?.typ === 'figur' && props.daten.figuren[auswahl.id]) inhalt = <FigurTeil {...props} id={auswahl.id} />;
  else if (auswahl?.typ === 'beziehung') inhalt = <BeziehungTeil {...props} paar={auswahl.paar} eintrag={auswahl.eintrag} />;
  else if (auswahl?.typ === 'gruppe' && props.daten.gruppen[auswahl.id]) inhalt = <GruppeTeil {...props} id={auswahl.id} />;
  else inhalt = <Uebersicht {...props} />;
  return (
    <Inspektor
      key={auswahl ? `${auswahl.typ}:${auswahl.typ === 'beziehung' ? auswahl.paar : auswahl.id}` : 'uebersicht'}
      breite={300}
      hintergrund="weiss"
      label={t.beziehungen.inspektor.label}
      style={{ gap: 12 }}
    >
      {inhalt}
    </Inspektor>
  );
}

function Legende({ ansicht }: { ansicht: NetzAnsicht }) {
  const t = useTexte();
  const ti = t.beziehungen.inspektor;
  const flaechen = [...ansicht.flaechen].sort((a, b) => a.rechteck.x - b.rechteck.x);
  return (
    <div className="pw-bz-legende">
      <strong>{ti.legende}</strong>
      <span>{ti.legendeGestrichelt}</span>
      {flaechen.length > 0 && (
        <span>
          {flaechen
            .map((x) => f(ti.flaecheEintrag, { flaeche: ti.flaeche[x.farben.name], typ: t.beziehungen.gruppenTyp[x.gruppe.typ], name: x.gruppe.name }))
            .join(' · ')}
        </span>
      )}
      {ansicht.ausgeblendet.length > 0 && (
        <span>{f(ti.ausgeblendet, { namen: ansicht.ausgeblendet.map((x) => x.name).join(', ') })}</span>
      )}
    </div>
  );
}

function Uebersicht({ daten, ansicht, standIdx }: Props) {
  const ti = useTexte().beziehungen.inspektor;
  const figuren = ansicht.karten.length + ansicht.ohnePosition.length;
  return (
    <>
      <Abschnittslabel>{ti.stand}</Abschnittslabel>
      <strong className="pw-bz-name">{f(ti.standEnde, { kap: kapLabel(daten, daten.projekt.kapitel[standIdx] ?? '') })}</strong>
      <span className="pw-bz-text">
        {f(ti.bekannt, {
          figuren: f(ti.figurenAnzahl, { n: figuren }),
          beziehungen: f(ti.beziehungenAnzahl, { n: ansicht.paare.length }),
        })}
      </span>
      <span className="pw-bz-text">{ti.hilfe}</span>
      <Legende ansicht={ansicht} />
    </>
  );
}

function FigurTeil({ daten, index, ansicht, standIdx, id }: Props & { id: Id }) {
  const speichereFigur = useStore((s) => s.speichereFigur);
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const oeffne = useStore((s) => s.oeffne);
  const beziehungAnlegen = useStore((s) => s.beziehungAnlegen);
  const figurImNetzSetzen = useStore((s) => s.figurImNetzSetzen);
  const t = useTexte();
  const ti = t.beziehungen.inspektor;
  const figur = daten.figuren[id]!;
  const paare = useMemo(() => beziehungsPaare(daten).filter((p) => p.a === id || p.b === id), [daten, id]);
  const partner = new Set(paare.map((p) => (p.a === id ? p.b : p.a)));
  const kandidaten = Object.values(daten.figuren)
    .filter((x) => x.id !== id && !partner.has(x.id))
    .sort((a, b) => vergleich(a.name, b.name));
  const sichtbar = figurSichtbar(daten, index, id, standIdx);

  return (
    <>
      <Abschnittslabel>{ti.ausgewaehlt}</Abschnittslabel>
      <strong className="pw-bz-name">{figur.name}</strong>
      <span className="pw-bz-text">{figurBisher(daten, index, id, standIdx)}</span>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">{ti.existenz}</span>
        <RealitaetsUmschalter
          variante="segment"
          groesse="hoch"
          label={ti.existenz}
          wert={figur.existenz}
          onChange={(existenz) => void speichereFigur({ ...figur, existenz })}
        />
      </div>
      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`wahrheit-${id}`}>
          {ti.wahrheit} <span style={{ fontWeight: 600 }}>{ti.wahrheitZusatz}</span>
        </label>
        <EntwurfFeld
          key={`wahrheit-${id}`}
          id={`wahrheit-${id}`}
          mehrzeilig
          zeilen={5}
          placeholder={ti.wahrheitPlatzhalter}
          wert={figur.wahrheit}
          onSpeichern={(wahrheit) => void speichereFigur({ ...daten.figuren[id]!, wahrheit })}
          style={{ padding: 10 }}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">
          {ti.beziehungen}
          {sichtbar ? '' : ti.nochNichtEingefuehrtZusatz}
        </span>
        {paare.map((p) => {
          const anderer = daten.figuren[p.a === id ? p.b : p.a]!;
          const akt = aktuellerEintrag(daten, p, standIdx);
          const erster = p.eintraege[0]!;
          const e = akt ?? erster;
          return (
            <button
              key={p.schluessel}
              type="button"
              className="pw-bz-zeile"
              onClick={() => waehleImNetz({ typ: 'beziehung', paar: p.schluessel })}
            >
              <span>
                <strong>{anderer.name}</strong> · {e.beziehung.art || t.beziehungen.logik.ohneBezeichnung}
              </span>
              <span className="pw-bz-zeile__neben">
                {akt
                  ? akt.beziehung.abKapitel
                    ? f(ti.seit, { kap: kapLabel(daten, akt.beziehung.abKapitel) })
                    : ''
                  : f(ti.ab, { kap: kapLabel(daten, erster.beziehung.abKapitel ?? '') })}
              </span>
            </button>
          );
        })}
        {paare.length === 0 && <span className="pw-bz-text">{ti.keineBeziehungen}</span>}
        {kandidaten.length > 0 && (
          <select
            className="pw-bz-select"
            aria-label={ti.beziehungHinzufuegen}
            value=""
            onChange={async (e) => {
              const zu = e.target.value;
              if (!zu) return;
              const r = await beziehungAnlegen(id, zu);
              if (r) waehleImNetz({ typ: 'beziehung', paar: paarSchluessel(id, zu), eintrag: r });
            }}
          >
            <option value="">{ti.beziehungZu}</option>
            {kandidaten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: -10 }}>
        <Button variante="text" onClick={() => oeffne('figuren', { figur: id })}>
          {ti.figurenkarteOeffnen}
        </Button>
        {figur.netz && (
          <Button variante="leise" onClick={() => void figurImNetzSetzen(id, null).then(() => waehleImNetz(null))}>
            {ti.ausDemNetz}
          </Button>
        )}
      </div>
      <Legende ansicht={ansicht} />
    </>
  );
}

function BeziehungTeil({
  daten,
  index,
  standIdx,
  paar: schluessel,
  eintrag,
}: Props & { paar: string; eintrag?: { von: Id; index: number } }) {
  const beziehungAendern = useStore((s) => s.beziehungAendern);
  const beziehungEntfernen = useStore((s) => s.beziehungEntfernen);
  const bezeichnungHinzufuegen = useStore((s) => s.bezeichnungHinzufuegen);
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const markiere = useStore((s) => s.markiere);
  const t = useTexte();
  const ti = t.beziehungen.inspektor;
  const ohneBezeichnung = t.beziehungen.logik.ohneBezeichnung;
  const paar = useMemo(() => beziehungsPaare(daten).find((p) => p.schluessel === schluessel), [daten, schluessel]);
  const liste = useMemo(() => (paar ? belege(daten, index, paar.a, paar.b) : []), [daten, index, paar]);
  if (!paar) return <span className="pw-bz-text">{ti.gibtEsNichtMehr}</span>;

  const aktuell = aktuellerEintrag(daten, paar, standIdx);
  const gewaehlt: BeziehungsEintrag =
    (eintrag && paar.eintraege.find((e) => e.von === eintrag.von && e.index === eintrag.index)) ?? aktuell ?? paar.eintraege.at(-1)!;
  const b = gewaehlt.beziehung;
  const von = daten.figuren[gewaehlt.von]!;
  const zu = daten.figuren[gewaehlt.zu]!;
  const farben = eintragFarbe(daten, b);
  const schl = `${gewaehlt.von}-${gewaehlt.index}`;
  const aendern = (teil: Parameters<typeof beziehungAendern>[2]) => void beziehungAendern(gewaehlt.von, gewaehlt.index, teil);
  const waehleEintrag = (e: { von: Id; index: number }) => waehleImNetz({ typ: 'beziehung', paar: schluessel, eintrag: e });

  // nächstes Kapitel nach der letzten Bezeichnung als Vorschlag für eine neue
  const letzte = paar.eintraege.at(-1)!;
  const naechstes =
    daten.projekt.kapitel[
      Math.min(daten.projekt.kapitel.length - 1, Math.max(standIdx, kapitelIndex(daten, letzte.beziehung.abKapitel) + 1))
    ];

  return (
    <>
      <Abschnittslabel farbe={farben.dunkel}>{f(ti.beziehungKategorie, { kategorie: t.beziehungen.kategorie[b.kategorie] })}</Abschnittslabel>
      <strong className="pw-bz-name">
        {von.name} – {zu.name}
      </strong>
      <span className="pw-bz-text">
        {aktuell
          ? f(ti.standEndeArt, { nr: standIdx + 1, art: aktuell.beziehung.art || ohneBezeichnung })
          : f(ti.nochNichtEingefuehrtAb, { kap: kapLabel(daten, paar.eintraege[0]!.beziehung.abKapitel ?? '') })}
      </span>

      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">{ti.verlauf}</span>
        {paar.eintraege.map((e) => (
          <button
            key={`${e.von}-${e.index}`}
            type="button"
            className={klassen('pw-bz-zeile', e === gewaehlt && 'pw-bz-zeile--aktiv')}
            aria-pressed={e === gewaehlt}
            onClick={() => waehleEintrag(e)}
          >
            <span>{e.beziehung.art || <em>{ohneBezeichnung}</em>}</span>
            <span className="pw-bz-zeile__neben">
              {e.beziehung.abKapitel ? f(ti.ab, { kap: kapLabel(daten, e.beziehung.abKapitel) }) : ti.vonAnfangAn}
            </span>
          </button>
        ))}
        <Button
          variante="text"
          klein
          style={{ alignSelf: 'flex-start', marginLeft: -10 }}
          onClick={async () => waehleEintrag(await bezeichnungHinzufuegen(letzte.von, letzte.zu, naechstes))}
        >
          {ti.neueBezeichnung}
        </Button>
      </div>

      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`art-${schl}`}>
          {ti.art}
        </label>
        <EntwurfFeld
          key={`art-${schl}`}
          id={`art-${schl}`}
          wert={b.art}
          placeholder={ti.artPlatzhalter}
          autoFocus={!b.art}
          onSpeichern={(art) => aendern({ art: art.trim() })}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">{ti.kategorie}</span>
        <Segment<BeziehungsKategorie>
          rolle="group"
          voll
          label={ti.kategorie}
          wert={b.kategorie}
          onChange={(kategorie) => aendern({ kategorie })}
          optionen={KATEGORIEN.map((k) => ({ wert: k, label: t.beziehungen.kategorie[k] }))}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">{ti.strang}</span>
        <div className="pw-bz-chips">
          {daten.straenge.map((s) => (
            <Chip
              key={s.id}
              variante="knopf"
              punkt={farbSatz(s.farbe).farbe}
              aktiv={b.strang === s.id}
              onClick={() => aendern({ strang: b.strang === s.id ? undefined : s.id })}
            >
              {s.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`ab-${schl}`}>
          {ti.giltAb}
        </label>
        <select
          id={`ab-${schl}`}
          className="pw-bz-select"
          value={b.abKapitel ?? ''}
          onChange={(e) => aendern({ abKapitel: e.target.value || undefined })}
        >
          <option value="">{ti.vonAnfangAn}</option>
          {daten.projekt.kapitel.map((k) => (
            <option key={k} value={k}>
              {kapitelTitel(daten, k)}
            </option>
          ))}
        </select>
      </div>
      <Checkbox checked={!!b.unsicher} onChange={(e) => aendern({ unsicher: e.target.checked || undefined })}>
        {ti.gestrichelt}
      </Checkbox>
      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`notiz-${schl}`}>
          {ti.notiz}
        </label>
        <EntwurfFeld
          key={`notiz-${schl}`}
          id={`notiz-${schl}`}
          mehrzeilig
          zeilen={3}
          wert={b.notiz ?? ''}
          onSpeichern={(notiz) => aendern({ notiz: notiz.trim() ? notiz : undefined })}
        />
      </div>

      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">{ti.belege}</span>
        {liste.length === 0 && <span className="pw-bz-text">{ti.keineBelege}</span>}
        {liste.map((l) => (
          <button
            key={l.kapitel}
            type="button"
            className="pw-bz-beleg"
            title={ti.stelleOeffnen}
            onClick={() => markiere({ kapitel: l.kapitel, anker: l.anker })}
          >
            <span className="pw-bz-beleg__kap">
              {kapitelTitel(daten, l.kapitel)}
              {kapitelIndex(daten, l.kapitel) > standIdx ? ti.nachDemStand : ''}
            </span>
            <span className="pw-bz-beleg__text">{l.text}</span>
          </button>
        ))}
      </div>

      <Button
        variante="text"
        className="pw-bz-entfernen"
        style={{ alignSelf: 'flex-start', marginLeft: -10 }}
        onClick={() => void beziehungEntfernen(gewaehlt.von, gewaehlt.index)}
      >
        {paar.eintraege.length > 1 ? ti.bezeichnungEntfernen : ti.beziehungEntfernen}
      </Button>
    </>
  );
}

function GruppeTeil({ ansicht, id }: Props & { id: Id }) {
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const gruppeImNetzSetzen = useStore((s) => s.gruppeImNetzSetzen);
  const entferneGruppe = useStore((s) => s.entferneGruppe);
  const name = useStore((s) => s.daten?.gruppen[id]?.name ?? '');
  const t = useTexte();
  const ti = t.beziehungen.inspektor;
  const hatFlaeche = ansicht.flaechen.some((x) => x.gruppe.id === id);
  return (
    <>
      <GruppenInspektor gruppe={id} onFigur={(f) => waehleImNetz({ typ: 'figur', id: f })} />
      {hatFlaeche && (
        <Button
          variante="leise"
          style={{ alignSelf: 'flex-start', marginLeft: -10 }}
          onClick={() => void gruppeImNetzSetzen(id, null).then(() => waehleImNetz(null))}
        >
          {ti.flaecheAusDemNetz}
        </Button>
      )}
      <Button
        variante="leise"
        style={{ alignSelf: 'flex-start', marginLeft: -10 }}
        onClick={async () => {
          if (!(await rueckfrage(f(ti.gruppeLoeschenFrage, { name }), { knopf: t.gemeinsam.loeschen }))) return;
          waehleImNetz(null);
          await entferneGruppe(id);
        }}
      >
        {ti.gruppeLoeschen}
      </Button>
      <Legende ansicht={ansicht} />
    </>
  );
}
