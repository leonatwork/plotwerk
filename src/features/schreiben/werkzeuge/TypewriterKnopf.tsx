/** Titelaktion „Typewriter“ im Schreibbereich (⌘⇧T). Kombinierbar mit dem Fokus-Modus. */
import { useStore } from '../../../state/store';
import { Button } from '../../../ui';

export function TypewriterKnopf() {
  const an = useStore((s) => s.editorwerkzeuge.typewriter);
  const umschalten = useStore((s) => s.editorwerkzeuge.umschalteTypewriter);
  return (
    <Button onClick={umschalten} aria-pressed={an} title="Typewriter-Modus: aktuelle Zeile mittig, andere Absätze abgedunkelt (⌘⇧T)">
      {an ? 'Typewriter aus' : 'Typewriter'}
    </Button>
  );
}
