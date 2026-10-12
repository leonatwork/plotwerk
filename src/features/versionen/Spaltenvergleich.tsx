/**
 * Zwei Fassungen eines Textes nebeneinander (G5): links „vorher“ mit entfernten Wörtern, rechts „nachher“ mit
 * neuen Wörtern, farbig markiert. Beide Spalten scrollen synchron (über gemeinsame Anker der gleichen Abschnitte).
 * Tastatur: Spalten sind fokussierbar (Pfeile/Bild-Tasten scrollen), ⌥↓ / ⌥↑ springt zur nächsten/vorigen Änderung.
 */
import { aenderungsBloecke, diffSpalten, type SpaltenTeil } from '@core/statistik';
import type { DiffTeil } from '@core/versionen/index';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { useTexte } from '../../i18n';
import '../statistik/statistik.css';

export interface SpaltenvergleichProps {
  diff: readonly DiffTeil[] | null;
  linksTitel: ReactNode;
  rechtsTitel: ReactNode;
  linksNeben?: ReactNode;
  rechtsNeben?: ReactNode;
  /** statt des Textes (z. B. „Kapitel gehört nicht zu dieser Fassung“) */
  linksLeer?: ReactNode;
  rechtsLeer?: ReactNode;
}

export interface SpaltenvergleichSteuerung {
  /** zur nächsten (1) oder vorigen (-1) Änderung springen; false, wenn es keine gibt */
  springe(richtung: 1 | -1): boolean;
}

type Seite = 'links' | 'rechts';

function Spalte({ teile, leer }: { teile: SpaltenTeil[]; leer?: ReactNode }) {
  const t = useTexte().versionen.spalten;
  if (leer) return <div className="pw-st-vgl__leer">{leer}</div>;
  return (
    <>
      {teile.length === 0 ? (
        <span className="pw-st-vgl__leer" style={{ padding: 0 }}>
          {t.leer}
        </span>
      ) : (
        teile.map((teil, i) =>
          teil.typ === 'gleich' ? (
            <span key={i} data-anker={teil.anker ?? undefined} data-nr={teil.nr}>
              {teil.text}
            </span>
          ) : (
            <span key={i} data-nr={teil.nr} data-aenderung="" className={teil.typ === 'neu' ? 'pw-st-diff--neu' : 'pw-st-diff--entfernt'}>
              <span className="pw-sr">{teil.typ === 'neu' ? t.neu : t.entfernt}</span>
              {teil.text}
            </span>
          ),
        )
      )}
    </>
  );
}

