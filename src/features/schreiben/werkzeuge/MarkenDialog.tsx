/**
 * Dialog „Markennamen“ (G4): Wo kommt welche Marke im Buch vor? Vorschläge der Heuristik, Leons
 * Markenliste bearbeiten (plan/marken.md) und Export als Liste fürs Lektorat (Markdown, CSV).
 * Lokal, ohne KI.
 */
import type { Id, Marke, Markenliste } from '@core/model/types';
import { GRUND_TEXT, markenAlsCsv, markenAlsMarkdown, markenUebersicht, type KapitelText, type MarkeImKapitel } from '@core/stil/index';
import { klartext } from '@core/text/index';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { DialogKomponentenProps } from '../../../app/dialogTypen';
import { useStore } from '../../../state/store';
import { Button, Dialog, Segment, Textfeld } from '../../../ui';
import { bekannteNamen, LEERE_MARKENLISTE, markeAufnehmen, markeIgnorieren, zahlText, zeigeStelle } from './gemeinsam';
import './werkzeuge.css';

type Ansicht = 'buch' | 'vorschlaege' | 'liste';
let gemerkteAnsicht: Ansicht = 'buch';

function KapitelChips({ eintraege, kapitel, springen }: { eintraege: MarkeImKapitel[]; kapitel: KapitelText[]; springen(k: Id, i: number): void }) {
  return (
    <span className="pw-w-kapchips">
      {eintraege.map((e) => {
        const nr = kapitel.findIndex((k) => k.id === e.kapitel);
        const titel = kapitel[nr]?.titel ?? e.kapitel;
        return (
          <button key={e.kapitel} type="button" className="pw-w-kapchip" title={`Kap. ${nr + 1} „${titel}“ – zur ersten Stelle`} onClick={() => springen(e.kapitel, 0)}>
            Kap. {nr + 1}
            {e.stellen.length > 1 && <span> · {e.stellen.length}×</span>}
          </button>
        );
      })}
    </span>
  );
}

