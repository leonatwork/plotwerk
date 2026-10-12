//! API-Schlüssel im macOS-Schlüsselbund, je Anbieter ein eigener Eintrag. Der Wert wird nur
//! im Rust-Kern gelesen (für ki_anfrage/ki_tokens) und nie an die Web-Oberfläche zurückgegeben.

use keyring::{Entry, Error};
use plotwerk_ki::Anbieter;

pub const DIENST: &str = "app.plotwerk.mac";
/// Konto für Microsoft Foundry (seit Phase 4 unverändert).
pub const KONTO: &str = "azure-foundry";
/// Konto für die Claude API von Anthropic.
pub const KONTO_CLAUDE: &str = "anthropic-api";
/// Konto für den OpenAI-kompatiblen Dienst (OpenAI, OpenRouter, Qwen …; lokal meist ohne Schlüssel).
pub const KONTO_OPENAI: &str = "openai-kompatibel";

pub fn konto(anbieter: Anbieter) -> &'static str {
    match anbieter {
        Anbieter::Foundry => KONTO,
        Anbieter::Claude => KONTO_CLAUDE,
        Anbieter::OpenAi => KONTO_OPENAI,
    }
}

fn eintrag(anbieter: Anbieter) -> Result<Entry, String> {
    Entry::new(DIENST, konto(anbieter)).map_err(fehlertext)
}

fn fehlertext(e: Error) -> String {
    match e {
        Error::NoEntry => crate::sprache::t(
            "Kein API-Schlüssel hinterlegt. Bitte in den KI-Einstellungen eintragen.",
            "No API key stored. Please enter it in the AI settings.",
        )
        .into(),
        Error::NoStorageAccess(_) => crate::sprache::t(
            "Kein Zugriff auf den Schlüsselbund. Bitte den Zugriff für Plotwerk erlauben.",
            "No access to the keychain. Please allow access for Plotwerk.",
        )
        .into(),
        Error::TooLong(..) => {
            crate::sprache::t("Der API-Schlüssel ist zu lang.", "The API key is too long.").into()
        }
        Error::BadEncoding(_) => crate::sprache::t(
            "Der gespeicherte API-Schlüssel ist beschädigt. Bitte neu eintragen.",
            "The stored API key is damaged. Please enter it again.",
        )
        .into(),
        andere => crate::tf!("Schlüsselbund-Fehler: {andere}", "Keychain error: {andere}"),
    }
}

pub fn setzen(anbieter: Anbieter, wert: &str) -> Result<(), String> {
    let wert = wert.trim();
    if wert.is_empty() {
        return Err(
            crate::sprache::t("Der API-Schlüssel ist leer.", "The API key is empty.").into(),
        );
    }
    if wert.chars().any(|c| c.is_control()) {
        return Err(crate::sprache::t(
            "Der API-Schlüssel enthält ungültige Zeichen.",
            "The API key contains invalid characters.",
        )
        .into());
    }
    eintrag(anbieter)?.set_password(wert).map_err(fehlertext)
}

pub fn vorhanden(anbieter: Anbieter) -> Result<bool, String> {
    match eintrag(anbieter)?.get_password() {
        Ok(w) => Ok(!w.trim().is_empty()),
        Err(Error::NoEntry) => Ok(false),
        Err(e) => Err(fehlertext(e)),
    }
}

pub fn loeschen(anbieter: Anbieter) -> Result<(), String> {
    match eintrag(anbieter)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(fehlertext(e)),
    }
}

/// Nur für den KI-Aufruf im Rust-Kern.
pub fn lesen(anbieter: Anbieter) -> Result<String, String> {
    eintrag(anbieter)?.get_password().map_err(fehlertext)
}

/// Wie `lesen`, aber ein fehlender Eintrag ist kein Fehler (lokale Server brauchen keinen Schlüssel).
pub fn lesen_optional(anbieter: Anbieter) -> Result<String, String> {
    match eintrag(anbieter)?.get_password() {
        Ok(w) => Ok(w),
        Err(Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(fehlertext(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leerer_schluessel_wird_abgelehnt() {
        for anbieter in [Anbieter::Foundry, Anbieter::Claude, Anbieter::OpenAi] {
            assert!(setzen(anbieter, "   ").is_err());
            assert!(setzen(anbieter, "abc\ndef").is_err());
        }
    }

    #[test]
    fn je_anbieter_ein_eintrag() {
        assert_eq!(konto(Anbieter::Foundry), "azure-foundry");
        assert_eq!(konto(Anbieter::Claude), "anthropic-api");
        assert_eq!(konto(Anbieter::OpenAi), "openai-kompatibel");
        assert_eq!(DIENST, "app.plotwerk.mac");
    }

    #[test]
    fn fehlermeldungen_deutsch() {
        assert!(fehlertext(Error::NoEntry).contains("KI-Einstellungen"));
    }

    /// Echter Schlüsselbund – nur manuell: cargo test -- --ignored schluesselbund
    #[test]
    #[ignore]
    fn schluesselbund_rundlauf() {
        let a = Anbieter::Claude;
        loeschen(a).unwrap();
        assert!(!vorhanden(a).unwrap());
        setzen(a, "test-schluessel").unwrap();
        assert!(vorhanden(a).unwrap());
        assert_eq!(lesen(a).unwrap(), "test-schluessel");
        loeschen(a).unwrap();
        assert!(!vorhanden(a).unwrap());
    }
}
