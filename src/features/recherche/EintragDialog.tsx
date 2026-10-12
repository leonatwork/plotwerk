/**
 * Dialog „recherche-eintrag“: Bild, Link oder Notiz anlegen bzw. bearbeiten. Besitzer: G8.
 * param: { id?: Id, verweis?: Verweis, art?: RechercheArt }
 * Bilder werden erst beim Speichern nach recherche/dateien/ kopiert; Links werden nie geladen.
 */
import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { Id, RechercheArt, Verweis } from '@core/model/types';
import { bildMimeTyp, entwurfPruefen, groesseText, linkPruefen, schlagworteAusText, standardTitel, titelAusDateiname, type EintragEntwurf } from '@core/recherche/index';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { f, sprache, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import type { NeueDatei } from '../../state/slices/recherche';
import { Button, Dialog, Feld, Segment, Textfeld, klassen } from '../../ui';
import { VerweisFeld } from '../schreiben/VerweisFeld';
import { RechercheBild } from './Bild';
import { ausUebergabe, IconBild, IconLink, IconNotiz, uebergabeMoeglich, ZielChip } from './gemeinsam';
import './recherche.css';
import { ZielWahl } from './ZielWahl';

export interface EintragDialogParam {
  id?: Id;
  verweis?: Verweis;
  art?: RechercheArt;
}

let zuletztArt: RechercheArt = 'bild';

/** Ziel aus dem Bereich, aus dem der Befehl kam (Figur, Ort, Kapitel) – sichtbar und lösbar. */
function kontextZiel(): Verweis | undefined {
  const s = useStore.getState();
  if (s.bereich === 'figuren' && s.auswahl.figur) return { typ: 'figur', id: s.auswahl.figur };
  if (s.bereich === 'orte' && s.auswahl.ort) return { typ: 'ort', id: s.auswahl.ort };
  if (s.bereich === 'schreiben' && s.auswahl.kapitel) return { typ: 'kapitel', id: s.auswahl.kapitel };
  return undefined;
}

export default function EintragDialog({ param, schliessen }: DialogKomponentenProps) {
  const t = useTexte();
  const td = t.recherche.dialog;
  const p = (param ?? {}) as EintragDialogParam;
  const daten = useStore((s) => s.daten);
  const r = useStore((s) => s.recherche);
  const alt = p.id ? daten?.recherche?.eintraege.find((e) => e.id === p.id) : undefined;
  const bearbeiten = !!alt;

  const [art, setArt] = useState<RechercheArt>(alt?.art ?? p.art ?? zuletztArt);
  const [titel, setTitel] = useState(alt?.titel ?? '');
  const [text, setText] = useState(alt?.text ?? '');
  const [url, setUrl] = useState(alt?.url ?? '');
  const [verweise, setVerweise] = useState<Verweis[]>(() => {
    if (alt) return alt.verweise;
    const v = p.verweis ?? kontextZiel();
    return v ? [v] : [];
  });
  const [schlagworte, setSchlagworte] = useState((alt?.schlagworte ?? []).join(', '));
  const [neueDatei, setNeueDatei] = useState<NeueDatei | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [ziehen, setZiehen] = useState(false);
  const [urlBeruehrt, setUrlBeruehrt] = useState(false);
  const backend = useStore((s) => s.backend);

  useEffect(() => () => void (vorschau && URL.revokeObjectURL(vorschau)), [vorschau]);

  const entwurf: EintragEntwurf = useMemo(
    () => ({
      art,
      titel,
      text,
      url: art === 'link' ? url : undefined,
      datei: art === 'bild' ? (neueDatei ? `recherche/dateien/${neueDatei.name}` : alt?.datei) : undefined,
      verweise,
      schlagworte: schlagworteAusText(schlagworte),
    }),
    [art, titel, text, url, neueDatei, alt?.datei, verweise, schlagworte],
  );
  const probleme = entwurfPruefen(entwurf, sprache());
  const link = art === 'link' ? linkPruefen(url) : null;
  const titelVorschlag = standardTitel({ ...entwurf, titel: '' }, sprache());

  function dateiUebernehmen(name: string, bytes: Uint8Array) {
    const f = r.dateiPruefen(name, bytes.length);
    if (f) {
      setFehler(f);
      return;
    }
    setFehler(null);
    setNeueDatei({ name, daten: bytes });
    setVorschau((alteUrl) => {
      if (alteUrl) URL.revokeObjectURL(alteUrl);
      const kopie = new Uint8Array(bytes.length);
      kopie.set(bytes);
      return URL.createObjectURL(new Blob([kopie.buffer], { type: bildMimeTyp(name) }));
    });
    if (!titel.trim()) setTitel(titelAusDateiname(name, sprache()));
  }

  async function dateiAusDatei(f: File) {
    dateiUebernehmen(f.name, new Uint8Array(await f.arrayBuffer()));
  }

  async function dateiWaehlen() {
    if (!backend) return;
    const { BILD_ENDUNGEN } = await import('@core/recherche/index');
    const gewaehlt = await backend.dateiWaehlen(BILD_ENDUNGEN);
    if (gewaehlt) dateiUebernehmen(gewaehlt.name, gewaehlt.daten);
  }

  function uebergabe(dt: DataTransfer | null): boolean {
    const { dateien, links } = ausUebergabe(dt);
    const bild = dateien[0];
    if (bild && (!bearbeiten || art === 'bild')) {
      setArt('bild');
      void dateiAusDatei(bild);
      return true;
    }
    const l = links[0];
    if (l && (!bearbeiten || art === 'link')) {
      setArt('link');
      setUrl(l);
      return true;
    }
    return false;
  }

  async function speichern() {
    setUrlBeruehrt(true);
    if (probleme.length || beschaeftigt) return;
    setBeschaeftigt(true);
    setFehler(null);
    try {
      const e = await r.speichern({ ...entwurf, datei: neueDatei ? undefined : entwurf.datei }, { id: alt?.id, neueDatei: neueDatei ?? undefined });
      if (!bearbeiten) zuletztArt = art;
      r.waehle(e.id);
      schliessen();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
      setBeschaeftigt(false);
    }
  }

  if (!daten) return null;
  if (p.id && !alt)
    return (
      <Dialog titel={td.titel} onSchliessen={schliessen} aktionen={<Button variante="primaer" onClick={schliessen}>{t.gemeinsam.schliessen}</Button>}>
        <p className="rc-dialog__text">{td.gibtsNicht}</p>
      </Dialog>
    );

  const bildDa = !!(neueDatei || alt?.datei);

  return (
    <Dialog
      titel={bearbeiten ? td.bearbeiten : td.neu}
      onSchliessen={schliessen}
      breite={560}
      modalFest={beschaeftigt}
      aktionen={
        <>
          {probleme.length > 0 && urlBeruehrt && <span className="rc-dialog__problem">{probleme[0]}</span>}
          <Button onClick={schliessen} disabled={beschaeftigt}>
            {t.gemeinsam.abbrechen}
          </Button>
          <Button variante="primaer" onClick={() => void speichern()} disabled={beschaeftigt} title={td.speichernTitel}>
            {beschaeftigt ? td.speichert : bearbeiten ? t.gemeinsam.speichern : td.anlegen}
          </Button>
        </>
      }
    >
      <form
        className="rc-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void speichern();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            void speichern();
          }
        }}
        onPaste={(e: ClipboardEvent) => {
          if (e.clipboardData.files.length && uebergabe(e.clipboardData)) e.preventDefault();
        }}
      >
        {!bearbeiten && (
          <Segment<RechercheArt>
            label={td.art}
            rolle="tablist"
            wert={art}
            onChange={(a) => {
              setArt(a);
              setFehler(null);
            }}
            optionen={[
              { wert: 'bild', label: <span className="rc-segment-label"><IconBild size={13} /> {t.recherche.art.bild}</span> },
              { wert: 'link', label: <span className="rc-segment-label"><IconLink size={13} /> {t.recherche.art.link}</span> },
              { wert: 'notiz', label: <span className="rc-segment-label"><IconNotiz size={13} /> {t.recherche.art.notiz}</span> },
            ]}
          />
        )}

        {art === 'bild' && (
          <div
            className={klassen('rc-ablage', ziehen && 'rc-ablage--ziehen', bildDa && 'rc-ablage--voll')}
            onDragOver={(e: DragEvent) => {
              if (!uebergabeMoeglich(e.dataTransfer)) return;
              e.preventDefault();
              setZiehen(true);
            }}
            onDragLeave={() => setZiehen(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setZiehen(false);
              uebergabe(e.dataTransfer);
            }}
          >
            {bildDa ? (
              <>
                <RechercheBild pfad={alt?.datei} vorschauUrl={vorschau} alt={titel || td.vorschau} einpassen="contain" className="rc-ablage__bild" />
                <div className="rc-ablage__info">
                  <span>{neueDatei ? f(td.neueDatei, { name: neueDatei.name, groesse: groesseText(neueDatei.daten.length, sprache()) }) : alt?.datei}</span>
                  <Button variante="text" klein onClick={() => void dateiWaehlen()} disabled={!backend}>
                    {td.anderesBild}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <IconBild size={28} />
                <span className="rc-ablage__titel">{td.bildZiehen}</span>
                <Button onClick={() => void dateiWaehlen()} disabled={!backend} data-autofocus>
                  {td.bildWaehlen}
                </Button>
                <span className="rc-ablage__klein">{td.bildKopie}</span>
              </>
            )}
          </div>
        )}

        {art === 'link' && (
          <Feld label={td.adresse}>
            {(id) => (
              <>
                <Textfeld
                  id={id}
                  type="url"
                  inputMode="url"
                  autoFocus
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={() => setUrlBeruehrt(true)}
                  aria-invalid={urlBeruehrt && !link}
                  spellCheck={false}
                />
                <span className={klassen('rc-dialog__hilfe', urlBeruehrt && url.trim() && !link && 'rc-dialog__hilfe--fehler')}>
                  {url.trim() && !link
                    ? td.adresseUngueltig
                    : link
                      ? f(td.nichtGeladenHost, { host: link.host })
                      : td.nichtGeladen}
                </span>
              </>
            )}
          </Feld>
        )}

        <Feld label={td.titelFeld}>
          {(id) => (
            <Textfeld
              id={id}
              value={titel}
              autoFocus={art === 'notiz'}
              placeholder={titelVorschlag && titelVorschlag !== 'Notiz' ? titelVorschlag : art === 'notiz' ? td.titelNotiz : td.titelFeld}
              onChange={(e) => setTitel(e.target.value)}
            />
          )}
        </Feld>

        <Feld label={art === 'notiz' ? t.recherche.notiz : t.recherche.beschreibung}>
          {(id) => (
            <VerweisFeld
              id={id}
              label={art === 'notiz' ? t.recherche.notiz : t.recherche.beschreibung}
              wert={text}
              onChange={setText}
              zeilen={art === 'notiz' ? 5 : 2}
              kontext={verweise[0] ?? null}
              placeholder={art === 'notiz' ? td.notizPlatzhalter : td.beschreibungPlatzhalter}
            />
          )}
        </Feld>

        <div className="pw-feld">
          <span className="pw-feld__label">{t.recherche.geheftetAn}</span>
          {verweise.length > 0 && (
            <div className="rc-ziele">
              {verweise.map((v) => (
                <ZielChip key={`${v.typ}:${v.id}`} verweis={v} oeffnen={false} onLoesen={() => setVerweise((l) => l.filter((x) => x.typ !== v.typ || x.id !== v.id))} />
              ))}
            </div>
          )}
          <ZielWahl gewaehlt={verweise} onWaehlen={(v) => setVerweise((l) => [...l, v])} />
        </div>

        <Feld label={t.recherche.schlagworte}>
          {(id) => <Textfeld id={id} value={schlagworte} placeholder={td.schlagwortePlatzhalter} onChange={(e) => setSchlagworte(e.target.value)} />}
        </Feld>

        {fehler && (
          <p className="rc-dialog__fehler" role="alert">
            {fehler}
          </p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
