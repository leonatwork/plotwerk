/** Persistenzschicht des Projektordners. Besitzer: Fundament. Format: docs/architektur.md. */
export type { ProjektDateisystem, ProjektLeser } from './fs';
export * from './lesen';
export * from './schreiben';
export * from './memoryFs';
export * from './extern';
export * from './binaer';
export * from './konflikte';
export { archiviereKapitel, stelleKapitelWiederHer } from './archiv';
