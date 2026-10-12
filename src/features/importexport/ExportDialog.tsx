/** Dialog „Exportieren“ (S-12): .docx oder PDF, ganzes Buch oder Auswahl, ohne Anmerkungen und Markierungen. */
import { useId, useMemo, useState } from 'react';
import { DOCX_SCHRIFTEN } from '@core/docx/exportieren';
import type { Id, KapitelStatus } from '@core/model/types';
import { wortzahl } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { exportDateiname, type ExportFormat } from '../../state/slices/importexport';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, Radio, Segment, StatusPunkt, Textfeld } from '../../ui';
import './importexport.css';

const zahl = (n: number) => n.toLocaleString('de-DE');

function mitEndung(name: string, format: ExportFormat): string {
  const basis = name.trim().replace(/\.(docx|pdf)$/i, '');
  return `${basis || 'Manuskript'}.${format}`;
}

interface Zeile {
  id: Id;
  nr: number;
  titel: string;
  woerter: number;
  status: KapitelStatus;
}

export function ExportDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backend = useStore((s) => s.backend);
  const einstellungen = useStore((s) => s.exportEinstellungen);
  const setzeEinstellungen = useStore((s) => s.setzeExportEinstellungen);
  const exportieren = useStore((s) => s.exportieren);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const dateinameId = useId();

  const vorgabe = (param as { auswahl?: Id[] } | undefined)?.auswahl;
  const [format, setFormat] = useState<ExportFormat>(einstellungen.format);
  const [umfang, setUmfang] = useState<'buch' | 'auswahl'>(vorgabe?.length ? 'auswahl' : einstellungen.umfang);
  const [auswahl, setAuswahl] = useState<Set<Id>>(() => new Set(vorgabe?.length ? vorgabe : einstellungen.auswahl));
  const [ohneLeere, setOhneLeere] = useState(einstellungen.ohneLeere);
  const [titelseite, setTitelseite] = useState(einstellungen.titelseite);
  const [schrift, setSchrift] = useState(einstellungen.schrift);
  const [dateiname, setDateiname] = useState(() => exportDateiname(daten?.projekt.titel ?? '', einstellungen.format));
  const [status, setStatus] = useState<{ art: 'bereit' } | { art: 'laeuft' } | { art: 'fertig'; name: string } | { art: 'fehler'; meldung: string }>({
    art: 'bereit',
  });

  const zeilen: Zeile[] = useMemo(() => {
    if (!daten) return [];
    return daten.projekt.kapitel.map((id, i) => {
      const k = daten.kapitel[id];
      const woerter = k ? wortzahl(k.text) : 0;
      return {
        id,
        nr: i + 1,
        titel: k?.titel ?? daten.plaene[id]?.titel ?? id,
        woerter,
        status: woerter === 0 ? 'geplant' : (daten.plaene[id]?.status ?? 'entwurf'),
      };
    });
  }, [daten]);

  if (!daten) {
    return (
      <Dialog titel="Exportieren" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-ie-text">Es ist kein Projekt geöffnet.</p>
      </Dialog>
    );
  }

  const imUmfang = umfang === 'buch' ? zeilen : zeilen.filter((z) => auswahl.has(z.id));
  const leere = imUmfang.filter((z) => z.woerter === 0).length;
  const gewaehlt = imUmfang.filter((z) => !(ohneLeere && z.woerter === 0));
  const woerter = gewaehlt.reduce((s, z) => s + z.woerter, 0);
  const laeuft = status.art === 'laeuft';

  const formatWechseln = (f: ExportFormat) => {
    setFormat(f);
    setDateiname((n) => mitEndung(n, f));
  };

  async function starten() {
    const name = mitEndung(dateiname, format);
    setDateiname(name);
    setzeEinstellungen({ format, umfang, auswahl: [...auswahl], ohneLeere, schrift, titelseite });
    setStatus({ art: 'laeuft' });
    try {
      const gespeichert = await exportieren({ format, kapitel: gewaehlt.map((z) => z.id), dateiname: name, schrift, titelseite });
      setStatus(gespeichert ? { art: 'fertig', name } : { art: 'bereit' });
    } catch (e) {
      setStatus({ art: 'fehler', meldung: `Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const umschalten = (id: Id, an: boolean) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });

  return (
    <Dialog
      titel="Exportieren"
      breite={560}
      onSchliessen={laeuft ? () => undefined : schliessen}
      modalFest={laeuft}
      aktionen={
        status.art === 'fertig' ? (
          <Button variante="primaer" onClick={schliessen} data-autofocus>
            Fertig
          </Button>
        ) : (
          <>
            <span className="pw-ie-fuss-links">
              {gewaehlt.length} Kapitel · {zahl(woerter)} Wörter
            </span>
            <Button onClick={schliessen} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button variante="primaer" onClick={starten} disabled={laeuft || gewaehlt.length === 0 || !backend}>
              {laeuft ? 'Wird erstellt …' : 'Exportieren'}
            </Button>
          </>
        )
      }
    >
      {status.art === 'fertig' ? (
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          „{status.name}“ wurde gespeichert.
        </p>
      ) : (
        <>
          <section className="pw-ie-abschnitt" aria-label="Format">
            <Abschnittslabel>Format</Abschnittslabel>
            <Segment<ExportFormat>
              label="Format"
              rolle="group"
              voll
              optionen={[
                { wert: 'docx', label: 'Word (.docx)' },
                { wert: 'pdf', label: 'PDF' },
              ]}
              wert={format}
              onChange={formatWechseln}
            />
          </section>

          <section className="pw-ie-abschnitt" aria-label="Umfang">
            <Abschnittslabel>Umfang</Abschnittslabel>
            <div className="pw-ie-optionen" role="radiogroup" aria-label="Umfang">
              <Radio name="pw-export-umfang" checked={umfang === 'buch'} onChange={() => setUmfang('buch')}>
                Ganzes Buch ({zeilen.length} Kapitel)
              </Radio>
              <Radio name="pw-export-umfang" checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')}>
                Auswahl
              </Radio>
            </div>
            {umfang === 'auswahl' && (
              <>
                <div className="pw-ie-abschnitt__kopf">
                  <span className="pw-ie-abschnitt__zusatz">{auswahl.size === 0 ? 'Kapitel wählen' : `${imUmfang.length} gewählt`}</span>
                  <span>
                    <Button variante="text" klein onClick={() => setAuswahl(new Set(zeilen.map((z) => z.id)))}>
                      Alle
                    </Button>
                    <Button variante="text" klein onClick={() => setAuswahl(new Set())}>
                      Keine
                    </Button>
                  </span>
                </div>
                <ul className="pw-ie-liste" style={{ margin: 0, listStyle: 'none' }} aria-label="Kapitel">
                  {zeilen.map((z) => (
                    <li key={z.id} className="pw-ie-zeile">
                      <Checkbox checked={auswahl.has(z.id)} onChange={(e) => umschalten(z.id, e.target.checked)}>
                        <StatusPunkt status={z.status} />
                        <span className="pw-ie-zeile__nr">{z.nr}</span>
                        <span className="pw-ie-zeile__titel">{z.titel}</span>
                      </Checkbox>
                      <span className="pw-ie-zeile__zahl">{z.woerter ? zahl(z.woerter) : 'geplant'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {leere > 0 && (
              <Checkbox checked={ohneLeere} onChange={(e) => setOhneLeere(e.target.checked)}>
                Kapitel ohne Text weglassen ({leere})
              </Checkbox>
            )}
            <Checkbox checked={titelseite} onChange={(e) => setTitelseite(e.target.checked)}>
              Titelseite „{daten.projekt.titel}“
            </Checkbox>
          </section>

          {format === 'docx' && (
            <section className="pw-ie-abschnitt" aria-label="Schrift">
              <Abschnittslabel>Schrift</Abschnittslabel>
              <Segment<string>
                label="Schrift im Word-Dokument"
                rolle="group"
                voll
                optionen={DOCX_SCHRIFTEN.map((s) => ({ wert: s, label: s }))}
                wert={schrift}
                onChange={setSchrift}
              />
              <p className="pw-ie-text" style={{ fontSize: 12 }}>
                12 pt, Zeilenabstand 1,5, jedes Kapitel als Überschrift 1 auf neuer Seite. Ist Newsreader beim Empfänger nicht installiert, ersetzt Word
                sie durch eine ähnliche Serifenschrift.
              </p>
            </section>
          )}
          {format === 'pdf' && (
            <p className="pw-ie-text" style={{ fontSize: 12 }}>
              A4, Newsreader 12 pt (eingebettet), Zeilenabstand 1,5, jedes Kapitel auf neuer Seite, mit Seitenzahlen.
            </p>
          )}

          <div className="pw-ie-feldreihe">
            <label htmlFor={dateinameId}>Dateiname</label>
            <Textfeld id={dateinameId} value={dateiname} onChange={(e) => setDateiname(e.target.value)} onBlur={() => setDateiname((n) => mitEndung(n, format))} />
          </div>

          <p className="pw-ie-text" style={{ fontSize: 12 }}>
            Anmerkungen, Markierungen und Planungsnotizen werden nicht exportiert.
          </p>
          <p className="pw-ie-text" style={{ fontSize: 12 }}>
            Für Verlag, Agentur oder Lektorat:{' '}
            <Button variante="text" klein onClick={() => oeffneDialog('abgabe-export')} disabled={laeuft} style={{ height: 'auto', padding: 0 }}>
              Normseite, Exposé, EPUB oder Lektoratsmappe …
            </Button>
          </p>

          {status.art === 'fehler' && (
            <p role="alert" className="pw-ie-meldung pw-ie-meldung--fehler">
              {status.meldung}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}

export default ExportDialog;
