//! Dateizugriff im Projektordner (über den Pfadwächter) und atomares Schreiben.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::pfad::Wurzel;

static ZAEHLER: AtomicU64 = AtomicU64::new(0);

/// Kennzeichen temporärer Dateien beim atomaren Schreiben: `.<name>.plotwerk-<pid>-<n>.tmp`.
const TEMP_MARKE: &str = ".plotwerk-";

/// Temporäre Schreibdateien und Finder-Reste gehören nie zum Projekt.
pub fn ist_hilfsdatei(name: &str) -> bool {
    name == ".DS_Store"
        || (name.starts_with('.') && name.contains(TEMP_MARKE) && name.ends_with(".tmp"))
}

fn temp_pfad(ziel: &Path) -> PathBuf {
    let name = ziel
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let n = ZAEHLER.fetch_add(1, Ordering::Relaxed);
    ziel.with_file_name(format!(".{name}{TEMP_MARKE}{}-{n}.tmp", std::process::id()))
}

/// Schreibt atomar: temporäre Datei im selben Ordner, write_all, sync_all, rename.
/// Legt fehlende Ordner an.
pub fn schreiben_atomar(ziel: &Path, inhalt: &[u8]) -> std::io::Result<()> {
    let ordner = ziel.parent().ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            crate::sprache::t("Pfad ohne Ordner", "Path without folder"),
        )
    })?;
    fs::create_dir_all(ordner)?;
    if ziel.is_dir() {
        return Err(std::io::Error::new(
            ErrorKind::IsADirectory,
            "Am Ziel liegt ein Ordner",
        ));
    }
    let temp = temp_pfad(ziel);
    let ergebnis = (|| {
        let mut datei = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        datei.write_all(inhalt)?;
        datei.sync_all()?;
        drop(datei);
        fs::rename(&temp, ziel)?;
        // Ordnereintrag ebenfalls auf die Platte bringen (best effort).
        if let Ok(o) = fs::File::open(ordner) {
            let _ = o.sync_all();
        }
        Ok(())
    })();
    if ergebnis.is_err() {
        let _ = fs::remove_file(&temp);
    }
    ergebnis
}

fn io_fehler(aktion: &str, pfad: &str, e: std::io::Error) -> String {
    let grund = match e.kind() {
        ErrorKind::PermissionDenied => {
            crate::sprache::t("keine Berechtigung", "permission denied").to_string()
        }
        ErrorKind::NotFound => crate::sprache::t("nicht gefunden", "not found").to_string(),
        ErrorKind::StorageFull => crate::sprache::t("Speicher voll", "disk full").to_string(),
        _ => e.to_string(),
    };
    crate::tf!(
        "{aktion} fehlgeschlagen: {pfad} ({grund})",
        "{aktion} failed: {pfad} ({grund})"
    )
}

/// Inhalt als UTF-8 oder None, wenn die Datei fehlt. Ein UTF-8-BOM wird entfernt.
pub fn lesen(wurzel: &Wurzel, pfad: &str) -> Result<Option<String>, String> {
    let abs = wurzel.aufloesen(pfad, false)?;
    match fs::read(&abs) {
        Ok(bytes) => {
            let text = String::from_utf8(bytes).map_err(|_| {
                crate::tf!(
                    "Datei ist kein UTF-8-Text: {pfad}",
                    "File is not UTF-8 text: {pfad}"
                )
            })?;
            Ok(Some(match text.strip_prefix('\u{feff}') {
                Some(rest) => rest.to_string(),
                None => text,
            }))
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) if abs.is_dir() => Err(crate::tf!(
            "Ist ein Ordner, keine Datei: {pfad} ({e})",
            "Is a folder, not a file: {pfad} ({e})"
        )),
        Err(e) => Err(io_fehler(crate::sprache::t("Lesen", "Reading"), pfad, e)),
    }
}

pub fn schreiben(wurzel: &Wurzel, pfad: &str, inhalt: &str) -> Result<PathBuf, String> {
    let abs = wurzel.aufloesen(pfad, false)?;
    schreiben_atomar(&abs, inhalt.as_bytes())
        .map_err(|e| io_fehler(crate::sprache::t("Speichern", "Saving"), pfad, e))?;
    Ok(abs)
}

