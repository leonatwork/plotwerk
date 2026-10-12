/** Liste der benannten Fassungen (G5): vergleichen, umbenennen, wiederherstellen, Eintrag entfernen. */
import type { BenannteFassung } from '@core/model/types';
import { AKTUELL, fassungenSortiert, fassungsKapitel, fassungsQuelle } from '@core/statistik';
import { useState } from 'react';
import { f as fmt, useTexte } from '../../i18n';
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
  const tt = useTexte();
  const t = tt.statistik.fassungen;
  if (!daten) return null;
  const kapitel = fassungsKapitel(f);
  const nurEins = kapitel.length === 1 ? kapitel[0]! : null;
  const umfang = nurEins && (daten.kapitel[nurEins] || daten.plaene[nurEins]) ? kapitelAnzeige(daten, nurEins) : fmt(t.kapitelAnzahl, { n: kapitel.length });

  const ausfuehren = async (aktion: () => Promise<void>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      await aktion();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  };

  const wiederherstellen = () =>
    ausfuehren(async () => {
      const ok = await bestaetigen(fmt(t.wiederherstellenFrage, { n: kapitel.length, name: f.name }), {
        titel: t.wiederherstellenTitel,
        knopf: t.wiederherstellenKnopf,
      });
      if (!ok) return;
      const e = await st.fassungWiederherstellen(f.id);
      const teile = [
        e.wiederhergestellt.length === 0 ? t.schonGleich : fmt(t.wiederhergestellt, { n: e.wiederhergestellt.length }),
        ...e.uebersprungen.map((u) => `${daten.kapitel[u.id] || daten.plaene[u.id] ? kapitelAnzeige(daten, u.id) : u.id}: ${u.grund}`),
      ];
      await mitteilen(teile.join(' '), t.wiederhergestelltTitel);
    });

  const entfernen = () =>
    ausfuehren(async () => {
      const ok = await bestaetigen(fmt(t.entfernenFrage, { name: f.name }), { titel: t.entfernenTitel, knopf: tt.gemeinsam.entfernen });
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
            {t.mitAktuellem}
          </Button>
          <Button klein disabled={laeuft} onClick={() => setBearbeiten(true)}>
            {tt.gemeinsam.bearbeiten}
          </Button>
          <Button klein disabled={laeuft} onClick={wiederherstellen}>
            {t.wiederherstellen}
          </Button>
          <Button klein variante="leise" disabled={laeuft} onClick={entfernen}>
            {tt.gemeinsam.entfernen}
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
          <Feld label={t.name}>{(id) => <Textfeld id={id} value={name} autoFocus onChange={(e) => setName(e.target.value)} />}</Feld>
          <Feld label={t.notiz}>{(id) => <Textbereich id={id} rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />}</Feld>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              klein
              onClick={() => {
                setName(f.name);
                setNotiz(f.notiz ?? '');
                setBearbeiten(false);
              }}
            >
              {tt.gemeinsam.abbrechen}
            </Button>
            <Button klein variante="primaer" type="submit" disabled={!name.trim() || laeuft}>
              {tt.gemeinsam.sichern}
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
  const tt = useTexte().statistik;
  const t = tt.fassungen;

  if (sortiert.length === 0) {
    return (
      <LeerZustand
        titel={t.leerTitel}
        aktionen={
          <Button variante="primaer" onClick={() => oeffneDialog('fassung')}>
            {tt.ansicht.sichern}
          </Button>
        }
      >
        {t.leerText}
      </LeerZustand>
    );
  }

  return (
    <section className="pw-st-panel" aria-labelledby="pw-st-fassungen-titel">
      <div className="pw-st-panel__kopf">
        <Abschnittslabel id="pw-st-fassungen-titel" as="h2">
          {fmt(t.anzahl, { n: sortiert.length })}
        </Abschnittslabel>
        {sortiert.length > 1 && (
          <Button
            variante="text"
            klein
            onClick={() => oeffneDialog('versionsvergleich', { links: fassungsQuelle(sortiert[1]!.id), rechts: fassungsQuelle(sortiert[0]!.id) })}
          >
            {t.zweiVergleichen}
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
