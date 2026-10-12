/** Inspektor des Beziehungsnetzes: Figur, Beziehung (B-04), Gruppe (A-02) oder Übersicht mit Legende. */
import { useMemo } from 'react';
import type { Index } from '@core/index/index';
import type { BeziehungsKategorie, Id, ProjektDaten } from '@core/model/types';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Chip, Inspektor, klassen, RealitaetsUmschalter, Segment } from '../../ui';
import { GruppenInspektor } from '../gruppen';
import { EntwurfFeld } from './EntwurfFeld';
import { farbSatz, GRUPPENTYP_LABEL, KATEGORIE_LABEL, KATEGORIEN, kapitelIndex, kapitelTitel, kapLabel } from './gemeinsam';
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
      label="Inspektor Beziehungen"
      style={{ gap: 12 }}
    >
      {inhalt}
    </Inspektor>
  );
}

function Legende({ ansicht }: { ansicht: NetzAnsicht }) {
  const flaechen = [...ansicht.flaechen].sort((a, b) => a.rechteck.x - b.rechteck.x);
  return (
    <div className="pw-bz-legende">
      <strong>Legende</strong>
      <span>Gestrichelte Karte: Existenz nicht gesichert oder nur erwähnt</span>
      {flaechen.length > 0 && (
        <span>
          {flaechen.map((f) => `${f.farben.name} Fläche: ${GRUPPENTYP_LABEL[f.gruppe.typ]} ${f.gruppe.name}`).join(' · ')}
        </span>
      )}
      {ansicht.ausgeblendet.length > 0 && (
        <span>Ausgeblendet über Filter: {ansicht.ausgeblendet.map((f) => f.name).join(', ')}</span>
      )}
    </div>
  );
}