/// Binärdateien (Recherche-Bilder, G8) nur unter `recherche/` und deren Schnappschüsse unter
/// `.versionen/recherche/`; `recherche.json` bleibt Text. Gleiche Regel wie `binaerPfadErlaubt` in
/// core/projekt/binaer.ts. `norm` ist ein mit `pfad::normalisieren` geprüfter Pfad.
pub fn binaer_erlaubt(norm: &str) -> bool {
    let ordner = ["recherche/", ".versionen/recherche/"];
    ordner
        .iter()
        .any(|o| norm.starts_with(o) && norm.len() > o.len())
        && !norm.ends_with("/recherche.json")
}

fn binaer_pruefen(pfad: &str) -> Result<(), String> {
    let norm = crate::pfad::normalisieren(pfad)?;
    if binaer_erlaubt(&norm) {
        Ok(())
    } else {
        Err(crate::tf!(
            "Binärdateien nur unter recherche/: {pfad}",
            "Binary files only under recherche/: {pfad}"
        ))
    }
}

/// Binärdatei lesen; None, wenn sie fehlt.
pub fn lesen_binaer(wurzel: &Wurzel, pfad: &str) -> Result<Option<Vec<u8>>, String> {
    binaer_pruefen(pfad)?;
    let abs = wurzel.aufloesen(pfad, false)?;
    match fs::read(&abs) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) if abs.is_dir() => Err(crate::tf!(
            "Ist ein Ordner, keine Datei: {pfad} ({e})",
            "Is a folder, not a file: {pfad} ({e})"
        )),
        Err(e) => Err(io_fehler(crate::sprache::t("Lesen", "Reading"), pfad, e)),
    }
}

/// Binärdatei atomar schreiben (wie `schreiben`).
pub fn schreiben_binaer(wurzel: &Wurzel, pfad: &str, daten: &[u8]) -> Result<PathBuf, String> {
    binaer_pruefen(pfad)?;
    let abs = wurzel.aufloesen(pfad, false)?;
    schreiben_atomar(&abs, daten)
        .map_err(|e| io_fehler(crate::sprache::t("Speichern", "Saving"), pfad, e))?;
    Ok(abs)
}

pub fn existiert(wurzel: &Wurzel, pfad: &str) -> Result<bool, String> {
    let abs = wurzel.aufloesen(pfad, true)?;
    Ok(abs.exists())
}

