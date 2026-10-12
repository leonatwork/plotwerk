//! Projektordner öffnen/anlegen und die fs_*-Kommandos.
//!
//! Jeder geöffnete Ordner bekommt eine Kennung. Die Oberfläche gibt sie bei jedem
//! fs_*-Aufruf mit, damit ausstehende Schreibvorgänge nach einem Projektwechsel nie im
//! neuen Projekt landen. Ohne Kennung gilt das zuletzt geöffnete Projekt.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::pfad::Wurzel;
use crate::{dateien, einstellungen, ueberwachung, Zustand};

#[derive(Default)]
pub struct Projekte {
    liste: HashMap<u32, Wurzel>,
    aktuell: Option<u32>,
    naechste: u32,
}

impl Projekte {
    /// Registriert einen Ordner (gleicher Ordner = gleiche Kennung) und macht ihn aktuell.
    pub fn oeffnen(&mut self, wurzel: Wurzel) -> u32 {
        let kennung = match self.liste.iter().find(|(_, w)| w.pfad() == wurzel.pfad()) {
            Some((k, _)) => *k,
            None => {
                self.naechste += 1;
                self.liste.insert(self.naechste, wurzel);
                self.naechste
            }
        };
        self.aktuell = Some(kennung);
        kennung
    }

    pub fn wurzel(&self, kennung: Option<u32>) -> Result<Wurzel, String> {
        let k = kennung
            .or(self.aktuell)
            .ok_or_else(|| "Kein Projekt geöffnet.".to_string())?;
        self.liste
            .get(&k)
            .cloned()
            .ok_or_else(|| format!("Unbekanntes Projekt (Kennung {k})."))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjektInfo {
    pub kennung: u32,
    pub pfad: String,
    pub name: String,
}

fn einstellungsdatei(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(einstellungen::DATEI))
        .map_err(|e| format!("App-Ordner nicht verfügbar: {e}"))
}

fn sperre<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Öffnet einen bereits geprüften Ordner: registrieren, Überwachung starten, merken.
fn oeffnen(app: &AppHandle, zustand: &Zustand, pfad: &Path) -> Result<ProjektInfo, String> {
    let wurzel = Wurzel::neu(pfad)?;
    let kennung = sperre(&zustand.projekte).oeffnen(wurzel.clone());
    match ueberwachung::starten(app.clone(), wurzel.clone(), zustand.eigene.clone()) {
        Ok(w) => *sperre(&zustand.waechter) = Some(w),
        Err(e) => {
            *sperre(&zustand.waechter) = None;
            eprintln!("Plotwerk: Dateiüberwachung nicht verfügbar: {e}");
        }
    }
    let text = wurzel.pfad().to_string_lossy().into_owned();
    {
        let _s = sperre(&zustand.einstellungen);
        einstellungen::schreiben(
            &einstellungsdatei(app)?,
            einstellungen::LETZTES_PROJEKT,
            serde_json::Value::String(text.clone()),
        )?;
    }
    Ok(ProjektInfo {
        kennung,
        name: wurzel
            .pfad()
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        pfad: text,
    })
}

fn erlauben(zustand: &Zustand, pfad: &Path) {
    let p = pfad.canonicalize().unwrap_or_else(|_| pfad.to_path_buf());
    sperre(&zustand.erlaubt).insert(p);
}

/// Projektordner öffnen. Erlaubt sind nur Ordner aus dem Öffnen-Dialog dieser Sitzung
/// und das zuletzt geöffnete Projekt.
#[tauri::command]
pub async fn projekt_oeffnen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    pfad: String,
) -> Result<ProjektInfo, String> {
    let gewuenscht = PathBuf::from(&pfad)
        .canonicalize()
        .map_err(|_| format!("Projektordner nicht gefunden: {pfad}"))?;
    let letztes = {
        let _s = sperre(&zustand.einstellungen);
        einstellungen::lesen(&einstellungsdatei(&app)?, einstellungen::LETZTES_PROJEKT)
            .and_then(|v| v.as_str().map(PathBuf::from))
            .and_then(|p| p.canonicalize().ok())
    };
    let erlaubt = letztes.as_deref() == Some(gewuenscht.as_path())
        || sperre(&zustand.erlaubt).contains(&gewuenscht)
        || sperre(&zustand.projekte)
            .liste
            .values()
            .any(|w| w.pfad() == gewuenscht);
    if !erlaubt {
        return Err("Projektordner können nur über „Projekt öffnen …“ gewählt werden.".into());
    }
    oeffnen(&app, &zustand, &gewuenscht)
}

