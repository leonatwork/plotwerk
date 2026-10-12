//! Schema des SQLite-Index (nur Cache, jederzeit neu berechenbar – E2). Die Datei liegt im
//! App-Support-Ordner (~/Library/Application Support/app.plotwerk.mac), nicht im Projekt.
//! Lesen/Schreiben übernimmt src/backend/tauri/indexSpeicher.ts über tauri-plugin-sql.

use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATENBANK: &str = "sqlite:plotwerk-index.db";

/// Gemeinsam mit den TS-Tests: src/backend/tauri/schema.sql
const SCHEMA_V1: &str = include_str!("../../src/backend/tauri/schema.sql");

pub fn migrationen() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "index_cache, erwaehnungen, hinweise, faeden",
        sql: SCHEMA_V1,
        kind: MigrationKind::Up,
    }]
}
