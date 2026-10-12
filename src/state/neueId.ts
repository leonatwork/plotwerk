/** Stabile ID aus einem Titel (E1): ä→ae, ö→oe, ü→ue, ß→ss, Kleinbuchstaben, Bindestriche, eindeutig mit -2, -3 … */
export function slug(titel: string): string {
  const s = titel
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unbenannt';
}

export function neueId(titel: string, vorhandene: Iterable<string>): string {
  const belegt = new Set(vorhandene);
  const basis = slug(titel);
  if (!belegt.has(basis)) return basis;
  for (let n = 2; ; n++) {
    const kandidat = `${basis}-${n}`;
    if (!belegt.has(kandidat)) return kandidat;
  }
}
