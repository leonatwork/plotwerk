/**
 * Dialog „abgabe-export“ (G7): Normseiten-Manuskript, Exposé-Vorlage, EPUB und Lektoratsmappe.
 * Alle Dateien gehen über backend.dateiSpeichern (wie der normale Export). Keine KI.
 */
import { useId, useMemo, useState } from 'react';
import { exposeGeruest, exposePlatzhalter, normseitenZaehlen, offeneHinweise, personenAuswahl, type ExposeKapitelQuelle, type PersonenOptionen } from '@core/abgabe/index';
import { epubKapitel } from '@core/epub/index';
import { buchSprache } from '@core/i18n';
import type { Id, KapitelStatus, ProjektAngaben } from '@core/model/types';
import { wortzahl } from '@core/text/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, useTexte, zahl, type Woerterbuch } from '../../i18n';
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

const FORMATE: AbgabeFormat[] = ['normseite', 'expose', 'epub', 'mappe', 'personen'];

/** Formate mit Beschriftung in der Oberflächensprache */
function formate(t: Woerterbuch): { wert: AbgabeFormat; label: string }[] {
  return FORMATE.map((wert) => ({ wert, label: t.abgabe.export.formate[wert] }));
}

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
  const t = useTexte();
  const te = t.abgabe.export;
  const umschalten = (id: Id, an: boolean) => {
    const neu = new Set(auswahl);
    if (an) neu.add(id);
    else neu.delete(id);
    setzeAuswahl(neu);
  };
  return (
    <section className="pw-ie-abschnitt" aria-label={te.umfang}>
      <Abschnittslabel>{te.umfang}</Abschnittslabel>
      <div className="pw-ie-optionen" role="radiogroup" aria-label={te.umfang}>
        <Radio name={name} checked={umfang === 'buch'} onChange={() => setzeUmfang('buch')}>
          {f(te.ganzesBuch, { n: zeilen.length })}
        </Radio>
        <Radio name={name} checked={umfang === 'auswahl'} onChange={() => setzeUmfang('auswahl')}>
          {te.auswahl}
        </Radio>
      </div>
      {umfang === 'auswahl' && (
        <>
          <div className="pw-ie-abschnitt__kopf">
            <span className="pw-ie-abschnitt__zusatz">{auswahl.size === 0 ? te.kapitelWaehlen : f(te.gewaehlt, { n: zeilen.filter((z) => auswahl.has(z.id)).length })}</span>
            <span>
              <Button variante="text" klein onClick={() => setzeAuswahl(new Set(zeilen.map((z) => z.id)))}>
                {t.gemeinsam.alle}
              </Button>
              <Button variante="text" klein onClick={() => setzeAuswahl(new Set())}>
                {te.keine}
              </Button>
            </span>
          </div>
          <ul className="pw-ie-liste" style={{ margin: 0, listStyle: 'none', maxHeight: 200 }} aria-label={te.kapitelListe}>
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

/** Angaben zum Buch (projekt.md) – Sprache beim Verlassen, Stil bei Auswahl gespeichert; übrige Angaben beim Export. */
function Angaben({ angaben, setze, speichern }: { angaben: ProjektAngaben; setze(teil: ProjektAngaben): void; speichern(angaben: ProjektAngaben): void }) {
  const id = useId();
  const ta = useTexte().abgabe.export.angaben;
  const felder: { schluessel: 'autor' | 'untertitel' | 'genre' | 'sprache'; label: string; platzhalter: string; hilfe?: string }[] = [
    { schluessel: 'autor', label: ta.autor, platzhalter: ta.autorPlatzhalter },
    { schluessel: 'untertitel', label: ta.untertitel, platzhalter: ta.untertitelPlatzhalter },
    { schluessel: 'genre', label: ta.genre, platzhalter: ta.genrePlatzhalter },
    // Buchsprache: Typografie, Silbentrennung und KI (nicht die Sprache der Oberfläche)
    { schluessel: 'sprache', label: ta.sprache, platzhalter: ta.sprachePlatzhalter, hilfe: ta.spracheHilfe },
  ];
  const zusammenfassung = [angaben.autor, angaben.untertitel, angaben.genre].filter((t) => t?.trim()).join(' · ');
  return (
    <details className="pw-ab-angaben" open={!angaben.autor?.trim() || undefined}>
      <summary>
        {ta.titel}
        <span className="pw-ab-angaben__zusatz">{zusammenfassung || ta.autorFehlt}</span>
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
              aria-describedby={f.hilfe ? `${id}-${f.schluessel}-hilfe` : undefined}
              onChange={(e) => setze({ [f.schluessel]: e.target.value })}
              onBlur={f.schluessel === 'sprache' ? () => speichern(angaben) : undefined}
            />
            {f.hilfe && (
              <span id={`${id}-${f.schluessel}-hilfe`} className="pw-ab-angaben__hilfe">
                {f.hilfe}
              </span>
            )}
          </div>
        ))}
        {buchSprache(angaben) === 'de' && (
          <div className="pw-feld">
            <label className="pw-feld__label" htmlFor={`${id}-anfuehrung`}>{ta.anfuehrung}</label>
            <select
              id={`${id}-anfuehrung`}
              className="pw-ab-select"
              value={angaben.anfuehrung ?? 'de'}
              aria-describedby={`${id}-anfuehrung-hilfe`}
              onChange={(e) => {
                const wert = e.target.value;
                if (wert !== 'de' && wert !== 'verlag' && wert !== 'schweiz') return;
                setze({ anfuehrung: wert });
                speichern({ ...angaben, anfuehrung: wert });
              }}
            >
              <option value="de">{ta.anfuehrungDe}</option>
              <option value="verlag">{ta.anfuehrungVerlag}</option>
              <option value="schweiz">{ta.anfuehrungSchweiz}</option>
            </select>
            <span id={`${id}-anfuehrung-hilfe`} className="pw-ab-angaben__hilfe">{ta.anfuehrungHilfe}</span>
          </div>
        )}
      </div>
    </details>
  );
}

