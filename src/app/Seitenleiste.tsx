import { useState } from 'react';
import { f, useTexte } from '../i18n';
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
  const t = useTexte();
  const Inhalt = modul?.Seitenleiste;
  const eintrag = ({ id, Icon, taste }: BereichDefinition) => {
    const titel = t.app.bereiche[id];
    return (
      <button
        key={id}
        type="button"
        className={klassen('pw-nav__eintrag', id === bereich && 'pw-nav__eintrag--aktiv')}
        aria-current={id === bereich ? 'page' : undefined}
        title={taste ? f(t.app.seitenleiste.mitTaste, { titel, taste }) : titel}
        onClick={() => setzeBereich(id)}
      >
        <Icon />
        {titel}
        {id === 'hinweise' && neueHinweise > 0 && <Zaehler wert={neueHinweise} label={t.app.seitenleiste.neueHinweise} style={{ marginLeft: 'auto' }} />}
      </button>
    );
  };
  const werkzeuge = BEREICHE.filter((b) => b.gruppe === 'werkzeuge');
  // eingeklappt: nur das gerade aktive Werkzeug bleibt sichtbar
  const sichtbar = werkzeugeOffen ? werkzeuge : werkzeuge.filter((b) => b.id === bereich);
  const umschalten = () => {
    merkeOffen(!werkzeugeOffen);
    setWerkzeugeOffen(!werkzeugeOffen);
  };
  return (
    <aside className="pw-seitenleiste" aria-label={t.app.seitenleiste.label}>
      <nav aria-label={t.app.seitenleiste.bereiche} className="pw-nav">
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
              {t.app.seitenleiste.werkzeuge}
            </button>
            <div id="pw-nav-werkzeuge" className="pw-nav__werkzeuge">
              {sichtbar.map(eintrag)}
            </div>
          </>
        )}
      </nav>
      {Inhalt && (
        <div className="pw-seitenleiste__inhalt">
          <Fehlergrenze bereich={t.app.fehlergrenze.seitenleiste} schluessel={bereich}>
            <Inhalt />
          </Fehlergrenze>
        </div>
      )}
    </aside>
  );
}