/// Zuletzt geöffnetes Projekt erneut öffnen; None, wenn keins gemerkt ist oder der Ordner fehlt.
#[tauri::command]
pub async fn projekt_letztes(
    app: AppHandle,
    zustand: State<'_, Zustand>,
) -> Result<Option<ProjektInfo>, String> {
    let letztes = {
        let _s = sperre(&zustand.einstellungen);
        einstellungen::lesen(&einstellungsdatei(&app)?, einstellungen::LETZTES_PROJEKT)
    };
    let Some(pfad) = letztes.and_then(|v| v.as_str().map(PathBuf::from)) else {
        return Ok(None);
    };
    if !pfad.is_dir() {
        return Ok(None);
    }
    oeffnen(&app, &zustand, &pfad).map(Some)
}

/// Ordnerauswahl (nativ) und öffnen. None = abgebrochen.
#[tauri::command]
pub async fn projekt_waehlen(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
) -> Result<Option<ProjektInfo>, String> {
    let gewaehlt = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title("Projektordner öffnen")
        .set_can_create_directories(true)
        .blocking_pick_folder();
    let Some(pfad) = gewaehlt else {
        return Ok(None);
    };
    let pfad = pfad
        .into_path()
        .map_err(|e| format!("Ordner nicht lesbar: {e}"))?;
    erlauben(&zustand, &pfad);
    oeffnen(&app, &zustand, &pfad).map(Some)
}

/// Neuen Projektordner anlegen: Speichern-Dialog mit dem Titel als Ordnernamen.
/// Der Ordner muss neu oder leer sein. None = abgebrochen.
#[tauri::command]
pub async fn projekt_neu(
    app: AppHandle,
    fenster: WebviewWindow,
    zustand: State<'_, Zustand>,
    titel: String,
) -> Result<Option<ProjektInfo>, String> {
    let vorschlag: String = titel
        .chars()
        .map(|c| {
            if matches!(c, '/' | ':' | '\\') {
                '-'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string();
    let gewaehlt = app
        .dialog()
        .file()
        .set_parent(&fenster)
        .set_title("Neues Projekt anlegen")
        .set_file_name(if vorschlag.is_empty() {
            "Neues Projekt"
        } else {
            &vorschlag
        })
        .set_can_create_directories(true)
        .blocking_save_file();
    let Some(pfad) = gewaehlt else {
        return Ok(None);
    };
    let pfad = pfad
        .into_path()
        .map_err(|e| format!("Ordner nicht verwendbar: {e}"))?;
    if pfad.is_file() {
        return Err(format!("Dort liegt bereits eine Datei: {}", pfad.display()));
    }
    if pfad.is_dir() {
        let leer = std::fs::read_dir(&pfad)
            .map_err(|e| format!("Ordner nicht lesbar: {e}"))?
            .flatten()
            .all(|e| e.file_name() == ".DS_Store");
        if !leer {
            return Err(format!(
                "Der Ordner „{}“ ist nicht leer. Bitte einen neuen Namen wählen.",
                pfad.display()
            ));
        }
    }
    std::fs::create_dir_all(&pfad).map_err(|e| format!("Ordner nicht angelegt: {e}"))?;
    erlauben(&zustand, &pfad);
    oeffnen(&app, &zustand, &pfad).map(Some)
}

// ---------------------------------------------------------------------------
// fs_* – alle Pfade relativ zum Projektordner, über den Pfadwächter
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fs_lesen(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    pfad: String,
) -> Result<Option<String>, String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    dateien::lesen(&w, &pfad)
}

#[tauri::command]
pub async fn fs_schreiben(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    pfad: String,
    inhalt: String,
) -> Result<(), String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    let ziel = w.aufloesen(&pfad, false)?;
    zustand.eigene.merken(&ziel);
    dateien::schreiben(&w, &pfad, &inhalt)?;
    zustand.eigene.merken(&ziel);
    Ok(())
}

#[tauri::command]
pub async fn fs_auflisten(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    ordner: String,
) -> Result<Vec<String>, String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    dateien::auflisten(&w, &ordner)
}

#[tauri::command]
pub async fn fs_existiert(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    pfad: String,
) -> Result<bool, String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    dateien::existiert(&w, &pfad)
}

#[tauri::command]
pub async fn fs_entfernen(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    pfad: String,
) -> Result<(), String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    let ziel = w.aufloesen(&pfad, false)?;
    zustand.eigene.merken(&ziel);
    dateien::entfernen(&w, &pfad)?;
    zustand.eigene.merken(&ziel);
    Ok(())
}

// ---------------------------------------------------------------------------
// Binärdateien (G8 Recherche-Bilder) – nur unter recherche/ (dateien::binaer_erlaubt)
// ---------------------------------------------------------------------------

/// Kopfzeilen von fs_schreiben_binaer: `plotwerk-pfad` (URI-kodiert), `plotwerk-kennung` (optional).
pub const KOPF_PFAD: &str = "plotwerk-pfad";
pub const KOPF_KENNUNG: &str = "plotwerk-kennung";

