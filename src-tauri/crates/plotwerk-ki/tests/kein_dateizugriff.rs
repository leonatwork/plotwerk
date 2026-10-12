//! Harte Regel 1: Der Rust-Teil der KI hat keinen Dateizugriff.
//! Durchsucht die Quellen des Crates nach Dateisystem-APIs und das Manifest nach
//! Features, die Dateizugriff mitbringen.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};

const VERBOTEN: &[&str] = &[
    "std::fs",
    "File::",
    "OpenOptions",
    "tokio::fs",
    "use std::{fs",
    "async_fs",
    "include_bytes!",
    "include_str!",
];

fn rust_dateien(ordner: &Path, liste: &mut Vec<PathBuf>) {
    for eintrag in std::fs::read_dir(ordner).expect("Quellordner lesbar") {
        let pfad = eintrag.expect("Eintrag lesbar").path();
        if pfad.is_dir() {
            rust_dateien(&pfad, liste);
        } else if pfad.extension().is_some_and(|e| e == "rs") {
            liste.push(pfad);
        }
    }
}

#[test]
fn quellen_ohne_dateizugriff() {
    let wurzel = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut dateien = Vec::new();
    rust_dateien(&wurzel.join("src"), &mut dateien);
    assert!(!dateien.is_empty(), "keine Quellen gefunden");
    let mut funde = Vec::new();
    for datei in &dateien {
        let inhalt = std::fs::read_to_string(datei).expect("Quelle lesbar");
        for (nr, zeile) in inhalt.lines().enumerate() {
            for muster in VERBOTEN {
                if zeile.contains(muster) {
                    funde.push(format!("{}:{}: {muster}", datei.display(), nr + 1));
                }
            }
        }
    }
    assert!(
        funde.is_empty(),
        "Dateizugriff im KI-Crate gefunden:\n{}",
        funde.join("\n")
    );
}

#[test]
fn abhaengigkeiten_ohne_dateizugriff() {
    let manifest =
        std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
            .expect("Cargo.toml lesbar");
    let abschnitt = manifest
        .split("[dependencies]")
        .nth(1)
        .and_then(|rest| rest.split("\n[").next())
        .expect("[dependencies] vorhanden");
    for verboten in [
        "tauri",
        "\"fs\"",
        "\"full\"",
        "\"stream\"",
        "\"multipart\"",
        "\"blocking\"",
    ] {
        assert!(
            !abschnitt.contains(verboten),
            "verbotene Abhängigkeit/Feature im KI-Crate: {verboten}"
        );
    }
}
