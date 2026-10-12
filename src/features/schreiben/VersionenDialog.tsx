/**
 * Versionsverlauf eines Kapitels (S-04, E8): Schnappschüsse aus .versionen/, Wort-Vergleich mit der
 * aktuellen Fassung, Wiederherstellen (vorher wird die aktuelle Fassung gesichert).
 * G5: Schnappschüsse benannter Fassungen tragen deren Namen; „Nebeneinander“ öffnet den Fassungsvergleich,
 * „Fassung sichern …“ legt eine benannte Fassung an. Tastatur: ↑/↓ in der Liste wählt die Version.
 * param: { kapitel?: Id } – ohne Angabe das ausgewählte Kapitel.
 */
import type { Id } from '@core/model/types';
import { kapitelPfad, parseKapitel } from '@core/projekt';
import { fassungenJeVersion, versionsQuelle, AKTUELL } from '@core/statistik';
import { klartext } from '@core/text/index';
import { versionenAuflisten, wortDiff, type Version } from '@core/versionen/index';
import { useEffect, useMemo, useState } from 'react';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { datum, datumZeit, f, relativ, texte, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Button, Dialog } from '../../ui';
import '../statistik/statistik.css';
import './schreiben.css';
import { kapitelAnzeige } from './verweise';
import { NurMit } from '../../app/NurMit';

function wann(iso: string): { haupt: string; neben: string } {
  const d = new Date(iso);
  const minuten = Math.round((Date.now() - d.getTime()) / 60000);
  const neben =
    minuten < 1
      ? texte().schreiben.versionen.geradeEben
      : minuten < 60
        ? relativ(-minuten, 'minute')
        : minuten < 24 * 60
          ? relativ(-Math.round(minuten / 60), 'hour')
          : datum(d);
  return { haupt: datumZeit(d, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), neben };
}

