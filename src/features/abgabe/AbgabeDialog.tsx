/**
 * Dialog „abgabe-export“ (G7): Normseiten-Manuskript, Exposé-Vorlage, EPUB und Lektoratsmappe.
 * Alle Dateien gehen über backend.dateiSpeichern (wie der normale Export). Keine KI.
 */
import { useId, useMemo, useState } from 'react';
import { exposeGeruest, exposePlatzhalter, normseitenZaehlen, offeneHinweise, type ExposeKapitelQuelle } from '@core/abgabe/index';
import { epubKapitel } from '@core/epub/index';
import type { Id, KapitelStatus, ProjektAngaben } from '@core/model/types';
import { wortzahl } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import {
  abgabeDateiname,
  mitAbgabeEndung,
  type AbgabeAuftrag,
  type AbgabeEinstellungen,
  type AbgabeFormat,
  type ExposeDateiformat,
} from '../../state/slices/abgabe';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Checkbox, Dialog, Radio, Segment, StatusPunkt, Textfeld } from '../../ui';
import '../importexport/importexport.css';
import './abgabe.css';

const zahl = (n: number) => n.toLocaleString('de-DE');

const FORMATE: { wert: AbgabeFormat; label: string }[] = [
  { wert: 'normseite', label: 'Normseite' },
  { wert: 'expose', label: 'Exposé' },
  { wert: 'epub', label: 'EPUB' },
  { wert: 'mappe', label: 'Lektoratsmappe' },
];

interface Zeile {
  id: Id;
  nr: number;
  titel: string;
  woerter: number;
  status: KapitelStatus;
}

type Status = { art: 'bereit' } | { art: 'laeuft' } | { art: 'fertig'; name: string } | { art: 'fehler'; meldung: string };

