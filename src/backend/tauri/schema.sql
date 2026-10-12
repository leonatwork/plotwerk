-- SQLite-Index (Cache, E2). Version 1. Wird von src-tauri/src/index.rs als Migration eingebunden
-- und von den Tests in src/backend/tauri genutzt.
CREATE TABLE IF NOT EXISTS index_cache (
  projekt TEXT NOT NULL,
  schluessel TEXT NOT NULL,
  wert TEXT NOT NULL,
  PRIMARY KEY (projekt, schluessel)
);
CREATE TABLE IF NOT EXISTS erwaehnungen (
  projekt TEXT NOT NULL,
  kapitel TEXT NOT NULL,
  nr INTEGER NOT NULL,
  ziel_typ TEXT NOT NULL,
  ziel TEXT NOT NULL,
  absatz INTEGER NOT NULL,
  start INTEGER NOT NULL,
  ende INTEGER NOT NULL,
  treffer TEXT NOT NULL,
  art TEXT NOT NULL,
  quelle TEXT NOT NULL,
  bestaetigt INTEGER NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (projekt, kapitel, nr)
);
CREATE INDEX IF NOT EXISTS erwaehnungen_ziel ON erwaehnungen (projekt, ziel_typ, ziel);
CREATE TABLE IF NOT EXISTS hinweise (
  projekt TEXT NOT NULL,
  nr INTEGER NOT NULL,
  schluessel TEXT NOT NULL,
  typ TEXT NOT NULL,
  titel TEXT NOT NULL,
  zitate TEXT NOT NULL,
  erklaerung TEXT NOT NULL,
  quelle TEXT NOT NULL,
  offen INTEGER,
  status TEXT NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (projekt, nr)
);
CREATE INDEX IF NOT EXISTS hinweise_typ ON hinweise (projekt, typ, status);
CREATE TABLE IF NOT EXISTS faeden (
  projekt TEXT NOT NULL,
  nr INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  eroeffnet_in TEXT NOT NULL,
  aufgegriffen_in TEXT NOT NULL,
  zuletzt_in TEXT NOT NULL,
  status TEXT NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (projekt, nr)
);