/** Eine Marke der Liste bearbeiten; Änderungen werden beim Verlassen des Feldes gespeichert. */
function MarkenZeileBearbeiten({ marke, kategorien, aendern, entfernen }: { marke: Marke; kategorien: string; aendern(m: Marke): void; entfernen(): void }) {
  const [name, setName] = useState(marke.name);
  const [aliase, setAliase] = useState(marke.aliase.join(', '));
  const [kategorie, setKategorie] = useState(marke.kategorie ?? '');
  const [notiz, setNotiz] = useState(marke.notiz ?? '');
  const uebernehmen = () => {
    const neu: Marke = {
      ...marke,
      name: name.trim() || marke.name,
      aliase: aliase
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    };
    if (kategorie.trim()) neu.kategorie = kategorie.trim();
    else delete neu.kategorie;
    if (notiz.trim()) neu.notiz = notiz.trim();
    else delete neu.notiz;
    if (!name.trim()) setName(marke.name);
    if (JSON.stringify(neu) !== JSON.stringify(marke)) aendern(neu);
  };
  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  return (
    <tr>
      <td>
        <Textfeld aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={`Weitere Schreibweisen von ${marke.name}`} placeholder="z. B. Schwip-Schwap, schwip" value={aliase} onChange={(e) => setAliase(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={`Kategorie von ${marke.name}`} list={kategorien} placeholder="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={`Notiz zu ${marke.name}`} placeholder="Notiz" value={notiz} onChange={(e) => setNotiz(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <button type="button" className="pw-w-link pw-w-link--leise" onClick={entfernen} aria-label={`${marke.name} aus der Liste entfernen`}>
          Entfernen
        </button>
      </td>
    </tr>
  );
}

export default function MarkenDialog({ schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backend = useStore((s) => s.backend);
  const speichereMarken = useStore((s) => s.speichereMarken);
  const [ansicht, setAnsicht] = useState<Ansicht>(gemerkteAnsicht);
  const [neu, setNeu] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const kategorienId = useId();
  const tabId = useId();

  const liste: Markenliste = daten?.marken ?? LEERE_MARKENLISTE;
  const kapitel = useMemo<KapitelText[]>(
    () =>
      daten
        ? daten.projekt.kapitel.map((id) => ({ id, titel: daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id, text: klartext(daten.kapitel[id]?.text ?? '') }))
        : [],
    [daten],
  );
  const namen = useMemo(() => (daten ? bekannteNamen(daten) : []), [daten]);
  const uebersicht = useMemo(() => markenUebersicht(kapitel, liste, namen), [kapitel, liste, namen]);
  const kategorien = useMemo(() => [...new Set(liste.marken.flatMap((m) => (m.kategorie ? [m.kategorie] : [])))].sort((a, b) => a.localeCompare(b, 'de')), [liste]);

  if (!daten) return null;
  const titel = daten.projekt.titel || 'Buch';
  const vorkommen = uebersicht.zeilen.reduce((s, z) => s + z.gesamt, 0);

  const wechseln = (a: Ansicht) => {
    gemerkteAnsicht = a;
    setAnsicht(a);
  };

  const springen = (eintraege: MarkeImKapitel[], k: Id, i: number) => {
    const e = eintraege.find((x) => x.kapitel === k);
    const text = kapitel.find((x) => x.id === k)?.text;
    const s = e?.stellen[i];
    if (!s || text === undefined) return;
    schliessen();
    zeigeStelle(k, text, s.start, s.ende);
  };

  const speichern = async (neueListe: Markenliste) => {
    setArbeitet(true);
    try {
      await speichereMarken(neueListe);
    } catch (e) {
      console.error('Markenliste nicht gespeichert:', e);
      setMeldung('Die Markenliste konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(false);
    }
  };

  const exportieren = async (art: 'md' | 'csv') => {
    if (!backend) return;
    const inhalt = art === 'md' ? markenAlsMarkdown(uebersicht, kapitel, titel) : markenAlsCsv(uebersicht, kapitel);
    try {
      const ok = await backend.dateiSpeichern(`Markennamen – ${titel}.${art}`, new TextEncoder().encode(inhalt));
      if (ok) setMeldung(`Liste als ${art === 'md' ? 'Markdown' : 'CSV'} gespeichert.`);
    } catch (e) {
      console.error('Export fehlgeschlagen:', e);
      setMeldung('Die Liste konnte nicht gespeichert werden.');
    }
  };

  const hinzufuegen = async () => {
    const n = neu.trim();
    if (!n) return;
    setArbeitet(true);
    try {
      await markeAufnehmen(n);
      setNeu('');
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <Dialog
      titel="Markennamen"
      onSchliessen={schliessen}
      breite={760}
      className="pw-w-dialog"
      aktionen={
        <>
          <span className="pw-w-dialog__export">
            <span>Liste fürs Lektorat:</span>
            <Button klein disabled={!uebersicht.zeilen.length} onClick={() => void exportieren('md')}>
              Markdown
            </Button>
            <Button klein disabled={!uebersicht.zeilen.length} onClick={() => void exportieren('csv')}>
              CSV
            </Button>
          </span>
          <Button variante="primaer" onClick={schliessen}>
            Fertig
          </Button>
        </>
      }
    >
      <p className="pw-w-dialog__intro">
        {liste.marken.length ? (
          <>
            {zahlText(liste.marken.length)} {liste.marken.length === 1 ? 'Marke' : 'Marken'} in deiner Liste · {zahlText(uebersicht.zeilen.length)} im Text mit {zahlText(vorkommen)} Vorkommen
          </>
        ) : (
          'Deine Markenliste ist noch leer. Nimm Vorschläge auf oder trage Marken unter „Liste“ ein.'
        )}
      </p>
      <Segment<Ansicht>
        label="Ansicht"
        wert={ansicht}
        onChange={wechseln}
        optionen={[
          { wert: 'buch', label: `Im Buch · ${uebersicht.zeilen.length}`, steuert: `${tabId}-buch` },
          { wert: 'vorschlaege', label: `Vorschläge · ${uebersicht.kandidaten.length}`, steuert: `${tabId}-vorschlaege` },
          { wert: 'liste', label: 'Liste', steuert: `${tabId}-liste` },
        ]}
      />
      {meldung && (
        <p className="pw-w-dialog__meldung" role="status">
          {meldung}
        </p>
      )}
      <div id={`${tabId}-${ansicht}`} role="tabpanel" className="pw-w-dialog__inhalt">
        {ansicht === 'buch' &&
          (uebersicht.zeilen.length ? (
            <table className="pw-w-tabelle">
              <thead>
                <tr>
                  <th>Marke</th>
                  <th className="pw-w-zahl">Vorkommen</th>
                  <th>Kapitel</th>
                </tr>
              </thead>
              <tbody>
                {uebersicht.zeilen.map((z) => (
                  <tr key={z.marke.id}>
                    <td>
                      <b>{z.marke.name}</b>
                      {z.marke.kategorie && <span className="pw-w-kategorie">{z.marke.kategorie}</span>}
                      {z.schreibweisen.length > 1 && (
                        <span className="pw-w-schreibweisen">Schreibweisen: {z.schreibweisen.map((s) => `${s.text} (${s.anzahl}×)`).join(', ')}</span>
                      )}
                      {z.marke.notiz && <span className="pw-w-notiz">{z.marke.notiz}</span>}
                    </td>
                    <td className="pw-w-zahl">{z.gesamt}</td>
                    <td>
                      <KapitelChips eintraege={z.kapitel} kapitel={kapitel} springen={(k, i) => springen(z.kapitel, k, i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pw-w-leer">{liste.marken.length ? 'Keine Marke aus deiner Liste kommt im Text vor.' : 'Noch keine Marken in der Liste.'}</p>
          ))}
        {ansicht === 'buch' && uebersicht.ohneTreffer.length > 0 && (
          <p className="pw-w-leise">Ohne Vorkommen im Text: {uebersicht.ohneTreffer.map((m) => m.name).join(', ')}</p>
        )}

        {ansicht === 'vorschlaege' &&
          (uebersicht.kandidaten.length ? (
            <>
              <p className="pw-w-leise">
                Wörter, die nach Marken aussehen (Versalien, mehrteilige Eigennamen, typische Schreibweisen, bekannte Marken). Figuren, Orte und Motive
                sind ausgenommen. Was du als „keine Marke“ markierst, wird nie wieder vorgeschlagen.
              </p>
              <table className="pw-w-tabelle">
                <thead>
                  <tr>
                    <th>Vorschlag</th>
                    <th className="pw-w-zahl">Vorkommen</th>
                    <th>Kapitel</th>
                    <th>
                      <span className="pw-sr">Entscheidung</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uebersicht.kandidaten.map((k) => (
                    <tr key={k.name}>
                      <td>
                        <b>{k.name}</b>
                        <span className="pw-w-kategorie">{GRUND_TEXT[k.grund]}</span>
                      </td>
                      <td className="pw-w-zahl">{k.gesamt}</td>
                      <td>
                        <KapitelChips eintraege={k.kapitel} kapitel={kapitel} springen={(kap, i) => springen(k.kapitel, kap, i)} />
                      </td>
                      <td className="pw-w-aktionen">
                        <button type="button" className="pw-w-link" disabled={arbeitet} onClick={() => void markeAufnehmen(k.name)}>
                          Aufnehmen
                        </button>
                        <button type="button" className="pw-w-link pw-w-link--leise" disabled={arbeitet} onClick={() => void markeIgnorieren(k.name)}>
                          Keine Marke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="pw-w-leer">Keine weiteren Vorschläge – alles, was nach einer Marke aussieht, steht schon in deiner Liste oder ist als „keine Marke“ markiert.</p>
          ))}

        {ansicht === 'liste' && (
          <>
            <form
              className="pw-w-neu"
              onSubmit={(e) => {
                e.preventDefault();
                void hinzufuegen();
              }}
            >
              <Textfeld aria-label="Neue Marke" placeholder="Neue Marke, z. B. Schwip Schwap" value={neu} onChange={(e) => setNeu(e.target.value)} />
              <Button type="submit" disabled={!neu.trim() || arbeitet}>
                Hinzufügen
              </Button>
            </form>
            {liste.marken.length > 0 ? (
              <table className="pw-w-tabelle pw-w-tabelle--formular">
                <thead>
                  <tr>
                    <th>Marke</th>
                    <th>Weitere Schreibweisen</th>
                    <th>Kategorie</th>
                    <th>Notiz</th>
                    <th>
                      <span className="pw-sr">Entfernen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {liste.marken.map((m) => (
                    <MarkenZeileBearbeiten
                      key={m.id}
                      marke={m}
                      kategorien={kategorienId}
                      aendern={(neueMarke) => void speichern({ ...liste, marken: liste.marken.map((x) => (x.id === m.id ? neueMarke : x)) })}
                      entfernen={() => void speichern({ ...liste, marken: liste.marken.filter((x) => x.id !== m.id) })}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="pw-w-leer">Noch keine Marken in der Liste.</p>
            )}
            <datalist id={kategorienId}>
              {kategorien.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <div className="pw-w-ignoriert">
              <span className="pw-w-unterlabel">Nie als Marke vorschlagen</span>
              {liste.ignoriert.length ? (
                <span className="pw-w-kapchips">
                  {liste.ignoriert.map((w) => (
                    <span key={w} className="pw-w-ignoriert__wort">
                      {w}
                      <button type="button" aria-label={`„${w}“ wieder vorschlagen`} onClick={() => void speichern({ ...liste, ignoriert: liste.ignoriert.filter((x) => x !== w) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="pw-w-leise">Noch nichts.</span>
              )}
            </div>
            <p className="pw-w-leise">Gespeichert in plan/marken.md. Eine Marke wird auch mit Genitiv-s und mit Bindestrich statt Leerzeichen gefunden.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
