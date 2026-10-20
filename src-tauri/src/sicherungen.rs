//! Enge ZIP-Freigabe außerhalb des Projekts; fs_*-Pfadwächter bleibt unabhängig.
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::projekt::{einstellungsdatei, sperre, ProjektInfo};
use crate::{dateien, einstellungen, Zustand};

const ORT: &str = "sicherungsOrt";
const OPTIONEN: &str = "sicherungen";
const TAGE: &str = "sicherungstage";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Optionen {
    aktiv: bool,
    mit_versionen: bool,
    ort: Option<String>,
}

fn optionen(app: &AppHandle, zustand: &Zustand) -> Result<Optionen, String> {
    let _s = sperre(&zustand.einstellungen);
    let datei = einstellungsdatei(app)?;
    let mut o = einstellungen::lesen(&datei, OPTIONEN)
        .and_then(|v| serde_json::from_value::<Optionen>(v).ok())
        .unwrap_or(Optionen { aktiv: true, mit_versionen: false, ort: None });
    o.ort = einstellungen::lesen(&datei, ORT).and_then(|v| v.as_str().map(str::to_owned));
    Ok(o)
}

fn fehler(e: impl std::fmt::Display) -> String {
    crate::tf!("Sicherung nicht möglich: {e}", "Backup unavailable: {e}")
}

fn name_sauber(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.') && !name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
}

fn projektname(pfad: &Path) -> Result<String, String> {
    let name = pfad.file_name().and_then(|n| n.to_str()).unwrap_or("Projekt");
    if !name_sauber(name) { return Err(fehler("Ungültiger Projektname / invalid project name")); }
    Ok(name.to_owned())
}

/// Validiert exakt <Projekt>-YYYY-MM-DD-HHmm.zip (echtes Kalenderdatum).
fn gueltiger_name(name: &str, projekt: &str) -> bool {
    if !name_sauber(name) { return false; }
    let Some(rest) = name.strip_prefix(&format!("{projekt}-")).and_then(|n| n.strip_suffix(".zip")) else { return false; };
    let b = rest.as_bytes();
    if b.len() != 15 || b[4] != b'-' || b[7] != b'-' || b[10] != b'-'
        || b.iter().enumerate().any(|(i, c)| ![4, 7, 10].contains(&i) && !c.is_ascii_digit()) { return false; }
    let zahl = |a: usize, z: usize| rest[a..z].parse::<u32>().unwrap_or(0);
    let (jahr, monat, tag) = (zahl(0, 4), zahl(5, 7), zahl(8, 10));
    let schalt = jahr % 4 == 0 && (jahr % 100 != 0 || jahr % 400 == 0);
    let tage = match monat { 2 => if schalt { 29 } else { 28 }, 4 | 6 | 9 | 11 => 30, 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, _ => 0 };
    jahr >= 1000 && tag > 0 && tag <= tage && zahl(11, 13) < 24 && zahl(13, 15) < 60
}

fn zip_pfad(ordner: &Path, name: &str, projekt: &str) -> Result<PathBuf, String> {
    if !gueltiger_name(name, projekt) { return Err(fehler("Ungültiger ZIP-Name / invalid ZIP name")); }
    let p = ordner.join(name);
    if let Ok(meta) = std::fs::symlink_metadata(&p) {
        if !meta.is_file() || meta.file_type().is_symlink() { return Err(fehler("Kein reguläres ZIP / not a regular ZIP")); }
        if p.canonicalize().map_err(fehler)?.parent() != Some(ordner) { return Err(fehler("ZIP außerhalb des Sicherungsordners / ZIP outside backup folder")); }
    }
    Ok(p)
}

fn basis(app: &AppHandle, zustand: &Zustand) -> Result<PathBuf, String> {
    if let Some(ort) = optionen(app, zustand)?.ort {
        let p = PathBuf::from(ort);
        // Der gespeicherte Ort wird ausschließlich vom nativen Dialog gesetzt und kanonisch gemerkt.
        if p.components().any(|c| matches!(c, Component::ParentDir)) { return Err(fehler("Ungültiger Ordner / invalid folder")); }
        let echt = p.canonicalize().map_err(fehler)?;
        if echt != p || !echt.is_dir() { return Err(fehler("Sicherungsordner wurde verschoben / backup folder moved")); }
        return Ok(echt);
    }
    app.path().app_data_dir().map(|p| p.join("Sicherungen")).map_err(fehler)
}

