/** Selbst erstelltes Scrivener-3-Mini-Paket mit ausschließlich Demo-Roman-Titeln. */
export const SCRIVX = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="1.0"><Binder>
  <BinderItem UUID="draft" Type="DraftFolder"><Title>Manuskript</Title><Children>
    <BinderItem UUID="loose" Type="Text"><Title>Grundriss</Title></BinderItem>
    <BinderItem UUID="act-a" Type="Folder"><Title>Hafen &amp; Licht</Title><Children>
      <BinderItem UUID="first" Type="Text"><Title>Lotte</Title><Children>
        <BinderItem UUID="child" Type="Text"><Title>Ebbe</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="nested" Type="Folder"><Title>Unterordner</Title><Children>
        <BinderItem UUID="second" Type="Text"><Title>Flut</Title></BinderItem>
        <BinderItem UUID="image" Type="Image"><Title>Bild</Title></BinderItem>
      </Children></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="act-b" Type="Folder"><Title>Hafen &amp; Licht</Title><Children>
      <BinderItem UUID="empty" Type="Text"><Title>Regatta</Title></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="act-empty" Type="Folder"><Title>Funkstille</Title></BinderItem>
  </Children></BinderItem>
  <BinderItem UUID="research" Type="ResearchFolder"><Children>
    <BinderItem UUID="research-text" Type="Text"><Title>Recherche</Title></BinderItem>
  </Children></BinderItem>
  <BinderItem UUID="trash" Type="TrashFolder"><Children>
    <BinderItem UUID="trash-text" Type="Text"><Title>Papierkorb</Title></BinderItem>
  </Children></BinderItem>
</Binder></ScrivenerProject>`;

export function scrivenerMini(windows = false): Record<string, string | Uint8Array> {
  const dateien: Record<string, string | Uint8Array> = {
    'Hafenlichter.scrivx': SCRIVX,
    'Files/Data/loose/content.rtf': String.raw`{\rtf1\ansi Grundriss.\par}`,
    'Files/Data/first/content.rtf': String.raw`{\rtf1\ansi Lotte {\b am Hafen}, {\i Ebbe}.\par Flut.\par}`,
    'Files/Data/first/synopsis.txt': 'Lotte am Hafen.\r\nEbbe.',
    'Files/Data/first/notes.rtf': String.raw`{\rtf1\ansi {\b Hafenlichter}.\par Notiz.\par}`,
    'Files/Data/child/content.rtf': String.raw`{\rtf1\ansi Ebbe.}`,
    'Files/Data/second/content.rtf': String.raw`{\rtf1\ansi Flut.}`,
    'Files/Data/empty/content.rtf': String.raw`{\rtf1\ansi}`,
    'Files/Data/research-text/content.rtf': String.raw`{\rtf1 Recherche.}`,
    'Files/Data/trash-text/content.rtf': String.raw`{\rtf1 Papierkorb.}`,
    'Files/Data/act-a/content.rtf': String.raw`{\rtf1 Ordnertext.}`,
  };
  return Object.fromEntries(Object.entries(dateien).map(([p, t]) => [windows ? p.replaceAll('/', '\\') : p, t]));
}