/// Entfernt eine Datei. Fehlt sie, ist das kein Fehler (wie MemoryFs).
pub fn entfernen(wurzel: &Wurzel, pfad: &str) -> Result<PathBuf, String> {
    let abs = wurzel.aufloesen(pfad, false)?;
    match fs::symlink_metadata(&abs) {
        Ok(m) if m.is_dir() => Err(crate::tf!(
            "Ordner werden nicht entfernt: {pfad}",
            "Folders are not removed: {pfad}"
        )),
        Ok(_) => fs::remove_file(&abs)
            .map(|_| abs.clone())
            .map_err(|e| io_fehler(crate::sprache::t("Entfernen", "Removing"), pfad, e)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(abs),
        Err(e) => Err(io_fehler(
            crate::sprache::t("Entfernen", "Removing"),
            pfad,
            e,
        )),
    }
}

/// Alle Dateien unterhalb von `ordner`, rekursiv, sortiert, relativ zum Projektordner,
/// inklusive versteckter Ordner (.plotwerk, .versionen). Symlink-Ordner werden nicht
/// betreten; Symlink-Dateien nur, wenn ihr Ziel im Projekt liegt.
pub fn auflisten(wurzel: &Wurzel, ordner: &str) -> Result<Vec<String>, String> {
    let start = wurzel.aufloesen(ordner, true)?;
    let mut ergebnis = Vec::new();
    match fs::symlink_metadata(&start) {
        Ok(m) if m.is_dir() => sammeln(wurzel, &start, &mut ergebnis),
        Ok(m) if m.file_type().is_symlink() && start.is_dir() => {
            // Ein Symlink-Ordner innerhalb des Projekts (vom Pfadwächter geprüft).
            sammeln(wurzel, &start, &mut ergebnis)
        }
        _ => {}
    }
    ergebnis.sort();
    Ok(ergebnis)
}

fn sammeln(wurzel: &Wurzel, ordner: &Path, ergebnis: &mut Vec<String>) {
    let Ok(eintraege) = fs::read_dir(ordner) else {
        return;
    };
    for eintrag in eintraege.flatten() {
        let name = eintrag.file_name();
        let Some(name) = name.to_str() else { continue };
        if ist_hilfsdatei(name) {
            continue;
        }
        let pfad = eintrag.path();
        let Ok(typ) = eintrag.file_type() else {
            continue;
        };
        if typ.is_dir() {
            sammeln(wurzel, &pfad, ergebnis);
        } else if typ.is_file() {
            if let Some(rel) = relativ_im_projekt(wurzel, &pfad) {
                ergebnis.push(rel);
            }
        } else if typ.is_symlink() {
            let Ok(ziel) = pfad.canonicalize() else {
                continue;
            };
            if ziel.starts_with(wurzel.pfad()) && ziel.is_file() {
                if let Some(rel) = relativ_im_projekt(wurzel, &pfad) {
                    ergebnis.push(rel);
                }
            }
        }
    }
}

fn relativ_im_projekt(wurzel: &Wurzel, pfad: &Path) -> Option<String> {
    // `ordner` kann über einen Symlink innerhalb des Projekts erreicht worden sein;
    // der gelistete Pfad bleibt der logische Pfad unterhalb der Wurzel.
    wurzel.relativ(pfad)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn projekt() -> (tempfile::TempDir, Wurzel) {
        let tmp = tempfile::tempdir().unwrap();
        let w = Wurzel::neu(tmp.path()).unwrap();
        (tmp, w)
    }

    #[test]
    fn schreiben_und_lesen() {
        let (_tmp, w) = projekt();
        assert_eq!(lesen(&w, "manuskript/lotte.md").unwrap(), None);
        schreiben(
            &w,
            "manuskript/lotte.md",
            "---\nid: lotte\n---\nText „Zitat“",
        )
        .unwrap();
        assert_eq!(
            lesen(&w, "manuskript/lotte.md").unwrap().as_deref(),
            Some("---\nid: lotte\n---\nText „Zitat“")
        );
        schreiben(&w, "manuskript/lotte.md", "neu").unwrap();
        assert_eq!(
            lesen(&w, "manuskript/lotte.md").unwrap().as_deref(),
            Some("neu")
        );
        assert!(existiert(&w, "manuskript").unwrap());
        assert!(existiert(&w, "manuskript/lotte.md").unwrap());
        assert!(!existiert(&w, "manuskript/fehlt.md").unwrap());
    }

    #[test]
    fn schreiben_hinterlaesst_keine_tempdateien() {
        let (_tmp, w) = projekt();
        for i in 0..20 {
            schreiben(&w, "plan/akte.md", &format!("Version {i}")).unwrap();
        }
        let namen: Vec<_> = fs::read_dir(w.pfad().join("plan"))
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(namen, vec!["akte.md"]);
    }

    #[test]
    fn schreiben_auf_ordner_scheitert_sauber() {
        let (_tmp, w) = projekt();
        fs::create_dir_all(w.pfad().join("ordner")).unwrap();
        assert!(schreiben(&w, "ordner", "x").is_err());
        assert_eq!(fs::read_dir(w.pfad()).unwrap().count(), 1);
    }

    #[test]
    fn bom_wird_entfernt() {
        let (_tmp, w) = projekt();
        fs::write(w.pfad().join("projekt.md"), "\u{feff}---\ntitel: x\n---\n").unwrap();
        assert_eq!(
            lesen(&w, "projekt.md").unwrap().as_deref(),
            Some("---\ntitel: x\n---\n")
        );
    }

    #[test]
    fn kein_utf8_ist_fehler() {
        let (_tmp, w) = projekt();
        fs::write(w.pfad().join("x.md"), [0xff, 0xfe, 0x00]).unwrap();
        assert!(lesen(&w, "x.md").is_err());
    }

    #[test]
    fn auflisten_rekursiv_relativ_sortiert() {
        let (_tmp, w) = projekt();
        for p in [
            "projekt.md",
            "manuskript/b.md",
            "manuskript/a.md",
            ".plotwerk/hinweise.json",
            ".plotwerk/analysen/a.json",
            ".versionen/manuskript/a.md/2026-01-01T10-00-00.md",
        ] {
            schreiben(&w, p, "x").unwrap();
        }
        fs::write(w.pfad().join(".DS_Store"), "").unwrap();
        fs::write(w.pfad().join("manuskript/.a.md.plotwerk-1-2.tmp"), "").unwrap();
        assert_eq!(
            auflisten(&w, "manuskript").unwrap(),
            vec!["manuskript/a.md", "manuskript/b.md"]
        );
        assert_eq!(
            auflisten(&w, "").unwrap(),
            vec![
                ".plotwerk/analysen/a.json",
                ".plotwerk/hinweise.json",
                ".versionen/manuskript/a.md/2026-01-01T10-00-00.md",
                "manuskript/a.md",
                "manuskript/b.md",
                "projekt.md",
            ]
        );
        assert_eq!(auflisten(&w, "fehlt").unwrap(), Vec::<String>::new());
        assert_eq!(auflisten(&w, "projekt.md").unwrap(), Vec::<String>::new());
        assert!(auflisten(&w, "../").is_err());
    }

    #[test]
    fn auflisten_folgt_keinem_symlink_nach_aussen() {
        let (_tmp, w) = projekt();
        let aussen = tempfile::tempdir().unwrap();
        fs::write(aussen.path().join("geheim.md"), "x").unwrap();
        symlink(aussen.path(), w.pfad().join("ausgang")).unwrap();
        symlink(aussen.path().join("geheim.md"), w.pfad().join("verweis.md")).unwrap();
        schreiben(&w, "echt.md", "x").unwrap();
        symlink(w.pfad().join("echt.md"), w.pfad().join("intern.md")).unwrap();
        assert_eq!(auflisten(&w, "").unwrap(), vec!["echt.md", "intern.md"]);
        assert!(auflisten(&w, "ausgang").is_err());
        assert!(lesen(&w, "verweis.md").is_err());
        assert!(schreiben(&w, "ausgang/neu.md", "x").is_err());
        assert!(!aussen.path().join("neu.md").exists());
    }

    #[test]
    fn entfernen_datei() {
        let (_tmp, w) = projekt();
        schreiben(&w, "figuren/ole.md", "x").unwrap();
        entfernen(&w, "figuren/ole.md").unwrap();
        assert!(!existiert(&w, "figuren/ole.md").unwrap());
        entfernen(&w, "figuren/ole.md").unwrap();
        assert!(entfernen(&w, "figuren").is_err());
        assert!(entfernen(&w, "../x").is_err());
    }

    /// Absturz mitten im Schreiben: übrig bleibt höchstens eine halbe Temp-Datei. Die Kapiteldatei
    /// hat weiter die alte, vollständige Fassung; die Temp-Datei gehört nie zum Projekt.
    #[test]
    fn absturz_waehrend_schreiben_laesst_alte_fassung() {
        let (_tmp, w) = projekt();
        let alt = "---\nid: lotte\ntitel: Lotte\n---\n\nAlter, vollständiger Text.\n";
        schreiben(&w, "manuskript/lotte.md", alt).unwrap();
        let rest = w.pfad().join("manuskript/.lotte.md.plotwerk-99999-0.tmp");
        fs::write(&rest, "---\nid: lotte\ntitel: Lo").unwrap();

        assert_eq!(
            lesen(&w, "manuskript/lotte.md").unwrap().as_deref(),
            Some(alt)
        );
        assert_eq!(auflisten(&w, "").unwrap(), vec!["manuskript/lotte.md"]);

        let neu = "---\nid: lotte\ntitel: Lotte\n---\n\nNeuer Text.\n";
        schreiben(&w, "manuskript/lotte.md", neu).unwrap();
        assert_eq!(
            lesen(&w, "manuskript/lotte.md").unwrap().as_deref(),
            Some(neu)
        );
    }

    /// Atomar: Wer während des Schreibens liest (Absturz = Lesen nach dem Neustart), sieht immer
    /// eine vollständige Fassung, nie eine halbe.
    #[test]
    fn absturz_leser_sieht_nie_eine_halbe_datei() {
        let (_tmp, w) = projekt();
        let gross_a = "a".repeat(2_000_000);
        let gross_b = "b".repeat(2_000_000);
        schreiben(&w, "manuskript/lang.md", &gross_a).unwrap();
        let ziel = w.pfad().join("manuskript/lang.md");
        let fertig = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let leser = {
            let fertig = fertig.clone();
            let ziel = ziel.clone();
            std::thread::spawn(move || {
                let mut gelesen = 0;
                while !fertig.load(Ordering::Relaxed) {
                    let inhalt = fs::read(&ziel).unwrap();
                    assert_eq!(inhalt.len(), 2_000_000, "halbe Datei gelesen");
                    let erstes = inhalt[0];
                    assert!(
                        inhalt.iter().all(|&c| c == erstes),
                        "gemischte Fassung gelesen"
                    );
                    gelesen += 1;
                }
                gelesen
            })
        };
        for i in 0..40 {
            let inhalt = if i % 2 == 0 { &gross_b } else { &gross_a };
            schreiben(&w, "manuskript/lang.md", inhalt).unwrap();
        }
        fertig.store(true, Ordering::Relaxed);
        assert!(leser.join().unwrap() > 0);
    }

    #[test]
    fn binaer_schreiben_und_lesen() {
        let (_tmp, w) = projekt();
        let bild: Vec<u8> = vec![0x89, b'P', b'N', b'G', 0x00, 0xff, 0xfe, 0x0a];
        assert_eq!(
            lesen_binaer(&w, "recherche/dateien/bild.png").unwrap(),
            None
        );
        schreiben_binaer(&w, "recherche/dateien/bild.png", &bild).unwrap();
        assert_eq!(
            lesen_binaer(&w, "recherche/dateien/bild.png").unwrap(),
            Some(bild.clone())
        );
        // keine Temp-Reste, als Text nicht lesbar (kein UTF-8)
        assert_eq!(
            auflisten(&w, "recherche").unwrap(),
            vec!["recherche/dateien/bild.png"]
        );
        assert!(lesen(&w, "recherche/dateien/bild.png").is_err());
        schreiben_binaer(
            &w,
            ".versionen/recherche/dateien/bild.png/2026-10-10T12-00-00.png",
            &bild,
        )
        .unwrap();
    }

    #[test]
    fn binaer_nur_unter_recherche() {
        let (_tmp, w) = projekt();
        for pfad in [
            "manuskript/lotte.md",
            "projekt.md",
            "recherche/recherche.json",
            "recherche",
            "recherche/",
            ".versionen/manuskript/a.md/x.md",
            "../recherche/x.png",
            "/recherche/x.png",
            "recherche/../projekt.md",
        ] {
            assert!(
                schreiben_binaer(&w, pfad, b"x").is_err(),
                "{pfad} darf nicht binär geschrieben werden"
            );
            assert!(
                lesen_binaer(&w, pfad).is_err(),
                "{pfad} darf nicht binär gelesen werden"
            );
        }
        assert!(!w.pfad().join("manuskript").exists());
        assert!(binaer_erlaubt("recherche/dateien/a.jpg"));
        assert!(binaer_erlaubt("recherche/notiz.png"));
        assert!(binaer_erlaubt(
            ".versionen/recherche/dateien/a.jpg/2026.jpg"
        ));
        assert!(!binaer_erlaubt("recherche/recherche.json"));
    }

    #[test]
    fn binaer_folgt_keinem_symlink_nach_aussen() {
        let (_tmp, w) = projekt();
        let aussen = tempfile::tempdir().unwrap();
        fs::create_dir_all(w.pfad().join("recherche")).unwrap();
        symlink(aussen.path(), w.pfad().join("recherche/ausgang")).unwrap();
        assert!(schreiben_binaer(&w, "recherche/ausgang/x.png", b"x").is_err());
        assert!(!aussen.path().join("x.png").exists());
    }

    #[test]
    fn hilfsdateien() {
        assert!(ist_hilfsdatei(".DS_Store"));
        assert!(ist_hilfsdatei(".lotte.md.plotwerk-12-3.tmp"));
        assert!(!ist_hilfsdatei("lotte.md"));
        assert!(!ist_hilfsdatei(".plotwerk"));
    }
}
