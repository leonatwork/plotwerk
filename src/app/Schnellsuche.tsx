import { useMemo, useState } from 'react';
import { demoZuruecksetzen } from '../backend/demoSpeicher';
import { useI18n } from '../i18n';
import { useStore } from '../state/store';
import { bestaetigen as rueckfrage, Button, Dialog, IconDokument, IconFiguren, IconKapitel, IconOrte, IconSuche, klassen } from '../ui';
import { befehlAusfuehren } from './befehle';
import { bereichDefinition } from './bereiche';
import type { DialogKomponentenProps } from './dialogTypen';
import { suche, type Treffer } from './suche';

const ICON = { kapitel: IconKapitel, figur: IconFiguren, ort: IconOrte, bereich: IconDokument, befehl: IconDokument };

/** ⌘K: Schnellsuche über Figuren, Orte und Kapitel. */
export default function Schnellsuche({ schliessen }: DialogKomponentenProps) {
  const daten = useStore((s) => s.daten);
  const oeffne = useStore((s) => s.oeffne);
  const istDemo = useStore((s) => s.backend?.art === 'demo');
  const { t, sprache } = useI18n();
  const [eingabe, setEingabe] = useState('');
  const [markiert, setMarkiert] = useState(0);
  // suche() liest die Oberflächensprache selbst; `sprache` sorgt für neue Treffer nach dem Umschalten
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const treffer = useMemo(() => (daten ? suche(daten, eingabe) : []), [daten, eingabe, sprache]);
  const aktiv = Math.min(markiert, Math.max(0, treffer.length - 1));

  const waehle = (gewaehlt: Treffer | undefined) => {
    if (!gewaehlt) return;
    schliessen();
    if (gewaehlt.befehl) void befehlAusfuehren(gewaehlt.befehl);
    else oeffne(gewaehlt.bereich, gewaehlt.auswahl);
  };

  return (
    <Dialog titel={t.app.schnellsuche.titel} titelVersteckt oben breite={560} onSchliessen={schliessen} className="pw-suche">
      <div className="pw-suche__feld">
        <IconSuche size={16} />
        <input
          autoFocus
          type="search"
          aria-label={t.app.schnellsuche.feld}
          aria-controls="pw-suche-liste"
          aria-activedescendant={treffer[aktiv] ? `pw-suche-${aktiv}` : undefined}
          placeholder={t.app.schnellsuche.platzhalter}
          value={eingabe}
          onChange={(e) => {
            setEingabe(e.target.value);
            setMarkiert(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMarkiert((aktiv + 1) % Math.max(1, treffer.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMarkiert((aktiv - 1 + treffer.length) % Math.max(1, treffer.length));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              waehle(treffer[aktiv]);
            }
          }}
        />
      </div>
      <ul id="pw-suche-liste" role="listbox" aria-label={t.app.schnellsuche.treffer} className="pw-suche__liste">
        {treffer.length === 0 && <li className="pw-suche__leer">{t.app.schnellsuche.nichts}</li>}
        {treffer.map((tr, i) => {
          const Icon = tr.art === 'bereich' ? bereichDefinition(tr.bereich).Icon : ICON[tr.art];
          return (
            <li
              key={`${tr.art}:${tr.id}`}
              id={`pw-suche-${i}`}
              role="option"
              aria-selected={i === aktiv}
              className={klassen('pw-suche__treffer', i === aktiv && 'pw-suche__treffer--aktiv')}
              onMouseMove={() => i !== aktiv && setMarkiert(i)}
              onClick={() => waehle(tr)}
            >
              <Icon size={14} />
              <span className="pw-suche__titel">{tr.titel}</span>
              <span className="pw-suche__zusatz">{tr.zusatz}</span>
            </li>
          );
        })}
      </ul>
      {istDemo && (
        <div className="pw-suche__fuss">
          <span>{t.app.schnellsuche.demo}</span>
          <Button
            variante="text"
            klein
            onClick={async () => {
              if (await rueckfrage(t.app.schnellsuche.demoFrage, { knopf: t.app.schnellsuche.zuruecksetzen })) demoZuruecksetzen();
            }}
          >
            {t.app.schnellsuche.demoZuruecksetzen}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
