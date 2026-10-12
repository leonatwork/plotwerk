/** Dialog „Word-Datei importieren“ (S-11): Datei wählen, Vorschau, Übernahme, Struktur-Hinweise. */
import { useMemo, useState, type ReactNode } from 'react';
import { importHinweisKapitel, importiereDocx, type ImportErgebnis } from '@core/docx/index';
import type { Hinweis, Id } from '@core/model/types';
import { klartext, wortzahl } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { ImportAbgebrochen, type ImportBericht } from '../../state/slices/importexport';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, Radio, StatusPunkt, Textfeld } from '../../ui';
import './importexport.css';

type Phase =
  | { art: 'start' }
  | { art: 'liest'; name: string }
  | { art: 'fehler'; meldung: string }
  | { art: 'vorschau'; name: string; ergebnis: ImportErgebnis }
  | { art: 'uebernimmt'; name: string; ergebnis: ImportErgebnis }
  | { art: 'fertig'; ergebnis: ImportErgebnis; bericht: ImportBericht; versatz: number };

const zahl = (n: number) => n.toLocaleString('de-DE');

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Erster Satz des ersten Textabsatzes (für die Vorschau). */
export function ersterSatz(markdown: string): string {
  const absatz = klartext(markdown)
    .split('\n\n')
    .find((a) => a.trim() && a !== '* * *');
  if (!absatz) return '';
  const einzeilig = absatz.replace(/\s*\n\s*/g, ' ').trim();
  const satz = /^.*?[.!?…]["“”»«’')]*(?=\s|$)/u.exec(einzeilig);
  return satz ? satz[0] : einzeilig;
}

function HinweisListe({ hinweise, oeffnen }: { hinweise: Hinweis[]; oeffnen?: (nummer: number) => void }) {
  return (
    <div className="pw-ie-hinweise">
      {hinweise.map((h) => {
        const zitat = h.zitate[0];
        const nummer = importHinweisKapitel(h);
        return (
          <div key={h.schluessel} className="pw-ie-hinweis">
            <span className="pw-ie-hinweis__titel">{h.titel}</span>
            <span className="pw-ie-hinweis__text">{h.erklaerung}</span>
            {zitat?.text && (
              <span className="pw-ie-hinweis__zitat">
                {h.schluessel.includes('satzende') ? `„…${zitat.text}“` : `„${zitat.text}${zitat.text.length >= 60 ? '…' : ''}“`}
              </span>
            )}
            {oeffnen && nummer !== null && nummer > 0 && (
              <Button variante="text" klein onClick={() => oeffnen(nummer)}>
                Kapitel öffnen
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** „7 Word-Kommentare als Anmerkungen übernehmen (4 Antworten eingeschlossen, 4 als Notiz zum Kapitel)“ */
export function kommentarZeile(ergebnis: ImportErgebnis): string {
  const liste = ergebnis.kommentare ?? [];
  const antworten = liste.reduce((n, k) => n + k.antworten.length, 0);
  const kapitel = liste.filter((k) => k.ueberschrift).length;
  const teile = [antworten ? `${antworten} ${antworten === 1 ? 'Antwort' : 'Antworten'} eingeschlossen` : '', kapitel ? `${kapitel} als Notiz zum Kapitel` : ''].filter(Boolean);
  return `${liste.length === 1 ? 'Word-Kommentar' : `${liste.length} Word-Kommentare`} als Anmerkungen übernehmen${teile.length ? ` (${teile.join(', ')})` : ''}`;
}

export function ImportDialog({ schliessen }: DialogKomponentenProps) {
  const backend = useStore((s) => s.backend);
  const daten = useStore((s) => s.daten);
  const importUebernehmen = useStore((s) => s.importUebernehmen);
  const oeffne = useStore((s) => s.oeffne);
  const oeffneDialog = useStore((s) => s.oeffneDialog);

  const [phase, setPhase] = useState<Phase>({ art: 'start' });
  const [ziel, setZiel] = useState<'aktuell' | 'neu'>(daten ? 'aktuell' : 'neu');
  const [projektTitel, setProjektTitel] = useState('');
  const [vorspannAlsKapitel, setVorspannAlsKapitel] = useState(false);
  const [kommentareUebernehmen, setKommentareUebernehmen] = useState(true);

  const beschaeftigt = phase.art === 'liest' || phase.art === 'uebernimmt';
  const projektLeer = !!daten && daten.projekt.kapitel.length === 0;

  async function dateiWaehlen() {
    if (!backend) return;
    const datei = await backend.dateiWaehlen(['docx']);
    if (!datei) return;
    setPhase({ art: 'liest', name: datei.name });
    try {
      const ergebnis = await importiereDocx(datei.daten);
      setProjektTitel(ergebnis.buchtitel ?? datei.name.replace(/\.docx$/i, ''));
      setVorspannAlsKapitel(false);
      setKommentareUebernehmen(true);
      setPhase({ art: 'vorschau', name: datei.name, ergebnis });
    } catch (e) {
      setPhase({ art: 'fehler', meldung: fehlertext(e) });
    }
  }

  async function uebernehmen(name: string, ergebnis: ImportErgebnis) {
    const mitVorspann = vorspannAlsKapitel && !!klartext(ergebnis.vorspann).trim();
    setPhase({ art: 'uebernimmt', name, ergebnis });
    try {
      const bericht = await importUebernehmen(ergebnis, {
        ziel: daten ? ziel : 'neu',
        projektTitel,
        vorspannAlsKapitel: mitVorspann,
        kommentare: kommentareUebernehmen,
      });
      setPhase({ art: 'fertig', ergebnis, bericht, versatz: mitVorspann ? 1 : 0 });
    } catch (e) {
      if (e instanceof ImportAbgebrochen) setPhase({ art: 'vorschau', name, ergebnis });
      else setPhase({ art: 'fehler', meldung: `Übernahme fehlgeschlagen: ${fehlertext(e)}` });
    }
  }

  const zeilen = useMemo(() => {
    if (phase.art !== 'vorschau' && phase.art !== 'uebernimmt') return [];
    return phase.ergebnis.kapitel.map((k) => ({ titel: k.titel, woerter: wortzahl(k.text), satz: ersterSatz(k.text) }));
  }, [phase]);

  const oeffneKapitel = (id: Id | undefined) => {
    if (!id) return;
    oeffne('schreiben', { kapitel: id });
    schliessen();
  };

  let inhalt: ReactNode;
  let aktionen: ReactNode;

  if (phase.art === 'start' || phase.art === 'liest' || phase.art === 'fehler') {
    inhalt = (
      <>
        <p className="pw-ie-text">
          Kapitel werden an Absätzen im Format „Überschrift 1“ erkannt. Fett und kursiv bleiben erhalten, der Text wird nicht verändert. Vor der
          Übernahme siehst du eine Vorschau.
        </p>
        {daten && phase.art !== 'liest' && (
          <p className="pw-ie-text" style={{ fontSize: 12 }}>
            Kommt die Datei mit Kommentaren und Änderungen vom Lektorat zurück?{' '}
            <Button variante="text" klein onClick={() => oeffneDialog('rueckimport')} style={{ height: 'auto', padding: 0 }}>
              Lektorat aus Word übernehmen …
            </Button>
          </p>
        )}
        {phase.art === 'liest' && <p className="pw-ie-meldung">„{phase.name}“ wird gelesen …</p>}
        {phase.art === 'fehler' && (
          <p role="alert" className="pw-ie-meldung pw-ie-meldung--fehler">
            {phase.meldung}
          </p>
        )}
      </>
    );
    aktionen = (
      <>
        <Button onClick={schliessen} disabled={beschaeftigt}>
          Abbrechen
        </Button>
        <Button variante="primaer" onClick={dateiWaehlen} disabled={!backend || beschaeftigt} data-autofocus>
          Word-Datei wählen …
        </Button>
      </>
    );
  } else if (phase.art === 'vorschau' || phase.art === 'uebernimmt') {
    const { ergebnis, name } = phase;
    const gesamt = zeilen.reduce((s, z) => s + z.woerter, 0);
    const vorspannWoerter = wortzahl(ergebnis.vorspann);
    const anzahl = ergebnis.kapitel.length + (vorspannAlsKapitel && vorspannWoerter > 0 ? 1 : 0);
    const titel = daten?.projekt.titel ?? '';
    inhalt = (
      <>
        <div className="pw-ie-kopf">
          <span className="pw-ie-kopf__datei" title={name}>
            {name}
          </span>
          <span className="pw-ie-kopf__zahlen">
            {ergebnis.kapitel.length} Kapitel · {zahl(gesamt)} Wörter
          </span>
          <Button variante="text" klein onClick={dateiWaehlen} disabled={beschaeftigt}>
            Andere Datei …
          </Button>
        </div>

        {ergebnis.kapitel.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label="Kapitel">
            <Abschnittslabel>Kapitel</Abschnittslabel>
            <ol className="pw-ie-liste" style={{ margin: 0, listStyle: 'none' }}>
              {zeilen.map((z, i) => (
                <li key={i} className="pw-ie-zeile pw-ie-zeile--zweizeilig">
                  <StatusPunkt status={z.woerter ? 'geschrieben' : 'geplant'} />
                  <span className="pw-ie-zeile__nr">{i + 1}</span>
                  <span className="pw-ie-zeile__inhalt">
                    <span className="pw-ie-zeile__titel">{z.titel}</span>
                    {z.satz && (
                      <span className="pw-ie-zeile__satz" title={z.satz}>
                        {z.satz}
                      </span>
                    )}
                  </span>
                  <span className="pw-ie-zeile__zahl">{z.woerter ? zahl(z.woerter) : 'geplant'}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {vorspannWoerter > 0 && (
          <Checkbox checked={vorspannAlsKapitel} onChange={(e) => setVorspannAlsKapitel(e.target.checked)} disabled={beschaeftigt}>
            Text vor der ersten Überschrift ({zahl(vorspannWoerter)} {vorspannWoerter === 1 ? 'Wort' : 'Wörter'}) als Kapitel „Vorspann“ übernehmen
          </Checkbox>
        )}

        {(ergebnis.kommentare?.length ?? 0) > 0 && (
          <Checkbox checked={kommentareUebernehmen} onChange={(e) => setKommentareUebernehmen(e.target.checked)} disabled={beschaeftigt}>
            {kommentarZeile(ergebnis)}
          </Checkbox>
        )}

        {ergebnis.hinweise.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label="Struktur-Hinweise">
            <div className="pw-ie-abschnitt__kopf">
              <Abschnittslabel farbe="var(--warm-dark)">Struktur-Hinweise</Abschnittslabel>
              <span className="pw-ie-abschnitt__zusatz">{ergebnis.hinweise.length}</span>
            </div>
            <HinweisListe hinweise={ergebnis.hinweise} />
          </section>
        )}

        <section className="pw-ie-abschnitt" aria-label="Übernehmen">
          <Abschnittslabel>Übernehmen</Abschnittslabel>
          <div className="pw-ie-optionen" role="radiogroup" aria-label="Ziel">
            {daten && (
              <Radio name="pw-import-ziel" checked={ziel === 'aktuell'} onChange={() => setZiel('aktuell')} disabled={beschaeftigt}>
                {projektLeer ? `In dieses Projekt „${titel}“` : `Als neue Kapitel an „${titel}“ anhängen (nach Kapitel ${daten.projekt.kapitel.length})`}
              </Radio>
            )}
            <Radio name="pw-import-ziel" checked={!daten || ziel === 'neu'} onChange={() => setZiel('neu')} disabled={beschaeftigt}>
              Neues Projekt anlegen
            </Radio>
            {(!daten || ziel === 'neu') && (
              <div className="pw-ie-einzug">
                <Textfeld
                  aria-label="Titel des neuen Projekts"
                  placeholder="Titel des Buchs"
                  value={projektTitel}
                  onChange={(e) => setProjektTitel(e.target.value)}
                  disabled={beschaeftigt}
                />
              </div>
            )}
          </div>
        </section>
      </>
    );
    aktionen = (
      <>
        {phase.art === 'uebernimmt' && <span className="pw-ie-fuss-links">Wird übernommen …</span>}
        <Button onClick={schliessen} disabled={beschaeftigt}>
          Abbrechen
        </Button>
        <Button
          variante="primaer"
          onClick={() => uebernehmen(name, ergebnis)}
          disabled={beschaeftigt || anzahl === 0 || ((!daten || ziel === 'neu') && !projektTitel.trim())}
        >
          {anzahl === 1 ? '1 Kapitel übernehmen' : `${anzahl} Kapitel übernehmen`}
        </Button>
      </>
    );
  } else {
    const { bericht, ergebnis, versatz } = phase;
    const n = bericht.ids.length;
    inhalt = (
      <>
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          {n === 1 ? '1 Kapitel' : `${n} Kapitel`} übernommen
          {bericht.geplant > 0 ? `, davon ${bericht.geplant} ohne Text (als geplant)` : ''}
          {bericht.anmerkungen > 0 ? `, ${bericht.anmerkungen === 1 ? '1 Word-Kommentar' : `${bericht.anmerkungen} Word-Kommentare`} als Anmerkungen` : ''}.
        </p>
        {ergebnis.hinweise.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label="Struktur-Hinweise">
            <div className="pw-ie-abschnitt__kopf">
              <Abschnittslabel farbe="var(--warm-dark)">Struktur-Hinweise</Abschnittslabel>
              <span className="pw-ie-abschnitt__zusatz">{ergebnis.hinweise.length}</span>
            </div>
            <HinweisListe hinweise={ergebnis.hinweise} oeffnen={(nummer) => oeffneKapitel(bericht.ids[nummer - 1 + versatz])} />
          </section>
        )}
      </>
    );
    aktionen = (
      <>
        <Button onClick={schliessen}>Fertig</Button>
        <Button variante="primaer" onClick={() => oeffneKapitel(bericht.ids[0])} disabled={n === 0} data-autofocus>
          Zum ersten Kapitel
        </Button>
      </>
    );
  }

  return (
    <Dialog
      titel="Word-Datei importieren"
      onSchliessen={beschaeftigt ? () => undefined : schliessen}
      modalFest={beschaeftigt || phase.art === 'vorschau'}
      breite={phase.art === 'start' || phase.art === 'liest' || phase.art === 'fehler' ? 480 : 600}
      aktionen={aktionen}
    >
      {inhalt}
    </Dialog>
  );
}

export default ImportDialog;
