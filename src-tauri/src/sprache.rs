//! Oberflächensprache im Rust-Kern (natives Menü, Dateidialoge).
//!
//! Gespeichert als App-Einstellung `sprache` in einstellungen.json: "de" | "en"; fehlt = System.
//! System = erste bevorzugte Sprache von macOS (Deutsch → de, sonst en). Die Oberfläche fragt
//! beim Start `sprache_info` ab und meldet Änderungen über `sprache_setzen` (baut das Menü neu).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{einstellungen, projekt, Zustand};

pub const EINSTELLUNG: &str = "sprache";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sprache {
    De,
    En,
}

impl Sprache {
    pub fn code(self) -> &'static str {
        match self {
            Sprache::De => "de",
            Sprache::En => "en",
        }
    }
}

static ENGLISCH: AtomicBool = AtomicBool::new(false);
static SYSTEM: OnceLock<Sprache> = OnceLock::new();

/// Aktuelle Oberflächensprache.
pub fn aktuell() -> Sprache {
    if ENGLISCH.load(Ordering::Relaxed) {
        Sprache::En
    } else {
        Sprache::De
    }
}

fn setzen(s: Sprache) {
    ENGLISCH.store(s == Sprache::En, Ordering::Relaxed);
}

/// Text in der aktuellen Sprache.
pub fn t(de: &'static str, en: &'static str) -> &'static str {
    match aktuell() {
        Sprache::De => de,
        Sprache::En => en,
    }
}

/// `format!` in der aktuellen Sprache, für Fehlermeldungen, die die Oberfläche anzeigt:
/// `tf!("Datei fehlt: {pfad}", "File missing: {pfad}")`.
#[macro_export]
macro_rules! tf {
    ($de:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        match $crate::sprache::aktuell() {
            $crate::sprache::Sprache::De => format!($de $(, $arg)*),
            $crate::sprache::Sprache::En => format!($en $(, $arg)*),
        }
    };
}

/// BCP-47-Code oder Name → Sprache (Deutsch → de, alles andere → en).
pub fn aus_code(code: &str) -> Sprache {
    let c = code.trim().trim_matches('"').to_lowercase();
    if c == "de" || c.starts_with("de-") || c.starts_with("de_") {
        Sprache::De
    } else {
        Sprache::En
    }
}

/// Gültige Wahl: "de", "en" oder "system".
fn wahl_normalisieren(wahl: &str) -> &'static str {
    match wahl.trim() {
        "de" => "de",
        "en" => "en",
        _ => "system",
    }
}

fn wirksam(wahl: &str, system: Sprache) -> Sprache {
    match wahl {
        "de" => Sprache::De,
        "en" => Sprache::En,
        _ => system,
    }
}

/// Erste Sprache aus der Ausgabe von `defaults read -g AppleLanguages`, z. B. `(\n    "de-DE",\n    en\n)`.
fn erste_sprache(ausgabe: &str) -> Option<String> {
    ausgabe
        .lines()
        .map(|z| {
            z.trim()
                .trim_end_matches(',')
                .trim()
                .trim_matches('"')
                .trim()
        })
        .find(|z| !z.is_empty() && *z != "(" && *z != ")")
        .map(str::to_string)
}

fn system_ermitteln() -> Sprache {
    #[cfg(target_os = "macos")]
    {
        if let Ok(aus) = std::process::Command::new("/usr/bin/defaults")
            .args(["read", "-g", "AppleLanguages"])
            .output()
        {
            if aus.status.success() {
                if let Some(s) = erste_sprache(&String::from_utf8_lossy(&aus.stdout)) {
                    return aus_code(&s);
                }
            }
        }
    }
    for var in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(v) = std::env::var(var) {
            if !v.trim().is_empty() && v != "C" && v != "POSIX" {
                return aus_code(&v);
            }
        }
    }
    Sprache::En
}

/// Systemsprache (einmal ermittelt).
pub fn system() -> Sprache {
    *SYSTEM.get_or_init(system_ermitteln)
}

fn gespeicherte_wahl(app: &AppHandle, zustand: &Zustand) -> &'static str {
    let _s = projekt::sperre(&zustand.einstellungen);
    projekt::einstellungsdatei(app)
        .ok()
        .and_then(|d| einstellungen::lesen(&d, EINSTELLUNG))
        .and_then(|v| v.as_str().map(wahl_normalisieren))
        .unwrap_or("system")
}

/// Liest die gespeicherte Wahl und stellt die Sprache ein (vor dem Aufbau des Menüs).
pub fn laden(app: &AppHandle, zustand: &Zustand) {
    setzen(wirksam(gespeicherte_wahl(app, zustand), system()));
}

#[derive(Serialize)]
pub struct SprachInfo {
    /// "system" | "de" | "en"
    wahl: &'static str,
    /// Systemsprache "de" | "en"
    system: &'static str,
}

#[tauri::command]
pub fn sprache_info(app: AppHandle, zustand: State<'_, Zustand>) -> SprachInfo {
    SprachInfo {
        wahl: gespeicherte_wahl(&app, &zustand),
        system: system().code(),
    }
}

/// Speichert die Wahl ("system" | "de" | "en") und baut das Menü in der neuen Sprache auf.
/// Synchron, damit das Menü auf dem Haupt-Thread entsteht.
#[tauri::command]
pub fn sprache_setzen(
    app: AppHandle,
    zustand: State<'_, Zustand>,
    wahl: String,
) -> Result<(), String> {
    let wahl = wahl_normalisieren(&wahl);
    {
        let _s = projekt::sperre(&zustand.einstellungen);
        let wert = if wahl == "system" {
            Value::Null
        } else {
            Value::String(wahl.into())
        };
        einstellungen::schreiben(&projekt::einstellungsdatei(&app)?, EINSTELLUNG, wert)?;
    }
    let neu = wirksam(wahl, system());
    if neu != aktuell() {
        setzen(neu);
        let menue = crate::menue::erstellen(&app).map_err(|e| e.to_string())?;
        app.set_menu(menue).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes() {
        assert_eq!(aus_code("de-DE"), Sprache::De);
        assert_eq!(aus_code("de_AT.UTF-8"), Sprache::De);
        assert_eq!(aus_code("\"de\""), Sprache::De);
        assert_eq!(aus_code("en-GB"), Sprache::En);
        assert_eq!(aus_code("fr-FR"), Sprache::En);
        assert_eq!(aus_code("dell"), Sprache::En);
    }

    #[test]
    fn apple_languages_lesen() {
        assert_eq!(
            erste_sprache("(\n    \"de-DE\",\n    \"en-DE\"\n)\n").as_deref(),
            Some("de-DE")
        );
        assert_eq!(
            erste_sprache("(\n    en,\n    de\n)").as_deref(),
            Some("en")
        );
        assert_eq!(erste_sprache("(\n)"), None);
    }

    #[test]
    fn tf_standard_deutsch() {
        let pfad = "a.md";
        assert_eq!(
            crate::tf!("Datei fehlt: {pfad}", "File missing: {pfad}"),
            "Datei fehlt: a.md"
        );
        assert_eq!(t("Lesen", "Reading"), "Lesen");
    }

    #[test]
    fn wahl() {
        assert_eq!(wahl_normalisieren("en"), "en");
        assert_eq!(wahl_normalisieren("klingonisch"), "system");
        assert_eq!(wirksam("system", Sprache::De), Sprache::De);
        assert_eq!(wirksam("en", Sprache::De), Sprache::En);
        assert_eq!(wirksam("de", Sprache::En), Sprache::De);
    }
}
