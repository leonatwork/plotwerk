/** Antagonisten/Gruppen (A-01, A-02): Präsenzstreifen, wiederverwendbare Karte und Inspektor-Inhalt. */
import { useMemo, useState } from 'react';
import type { Gruppe, GruppenTyp, Id } from '@core/model/types';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Chip, klassen, Segment, Textfeld } from '../../ui';
import { EntwurfFeld } from '../beziehungen/EntwurfFeld';
import { farbSatz, findeStelle, GRUPPENTYP_LABEL, kapitelTitel, roemisch, strangVon } from '../beziehungen/gemeinsam';
import { praesenzProAkt, praesenzProKapitel, spurPruefen, type KapitelPraesenz } from './logik';
import './gruppen.css';

const STATUS_LABEL: Record<Gruppe['status'], string> = { im_text: 'im Text', geplant: 'geplant' };
const SPUR_LABEL = { vorschlag: 'Vorschlag', bestaetigt: 'bestätigt', verworfen: 'verworfen' } as const;
const TYPEN: GruppenTyp[] = ['antagonist', 'firma', 'familie', 'sonstige'];

function useGruppe(id: Id) {
  const daten = useStore((s) => s.daten);
  const index = useStore((s) => s.index);
  const gruppe = daten?.gruppen[id];
  const farben = farbSatz(daten && gruppe ? strangVon(daten, gruppe.strang)?.farbe : null);
  return { daten, index, gruppe, farben };
}

const ZUSTAND_TEXT: Record<KapitelPraesenz['zustand'], string> = {
  im_text: 'Mitglied im Text',
  spur: 'Spur im Text',
  plan: 'nur im Plan',
  leer: 'nicht präsent',
};

