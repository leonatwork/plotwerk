//! App-Einstellungen (nicht projektbezogen) als JSON im App-Config-Ordner.

use std::path::Path;

use serde_json::{Map, Value};

use crate::dateien::schreiben_atomar;

pub const DATEI: &str = "einstellungen.json";
/// Wird nur von projekt_oeffnen gesetzt, nie über einstellung_schreiben.
pub const LETZTES_PROJEKT: &str = "letztesProjekt";

pub fn alle(datei: &Path) -> Map<String, Value> {
    std::fs::read_to_string(datei)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| match v {
            Value::Object(m) => Some(m),
            _ => None,
        })
        .unwrap_or_default()
}

pub fn lesen(datei: &Path, schluessel: &str) -> Option<Value> {
    alle(datei).remove(schluessel)
}

/// `Value::Null` entfernt den Eintrag.
pub fn schreiben(datei: &Path, schluessel: &str, wert: Value) -> Result<(), String> {
    if schluessel.trim().is_empty() {
        return Err("Leerer Einstellungsname".into());
    }
    let mut daten = alle(datei);
    if wert.is_null() {
        daten.remove(schluessel);
    } else {
        daten.insert(schluessel.to_string(), wert);
    }
    let text = serde_json::to_string_pretty(&Value::Object(daten)).map_err(|e| e.to_string())?;
    schreiben_atomar(datei, text.as_bytes())
        .map_err(|e| format!("Einstellungen nicht gespeichert: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn lesen_und_schreiben() {
        let tmp = tempfile::tempdir().unwrap();
        let datei = tmp.path().join("app").join(DATEI);
        assert_eq!(lesen(&datei, "x"), None);
        schreiben(
            &datei,
            LETZTES_PROJEKT,
            json!("/Users/leon/Romane/Hafenlichter"),
        )
        .unwrap();
        schreiben(&datei, "zoom", json!(1.2)).unwrap();
        assert_eq!(
            lesen(&datei, LETZTES_PROJEKT),
            Some(json!("/Users/leon/Romane/Hafenlichter"))
        );
        assert_eq!(lesen(&datei, "zoom"), Some(json!(1.2)));
        schreiben(&datei, "zoom", Value::Null).unwrap();
        assert_eq!(lesen(&datei, "zoom"), None);
        assert!(schreiben(&datei, " ", json!(1)).is_err());
    }

    #[test]
    fn kaputte_datei_ergibt_leere_einstellungen() {
        let tmp = tempfile::tempdir().unwrap();
        let datei = tmp.path().join(DATEI);
        std::fs::write(&datei, "{kaputt").unwrap();
        assert!(alle(&datei).is_empty());
        schreiben(&datei, "a", json!(true)).unwrap();
        assert_eq!(lesen(&datei, "a"), Some(json!(true)));
    }
}
