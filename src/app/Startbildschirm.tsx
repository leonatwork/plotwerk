import { useState } from 'react';
import { demoGeaendert, demoZuruecksetzen } from '../backend/demoSpeicher';
import { useTexte } from '../i18n';
import { useStore } from '../state/store';
import { Button, IconDokument, IconOrdner, IconPlus, Textfeld } from '../ui';

/** Ohne geöffnetes Projekt: Projektordner öffnen, neues Projekt, importieren. */
export function Startbildschirm() {
  const backend = useStore((s) => s.backend);
  const fehler = useStore((s) => s.fehler);
  const projektOeffnen = useStore((s) => s.projektOeffnen);
  const neuesProjekt = useStore((s) => s.neuesProjekt);
  const oeffneDialog = useStore((s) => s.oeffneDialog);
  const [neu, setNeu] = useState(false);
  const [titel, setTitel] = useState('');
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const t = useTexte();

  const ausfuehren = async (aktion: () => Promise<void>) => {
    setBeschaeftigt(true);
    setMeldung(null);
    try {
      await aktion();
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e));
    } finally {
      setBeschaeftigt(false);
    }
  };

  return (
    <div className="pw-start">
      <div className="pw-start__karte">
        <h1 className="pw-start__titel">Plotwerk</h1>
        <p className="pw-start__text">{t.app.start.text}</p>
        <div className="pw-start__aktionen">
          <Button variante="primaer" icon={<IconOrdner size={14} />} disabled={!backend || beschaeftigt} onClick={() => ausfuehren(projektOeffnen)}>
            {t.app.start.oeffnen}
          </Button>
          {neu ? (
            <form
              className="pw-start__neu"
              onSubmit={(e) => {
                e.preventDefault();
                if (titel.trim()) void ausfuehren(() => neuesProjekt(titel.trim()));
              }}
            >
              <Textfeld
                autoFocus
                aria-label={t.app.start.titelLabel}
                placeholder={t.app.start.titelPlatzhalter}
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
              />
              <Button type="submit" disabled={!titel.trim() || beschaeftigt}>
                {t.app.start.anlegen}
              </Button>
            </form>
          ) : (
            <Button icon={<IconPlus size={14} />} disabled={!backend || beschaeftigt} onClick={() => setNeu(true)}>
              {t.app.start.neu}
            </Button>
          )}
          <Button icon={<IconDokument size={14} />} disabled={!backend || beschaeftigt} onClick={() => oeffneDialog('import')}>
            {t.app.start.importieren}
          </Button>
        </div>
        {(meldung || fehler) && (
          <p role="alert" className="pw-start__fehler">
            {meldung ?? fehler}
          </p>
        )}
        {backend?.art === 'demo' && demoGeaendert() && (
          <Button variante="text" klein onClick={demoZuruecksetzen}>
            {t.app.start.demoZuruecksetzen}
          </Button>
        )}
      </div>
    </div>
  );
}
