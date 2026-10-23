//! Enge Freigabe außerhalb des Projekts. fs_* und deren Pfadwächter bleiben unverändert.
use crate::projekt::sperre;
use crate::{einstellungen, projekt, Zustand};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

fn fehler(e: impl std::fmt::Display) -> String {
    crate::tf!("Sicherung fehlgeschlagen: {e}", "Backup failed: {e}")
}
fn projekt_name(text: &str) -> String {
    let mut name = String::new();
    let mut trennzeichen = false;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            if trennzeichen && !name.is_empty() {
                name.push('-');
            }
            trennzeichen = false;
            name.push(c);
        } else {
            trennzeichen = true;
        }
    }
    let name = name.trim_matches('-').chars().take(80).collect::<String>();
    let name = name.trim_end_matches('-');
    if name.is_empty() {
        "Projekt".into()
    } else {
        name.into()
    }
}
fn name_gueltig(name: &str) -> bool {
    if name.len() < 20 || !name.is_ascii() {
        return false;
    }
    let (projekt, suffix) = name.split_at(name.len() - 20);
    if projekt.is_empty() || projekt_name(projekt) != projekt || !suffix.starts_with('-') {
        return false;
    }
    let s = &suffix[1..];
    if s.len() != 19
        || &s[4..5] != "-"
        || &s[7..8] != "-"
        || &s[10..11] != "-"
        || &s[15..] != ".zip"
    {
        return false;
    }
    let zahl = |a, b| s[a..b].parse::<u32>().ok();
    let (Some(y), Some(m), Some(d), Some(h), Some(min)) = (
        zahl(0, 4),
        zahl(5, 7),
        zahl(8, 10),
        zahl(11, 13),
        zahl(13, 15),
    ) else {
        return false;
    };
    let schaltjahr = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let tage = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if schaltjahr {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    y >= 1000 && d > 0 && d <= tage && h < 24 && min < 60
}
fn archiv_pfad(ordner: &Path, name: &str) -> Result<PathBuf, String> {
    if !name_gueltig(name) {
        return Err(fehler(crate::sprache::t(
            "Ungültiger ZIP-Name",
            "Invalid ZIP name",
        )));
    }
    let root = ordner.canonicalize().map_err(fehler)?;
    let ziel = root.join(name);
    if let Ok(meta) = std::fs::symlink_metadata(&ziel) {
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(fehler("ZIP symlink/directory"));
        }
        if ziel.canonicalize().map_err(fehler)?.parent() != Some(root.as_path()) {
            return Err(fehler("ZIP outside backup folder"));
        }
    }
    Ok(ziel)
}

