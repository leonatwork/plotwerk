//! Dateien außerhalb des Projektordners (Import Word/Markdown/Text, Export .docx/.pdf).
//! Gelesen/geschrieben wird nur, was der native Dialog in dieser Sitzung geliefert hat.

use std::io::Read;
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

#[derive(Serialize)]
pub struct ImportDatei {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inhalt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fehler: Option<String>,
}

#[derive(Serialize)]
pub struct GewaehlterImportOrdner {
    pub name: String,
    pub dateien: Vec<ImportDatei>,
}

fn import_dateiname_erlaubt(name: &str) -> bool {
    if name.starts_with('.') || name.contains(['/', '\\']) {
        return false;
    }
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt"))
}

/// Eine Ebene, keine versteckten Dateien, Unterordner oder Symlinks. Fehler je Datei.
fn lese_import_ordner(ordner: &Path) -> Result<Vec<ImportDatei>, std::io::Error> {
    let mut dateien = Vec::new();
    for eintrag in std::fs::read_dir(ordner)? {
        let eintrag = eintrag?;
        let name = eintrag.file_name().to_string_lossy().into_owned();
        if !import_dateiname_erlaubt(&name) {
            continue;
        }
        let typ = eintrag.file_type();
        if typ.as_ref().is_ok_and(|t| !t.is_file()) {
            continue;
        }
        let daten = typ.and_then(|_| {
            let datei = std::fs::File::open(eintrag.path())?;
            if datei.metadata()?.len() > MAX_GROESSE {
                return Err(std::io::Error::other("Datei zu groß"));
            }
            // Auch bei Wachstum während des Lesens begrenzen.
            let mut bytes = Vec::new();
            datei.take(MAX_GROESSE + 1).read_to_end(&mut bytes)?;
            if bytes.len() as u64 > MAX_GROESSE {
                return Err(std::io::Error::other("Datei zu groß"));
            }
            Ok(bytes)
        });
        let (inhalt, fehler) = match daten {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(text) => (Some(text), None),
                Err(_) => (None, Some("kodierung".into())),
            },
            Err(_) => (None, Some("lesen".into())),
        };
        dateien.push(ImportDatei {
            name,
            inhalt,
            fehler,
        });
    }
    Ok(dateien)
}

/// Ordnerdialog und Lesen in einem Aufruf: kein frei wählbarer externer Pfad aus der Webview.
#[tauri::command]
pub async fn import_ordner_waehlen(
    app: AppHandle,
    fenster: WebviewWindow,
) -> Result<Option<GewaehlterImportOrdner>, String> {
    let Some(gewaehlt) = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title(crate::sprache::t(
            "Importordner wählen",
            "Choose Import Folder",
        ))
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let pfad = gewaehlt
        .into_path()
        .map_err(|e| crate::tf!("Ordner nicht lesbar: {e}", "Folder not readable: {e}"))?;
    let dateien = lese_import_ordner(&pfad)
        .map_err(|e| crate::tf!("Ordner nicht lesbar: {e}", "Folder not readable: {e}"))?;
    Ok(Some(GewaehlterImportOrdner {
        name: pfad
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        dateien,
    }))
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
    filtername_in(crate::sprache::aktuell(), endungen)
}