/// Pfad und Kennung aus den Kopfzeilen lesen (Pfad URI-kodiert, damit Umlaute in Kopfzeilen passen).
pub fn binaer_kopf(
    pfad: Option<&str>,
    kennung: Option<&str>,
) -> Result<(String, Option<u32>), String> {
    let roh = pfad.ok_or_else(|| "Pfad fehlt (Kopfzeile plotwerk-pfad).".to_string())?;
    let pfad = percent_encoding::percent_decode_str(roh)
        .decode_utf8()
        .map_err(|_| "Pfad ist kein gültiges UTF-8.".to_string())?
        .into_owned();
    let kennung = match kennung {
        None => None,
        Some(k) => Some(
            k.parse::<u32>()
                .map_err(|_| format!("Ungültige Projektkennung: {k}"))?,
        ),
    };
    Ok((pfad, kennung))
}

/// Bytes roh zurück (ipc::Response → ArrayBuffer in der Oberfläche). Fehlt die Datei: Fehler
/// (die Oberfläche fragt vorher fs_existiert).
#[tauri::command]
pub async fn fs_lesen_binaer(
    zustand: State<'_, Zustand>,
    kennung: Option<u32>,
    pfad: String,
) -> Result<tauri::ipc::Response, String> {
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    match dateien::lesen_binaer(&w, &pfad)? {
        Some(daten) => Ok(tauri::ipc::Response::new(daten)),
        None => Err(format!("Datei fehlt: {pfad}")),
    }
}

/// Body = rohe Bytes; Pfad und Kennung in den Kopfzeilen (KOPF_PFAD, KOPF_KENNUNG).
#[tauri::command]
pub async fn fs_schreiben_binaer(
    zustand: State<'_, Zustand>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(daten) = request.body() else {
        return Err("Binärdaten erwartet.".into());
    };
    let kopf = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
    let (pfad, kennung) = binaer_kopf(kopf(KOPF_PFAD), kopf(KOPF_KENNUNG))?;
    let w = sperre(&zustand.projekte).wurzel(kennung)?;
    let ziel = w.aufloesen(&pfad, false)?;
    zustand.eigene.merken(&ziel);
    dateien::schreiben_binaer(&w, &pfad, daten)?;
    zustand.eigene.merken(&ziel);
    Ok(())
}

// ---------------------------------------------------------------------------
// App-Einstellungen
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn einstellung_lesen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    schluessel: String,
) -> Result<Option<serde_json::Value>, String> {
    let _s = sperre(&zustand.einstellungen);
    Ok(einstellungen::lesen(&einstellungsdatei(&app)?, &schluessel))
}

#[tauri::command]
pub async fn einstellung_schreiben(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    schluessel: String,
    wert: serde_json::Value,
) -> Result<(), String> {
    if schluessel == einstellungen::LETZTES_PROJEKT {
        return Err("„letztesProjekt“ wird nur beim Öffnen eines Projekts gesetzt.".into());
    }
    let _s = sperre(&zustand.einstellungen);
    einstellungen::schreiben(&einstellungsdatei(&app)?, &schluessel, wert)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kennungen_bleiben_je_ordner_gleich() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let mut p = Projekte::default();
        assert!(p.wurzel(None).is_err());
        let ka = p.oeffnen(Wurzel::neu(a.path()).unwrap());
        let kb = p.oeffnen(Wurzel::neu(b.path()).unwrap());
        assert_ne!(ka, kb);
        assert_eq!(p.oeffnen(Wurzel::neu(a.path()).unwrap()), ka);
        // Ohne Kennung: zuletzt geöffnetes Projekt; mit Kennung: genau dieses.
        assert_eq!(
            p.wurzel(None).unwrap().pfad(),
            a.path().canonicalize().unwrap()
        );
        assert_eq!(
            p.wurzel(Some(kb)).unwrap().pfad(),
            b.path().canonicalize().unwrap()
        );
        assert!(p.wurzel(Some(99)).is_err());
    }

    #[test]
    fn binaer_kopfzeilen() {
        assert_eq!(
            binaer_kopf(Some("recherche%2Fdateien%2Fb%C3%BCro%20alt.jpg"), Some("3")).unwrap(),
            ("recherche/dateien/büro alt.jpg".to_string(), Some(3))
        );
        assert_eq!(
            binaer_kopf(Some("recherche/x.png"), None).unwrap(),
            ("recherche/x.png".to_string(), None)
        );
        assert!(binaer_kopf(None, None).is_err());
        assert!(binaer_kopf(Some("recherche/x.png"), Some("abc")).is_err());
        assert!(binaer_kopf(Some("%FF"), None).is_err());
    }
}
