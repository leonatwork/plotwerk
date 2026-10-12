/**
 * Dialog „versionsvergleich“: zwei beliebige Fassungen nebeneinander (G5). Besitzer: G5.
 * Quellen: aktueller Text, benannte Fassungen, einzelne Versionen (Schnappschüsse) eines Kapitels.
 * param: { links?: Quelle; rechts?: Quelle; kapitel?: Id; pfad?: string (Versionspfad, wird links gezeigt) }
 * Tastatur: ⌥↓ / ⌥↑ nächste/vorige Änderung, ⌥⇧T Seiten tauschen, Esc schließt.
 */
import type { BenannteFassung, Id } from '@core/model/types';
import { kapitelPfad } from '@core/projekt';
import {
  AKTUELL,
  fassungenJeVersion,
  fassungenSortiert,
  fassungsQuelle,
  fassungsVersion,
  kapitelAusVersionsPfad,
  quelleLesen,
  quellenKapitel,
  quellenText,
  vergleicheBuch,
  vergleicheTexte,
  versionsQuelle,
  zaehleDiff,
  type KapitelVergleich,
  type Quelle,
  type QuellenText,
} from '@core/statistik';
import { wortzahl } from '@core/text/index';
import { versionenAuflisten, type Version } from '@core/versionen/index';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DialogKomponentenProps } from '../../app/dialogTypen';
import { useStore } from '../../state/store';
import { Button, Dialog } from '../../ui';
import { kapitelAnzeige } from '../schreiben/verweise';
import { Spaltenvergleich, type SpaltenvergleichSteuerung } from '../versionen/Spaltenvergleich';
import { woerterText, zahl, zeitpunktAnzeige } from './hooks';
import './statistik.css';

interface Param {
  links?: Quelle;
  rechts?: Quelle;
  kapitel?: Id;
  pfad?: string;
}

const STATUS_TEXT: Record<KapitelVergleich['status'], { text: string; klasse: string }> = {
  gleich: { text: 'gleich', klasse: '' },
  geaendert: { text: 'geändert', klasse: 'pw-st-etikett--geaendert' },
  'nur-links': { text: 'nur links', klasse: 'pw-st-etikett--warn' },
  'nur-rechts': { text: 'neu', klasse: 'pw-st-etikett--neu' },
  'datei-fehlt': { text: 'fehlt', klasse: 'pw-st-etikett--warn' },
};

function quellenName(q: Quelle, fassungen: readonly BenannteFassung[]): string {
  const a = quelleLesen(q);
  if (a.art === 'aktuell') return 'Aktueller Text';
  if (a.art === 'fassung') return fassungen.find((f) => f.id === a.id)?.name ?? 'Fassung (entfernt)';
  return 'Version';
}

function leerText(t: QuellenText | null, q: Quelle): string | undefined {
  if (!t) return undefined;
  if (t.status === 'fehlt-in-fassung') return quelleLesen(q).art === 'aktuell' ? 'Dieses Kapitel ist nicht mehr im Buch.' : 'Dieses Kapitel gehört nicht zu dieser Fassung.';
  if (t.status === 'datei-fehlt') return `Der Schnappschuss fehlt im Projektordner (${t.pfad}).`;
  return undefined;
}