export default function AbgabeDialog({ param, schliessen }: DialogKomponentenProps) {
  const t = useTexte();
  const te = t.abgabe.export;
  const daten = useStore((s) => s.daten);
  const backend = useStore((s) => s.backend);
  const hinweise = useStore((s) => s.index.hinweise);
  const index = useStore((s) => s.index);
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
  const [personen, setPersonen] = useState<PersonenOptionen>(e.personen);
  const [personenFormat, setPersonenFormat] = useState<ExposeDateiformat>(e.personenFormat);
  const [personenVorspann, setPersonenVorspann] = useState(e.personenVorspann);
  const personenId = useId();
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
      <Dialog titel={te.titel} onSchliessen={schliessen} aktionen={<Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="pw-ie-text">{t.abgabe.keinProjekt}</p>
      </Dialog>
    );
  }

  const titel = daten.projekt.titel;
  const dateiformat = format === 'personen' ? personenFormat : exposeFormat;
  const dateiname = dateinamen[format] ?? abgabeDateiname(titel, format, dateiformat);
  const personenAnzahl = format === 'personen' ? personenAuswahl(daten, index.erstesVorkommen, personen).length : 0;
  const setzePersonen = (teil: Partial<PersonenOptionen>) => setPersonen((p) => ({ ...p, ...teil }));
  const vorspannOption = personenVorspann ? personen : undefined;
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
      auftrag = { format, kapitel: gewaehlt, titelseite, personen: vorspannOption };
      bereit = gewaehlt.length > 0;
      fussText = normseiten ? `${f(t.abgabe.kapitelAnzahl, { n: gewaehlt.length })} · ${f(te.normseiten, { n: normseiten.seiten })}` : '';
      break;
    case 'expose':
      auftrag = { format, ziel: exposeFormat, kapitel: exposeKapitel, nebenfiguren };
      fussText = expose ? f(te.platzhalter, { n: expose.platzhalter }) : '';
      break;
    case 'epub':
      auftrag = { format, kapitel: gewaehlt, titelseite, schrift: epubSchrift, personen: vorspannOption };
      bereit = gewaehlt.length > 0;
      fussText = `${f(t.abgabe.kapitelAnzahl, { n: gewaehlt.length })} · ${f(t.gemeinsam.woerter, { n: zeilen.filter((z) => gewaehlt.includes(z.id)).reduce((s, z) => s + z.woerter, 0) })}`;
      break;
    case 'mappe':
      auftrag = { format, kapitel: mappeKapitel };
      bereit = offen.length > 0;
      fussText = f(te.offeneHinweise, { n: offen.length });
      break;
    case 'personen':
      auftrag = { format, ziel: personenFormat, optionen: personen };
      fussText = f(te.personen.anzahl, { n: personenAnzahl });
      break;
  }

  async function starten() {
    const name = mitAbgabeEndung(dateiname, format, dateiformat);
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
      personen,
      personenFormat,
      personenVorspann,
    };
    abgabe.setzeEinstellungen(einstellungen);
    setStatus({ art: 'laeuft' });
    try {
      await abgabe.angabenSpeichern(angaben);
      const gespeichert = await abgabe.exportieren(auftrag, name);
      setStatus(gespeichert ? { art: 'fertig', name } : { art: 'bereit' });
    } catch (fehler) {
      setStatus({ art: 'fehler', meldung: f(te.fehlgeschlagen, { meldung: fehler instanceof Error ? fehler.message : String(fehler) }) });
    }
  }

  const ohneText = zeilen.length === 0 && (format === 'normseite' || format === 'epub');

  return (
    <Dialog
      titel={te.titel}
      breite={600}
      onSchliessen={laeuft ? () => undefined : schliessen}
      modalFest={laeuft}
      aktionen={
        status.art === 'fertig' ? (
          <>
            <Button onClick={() => setStatus({ art: 'bereit' })}>{te.weiteres}</Button>
            <Button variante="primaer" onClick={schliessen} data-autofocus>
              {t.gemeinsam.fertig}
            </Button>
          </>
        ) : (
          <>
            <span className="pw-ie-fuss-links">{fussText}</span>
            <Button onClick={schliessen} disabled={laeuft}>
              {t.gemeinsam.abbrechen}
            </Button>
            <Button variante="primaer" onClick={starten} disabled={laeuft || !bereit || ohneText || !backend}>
              {laeuft ? te.erstellt : te.exportieren}
            </Button>
          </>
        )
      }
    >
      {status.art === 'fertig' ? (
        <p className="pw-ie-meldung pw-ie-meldung--erfolg" role="status">
          {f(te.gespeichert, { name: status.name })}
          {format === 'expose' && ` ${te.exposeSelbst}`}
        </p>
      ) : (
        <>
          <Segment<AbgabeFormat>
            label={te.wasExportieren}
            rolle="group"
            voll
            optionen={formate(t)}
            wert={format}
            onChange={(f) => {
              setFormat(f);
              setStatus({ art: 'bereit' });
            }}
          />

          {format === 'normseite' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">{te.normseite.text}</p>
              {ohneText ? (
                <p className="pw-ie-text">{te.ohneText}</p>
              ) : (
                <>
                  {normseiten && (
                    <div className="pw-ab-zahlen" aria-live="polite">
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert">{zahl(normseiten.seiten)}</span>
                        <span className="pw-ab-zahl__label">{te.normseite.normseiten}</span>
                      </div>
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert pw-ab-zahl__wert--klein">{zahl(normseiten.woerter)}</span>
                        <span className="pw-ab-zahl__label">{te.normseite.woerter}</span>
                      </div>
                      <div className="pw-ab-zahl">
                        <span className="pw-ab-zahl__wert pw-ab-zahl__wert--klein">{zahl(normseiten.anschlaege)}</span>
                        <span className="pw-ab-zahl__label">{te.normseite.anschlaege}</span>
                      </div>
                      <span className="pw-ab-zahlen__zusatz">
                        {f(titelseite ? te.normseite.gezaehltOhneTitel : te.normseite.gezaehlt, {
                          zeilen: normseiten.zeilen,
                          faustregel: 1500,
                          seiten: normseiten.seitenNachAnschlaegen,
                        })}
                      </span>
                    </div>
                  )}
                  <Umfang zeilen={zeilen} umfang={umfang} auswahl={auswahl} setzeUmfang={setUmfang} setzeAuswahl={setAuswahl} name="pw-abgabe-umfang-ns" />
                  <Checkbox checked={titelseite} onChange={(ev) => setTitelseite(ev.target.checked)}>
                    {te.normseite.titelseite}
                  </Checkbox>
                  <Checkbox checked={personenVorspann} onChange={(ev) => setPersonenVorspann(ev.target.checked)}>
                    {te.vorspann}
                  </Checkbox>
                </>
              )}
            </div>
          )}

          {format === 'expose' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">{te.expose.text}</p>
              <section className="pw-ie-abschnitt" aria-label={te.expose.kapitel}>
                <Abschnittslabel>{te.expose.kapitel}</Abschnittslabel>
                <div className="pw-ie-optionen" role="radiogroup" aria-label={te.expose.kapitel}>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'keine'} onChange={() => setExposeKapitel('keine')}>
                    {te.expose.keine}
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'platzhalter'} onChange={() => setExposeKapitel('platzhalter')}>
                    {te.expose.jeKapitel}
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'plan'} onChange={() => setExposeKapitel('plan')}>
                    {te.expose.ausPlan}
                  </Radio>
                  <Radio name="pw-abgabe-expose-kapitel" checked={exposeKapitel === 'zusammenfassung'} onChange={() => setExposeKapitel('zusammenfassung')}>
                    {f(te.expose.zusammenfassungen, { n: freigegeben, gesamt: daten.projekt.kapitel.length })}
                  </Radio>
                </div>
                {exposeKapitel === 'zusammenfassung' && (
                  <p className="pw-ie-text" style={{ fontSize: 12 }}>
                    {te.expose.zusammenfassungenHilfe}
                  </p>
                )}
              </section>
              <Checkbox checked={nebenfiguren} onChange={(ev) => setNebenfiguren(ev.target.checked)}>
                {te.expose.nebenfiguren}
              </Checkbox>
              <section className="pw-ie-abschnitt" aria-label={te.expose.dateiformat}>
                <Abschnittslabel>{te.expose.dateiformat}</Abschnittslabel>
                <Segment<ExposeDateiformat>
                  label={te.expose.dateiformatLabel}
                  rolle="group"
                  voll
                  optionen={[
                    { wert: 'docx', label: te.expose.word },
                    { wert: 'md', label: te.expose.markdown },
                  ]}
                  wert={exposeFormat}
                  onChange={exposeFormatWechseln}
                />
              </section>
            </div>
          )}

          {format === 'epub' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">{te.epub.text}</p>
              {ohneText ? (
                <p className="pw-ie-text">{te.ohneText}</p>
              ) : (
                <>
                  <Umfang zeilen={zeilen} umfang={umfang} auswahl={auswahl} setzeUmfang={setUmfang} setzeAuswahl={setAuswahl} name="pw-abgabe-umfang-epub" />
                  <Checkbox checked={titelseite} onChange={(ev) => setTitelseite(ev.target.checked)}>
                    {te.epub.titelseite}
                  </Checkbox>
                  <Checkbox checked={epubSchrift} onChange={(ev) => setEpubSchrift(ev.target.checked)}>
                    {te.epub.schrift}
                  </Checkbox>
                  <Checkbox checked={personenVorspann} onChange={(ev) => setPersonenVorspann(ev.target.checked)}>
                    {te.vorspann}
                  </Checkbox>
                </>
              )}
            </div>
          )}

          {format === 'mappe' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">{te.mappe.text}</p>
              <div className="pw-ie-feldreihe">
                <label htmlFor={mappeId}>{te.umfang}</label>
                <select id={mappeId} className="pw-ab-select" value={mappeKapitel ?? ''} onChange={(ev) => setMappeKapitel(ev.target.value || null)}>
                  <option value="">{f(te.mappe.ganzesBuch, { n: offeneHinweise(hinweise).length })}</option>
                  {daten.projekt.kapitel.map((id, i) => (
                    <option key={id} value={id}>
                      {i + 1}. {daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id} ({offenJeKapitel.get(id) ?? 0})
                    </option>
                  ))}
                </select>
                {auswahlKapitel && auswahlKapitel !== mappeKapitel && (
                  <Button variante="text" klein onClick={() => setMappeKapitel(auswahlKapitel)}>
                    {te.mappe.aktuellesKapitel}
                  </Button>
                )}
              </div>
              {offen.length === 0 && (
                <p className="pw-ie-text" role="status">
                  {mappeKapitel ? te.mappe.keineImKapitel : te.mappe.keine}
                </p>
              )}
            </div>
          )}

          {format === 'personen' && (
            <div className="pw-ab-panel">
              <p className="pw-ie-text">{te.personen.text}</p>
              <section className="pw-ie-abschnitt" aria-label={te.personen.gliederung}>
                <Abschnittslabel>{te.personen.gliederung}</Abschnittslabel>
                <div className="pw-ie-optionen" role="radiogroup" aria-label={te.personen.gliederung}>
                  <Radio name="pw-abgabe-personen" checked={personen.gliederung === 'gruppen'} onChange={() => setzePersonen({ gliederung: 'gruppen' })}>
                    {te.personen.nachGruppen}
                  </Radio>
                  <Radio name="pw-abgabe-personen" checked={personen.gliederung === 'rolle'} onChange={() => setzePersonen({ gliederung: 'rolle' })}>
                    {te.personen.nachRolle}
                  </Radio>
                </div>
              </section>
              <Checkbox checked={personen.spitznamen !== false} onChange={(ev) => setzePersonen({ spitznamen: ev.target.checked })}>
                {te.personen.spitznamen}
              </Checkbox>
              <Checkbox checked={!!personen.statisten} onChange={(ev) => setzePersonen({ statisten: ev.target.checked })}>
                {te.personen.statisten}
              </Checkbox>
              <Checkbox checked={!!personen.geplante} onChange={(ev) => setzePersonen({ geplante: ev.target.checked })}>
                {te.personen.geplante}
              </Checkbox>
              <div className="pw-ie-feldreihe">
                <label htmlFor={personenId}>{te.personen.bisKapitel}</label>
                <select id={personenId} className="pw-ab-select" value={personen.bisKapitel ?? ''} onChange={(ev) => setzePersonen({ bisKapitel: ev.target.value || undefined })}>
                  <option value="">{te.personen.alleKapitel}</option>
                  {daten.projekt.kapitel.map((id, i) => (
                    <option key={id} value={id}>
                      {i + 1}. {daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id}
                    </option>
                  ))}
                </select>
              </div>
              <section className="pw-ie-abschnitt" aria-label={te.expose.dateiformat}>
                <Abschnittslabel>{te.expose.dateiformat}</Abschnittslabel>
                <Segment<ExposeDateiformat>
                  label={te.expose.dateiformatLabel}
                  rolle="group"
                  voll
                  optionen={[
                    { wert: 'docx', label: te.expose.word },
                    { wert: 'md', label: te.expose.markdown },
                  ]}
                  wert={personenFormat}
                  onChange={(fm) => {
                    setPersonenFormat(fm);
                    if (dateinamen.personen) setDateinamen((alt) => ({ ...alt, personen: mitAbgabeEndung(alt.personen!, 'personen', fm) }));
                  }}
                />
              </section>
            </div>
          )}

          {format !== 'mappe' && (
            <Angaben
              angaben={angaben}
              setze={(teil) => setAngaben((a) => ({ ...a, ...teil }))}
              speichern={(neu) => {
                void abgabe.angabenSpeichern(neu).catch((fehler: unknown) => {
                  setStatus({ art: 'fehler', meldung: f(te.fehlgeschlagen, { meldung: fehler instanceof Error ? fehler.message : String(fehler) }) });
                });
              }}
            />
          )}

          <div className="pw-ie-feldreihe">
            <label htmlFor={dateinameId}>{te.dateiname}</label>
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
