/** Liste der benannten Fassungen (G5): vergleichen, umbenennen, wiederherstellen, Eintrag entfernen. */
import type { BenannteFassung } from '@core/model/types';
import { AKTUELL, fassungenSortiert, fassungsKapitel, fassungsQuelle } from '@core/statistik';
import { useState } from 'react';
import { useStore } from '../../state/store';
import { Abschnittslabel, bestaetigen, Button, Feld, LeerZustand, mitteilen, Textbereich, Textfeld } from '../../ui';
import { kapitelAnzeige } from '../schreiben/verweise';
import { zeitpunktAnzeige } from './hooks';

function FassungEintrag({ f }: { f: BenannteFassung }) {
  const daten = useStore((s) => s.daten);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const st = useStore((s) => s.statistik);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [name, setName] = useState(f.name);
  const [notiz, setNotiz] = useState(f.notiz ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!daten) return null;
  const kapitel = fassungsKapitel(f);
  const nurEins = kapitel.length === 1 ? kapitel[0]! : null;
  const umfang = nurEins
    ? daten.kapitel[nurEins] || daten.plaene[nurEins]
      ? kapitelAnzeige(daten, nurEins)
      : '1 Kapitel'
    : `${kapitel.length} Kapitel`;

  const ausfuehren = async (f: () => Promise<void>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      await f();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  };

  const wiederherstellen = () =>
    ausfuehren(async () => {
      const ok = await bestaetigen(
        `Den Text von ${kapitel.length === 1 ? 'diesem Kapitel' : `${kapitel.length} Kapiteln`} auf „${f.name}“ zurücksetzen? Der aktuelle Text wird vorher als Version gesichert und bleibt im Versionsverlauf.`,
        { titel: 'Fassung wiederherstellen', knopf: 'Wiederherstellen' },
      );
      if (!ok) return;
      const e = await st.fassungWiederherstellen(f.id);
      const teile = [
        e.wiederhergestellt.length === 0
          ? 'Der Text entspricht bereits dieser Fassung.'
          : `${e.wiederhergestellt.length === 1 ? '1 Kapitel' : `${e.wiederhergestellt.length} Kapitel`} wiederhergestellt.`,
        ...e.uebersprungen.map((u) => `${daten.kapitel[u.id] || daten.plaene[u.id] ? kapitelAnzeige(daten, u.id) : u.id}: ${u.grund}`),
      ];
      await mitteilen(teile.join(' '), 'Fassung wiederhergestellt');
    });

  const entfernen = () =>
    ausfuehren(async () => {
      const ok = await bestaetigen(
        `„${f.name}“ aus der Liste entfernen? Die Schnappschüsse bleiben im Versionsverlauf der Kapitel, werden aber wieder normal aufgeräumt.`,
        { titel: 'Fassung entfernen', knopf: 'Entfernen' },
      );
      if (ok) await st.fassungEntfernen(f.id);
    });

  return (
    <li className="pw-st-fassung">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="pw-st-fassung__name">{f.name}</span>
        <span className="pw-st-fassung__meta">
          {zeitpunktAnzeige(f.datum)} · {umfang}
        </span>
      </div>
      {!bearbeiten && (
        <div className="pw-st-fassung__aktionen">
          <Button klein disabled={laeuft} onClick={() => oeffneDialog('versionsvergleich', { links: fassungsQuelle(f.id), rechts: AKTUELL, kapitel: kapitel[0] })}>
            Mit aktuellem Text vergleichen
          </Button>
          <Button klein disabled={laeuft} onClick={() => setBearbeiten(true)}>
            Bearbeiten
          </Button>
          <Button klein disabled={laeuft} onClick={wiederherstellen}>
            Wiederherstellen …
          </Button>
          <Button klein variante="leise" disabled={laeuft} onClick={entfernen}>
            Entfernen
          </Button>
        </div>
      )}
      {f.notiz && !bearbeiten && <p className="pw-st-fassung__notiz">{f.notiz}</p>}
      {bearbeiten && (
        <form
          className="pw-st-fassung__bearbeiten"
          onSubmit={(e) => {
            e.preventDefault();
            void ausfuehren(async () => {
              await st.fassungAendern(f.id, { name, notiz });
              setBearbeiten(false);
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setName(f.name);
              setNotiz(f.notiz ?? '');
              setBearbeiten(false);
            }
          }}
        >
          <Feld label="Name">{(id) => <Textfeld id={id} value={name} autoFocus onChange={(e) => setName(e.target.value)} />}</Feld>
          <Feld label="Notiz">{(id) => <Textbereich id={id} rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />}</Feld>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              klein
              onClick={() => {
                setName(f.name);
                setNotiz(f.notiz ?? '');
                setBearbeiten(false);
              }}
            >
              Abbrechen
            </Button>
            <Button klein variante="primaer" type="submit" disabled={!name.trim() || laeuft}>
              Sichern
            </Button>
          </div>
        </form>
      )}
      {fehler && <span className="pw-st-fehler" style={{ gridColumn: '1 / -1' }}>{fehler}</span>}
    </li>
  );
}

export function Fassungen() {
  const liste = useStore((s) => s.daten?.fassungen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const sortiert = fassungenSortiert(liste ?? []);

  if (sortiert.length === 0) {
    return (
      <LeerZustand
        titel="Noch keine benannten Fassungen"
        aktionen={
          <Button variante="primaer" onClick={() => oeffneDialog('fassung')}>
            Fassung sichern …
          </Button>
        }
      >
        Sichere einen Stand unter einem Namen, z. B. „Fassung vor Lektorat“. Benannte Fassungen werden nie automatisch aufgeräumt und lassen sich jederzeit mit dem aktuellen Text vergleichen.
      </LeerZustand>
    );
  }

  return (
    <section className="pw-st-panel" aria-labelledby="pw-st-fassungen-titel">
      <div className="pw-st-panel__kopf">
        <Abschnittslabel id="pw-st-fassungen-titel" as="h2">
          {sortiert.length === 1 ? '1 benannte Fassung' : `${sortiert.length} benannte Fassungen`}
        </Abschnittslabel>
        {sortiert.length > 1 && (
          <Button
            variante="text"
            klein
            onClick={() => oeffneDialog('versionsvergleich', { links: fassungsQuelle(sortiert[1]!.id), rechts: fassungsQuelle(sortiert[0]!.id) })}
          >
            Zwei Fassungen vergleichen
          </Button>
        )}
      </div>
      <ul className="pw-st-fassungen">
        {sortiert.map((f) => (
          <FassungEintrag key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}
