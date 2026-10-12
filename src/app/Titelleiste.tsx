import { istTauri } from '../backend';
import { useStore } from '../state/store';
import type { BereichModul } from './bereiche';

/** Titelleiste 52 px: Ampel (im Browser gezeichnet, in Tauri nativ), Projektname, Kontext, Aktionen. */
export function Titelleiste({ modul }: { modul: BereichModul | null }) {
  const titel = useStore((s) => s.daten?.projekt.titel || 'Plotwerk');
  const kontext = useStore((s) => (s.daten && modul?.kontext ? modul.kontext(s) : ''));
  const Aktionen = modul?.Titelaktionen;
  const tauri = istTauri();
  return (
    <header className="pw-titelleiste" data-tauri-drag-region>
      {tauri ? (
        <span className="pw-titelleiste__ampel-platz" data-tauri-drag-region />
      ) : (
        <span className="pw-titelleiste__ampel" aria-hidden="true">
          <span style={{ background: 'var(--ampel-rot)' }} />
          <span style={{ background: 'var(--ampel-gelb)' }} />
          <span style={{ background: 'var(--ampel-gruen)' }} />
        </span>
      )}
      <span className="pw-titelleiste__abstand" style={{ width: tauri ? 122 : 150 }} data-tauri-drag-region />
      <span className="pw-titelleiste__projekt" data-tauri-drag-region>
        {titel}
      </span>
      {kontext && (
        <span className="pw-titelleiste__kontext" data-tauri-drag-region>
          {kontext}
        </span>
      )}
      <span className="pw-titelleiste__fueller" data-tauri-drag-region />
      {Aktionen && (
        <div className="pw-titelleiste__aktionen">
          <Aktionen />
        </div>
      )}
    </header>
  );
}
