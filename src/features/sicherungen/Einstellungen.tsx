import { useEffect, useState } from 'react';
import type { SicherungsEinstellung } from '../../backend/types';
import { useStore } from '../../state/store';
import { useTexte } from '../../i18n';
import { Abschnittslabel, Button } from '../../ui';

export function SicherungsEinstellungen() {
  const backend = useStore((s) => s.backend);
  const api = backend?.art === 'tauri' ? backend.sicherungen : undefined;
  const [wert, setWert] = useState<SicherungsEinstellung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const t = useTexte();
  useEffect(() => {
    let aktiv = true;
    if (api) void api.einstellungen().then((w) => { if (aktiv) setWert(w); }).catch((e) => { if (aktiv) setFehler(String(e)); });
    return () => { aktiv = false; };
  }, [api]);
  if (!api) return null;
  async function aendern(neu: SicherungsEinstellung) {
    setLaeuft(true); setFehler(null);
    try { await api!.einstellen(neu); setWert(neu); }
    catch (e) { setFehler(String(e)); }
    finally { setLaeuft(false); }
  }
  return <section className="pw-ki-abschnitt" aria-labelledby="sicherungen-titel">
    <Abschnittslabel as="h3" id="sicherungen-titel">{t.sicherungen.titel}</Abschnittslabel>
    {wert && <>
      <p><label><input type="checkbox" checked={wert.aktiv} disabled={laeuft} onChange={(e) => void aendern({ ...wert, aktiv: e.target.checked })} /> {t.sicherungen.aktiv}</label></p>
      <p><label><input type="checkbox" checked={wert.mitVersionen} disabled={laeuft} onChange={(e) => void aendern({ ...wert, mitVersionen: e.target.checked })} /> {t.sicherungen.versionen}</label></p>
      <p className="pw-ki-klein">{wert.ordner ?? t.sicherungen.standard}</p>
      <Button disabled={laeuft} onClick={async () => {
        setLaeuft(true); setFehler(null);
        try { const ordner = await api.ordnerWaehlen(); if (ordner) setWert({ ...wert, ordner }); }
        catch (e) { setFehler(String(e)); } finally { setLaeuft(false); }
      }}>{t.sicherungen.ordner}</Button>
      {wert.ordner && <Button disabled={laeuft} onClick={() => void aendern({ ...wert, ordner: null })}>{t.sicherungen.zuruecksetzen}</Button>}
    </>}
    <p className="pw-ki-klein">{t.sicherungen.erklaerung}</p>
    {fehler && <p role="alert" className="pw-ki-hinweis">{fehler}</p>}
  </section>;
}
