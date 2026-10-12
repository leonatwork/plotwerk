import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { wendeAenderungAn } from '../abgabe/lektorat';
import type { Kapitel, LektoratsAenderung } from '../model/types';
import { ankerFinden, klartext } from '../text';
import { exportiereDocxMit } from './exportieren';
import { kapitelZuordnen, leseRueckimport, rueckimportUebernahme } from './rueckimport';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';

/** Minimale .docx wie von Word nach dem Lektorat (document.xml, styles.xml, comments.xml). */
async function docx(body: string, kommentare?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    kommentare ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : '',
  ].join('');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W} ${W14}><w:body>${body}</w:body></w:document>`);
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:basedOn w:val="Standard"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/></w:style></w:styles>`,
  );
  if (kommentare) zip.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8"?><w:comments ${W} ${W14}>${kommentare}</w:comments>`);
  return zip.generateAsync({ type: 'uint8array' });
}

const p = (inhalt: string, stil?: string, pPrZusatz = '') => `<w:p>${stil || pPrZusatz ? `<w:pPr>${stil ? `<w:pStyle w:val="${stil}"/>` : ''}${pPrZusatz}</w:pPr>` : ''}${inhalt}</w:p>`;
const r = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const LEKTORIN = 'w:author="Mia Lektorin" w:date="2026-10-08T09:00:00Z"';
const ins = (text: string, id = 1) => `<w:ins w:id="${id}" ${LEKTORIN}>${r(text)}</w:ins>`;
const del = (text: string, id = 2) => `<w:del w:id="${id}" ${LEKTORIN}><w:r><w:delText xml:space="preserve">${text}</w:delText></w:r></w:del>`;
const markeGeloescht = `<w:rPr><w:del w:id="90" ${LEKTORIN}/></w:rPr>`;
const kommentar = (id: number, text: string) =>
  `<w:comment w:id="${id}" ${LEKTORIN} w:initials="ML"><w:p w14:paraId="0000000${id}"><w:r><w:annotationRef/></w:r>${r(text)}</w:p></w:comment>`;