export function VersionenDialog({ param, schliessen }: DialogKomponentenProps) {
  const gewaehltesKapitel = useStore((s) => s.auswahl.kapitel);
  const kapitelId: Id | undefined = (param as { kapitel?: Id } | undefined)?.kapitel ?? gewaehltesKapitel;
  const fs = useStore((s) => s.fs);
  const daten = useStore((s) => s.daten);
  const aktuellerText = useStore((s) => (kapitelId ? (s.daten?.kapitel[kapitelId]?.text ?? '') : ''));
  const editorSichern = useStore((s) => s.editorSichern);
  const wiederherstellen = useStore((s) => s.statistik.versionWiederherstellen);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const fassungen = useStore((s) => s.daten?.fassungen);
  const jeVersion = useMemo(() => fassungenJeVersion(fassungen ?? []), [fassungen]);
  const t = useTexte();
  const T = t.schreiben.versionen;

  const [versionen, setVersionen] = useState<Version[] | null>(null);
  const [auswahl, setAuswahl] = useState<Version | null>(null);
  const [inhalt, setInhalt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (!fs || !kapitelId) return;
    let aktiv = true;
    (async () => {
      await editorSichern();
      const liste = await versionenAuflisten(fs, kapitelPfad(kapitelId));
      if (!aktiv) return;
      setVersionen(liste);
      setAuswahl(liste[0] ?? null);
    })().catch((e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, [fs, kapitelId, editorSichern]);

  useEffect(() => {
    if (!fs || !auswahl || !kapitelId) {
      setInhalt(null);
      return;
    }
    let aktiv = true;
    fs.lesen(auswahl.versionsPfad).then(
      (t) => aktiv && setInhalt(t === null ? null : parseKapitel(t, kapitelId).text),
      (e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      aktiv = false;
    };
  }, [fs, auswahl, kapitelId]);

  /** Vergleich aktuelle Fassung → Version: „neu“ kommt beim Wiederherstellen zurück, „entfernt“ fällt weg. */
  const diff = useMemo(() => (inhalt === null ? null : wortDiff(klartext(aktuellerText), klartext(inhalt))), [inhalt, aktuellerText]);
  const gleich = diff !== null && diff.every((t) => t.typ === 'gleich');
  const zaehle = (typ: 'neu' | 'entfernt') => diff?.filter((t) => t.typ === typ).reduce((n, t) => n + (t.text.match(/\S+/g)?.length ?? 0), 0) ?? 0;

  const titel = daten && kapitelId ? kapitelAnzeige(daten, kapitelId) : '';

  return (
    <Dialog
      titel={T.titel}
      onSchliessen={schliessen}
      breite={880}
      modalFest={laeuft}
      aktionen={
        <>
          {fehler && <span className="pw-s-status__fehler" style={{ marginRight: 'auto', fontSize: 12 }}>{fehler}</span>}
          <NurMit funktion="fassungen">
            <Button onClick={() => kapitelId && oeffneDialog('fassung', { kapitel: kapitelId })} disabled={!kapitelId || laeuft} title={T.fassungSichernTitel}>
              {T.fassungSichern}
            </Button>
            <Button
              disabled={!auswahl || !kapitelId || laeuft}
              title={T.nebeneinanderTitel}
              onClick={() => auswahl && kapitelId && oeffneDialog('versionsvergleich', { links: versionsQuelle(auswahl.versionsPfad), rechts: AKTUELL, kapitel: kapitelId, pfad: auswahl.versionsPfad })}
            >
              {T.nebeneinander}
            </Button>
          </NurMit>
          <Button onClick={schliessen}>{t.gemeinsam.schliessen}</Button>
          <Button
            variante="primaer"
            disabled={!auswahl || inhalt === null || gleich || laeuft}
            onClick={async () => {
              if (!auswahl || !kapitelId) return;
              setLaeuft(true);
              setFehler(null);
              try {
                await wiederherstellen(kapitelId, auswahl.versionsPfad);
                schliessen();
              } catch (e) {
                setFehler(e instanceof Error ? e.message : String(e));
                setLaeuft(false);
              }
            }}
          >
            {laeuft ? T.stelltWiederHer : T.wiederherstellen}
          </Button>
        </>
      }
    >
      <span style={{ fontSize: 13, color: 'var(--ink-quiet)', marginTop: -6 }}>
        {titel}
        {versionen && ` · ${f(T.anzahl, { n: versionen.length })}`} · {T.vorherGesichert}
      </span>
      {versionen === null ? (
        <div className="pw-s-versionen" aria-busy="true" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <span className="pw-s-leise">{fehler ? T.nichtLesbar : T.laedt}</span>
        </div>
      ) : versionen.length === 0 ? (
        <p className="pw-s-leise" style={{ margin: 0 }}>
          {T.keine}
        </p>
      ) : (
        <div className="pw-s-versionen">
          <ul
            className="pw-s-versionen__liste"
            aria-label={T.liste}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const i = versionen.findIndex((v) => v.versionsPfad === auswahl?.versionsPfad);
              const n = Math.max(0, Math.min(versionen.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
              const ziel = versionen[n];
              if (!ziel) return;
              setAuswahl(ziel);
              e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[n]?.focus();
            }}
          >
            {versionen.map((v) => {
              const z = wann(v.zeit);
              const namen = jeVersion.get(v.versionsPfad)?.map((f) => f.name);
              return (
                <li key={v.versionsPfad}>
                  <button type="button" aria-pressed={v.versionsPfad === auswahl?.versionsPfad} onClick={() => setAuswahl(v)}>
                    {z.haupt}
                    {namen && namen.length > 0 && <span className="pw-st-etikett pw-st-etikett--geaendert" style={{ alignSelf: 'flex-start' }}>{namen.join(', ')}</span>}
                    <small>{z.neben}</small>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pw-s-versionen__legende">
              {gleich ? (
                <span>{T.gleich}</span>
              ) : (
                <>
                  <span>
                    <span className="pw-s-diff--neu">{T.kommtZurueck}</span> {f(T.woerter, { n: zaehle('neu') })}
                  </span>
                  <span>
                    <span className="pw-s-diff--entfernt">{T.faelltWeg}</span> {f(T.woerter, { n: zaehle('entfernt') })}
                  </span>
                </>
              )}
            </div>
            <div className="pw-s-versionen__diff" aria-label={T.vergleichLabel}>
              {diff?.map((t, i) =>
                t.typ === 'gleich' ? (
                  <span key={i}>{t.text}</span>
                ) : (
                  <span key={i} className={t.typ === 'neu' ? 'pw-s-diff--neu' : 'pw-s-diff--entfernt'}>
                    {t.text}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default VersionenDialog;
