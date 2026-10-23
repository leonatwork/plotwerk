import { describe, expect, it } from 'vitest';
import { parseKapitel, serializeKapitel } from './index';

describe('E7: importierten Kapiteltext exakt persistieren', () => {
  it.each(['\r\n  "Text" -- **fett**\r\n\r\n# Später\r\n ', '\n\nText.\n', 'Text.', '', ' \r\n', '\uFEFFText.'])('Roundtrip ohne Rand- oder Zeilenendenbereinigung: %j', (text) => {
    const k = { id: 'ebbe', titel: 'Ebbe', text };
    const gespeichert = serializeKapitel(k);
    expect(parseKapitel(gespeichert)).toEqual(k);
    const erneut = serializeKapitel(parseKapitel(gespeichert), gespeichert);
    expect(parseKapitel(erneut)).toEqual(k);
  });

  it('liest bisherige Dateien weiterhin wie zuvor, bewahrt fremde Metadaten beim Speichern', () => {
    const alt = '---\r\nid: ebbe\r\ntitel: Ebbe\r\nobsidian: ja\r\n---\r\n\r\nText.\r\n';
    const k = parseKapitel(alt);
    expect(k.text).toBe('Text.');
    const neu = serializeKapitel({ ...k, text: '\r\nText.\r\n' }, alt);
    expect(neu).toContain('obsidian: ja');
    expect(parseKapitel(neu).text).toBe('\r\nText.\r\n');
  });
});