const kStart = (id: number) => `<w:commentRangeStart w:id="${id}"/>`;
const kEnde = (id: number) => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`;

/** Leons aktueller Stand im Projekt */
const PROJEKT: Kapitel[] = [
  {
    id: 'lotte',
    titel: 'Lotte',
    text: 'In Pauls Wohnung läuft ein zweites Mal dieselbe Platte. Er steht im *Bad*.\n\nAuf dem Handy leuchtet Lottes Nachricht.\n\nEr nimmt den Schlüssel.',
  },
  { id: 'leer', titel: 'Geplant', text: '' },
  { id: 'ebbe', titel: 'Ebbe', text: 'Gegen elf sagt er, er müsse morgen früh raus. Paul sieht nicht auf und nickt.' },
];

/** Zurückgeschickte Fassung der Lektorin (Kapitel „Ebbe“ von ihr umbenannt) */
async function lektorierteDatei(): Promise<Uint8Array> {
  const body = [
    p(r('Hafenlichter'), 'Titel'),
    p(r('Lotte'), 'berschrift1'),
    p(r('In Pauls Wohnung läuft ') + del('ein zweites Mal', 10) + ins('noch einmal', 11) + r(' dieselbe ') + kStart(1) + r('Platte') + kEnde(1) + r('. Er steht im ') + r('Bad', '<w:i/>') + r('.')),
    // Absatzmarke gelöscht + Leerzeichen eingefügt = Absätze zusammengeführt
    p(r('Auf dem Handy leuchtet Lottes Nachricht.') + ins(' ', 12), undefined, markeGeloescht),
    p(r('Er nimmt den ') + ins('kleinen ', 13) + r('Schlüssel.')),
    p(del('Ebbe', 20) + ins('Ebbe am Kai', 21), 'berschrift1'),
    p(r('Gegen elf') + ins(' Uhr', 22) + r(' sagt er, er müsse morgen früh raus. ') + del('Paul sieht nicht auf und nickt.', 23)),
  ].join('');
  return docx(body, kommentar(1, 'Welche Platte?'));
}

describe('Rückimport aus Word', () => {
  it('liest Kapitel, nachverfolgte Änderungen und Kommentare', async () => {
    const r = await leseRueckimport(await lektorierteDatei());
    expect(r.kapitel.map((k) => [k.titel, k.titelNeu])).toEqual([
      ['Lotte', 'Lotte'],
      ['Ebbe', 'Ebbe am Kai'],
    ]);
    expect(r.autoren).toEqual(['Mia Lektorin']);
    expect(r.kommentare).toHaveLength(1);
    expect(r.kapitel[0]!.kommentare).toBe(1);
    // ursprünglicher Text der Datei = Leons Fassung (ohne Einfügungen, mit Gelöschtem)
    expect(r.kapitel[1]!.text).toBe('Gegen elf sagt er, er müsse morgen früh raus. Paul sieht nicht auf und nickt.');

    const a = r.kapitel[0]!.aenderungen;
    expect(a.map((x) => [x.art, x.alt, x.neu])).toEqual([
      ['ersetzen', 'ein zweites Mal', 'noch einmal'],
      // Absatzmarke gelöscht + Leerzeichen: mit dem Wort davor verankert
      ['ersetzen', 'Nachricht.\n\n', 'Nachricht. '],
      // Einfügung direkt hinter dem Wort davor
      ['einfuegen', '', ' kleinen'],
    ]);
    expect(a[0]).toMatchObject({ autor: 'Mia Lektorin', datum: '2026-10-08T09:00:00Z' });
    expect(a[2]!.anker.exakt).toBe('den');
    expect(r.kapitel[1]!.aenderungen.map((x) => [x.art, x.alt, x.neu, x.anker.exakt])).toEqual([
      ['einfuegen', '', ' Uhr', 'elf'],
      ['loeschen', 'Paul sieht nicht auf und nickt.', '', 'Paul sieht nicht auf und nickt.'],
    ]);
  });

  it('ordnet Kapitel über den Titel (auch den geänderten) und sonst über die Reihenfolge zu', async () => {
    const r = await leseRueckimport(await lektorierteDatei());
    expect(kapitelZuordnen(r, PROJEKT)).toEqual([
      { kapitel: 'lotte', art: 'titel' },
      { kapitel: 'ebbe', art: 'titel' },
    ]);
    const umbenannt = PROJEKT.map((k) => (k.id === 'ebbe' ? { ...k, titel: 'Kai' } : k));
    expect(kapitelZuordnen(r, umbenannt)[1]).toEqual({ kapitel: 'ebbe', art: 'reihenfolge' });
  });

  it('macht Kommentare zu Anmerkungen und Änderungen zu offenen Vorschlägen – ohne Doppel beim zweiten Mal', async () => {
    const r = await leseRueckimport(await lektorierteDatei());
    let n = 0;
    const ctx = {
      kapitel: Object.fromEntries(PROJEKT.map((k) => [k.id, k])),
      vorhandeneAnmerkungen: [],
      vorhandeneAenderungen: [] as LektoratsAenderung[],
      neueId: (t: string) => `${t.split(' ')[0]}-${++n}`,
      jetzt: '2026-10-10T10:00:00Z',
      quelle: 'Hafenlichter_lektoriert.docx',
    };
    const u = rueckimportUebernahme(r, ['lotte', 'ebbe'], ctx);
    expect(u.nichtGefunden).toBe(0);
    expect(u.anmerkungen).toHaveLength(1);
    expect(u.anmerkungen[0]).toMatchObject({ quelle: 'word', autor: 'Mia Lektorin', notiz: 'Welche Platte?', anker: { kapitel: 'lotte', exakt: 'Platte' } });
    expect(u.aenderungen).toHaveLength(5);
    expect(u.aenderungen.every((a) => a.status === 'offen' && a.quelle === 'Hafenlichter_lektoriert.docx')).toBe(true);
    expect(new Set(u.aenderungen.map((a) => a.id)).size).toBe(5);
    // Anker zeigen in Leons aktuellen Text
    for (const a of u.aenderungen) expect(ankerFinden(klartext(ctx.kapitel[a.anker.kapitel]!.text), a.anker), a.alt + a.neu).not.toBeNull();

    const nochmal = rueckimportUebernahme(r, ['lotte', 'ebbe'], { ...ctx, vorhandeneAnmerkungen: u.anmerkungen as never[], vorhandeneAenderungen: u.aenderungen });
    expect(nochmal.aenderungen).toHaveLength(0);
    expect(nochmal.anmerkungen).toHaveLength(0);
    expect(nochmal.doppelt).toBe(6);
  });

  it('übernimmt jede Änderung einzeln in Leons Markdown (Annehmen)', async () => {
    const r = await leseRueckimport(await lektorierteDatei());
    let n = 0;
    const u = rueckimportUebernahme(r, ['lotte', 'ebbe'], {
      kapitel: Object.fromEntries(PROJEKT.map((k) => [k.id, k])),
      vorhandeneAnmerkungen: [],
      vorhandeneAenderungen: [],
      neueId: () => `l-${++n}`,
      jetzt: '2026-10-10T10:00:00Z',
      quelle: 'x.docx',
    });
    const texte: Record<string, string> = Object.fromEntries(PROJEKT.map((k) => [k.id, k.text]));
    for (const a of u.aenderungen) {
      const e = wendeAenderungAn(texte[a.anker.kapitel]!, a);
      expect(e.ok, `${a.art} ${a.alt}→${a.neu}`).toBe(true);
      if (e.ok) texte[a.anker.kapitel] = e.text;
    }
    expect(texte.lotte).toBe('In Pauls Wohnung läuft noch einmal dieselbe Platte. Er steht im *Bad*.\n\nAuf dem Handy leuchtet Lottes Nachricht. Er nimmt den kleinen Schlüssel.');
    expect(texte.ebbe).toBe('Gegen elf Uhr sagt er, er müsse morgen früh raus.');
  });

  it('liest eine von Plotwerk exportierte und in Word bearbeitete Datei (Titelseite, Szenentrenner)', async () => {
    const roh = await exportiereDocxMit(PROJEKT.filter((k) => k.text), 'Hafenlichter');
    // Word-Bearbeitung simulieren: im exportierten document.xml ein Wort ersetzen
    const zip = await JSZip.loadAsync(roh);
    const xml = await zip.file('word/document.xml')!.async('string');
    const geaendert = xml.replace(
      /<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:t xml:space="preserve">Er nimmt den Schlüssel.<\/w:t><\/w:r>/,
      (_m, rPr = '') =>
        `<w:r>${rPr}<w:t xml:space="preserve">Er nimmt den </w:t></w:r><w:del w:id="5" ${LEKTORIN}><w:r>${rPr}<w:delText>Schlüssel</w:delText></w:r></w:del><w:ins w:id="6" ${LEKTORIN}><w:r>${rPr}<w:t>Autoschlüssel</w:t></w:r></w:ins><w:r>${rPr}<w:t>.</w:t></w:r>`,
    );
    expect(geaendert).not.toBe(xml);
    zip.file('word/document.xml', geaendert);
    const r = await leseRueckimport(await zip.generateAsync({ type: 'uint8array' }));
    expect(r.kapitel.map((k) => k.titel)).toEqual(['Lotte', 'Ebbe']);
    expect(r.kapitel[0]!.aenderungen.map((a) => [a.art, a.alt, a.neu])).toEqual([['ersetzen', 'Schlüssel', 'Autoschlüssel']]);
    const u = rueckimportUebernahme(r, kapitelZuordnen(r, PROJEKT).map((z) => z.kapitel), {
      kapitel: Object.fromEntries(PROJEKT.map((k) => [k.id, k])),
      vorhandeneAnmerkungen: [],
      vorhandeneAenderungen: [],
      neueId: () => 'l-1',
      jetzt: '2026-10-10T10:00:00Z',
      quelle: 'x.docx',
    });
    const e = wendeAenderungAn(PROJEKT[0]!.text, u.aenderungen[0]!);
    expect(e).toEqual({ ok: true, text: PROJEKT[0]!.text.replace('den Schlüssel', 'den Autoschlüssel') });
  });

  it('meldet eine ungültige Datei', async () => {
    await expect(leseRueckimport(new Uint8Array([1, 2, 3]))).rejects.toThrow('keine gültige Word-Datei');
  });
});