fn ordner(app: &AppHandle, zustand: &Zustand, kennung: u32) -> Result<(PathBuf, String, String), String> {
    let wurzel = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let name = projektname(wurzel.pfad())?;
    let ziel = basis(app, zustand)?.join(&name);
    // Auch ein Symlink auf einen Projektunterordner darf niemals als Sicherungsziel dienen.
    if ziel.exists() && std::fs::symlink_metadata(&ziel).map_err(fehler)?.file_type().is_symlink() { return Err(fehler("Verknüpfung als Ziel / symlink destination")); }
    let eltern = ziel.parent().ok_or_else(|| fehler("Kein Ziel / missing destination"))?;
    let mut vorhanden = eltern;
    while !vorhanden.exists() {
        vorhanden = vorhanden.parent().ok_or_else(|| fehler("Kein Ziel / missing destination"))?;
    }
    if vorhanden.canonicalize().map_err(fehler)?.starts_with(wurzel.pfad()) { return Err(fehler("Sicherungsort liegt im Projekt / backup location is inside project")); }
    std::fs::create_dir_all(eltern).map_err(fehler)?;
    let eltern = eltern.canonicalize().map_err(fehler)?;
    if eltern.starts_with(wurzel.pfad()) { return Err(fehler("Sicherungsort liegt im Projekt / backup location is inside project")); }
    std::fs::create_dir_all(&ziel).map_err(fehler)?;
    let ziel = ziel.canonicalize().map_err(fehler)?;
    if ziel.starts_with(wurzel.pfad()) { return Err(fehler("Sicherungsort liegt im Projekt / backup location is inside project")); }
    Ok((ziel, name, wurzel.pfad().to_string_lossy().into_owned()))
}

fn namen(ordner: &Path, name: &str) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    if !ordner.exists() { return Ok(result); }
    for e in std::fs::read_dir(ordner).map_err(fehler)? {
        let e = e.map_err(fehler)?;
        let n = e.file_name().to_string_lossy().into_owned();
        if gueltiger_name(&n, name) && zip_pfad(ordner, &n, name).is_ok() { result.push(n); }
    }
    result.sort();
    Ok(result)
}

fn heute() -> Result<String, String> {
    // macOS lokale Kalenderzeit, unabhängig von einer vom Webview gelieferten Uhrzeit.
    let ausgabe = std::process::Command::new("/bin/date").arg("+%Y-%m-%d").output().map_err(fehler)?;
    if !ausgabe.status.success() { return Err(fehler("Datum nicht verfügbar / date unavailable")); }
    Ok(String::from_utf8(ausgabe.stdout).map_err(fehler)?.trim().to_owned())
}