/** Kapitelstreifen der Präsenz: gefüllt = Mitglied im Text, umrandet = Spur, schraffiert = nur im Plan. */
export function PraesenzStreifen({ gruppe: id, kompakt }: { gruppe: Id; kompakt?: boolean }) {
  const { daten, index, gruppe, farben } = useGruppe(id);
  const markiere = useStore((s) => s.markiere);
  const oeffne = useStore((s) => s.oeffne);
  const zellen = useMemo(() => (daten && gruppe ? praesenzProKapitel(daten, index, gruppe) : []), [daten, index, gruppe]);
  if (!daten || !gruppe) return null;

  const oeffneZelle = (z: KapitelPraesenz) => {
    if (z.zustand === 'spur') {
      const p = z.spuren.map((s) => spurPruefen(daten, s)).find((x) => x.stelle);
      if (p?.stelle) return markiere({ kapitel: z.kapitel, anker: p.stelle.anker });
    }
    if (z.zustand === 'im_text') {
      const e = index.erwaehnungen.find((x) => x.kapitel === z.kapitel && x.zielTyp === 'figur' && z.mitglieder.includes(x.ziel));
      const stelle = e ? findeStelle(daten, z.kapitel, e.treffer) : null;
      if (stelle) return markiere({ kapitel: z.kapitel, anker: stelle.anker });
    }
    oeffne('schreiben', { kapitel: z.kapitel });
  };

  return (
    <div
      className={klassen('pw-gr-streifen', kompakt && 'pw-gr-streifen--kompakt')}
      style={{ gridTemplateColumns: `repeat(${zellen.length}, minmax(0, 1fr))` }}
      role="list"
      aria-label={`Präsenz von ${gruppe.name} pro Kapitel`}
    >
      {zellen.map((z) => {
        const name = z.mitglieder.map((m) => daten.figuren[m]?.name ?? m).join(', ');
        const titel = `${kapitelTitel(daten, z.kapitel)}: ${ZUSTAND_TEXT[z.zustand]}${name ? ` (${name})` : ''}${
          z.spuren.length ? ` · ${z.spuren.map((s) => `»${s.text}«`).join(', ')}` : ''
        }`;
        return (
          <button
            key={z.kapitel}
            type="button"
            role="listitem"
            className={klassen('pw-gr-zelle', `pw-gr-zelle--${z.zustand}`)}
            style={
              z.zustand === 'im_text' ? { background: farben.farbe } : z.zustand === 'spur' ? { color: farben.farbe } : undefined
            }
            title={titel}
            aria-label={titel}
            onClick={(e) => {
              e.stopPropagation();
              oeffneZelle(z);
            }}
          >
            <span style={z.zustand === 'spur' ? { color: 'var(--ink)' } : undefined}>{z.nummer}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface GruppenKarteProps {
  gruppe: Id;
  /** kleine Zellen, ohne Spurenzeile (z. B. Akt-Kopf) */
  kompakt?: boolean;
  aktiv?: boolean;
  onClick?(): void;
}

/** Wiederverwendbare Karte einer Gruppe: Typ, Status, Mitglieder, Präsenz pro Kapitel, offene Spuren. */
export function GruppenKarte({ gruppe: id, kompakt, aktiv, onClick }: GruppenKarteProps) {
  const { daten, gruppe, farben } = useGruppe(id);
  if (!daten || !gruppe) return null;
  const mitglieder = gruppe.mitglieder.map((m) => daten.figuren[m]?.name).filter(Boolean);
  const vorschlaege = gruppe.spuren.filter((s) => s.status === 'vorschlag').length;
  const Element = onClick ? 'button' : 'div';
  return (
    <Element
      type={onClick ? 'button' : undefined}
      className={klassen('pw-gr-karte', aktiv && 'pw-gr-karte--aktiv')}
      style={{ background: farben.flaeche, borderColor: farben.flaecheLinie }}
      onClick={onClick}
      aria-pressed={onClick ? !!aktiv : undefined}
    >
      <span className="pw-gr-karte__label" style={{ color: farben.dunkel }}>
        {GRUPPENTYP_LABEL[gruppe.typ]} · {STATUS_LABEL[gruppe.status]}
      </span>
      <span className="pw-gr-karte__name">{gruppe.name}</span>
      <span className="pw-gr-karte__mitglieder">{mitglieder.length ? mitglieder.join(', ') : 'noch keine Figur'}</span>
      <PraesenzStreifen gruppe={id} kompakt />
      {!kompakt && vorschlaege > 0 && (
        <span className="pw-gr-karte__mitglieder">
          {vorschlaege} {vorschlaege === 1 ? 'Spur' : 'Spuren'} zu prüfen
        </span>
      )}
    </Element>
  );
}

export interface GruppenInspektorProps {
  gruppe: Id;
  /** Klick auf ein Mitglied (Standard: Figurenkarte öffnen) */
  onFigur?(id: Id): void;
}

/** Inhalt des Inspektors für eine Gruppe (Typ, Status, Strang, Mitglieder, Präsenz, Spuren, Notizen). */
export function GruppenInspektor({ gruppe: id, onFigur }: GruppenInspektorProps) {
  const { daten, index, gruppe, farben } = useGruppe(id);
  const gruppeAendern = useStore((s) => s.gruppeAendern);
  const mitgliedHinzufuegen = useStore((s) => s.mitgliedHinzufuegen);
  const mitgliedEntfernen = useStore((s) => s.mitgliedEntfernen);
  const spurStatusSetzen = useStore((s) => s.spurStatusSetzen);
  const spurHinzufuegen = useStore((s) => s.spurHinzufuegen);
  const markiere = useStore((s) => s.markiere);
  const oeffne = useStore((s) => s.oeffne);
  const [verworfeneZeigen, setVerworfeneZeigen] = useState(false);
  const [neueSpur, setNeueSpur] = useState('');
  const [neuesKapitel, setNeuesKapitel] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);

  const akte = useMemo(() => (daten && gruppe ? praesenzProAkt(daten, index, gruppe) : []), [daten, index, gruppe]);
  const pruefungen = useMemo(
    () => (daten && gruppe ? gruppe.spuren.map((s) => spurPruefen(daten, s)) : []),
    [daten, gruppe],
  );
  if (!daten || !gruppe) return <span className="pw-gr-legende">Gruppe nicht gefunden.</span>;

  const zeigeFigur = onFigur ?? ((f: Id) => oeffne('figuren', { figur: f }));
  const nichtMitglieder = Object.values(daten.figuren)
    .filter((f) => !gruppe.mitglieder.includes(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sichtbar = pruefungen.filter((p) => p.spur.status !== 'verworfen');
  const verworfen = pruefungen.filter((p) => p.spur.status === 'verworfen');
  const offen = sichtbar.filter((p) => p.spur.status === 'vorschlag').length;
  const kapitelMitText = daten.projekt.kapitel.filter((k) => daten.kapitel[k]?.text.trim());

  const praesenzSetzen = (akt: number, text: string) => {
    const praesenz = { ...gruppe.praesenz };
    if (text.trim()) praesenz[akt] = text.trim();
    else delete praesenz[akt];
    void gruppeAendern(id, { praesenz });
  };

  const spurAnlegen = async () => {
    const kapitel = neuesKapitel || kapitelMitText[kapitelMitText.length - 1] || '';
    const spur = await spurHinzufuegen(id, { text: neueSpur, kapitel });
    if (!spur) return;
    setNeueSpur('');
    setMeldung(spur.anker ? null : `»${spur.text}« steht nicht wörtlich in ${kapitelTitel(daten, kapitel)}.`);
  };

  const spurListe = (liste: typeof pruefungen) =>
    liste.map((p) => (
      <div key={p.spur.id} className={klassen('pw-gr-spur', p.spur.status === 'verworfen' && 'pw-gr-spur--verworfen')}>
        <div className="pw-gr-spur__kopf">
          <span className="pw-gr-spur__text">»{p.spur.text}«</span>
          <span style={{ color: 'var(--ink-quiet)' }}>{p.kapitelLabel}</span>
          <span
            className="pw-gr-spur__status"
            style={{ color: p.spur.status === 'bestaetigt' ? 'var(--real-gesichert)' : p.spur.status === 'vorschlag' ? farben.dunkel : 'var(--ink-quiet)' }}
          >
            {SPUR_LABEL[p.spur.status]}
          </span>
        </div>
        {p.stelle ? (
          <button
            type="button"
            className="pw-gr-spur__stelle"
            title="Stelle im Text öffnen"
            onClick={() => markiere({ kapitel: p.spur.kapitel, anker: p.stelle!.anker })}
          >
            {p.ausschnitt}
          </button>
        ) : (
          <span className="pw-gr-spur__warnung">
            {p.zustand === 'verwaist' ? 'Stelle nicht mehr eindeutig im Text (verwaist).' : 'Wortlaut nicht im Kapitel gefunden.'}
          </span>
        )}
        <div className="pw-gr-spur__aktionen">
          {p.spur.status === 'vorschlag' ? (
            <>
              <Button klein onClick={() => void spurStatusSetzen(id, p.spur.id, 'bestaetigt')}>
                Bestätigen
              </Button>
              <Button klein variante="text" onClick={() => void spurStatusSetzen(id, p.spur.id, 'verworfen')}>
                Verwerfen
              </Button>
            </>
          ) : (
            <Button klein variante="text" onClick={() => void spurStatusSetzen(id, p.spur.id, 'vorschlag')}>
              {p.spur.status === 'verworfen' ? 'Wiederherstellen' : 'Zurücksetzen'}
            </Button>
          )}
        </div>
      </div>
    ));

  return (
    <div className="pw-gr-inspektor">
      <Abschnittslabel farbe={farben.dunkel}>
        {GRUPPENTYP_LABEL[gruppe.typ]} · {STATUS_LABEL[gruppe.status]}
      </Abschnittslabel>
      <div className="pw-gr-abschnitt">
        <label className="pw-gr-feldlabel" htmlFor={`gruppe-name-${id}`}>
          Name
        </label>
        <EntwurfFeld
          key={`name-${id}`}
          id={`gruppe-name-${id}`}
          className="pw-gr-name"
          wert={gruppe.name}
          onSpeichern={(name) => name.trim() && void gruppeAendern(id, { name: name.trim() })}
        />
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Typ</span>
        <Segment
          rolle="group"
          voll
          label="Typ"
          wert={gruppe.typ}
          onChange={(typ) => void gruppeAendern(id, { typ })}
          optionen={TYPEN.map((t) => ({ wert: t, label: GRUPPENTYP_LABEL[t] }))}
        />
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Status</span>
        <Segment
          rolle="group"
          voll
          label="Status"
          wert={gruppe.status}
          onChange={(status) => void gruppeAendern(id, { status })}
          optionen={[
            { wert: 'im_text', label: 'im Text' },
            { wert: 'geplant', label: 'geplant' },
          ]}
        />
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Strang</span>
        <div className="pw-gr-chips">
          {daten.straenge.map((s) => (
            <Chip
              key={s.id}
              variante="knopf"
              punkt={farbSatz(s.farbe).farbe}
              aktiv={gruppe.strang === s.id}
              onClick={() => void gruppeAendern(id, { strang: gruppe.strang === s.id ? undefined : s.id })}
            >
              {s.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Mitglieder</span>
        <div className="pw-gr-chips">
          {gruppe.mitglieder.map((m) => (
            <span key={m} className="pw-gr-mitglied">
              <button type="button" className="pw-gr-mitglied__name" onClick={() => zeigeFigur(m)}>
                {daten.figuren[m]?.name ?? m}
              </button>
              <button type="button" aria-label={`${daten.figuren[m]?.name ?? m} entfernen`} onClick={() => void mitgliedEntfernen(id, m)}>
                ×
              </button>
            </span>
          ))}
          {gruppe.mitglieder.length === 0 && <span className="pw-gr-legende">noch keine Figur</span>}
          {nichtMitglieder.length > 0 && (
            <select
              className="pw-gr-auswahl"
              aria-label="Mitglied hinzufügen"
              value=""
              onChange={(e) => e.target.value && void mitgliedHinzufuegen(id, e.target.value)}
            >
              <option value="">+ Mitglied</option>
              {nichtMitglieder.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.gruppe && daten.gruppen[f.gruppe] ? ` (bisher ${daten.gruppen[f.gruppe]!.name})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Präsenz pro Kapitel</span>
        <PraesenzStreifen gruppe={id} />
        <span className="pw-gr-legende">Gefüllt: Mitglied im Text · umrandet: Spur · schraffiert: nur im Plan</span>
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">Präsenz pro Akt</span>
        {akte.map((a) => (
          <div key={a.akt.nummer} className="pw-gr-akt">
            <label className="pw-gr-akt__titel" htmlFor={`praesenz-${id}-${a.akt.nummer}`}>
              Akt {roemisch(a.akt.nummer)}
            </label>
            <EntwurfFeld
              key={`praesenz-${id}-${a.akt.nummer}`}
              id={`praesenz-${id}-${a.akt.nummer}`}
              wert={a.geplant}
              placeholder="geplant, z. B. setzt die Frist"
              onSpeichern={(t) => praesenzSetzen(a.akt.nummer, t)}
            />
            <span className="pw-gr-akt__imtext">{a.imText}</span>
          </div>
        ))}
      </div>
      <div className="pw-gr-abschnitt">
        <span className="pw-gr-feldlabel">
          Spuren im Text{offen > 0 ? ` · ${offen} ${offen === 1 ? 'Vorschlag' : 'Vorschläge'}` : ''}
        </span>
        {sichtbar.length === 0 && <span className="pw-gr-legende">Noch keine Spuren.</span>}
        {spurListe(sichtbar)}
        {verworfen.length > 0 && (
          <Button klein variante="text" style={{ alignSelf: 'flex-start' }} onClick={() => setVerworfeneZeigen((v) => !v)}>
            {verworfeneZeigen ? 'Verworfene ausblenden' : `Verworfene zeigen (${verworfen.length})`}
          </Button>
        )}
        {verworfeneZeigen && spurListe(verworfen)}
        <form
          className="pw-gr-neu"
          onSubmit={(e) => {
            e.preventDefault();
            void spurAnlegen();
          }}
        >
          <Textfeld
            aria-label="Neue Spur, wörtlich aus dem Text"
            placeholder="Spur, wörtlich aus dem Text"
            value={neueSpur}
            onChange={(e) => setNeueSpur(e.target.value)}
          />
          <select aria-label="Kapitel der Spur" value={neuesKapitel} onChange={(e) => setNeuesKapitel(e.target.value)}>
            <option value="">Kapitel</option>
            {kapitelMitText.map((k) => (
              <option key={k} value={k}>
                {kapitelTitel(daten, k)}
              </option>
            ))}
          </select>
          <Button klein type="submit" disabled={!neueSpur.trim()}>
            +
          </Button>
        </form>
        {meldung && <span className="pw-gr-spur__warnung">{meldung}</span>}
      </div>
      <div className="pw-gr-abschnitt">
        <label className="pw-gr-feldlabel" htmlFor={`gruppe-notizen-${id}`}>
          Notizen <span style={{ fontWeight: 600 }}>(nur für dich)</span>
        </label>
        <EntwurfFeld
          key={`notizen-${id}`}
          id={`gruppe-notizen-${id}`}
          mehrzeilig
          zeilen={4}
          wert={gruppe.notizen}
          onSpeichern={(notizen) => void gruppeAendern(id, { notizen })}
        />
      </div>
    </div>
  );
}
