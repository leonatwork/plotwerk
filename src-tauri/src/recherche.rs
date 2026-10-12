//! Recherche (G8): Links aus der Recherche-Ablage im Standardbrowser öffnen.
//!
//! Die App lädt nie selbst fremde Seiten (CSP, keine Vorschau). Nur auf Leons Klick wird die Adresse an
//! macOS (`/usr/bin/open`) übergeben – und nur, wenn sie mit http:// oder https:// beginnt, einen Host hat
//! und weder Leerraum noch Steuerzeichen enthält. Bilder laufen über `fs_*_binaer` (dateien.rs).

use std::process::Command;

/// Höchstlänge einer Adresse (wie gängige Browser-Grenzen, schützt vor Unsinn).
const MAX_LAENGE: usize = 8 * 1024;

/// Prüft eine Adresse für `open`. Ok = die unveränderte Adresse.
pub fn link_pruefen(url: &str) -> Result<&str, String> {
    if url.is_empty() || url.len() > MAX_LAENGE {
        return Err("Ungültige Adresse.".into());
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Die Adresse enthält Leer- oder Steuerzeichen.".into());
    }
    let klein = url.to_ascii_lowercase();
    let rest = if let Some(r) = klein.strip_prefix("https://") {
        r
    } else if let Some(r) = klein.strip_prefix("http://") {
        r
    } else {
        return Err("Nur http- und https-Adressen können geöffnet werden.".into());
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains('@') {
        return Err("Die Adresse hat keinen gültigen Host.".into());
    }
    Ok(url)
}

/// Öffnet eine http(s)-Adresse im Standardbrowser von macOS.
#[tauri::command]
pub async fn link_oeffnen(url: String) -> Result<(), String> {
    let url = link_pruefen(&url)?;
    let status = Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .map_err(|e| format!("Browser konnte nicht geöffnet werden: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Browser konnte nicht geöffnet werden.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::link_pruefen;

    #[test]
    fn erlaubt_nur_http_und_https() {
        assert!(link_pruefen("https://www.hamburg.de/hafen?x=1#a").is_ok());
        assert!(link_pruefen("HTTP://example.org").is_ok());
        for url in [
            "",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,x",
            "ftp://example.org",
            "/Applications/Calculator.app",
            "-a Calculator",
            "https://",
            "https:///pfad",
            "https://nutzer:pw@example.org",
            "https://example.org/mit leerzeichen",
            "https://example.org/\nzeile",
        ] {
            assert!(
                link_pruefen(url).is_err(),
                "{url:?} hätte abgelehnt werden müssen"
            );
        }
    }

    #[test]
    fn lehnt_ueberlange_adressen_ab() {
        let lang = format!("https://example.org/{}", "a".repeat(9000));
        assert!(link_pruefen(&lang).is_err());
    }
}
