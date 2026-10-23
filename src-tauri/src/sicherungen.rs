//! Enge Archivgrenze: Ziele ausschließlich aus App-Ordner oder eigener nativer Ordnerwahl.
//! Keine Erweiterung der fs_*-Freigaben. ZIP-Aufbau und Rotation liegen in core/sicherungen.

use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use crate::projekt::{einstellungsdatei, sperre, ProjektInfo};
use crate::{einstellungen, Zustand};

pub const ORT: &str = "sicherungsOrdner";
pub const WURZELN: &str = "sicherungsWurzeln";
pub const PROJEKTE: &str = "sicherungsProjekte";
const OPTIONEN: &str = "sicherungen";
const MAX_BYTES: usize = 2 * 1024 * 1024 * 1024;

#[derive(Clone)]
struct Sicherungsziel { ordner: PathBuf, projekt: PathBuf, name: String }
#[derive(Default)]
pub struct Ziele { naechste: u32, liste: HashMap<u32, Sicherungsziel> }
#[derive(Serialize)]
pub struct Vorbereitet { ziel: u32, namen: Vec<String> }

/// Sitzungseigene Capability: Einstellungen während eines Laufs können sein Ziel nicht verschieben.
fn festes_ziel(zustand: &Zustand, id: u32, anlegen: bool) -> Result<Sicherungsziel, String> {
    let z = sperre(&zustand.sicherungsziele).liste.get(&id).cloned().ok_or_else(ungueltig)?;
    let mut vorfahr = z.ordner.as_path();
    while !vorfahr.exists() { vorfahr = vorfahr.parent().ok_or_else(ungueltig)?; }
    let echt = vorfahr.canonicalize().map_err(fehler)?;
    if echt != vorfahr || echt.starts_with(&z.projekt) { return Err(ungueltig()); }
    if anlegen {
        fs::create_dir_all(&z.ordner).map_err(fehler)?;
        if z.ordner.canonicalize().map_err(fehler)? != z.ordner { return Err(ungueltig()); }
    }
    Ok(z)
}

fn fehler(e: impl std::fmt::Display) -> String {
    crate::tf!("Archivoperation fehlgeschlagen: {e}", "Archive operation failed: {e}")
}
fn ungueltig() -> String {
    crate::sprache::t("Unsicherer Sicherungspfad oder Dateiname.", "Unsafe backup path or filename.").into()
}

/// Identisch mit projektName in TypeScript, auch für Nicht-ASCII und leere Namen.
fn projekt_name(name: &str) -> String {
    let mut ergebnis = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            ergebnis.push(c.to_ascii_lowercase());
        } else if !ergebnis.is_empty() && !ergebnis.ends_with('-') {
            ergebnis.push('-');
        }
    }
    let s = ergebnis.trim_end_matches('-');
    if s.is_empty() { "projekt".into() } else { s.into() }
}

