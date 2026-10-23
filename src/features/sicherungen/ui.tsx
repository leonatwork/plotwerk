import { useEffect, useState } from 'react';
import { archivEntpacken } from '@core/sicherungen';
import type { SicherungsEinstellungen, SicherungsEintrag } from '../../backend/types';
import { f, sprache, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Dialog } from '../../ui';
import { useSicherungsStatus } from './sicherung';

export function SicherungsEinstellungenAbschnitt() {
  const backend = useStore(s => s.backend);
  const api = backend?.art === 'tauri' ? backend.sicherungen : undefined;
  const [wert, setWert] = useState<SicherungsEinstellungen | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const t = useTexte();
  useEffect(() => {
    let aktiv = true;
    if (api) void api.einstellungenLesen().then(w => { if (aktiv) setWert(w); }).catch(e => { if (aktiv) setFehler(String(e)); });
    return () => { aktiv = false; };
  }, [api]);
  if (!api) return null;
  const aendern = async (aktion: () => Promise<unknown>) => {
    setLaeuft(true); setFehler(null);
    try { await aktion(); setWert(await api.einstellungenLesen()); }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)); }
    finally { setLaeuft(false); }
  };
  const speichern = (neu: SicherungsEinstellungen) => aendern(async () => {
    await api.einstellungenSchreiben({ automatisch: neu.automatisch, mitVersionen: neu.mitVersionen });
    setWert(neu);
  });
  return <section className="pw-ki-abschnitt" aria-labelledby="einstellungen-sicherungen">
    <Abschnittslabel as="h3" id="einstellungen-sicherungen">{t.sicherungen.titel}</Abschnittslabel>
    {wert && <>
      <p><label><input type="checkbox" checked={wert.automatisch} disabled={laeuft} onChange={e => void speichern({ ...wert, automatisch: e.target.checked })} /> {t.sicherungen.automatisch}</label></p>
      <p><label><input type="checkbox" checked={wert.mitVersionen} disabled={laeuft} onChange={e => void speichern({ ...wert, mitVersionen: e.target.checked })} /> {t.sicherungen.versionen}</label></p>
      <p className="pw-ki-klein">{wert.ordner ?? t.sicherungen.standard}</p>
      <Button klein disabled={laeuft} onClick={() => void aendern(() => api.ordnerWaehlen())}>{t.sicherungen.ordner}</Button>
      <Button klein variante="text" disabled={laeuft} onClick={() => void aendern(() => api.standardOrdner())}>{t.sicherungen.zurueck}</Button>
    </>}
    <p className="pw-ki-klein">{t.sicherungen.erklaerung}</p>
    {fehler && <p role="alert">{fehler}</p>}
  </section>;
}
export function SicherungsHinweis() {
  const { fehler, fertig } = useSicherungsStatus();
  const t = useTexte();
  if (!fehler && !fertig) return null;
  return <div className="pw-sicherung-hinweis" role={fehler ? 'alert' : 'status'}>
    <span>{fehler ? f(t.sicherungen.fehler, { grund: fehler }) : t.sicherungen.fertig}</span>
    <Button klein variante="text" onClick={() => useSicherungsStatus.setState({ fehler: null, fertig: false })}>{t.gemeinsam.schliessen}</Button>
  </div>;
}
export function WiederherstellenDialog({ onSchliessen }: { onSchliessen(): void }) {
  const api = useStore(s => s.backend?.sicherungen);
  const laden = useStore(s => s.projektLaden);
  const [liste, setListe] = useState<SicherungsEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const t = useTexte();
  useEffect(() => {
    let aktiv = true;
    if (api) void api.alleAuflisten().then(l => { if (aktiv) setListe(l); }).catch(e => { if (aktiv) setFehler(String(e)); });
    return () => { aktiv = false; };
  }, [api]);
  const wiederherstellen = async (eintrag: SicherungsEintrag) => {
    if (!api) return;
    setLaeuft(true); setFehler(null);
    try {
      const dateien = await archivEntpacken(await api.lesen(eintrag), sprache());
      const fs = await api.wiederherstellen(dateien);
      if (fs) { await laden(fs); onSchliessen(); }
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)); }
    finally { setLaeuft(false); }
  };
  return <Dialog titel={t.sicherungen.wiederherstellen} modalFest={laeuft} onSchliessen={() => { if (!laeuft) onSchliessen(); }}>
    <p>{t.sicherungen.ziel}</p>
    {laeuft ? <p role="status">{t.sicherungen.entpackt}</p> : liste === null ? <p>{t.sicherungen.laedt}</p> : liste.length === 0 ? <p>{t.sicherungen.leer}</p> :
      <div className="pw-start__aktionen">{liste.map(e => <Button key={`${e.ordner}/${e.name}`} onClick={() => void wiederherstellen(e)}>{e.name}</Button>)}</div>}
    {fehler && <p role="alert">{fehler}</p>}
  </Dialog>;
}
