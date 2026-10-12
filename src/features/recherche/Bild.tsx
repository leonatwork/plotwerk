/** Bild aus recherche/dateien/ anzeigen: Bytes über die Binär-Kommandos lesen, als Blob-URL zeigen (CSP: img-src blob:). */
import { useEffect, useState, type CSSProperties } from 'react';
import { bildMimeTyp } from '@core/recherche/index';
import { beiDateiAenderung } from '../../state/slices/recherche';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';

type Eintrag = { url: string | null; fehler: string | null; warte: Promise<string>; fs: unknown };
const zwischenspeicher = new Map<string, Eintrag>();

/** Blob-URL für eine Projektdatei (je Datei und Projekt einmal gelesen). */
function ladeUrl(pfad: string, fs: unknown, lesen: (p: string) => Promise<Uint8Array | null>): Eintrag {
  const vorhanden = zwischenspeicher.get(pfad);
  if (vorhanden && vorhanden.fs === fs) return vorhanden;
  if (vorhanden?.url) URL.revokeObjectURL(vorhanden.url);
  const eintrag: Eintrag = { url: null, fehler: null, fs, warte: Promise.resolve('') };
  eintrag.warte = lesen(pfad).then(
    (daten) => {
      if (!daten) throw new Error('Datei fehlt im Projektordner');
      const kopie = new Uint8Array(daten.length);
      kopie.set(daten);
      eintrag.url = URL.createObjectURL(new Blob([kopie.buffer], { type: bildMimeTyp(pfad) }));
      return eintrag.url;
    },
    (e: unknown) => {
      throw e;
    },
  );
  eintrag.warte.catch((e: unknown) => {
    eintrag.fehler = e instanceof Error ? e.message : String(e);
  });
  zwischenspeicher.set(pfad, eintrag);
  return eintrag;
}

/** Vergisst eine Datei (nach Entfernen/Ersetzen). */
export function bildVergessen(pfad: string | undefined): void {
  if (!pfad) return;
  const e = zwischenspeicher.get(pfad);
  if (e?.url) URL.revokeObjectURL(e.url);
  zwischenspeicher.delete(pfad);
}

// Neu geschriebene oder entfernte Dateien beim nächsten Anzeigen neu lesen
beiDateiAenderung((pfad) => bildVergessen(pfad));

export function useBildUrl(pfad: string | undefined): { url: string | null; fehler: string | null } {
  const fs = useStore((s) => s.fs);
  const lesen = useStore((s) => s.leseBinaerDatei);
  const start = pfad && fs ? zwischenspeicher.get(pfad) : undefined;
  const [stand, setStand] = useState<{ pfad?: string; url: string | null; fehler: string | null }>({
    pfad,
    url: start?.fs === fs ? (start?.url ?? null) : null,
    fehler: start?.fs === fs ? (start?.fehler ?? null) : null,
  });
  useEffect(() => {
    if (!pfad || !fs) {
      setStand({ pfad, url: null, fehler: null });
      return;
    }
    let aktiv = true;
    const e = ladeUrl(pfad, fs, lesen);
    if (e.url || e.fehler) setStand({ pfad, url: e.url, fehler: e.fehler });
    else setStand({ pfad, url: null, fehler: null });
    e.warte.then(
      (url) => aktiv && setStand({ pfad, url, fehler: null }),
      (f: unknown) => aktiv && setStand({ pfad, url: null, fehler: f instanceof Error ? f.message : String(f) }),
    );
    return () => {
      aktiv = false;
    };
  }, [pfad, fs, lesen]);
  return stand.pfad === pfad ? { url: stand.url, fehler: stand.fehler } : { url: null, fehler: null };
}

export interface RechercheBildProps {
  pfad?: string;
  /** Vorschau eines noch nicht gespeicherten Bilds (Dialog) */
  vorschauUrl?: string | null;
  alt: string;
  /** cover: füllt die Fläche (Raster); contain: ganzes Bild (Inspektor, Lightbox) */
  einpassen?: 'cover' | 'contain';
  className?: string;
  style?: CSSProperties;
}

export function RechercheBild({ pfad, vorschauUrl, alt, einpassen = 'cover', className, style }: RechercheBildProps) {
  const { url, fehler } = useBildUrl(vorschauUrl ? undefined : pfad);
  const [kaputt, setKaputt] = useState(false);
  const quelle = vorschauUrl ?? url;
  useEffect(() => setKaputt(false), [quelle]);
  if (fehler || kaputt)
    return (
      <div className={klassen('rc-bild rc-bild--fehlt', className)} style={style} role="img" aria-label={`${alt} (keine Vorschau)`}>
        <span>{fehler ? 'Bild fehlt' : 'Keine Vorschau'}</span>
      </div>
    );
  if (!quelle) return <div className={klassen('rc-bild rc-bild--laedt', className)} style={style} aria-hidden="true" />;
  return (
    <div className={klassen('rc-bild', className)} style={style}>
      <img src={quelle} alt={alt} draggable={false} style={{ objectFit: einpassen }} onError={() => setKaputt(true)} />
    </div>
  );
}