#[tauri::command]
pub async fn archiv_einstellungen(app: AppHandle, zustand: State<'_, Zustand>) -> Result<Optionen, String> { optionen(&app, &zustand) }

#[tauri::command]
pub async fn archiv_einstellen(app: AppHandle, zustand: State<'_, Zustand>, mut wert: Optionen) -> Result<(), String> {
    let bisher = optionen(&app, &zustand)?;
    if wert.ort.is_some() && wert.ort != bisher.ort { return Err(fehler("Ort nur über Dialog / location requires dialog")); }
    let _s = sperre(&zustand.einstellungen);
    let datei = einstellungsdatei(&app)?;
    if wert.ort.is_none() { einstellungen::schreiben(&datei, ORT, serde_json::Value::Null)?; }
    wert.ort = None;
    einstellungen::schreiben(&datei, OPTIONEN, serde_json::to_value(wert).map_err(fehler)?)
}

#[tauri::command]
pub async fn archiv_ort_waehlen(app: AppHandle, fenster: WebviewWindow, zustand: State<'_, Zustand>) -> Result<Option<String>, String> {
    let Some(p) = app.dialog().file().set_parent(&fenster).set_title(crate::sprache::t("Sicherungsordner wählen", "Choose Backup Folder")).set_can_create_directories(true).blocking_pick_folder() else { return Ok(None); };
    let p = p.into_path().map_err(fehler)?.canonicalize().map_err(fehler)?;
    if let Ok(w) = sperre(&zustand.projekte).wurzel(None) {
        if p.starts_with(w.pfad()) { return Err(fehler("Sicherungsort liegt im Projekt / backup location is inside project")); }
    }
    let text = p.to_string_lossy().into_owned();
    let _s = sperre(&zustand.einstellungen);
    einstellungen::schreiben(&einstellungsdatei(&app)?, ORT, serde_json::json!(text))?;
    Ok(Some(text))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info { aktiv: bool, mit_versionen: bool, ort: String, name: String, namen: Vec<String>, heute_gesichert: bool }

#[tauri::command]
pub async fn archiv_info(app: AppHandle, zustand: State<'_, Zustand>, kennung: u32) -> Result<Info, String> {
    let o = optionen(&app, &zustand)?;
    let (ort, name, projekt) = ordner(&app, &zustand, kennung)?;
    let heute = heute()?;
    let gesichert = {
        let _s = sperre(&zustand.einstellungen);
        einstellungen::lesen(&einstellungsdatei(&app)?, TAGE).and_then(|v| v.get(&projekt).and_then(|t| t.as_str()).map(|t| t == heute)).unwrap_or(false)
    };
    Ok(Info { aktiv: o.aktiv, mit_versionen: o.mit_versionen, ort: ort.to_string_lossy().into_owned(), namen: namen(&ort, &name)?, name, heute_gesichert: gesichert })
}

/// Enger Lesezugriff für vollständige Projektarchive, auch unbekannte Binärdateien.
#[tauri::command]
pub async fn archiv_projekt_lesen(zustand: State<'_, Zustand>, kennung: u32, pfad: String) -> Result<Response, String> {
    let w = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let p = w.aufloesen(&pfad, false)?;
    Ok(Response::new(std::fs::read(p).map_err(fehler)?))
}

#[tauri::command]
pub async fn archiv_schreiben(app: AppHandle, zustand: State<'_, Zustand>, request: Request<'_>) -> Result<(), String> {
    let _lauf = sperre(&zustand.archiv_schreiben);
    let InvokeBody::Raw(daten) = request.body() else { return Err(fehler("Binärdaten erwartet / binary data expected")); };
    if !daten.starts_with(b"PK\x03\x04") { return Err(fehler("Kein ZIP / not a ZIP")); }
    let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok()).ok_or_else(|| fehler("Kopfzeile fehlt / missing header"));
    let kennung: u32 = header("plotwerk-kennung")?.parse().map_err(fehler)?;
    let name = percent_decode_str(header("plotwerk-name")?).decode_utf8().map_err(fehler)?;
    let erwartet = percent_decode_str(header("plotwerk-ort")?).decode_utf8().map_err(fehler)?;
    let (ort, projektname, projekt) = ordner(&app, &zustand, kennung)?;
    if ort != Path::new(erwartet.as_ref()) { return Err(fehler("Sicherungsort wurde geändert / backup location changed")); }
    let p = zip_pfad(&ort, &name, &projektname)?;
    if p.exists() { return Err(fehler("Sicherung existiert bereits / backup already exists")); }
    dateien::schreiben_atomar(&p, daten).map_err(fehler)?;
    let tag = heute()?;
    let _s = sperre(&zustand.einstellungen);
    let datei = einstellungsdatei(&app)?;
    let mut tage = einstellungen::lesen(&datei, TAGE).and_then(|v| v.as_object().cloned()).unwrap_or_default();
    tage.insert(projekt, serde_json::json!(tag));
    einstellungen::schreiben(&datei, TAGE, serde_json::Value::Object(tage))
}

#[tauri::command]
pub async fn archiv_entfernen(app: AppHandle, zustand: State<'_, Zustand>, kennung: u32, name: String, ort: String) -> Result<(), String> {
    let _lauf = sperre(&zustand.archiv_schreiben);
    let (ziel, projekt, _) = ordner(&app, &zustand, kennung)?;
    if ziel != Path::new(&ort) { return Err(fehler("Sicherungsort wurde geändert / backup location changed")); }
    std::fs::remove_file(zip_pfad(&ziel, &name, &projekt)?).map_err(fehler)
}

#[derive(Serialize, Deserialize)]
pub struct Eintrag { ordner: String, name: String }

#[tauri::command]
pub async fn archiv_liste(app: AppHandle, zustand: State<'_, Zustand>) -> Result<Vec<Eintrag>, String> {
    let basis = basis(&app, &zustand)?;
    let mut liste = Vec::new();
    if !basis.exists() { return Ok(liste); }
    let basis = basis.canonicalize().map_err(fehler)?;
    for e in std::fs::read_dir(&basis).map_err(fehler)? {
        let e = e.map_err(fehler)?;
        if !e.file_type().map_err(fehler)?.is_dir() { continue; }
        let projekt = e.file_name().to_string_lossy().into_owned();
        let ordner = e.path().canonicalize().map_err(fehler)?;
        if ordner.parent() != Some(basis.as_path()) { continue; }
        for name in namen(&ordner, &projekt)? { liste.push(Eintrag { ordner: ordner.to_string_lossy().into_owned(), name }); }
    }
    liste.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(liste)
}

#[derive(Serialize)]
pub struct Gewaehlt { name: String, pfad: String }

#[tauri::command]
pub async fn archiv_waehlen(app: AppHandle, fenster: WebviewWindow, zustand: State<'_, Zustand>, eintrag: Option<Eintrag>) -> Result<Option<Gewaehlt>, String> {
    let p = if let Some(e) = eintrag {
        let basis = basis(&app, &zustand)?.canonicalize().map_err(fehler)?;
        let roh = PathBuf::from(&e.ordner);
        if roh.components().any(|c| matches!(c, Component::ParentDir)) { return Err(fehler("Ungültiger Pfad / invalid path")); }
        let o = roh.canonicalize().map_err(fehler)?;
        if o.parent() != Some(basis.as_path()) { return Err(fehler("Außerhalb des Sicherungsordners / outside backup folder")); }
        let projekt = projektname(&o)?;
        zip_pfad(&o, &e.name, &projekt)?
    } else {
        let Some(p) = app.dialog().file().set_parent(&fenster).set_title(crate::sprache::t("Sicherung wählen", "Choose Backup")).add_filter("ZIP", &["zip"]).blocking_pick_file() else { return Ok(None); };
        let p = p.into_path().map_err(fehler)?.canonicalize().map_err(fehler)?;
        if p.extension().and_then(|e| e.to_str()) != Some("zip") { return Err(fehler("Nur ZIP / ZIP only")); }
        p
    };
    let p = p.canonicalize().map_err(fehler)?;
    sperre(&zustand.archiv_lesen).insert(p.clone());
    Ok(Some(Gewaehlt { name: p.file_name().unwrap_or_default().to_string_lossy().into_owned(), pfad: p.to_string_lossy().into_owned() }))
}

#[tauri::command]
pub async fn archiv_lesen(zustand: State<'_, Zustand>, pfad: String) -> Result<Response, String> {
    let p = PathBuf::from(pfad).canonicalize().map_err(fehler)?;
    if !sperre(&zustand.archiv_lesen).remove(&p) { return Err(fehler("ZIP nicht gewählt / ZIP not selected")); }
    let m = std::fs::metadata(&p).map_err(fehler)?;
    if !m.is_file() || m.len() > 1024 * 1024 * 1024 { return Err(fehler("ZIP zu groß / ZIP too large")); }
    Ok(Response::new(std::fs::read(p).map_err(fehler)?))
}

#[derive(Deserialize)]
pub struct ArchivDatei { pfad: String, daten: Vec<u8> }

fn restore_pfade(dateien: &[ArchivDatei]) -> Result<(), String> {
    let mut gesehen = HashSet::new();
    let mut groesse = 0usize;
    if dateien.len() > 100000 || !dateien.iter().any(|d| d.pfad == "projekt.md") { return Err(fehler("Kein Projektarchiv / not a project archive")); }
    for d in dateien {
        let p = Path::new(&d.pfad);
        if d.pfad.is_empty() || d.pfad.contains(['\\', ':', '\0']) || d.pfad.split('/').any(|t| t.is_empty() || t == "." || t == "..")
            || p.components().any(|c| !matches!(c, Component::Normal(_))) || !gesehen.insert(d.pfad.to_lowercase()) { return Err(fehler("Unsicherer Archivpfad / unsafe archive path")); }
        groesse = groesse.checked_add(d.daten.len()).ok_or_else(|| fehler("Archiv zu groß / archive too large"))?;
        if groesse > 1024 * 1024 * 1024 { return Err(fehler("Archiv zu groß / archive too large")); }
    }
    for d in dateien {
        let mut p = Path::new(&d.pfad).parent();
        while let Some(eltern) = p {
            if gesehen.contains(&eltern.to_string_lossy().to_lowercase()) { return Err(fehler("Datei-/Ordnerkonflikt / file/folder conflict")); }
            p = eltern.parent();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn archiv_wiederherstellen(app: AppHandle, fenster: WebviewWindow, zustand: State<'_, Zustand>, dateien: Vec<ArchivDatei>, titel: String) -> Result<Option<ProjektInfo>, String> {
    restore_pfade(&dateien)?;
    let vorschlag = titel.replace(['/', '\\', ':'], "-");
    let Some(p) = app.dialog().file().set_parent(&fenster).set_title(crate::sprache::t("In neuen Ordner wiederherstellen", "Restore into New Folder")).set_file_name(&vorschlag).set_can_create_directories(true).blocking_save_file() else { return Ok(None); };
    let p = p.into_path().map_err(fehler)?;
    if p.exists() && (!p.is_dir() || std::fs::symlink_metadata(&p).map_err(fehler)?.file_type().is_symlink() || std::fs::read_dir(&p).map_err(fehler)?.next().is_some()) { return Err(fehler("Zielordner muss neu oder leer sein / destination must be new or empty")); }
    std::fs::create_dir_all(&p).map_err(fehler)?;
    let p = p.canonicalize().map_err(fehler)?;
    let wurzel = crate::pfad::Wurzel::neu(&p)?;
    for d in dateien {
        let ziel = wurzel.aufloesen(&d.pfad, false)?;
        if let Some(eltern) = ziel.parent() { std::fs::create_dir_all(eltern).map_err(fehler)?; }
        // Erneut nach dem Anlegen auflösen; niemals eine inzwischen angelegte Datei überschreiben.
        let ziel = wurzel.aufloesen(&d.pfad, false)?;
        use std::io::Write;
        let mut datei = std::fs::OpenOptions::new().write(true).create_new(true).open(ziel).map_err(fehler)?;
        datei.write_all(&d.daten).map_err(fehler)?;
        datei.sync_all().map_err(fehler)?;
    }
    sperre(&zustand.erlaubt).insert(p.clone());
    crate::projekt::oeffnen(&app, &zustand, &p).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn muster_und_pfade() {
        let tmp = tempfile::tempdir().unwrap();
        let o = tmp.path().canonicalize().unwrap();
        assert!(zip_pfad(&o, "Hafenlichter-2026-10-20-1234.zip", "Hafenlichter").is_ok());
        for n in ["../Hafenlichter-2026-10-20-1234.zip", "/Hafenlichter-2026-10-20-1234.zip", "Hafenlichter-2026-10-20-1234.txt", "Hafenlichter-2026-02-30-1234.zip", "Hafenlichter-2026-10-20-2460.zip", "Anders-2026-10-20-1234.zip"] { assert!(zip_pfad(&o, n, "Hafenlichter").is_err(), "{n}"); }
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_werden_verworfen() {
        let tmp = tempfile::tempdir().unwrap();
        let aussen = tempfile::NamedTempFile::new().unwrap();
        let o = tmp.path().canonicalize().unwrap();
        std::os::unix::fs::symlink(aussen.path(), o.join("Hafenlichter-2026-10-20-1234.zip")).unwrap();
        assert!(zip_pfad(&o, "Hafenlichter-2026-10-20-1234.zip", "Hafenlichter").is_err());
    }
    #[test]
    fn restore_verwirft_traversal_duplikate_und_dateikonflikte() {
        for pfad in ["../x", "/x", "a/../x", "a\\x", "a//x", "projekt.md", "PROJEKT.MD", "projekt.md/x"] {
            let dateien = vec![ArchivDatei { pfad: "projekt.md".into(), daten: vec![] }, ArchivDatei { pfad: pfad.into(), daten: vec![] }];
            assert!(restore_pfade(&dateien).is_err(), "{pfad}");
        }
        assert!(restore_pfade(&[ArchivDatei { pfad: "projekt.md".into(), daten: vec![] }, ArchivDatei { pfad: "recherche/dateien/bild.png".into(), daten: vec![0, 255] }]).is_ok());
    }
}