fn filtername_in(sprache: crate::sprache::Sprache, endungen: &[String]) -> String {
    let en = sprache == crate::sprache::Sprache::En;
    let e: Vec<_> = endungen.iter().map(|e| e.to_lowercase()).collect();
    if e.iter().all(|x| x == "docx") {
        if en { "Word Document" } else { "Word-Dokument" }.into()
    } else if e.iter().all(|x| x == "pdf") {
        "PDF".into()
    } else if e.iter().all(|x| x == "epub") {
        "EPUB".into()
    } else {
        if en { "Document" } else { "Dokument" }.into()
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
        .set_title(crate::sprache::t("Datei wählen", "Choose File"));
    if !endungen.is_empty() {
        let refs: Vec<&str> = endungen.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(filtername(&endungen), &refs);
    }
    let Some(gewaehlt) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let pfad = gewaehlt
        .into_path()
        .map_err(|e| crate::tf!("Datei nicht lesbar: {e}", "File not readable: {e}"))?;
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
        return Err(crate::sprache::t(
            "Diese Datei wurde nicht über den Dialog gewählt.",
            "This file was not chosen in the dialog.",
        )
        .into());
    }
    let meta = std::fs::metadata(&p)
        .map_err(|e| crate::tf!("Datei nicht lesbar: {e}", "File not readable: {e}"))?;
    if meta.len() > MAX_GROESSE {
        return Err(crate::sprache::t(
            "Die Datei ist zu groß (über 200 MB).",
            "The file is too large (over 200 MB).",
        )
        .into());
    }
    let daten = std::fs::read(&p)
        .map_err(|e| crate::tf!("Datei nicht lesbar: {e}", "File not readable: {e}"))?;
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
        .set_title(crate::sprache::t("Exportieren", "Export"))
        .set_file_name(&name)
        .set_can_create_directories(true);
    if let Some(e) = &endung {
        dialog = dialog.add_filter(filtername(std::slice::from_ref(e)), &[e.as_str()]);
    }
    let Some(gewaehlt) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let pfad = gewaehlt.into_path().map_err(|e| {
        crate::tf!(
            "Speicherort nicht verwendbar: {e}",
            "Location not usable: {e}"
        )
    })?;
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
        return Err(crate::sprache::t("Binärdaten erwartet.", "Binary data expected.").into());
    };
    let kodiert = request
        .headers()
        .get("x-pfad")
        .and_then(|v| v.to_str().ok())
        .ok_or(crate::sprache::t("Zielpfad fehlt.", "Target path missing."))?;
    let pfad = percent_decode_str(kodiert)
        .decode_utf8()
        .map_err(|_| crate::sprache::t("Zielpfad ungültig.", "Invalid target path."))?
        .into_owned();
    let p = schluessel(Path::new(&pfad));
    if !sperre(&zustand.extern_schreiben).remove(&p) {
        return Err(crate::sprache::t(
            "Dieser Speicherort wurde nicht über den Dialog gewählt.",
            "This location was not chosen in the dialog.",
        )
        .into());
    }
    schreiben_atomar(&p, daten)
        .map_err(|e| crate::tf!("Datei nicht gespeichert: {e}", "File not saved: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordner_nur_eine_ebene_und_erlaubte_endungen() {
        let tmp = tempfile::tempdir().unwrap();
        for name in [
            "01-ankunft.md",
            "02-ebbe.MARKDOWN",
            "10-flut.TXT",
            ".lotte.md",
            ".DS_Store",
            "flut.docx",
        ] {
            std::fs::write(tmp.path().join(name), "Hafenlichter.").unwrap();
        }
        let unter = tmp.path().join("unter.md");
        std::fs::create_dir(&unter).unwrap();
        std::fs::write(unter.join("lotte.md"), "Hafenlichter.").unwrap();
        let mut namen: Vec<_> = lese_import_ordner(tmp.path())
            .unwrap()
            .into_iter()
            .map(|d| d.name)
            .collect();
        namen.sort();
        assert_eq!(namen, ["01-ankunft.md", "02-ebbe.MARKDOWN", "10-flut.TXT"]);
    }

    #[test]
    fn ordner_meldet_kodierung_und_leere_dateien() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("ebbe.txt"), [0xff, 0xfe]).unwrap();
        std::fs::write(tmp.path().join("flut.md"), "").unwrap();
        let dateien = lese_import_ordner(tmp.path()).unwrap();
        assert_eq!(
            dateien
                .iter()
                .find(|d| d.name == "ebbe.txt")
                .unwrap()
                .fehler
                .as_deref(),
            Some("kodierung")
        );
        assert_eq!(
            dateien
                .iter()
                .find(|d| d.name == "flut.md")
                .unwrap()
                .inhalt
                .as_deref(),
            Some("")
        );
        assert!(lese_import_ordner(&tmp.path().join("fehlt")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn ordner_folgt_keinen_symlinks() {
        let tmp = tempfile::tempdir().unwrap();
        let externes = tempfile::tempdir().unwrap();
        std::fs::write(externes.path().join("lotte.md"), "Hafenlichter.").unwrap();
        std::os::unix::fs::symlink(
            externes.path().join("lotte.md"),
            tmp.path().join("lotte.md"),
        )
        .unwrap();
        assert!(lese_import_ordner(tmp.path()).unwrap().is_empty());
    }

    #[test]
    fn ordner_meldet_lesefehler_und_liest_den_rest() {
        let tmp = tempfile::tempdir().unwrap();
        let datei = std::fs::File::create(tmp.path().join("ebbe.md")).unwrap();
        datei.set_len(MAX_GROESSE + 1).unwrap();
        std::fs::write(tmp.path().join("flut.txt"), "Hafenlichter.\r\n").unwrap();
        let dateien = lese_import_ordner(tmp.path()).unwrap();
        assert_eq!(
            dateien
                .iter()
                .find(|d| d.name == "ebbe.md")
                .unwrap()
                .fehler
                .as_deref(),
            Some("lesen")
        );
        assert_eq!(
            dateien
                .iter()
                .find(|d| d.name == "flut.txt")
                .unwrap()
                .inhalt
                .as_deref(),
            Some("Hafenlichter.\r\n")
        );
    }

    #[test]
    fn filternamen() {
        assert_eq!(filtername(&["docx".into()]), "Word-Dokument");
        assert_eq!(filtername(&["PDF".into()]), "PDF");
        assert_eq!(filtername(&["md".into(), "docx".into()]), "Dokument");
        let en = crate::sprache::Sprache::En;
        assert_eq!(filtername_in(en, &["docx".into()]), "Word Document");
        assert_eq!(filtername_in(en, &["md".into()]), "Document");
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
