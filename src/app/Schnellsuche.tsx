import { useMemo, useState } from 'react';
import { demoZuruecksetzen } from '../backend/demoSpeicher';
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
  const [eingabe, setEingabe] = useState('');
  const [markiert, setMarkiert] = useState(0);
  const treffer = useMemo(() => (daten ? suche(daten, eingabe) : []), [daten, eingabe]);
  const aktiv = Math.min(markiert, Math.max(0, treffer.length - 1));

  const waehle = (t: Treffer | undefined) => {
    if (!t) return;
    schliessen();
    if (t.befehl) void befehlAusfuehren(t.befehl);
    else oeffne(t.bereich, t.auswahl);
  };

  return (
    <Dialog titel="Schnellsuche" titelVersteckt oben breite={560} onSchliessen={schliessen} className="pw-suche">
      <div className="pw-suche__feld">
        <IconSuche size={16} />
        <input
          autoFocus
          type="search"
          aria-label="Figuren, Orte und Kapitel suchen"
          aria-controls="pw-suche-liste"
          aria-activedescendant={treffer[aktiv] ? `pw-suche-${aktiv}` : undefined}
          placeholder="Figuren, Orte, Kapitel …"
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
      <ul id="pw-suche-liste" role="listbox" aria-label="Treffer" className="pw-suche__liste">
        {treffer.length === 0 && <li className="pw-suche__leer">Nichts gefunden.</li>}
        {treffer.map((t, i) => {
          const Icon = t.art === 'bereich' ? bereichDefinition(t.bereich).Icon : ICON[t.art];
          return (
            <li
              key={`${t.art}:${t.id}`}
              id={`pw-suche-${i}`}
              role="option"
              aria-selected={i === aktiv}
              className={klassen('pw-suche__treffer', i === aktiv && 'pw-suche__treffer--aktiv')}
              onMouseMove={() => i !== aktiv && setMarkiert(i)}
              onClick={() => waehle(t)}
            >
              <Icon size={14} />
              <span className="pw-suche__titel">{t.titel}</span>
              <span className="pw-suche__zusatz">{t.zusatz}</span>
            </li>
          );
        })}
      </ul>
      {istDemo && (
        <div className="pw-suche__fuss">
          <span>Browser-Demo · Änderungen bleiben in diesem Browser gespeichert.</span>
          <Button
            variante="text"
            klein
            onClick={async () => {
              if (await rueckfrage('Alle Änderungen an der Demo verwerfen und neu laden?', { knopf: 'Zurücksetzen' })) demoZuruecksetzen();
            }}
          >
            Demo zurücksetzen
          </Button>
        </div>
      )}
    </Dialog>
  );
}