#[derive(Serialize, Deserialize)]
pub struct Einstellung {
    aktiv: bool,
    #[serde(rename = "mitVersionen")]
    mit_versionen: bool,
    ordner: Option<String>,
}
fn einstellung(app: &AppHandle, zustand: &Zustand) -> Result<Einstellung, String> {
    let _s = sperre(&zustand.einstellungen);
    let datei = projekt::einstellungsdatei(app)?;
    let wert = einstellungen::lesen(&datei, "sicherungen");
    Ok(Einstellung {
        aktiv: wert
            .as_ref()
            .and_then(|w| w.get("aktiv"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        mit_versionen: wert
            .as_ref()
            .and_then(|w| w.get("mitVersionen"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        ordner: einstellungen::lesen(&datei, "sicherungsOrt")
            .and_then(|v| v.as_str().map(String::from)),
    })
}
#[tauri::command]
pub async fn sicherung_einstellungen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
) -> Result<Einstellung, String> {
    einstellung(&app, &zustand)
}
#[tauri::command]
pub async fn sicherung_einstellen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    wert: Einstellung,
) -> Result<(), String> {
    let alt = einstellung(&app, &zustand)?;
    if wert.ordner.is_some() && wert.ordner != alt.ordner {
        return Err(fehler("Folder requires native dialog"));
    }
    let _s = sperre(&zustand.einstellungen);
    let datei = projekt::einstellungsdatei(&app)?;
    einstellungen::schreiben(
        &datei,
        "sicherungen",
        serde_json::json!({"aktiv": wert.aktiv, "mitVersionen": wert.mit_versionen}),
    )?;
    if wert.ordner.is_none() {
        einstellungen::schreiben(&datei, "sicherungsOrt", serde_json::Value::Null)?;
    }
    Ok(())
}
fn ausserhalb_projekt(zustand: &Zustand, root: &Path) -> Result<(), String> {
    if sperre(&zustand.projekte).enthaelt_pfad(root) {
        return Err(fehler(crate::sprache::t(
            "Sicherungsordner muss außerhalb des Projekts liegen",
            "Backup folder must be outside the project",
        )));
    }
    Ok(())
}
fn basis(app: &AppHandle, zustand: &Zustand) -> Result<PathBuf, String> {
    let root = match einstellung(app, zustand)?.ordner {
        Some(p) => {
            let gespeichert = PathBuf::from(p);
            let kanonisch = gespeichert.canonicalize().map_err(fehler)?;
            if kanonisch != gespeichert {
                return Err(fehler("Backup folder changed (symlink)"));
            }
            kanonisch
        }
        None => {
            let p = app
                .path()
                .app_data_dir()
                .map_err(fehler)?
                .join("Sicherungen");
            ausserhalb_projekt(zustand, &p)?;
            std::fs::create_dir_all(&p).map_err(fehler)?;
            p.canonicalize().map_err(fehler)?
        }
    };
    ausserhalb_projekt(zustand, &root)?;
    Ok(root)
}
fn ordner(app: &AppHandle, zustand: &Zustand, kennung: u32) -> Result<PathBuf, String> {
    let wurzel = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let name = projekt_name(
        &wurzel
            .pfad()
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
    );
    let root = basis(app, zustand)?;
    let ziel = root.join(name);
    if let Ok(meta) = std::fs::symlink_metadata(&ziel) {
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(fehler("Backup folder symlink/file"));
        }
    }
    std::fs::create_dir_all(&ziel).map_err(fehler)?;
    let ziel = ziel.canonicalize().map_err(fehler)?;
    if ziel.parent() != Some(root.as_path()) {
        return Err(fehler("Backup folder outside root"));
    }
    ausserhalb_projekt(zustand, &ziel)?;
    Ok(ziel)
}
#[tauri::command]
pub async fn sicherung_ordner_waehlen(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
) -> Result<Option<String>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title(crate::sprache::t(
            "Sicherungsordner wählen",
            "Choose Backup Folder",
        ))
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let p = p
        .into_path()
        .map_err(fehler)?
        .canonicalize()
        .map_err(fehler)?;
    ausserhalb_projekt(&zustand, &p)?;
    let text = p.to_string_lossy().into_owned();
    let _s = sperre(&zustand.einstellungen);
    einstellungen::schreiben(
        &projekt::einstellungsdatei(&app)?,
        "sicherungsOrt",
        serde_json::Value::String(text.clone()),
    )?;
    Ok(Some(text))
}
#[derive(Serialize)]
pub struct Archiv {
    name: String,
    pfad: String,
}
fn liste(root: &Path) -> Result<Vec<Archiv>, String> {
    let mut liste = Vec::new();
    for eintrag in std::fs::read_dir(root).map_err(fehler)? {
        let eintrag = eintrag.map_err(fehler)?;
        let name = eintrag.file_name().to_string_lossy().into_owned();
        if name_gueltig(&name) && archiv_pfad(root, &name).is_ok() {
            liste.push(Archiv {
                name,
                pfad: eintrag.path().to_string_lossy().into_owned(),
            });
        }
    }
    Ok(liste)
}
#[tauri::command]
pub async fn sicherung_auflisten(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
) -> Result<Vec<Archiv>, String> {
    let mut archive = if let Some(k) = kennung {
        liste(&ordner(&app, &zustand, k)?)?
    } else {
        let root = basis(&app, &zustand)?;
        let mut result = liste(&root)?;
        for e in std::fs::read_dir(&root).map_err(fehler)? {
            let e = e.map_err(fehler)?;
            if e.file_type().map_err(fehler)?.is_dir() {
                ausserhalb_projekt(&zustand, &e.path())?;
                result.extend(liste(&e.path())?);
            }
        }
        result
    };
    archive.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(archive)
}

