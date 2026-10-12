/**
 * Dialog „Markennamen“ (G4): Wo kommt welche Marke im Buch vor? Vorschläge der Heuristik, Leons
 * Markenliste bearbeiten (plan/marken.md) und Export als Liste fürs Lektorat (Markdown, CSV).
 * Lokal, ohne KI.
 */
import type { Id, Marke, Markenliste } from '@core/model/types';
import { markenAlsCsv, markenAlsMarkdown, markenUebersicht, type KapitelText, type MarkeImKapitel } from '@core/stil/index';
import { klartext } from '@core/text/index';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { DialogKomponentenProps } from '../../../app/dialogTypen';
import { f, sprache, useTexte, vergleich } from '../../../i18n';
import { useBuchSprache } from '../../../i18n/buch';
import { useStore } from '../../../state/store';
import { Button, Dialog, Segment, Textfeld } from '../../../ui';
import { bekannteNamen, LEERE_MARKENLISTE, markeAufnehmen, markeIgnorieren, zeigeStelle } from './gemeinsam';
import './werkzeuge.css';

type Ansicht = 'buch' | 'vorschlaege' | 'liste';
let gemerkteAnsicht: Ansicht = 'buch';

function KapitelChips({ eintraege, kapitel, springen }: { eintraege: MarkeImKapitel[]; kapitel: KapitelText[]; springen(k: Id, i: number): void }) {
  const t = useTexte();
  return (
    <span className="pw-w-kapchips">
      {eintraege.map((e) => {
        const nr = kapitel.findIndex((k) => k.id === e.kapitel);
        const titel = kapitel[nr]?.titel ?? e.kapitel;
        const kap = f(t.gemeinsam.kapitelKurz, { nr: nr + 1 });
        return (
          <button key={e.kapitel} type="button" className="pw-w-kapchip" title={f(t.schreiben.marken.kapChipTitel, { kap, titel })} onClick={() => springen(e.kapitel, 0)}>
            {kap}
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
  const t = useTexte();
  const T = t.schreiben.marken;
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
        <Textfeld aria-label={T.name} value={name} onChange={(e) => setName(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={f(T.schreibweisenVon, { name: marke.name })} placeholder={T.schreibweisenPlatzhalter} value={aliase} onChange={(e) => setAliase(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={f(T.kategorieVon, { name: marke.name })} list={kategorien} placeholder={T.kategorie} value={kategorie} onChange={(e) => setKategorie(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <Textfeld aria-label={f(T.notizZu, { name: marke.name })} placeholder={T.notiz} value={notiz} onChange={(e) => setNotiz(e.target.value)} onBlur={uebernehmen} onKeyDown={enter} />
      </td>
      <td>
        <button type="button" className="pw-w-link pw-w-link--leise" onClick={entfernen} aria-label={f(T.entfernenLabel, { name: marke.name })}>
          {t.gemeinsam.entfernen}
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
  const buchSprache = useBuchSprache();
  const uebersicht = useMemo(() => markenUebersicht(kapitel, liste, namen, buchSprache), [kapitel, liste, namen, buchSprache]);
  const kategorien = useMemo(() => [...new Set(liste.marken.flatMap((m) => (m.kategorie ? [m.kategorie] : [])))].sort(vergleich), [liste]);
  const t = useTexte();
  const T = t.schreiben.marken;

  if (!daten) return null;
  const titel = daten.projekt.titel || T.buch;
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
      setMeldung(T.nichtGespeichert);
    } finally {
      setArbeitet(false);
    }
  };

  const exportieren = async (art: 'md' | 'csv') => {
    if (!backend) return;
    const inhalt = art === 'md' ? markenAlsMarkdown(uebersicht, kapitel, titel, new Date(), sprache()) : markenAlsCsv(uebersicht, kapitel, sprache());
    try {
      const ok = await backend.dateiSpeichern(f(T.dateiname, { titel, endung: art }), new TextEncoder().encode(inhalt));
      if (ok) setMeldung(f(T.exportiert, { format: art === 'md' ? 'Markdown' : 'CSV' }));
    } catch (e) {
      console.error('Export fehlgeschlagen:', e);
      setMeldung(T.exportFehler);
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
      titel={T.titel}
      onSchliessen={schliessen}
      breite={760}
      className="pw-w-dialog"
      aktionen={
        <>
          <span className="pw-w-dialog__export">
            <span>{T.fuersLektorat}</span>
            <Button klein disabled={!uebersicht.zeilen.length} onClick={() => void exportieren('md')}>
              Markdown
            </Button>
            <Button klein disabled={!uebersicht.zeilen.length} onClick={() => void exportieren('csv')}>
              CSV
            </Button>
          </span>
          <Button variante="primaer" onClick={schliessen}>
            {t.gemeinsam.fertig}
          </Button>
        </>
      }
    >
      <p className="pw-w-dialog__intro">
        {liste.marken.length ? f(T.intro, { n: liste.marken.length, imText: uebersicht.zeilen.length, vorkommen }) : T.leerIntro}
      </p>
      <Segment<Ansicht>
        label={T.ansicht}
        wert={ansicht}
        onChange={wechseln}
        optionen={[
          { wert: 'buch', label: f(T.imBuch, { n: uebersicht.zeilen.length }), steuert: `${tabId}-buch` },
          { wert: 'vorschlaege', label: f(T.vorschlaege, { n: uebersicht.kandidaten.length }), steuert: `${tabId}-vorschlaege` },
          { wert: 'liste', label: T.liste, steuert: `${tabId}-liste` },
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
                  <th>{T.marke}</th>
                  <th className="pw-w-zahl">{T.vorkommen}</th>
                  <th>{T.kapitel}</th>
                </tr>
              </thead>
              <tbody>
                {uebersicht.zeilen.map((z) => (
                  <tr key={z.marke.id}>
                    <td>
                      <b>{z.marke.name}</b>
                      {z.marke.kategorie && <span className="pw-w-kategorie">{z.marke.kategorie}</span>}
                      {z.schreibweisen.length > 1 && (
                        <span className="pw-w-schreibweisen">{f(T.schreibweisen, { liste: z.schreibweisen.map((s) => `${s.text} (${s.anzahl}×)`).join(', ') })}</span>
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
            <p className="pw-w-leer">{liste.marken.length ? T.keineImText : T.listeLeer}</p>
          ))}
        {ansicht === 'buch' && uebersicht.ohneTreffer.length > 0 && (
          <p className="pw-w-leise">{f(T.ohneVorkommen, { liste: uebersicht.ohneTreffer.map((m) => m.name).join(', ') })}</p>
        )}

        {ansicht === 'vorschlaege' &&
          (uebersicht.kandidaten.length ? (
            <>
              <p className="pw-w-leise">{T.vorschlaegeHilfe}</p>
              <table className="pw-w-tabelle">
                <thead>
                  <tr>
                    <th>{T.vorschlag}</th>
                    <th className="pw-w-zahl">{T.vorkommen}</th>
                    <th>{T.kapitel}</th>
                    <th>
                      <span className="pw-sr">{T.entscheidung}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uebersicht.kandidaten.map((k) => (
                    <tr key={k.name}>
                      <td>
                        <b>{k.name}</b>
                        <span className="pw-w-kategorie">{t.schreiben.stil.grund[k.grund]}</span>
                      </td>
                      <td className="pw-w-zahl">{k.gesamt}</td>
                      <td>
                        <KapitelChips eintraege={k.kapitel} kapitel={kapitel} springen={(kap, i) => springen(k.kapitel, kap, i)} />
                      </td>
                      <td className="pw-w-aktionen">
                        <button type="button" className="pw-w-link" disabled={arbeitet} onClick={() => void markeAufnehmen(k.name)}>
                          {t.schreiben.stil.aufnehmen}
                        </button>
                        <button type="button" className="pw-w-link pw-w-link--leise" disabled={arbeitet} onClick={() => void markeIgnorieren(k.name)}>
                          {t.schreiben.stil.keineMarke}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="pw-w-leer">{T.keineVorschlaege}</p>
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
              <Textfeld aria-label={T.neueMarke} placeholder={T.neueMarkePlatzhalter} value={neu} onChange={(e) => setNeu(e.target.value)} />
              <Button type="submit" disabled={!neu.trim() || arbeitet}>
                {t.gemeinsam.hinzufuegen}
              </Button>
            </form>
            {liste.marken.length > 0 ? (
              <table className="pw-w-tabelle pw-w-tabelle--formular">
                <thead>
                  <tr>
                    <th>{T.marke}</th>
                    <th>{T.weitereSchreibweisen}</th>
                    <th>{T.kategorie}</th>
                    <th>{T.notiz}</th>
                    <th>
                      <span className="pw-sr">{t.gemeinsam.entfernen}</span>
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
              <p className="pw-w-leer">{T.listeLeer}</p>
            )}
            <datalist id={kategorienId}>
              {kategorien.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <div className="pw-w-ignoriert">
              <span className="pw-w-unterlabel">{T.nieVorschlagen}</span>
              {liste.ignoriert.length ? (
                <span className="pw-w-kapchips">
                  {liste.ignoriert.map((w) => (
                    <span key={w} className="pw-w-ignoriert__wort">
                      {w}
                      <button type="button" aria-label={f(T.wiederVorschlagen, { wort: w })} onClick={() => void speichern({ ...liste, ignoriert: liste.ignoriert.filter((x) => x !== w) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="pw-w-leise">{T.nochNichts}</span>
              )}
            </div>
            <p className="pw-w-leise">{T.gespeichertIn}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
