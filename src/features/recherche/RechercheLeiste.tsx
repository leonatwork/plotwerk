/**
 * Kleine Recherche-Einbindung für Karten anderer Bereiche (Figur, Ort, Kapitel, Szene). Besitzer: G8.
 *
 *   import { RechercheLeiste } from '../recherche/RechercheLeiste';
 *   <RechercheLeiste ziel={{ typ: 'figur', id: figur.id }} />
 *
 * Zeigt geheftete Einträge (Bilder als Vorschaubilder, Links, Notizen) und solche, die per `[[` auf das
 * Ziel verweisen. Bilder/Adressen können direkt auf die Leiste gezogen werden und werden dann an das Ziel
 * geheftet. Klick auf einen Eintrag öffnet ihn im Bereich „Recherche“.
 */
import { useMemo, useState, type DragEvent } from 'react';
import type { RechercheEintrag, Verweis } from '@core/model/types';
import { eintraegeFuer, linkHost } from '@core/recherche/index';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { klassen } from '../../ui';
import { ablegen } from './ablegen';
import { RechercheBild } from './Bild';
import { ArtSymbol, IconExtern, linkOeffnen, uebergabeMoeglich } from './gemeinsam';
import './recherche.css';

export interface RechercheLeisteProps {
  ziel: Verweis;
  /** Überschrift, Standard „Recherche“ */
  titel?: string;
  /** höchstens so viele Einträge, Rest als „+ n weitere“ (Standard 6) */
  max?: number;
  /** ohne Überschrift (wenn der Bereich eine eigene hat) */
  ohneKopf?: boolean;
  className?: string;
}

function Zeile({ eintrag, geheftet }: { eintrag: RechercheEintrag; geheftet: boolean }) {
  const t = useTexte();
  const tl = t.recherche.leiste;
  const zeigen = useStore((s) => s.recherche.zeigen);
  return (
    <li className={klassen('rc-leiste__zeile', !geheftet && 'rc-leiste__zeile--erwaehnt')}>
      <button type="button" className="rc-leiste__eintrag" onClick={() => zeigen(eintrag.id)} title={f(tl.eintragOeffnen, { titel: eintrag.titel })}>
        {eintrag.art === 'bild' ? (
          <RechercheBild pfad={eintrag.datei} alt="" className="rc-leiste__mini" />
        ) : (
          <span className="rc-leiste__symbol" aria-hidden="true">
            <ArtSymbol art={eintrag.art} size={13} />
          </span>
        )}
        <span className="rc-leiste__text">
          <span className="rc-leiste__titel">{eintrag.titel}</span>
          <span className="rc-leiste__neben">{eintrag.art === 'link' ? linkHost(eintrag.url) : geheftet ? '' : tl.erwaehnt}</span>
        </span>
      </button>
      {eintrag.art === 'link' && (
        <button type="button" className="rc-leiste__extern" aria-label={f(tl.imBrowserLabel, { titel: eintrag.titel })} title={t.recherche.imBrowserOeffnen} onClick={() => void linkOeffnen(eintrag.url)}>
          <IconExtern size={13} />
        </button>
      )}
    </li>
  );
}

export function RechercheLeiste({ ziel, titel: titelProp, max = 6, ohneKopf, className }: RechercheLeisteProps) {
  const t = useTexte();
  const tl = t.recherche.leiste;
  const titel = titelProp ?? t.recherche.titel;
  const daten = useStore((s) => s.daten);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const zeigeBereich = useStore((s) => s.recherche.setzeZiel);
  const setzeBereich = useStore((s) => s.setzeBereich);
  const [ziehen, setZiehen] = useState(false);
  const [alle, setAlle] = useState(false);
  const liste = useMemo(() => (daten ? eintraegeFuer(daten, ziel) : []), [daten, ziel]);
  if (!daten) return null;
  const sichtbar = alle ? liste : liste.slice(0, max);

  return (
    <section
      aria-label={titel}
      className={klassen('rc-leiste', ziehen && 'rc-leiste--ziehen', className)}
      onDragOver={(e: DragEvent) => {
        if (!uebergabeMoeglich(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setZiehen(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setZiehen(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setZiehen(false);
        void ablegen(e.dataTransfer, [ziel]);
      }}
    >
      {!ohneKopf && (
        <div className="rc-leiste__kopf">
          <span className="pw-label">{titel}</span>
          {liste.length > 0 && <span className="rc-leiste__anzahl">{liste.length}</span>}
          <span style={{ flex: 1 }} />
          {liste.length > 0 && (
            <button
              type="button"
              className="rc-leiste__knopf"
              title={tl.alleTitel}
              onClick={() => {
                zeigeBereich(ziel);
                setzeBereich('recherche');
              }}
            >
              {t.gemeinsam.alle}
            </button>
          )}
          <button type="button" className="rc-leiste__knopf" onClick={() => oeffneDialog('recherche-eintrag', { verweis: ziel })} aria-label={f(tl.hinzufuegenLabel, { titel })}>
            {tl.hinzufuegen}
          </button>
        </div>
      )}
      {liste.length === 0 ? (
        <button type="button" className="rc-leiste__leer" onClick={() => oeffneDialog('recherche-eintrag', { verweis: ziel })}>
          {tl.leer}
        </button>
      ) : (
        <ul className="rc-leiste__liste">
          {sichtbar.map(({ eintrag, geheftet }) => (
            <Zeile key={eintrag.id} eintrag={eintrag} geheftet={geheftet} />
          ))}
        </ul>
      )}
      {liste.length > max && (
        <button type="button" className="rc-leiste__mehr" onClick={() => setAlle((a) => !a)}>
          {alle ? tl.weniger : f(tl.weitere, { n: liste.length - max })}
        </button>
      )}
    </section>
  );
}
