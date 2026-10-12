//! Tauri-Kommandos für Schlüsselbund und KI. Der Schlüssel wird hier gelesen und an
//! plotwerk-ki übergeben; er geht nie an die Web-Oberfläche.

use plotwerk_ki::{Anbieter, KiFehler, KiKlient};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::{schluessel, Zustand};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KiFehlerAntwort {
    pub meldung: String,
    pub status: Option<u16>,
    pub wiederholen_nach: Option<u64>,
}

impl From<KiFehler> for KiFehlerAntwort {
    fn from(e: KiFehler) -> Self {
        Self {
            meldung: e.meldung(crate::sprache::aktuell() == crate::sprache::Sprache::En),
            status: e.status(),
            wiederholen_nach: e.wiederholen_nach(),
        }
    }
}

impl From<String> for KiFehlerAntwort {
    fn from(meldung: String) -> Self {
        Self {
            meldung,
            status: None,
            wiederholen_nach: None,
        }
    }
}

async fn im_hintergrund<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| {
        crate::tf!(
            "Schlüsselbund nicht erreichbar: {e}",
            "Keychain not reachable: {e}"
        )
    })?
}

/// `anbieter`: "foundry" (Standard, auch wenn es fehlt), "claude" oder "openai".
fn anbieter(wert: Option<String>) -> Result<Anbieter, String> {
    Anbieter::aus_text(wert.as_deref()).map_err(|e| KiFehlerAntwort::from(e).meldung)
}

#[tauri::command]
pub async fn schluessel_setzen(wert: String, anbieter: Option<String>) -> Result<(), String> {
    let a = self::anbieter(anbieter)?;
    im_hintergrund(move || schluessel::setzen(a, &wert)).await
}

#[tauri::command]
pub async fn schluessel_vorhanden(anbieter: Option<String>) -> Result<bool, String> {
    let a = self::anbieter(anbieter)?;
    im_hintergrund(move || schluessel::vorhanden(a)).await
}

#[tauri::command]
pub async fn schluessel_loeschen(anbieter: Option<String>) -> Result<(), String> {
    let a = self::anbieter(anbieter)?;
    im_hintergrund(move || schluessel::loeschen(a)).await
}

fn klient(zustand: &Zustand) -> Result<KiKlient, KiFehlerAntwort> {
    if let Some(k) = zustand.ki.get() {
        return Ok(k.clone());
    }
    let k = KiKlient::neu()?;
    Ok(zustand.ki.get_or_init(|| k).clone())
}

/// Schlüssel des Anbieters; beim OpenAI-kompatiblen Dienst darf er fehlen (lokale Server).
async fn schluessel_fuer(a: Anbieter) -> Result<String, String> {
    match a {
        Anbieter::OpenAi => im_hintergrund(move || schluessel::lesen_optional(a)).await,
        _ => im_hintergrund(move || schluessel::lesen(a)).await,
    }
}

/// POST {endpoint}/v1/messages bzw. {endpoint}/chat/completions mit dem Schlüssel des Anbieters
/// aus dem Schlüsselbund.
#[tauri::command]
pub async fn ki_anfrage(
    zustand: State<'_, Zustand>,
    endpoint: String,
    body: Value,
    anbieter: Option<String>,
) -> Result<Value, KiFehlerAntwort> {
    let a = Anbieter::aus_text(anbieter.as_deref())?;
    let k = klient(&zustand)?;
    let schluessel = schluessel_fuer(a).await?;
    Ok(k.nachricht(a, &endpoint, &schluessel, &body).await?)
}

/// POST {endpoint}/v1/messages/count_tokens → Anzahl Eingabe-Tokens.
#[tauri::command]
pub async fn ki_tokens(
    zustand: State<'_, Zustand>,
    endpoint: String,
    body: Value,
    anbieter: Option<String>,
) -> Result<u64, KiFehlerAntwort> {
    let a = Anbieter::aus_text(anbieter.as_deref())?;
    let k = klient(&zustand)?;
    let schluessel = schluessel_fuer(a).await?;
    Ok(k.tokens_zaehlen(a, &endpoint, &schluessel, &body).await?)
}

#[cfg(test)]
mod tests {
    /// Harte Regel 1 für die Tauri-Kommandos der KI: kein Dateizugriff, kein Zugriff auf das Projekt.
    #[test]
    fn ki_kommandos_ohne_dateizugriff() {
        let quelle = include_str!("ki.rs");
        let code = quelle.split("#[cfg(test)]").next().unwrap();
        for verboten in [
            "std::fs",
            "File::",
            "OpenOptions",
            "dateien::",
            "Wurzel",
            "projekt::",
            "fs_schreiben",
            "schreiben_atomar",
        ] {
            assert!(
                !code.contains(verboten),
                "ki.rs greift auf Dateien zu: {verboten}"
            );
        }
    }
}