/** Oberkante eines Elements relativ zum Inhalt des scrollenden Containers. */
function oben(el: HTMLElement, container: HTMLElement): number {
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

export const Spaltenvergleich = forwardRef<SpaltenvergleichSteuerung, SpaltenvergleichProps>(function Spaltenvergleich(
  { diff, linksTitel, rechtsTitel, linksNeben, rechtsNeben, linksLeer, rechtsLeer },
  ref,
) {
  const t = useTexte().versionen.spalten;
  const spalten = useMemo(() => (diff ? diffSpalten(diff) : { links: [], rechts: [] }), [diff]);
  const bloecke = useMemo(() => (diff ? aenderungsBloecke(diff) : []), [diff]);
  const linksRef = useRef<HTMLDivElement>(null);
  const rechtsRef = useRef<HTMLDivElement>(null);
  /** zuletzt programmatisch gesetzte Position je Spalte (dieses Scroll-Ereignis nicht zurückspiegeln) */
  const gesetzt = useRef<Record<Seite, number | null>>({ links: null, rechts: null });
  const aktuellerBlock = useRef(-1);

  useEffect(() => {
    aktuellerBlock.current = -1;
    for (const c of [linksRef.current, rechtsRef.current]) if (c) c.scrollTop = 0;
    gesetzt.current = { links: null, rechts: null };
  }, [diff]);

  const container = (s: Seite) => (s === 'links' ? linksRef.current : rechtsRef.current);

  const setze = (s: Seite, wert: number) => {
    const el = container(s);
    if (!el) return;
    const ziel = Math.max(0, Math.min(wert, el.scrollHeight - el.clientHeight));
    if (Math.abs(el.scrollTop - ziel) < 1) return;
    gesetzt.current[s] = ziel;
    el.scrollTop = ziel;
  };

  const synchronisieren = useCallback((von: Seite) => {
    const quelle = container(von);
    const nach: Seite = von === 'links' ? 'rechts' : 'links';
    const ziel = container(nach);
    if (!quelle || !ziel) return;
    const g = gesetzt.current[von];
    if (g !== null && Math.abs(quelle.scrollTop - g) <= 2) {
      gesetzt.current[von] = null;
      return;
    }
    gesetzt.current[von] = null;
    const oberkante = quelle.scrollTop;
    // Ganz oben/unten: Ränder angleichen
    if (oberkante <= 0) return setze(nach, 0);
    if (oberkante >= quelle.scrollHeight - quelle.clientHeight - 1) return setze(nach, ziel.scrollHeight);
    let bester: HTMLElement | null = null;
    let besterOben = -Infinity;
    for (const el of quelle.querySelectorAll<HTMLElement>('[data-anker]')) {
      const o = oben(el, quelle);
      if (o <= oberkante + 1 && o > besterOben) {
        bester = el;
        besterOben = o;
      }
      if (o > oberkante) break;
    }
    if (!bester) {
      const anteil = oberkante / Math.max(1, quelle.scrollHeight - quelle.clientHeight);
      return setze(nach, anteil * (ziel.scrollHeight - ziel.clientHeight));
    }
    const gegenstueck = ziel.querySelector<HTMLElement>(`[data-anker="${bester.dataset.anker}"]`);
    if (!gegenstueck) return;
    const hoehe = Math.max(1, bester.getBoundingClientRect().height);
    const anteil = Math.min(1, (oberkante - besterOben) / hoehe);
    setze(nach, oben(gegenstueck, ziel) + anteil * gegenstueck.getBoundingClientRect().height);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      springe(richtung) {
        if (bloecke.length === 0) return false;
        let i = aktuellerBlock.current + richtung;
        if (i < 0) i = bloecke.length - 1;
        if (i >= bloecke.length) i = 0;
        aktuellerBlock.current = i;
        const nr = bloecke[i]!;
        // Der Block steht rechts (neu) oder links (entfernt); die passende Spalte führt
        for (const s of ['rechts', 'links'] as const) {
          const c = container(s);
          const el = c?.querySelector<HTMLElement>(`[data-nr="${nr}"]`);
          if (!c || !el) continue;
          c.querySelectorAll('[data-aktiv]').forEach((x) => x.removeAttribute('data-aktiv'));
          container(s === 'links' ? 'rechts' : 'links')
            ?.querySelectorAll('[data-aktiv]')
            .forEach((x) => x.removeAttribute('data-aktiv'));
          el.setAttribute('data-aktiv', '');
          c.scrollTop = Math.max(0, oben(el, c) - c.clientHeight / 3);
          synchronisieren(s);
          return true;
        }
        return false;
      },
    }),
    [bloecke, synchronisieren],
  );

  return (
    <div className="pw-st-vgl__spalten">
      <section className="pw-st-vgl__spalte" aria-label={t.links}>
        <div className="pw-st-vgl__spaltenkopf">
          <strong>{linksTitel}</strong>
          <span>{linksNeben}</span>
        </div>
        <div ref={linksRef} className="pw-st-vgl__text" tabIndex={0} onScroll={() => synchronisieren('links')} aria-label={t.linksText}>
          <Spalte teile={spalten.links} leer={linksLeer} />
        </div>
      </section>
      <section className="pw-st-vgl__spalte" aria-label={t.rechts}>
        <div className="pw-st-vgl__spaltenkopf">
          <strong>{rechtsTitel}</strong>
          <span>{rechtsNeben}</span>
        </div>
        <div ref={rechtsRef} className="pw-st-vgl__text" tabIndex={0} onScroll={() => synchronisieren('rechts')} aria-label={t.rechtsText}>
          <Spalte teile={spalten.rechts} leer={rechtsLeer} />
        </div>
      </section>
    </div>
  );
});
