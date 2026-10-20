import { useEffect, useState } from 'react';
import type { SicherungsEinstellungen, SicherungsEintrag } from '../../backend/types';
import { f, useTexte } from '../../i18n';
import { useStore } from '../../state/store';
import { Abschnittslabel, Button, Dialog } from '../../ui';

export function SicherungenEinstellungen() {
  const backend = useStore((s) => s.backend);
  const archiv = backend?.art === 'tauri' ? backend.archiv : undefined;
  const [wert, setWert] = useState<SicherungsEinstellungen | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useTexte();
  useEffect(() => { if (archiv) void archiv.einstellungen().then(setWert).catch((e) => setFehler(String(e))); }, [archiv]);
  if (!archiv) return null;
  async function speichern(neu: SicherungsEinstellungen) {
    setBusy(true);
    try { await archiv!.einstellen(neu); setWert(neu); setFehler(null); }
    catch (e) { setFehler(String(e)); }
    finally { setBusy(false); }
  }
  return <section className="pw-ki-abschnitt" aria-labelledby="einstellungen-sicherungen">
    <Abschnittslabel as="h3" id="einstellungen-sicherungen">{t.sicherungen.titel}</Abschnittslabel>
    <p className="pw-ki-klein">{t.sicherungen.erklaerung}</p>
    {wert && <>
      <p><label><input type="checkbox" checked={wert.aktiv} disabled={busy} onChange={(e) => void speichern({ ...wert, aktiv: e.target.checked })} /> {t.sicherungen.aktiv}</label></p>
      <p><label><input type="checkbox" checked={wert.mitVersionen} disabled={busy} onChange={(e) => void speichern({ ...wert, mitVersionen: e.target.checked })} /> {t.sicherungen.versionen}</label></p>
      <p className="pw-ki-klein">{wert.ort ?? t.sicherungen.standard}</p>
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        try { const ort = await archiv.ortWaehlen(); if (ort) setWert({ ...wert, ort }); }
        catch (e) { setFehler(String(e)); } finally { setBusy(false); }
      }}>{t.sicherungen.ort}</Button>
      {wert.ort && <Button variante="text" disabled={busy} onClick={() => void speichern({ ...wert, ort: null })}>{t.sicherungen.zurueck}</Button>}
    </>}
    {fehler && <p role="alert">{f(t.sicherungen.fehler, { grund: fehler })}</p>}
  </section>;
}

export function WiederherstellenDialog({ onSchliessen }: { onSchliessen(): void }) {
  const archiv = useStore((s) => s.backend?.archiv);
  const [liste, setListe] = useState<SicherungsEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useTexte();
  useEffect(() => { if (archiv) void archiv.auflisten().then(setListe).catch((e) => setFehler(String(e))); }, [archiv]);
  async function herstellen(eintrag?: SicherungsEintrag) {
    if (!archiv) return;
    setBusy(true); setFehler(null);
    try {
      const fs = await archiv.wiederherstellen(eintrag);
      if (fs) { await useStore.getState().projektLaden(fs); onSchliessen(); }
    } catch (e) { setFehler(f(t.sicherungen.restoreFehler, { grund: e instanceof Error ? e.message : String(e) })); }
    finally { setBusy(false); }
  }
  return <Dialog titel={t.sicherungen.wiederherstellen} onSchliessen={() => { if (!busy) onSchliessen(); }} modalFest={busy}>
    <p>{t.sicherungen.ziel}</p>
    {liste?.length === 0 && <p>{t.sicherungen.leer}</p>}
    {liste?.map((e) => <p key={`${e.ordner}/${e.name}`}><Button disabled={busy} onClick={() => void herstellen(e)}>{e.name}</Button></p>)}
    <Button disabled={busy || !archiv} onClick={() => void herstellen()}>{t.sicherungen.zip}</Button>
    {fehler && <p role="alert">{fehler}</p>}
  </Dialog>;
}