export default function VersionsvergleichDialog({ param, schliessen }: DialogKomponentenProps) {
  const p = (param ?? {}) as Param;
  const fs = useStore((s) => s.fs);
  const daten = useStore((s) => s.daten);
  const gewaehlt = useStore((s) => s.auswahl.kapitel);
  const editorSichern = useStore((s) => s.editorSichern);
  const fassungen = useMemo(() => fassungenSortiert(daten?.fassungen ?? []), [daten?.fassungen]);

  const start = useMemo(() => {
    const kapitelAusVersion = p.pfad ? kapitelAusVersionsPfad(p.pfad) : null;
    const links: Quelle = p.links ?? (p.pfad ? versionsQuelle(p.pfad) : fassungen[0] ? fassungsQuelle(fassungen[0].id) : AKTUELL);
    const rechts: Quelle = p.rechts ?? AKTUELL;
    const kapitel = kapitelAusVersion ?? p.kapitel ?? gewaehlt ?? daten?.projekt.kapitel.find((id) => daten.kapitel[id]?.text.trim());
    return { links, rechts, kapitel };
    // nur beim Öffnen
  }, []);

  const [links, setLinks] = useState<Quelle>(start.links);
  const [rechts, setRechts] = useState<Quelle>(start.rechts);
  const [kapitel, setKapitel] = useState<Id | undefined>(start.kapitel);
  const [versionen, setVersionen] = useState<Version[]>([]);
  const [texte, setTexte] = useState<{ links: QuellenText; rechts: QuellenText; schluessel: string } | null>(null);
  const [buch, setBuch] = useState<KapitelVergleich[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const steuerung = useRef<SpaltenvergleichSteuerung>(null);
  const linksId = useId();
  const rechtsId = useId();

  // Ausstehende Eingaben sichern, damit „aktueller Text“ stimmt
  useEffect(() => {
    void editorSichern().catch(() => undefined);
  }, [editorSichern]);

  // Versionen des Kapitels (für die Auswahl)
  useEffect(() => {
    if (!fs || !kapitel) {
      setVersionen([]);
      return;
    }
    let aktiv = true;
    versionenAuflisten(fs, kapitelPfad(kapitel)).then(
      (v) => aktiv && setVersionen(v),
      () => aktiv && setVersionen([]),
    );
    return () => {
      aktiv = false;
    };
  }, [fs, kapitel]);

  // Eine Versions-Quelle gehört zu genau einem Kapitel: beim Kapitelwechsel auf den aktuellen Text zurück
  const versionsKapitel = (q: Quelle) => {
    const a = quelleLesen(q);
    return a.art === 'version' ? kapitelAusVersionsPfad(a.pfad) : null;
  };
  const kapitelWaehlen = (id: Id) => {
    setKapitel(id);
    if (versionsKapitel(links) && versionsKapitel(links) !== id) setLinks(fassungen[0] ? fassungsQuelle(fassungen[0].id) : AKTUELL);
    if (versionsKapitel(rechts) && versionsKapitel(rechts) !== id) setRechts(AKTUELL);
  };

  // Kapitelliste auf Buchebene
  const buchEbene = quelleLesen(links).art !== 'version' && quelleLesen(rechts).art !== 'version';
  useEffect(() => {
    if (!fs || !daten || !buchEbene) {
      setBuch(null);
      return;
    }
    let aktiv = true;
    vergleicheBuch(fs, daten, fassungen, links, rechts).then(
      (b) => aktiv && setBuch(b),
      (e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      aktiv = false;
    };
  }, [fs, daten, fassungen, links, rechts, buchEbene]);

  // Kapitel ohne Inhalt in beiden Quellen? Dann das erste geänderte bzw. erste vorhandene wählen
  useEffect(() => {
    if (!buch || buch.length === 0) return;
    if (kapitel && buch.some((b) => b.id === kapitel)) return;
    setKapitel((buch.find((b) => b.status === 'geaendert') ?? buch[0]!).id);
  }, [buch, kapitel]);

  // Texte laden
  const schluessel = `${links}|${rechts}|${kapitel ?? ''}`;
  useEffect(() => {
    if (!fs || !daten || !kapitel) {
      setTexte(null);
      return;
    }
    let aktiv = true;
    Promise.all([quellenText(fs, daten, fassungen, links, kapitel), quellenText(fs, daten, fassungen, rechts, kapitel)]).then(
      ([l, r]) => aktiv && setTexte({ links: l, rechts: r, schluessel }),
      (e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      aktiv = false;
    };
  }, [fs, daten, fassungen, links, rechts, kapitel, schluessel]);

  const diff = useMemo(() => {
    if (!texte) return null;
    const l = texte.links.status === 'ok' ? texte.links.text : '';
    const r = texte.rechts.status === 'ok' ? texte.rechts.text : '';
    return vergleicheTexte(l, r);
  }, [texte]);
  const zaehlung = diff ? zaehleDiff(diff) : null;
  const versionsLabel = useVersionsLabel(fassungen);

  if (!daten) return null;

  const kapitelListe: Id[] = (() => {
    if (buch) return buch.map((b) => b.id);
    const ids = new Set<Id>();
    for (const q of [links, rechts]) for (const id of quellenKapitel(daten, fassungen, q) ?? []) ids.add(id);
    if (kapitel) ids.add(kapitel);
    return [...ids];
  })();
  const name = (id: Id) => (daten.kapitel[id] || daten.plaene[id] ? kapitelAnzeige(daten, id) : id);

  const optionen = (eigene: Quelle) => {
    const v = quelleLesen(eigene);
    const extraVersion = v.art === 'version' && !versionen.some((x) => x.versionsPfad === v.pfad) ? v.pfad : null;
    return (
      <>
        <option value={AKTUELL}>Aktueller Text</option>
        {fassungen.length > 0 && (
          <optgroup label="Benannte Fassungen">
            {fassungen.map((f) => (
              <option key={f.id} value={fassungsQuelle(f.id)} disabled={!!kapitel && !buch && !fassungsVersion(f, kapitel) && eigene !== fassungsQuelle(f.id)}>
                {f.name} · {zeitpunktAnzeige(f.datum)}
              </option>
            ))}
          </optgroup>
        )}
        {kapitel && (versionen.length > 0 || extraVersion) && (
          <optgroup label={`Versionen von ${name(kapitel)}`}>
            {extraVersion && <option value={versionsQuelle(extraVersion)}>{extraVersion.split('/').pop()}</option>}
            {versionen.map((x) => (
              <option key={x.versionsPfad} value={versionsQuelle(x.versionsPfad)}>
                {versionsLabel(x)}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  const titel = (q: Quelle) => {
    const a = quelleLesen(q);
    if (a.art === 'version') {
      const v = versionen.find((x) => x.versionsPfad === a.pfad);
      return v ? `Version ${versionsLabel(v)}` : 'Version';
    }
    return quellenName(q, fassungen);
  };
  const neben = (t: QuellenText | undefined) => (t?.status === 'ok' ? woerterText(wortzahl(t.text)) : '');
  const bereit = texte?.schluessel === schluessel;

  return (
    <Dialog titel="Fassungen vergleichen" breite={1140} onSchliessen={schliessen} aktionen={<Button variante="primaer" onClick={schliessen}>Schließen</Button>}>
      <div
        className="pw-st-vgl"
        onKeyDown={(e) => {
          if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            steuerung.current?.springe(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.altKey && e.shiftKey && e.code === 'KeyT') {
            e.preventDefault();
            setLinks(rechts);
            setRechts(links);
          }
        }}
      >
        <div className="pw-st-vgl__wahl">
          <div className="pw-feld">
            <label className="pw-feld__label" htmlFor={linksId}>
              Links (vorher)
            </label>
            <select id={linksId} className="pw-st-select" value={links} onChange={(e) => setLinks(e.target.value)} data-autofocus>
              {optionen(links)}
            </select>
          </div>
          <Button
            className="pw-st-vgl__tauschen"
            title="Seiten tauschen (⌥⇧T)"
            aria-label="Seiten tauschen"
            onClick={() => {
              setLinks(rechts);
              setRechts(links);
            }}
          >
            ⇄
          </Button>
          <div className="pw-feld">
            <label className="pw-feld__label" htmlFor={rechtsId}>
              Rechts (nachher)
            </label>
            <select id={rechtsId} className="pw-st-select" value={rechts} onChange={(e) => setRechts(e.target.value)}>
              {optionen(rechts)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: buch ? '230px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 12, minHeight: 0 }}>
          {buch && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
              <span className="pw-feld__label">
                Kapitel · {buch.filter((b) => b.status === 'geaendert').length} geändert
              </span>
              {buch.length === 0 ? (
                <span className="pw-st-leise">Keine Kapitel mit Text.</span>
              ) : (
                <ul className="pw-st-buchliste" aria-label="Kapitel" style={{ maxHeight: 'min(58vh, 560px)' }}>
                  {buch.map((b) => {
                    const s = STATUS_TEXT[b.status];
                    return (
                      <li key={b.id}>
                        <button type="button" aria-pressed={b.id === kapitel} onClick={() => kapitelWaehlen(b.id)}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(b.id)}</span>
                          <span className="pw-st-zahl" title="Wörter links → rechts">
                            {b.status === 'geaendert' && b.linksWoerter !== null && b.rechtsWoerter !== null
                              ? `${b.rechtsWoerter - b.linksWoerter >= 0 ? '+' : '−'}${zahl.format(Math.abs(b.rechtsWoerter - b.linksWoerter))}`
                              : ''}
                          </span>
                          <span className={`pw-st-etikett ${s.klasse}`}>{s.text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div className="pw-st-vgl__kapitel">
              {!buch && kapitel && <strong style={{ fontSize: 13 }}>{name(kapitel)}</strong>}
              {!buch && !kapitel && kapitelListe.length > 0 && (
                <select className="pw-st-select" aria-label="Kapitel" value="" onChange={(e) => kapitelWaehlen(e.target.value)}>
                  <option value="">Kapitel wählen …</option>
                  {kapitelListe.map((id) => (
                    <option key={id} value={id}>
                      {name(id)}
                    </option>
                  ))}
                </select>
              )}
              <span className="pw-st-vgl__legende" style={{ marginLeft: 'auto' }}>
                {fehler ? (
                  <span className="pw-st-fehler">{fehler}</span>
                ) : zaehlung && bereit ? (
                  zaehlung.neu === 0 && zaehlung.entfernt === 0 ? (
                    <span>Beide Fassungen sind gleich.</span>
                  ) : (
                    <>
                      <span>
                        <span className="pw-st-diff--entfernt">entfernt</span> {woerterText(zaehlung.entfernt)}
                      </span>
                      <span>
                        <span className="pw-st-diff--neu">neu</span> {woerterText(zaehlung.neu)}
                      </span>
                      <Button variante="text" klein title="Vorige Änderung (⌥↑)" onClick={() => steuerung.current?.springe(-1)}>
                        ↑ Vorige
                      </Button>
                      <Button variante="text" klein title="Nächste Änderung (⌥↓)" onClick={() => steuerung.current?.springe(1)}>
                        Nächste ↓
                      </Button>
                    </>
                  )
                ) : null}
              </span>
            </div>
            {!kapitel ? (
              <p className="pw-st-leise" style={{ margin: 0 }}>
                {daten.projekt.kapitel.length === 0 ? 'Das Buch hat noch keine Kapitel.' : 'Wähle ein Kapitel, um die Fassungen zu vergleichen.'}
              </p>
            ) : (
              <Spaltenvergleich
                ref={steuerung}
                diff={bereit ? diff : null}
                linksTitel={titel(links)}
                rechtsTitel={titel(rechts)}
                linksNeben={bereit ? neben(texte?.links) : ''}
                rechtsNeben={bereit ? neben(texte?.rechts) : ''}
                linksLeer={bereit ? leerText(texte!.links, links) : 'Lädt …'}
                rechtsLeer={bereit ? leerText(texte!.rechts, rechts) : 'Lädt …'}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Beschriftung einer Version: Zeitpunkt und die benannten Fassungen, zu denen sie gehört. */
function useVersionsLabel(fassungen: readonly BenannteFassung[]) {
  const jeVersion = useMemo(() => fassungenJeVersion(fassungen), [fassungen]);
  return (v: Version) => {
    const namen = jeVersion.get(v.versionsPfad)?.map((f) => f.name);
    return `${zeitpunktAnzeige(v.zeit)}${namen?.length ? ` · ${namen.join(', ')}` : ''}`;
  };
}
