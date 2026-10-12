//! Vorlesen (G4), Rückfall über macOS `say`, wenn die WKWebView keine Web Speech API mitbringt.
//!
//! Die Oberfläche liest Satz für Satz: `vorlesen_sagen` spricht einen Satz und kehrt erst zurück, wenn er
//! fertig gesprochen (`"fertig"`) oder durch `vorlesen_stopp` bzw. einen neuen Satz abgebrochen wurde
//! (`"abgebrochen"`). Der Text geht über stdin an `say` (nie als Argument, keine Shell); die Stimme ist ein
//! einzelnes Argument nach `-v`. Es läuft immer höchstens ein `say`-Prozess.

use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::State;

const SAY: &str = "/usr/bin/say";
/// Höchstlänge eines Satzes (schützt vor Unsinn; Sätze sind viel kürzer).
const MAX_TEXT: usize = 20_000;

#[derive(Default)]
pub struct Vorleser {
    laufend: Arc<Mutex<Option<(u64, Child)>>>,
    zaehler: AtomicU64,
}

impl Vorleser {
    pub fn stoppen(&self) {
        if let Ok(mut l) = self.laufend.lock() {
            if let Some((_, mut kind)) = l.take() {
                let _ = kind.kill();
                let _ = kind.wait();
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SayStimme {
    pub name: String,
    /// BCP-47-ähnlich, z. B. `de-DE`
    pub lang: String,
}

/// Wertet die Ausgabe von `say -v '?'` aus: `Markus              de_DE    # Hallo! Ich heiße Markus.`
/// Namen können Leerzeichen und Klammern enthalten (`Eddy (Deutsch (Deutschland))`).
pub fn stimmen_auswerten(ausgabe: &str) -> Vec<SayStimme> {
    ausgabe
        .lines()
        .filter_map(|zeile| {
            let links = zeile.split('#').next()?.trim_end();
            let (name, lang) = links.rsplit_once(char::is_whitespace)?;
            let name = name.trim();
            let gueltig = lang.len() >= 4
                && lang.contains('_')
                && lang.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
            (gueltig && !name.is_empty()).then(|| SayStimme {
                name: name.to_string(),
                lang: lang.replace('_', "-"),
            })
        })
        .collect()
}

/// Tempo (1.0 = normal) → Wörter pro Minute für `say -r`.
pub fn woerter_pro_minute(tempo: f64) -> u32 {
    let t = if tempo.is_finite() { tempo } else { 1.0 };
    (180.0 * t.clamp(0.5, 2.0)).round() as u32
}

fn stimme_pruefen(stimme: &str) -> Result<(), String> {
    if stimme.is_empty()
        || stimme.len() > 100
        || stimme.starts_with('-')
        || stimme.chars().any(char::is_control)
    {
        return Err("Ungültige Stimme.".into());
    }
    Ok(())
}

/// Stimmen des Systems (`say -v '?'`).
#[tauri::command]
pub async fn vorlesen_stimmen() -> Result<Vec<SayStimme>, String> {
    let ausgabe = Command::new(SAY).args(["-v", "?"]).output().map_err(|e| {
        crate::tf!(
            "Sprachausgabe nicht verfügbar: {e}",
            "Speech output not available: {e}"
        )
    })?;
    if !ausgabe.status.success() {
        return Err(crate::sprache::t(
            "Sprachausgabe nicht verfügbar.",
            "Speech output not available.",
        )
        .into());
    }
    Ok(stimmen_auswerten(&String::from_utf8_lossy(&ausgabe.stdout)))
}

/// Spricht `text` und wartet, bis er gesprochen oder abgebrochen ist.
#[tauri::command]
pub async fn vorlesen_sagen(
    zustand: State<'_, Vorleser>,
    text: String,
    stimme: Option<String>,
    tempo: Option<f64>,
) -> Result<String, String> {
    if text.len() > MAX_TEXT {
        return Err(crate::sprache::t(
            "Der Text ist zu lang zum Vorlesen.",
            "The text is too long to read aloud.",
        )
        .into());
    }
    zustand.stoppen();
    let mut befehl = Command::new(SAY);
    if let Some(s) = stimme.as_deref().filter(|s| !s.is_empty()) {
        stimme_pruefen(s)?;
        befehl.args(["-v", s]);
    }
    befehl
        .args(["-r", &woerter_pro_minute(tempo.unwrap_or(1.0)).to_string()])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut kind = befehl.spawn().map_err(|e| {
        crate::tf!(
            "Sprachausgabe nicht verfügbar: {e}",
            "Speech output not available: {e}"
        )
    })?;
    if let Some(mut eingabe) = kind.stdin.take() {
        eingabe
            .write_all(text.as_bytes())
            .map_err(|e| crate::tf!("Vorlesen fehlgeschlagen: {e}", "Reading aloud failed: {e}"))?;
    }
    let nr = zustand.zaehler.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut l = zustand.laufend.lock().map_err(|_| {
            crate::sprache::t("Vorlesen gesperrt", "Reading aloud locked").to_string()
        })?;
        *l = Some((nr, kind));
    }
    let laufend = Arc::clone(&zustand.laufend);
    tauri::async_runtime::spawn_blocking(move || loop {
        {
            let mut l = match laufend.lock() {
                Ok(l) => l,
                Err(_) => {
                    return Err(
                        crate::sprache::t("Vorlesen gesperrt", "Reading aloud locked").to_string(),
                    )
                }
            };
            match l.as_mut() {
                Some((n, kind)) if *n == nr => match kind.try_wait() {
                    Ok(Some(status)) => {
                        *l = None;
                        return Ok(if status.success() {
                            "fertig"
                        } else {
                            "abgebrochen"
                        }
                        .to_string());
                    }
                    Ok(None) => {}
                    Err(e) => {
                        *l = None;
                        return Err(crate::tf!(
                            "Vorlesen fehlgeschlagen: {e}",
                            "Reading aloud failed: {e}"
                        ));
                    }
                },
                _ => return Ok("abgebrochen".to_string()),
            }
        }
        std::thread::sleep(Duration::from_millis(40));
    })
    .await
    .map_err(|e| crate::tf!("Vorlesen fehlgeschlagen: {e}", "Reading aloud failed: {e}"))?
}

/// Bricht das Vorlesen ab (der wartende `vorlesen_sagen` meldet „abgebrochen“).
#[tauri::command]
pub fn vorlesen_stopp(zustand: State<'_, Vorleser>) {
    zustand.stoppen();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stimmen_aus_say_ausgabe() {
        let ausgabe = "Markus              de_DE    # Hallo! Ich heiße Markus.\n\
                       Eddy (Deutsch (Deutschland)) de_DE    # Hallo! Ich heiße Eddy.\n\
                       Samantha            en_US    # Hello! My name is Samantha.\n\
                       \n\
                       kaputt\n";
        let s = stimmen_auswerten(ausgabe);
        assert_eq!(
            s,
            vec![
                SayStimme {
                    name: "Markus".into(),
                    lang: "de-DE".into()
                },
                SayStimme {
                    name: "Eddy (Deutsch (Deutschland))".into(),
                    lang: "de-DE".into()
                },
                SayStimme {
                    name: "Samantha".into(),
                    lang: "en-US".into()
                },
            ]
        );
    }

    #[test]
    fn tempo_wird_begrenzt() {
        assert_eq!(woerter_pro_minute(1.0), 180);
        assert_eq!(woerter_pro_minute(0.1), 90);
        assert_eq!(woerter_pro_minute(5.0), 360);
        assert_eq!(woerter_pro_minute(f64::NAN), 180);
    }

    #[test]
    fn stimme_ohne_optionen_und_steuerzeichen() {
        assert!(stimme_pruefen("Markus").is_ok());
        assert!(stimme_pruefen("Eddy (Deutsch (Deutschland))").is_ok());
        assert!(stimme_pruefen("-o datei").is_err());
        assert!(stimme_pruefen("Markus\n").is_err());
        assert!(stimme_pruefen("").is_err());
    }
}
