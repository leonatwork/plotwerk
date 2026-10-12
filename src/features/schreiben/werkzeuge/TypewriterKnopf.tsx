/** Titelaktion „Typewriter“ im Schreibbereich (⌘⇧T). Kombinierbar mit dem Fokus-Modus. */
import { useTexte } from '../../../i18n';
import { useStore } from '../../../state/store';
import { Button } from '../../../ui';

export function TypewriterKnopf() {
  const an = useStore((s) => s.editorwerkzeuge.typewriter);
  const umschalten = useStore((s) => s.editorwerkzeuge.umschalteTypewriter);
  const T = useTexte().schreiben.werkzeuge;
  return (
    <Button onClick={umschalten} aria-pressed={an} title={T.typewriterTitel}>
      {an ? T.typewriterAus : T.typewriter}
    </Button>
  );
}
