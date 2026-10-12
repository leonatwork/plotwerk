//! Dateien außerhalb des Projektordners (Import .docx, Export .docx/.pdf).
//! Gelesen/geschrieben wird nur, was der native Dialog in dieser Sitzung geliefert hat.

use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::dateien::schreiben_atomar;
use crate::Zustand;

/// Import-Dateien größer als das sind sicher kein Manuskript.
const MAX_GROESSE: u64 = 200 * 1024 * 1024;

#[derive(Serialize)]
pub struct GewaehlteDatei {
    pub name: String,
    pub pfad: String,
}

fn sperre<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn schluessel(pfad: &Path) -> PathBuf {
    if let Ok(p) = pfad.canonicalize() {
        return p;
    }
    // Neue Datei (Speichern): Ordner kanonisch + Dateiname
    match (
        pfad.parent().and_then(|o| o.canonicalize().ok()),
        pfad.file_name(),
    ) {
        (Some(o), Some(n)) => o.join(n),
        _ => pfad.to_path_buf(),
    }
}

fn filtername(endungen: &[String]) -> String {
    let e: Vec<_> = endungen.iter().map(|e| e.to_lowercase()).collect();
    if e.iter().all(|x| x == "docx") {
        "Word-Dokument".into()
    } else if e.iter().all(|x| x == "pdf") {
        "PDF".into()
    } else {
        "Dokument".into()
    }
}

/// Öffnen-Dialog mit Endungsfilter (z. B. ["docx"]). None = abgebrochen.
#[tauri::command]
pub async fn datei_waehlen(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
    endungen: Vec<String>,
) -> Result<Option<GewaehlteDatei>, String> {
    let endungen: Vec<String> = endungen
        .iter()
        .map(|e| e.trim().trim_start_matches('.').to_string())
        .filter(|e| !e.is_empty())
        .collect();
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title("Datei wählen");
    if !endungen.is_empty() {
        let refs: Vec<&str> = endungen.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(filtername(&endungen), &refs);
    }
    let Some(gewaehlt) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let pfad = gewaehlt
        .into_path()
        .map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    sperre(&zustand.extern_lesen).insert(schluessel(&pfad));
    Ok(Some(GewaehlteDatei {
        name: pfad
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        pfad: pfad.to_string_lossy().into_owned(),
    }))
}

/// Inhalt einer vom Dialog gelieferten Datei (einmalig) als Binärdaten.
#[tauri::command]
pub async fn datei_lesen_extern(
    zustand: State<'_, Zustand>,
    pfad: String,
) -> Result<Response, String> {
    let p = schluessel(Path::new(&pfad));
    if !sperre(&zustand.extern_lesen).remove(&p) {
        return Err("Diese Datei wurde nicht über den Dialog gewählt.".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    if meta.len() > MAX_GROESSE {
        return Err("Die Datei ist zu groß (über 200 MB).".into());
    }
    let daten = std::fs::read(&p).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    Ok(Response::new(daten))
}

/// Speichern-Dialog mit Vorschlag (z. B. „Hafenlichter.docx“). None = abgebrochen.
#[tauri::command]
pub async fn datei_speichern(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
    vorschlag: String,
) -> Result<Option<String>, String> {
    let name = vorschlag.replace(['/', ':', '\\'], "-");
    let endung = Path::new(&name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .filter(|e| !e.is_empty());
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title("Exportieren")
        .set_file_name(&name)
        .set_can_create_directories(true);
    if let Some(e) = &endung {
        dialog = dialog.add_filter(filtername(std::slice::from_ref(e)), &[e.as_str()]);
    }
    let Some(gewaehlt) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let pfad = gewaehlt
        .into_path()
        .map_err(|e| format!("Speicherort nicht verwendbar: {e}"))?;
    sperre(&zustand.extern_schreiben).insert(schluessel(&pfad));
    Ok(Some(pfad.to_string_lossy().into_owned()))
}

/// Schreibt Binärdaten (Request-Body) an einen vom Speichern-Dialog gelieferten Pfad.
/// Der Pfad steht URL-kodiert in der Kopfzeile `x-pfad`.
#[tauri::command]
pub async fn datei_schreiben_extern(
    zustand: State<'_, Zustand>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(daten) = request.body() else {
        return Err("Binärdaten erwartet.".into());
    };
    let kodiert = request
        .headers()
        .get("x-pfad")
        .and_then(|v| v.to_str().ok())
        .ok_or("Zielpfad fehlt.")?;
    let pfad = percent_decode_str(kodiert)
        .decode_utf8()
        .map_err(|_| "Zielpfad ungültig.")?
        .into_owned();
    let p = schluessel(Path::new(&pfad));
    if !sperre(&zustand.extern_schreiben).remove(&p) {
        return Err("Dieser Speicherort wurde nicht über den Dialog gewählt.".into());
    }
    schreiben_atomar(&p, daten).map_err(|e| format!("Datei nicht gespeichert: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filternamen() {
        assert_eq!(filtername(&["docx".into()]), "Word-Dokument");
        assert_eq!(filtername(&["PDF".into()]), "PDF");
        assert_eq!(filtername(&["md".into(), "docx".into()]), "Dokument");
    }

    #[test]
    fn schluessel_fuer_neue_datei() {
        let tmp = tempfile::tempdir().unwrap();
        let neu = tmp.path().join("Export.pdf");
        assert_eq!(
            schluessel(&neu),
            tmp.path().canonicalize().unwrap().join("Export.pdf")
        );
    }
}