function Uebersicht({ daten, ansicht, standIdx }: Props) {
  const figuren = ansicht.karten.length + ansicht.ohnePosition.length;
  return (
    <>
      <Abschnittslabel>Stand</Abschnittslabel>
      <strong className="pw-bz-name">Ende {kapLabel(daten, daten.projekt.kapitel[standIdx] ?? '')}</strong>
      <span className="pw-bz-text">
        {figuren === 1 ? 'Eine Figur' : `${figuren} Figuren`} und{' '}
        {ansicht.paare.length === 1 ? 'eine Beziehung' : `${ansicht.paare.length} Beziehungen`} sind bis hierhin bekannt.
      </span>
      <span className="pw-bz-text">
        Klicke eine Karte, Linie oder Fläche an. Neue Beziehung: vom Punkt am Kartenrand auf eine andere Karte ziehen oder
        „+ Beziehung“.
      </span>
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
  const f = daten.figuren[id]!;
  const paare = useMemo(() => beziehungsPaare(daten).filter((p) => p.a === id || p.b === id), [daten, id]);
  const partner = new Set(paare.map((p) => (p.a === id ? p.b : p.a)));
  const kandidaten = Object.values(daten.figuren)
    .filter((x) => x.id !== id && !partner.has(x.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sichtbar = figurSichtbar(daten, index, id, standIdx);

  return (
    <>
      <Abschnittslabel>Ausgewählt</Abschnittslabel>
      <strong className="pw-bz-name">{f.name}</strong>
      <span className="pw-bz-text">{figurBisher(daten, index, id, standIdx)}</span>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">Existenz</span>
        <RealitaetsUmschalter
          variante="segment"
          groesse="hoch"
          label="Existenz"
          wert={f.existenz}
          onChange={(existenz) => void speichereFigur({ ...f, existenz })}
        />
      </div>
      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`wahrheit-${id}`}>
          Wahrheit hinter den Kulissen <span style={{ fontWeight: 600 }}>(nur für dich, erscheint nie im Text)</span>
        </label>
        <EntwurfFeld
          key={`wahrheit-${id}`}
          id={`wahrheit-${id}`}
          mehrzeilig
          zeilen={5}
          placeholder="Was weißt nur du über diese Figur?"
          wert={f.wahrheit}
          onSpeichern={(wahrheit) => void speichereFigur({ ...daten.figuren[id]!, wahrheit })}
          style={{ padding: 10 }}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">Beziehungen{sichtbar ? '' : ' (noch nicht eingeführt)'}</span>
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
                <strong>{anderer.name}</strong> · {e.beziehung.art || 'ohne Bezeichnung'}
              </span>
              <span className="pw-bz-zeile__neben">
                {akt
                  ? akt.beziehung.abKapitel
                    ? `seit ${kapLabel(daten, akt.beziehung.abKapitel)}`
                    : ''
                  : `ab ${kapLabel(daten, erster.beziehung.abKapitel ?? '')}`}
              </span>
            </button>
          );
        })}
        {paare.length === 0 && <span className="pw-bz-text">Noch keine Beziehungen.</span>}
        {kandidaten.length > 0 && (
          <select
            className="pw-bz-select"
            aria-label="Beziehung hinzufügen"
            value=""
            onChange={async (e) => {
              const zu = e.target.value;
              if (!zu) return;
              const r = await beziehungAnlegen(id, zu);
              if (r) waehleImNetz({ typ: 'beziehung', paar: paarSchluessel(id, zu), eintrag: r });
            }}
          >
            <option value="">+ Beziehung zu …</option>
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
          Figurenkarte öffnen
        </Button>
        {f.netz && (
          <Button variante="leise" onClick={() => void figurImNetzSetzen(id, null).then(() => waehleImNetz(null))}>
            Aus dem Netz nehmen
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
  const paar = useMemo(() => beziehungsPaare(daten).find((p) => p.schluessel === schluessel), [daten, schluessel]);
  const liste = useMemo(() => (paar ? belege(daten, index, paar.a, paar.b) : []), [daten, index, paar]);
  if (!paar) return <span className="pw-bz-text">Diese Beziehung gibt es nicht mehr.</span>;

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
      <Abschnittslabel farbe={farben.dunkel}>Beziehung · {KATEGORIE_LABEL[b.kategorie]}</Abschnittslabel>
      <strong className="pw-bz-name">
        {von.name} – {zu.name}
      </strong>
      <span className="pw-bz-text">
        {aktuell
          ? `Stand Ende Kap. ${standIdx + 1}: ${aktuell.beziehung.art || 'ohne Bezeichnung'}`
          : `Noch nicht eingeführt (ab ${kapLabel(daten, paar.eintraege[0]!.beziehung.abKapitel ?? '')}).`}
      </span>

      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">Verlauf</span>
        {paar.eintraege.map((e) => (
          <button
            key={`${e.von}-${e.index}`}
            type="button"
            className={klassen('pw-bz-zeile', e === gewaehlt && 'pw-bz-zeile--aktiv')}
            aria-pressed={e === gewaehlt}
            onClick={() => waehleEintrag(e)}
          >
            <span>{e.beziehung.art || <em>ohne Bezeichnung</em>}</span>
            <span className="pw-bz-zeile__neben">
              {e.beziehung.abKapitel ? `ab ${kapLabel(daten, e.beziehung.abKapitel)}` : 'von Anfang an'}
            </span>
          </button>
        ))}
        <Button
          variante="text"
          klein
          style={{ alignSelf: 'flex-start', marginLeft: -10 }}
          onClick={async () => waehleEintrag(await bezeichnungHinzufuegen(letzte.von, letzte.zu, naechstes))}
        >
          + Neue Bezeichnung ab späterem Kapitel
        </Button>
      </div>

      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`art-${schl}`}>
          Art
        </label>
        <EntwurfFeld
          key={`art-${schl}`}
          id={`art-${schl}`}
          wert={b.art}
          placeholder="z. B. Kollege, erstes Treffen"
          autoFocus={!b.art}
          onSpeichern={(art) => aendern({ art: art.trim() })}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">Kategorie</span>
        <Segment<BeziehungsKategorie>
          rolle="group"
          voll
          label="Kategorie"
          wert={b.kategorie}
          onChange={(kategorie) => aendern({ kategorie })}
          optionen={KATEGORIEN.map((k) => ({ wert: k, label: KATEGORIE_LABEL[k] }))}
        />
      </div>
      <div className="pw-bz-feld">
        <span className="pw-bz-feldlabel">Strang</span>
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
          Gilt ab Kapitel
        </label>
        <select
          id={`ab-${schl}`}
          className="pw-bz-select"
          value={b.abKapitel ?? ''}
          onChange={(e) => aendern({ abKapitel: e.target.value || undefined })}
        >
          <option value="">von Anfang an</option>
          {daten.projekt.kapitel.map((k) => (
            <option key={k} value={k}>
              {kapitelTitel(daten, k)}
            </option>
          ))}
        </select>
      </div>
      <Checkbox checked={!!b.unsicher} onChange={(e) => aendern({ unsicher: e.target.checked || undefined })}>
        Gestrichelt: nur erwähnt oder unsicher
      </Checkbox>
      <div className="pw-bz-feld">
        <label className="pw-bz-feldlabel" htmlFor={`notiz-${schl}`}>
          Notiz
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
        <span className="pw-bz-feldlabel">Belege aus dem Text</span>
        {liste.length === 0 && <span className="pw-bz-text">Kein Kapitel, in dem beide vorkommen.</span>}
        {liste.map((l) => (
          <button
            key={l.kapitel}
            type="button"
            className="pw-bz-beleg"
            title="Stelle im Text öffnen"
            onClick={() => markiere({ kapitel: l.kapitel, anker: l.anker })}
          >
            <span className="pw-bz-beleg__kap">
              {kapitelTitel(daten, l.kapitel)}
              {kapitelIndex(daten, l.kapitel) > standIdx ? ' · nach dem Stand' : ''}
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
        {paar.eintraege.length > 1 ? 'Diese Bezeichnung entfernen' : 'Beziehung entfernen'}
      </Button>
    </>
  );
}

function GruppeTeil({ ansicht, id }: Props & { id: Id }) {
  const waehleImNetz = useStore((s) => s.waehleImNetz);
  const gruppeImNetzSetzen = useStore((s) => s.gruppeImNetzSetzen);
  const hatFlaeche = ansicht.flaechen.some((f) => f.gruppe.id === id);
  return (
    <>
      <GruppenInspektor gruppe={id} onFigur={(f) => waehleImNetz({ typ: 'figur', id: f })} />
      {hatFlaeche && (
        <Button
          variante="leise"
          style={{ alignSelf: 'flex-start', marginLeft: -10 }}
          onClick={() => void gruppeImNetzSetzen(id, null).then(() => waehleImNetz(null))}
        >
          Fläche aus dem Netz nehmen
        </Button>
      )}
      <Legende ansicht={ansicht} />
    </>
  );
}
