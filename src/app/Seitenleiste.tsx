import { useState } from 'react';
import { useStore } from '../state/store';
import { klassen, Zaehler } from '../ui';
import { BEREICHE, type BereichDefinition, type BereichModul } from './bereiche';
import { Fehlergrenze } from './Fehlergrenze';

const WERKZEUGE_OFFEN = 'plotwerk:seitenleiste:werkzeuge';

function gemerktOffen(): boolean {
  try {
    return localStorage.getItem(WERKZEUGE_OFFEN) === '1';
  } catch {
    return false;
  }
}

function merkeOffen(offen: boolean): void {
  try {
    localStorage.setItem(WERKZEUGE_OFFEN, offen ? '1' : '0');
  } catch {
    // ohne Speicher bleibt die Gruppe nur für diese Sitzung offen
  }
}

/** Seitenleiste 230 px: Navigation der Bereiche, darunter der Inhalt des aktiven Bereichs. */
export function Seitenleiste({ modul }: { modul: BereichModul | null }) {
  const bereich = useStore((s) => s.bereich);
  const setzeBereich = useStore((s) => s.setzeBereich);
  const neueHinweise = useStore((s) => {
    const entschieden = new Set(s.daten?.entscheidungen.hinweise.map((e) => e.schluessel));
    return s.index.hinweise.filter((h) => h.status === 'neu' && !entschieden.has(h.schluessel)).length;
  });
  const [werkzeugeOffen, setWerkzeugeOffen] = useState(gemerktOffen);
  const Inhalt = modul?.Seitenleiste;
  const eintrag = ({ id, titel, Icon, taste }: BereichDefinition) => (
    <button
      key={id}
      type="button"
      className={klassen('pw-nav__eintrag', id === bereich && 'pw-nav__eintrag--aktiv')}
      aria-current={id === bereich ? 'page' : undefined}
      title={taste ? `${titel} (⌘${taste})` : titel}
      onClick={() => setzeBereich(id)}
    >
      <Icon />
      {titel}
      {id === 'hinweise' && neueHinweise > 0 && <Zaehler wert={neueHinweise} label="neue Hinweise" style={{ marginLeft: 'auto' }} />}
    </button>
  );
  const werkzeuge = BEREICHE.filter((b) => b.gruppe === 'werkzeuge');
  // eingeklappt: nur das gerade aktive Werkzeug bleibt sichtbar
  const sichtbar = werkzeugeOffen ? werkzeuge : werkzeuge.filter((b) => b.id === bereich);
  const umschalten = () => {
    merkeOffen(!werkzeugeOffen);
    setWerkzeugeOffen(!werkzeugeOffen);
  };
  return (
    <aside className="pw-seitenleiste" aria-label="Seitenleiste">
      <nav aria-label="Bereiche" className="pw-nav">
        {BEREICHE.filter((b) => !b.gruppe).map(eintrag)}
        {werkzeuge.length > 0 && (
          <>
            <button
              type="button"
              className="pw-nav__gruppe"
              aria-expanded={werkzeugeOffen}
              aria-controls="pw-nav-werkzeuge"
              onClick={umschalten}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={klassen('pw-nav__pfeil', werkzeugeOffen && 'pw-nav__pfeil--offen')}>
                <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Werkzeuge
            </button>
            <div id="pw-nav-werkzeuge" className="pw-nav__werkzeuge">
              {sichtbar.map(eintrag)}
            </div>
          </>
        )}
      </nav>
      {Inhalt && (
        <div className="pw-seitenleiste__inhalt">
          <Fehlergrenze bereich="Seitenleiste" schluessel={bereich}>
            <Inhalt />
          </Fehlergrenze>
        </div>
      )}
    </aside>
  );
}
