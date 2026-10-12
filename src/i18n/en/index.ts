/** Englisches Wörterbuch – muss jeden Schlüssel des deutschen haben (TypeScript prüft das). */
import type { Woerterbuch } from '../typen';
import { gemeinsam } from './gemeinsam';
import { sprache } from './sprache';
import { app } from './app';
import { ui } from './ui';
import { versionen } from './versionen';
import { importexport } from './importexport';
import { ki } from './ki';
import { state } from './state';
import { backend } from './backend';
import { schreiben } from './schreiben';
import { figuren } from './figuren';
import { gruppen } from './gruppen';
import { beziehungen } from './beziehungen';
import { hinweise } from './hinweise';
import { kapitel } from './kapitel';
import { akte } from './akte';
import { faeden } from './faeden';
import { orte } from './orte';
import { zeitleiste } from './zeitleiste';
import { statistik } from './statistik';
import { fragen } from './fragen';
import { recherche } from './recherche';
import { vorschau } from './vorschau';
import { abgabe } from './abgabe';
import { funktionen } from './funktionen';

export const en: Woerterbuch = {
  gemeinsam,
  sprache,
  app,
  ui,
  versionen,
  importexport,
  ki,
  state,
  backend,
  schreiben,
  figuren,
  gruppen,
  beziehungen,
  hinweise,
  kapitel,
  akte,
  faeden,
  orte,
  zeitleiste,
  statistik,
  fragen,
  recherche,
  vorschau,
  abgabe,
  funktionen,
};
