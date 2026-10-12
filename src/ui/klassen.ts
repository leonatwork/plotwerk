/** Klassennamen zusammensetzen: klassen('a', bedingung && 'b') */
export function klassen(...teile: (string | false | null | undefined)[]): string {
  return teile.filter(Boolean).join(' ');
}
