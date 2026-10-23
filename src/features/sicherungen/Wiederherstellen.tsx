import { useEffect, useState } from 'react';
import type { SicherungsArchiv } from '../../backend/types';
import { useStore } from '../../state/store';
import { useTexte } from '../../i18n';
import { Button, Dialog } from '../../ui';

export function Wiederherstellen({ schliessen }: { schliessen(): void }) {
  const backend = useStore((s) => s.backend);
  const [liste, setListe] = useState<SicherungsArchiv[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const t = useTexte();
  useEffect(() => {
    let aktiv = true;
    void backend?.sicherungen?.auflisten(null).then((l) => { if (aktiv) setListe(l); }).catch((e) => { if (aktiv) setFehler(String(e)); });
    return () => { aktiv = false; };
  }, [backend]);
  async function herstellen(archiv: SicherungsArchiv | null) {
    setLaeuft(true); setFehler(null);
    try {
      const fs = await backend?.sicherungen?.wiederherstellen(archiv);
      if (fs) { await useStore.getState().projektLaden(fs); schliessen(); }
    } catch (e) { setFehler(String(e)); }
    finally { setLaeuft(false); }
  }
  return <Dialog titel={t.sicherungen.wiederherstellen} onSchliessen={() => { if (!laeuft) schliessen(); }} modalFest={laeuft}>
    <p>{t.sicherungen.ziel}</p>
    {liste === null ? <p role="status">{t.sicherungen.laden}</p> : liste.length === 0 ? <p>{t.sicherungen.leer}</p> :
      <ul>{liste.map((a) => <li key={a.pfad}><Button disabled={laeuft} onClick={() => void herstellen(a)}>{a.name}</Button></li>)}</ul>}
    <Button disabled={laeuft} onClick={() => void herstellen(null)}>{t.sicherungen.zipWaehlen}</Button>
    {fehler && <p role="alert">{fehler}</p>}
  </Dialog>;
}