/// Keine Regex-Abhängigkeit; strikte Kalenderprüfung und optionaler Kollisionszähler ≥ 2.
fn name_erlaubt(name: &str, projekt: &str) -> bool {
    let prefix = format!("{}-", projekt_name(projekt));
    let Some(rest) = name.strip_prefix(&prefix).and_then(|s| s.strip_suffix(".zip")) else { return false; };
    let t: Vec<_> = rest.split('-').collect();
    if !(t.len() == 4 || t.len() == 5) || t[0].len() != 4 || t[1].len() != 2 || t[2].len() != 2 || t[3].len() != 4
        || !t.iter().all(|s| s.bytes().all(|b| b.is_ascii_digit())) { return false; }
    if t.len() == 5 && (t[4].starts_with('0') || t[4].parse::<u32>().unwrap_or(0) < 2) { return false; }
    let jahr = t[0].parse::<u32>().unwrap_or(0);
    let monat = t[1].parse::<usize>().unwrap_or(0);
    let tag = t[2].parse::<u32>().unwrap_or(0);
    if jahr < 1000 || !(1..=12).contains(&monat) { return false; }
    let schaltjahr = jahr % 4 == 0 && (jahr % 100 != 0 || jahr % 400 == 0);
    let tage = [31, if schaltjahr { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    tag > 0 && tag <= tage[monat - 1] && t[3][..2].parse::<u32>().unwrap_or(99) <= 23 && t[3][2..].parse::<u32>().unwrap_or(99) <= 59
}
fn archiv_name(name: &str) -> bool {
    name.match_indices('-').any(|(i, _)| name_erlaubt(name, &name[..i]))
}
fn ziel(ordner: &Path, name: &str, projekt: &str) -> Result<PathBuf, String> {
    if !name_erlaubt(name, projekt) { return Err(ungueltig()); }
    let p = ordner.join(name);
    if let Ok(m) = fs::symlink_metadata(&p) {
        if !m.is_file() || m.file_type().is_symlink() { return Err(ungueltig()); }
    }
    Ok(p)
}

fn lesen_wert(app: &AppHandle, zustand: &Zustand, key: &str) -> Result<Option<serde_json::Value>, String> {
    let _s = sperre(&zustand.einstellungen);
    Ok(einstellungen::lesen(&einstellungsdatei(app)?, key))
}
fn schreiben_wert(app: &AppHandle, zustand: &Zustand, key: &str, wert: serde_json::Value) -> Result<(), String> {
    let _s = sperre(&zustand.einstellungen);
    einstellungen::schreiben(&einstellungsdatei(app)?, key, wert)
}
fn basis(app: &AppHandle, zustand: &Zustand) -> Result<PathBuf, String> {
    if let Some(s) = lesen_wert(app, zustand, ORT)?.and_then(|v| v.as_str().map(str::to_string)) {
        let p = PathBuf::from(s);
        // Gemerkte kanonische Freigabe darf nach einem Austausch nicht auf ein anderes Ziel zeigen.
        if p.canonicalize().map_err(fehler)? != p { return Err(ungueltig()); }
        Ok(p)
    } else {
        Ok(app.path().app_data_dir().map_err(fehler)?.join("Sicherungen"))
    }
}
fn projekt_ordner(app: &AppHandle, zustand: &Zustand, kennung: u32, anlegen: bool) -> Result<(PathBuf, String), String> {
    let w = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let name = w.pfad().file_name().unwrap_or_default().to_string_lossy().into_owned();
    // Standard bleibt <Projekt>; nur bei gleichen Namen anderer Projekte disambiguieren.
    let mut projekte: HashMap<String, String> = lesen_wert(app, zustand, PROJEKTE)?.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    let identitaet = w.pfad().to_string_lossy().into_owned();
    let hash = w.pfad().to_string_lossy().bytes().fold(2166136261u32, |h, b| (h ^ u32::from(b)).wrapping_mul(16777619));
    let slug = projekt_name(&name);
    let mut teil = projekte.get(&identitaet).cloned().unwrap_or_else(|| slug.clone());
    if !projekte.contains_key(&identitaet) {
        let mut nummer = 1u32;
        while projekte.values().any(|n| n == &teil) {
            teil = if nummer == 1 { format!("{slug}-{hash:08x}") } else { format!("{slug}-{hash:08x}-{nummer}") };
            nummer = nummer.checked_add(1).ok_or_else(ungueltig)?;
        }
    }
    if projekt_name(&teil) != teil { return Err(ungueltig()); }
    let b = basis(app, zustand)?;
    let ordner = b.join(&teil);
    // Prüfe vorhandene Vorfahren auch vor create_dir_all (kein Schreiben ins Projekt).
    let mut vorfahr = ordner.as_path();
    while !vorfahr.exists() { vorfahr = vorfahr.parent().ok_or_else(ungueltig)?; }
    let kanonisch = vorfahr.canonicalize().map_err(fehler)?;
    if kanonisch.starts_with(w.pfad()) || (vorfahr != kanonisch && vorfahr.starts_with(&b)) { return Err(ungueltig()); }
    if anlegen {
        fs::create_dir_all(&ordner).map_err(fehler)?;
        if ordner.canonicalize().map_err(fehler)? != ordner { return Err(ungueltig()); }
    }
    projekte.insert(identitaet, teil);
    schreiben_wert(app, zustand, PROJEKTE, serde_json::json!(projekte))?;
    Ok((ordner, name))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Optionen { automatisch: bool, mit_versionen: bool, ordner: Option<String> }
#[tauri::command]
pub async fn sicherung_einstellungen(app: AppHandle, zustand: State<'_, Zustand>) -> Result<Optionen, String> {
    let v = lesen_wert(&app, &zustand, OPTIONEN)?.unwrap_or_default();
    Ok(Optionen { automatisch: v.get("automatisch").and_then(|v| v.as_bool()).unwrap_or(true), mit_versionen: v.get("mitVersionen").and_then(|v| v.as_bool()).unwrap_or(false), ordner: lesen_wert(&app, &zustand, ORT)?.and_then(|v| v.as_str().map(str::to_string)) })
}
#[tauri::command]
pub async fn sicherung_einstellen(app: AppHandle, zustand: State<'_, Zustand>, automatisch: bool, mit_versionen: bool) -> Result<(), String> {
    schreiben_wert(&app, &zustand, OPTIONEN, serde_json::json!({ "automatisch": automatisch, "mitVersionen": mit_versionen }))
}
#[tauri::command]
pub async fn sicherung_ordner_waehlen(app: AppHandle, fenster: WebviewWindow, zustand: State<'_, Zustand>) -> Result<Option<String>, String> {
    let Some(p) = app.dialog().file().set_parent(&fenster).set_title(crate::sprache::t("Sicherungsordner wählen", "Choose Backup Folder")).set_can_create_directories(true).blocking_pick_folder() else { return Ok(None); };
    let p = p.into_path().map_err(fehler)?.canonicalize().map_err(fehler)?;
    let w = sperre(&zustand.projekte).wurzel(None).ok();
    if w.is_some_and(|w| p.starts_with(w.pfad())) { return Err(ungueltig()); }
    let text = p.to_string_lossy().into_owned();
    let mut wurzeln: Vec<String> = lesen_wert(&app, &zustand, WURZELN)?.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    if !wurzeln.contains(&text) { wurzeln.push(text.clone()); }
    schreiben_wert(&app, &zustand, WURZELN, serde_json::json!(wurzeln))?;
    schreiben_wert(&app, &zustand, ORT, serde_json::json!(text))?;
    Ok(Some(text))
}
#[tauri::command]
pub async fn sicherung_standard(app: AppHandle, zustand: State<'_, Zustand>) -> Result<(), String> {
    schreiben_wert(&app, &zustand, ORT, serde_json::Value::Null)
}

#[tauri::command]
pub async fn sicherung_projekt_auflisten(zustand: State<'_, Zustand>, kennung: u32, mit_versionen: bool) -> Result<Vec<String>, String> {
    let w = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut pfade = Vec::new();
        projekt_sammeln(&w, w.pfad(), mit_versionen, &mut pfade)?;
        pfade.sort();
        Ok(pfade)
    }).await.map_err(fehler)?
}
/// Im Gegensatz zur allgemeinen Projektauflistung keine I/O-Fehler überspringen: keine stillen Teilarchive.
fn projekt_sammeln(w: &crate::pfad::Wurzel, ordner: &Path, mit_versionen: bool, pfade: &mut Vec<String>) -> Result<(), String> {
    for e in fs::read_dir(ordner).map_err(fehler)? {
        let e = e.map_err(fehler)?;
        let name = e.file_name().into_string().map_err(|_| ungueltig())?;
        if name == ".DS_Store" || name.starts_with("._") || name.ends_with(".tmp") || name.ends_with(".temp") || name.ends_with('~') || (!mit_versionen && ordner == w.pfad() && name == ".versionen") { continue; }
        let p = e.path();
        let rel = w.relativ(&p).ok_or_else(ungueltig)?;
        let typ = e.file_type().map_err(fehler)?;
        if typ.is_dir() {
            projekt_sammeln(w, &p, mit_versionen, pfade)?;
        } else if typ.is_file() {
            pfade.push(rel);
        } else if typ.is_symlink() && w.aufloesen(&rel, false)?.is_file() {
            pfade.push(rel);
        } else {
            return Err(crate::tf!("Nicht unterstützte Projektdatei: {rel}", "Unsupported project file: {rel}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn sicherung_projekt_lesen(zustand: State<'_, Zustand>, kennung: u32, pfad: String) -> Result<tauri::ipc::Response, String> {
    let w = sperre(&zustand.projekte).wurzel(Some(kennung))?;
    let p = w.aufloesen(&pfad, false)?;
    if fs::metadata(&p).map_err(fehler)?.len() > MAX_BYTES as u64 {
        return Err(crate::sprache::t("Projektdatei ist zu groß (maximal 2 GB).", "Project file is too large (maximum 2 GB).").into());
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || fs::read(p).map_err(fehler)).await.map_err(fehler)??;
    Ok(tauri::ipc::Response::new(bytes))
}
fn liste(ordner: &Path, projekt: Option<&str>) -> Result<Vec<String>, String> {
    if !ordner.exists() { return Ok(vec![]); }
    let mut namen = Vec::new();
    for e in fs::read_dir(ordner).map_err(fehler)? {
        let e = e.map_err(fehler)?;
        let name = e.file_name().to_string_lossy().into_owned();
        if e.file_type().map_err(fehler)?.is_file()
            && projekt.map_or_else(|| archiv_name(&name), |p| name_erlaubt(&name, p))
            && zip_vollstaendig(&e.path())?
        {
            namen.push(name);
        }
    }
    namen.sort();
    Ok(namen)
}
/// Nach einem Prozessabbruch bleibt ggf. eine create_new-Datei zurück. Sie zählt nie als Tagesstand.
fn zip_vollstaendig(pfad: &Path) -> Result<bool, String> {
    let mut f = fs::File::open(pfad).map_err(fehler)?;
    let len = f.metadata().map_err(fehler)?.len();
    if len < 22 || len > MAX_BYTES as u64 { return Ok(false); }
    let n = len.min(65557) as usize;
    f.seek(SeekFrom::End(-(n as i64))).map_err(fehler)?;
    let mut ende = vec![0u8; n];
    f.read_exact(&mut ende).map_err(fehler)?;
    for i in (0..=n - 22).rev() {
        if &ende[i..i + 4] == b"PK\x05\x06" {
            let kommentar = u16::from_le_bytes([ende[i + 20], ende[i + 21]]) as usize;
            if i + 22 + kommentar == n {
                let zentral = u32::from_le_bytes(ende[i + 16..i + 20].try_into().map_err(fehler)?) as u64;
                let groesse = u32::from_le_bytes(ende[i + 12..i + 16].try_into().map_err(fehler)?) as u64;
                return Ok(zentral + groesse == len - n as u64 + i as u64);
            }
        }
    }
    Ok(false)
}
#[tauri::command]
pub async fn sicherung_auflisten(app: AppHandle, zustand: State<'_, Zustand>, kennung: u32) -> Result<Vorbereitet, String> {
    let _s = sperre(&zustand.sicherungen);
    let (ordner, name) = projekt_ordner(&app, &zustand, kennung, false)?;
    let namen = liste(&ordner, Some(&name))?;
    let projekt = sperre(&zustand.projekte).wurzel(Some(kennung))?.pfad().to_path_buf();
    let mut ziele = sperre(&zustand.sicherungsziele);
    ziele.naechste = ziele.naechste.checked_add(1).ok_or_else(ungueltig)?;
    let id = ziele.naechste;
    ziele.liste.insert(id, Sicherungsziel { ordner, projekt, name });
    Ok(Vorbereitet { ziel: id, namen })
}
fn neu_schreiben(ordner: &Path, name: &str, projekt: &str, daten: &[u8]) -> Result<String, String> {
    if daten.len() > MAX_BYTES || !daten.starts_with(b"PK\x03\x04") { return Err(ungueltig()); }
    let mut nummer = 1u32;
    loop {
        let kandidat = if nummer == 1 { name.into() } else { format!("{}-{nummer}.zip", name.strip_suffix(".zip").ok_or_else(ungueltig)?) };
        let p = ziel(ordner, &kandidat, projekt)?;
        match OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => {
                if let Err(e) = f.write_all(daten).and_then(|_| f.sync_all()) { let _ = fs::remove_file(&p); return Err(fehler(e)); }
                return Ok(kandidat);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => { nummer = nummer.checked_add(1).ok_or_else(ungueltig)?; }
            Err(e) => return Err(fehler(e)),
        }
    }
}
#[tauri::command]
pub async fn sicherung_schreiben(zustand: State<'_, Zustand>, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(daten) = request.body() else { return Err(ungueltig()); };
    let id = request.headers().get("plotwerk-ziel").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).ok_or_else(ungueltig)?;
    let name = request.headers().get("plotwerk-name").and_then(|v| v.to_str().ok()).ok_or_else(ungueltig)?.to_string();
    if daten.len() > MAX_BYTES || !daten.starts_with(b"PK\x03\x04") { return Err(ungueltig()); }
    let z = {
        let _s = sperre(&zustand.sicherungen);
        let z = festes_ziel(&zustand, id, false)?;
        if !name_erlaubt(&name, &z.name) { return Err(ungueltig()); }
        festes_ziel(&zustand, id, true)?
    };
    let daten = daten.to_vec();
    let mutex = zustand.sicherungen.clone();
    tauri::async_runtime::spawn_blocking(move || { let _s = sperre(&mutex); neu_schreiben(&z.ordner, &name, &z.name, &daten) }).await.map_err(fehler)?
}
#[tauri::command]
pub async fn sicherung_entfernen(zustand: State<'_, Zustand>, ziel: u32, name: String) -> Result<(), String> {
    let _s = sperre(&zustand.sicherungen);
    let z = festes_ziel(&zustand, ziel, false)?;
    let p = self::ziel(&z.ordner, &name, &z.name)?;
    if !zip_vollstaendig(&p)? { return Err(ungueltig()); }
    fs::remove_file(p).map_err(fehler)
}
#[derive(Serialize)]
pub struct Eintrag { ordner: String, name: String }
fn alle(app: &AppHandle, zustand: &Zustand) -> Result<Vec<Eintrag>, String> {
    let mut wurzeln: Vec<String> = lesen_wert(app, zustand, WURZELN)?.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    wurzeln.push(app.path().app_data_dir().map_err(fehler)?.join("Sicherungen").to_string_lossy().into_owned());
    let mut ergebnis = Vec::new();
    for w in wurzeln {
        let w = PathBuf::from(w);
        if !w.exists() { continue; }
        if w.canonicalize().map_err(fehler)? != w { return Err(ungueltig()); }
        for e in fs::read_dir(&w).map_err(fehler)? {
            let e = e.map_err(fehler)?;
            if !e.file_type().map_err(fehler)?.is_dir() { continue; }
            for name in liste(&e.path(), None)? { ergebnis.push(Eintrag { ordner: e.path().to_string_lossy().into_owned(), name }); }
        }
    }
    ergebnis.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(ergebnis)
}
#[tauri::command]
pub async fn sicherung_alle(app: AppHandle, zustand: State<'_, Zustand>) -> Result<Vec<Eintrag>, String> {
    let _s = sperre(&zustand.sicherungen);
    alle(&app, &zustand)
}
#[tauri::command]
pub async fn sicherung_lesen(app: AppHandle, zustand: State<'_, Zustand>, ordner: String, name: String) -> Result<tauri::ipc::Response, String> {
    let _s = sperre(&zustand.sicherungen);
    if !alle(&app, &zustand)?.iter().any(|e| e.ordner == ordner && e.name == name) { return Err(ungueltig()); }
    let p = PathBuf::from(ordner).join(name);
    if fs::metadata(&p).map_err(fehler)?.len() > MAX_BYTES as u64 { return Err(ungueltig()); }
    Ok(tauri::ipc::Response::new(fs::read(p).map_err(fehler)?))
}

pub struct ArchivDatei<'a> { pfad: &'a str, daten: &'a [u8] }

/// PWR1 aus TypeScript. Dateibytes bleiben Ansichten des IPC-Bodys statt weiterer Kopien.
fn body_dateien(body: &[u8]) -> Result<Vec<ArchivDatei<'_>>, String> {
    fn nehmen<'a>(rest: &mut &'a [u8], n: usize) -> Result<&'a [u8], String> {
        let teil = rest.get(..n).ok_or_else(ungueltig)?;
        *rest = &rest[n..];
        Ok(teil)
    }
    let mut rest = body.strip_prefix(b"PWR1").ok_or_else(ungueltig)?;
    let mut dateien = Vec::new();
    while !rest.is_empty() {
        let kopf = nehmen(&mut rest, 8)?;
        let pfad_len = u32::from_le_bytes(kopf[..4].try_into().map_err(fehler)?) as usize;
        let daten_len = u32::from_le_bytes(kopf[4..].try_into().map_err(fehler)?) as usize;
        let pfad = std::str::from_utf8(nehmen(&mut rest, pfad_len)?).map_err(fehler)?;
        let daten = nehmen(&mut rest, daten_len)?;
        dateien.push(ArchivDatei { pfad, daten });
    }
    dateien_pruefen(&dateien)?;
    Ok(dateien)
}

fn dateien_pruefen(dateien: &[ArchivDatei<'_>]) -> Result<(), String> {
    let mut gesehen = HashSet::new();
    let mut groesse = 0usize;
    for d in dateien {
        if d.pfad.is_empty() || d.pfad.starts_with('/') || d.pfad.chars().any(|c| c.is_control() || c == '\\' || c == ':') || d.pfad.split('/').any(|t| t.is_empty() || t == "." || t == "..") || !gesehen.insert(d.pfad) { return Err(ungueltig()); }
        groesse = groesse.checked_add(d.daten.len()).ok_or_else(ungueltig)?;
        if groesse > MAX_BYTES { return Err(ungueltig()); }
    }
    if !gesehen.contains("projekt.md") { return Err(ungueltig()); }
    Ok(())
}
/// In eigenem Geschwisterordner aufbauen und per portablem rename veröffentlichen.
/// rename ersetzt nur leere Ordner; konkurrierend angelegte Inhalte bleiben erhalten.
fn entpacken(ziel: &Path, dateien: &[ArchivDatei<'_>]) -> Result<(), String> {
    dateien_pruefen(dateien)?;
    if ziel.exists() {
        if fs::symlink_metadata(ziel).map_err(fehler)?.file_type().is_symlink() || !ziel.is_dir() || fs::read_dir(ziel).map_err(fehler)?.next().is_some() { return Err(ungueltig()); }
    }
    let eltern = ziel.parent().ok_or_else(ungueltig)?.canonicalize().map_err(fehler)?;
    let mut nummer = 0u32;
    let staging = loop {
        let p = eltern.join(format!(".plotwerk-wiederherstellen-{}-{nummer}.tmp", std::process::id()));
        match fs::create_dir(&p) {
            Ok(()) => break p,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => { nummer = nummer.checked_add(1).ok_or_else(ungueltig)?; }
            Err(e) => return Err(fehler(e)),
        }
    };
    let w = crate::pfad::Wurzel::neu(&staging)?;
    let resultat = (|| {
        for d in dateien {
            let p = w.aufloesen(d.pfad, false)?;
            fs::create_dir_all(p.parent().ok_or_else(ungueltig)?).map_err(fehler)?;
            // Symlinks auch innerhalb der Zielwurzel verweigern.
            let mut teil = staging.clone();
            for t in d.pfad.split('/') { teil.push(t); if fs::symlink_metadata(&teil).is_ok_and(|m| m.file_type().is_symlink()) { return Err(ungueltig()); } }
            let mut f = OpenOptions::new().write(true).create_new(true).open(&p).map_err(fehler)?;
            f.write_all(d.daten).and_then(|_| f.sync_all()).map_err(fehler)?;
        }
        if ziel.exists() && (fs::symlink_metadata(ziel).map_err(fehler)?.file_type().is_symlink() || !ziel.is_dir() || fs::read_dir(ziel).map_err(fehler)?.next().is_some()) { return Err(ungueltig()); }
        fs::rename(&staging, ziel).map_err(fehler)?;
        Ok(())
    })();
    if resultat.is_err() { let _ = fs::remove_dir_all(staging); }
    resultat
}
#[tauri::command]
pub async fn sicherung_wiederherstellen(app: AppHandle, fenster: WebviewWindow, zustand: State<'_, Zustand>, request: tauri::ipc::Request<'_>) -> Result<Option<ProjektInfo>, String> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else { return Err(ungueltig()); };
    body_dateien(body)?;
    let Some(p) = app.dialog().file().set_parent(&fenster).set_title(crate::sprache::t("Neuen, leeren Projektordner wählen", "Choose a New, Empty Project Folder")).set_can_create_directories(true).blocking_pick_folder() else { return Ok(None); };
    let p = p.into_path().map_err(fehler)?;
    let ziel = p.clone();
    let body = body.to_vec();
    tauri::async_runtime::spawn_blocking(move || {
        let dateien = body_dateien(&body)?;
        entpacken(&ziel, &dateien)
    }).await.map_err(fehler)??;
    crate::projekt::oeffnen(&app, &zustand, &p).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn binaerer_body_ohne_dateikopien_und_bytegleiches_entpacken() {
        // Identischer erster Datensatz wie im TypeScript-IPC-Vertragstest.
        let mut body = vec![
            80, 87, 82, 49, 10, 0, 0, 0, 3, 0, 0, 0,
            112, 114, 111, 106, 101, 107, 116, 46, 109, 100, 0, 255, 128,
        ];
        let pfad = "recherche/dateien/büro 🖼.png";
        body.extend_from_slice(&(pfad.len() as u32).to_le_bytes());
        body.extend_from_slice(&2u32.to_le_bytes());
        body.extend_from_slice(pfad.as_bytes());
        body.extend_from_slice(&[128, 255]);
        let leer = ".plotwerk/leer.json";
        body.extend_from_slice(&(leer.len() as u32).to_le_bytes());
        body.extend_from_slice(&0u32.to_le_bytes());
        body.extend_from_slice(leer.as_bytes());
        let dateien = body_dateien(&body).unwrap();
        assert_eq!(dateien.len(), 3);
        assert_eq!(dateien[0].daten, &[0, 255, 128]);
        assert_eq!(dateien[0].daten.as_ptr(), body[22..].as_ptr());
        assert_eq!(dateien[1].pfad, pfad);
        assert!(dateien[2].daten.is_empty());
        let ziel = tempfile::tempdir().unwrap();
        entpacken(ziel.path(), &dateien).unwrap();
        assert_eq!(fs::read(ziel.path().join("projekt.md")).unwrap(), [0, 255, 128]);
        assert_eq!(fs::read(ziel.path().join(pfad)).unwrap(), [128, 255]);
        assert!(fs::read(ziel.path().join(leer)).unwrap().is_empty());
    }

    #[test]
    fn binaerer_body_verweigert_beschaedigung_und_unsichere_pfade() {
        let body = [
            80, 87, 82, 49, 10, 0, 0, 0, 3, 0, 0, 0,
            112, 114, 111, 106, 101, 107, 116, 46, 109, 100, 0, 255, 128,
        ];
        for ende in 0..body.len() {
            assert!(body_dateien(&body[..ende]).is_err());
        }
        let mut falsch = body.to_vec();
        falsch[0] = 0;
        assert!(body_dateien(&falsch).is_err());
        falsch = body.to_vec();
        falsch[12] = 255; // ungültiges UTF-8
        assert!(body_dateien(&falsch).is_err());
        falsch = body.to_vec();
        falsch[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(body_dateien(&falsch).is_err());
        falsch = body.to_vec();
        falsch[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(body_dateien(&falsch).is_err());
        for pfad in ["../x", "/x", "a/../b", "C:/x", "a\\b", "projekt.md"] {
            let mut falsch = body.to_vec();
            falsch.extend_from_slice(&(pfad.len() as u32).to_le_bytes());
            falsch.extend_from_slice(&0u32.to_le_bytes());
            falsch.extend_from_slice(pfad.as_bytes());
            // Auch doppelte projekt.md darf nicht still überschrieben werden.
            assert!(body_dateien(&falsch).is_err());
        }
    }

    #[test]
    fn namen_und_pfade() {
        assert_eq!(projekt_name("Hafenlichter / ÄÖü : Test"), "hafenlichter-test");
        assert_eq!(projekt_name("..."), "projekt");
        assert!(name_erlaubt("hafenlichter-2026-10-23-0905.zip", "Hafenlichter"));
        assert!(name_erlaubt("hafenlichter-2026-10-23-0905-2.zip", "Hafenlichter"));
        assert!(name_erlaubt("hafenlichter-2024-02-29-2359.zip", "Hafenlichter"));
        for n in ["../hafenlichter-2026-10-23-0905.zip", "/hafenlichter-2026-10-23-0905.zip", "hafenlichter-2026-10-23-0905.txt", "hafenlichter-2026-02-30-0905.zip", "hafenlichter-2026-10-23-2560.zip", "hafenlichter-2026-10-23-0905-01.zip", "fremd-2026-10-23-0905.zip"] { assert!(!name_erlaubt(n, "Hafenlichter"), "{n}"); }
    }
    #[test]
    fn schreibt_neu_ohne_hardlinks_und_ohne_ueberschreiben() {
        let tmp = tempfile::tempdir().unwrap();
        let n = "hafenlichter-2026-10-23-0905.zip";
        assert_eq!(neu_schreiben(tmp.path(), n, "Hafenlichter", b"PK\x03\x04alt").unwrap(), n);
        assert_eq!(neu_schreiben(tmp.path(), n, "Hafenlichter", b"PK\x03\x04neu").unwrap(), "hafenlichter-2026-10-23-0905-2.zip");
        assert_eq!(fs::read(tmp.path().join(n)).unwrap(), b"PK\x03\x04alt");
        assert!(ziel(tmp.path(), "../x.zip", "Hafenlichter").is_err());
    }
    #[test]
    fn symlinks_und_nichtleere_ziele() {
        let tmp = tempfile::tempdir().unwrap();
        let ausserhalb = tempfile::tempdir().unwrap();
        let n = "hafenlichter-2026-10-23-0905.zip";
        std::os::unix::fs::symlink(ausserhalb.path().join("x.zip"), tmp.path().join(n)).unwrap();
        assert!(ziel(tmp.path(), n, "Hafenlichter").is_err());
        let d = vec![ArchivDatei { pfad: "projekt.md", daten: b"stand" }];
        assert!(entpacken(tmp.path(), &d).is_err());
        let leer = tempfile::tempdir().unwrap();
        entpacken(leer.path(), &d).unwrap();
        assert_eq!(fs::read(leer.path().join("projekt.md")).unwrap(), b"stand");
        assert!(entpacken(leer.path(), &d).is_err());
        for p in ["../x", "/x", "a/../b", "C:/x", "a\\b"] { assert!(dateien_pruefen(&[ArchivDatei { pfad: p, daten: &[] }]).is_err()); }
    }
    #[test]
    fn strikte_projektauflistung() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join(".plotwerk")).unwrap();
        fs::create_dir(tmp.path().join(".versionen")).unwrap();
        fs::write(tmp.path().join("projekt.md"), "stand").unwrap();
        fs::write(tmp.path().join(".plotwerk/hinweise.json"), "{}").unwrap();
        fs::write(tmp.path().join(".versionen/alt.md"), "alt").unwrap();
        fs::write(tmp.path().join(".projekt.md.plotwerk-1-2.tmp"), "temp").unwrap();
        let w = crate::pfad::Wurzel::neu(tmp.path()).unwrap();
        let mut pfade = Vec::new();
        projekt_sammeln(&w, w.pfad(), false, &mut pfade).unwrap();
        pfade.sort();
        assert_eq!(pfade, vec![".plotwerk/hinweise.json", "projekt.md"]);
        std::os::unix::fs::symlink(tmp.path().join(".plotwerk"), tmp.path().join("verweis")).unwrap();
        assert!(projekt_sammeln(&w, w.pfad(), true, &mut Vec::new()).is_err());
    }
    #[test]
    fn teilarchive_zaehlen_nicht_und_restaurierungsfehler_lassen_das_ziel_leer() {
        let tmp = tempfile::tempdir().unwrap();
        let n = "hafenlichter-2026-10-23-0905.zip";
        fs::write(tmp.path().join(n), b"PK\x03\x04abgebrochen").unwrap();
        assert!(liste(tmp.path(), Some("Hafenlichter")).unwrap().is_empty());
        let leer = tempfile::tempdir().unwrap();
        let d = vec![
            ArchivDatei { pfad: "projekt.md", daten: b"stand" },
            ArchivDatei { pfad: "a", daten: &[] },
            ArchivDatei { pfad: "a/b", daten: &[] },
        ];
        assert!(entpacken(leer.path(), &d).is_err());
        assert!(fs::read_dir(leer.path()).unwrap().next().is_none());
    }
}
