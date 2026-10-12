/** Word-Kommentare aus dem Import → Anmerkungen (S-06) bzw. Plan- und Projekt-Notizen. */
import type { Anmerkung, Id } from '../model/types';
import type { ImportKommentar } from './importieren';

export interface KommentarUebernahme {
  anmerkungen: Anmerkung[];
  /** Kapitel-ID → Text für die Plan-Notiz (Kommentare an Kapiteln ohne Text) */
  planNotizen: Record<Id, string>;
  /** Kommentare ohne Kapitel (Buchtitel, nicht übernommener Vorspann) für die Projekt-Notiz */
  projektNotiz: string;
}

function datumKurz(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Kommentartext mit Antworten (Autor nur, wenn er vom Kommentar abweicht). */
export function kommentarNotiz(k: ImportKommentar): string {
  const teile = [k.text.trim() || '(ohne Text)'];
  for (const a of k.antworten) {
    const von = a.autor && a.autor !== k.autor ? ` von ${a.autor}` : '';
    const wann = datumKurz(a.datum);
    teile.push(`Antwort${von}${wann ? ` (${wann})` : ''}: ${a.text.trim()}`);
  }
  if (k.erledigt) teile.push('(In Word als erledigt markiert.)');
  return teile.join('\n\n');
}

function notizZeile(k: ImportKommentar): string {
  const von = k.autor ? ` von ${k.autor}` : '';
  const wann = datumKurz(k.datum);
  return `Word-Kommentar${von}${wann ? ` (${wann})` : ''}: ${kommentarNotiz(k)}`;
}

/**
 * @param kapitelIds ID je Eintrag in ImportErgebnis.kapitel (null = nicht übernommen)
 * @param vorspannId ID des Vorspann-Kapitels, falls der Vorspann übernommen wird
 */
export function kommentareAlsAnmerkungen(
  kommentare: ImportKommentar[],
  kapitelIds: (Id | null)[],
  vorspannId: Id | null,
  vorhandeneIds: string[],
  neueId: (titel: string, vorhandene: string[]) => string,
  jetzt: string,
): KommentarUebernahme {
  const vergeben = [...vorhandeneIds];
  const anmerkungen: Anmerkung[] = [];
  const planNotizen: Record<Id, string> = {};
  const projekt: string[] = [];
  for (const k of kommentare) {
    const kapitelId = k.kapitel === -1 ? vorspannId : (kapitelIds[k.kapitel] ?? null);
    if (!kapitelId) {
      projekt.push(notizZeile(k));
      continue;
    }
    if (!k.anker) {
      planNotizen[kapitelId] = [planNotizen[kapitelId], notizZeile(k)].filter(Boolean).join('\n\n');
      continue;
    }
    const titel = `word ${k.text.trim().split(/\s+/).slice(0, 4).join(' ')}`.trim();
    const id = neueId(titel, vergeben);
    vergeben.push(id);
    anmerkungen.push({
      id,
      anker: { ...k.anker, kapitel: kapitelId },
      notiz: kommentarNotiz(k),
      ziel: k.ueberschrift ? { typ: 'kapitel', id: kapitelId } : null,
      erstellt: k.datum || jetzt,
      quelle: 'word',
      ...(k.autor ? { autor: k.autor } : {}),
    });
  }
  return { anmerkungen, planNotizen, projektNotiz: projekt.join('\n\n') };
}