fn archiv_veroeffentlichen(
    temp: &Path,
    ziel: &Path,
    hard_link: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    match hard_link(temp, ziel) {
        Ok(()) => return Ok(()),
        Err(e)
            if matches!(
                e.kind(),
                std::io::ErrorKind::Unsupported | std::io::ErrorKind::PermissionDenied
            ) => {}
        Err(e) => return Err(e),
    }
    // exFAT/FAT und manche NAS erlauben keine Hardlinks. create_new verhindert
    // auch im Fallback atomar das Überschreiben vorhandener Dateien (inklusive Links).
    let mut datei = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(ziel)?;
    let result = (|| {
        let mut quelle = std::fs::File::open(temp)?;
        std::io::copy(&mut quelle, &mut datei)?;
        datei.sync_all()
    })();
    drop(datei);
    if result.is_err() {
        let _ = std::fs::remove_file(ziel);
    }
    result
}

#[tauri::command]
pub async fn sicherung_schreiben(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(daten) = request.body() else {
        return Err(fehler("Binary data expected"));
    };
    let kopf = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
    let kennung = kopf("plotwerk-kennung")
        .ok_or_else(|| fehler("ID missing"))?
        .parse::<u32>()
        .map_err(fehler)?;
    let name = kopf("plotwerk-name").ok_or_else(|| fehler("Name missing"))?;
    let ziel = archiv_pfad(&ordner(&app, &zustand, kennung)?, name)?;
    let daten = daten.clone();
    // Nie den Tauri-Ereignisthread blockieren; kein Beenden-Wait und keine Projekt-Schreibsperre.
    tauri::async_runtime::spawn_blocking(move || {
        let temp = ziel.with_extension("zip.tmp");
        let mut angelegt = false;
        let result = (|| {
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(fehler)?;
            angelegt = true;
            f.write_all(&daten).map_err(fehler)?;
            f.sync_all().map_err(fehler)?;
            drop(f);
            archiv_veroeffentlichen(&temp, &ziel, |a, b| std::fs::hard_link(a, b)).map_err(fehler)
        })();
        if angelegt {
            let _ = std::fs::remove_file(&temp);
        }
        result
    })
    .await
    .map_err(fehler)?
}
#[tauri::command]
pub async fn sicherung_entfernen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    kennung: u32,
    name: String,
) -> Result<(), String> {
    std::fs::remove_file(archiv_pfad(&ordner(&app, &zustand, kennung)?, &name)?).map_err(fehler)
}
#[tauri::command]
pub async fn sicherung_projekt_lesen(
    zustand: State<'_, Zustand>,
    kennung: u32,
    pfad: String,
) -> Result<Response, String> {
    let wurzel = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let p = wurzel.aufloesen(&pfad, false)?;
    let daten = tauri::async_runtime::spawn_blocking(move || std::fs::read(p).map_err(fehler))
        .await
        .map_err(fehler)??;
    Ok(Response::new(daten))
}
#[tauri::command]
pub async fn sicherung_zip_waehlen(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
) -> Result<Option<String>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .add_filter("ZIP", &["zip"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let p = p
        .into_path()
        .map_err(fehler)?
        .canonicalize()
        .map_err(fehler)?;
    if p.extension().and_then(|s| s.to_str()) != Some("zip") {
        return Err(fehler("ZIP required"));
    }
    sperre(&zustand.extern_lesen).insert(p.clone());
    Ok(Some(p.to_string_lossy().into_owned()))
}
#[tauri::command]
pub async fn sicherung_lesen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    pfad: String,
) -> Result<Response, String> {
    let p = PathBuf::from(&pfad);
    if p.components().any(|c| c == std::path::Component::ParentDir) {
        return Err(fehler("Invalid path"));
    }
    let p = p.canonicalize().map_err(fehler)?;
    if p.extension().and_then(|s| s.to_str()) != Some("zip") {
        return Err(fehler("ZIP required"));
    }
    let dialog = sperre(&zustand.extern_lesen).remove(&p);
    if !dialog {
        let root = basis(&app, &zustand)?;
        let parent = p.parent().ok_or_else(|| fehler("Folder missing"))?;
        if parent != root && parent.parent() != Some(root.as_path()) {
            return Err(fehler("ZIP outside backup folder"));
        }
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| fehler("Name invalid"))?;
        archiv_pfad(parent, name)?;
    }
    if std::fs::metadata(&p).map_err(fehler)?.len() > 2 * 1024 * 1024 * 1024 {
        return Err(fehler("ZIP exceeds 2 GB"));
    }
    let daten = tauri::async_runtime::spawn_blocking(move || std::fs::read(p).map_err(fehler))
        .await
        .map_err(fehler)??;
    Ok(Response::new(daten))
}
#[derive(Deserialize)]
pub struct ArchivDatei {
    pfad: String,
    daten: Vec<u8>,
}
fn projekt_pfad_gueltig(p: &str) -> bool {
    !p.is_empty()
        && !p.contains(['\\', ':', '\0'])
        && p.split('/').all(|t| !t.is_empty() && t != "." && t != "..")
}
#[tauri::command]
pub async fn sicherung_wiederherstellen(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
    dateien: Vec<ArchivDatei>,
) -> Result<Option<projekt::ProjektInfo>, String> {
    let mut gesehen = std::collections::HashSet::new();
    let mut groesse = 0u64;
    for d in &dateien {
        groesse += d.daten.len() as u64;
        if !projekt_pfad_gueltig(&d.pfad) || !gesehen.insert(d.pfad.clone()) {
            return Err(fehler("Invalid/duplicate archive path"));
        }
    }
    if !gesehen.contains("projekt.md")
        || groesse > 2 * 1024 * 1024 * 1024
        || dateien.len() > 100_000
    {
        return Err(fehler("Invalid project archive"));
    }
    let Some(p) = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title(crate::sprache::t(
            "In neuen, leeren Ordner wiederherstellen",
            "Restore into New, Empty Folder",
        ))
        .set_file_name("Projekt")
        .set_can_create_directories(true)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let ziel = p.into_path().map_err(fehler)?;
    if ziel.exists()
        && (!ziel.is_dir() || std::fs::read_dir(&ziel).map_err(fehler)?.next().is_some())
    {
        return Err(fehler(crate::sprache::t(
            "Zielordner ist nicht leer",
            "Target folder is not empty",
        )));
    }
    let parent = ziel
        .parent()
        .ok_or_else(|| fehler("Parent missing"))?
        .canonicalize()
        .map_err(fehler)?;
    let ziel = parent.join(ziel.file_name().ok_or_else(|| fehler("Name missing"))?);
    if std::fs::symlink_metadata(&ziel).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(fehler("Target symlink"));
    }
    ausserhalb_projekt(&zustand, &ziel)?;
    let ziel_kopie = ziel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Neue private Staging-Ablage: kein Archivpfad kann auf bestehende Dateien zeigen.
        let temp = parent.join(format!(
            ".plotwerk-wiederherstellen-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(fehler)?
                .as_nanos()
        ));
        std::fs::create_dir(&temp).map_err(fehler)?;
        let result = (|| {
            for d in dateien {
                let p = temp.join(&d.pfad);
                std::fs::create_dir_all(p.parent().ok_or_else(|| fehler("Parent missing"))?)
                    .map_err(fehler)?;
                let mut f = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(p)
                    .map_err(fehler)?;
                f.write_all(&d.daten).map_err(fehler)?;
                f.sync_all().map_err(fehler)?;
            }
            std::fs::rename(&temp, &ziel_kopie).map_err(fehler)
        })();
        if result.is_err() {
            let _ = std::fs::remove_dir_all(&temp);
        }
        result
    })
    .await
    .map_err(fehler)??;
    projekt::oeffnen(&app, &zustand, &ziel).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn veroeffentlichen_ohne_hardlinks() {
        for art in [
            std::io::ErrorKind::Unsupported,
            std::io::ErrorKind::PermissionDenied,
        ] {
            let tmp = tempfile::tempdir().unwrap();
            let temp = tmp.path().join("Hafen-2026-10-20-0905.zip.tmp");
            let ziel = tmp.path().join("Hafen-2026-10-20-0905.zip");
            std::fs::write(&temp, b"ZIP-Inhalt").unwrap();
            archiv_veroeffentlichen(&temp, &ziel, |_, _| Err(std::io::Error::from(art))).unwrap();
            assert_eq!(std::fs::read(&ziel).unwrap(), b"ZIP-Inhalt");
            std::fs::write(&temp, b"Neuer Stand").unwrap();
            let e = archiv_veroeffentlichen(&temp, &ziel, |_, _| Err(std::io::Error::from(art)))
                .unwrap_err();
            assert_eq!(e.kind(), std::io::ErrorKind::AlreadyExists);
            assert_eq!(std::fs::read(&ziel).unwrap(), b"ZIP-Inhalt");
        }
    }

    #[test]
    fn veroeffentlichen_raeumt_fehlgeschlagene_kopie_auf() {
        let tmp = tempfile::tempdir().unwrap();
        let temp = tmp.path().join("fehlt.zip.tmp");
        let ziel = tmp.path().join("Hafen-2026-10-20-0905.zip");
        let e = archiv_veroeffentlichen(&temp, &ziel, |_, _| {
            Err(std::io::Error::from(std::io::ErrorKind::Unsupported))
        })
        .unwrap_err();
        assert_eq!(e.kind(), std::io::ErrorKind::NotFound);
        assert!(!ziel.exists());
    }

    #[test]
    fn veroeffentlichen_gibt_andere_fehler_weiter() {
        let tmp = tempfile::tempdir().unwrap();
        let temp = tmp.path().join("Hafen-2026-10-20-0905.zip.tmp");
        let ziel = tmp.path().join("Hafen-2026-10-20-0905.zip");
        std::fs::write(&temp, b"ZIP-Inhalt").unwrap();
        let e = archiv_veroeffentlichen(&temp, &ziel, |_, _| {
            Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists))
        })
        .unwrap_err();
        assert_eq!(e.kind(), std::io::ErrorKind::AlreadyExists);
        assert!(!ziel.exists());
    }

    #[test]
    fn veroeffentlichen_mit_hardlink_ueberschreibt_nie() {
        let tmp = tempfile::tempdir().unwrap();
        let temp = tmp.path().join("Hafen-2026-10-20-0905.zip.tmp");
        let ziel = tmp.path().join("Hafen-2026-10-20-0905.zip");
        std::fs::write(&temp, b"ZIP-Inhalt").unwrap();
        archiv_veroeffentlichen(&temp, &ziel, |a, b| std::fs::hard_link(a, b)).unwrap();
        std::fs::remove_file(&temp).unwrap();
        std::fs::write(&temp, b"Neuer Stand").unwrap();
        assert!(archiv_veroeffentlichen(&temp, &ziel, |a, b| std::fs::hard_link(a, b)).is_err());
        assert_eq!(std::fs::read(&ziel).unwrap(), b"ZIP-Inhalt");
    }

    #[test]
    fn namen_entsprechen_typescript() {
        assert_eq!(projekt_name("Hafen: /Lichter\\.."), "Hafen-Lichter");
        assert_eq!(projekt_name("é 中文"), "Projekt");
        for name in [
            "Hafenlichter-2026-10-20-0905.zip",
            "Projekt-2024-02-29-2359.zip",
        ] {
            assert!(name_gueltig(name));
        }
        for name in [
            "../Hafen-2026-10-20-0905.zip",
            "/Hafen-2026-10-20-0905.zip",
            "Hafen-2026-02-30-0905.zip",
            "Hafen-2026-10-20-2400.zip",
            "Hafen-2026-10-20-0905.txt",
            "Hafen-2026-10-20-0905.ZIP",
        ] {
            assert!(!name_gueltig(name));
        }
    }

    #[test]
    fn nur_zip_im_freigegebenen_ordner() {
        let tmp = tempfile::tempdir().unwrap();
        let name = "Hafen-2026-10-20-0905.zip";
        assert!(archiv_pfad(tmp.path(), name).is_ok());
        assert!(archiv_pfad(tmp.path(), &format!("../{name}")).is_err());
        assert!(archiv_pfad(tmp.path(), "text.txt").is_err());
        #[cfg(unix)]
        {
            let fremd = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(fremd.path().join(name), tmp.path().join(name)).unwrap();
            assert!(archiv_pfad(tmp.path(), name).is_err());
        }
    }

    #[test]
    fn wiederherstellung_weist_unsichere_pfade_ab() {
        for name in ["../x", "/x", "a/../x", "a\\x", "a//x", "C:/x", "./x"] {
            assert!(!projekt_pfad_gueltig(name));
        }
        assert!(projekt_pfad_gueltig(".plotwerk/hinweise.json"));
        assert!(projekt_pfad_gueltig("recherche/dateien/büro.png"));
    }
}
