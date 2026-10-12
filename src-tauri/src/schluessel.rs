//! API-Schlüssel im macOS-Schlüsselbund, je Anbieter ein eigener Eintrag. Der Wert wird nur
//! im Rust-Kern gelesen (für ki_anfrage/ki_tokens) und nie an die Web-Oberfläche zurückgegeben.

use keyring::{Entry, Error};
use plotwerk_ki::Anbieter;

pub const DIENST: &str = "app.plotwerk.mac";
/// Konto für Microsoft Foundry (seit Phase 4 unverändert).
pub const KONTO: &str = "azure-foundry";
/// Konto für die Claude API von Anthropic.
pub const KONTO_CLAUDE: &str = "anthropic-api";

pub fn konto(anbieter: Anbieter) -> &'static str {
    match anbieter {
        Anbieter::Foundry => KONTO,
        Anbieter::Claude => KONTO_CLAUDE,
    }
}

fn eintrag(anbieter: Anbieter) -> Result<Entry, String> {
    Entry::new(DIENST, konto(anbieter)).map_err(fehlertext)
}

fn fehlertext(e: Error) -> String {
    match e {
        Error::NoEntry => {
            "Kein API-Schlüssel hinterlegt. Bitte in den KI-Einstellungen eintragen.".into()
        }
        Error::NoStorageAccess(_) => {
            "Kein Zugriff auf den Schlüsselbund. Bitte den Zugriff für Plotwerk erlauben.".into()
        }
        Error::TooLong(..) => "Der API-Schlüssel ist zu lang.".into(),
        Error::BadEncoding(_) => {
            "Der gespeicherte API-Schlüssel ist beschädigt. Bitte neu eintragen.".into()
        }
        andere => format!("Schlüsselbund-Fehler: {andere}"),
    }
}

pub fn setzen(anbieter: Anbieter, wert: &str) -> Result<(), String> {
    let wert = wert.trim();
    if wert.is_empty() {
        return Err("Der API-Schlüssel ist leer.".into());
    }
    if wert.chars().any(|c| c.is_control()) {
        return Err("Der API-Schlüssel enthält ungültige Zeichen.".into());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leerer_schluessel_wird_abgelehnt() {
        for anbieter in [Anbieter::Foundry, Anbieter::Claude] {
            assert!(setzen(anbieter, "   ").is_err());
            assert!(setzen(anbieter, "abc\ndef").is_err());
        }
    }

    #[test]
    fn je_anbieter_ein_eintrag() {
        assert_eq!(konto(Anbieter::Foundry), "azure-foundry");
        assert_eq!(konto(Anbieter::Claude), "anthropic-api");
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
