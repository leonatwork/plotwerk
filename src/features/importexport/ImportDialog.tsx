/** Importieren: Word oder Markdown-/Textordner, Vorschau, Übernahme, Struktur-Hinweise. */
import { useMemo, useState, type ReactNode } from 'react';
import { importHinweisKapitel, importiereDocx, type ImportErgebnis } from '@core/docx/index';
import { importiereMarkdownOrdner } from '@core/importieren';
import type { Hinweis, Id } from '@core/model/types';
import { klartext, wortzahl } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, sprache, texte, useTexte, zahl } from '../../i18n';
import { ImportAbgebrochen, type ImportBericht } from '../../state/slices/importexport';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, Radio, StatusPunkt, Textfeld } from '../../ui';
import './importexport.css';
import { useFunktion } from '../../state/funktionen';

type Phase =
  | { art: 'start' }
  | { art: 'liest'; name: string }
  | { art: 'fehler'; meldung: string }
  | { art: 'leer'; name: string; ergebnis: ImportErgebnis; keineDateien: boolean }
  | { art: 'vorschau'; name: string; ergebnis: ImportErgebnis }
  | { art: 'uebernimmt'; name: string; ergebnis: ImportErgebnis }
  | { art: 'fertig'; ergebnis: ImportErgebnis; bericht: ImportBericht; versatz: number };

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
  const T = useTexte().importexport.import;
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
                {h.schluessel.includes('satzende')
                  ? f(T.zitatEnde, { text: zitat.text })
                  : f(T.zitat, { text: `${zitat.text}${zitat.text.length >= 60 ? '…' : ''}` })}
              </span>
            )}
            {oeffnen && nummer !== null && nummer > 0 && (
              <Button variante="text" klein onClick={() => oeffnen(nummer)}>
                {T.kapitelOeffnen}
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
  const T = texte().importexport.import;
  const teile = [antworten ? f(T.antworten, { n: antworten }) : '', kapitel ? f(T.alsNotiz, { n: kapitel }) : ''].filter(Boolean);
  return `${f(T.kommentare, { n: liste.length })}${teile.length ? ` (${teile.join(', ')})` : ''}`;
}

export function ImportDialog({ schliessen }: DialogKomponentenProps) {
  const backend = useStore((s) => s.backend);
  const daten = useStore((s) => s.daten);
  const importUebernehmen = useStore((s) => s.importUebernehmen);
  const oeffne = useStore((s) => s.oeffne);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const t = useTexte();
  const T = t.importexport.import;
  const mitAbgabe = useFunktion('abgabe');

  const [phase, setPhase] = useState<Phase>({ art: 'start' });
  const [quelle, setQuelle] = useState<'word' | 'ordner'>('word');
  const [ziel, setZiel] = useState<'aktuell' | 'neu'>(daten ? 'aktuell' : 'neu');
  const [projektTitel, setProjektTitel] = useState('');
  const [vorspannAlsKapitel, setVorspannAlsKapitel] = useState(false);
  const [kommentareUebernehmen, setKommentareUebernehmen] = useState(true);

  const beschaeftigt = phase.art === 'liest' || phase.art === 'uebernimmt';
  const projektLeer = !!daten && daten.projekt.kapitel.length === 0;

  async function dateiWaehlen() {
    if (!backend) return;
    const vorher = phase;
    setPhase({ art: 'liest', name: quelle === 'ordner' ? T.ordner : T.word });
    try {
      let name: string;
      let ergebnis: ImportErgebnis;
      if (quelle === 'ordner') {
        const ordner = await backend.ordnerWaehlen();
        if (!ordner) { setPhase(vorher); return; }
        name = ordner.name;
        ergebnis = importiereMarkdownOrdner(ordner.dateien, sprache());
        if (!ergebnis.kapitel.length) {
          setPhase({ art: 'leer', name, ergebnis, keineDateien: ordner.dateien.length === 0 });
          return;
        }
      } else {
        const datei = await backend.dateiWaehlen(['docx']);
        if (!datei) { setPhase(vorher); return; }
        name = datei.name;
        ergebnis = await importiereDocx(datei.daten, sprache());
      }
      setProjektTitel(ergebnis.buchtitel ?? name.replace(/\.docx$/i, ''));
      setVorspannAlsKapitel(false);
      setKommentareUebernehmen(true);
      setPhase({ art: 'vorschau', name, ergebnis });
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
      else setPhase({ art: 'fehler', meldung: f(texte().importexport.import.fehlgeschlagen, { fehler: fehlertext(e) }) });
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

  if (phase.art === 'start' || phase.art === 'liest' || phase.art === 'fehler' || phase.art === 'leer') {
    inhalt = (
      <>
        <div className="pw-ie-optionen" role="radiogroup" aria-label={T.quelle}>
          <Radio name="pw-import-quelle" checked={quelle === 'word'} onChange={() => { setQuelle('word'); setPhase({ art: 'start' }); }} disabled={beschaeftigt}>{T.word}</Radio>
          <Radio name="pw-import-quelle" checked={quelle === 'ordner'} onChange={() => { setQuelle('ordner'); setPhase({ art: 'start' }); }} disabled={beschaeftigt}>{T.ordner}</Radio>
        </div>
        <p className="pw-ie-text">{quelle === 'ordner' ? T.ordnerErklaerung : T.erklaerung}</p>
        {quelle === 'word' && daten && mitAbgabe && phase.art !== 'liest' && (
          <p className="pw-ie-text" style={{ fontSize: 12 }}>
            {T.lektoratFrage}{' '}
            <Button variante="text" klein onClick={() => oeffneDialog('rueckimport')} style={{ height: 'auto', padding: 0 }}>
              {T.lektoratLink}
            </Button>
          </p>
        )}
        {phase.art === 'liest' && <p className="pw-ie-meldung">{f(T.wirdGelesen, { name: phase.name })}</p>}
        {phase.art === 'leer' && <>
          <p className="pw-ie-kopf__datei">{phase.name}</p>
          <p role="status" className="pw-ie-meldung">{phase.keineDateien ? T.ordnerLeer : T.keinKapiteltext}</p>
          <HinweisListe hinweise={phase.ergebnis.hinweise} />
        </>}
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
          {t.gemeinsam.abbrechen}
        </Button>
        <Button variante="primaer" onClick={dateiWaehlen} disabled={!backend || beschaeftigt} data-autofocus>
          {quelle === 'ordner' ? T.ordnerWaehlen : T.dateiWaehlen}
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
            {f(t.importexport.kapitelAnzahl, { n: ergebnis.kapitel.length })} · {f(t.gemeinsam.woerter, { n: gesamt })}
          </span>
          <Button variante="text" klein onClick={dateiWaehlen} disabled={beschaeftigt}>
            {quelle === 'ordner' ? T.andererOrdner : T.andereDatei}
          </Button>
          <Button variante="text" klein onClick={() => setPhase({ art: 'start' })} disabled={beschaeftigt}>{T.quelle}</Button>
        </div>

        {ergebnis.kapitel.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label={t.importexport.kapitelListe}>
            <Abschnittslabel>{t.importexport.kapitelListe}</Abschnittslabel>
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
                  <span className="pw-ie-zeile__zahl">{z.woerter ? zahl(z.woerter) : t.importexport.geplant}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {vorspannWoerter > 0 && (
          <Checkbox checked={vorspannAlsKapitel} onChange={(e) => setVorspannAlsKapitel(e.target.checked)} disabled={beschaeftigt}>
            {f(T.vorspann, { n: vorspannWoerter })}
          </Checkbox>
        )}

        {(ergebnis.kommentare?.length ?? 0) > 0 && (
          <Checkbox checked={kommentareUebernehmen} onChange={(e) => setKommentareUebernehmen(e.target.checked)} disabled={beschaeftigt}>
            {kommentarZeile(ergebnis)}
          </Checkbox>
        )}

        {ergebnis.hinweise.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label={T.strukturHinweise}>
            <div className="pw-ie-abschnitt__kopf">
              <Abschnittslabel farbe="var(--warm-dark)">{T.strukturHinweise}</Abschnittslabel>
              <span className="pw-ie-abschnitt__zusatz">{ergebnis.hinweise.length}</span>
            </div>
            <HinweisListe hinweise={ergebnis.hinweise} />
          </section>
        )}

        <section className="pw-ie-abschnitt" aria-label={T.uebernehmen}>
          <Abschnittslabel>{T.uebernehmen}</Abschnittslabel>
          <div className="pw-ie-optionen" role="radiogroup" aria-label={T.ziel}>
            {daten && (
              <Radio name="pw-import-ziel" checked={ziel === 'aktuell'} onChange={() => setZiel('aktuell')} disabled={beschaeftigt}>
                {projektLeer ? f(T.inDiesesProjekt, { titel }) : f(T.anhaengen, { titel, n: daten.projekt.kapitel.length })}
              </Radio>
            )}
            <Radio name="pw-import-ziel" checked={!daten || ziel === 'neu'} onChange={() => setZiel('neu')} disabled={beschaeftigt}>
              {T.neuesProjekt}
            </Radio>
            {(!daten || ziel === 'neu') && (
              <div className="pw-ie-einzug">
                <Textfeld
                  aria-label={T.titelLabel}
                  placeholder={T.titelPlatzhalter}
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
        {phase.art === 'uebernimmt' && <span className="pw-ie-fuss-links">{T.wirdUebernommen}</span>}
        <Button onClick={schliessen} disabled={beschaeftigt}>
          {t.gemeinsam.abbrechen}
        </Button>
        <Button
          variante="primaer"
          onClick={() => uebernehmen(name, ergebnis)}
          disabled={beschaeftigt || anzahl === 0 || ((!daten || ziel === 'neu') && !projektTitel.trim())}
        >
          {f(T.kapitelUebernehmen, { n: anzahl })}
        </Button>
      </>
    );
  } else {
    const { bericht, ergebnis, versatz } = phase;
    const n = bericht.ids.length;
    inhalt = (
      <>
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          {f(T.fertigKapitel, { n })}
          {bericht.geplant > 0 ? f(T.fertigGeplant, { n: bericht.geplant }) : ''}
          {bericht.anmerkungen > 0 ? f(T.fertigAnmerkungen, { n: bericht.anmerkungen }) : ''}
          {T.fertigEnde}
        </p>
        {ergebnis.hinweise.length > 0 && (
          <section className="pw-ie-abschnitt" aria-label={T.strukturHinweise}>
            <div className="pw-ie-abschnitt__kopf">
              <Abschnittslabel farbe="var(--warm-dark)">{T.strukturHinweise}</Abschnittslabel>
              <span className="pw-ie-abschnitt__zusatz">{ergebnis.hinweise.length}</span>
            </div>
            <HinweisListe hinweise={ergebnis.hinweise} oeffnen={(nummer) => oeffneKapitel(bericht.ids[nummer - 1 + versatz])} />
          </section>
        )}
      </>
    );
    aktionen = (
      <>
        <Button onClick={schliessen}>{t.gemeinsam.fertig}</Button>
        <Button variante="primaer" onClick={() => oeffneKapitel(bericht.ids[0])} disabled={n === 0} data-autofocus>
          {T.zumErstenKapitel}
        </Button>
      </>
    );
  }

  return (
    <Dialog
      titel={T.titel}
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