/** Kapitel-Auswahl wie im Export-Dialog (ganzes Buch oder Auswahl). */
function Umfang({
  zeilen,
  umfang,
  auswahl,
  setzeUmfang,
  setzeAuswahl,
  name,
}: {
  zeilen: Zeile[];
  umfang: 'buch' | 'auswahl';
  auswahl: Set<Id>;
  setzeUmfang(u: 'buch' | 'auswahl'): void;
  setzeAuswahl(a: Set<Id>): void;
  name: string;
}) {
  const umschalten = (id: Id, an: boolean) => {
    const neu = new Set(auswahl);
    if (an) neu.add(id);
    else neu.delete(id);
    setzeAuswahl(neu);
  };
  return (
    <section className="pw-ie-abschnitt" aria-label="Umfang">
      <Abschnittslabel>Umfang</Abschnittslabel>
      <div className="pw-ie-optionen" role="radiogroup" aria-label="Umfang">
        <Radio name={name} checked={umfang === 'buch'} onChange={() => setzeUmfang('buch')}>
          Ganzes Buch ({zeilen.length} Kapitel mit Text)
        </Radio>
        <Radio name={name} checked={umfang === 'auswahl'} onChange={() => setzeUmfang('auswahl')}>
          Auswahl
        </Radio>
      </div>
      {umfang === 'auswahl' && (
        <>
          <div className="pw-ie-abschnitt__kopf">
            <span className="pw-ie-abschnitt__zusatz">{auswahl.size === 0 ? 'Kapitel wählen' : `${zeilen.filter((z) => auswahl.has(z.id)).length} gewählt`}</span>
            <span>
              <Button variante="text" klein onClick={() => setzeAuswahl(new Set(zeilen.map((z) => z.id)))}>
                Alle
              </Button>
              <Button variante="text" klein onClick={() => setzeAuswahl(new Set())}>
                Keine
              </Button>
            </span>
          </div>
          <ul className="pw-ie-liste" style={{ margin: 0, listStyle: 'none', maxHeight: 200 }} aria-label="Kapitel">
            {zeilen.map((z) => (
              <li key={z.id} className="pw-ie-zeile">
                <Checkbox checked={auswahl.has(z.id)} onChange={(e) => umschalten(z.id, e.target.checked)}>
                  <StatusPunkt status={z.status} />
                  <span className="pw-ie-zeile__nr">{z.nr}</span>
                  <span className="pw-ie-zeile__titel">{z.titel}</span>
                </Checkbox>
                <span className="pw-ie-zeile__zahl">{zahl(z.woerter)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Angaben zum Buch (projekt.md) – aufklappbar, gespeichert beim Verlassen eines Felds. */
function Angaben({ angaben, setze }: { angaben: ProjektAngaben; setze(teil: ProjektAngaben): void }) {
  const id = useId();
  const felder: { schluessel: keyof ProjektAngaben; label: string; platzhalter: string }[] = [
    { schluessel: 'autor', label: 'Autor', platzhalter: 'Dein Name' },
    { schluessel: 'untertitel', label: 'Untertitel', platzhalter: 'z. B. Roman' },
    { schluessel: 'genre', label: 'Genre', platzhalter: 'z. B. Gegenwartsroman' },
    { schluessel: 'sprache', label: 'Sprache', platzhalter: 'de' },
  ];
  const zusammenfassung = [angaben.autor, angaben.untertitel, angaben.genre].filter((t) => t?.trim()).join(' · ');
  return (
    <details className="pw-ab-angaben" open={!angaben.autor?.trim() || undefined}>
      <summary>
        Angaben zum Buch
        <span className="pw-ab-angaben__zusatz">{zusammenfassung || 'Autor fehlt noch'}</span>
      </summary>
      <div className="pw-ab-angaben__felder">
        {felder.map((f) => (
          <div key={f.schluessel} className="pw-feld">
            <label className="pw-feld__label" htmlFor={`${id}-${f.schluessel}`}>
              {f.label}
            </label>
            <Textfeld
              id={`${id}-${f.schluessel}`}
              value={angaben[f.schluessel] ?? ''}
              placeholder={f.platzhalter}
              onChange={(e) => setze({ [f.schluessel]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

export default function AbgabeDialog({ param, schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const backend = useStore((s) => s.backend);
  const hinweise = useStore((s) => s.index.hinweise);
  const auswahlKapitel = useStore((s) => s.auswahl.kapitel);
  const abgabe = useStore((s) => s.abgabe);
  const e = abgabe.einstellungen;
  const dateinameId = useId();
  const mappeId = useId();

  const startFormat = (param as { format?: AbgabeFormat } | undefined)?.format ?? e.format;
  const [format, setFormat] = useState<AbgabeFormat>(startFormat);
  const [umfang, setUmfang] = useState(e.umfang);
  const [auswahl, setAuswahl] = useState<Set<Id>>(() => new Set(e.auswahl));
  const [titelseite, setTitelseite] = useState(e.titelseite);
  const [exposeKapitel, setExposeKapitel] = useState<ExposeKapitelQuelle>(e.exposeKapitel);
  const [exposeFormat, setExposeFormat] = useState<ExposeDateiformat>(e.exposeFormat);
  const [nebenfiguren, setNebenfiguren] = useState(e.exposeNebenfiguren);
  const [epubSchrift, setEpubSchrift] = useState(e.epubSchrift);
  const [mappeKapitel, setMappeKapitel] = useState<Id | null>(() => e.mappeKapitel ?? null);
  const [angaben, setAngaben] = useState<ProjektAngaben>(() => daten?.projekt.angaben ?? {});
  const [dateinamen, setDateinamen] = useState<Partial<Record<AbgabeFormat, string>>>({});
  const [status, setStatus] = useState<Status>({ art: 'bereit' });

  /** Kapitel mit Text in Buchreihenfolge */
  const zeilen: Zeile[] = useMemo(() => {
    if (!daten) return [];
    const mitText = new Set(epubKapitel(daten.projekt.kapitel.map((id) => daten.kapitel[id]).filter((k): k is NonNullable<typeof k> => !!k)).map((k) => k.id));
    return daten.projekt.kapitel
      .map((id, i) => ({ id, i }))
      .filter(({ id }) => mitText.has(id))
      .map(({ id, i }) => ({
        id,
        nr: i + 1,
        titel: daten.kapitel[id]!.titel,
        woerter: wortzahl(daten.kapitel[id]!.text),
        status: daten.plaene[id]?.status ?? 'entwurf',
      }));
  }, [daten]);

  const gewaehlt = umfang === 'buch' ? zeilen.map((z) => z.id) : zeilen.filter((z) => auswahl.has(z.id)).map((z) => z.id);

  const normseiten = useMemo(() => {
    if (!daten || format !== 'normseite') return null;
    const ids = new Set(gewaehlt);
    return normseitenZaehlen(daten.projekt.kapitel.filter((id) => ids.has(id)).map((id) => daten.kapitel[id]!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten, format, gewaehlt.join('|')]);

  const datenMitAngaben = useMemo(() => (daten ? { ...daten, projekt: { ...daten.projekt, angaben } } : null), [daten, angaben]);
  const expose = useMemo(() => {
    if (!datenMitAngaben || format !== 'expose') return null;
    const g = exposeGeruest(datenMitAngaben, { kapitel: exposeKapitel, nebenfiguren });
    return { platzhalter: exposePlatzhalter(g) };
  }, [datenMitAngaben, format, exposeKapitel, nebenfiguren]);
  const freigegeben = useMemo(
    () => (daten ? daten.projekt.kapitel.filter((id) => daten.entscheidungen.zusammenfassungen.some((z) => z.kapitel === id && (z.text.trim() || z.kurz?.trim()))).length : 0),
    [daten],
  );
  const offen = useMemo(() => offeneHinweise(hinweise, { kapitel: mappeKapitel }), [hinweise, mappeKapitel]);
  const offenJeKapitel = useMemo(() => {
    const m = new Map<Id, number>();
    if (!daten) return m;
    for (const id of daten.projekt.kapitel) m.set(id, offeneHinweise(hinweise, { kapitel: id }).length);
    return m;
  }, [daten, hinweise]);

  if (!daten) {
    return (
      <Dialog titel="Für die Abgabe exportieren" onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>Schließen</Button>}>
        <p className="pw-ie-text">Es ist kein Projekt geöffnet.</p>
      </Dialog>
    );
  }

  const titel = daten.projekt.titel;
  const dateiname = dateinamen[format] ?? abgabeDateiname(titel, format, exposeFormat);
  const setzeDateiname = (n: string) => setDateinamen((alt) => ({ ...alt, [format]: n }));
  const laeuft = status.art === 'laeuft';

  const exposeFormatWechseln = (f: ExposeDateiformat) => {
    setExposeFormat(f);
    if (dateinamen.expose) setDateinamen((alt) => ({ ...alt, expose: mitAbgabeEndung(alt.expose!, 'expose', f) }));
  };

  let auftrag: AbgabeAuftrag;
  let bereit = true;
  let fussText = '';
  switch (format) {
    case 'normseite':
      auftrag = { format, kapitel: gewaehlt, titelseite };
      bereit = gewaehlt.length > 0;
      fussText = normseiten ? `${gewaehlt.length} Kapitel · ${zahl(normseiten.seiten)} Normseiten` : '';
      break;
    case 'expose':
      auftrag = { format, ziel: exposeFormat, kapitel: exposeKapitel, nebenfiguren };
      fussText = expose ? `${expose.platzhalter} Platzhalter zum Ausfüllen` : '';
      break;
    case 'epub':
      auftrag = { format, kapitel: gewaehlt, titelseite, schrift: epubSchrift };
      bereit = gewaehlt.length > 0;
      fussText = `${gewaehlt.length} Kapitel · ${zahl(zeilen.filter((z) => gewaehlt.includes(z.id)).reduce((s, z) => s + z.woerter, 0))} Wörter`;
      break;
    case 'mappe':
      auftrag = { format, kapitel: mappeKapitel };
      bereit = offen.length > 0;
      fussText = offen.length === 1 ? '1 offener Hinweis' : `${zahl(offen.length)} offene Hinweise`;
      break;
  }

  async function starten() {
    const name = mitAbgabeEndung(dateiname, format, exposeFormat);
    setzeDateiname(name);
    const einstellungen: Partial<AbgabeEinstellungen> = {
      format,
      umfang,
      auswahl: [...auswahl],
      titelseite,
      exposeKapitel,
      exposeFormat,
      exposeNebenfiguren: nebenfiguren,
      epubSchrift,
      mappeKapitel,
    };
    abgabe.setzeEinstellungen(einstellungen);
    setStatus({ art: 'laeuft' });
    try {
      await abgabe.angabenSpeichern(angaben);
      const gespeichert = await abgabe.exportieren(auftrag, name);
      setStatus(gespeichert ? { art: 'fertig', name } : { art: 'bereit' });
    } catch (fehler) {
      setStatus({ art: 'fehler', meldung: `Export fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}` });
    }
  }

  const ohneText = zeilen.length === 0 && (format === 'normseite' || format === 'epub');

  return (
    <Dialog
      titel="Für die Abgabe exportieren"
      breite={600}
      onSchliessen={laeuft ? () => undefined : schliessen}
      modalFest={laeuft}
      aktionen={
        status.art === 'fertig' ? (
          <>
            <Button onClick={() => setStatus({ art: 'bereit' })}>Weiteres exportieren</Button>
            <Button variante="primaer" onClick={schliessen} data-autofocus>
              Fertig
            </Button>
          </>
        ) : (
          <>
            <span className="pw-ie-fuss-links">{fussText}</span>
            <Button onClick={schliessen} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button variante="primaer" onClick={starten} disabled={laeuft || !bereit || ohneText || !backend}>
              {laeuft ? 'Wird erstellt …' : 'Exportieren'}
            </Button>
          </>
        )
      }
    >
      {status.art === 'fertig' ? (
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          „{status.name}“ wurde gespeichert.
          {format === 'expose' && ' Die gelb markierten Platzhalter schreibst du selbst.'}
        </p>
      ) : (
        <>
          <Segment<AbgabeFormat>
            label="Was exportieren?"
            rolle="group"
            voll
            optionen={FORMATE}
            wert={format}
            onChange={(f) => {
              setFormat(f);
              setStatus({ art: 'bereit' });
            }}
          />

          {format === 'normseite' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">Manuskript im Normseiten-Format für Verlage und Agenturen: Courier New 12 pt, 30 Zeilen à 60 Anschläge, Kopfzeile mit Autor, Titel und Seitenzahl, jedes Kapitel auf neuer Seite.</p>
              {ohneText ? (
                <p className="pw-ie-text">Noch kein Kapitel hat Text.</p>
              ) : (
                <>
                  {normseiten && (
                    <div className="pw-ab-zahlen" aria-live="polite">
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert">{zahl(normseiten.seiten)}</span>
                        <span className="pw-ab-zahl__label">Normseiten</span>
                      </div>
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert pw-ab-zahl__wert--klein">{zahl(normseiten.woerter)}</span>
                        <span className="pw-ab-zahl__label">Wörter</span>
                      </div>
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert pw-ab-zahl__wert--klein">{zahl(normseiten.anschlaege)}</span>
                        <span className="pw-ab-zahl__label">Anschläge</span>
                      </div>
                      <span className="pw-ab-zahlen__zusatz">
                        Gezählt nach Zeilen ({zahl(normseiten.zeilen)} Zeilen{titelseite ? ', ohne Titelseite' : ''}). Nach der Faustregel 1.500 Anschläge je Seite wären es{' '}
                        {zahl(normseiten.seitenNachAnschlaegen)}.
                      </span>
                    </div>
                  )}
                  <Umfang zeilen={zeilen} umfang={umfang} auswahl={auswahl} setzeUmfang={setUmfang} setzeAuswahl={setAuswahl} name="pw-abgabe-umfang-ns" />
                  <Checkbox checked={titelseite} onChange={(ev) => setTitelseite(ev.target.checked)}>
                    Titelseite mit Titel, Autor und Umfang
                  </Checkbox>
                </>
              )}
            </div>
          )}

          {format === 'expose' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">
                Ein Gerüst aus deinem Plan zum Weiterschreiben: Eckdaten, Akte mit Quintessenz und Wendepunkt, Figuren mit Kurzbeschreibung. Den Exposé-Text schreibst du
                selbst – alles Offene steht als „[Platzhalter: …]“ darin.
              </p>
              <section className="pw-ie-abschnitt" aria-label="Kapitelübersicht">
                <Abschnittslabel>Kapitelübersicht</Abschnittslabel>
                <div className="pw-ie-optionen" role="radiogroup" aria-label="Kapitelübersicht">
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'keine'} onChange={() => setExposeKapitel('keine')}>
                    Keine
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'platzhalter'} onChange={() => setExposeKapitel('platzhalter')}>
                    Je Kapitel ein Platzhalter
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'plan'} onChange={() => setExposeKapitel('plan')}>
                    Aus meinem Kapitelplan (Szene und „Was soll hier passieren?“)
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'zusammenfassung'} onChange={() => setExposeKapitel('zusammenfassung')}>
                    Meine freigegebenen Zusammenfassungen ({freigegeben} von {daten.projekt.kapitel.length})
                  </Radio>
                </div>
                {exposeKapitel === 'zusammenfassung' && (
                  <p className="pw-ie-text" style={{ fontSize: 12 }}>
                    Nur Zusammenfassungen, die du in „Kapitel“ bearbeitet oder bestätigt hast. Unbearbeitete KI-Zusammenfassungen kommen nicht ins Exposé.
                  </p>
                )}
              </section>
              <Checkbox checked={nebenfiguren} onChange={(ev) => setNebenfiguren(ev.target.checked)}>
                Nebenfiguren aufnehmen
              </Checkbox>
              <section className="pw-ie-abschnitt" aria-label="Dateiformat">
                <Abschnittslabel>Dateiformat</Abschnittslabel>
                <Segment<ExposeDateiformat>
                  label="Dateiformat des Exposés"
                  rolle="group"
                  voll
                  optionen={[
                    { wert: 'docx', label: 'Word (.docx)' },
                    { wert: 'md', label: 'Markdown (.md)' },
                  ]}
                  wert={exposeFormat}
                  onChange={exposeFormatWechseln}
                />
              </section>
            </div>
          )}

          {format === 'epub' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">E-Book im Format EPUB 3 mit Inhaltsverzeichnis, gesetzt wie in der E-Book-Vorschau: Blocksatz mit Silbentrennung, Kapitelkopf, Szenentrenner.</p>
              {ohneText ? (
                <p className="pw-ie-text">Noch kein Kapitel hat Text.</p>
              ) : (
                <>
                  <Umfang zeilen={zeilen} umfang={umfang} auswahl={auswahl} setzeUmfang={setUmfang} setzeAuswahl={setAuswahl} name="pw-abgabe-umfang-epub" />
                  <Checkbox checked={titelseite} onChange={(ev) => setTitelseite(ev.target.checked)}>
                    Titelseite
                  </Checkbox>
                  <Checkbox checked={epubSchrift} onChange={(ev) => setEpubSchrift(ev.target.checked)}>
                    Newsreader einbetten (sonst wählt das Lesegerät die Schrift)
                  </Checkbox>
                </>
              )}
            </div>
          )}

          {format === 'mappe' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">Die offenen Hinweise als PDF zum Weitergeben oder Ausdrucken – je Hinweis Typ, Titel, Zitat und Erklärung. Als Absicht oder erledigt markierte Hinweise fehlen.</p>
              <div className="pw-ie-feldreihe">
                <label htmlFor={mappeId}>Umfang</label>
                <select id={mappeId} className="pw-ab-select" value={mappeKapitel ?? ''} onChange={(ev) => setMappeKapitel(ev.target.value || null)}>
                  <option value="">Ganzes Buch ({offeneHinweise(hinweise).length})</option>
                  {daten.projekt.kapitel.map((id, i) => (
                    <option key={id} value={id}>
                      {i + 1}. {daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id} ({offenJeKapitel.get(id) ?? 0})
                    </option>
                  ))}
                </select>
                {auswahlKapitel && auswahlKapitel !== mappeKapitel && (
                  <Button variante="text" klein onClick={() => setMappeKapitel(auswahlKapitel)}>
                    Aktuelles Kapitel
                  </Button>
                )}
              </div>
              {offen.length === 0 && (
                <p className="pw-ie-text" role="status">
                  {mappeKapitel ? 'In diesem Kapitel gibt es keine offenen Hinweise.' : 'Es gibt keine offenen Hinweise.'}
                </p>
              )}
            </div>
          )}

          {format !== 'mappe' && <Angaben angaben={angaben} setze={(teil) => setAngaben((a) => ({ ...a, ...teil }))} />}

          <div className="pw-ie-feldreihe">
            <label htmlFor={dateinameId}>Dateiname</label>
            <Textfeld
              id={dateinameId}
              value={dateiname}
              onChange={(ev) => setzeDateiname(ev.target.value)}
              onBlur={() => setzeDateiname(mitAbgabeEndung(dateiname, format, exposeFormat))}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && bereit && !laeuft && !ohneText) void starten();
              }}
            />
          </div>

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
