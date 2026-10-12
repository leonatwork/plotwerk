//! HTTP-Transport zur KI: Messages-API (Claude in Microsoft Foundry oder die Claude API von
//! Anthropic direkt) oder OpenAI-kompatible Chat-Completions-API (OpenAI, OpenRouter, Ollama,
//! LM Studio …). Den Anbieter wählt Leon in den Einstellungen.
//!
//! Dieses Crate hat bewusst keinen Dateizugriff (siehe `clippy.toml` und
//! `tests/kein_dateizugriff.rs`): Die KI kann nichts schreiben. Es nimmt einen fertigen
//! Request-Body entgegen, schickt ihn an `{endpoint}/v1/messages` (bzw.
//! `{endpoint}/v1/messages/count_tokens`) oder `{endpoint}/chat/completions` und gibt das
//! Antwort-JSON zurück. Die Übersetzung zwischen beiden Formaten passiert in TypeScript.
#![deny(clippy::disallowed_methods, clippy::disallowed_types)]

use std::fmt;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use reqwest::StatusCode;
use serde_json::{Map, Value};

/// Version der Messages-API (Claude API und laut Microsoft Learn auch Foundry).
pub const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Basis-URL der Claude API, wenn in den Einstellungen nichts anderes steht.
pub const CLAUDE_API_ENDPOINT: &str = "https://api.anthropic.com";
/// Beta für `fallbacks: "default"` (serverseitiger Fallback nach Ablehnung, nur Claude API).
pub const BETA_FALLBACK_STANDARD: &str = "server-side-fallback-2026-07-01";
/// Beta für die Listenform `fallbacks: [{"model": …}]`.
pub const BETA_FALLBACK_LISTE: &str = "server-side-fallback-2026-06-01";
/// Großzügig: Ein Tiefencheck über das ganze Buch kann mehrere Minuten dauern.
pub const ZEITLIMIT: Duration = Duration::from_secs(600);
/// OpenAI-kompatibel: Lokale Modelle lesen ein ganzes Buch deutlich langsamer ein.
pub const ZEITLIMIT_OPENAI: Duration = Duration::from_secs(1800);
const VERBINDUNGS_ZEITLIMIT: Duration = Duration::from_secs(30);
/// Längere Retry-After-Angaben werden nicht abgewartet, sondern als Fehler gemeldet.
const MAX_RETRY_AFTER: u64 = 60;

/// Felder, die `count_tokens` annimmt. Alles andere (max_tokens, temperature, stream …)
/// lehnt der Endpunkt ab und wird vor dem Zählen entfernt (ebenso output_config, wie in
/// core/ki/anfrage.ts – für die Schätzung ohne Belang).
const TOKEN_FELDER: &[&str] = &[
    "model",
    "messages",
    "system",
    "tools",
    "tool_choice",
    "thinking",
    "mcp_servers",
    "context_management",
    "cache_control",
];

/// Wohin die Anfrage geht. Bestimmt Basis-URL, Schlüsselbund-Eintrag und Kopfzeilen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Anbieter {
    /// Claude in Microsoft Foundry (`https://<ressource>.services.ai.azure.com/anthropic`).
    #[default]
    Foundry,
    /// Claude API von Anthropic (`https://api.anthropic.com`).
    Claude,
    /// OpenAI-kompatible Chat-Completions-API (z. B. `http://localhost:11434/v1`). Schlüssel optional.
    OpenAi,
}

impl Anbieter {
    /// Aus dem Argument der Web-Oberfläche. Fehlt es, ist es Foundry (wie vor der Claude API).
    pub fn aus_text(wert: Option<&str>) -> Result<Self, KiFehler> {
        match wert.map(str::trim) {
            None | Some("" | "foundry") => Ok(Self::Foundry),
            Some("claude") => Ok(Self::Claude),
            Some("openai") => Ok(Self::OpenAi),
            Some(andere) => Err(KiFehler::Einstellung(Text::neu(
                format!(
                    "Unbekannter KI-Anbieter „{andere}“. Erwartet wird „foundry“, „claude“ oder „openai“."
                ),
                format!(
                    "Unknown AI provider “{andere}”. Expected “foundry”, “claude” or “openai”."
                ),
            ))),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Foundry => "Microsoft Foundry",
            Self::Claude => "Claude API",
            Self::OpenAi => "OpenAI-kompatibel",
        }
    }

    /// Zeitlimit je Anfrage.
    pub fn zeitlimit(self) -> Duration {
        match self {
            Self::OpenAi => ZEITLIMIT_OPENAI,
            _ => ZEITLIMIT,
        }
    }
}

/// Meldung auf Deutsch und Englisch; welche angezeigt wird, entscheidet der Aufrufer
/// (Oberflächensprache). `Display` zeigt die deutsche Fassung.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Text {
    pub de: String,
    pub en: String,
}

impl Text {
    pub fn neu(de: impl Into<String>, en: impl Into<String>) -> Self {
        Self {
            de: de.into(),
            en: en.into(),
        }
    }

    pub fn in_sprache(&self, englisch: bool) -> &str {
        if englisch {
            &self.en
        } else {
            &self.de
        }
    }
}

impl fmt::Display for Text {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.de)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KiFehler {
    /// Endpoint, Schlüssel oder Body sind unbrauchbar (kein Netzaufruf erfolgt).
    Einstellung(Text),
    /// Keine Verbindung (DNS, TLS, Netz weg).
    Verbindung(String),
    /// Keine Antwort innerhalb des Zeitlimits (in Minuten).
    Zeitueberschreitung { minuten: u64 },
    /// HTTP-Status ≠ 2xx.
    Http {
        status: u16,
        meldung: Option<String>,
        wiederholen_nach: Option<u64>,
    },
    /// 2xx, aber kein brauchbares JSON.
    Antwort(String),
}

impl KiFehler {
    pub fn status(&self) -> Option<u16> {
        match self {
            KiFehler::Http { status, .. } => Some(*status),
            _ => None,
        }
    }

    pub fn wiederholen_nach(&self) -> Option<u64> {
        match self {
            KiFehler::Http {
                wiederholen_nach, ..
            } => *wiederholen_nach,
            _ => None,
        }
    }
}

impl KiFehler {
    /// Meldung für die Oberfläche in der gewählten Sprache (Deutsch oder Englisch).
    pub fn meldung(&self, englisch: bool) -> String {
        let de = !englisch;
        match self {
            KiFehler::Einstellung(m) => m.in_sprache(englisch).to_string(),
            KiFehler::Verbindung(m) if de => format!(
                "Keine Verbindung zum KI-Endpoint. Bitte Internetverbindung (bei einem lokalen Modell: ob der Server läuft) und Endpoint-URL in den KI-Einstellungen prüfen. ({m})"
            ),
            KiFehler::Verbindung(m) => format!(
                "No connection to the AI endpoint. Please check the internet connection (for a local model: whether the server is running) and the endpoint URL in the AI settings. ({m})"
            ),
            KiFehler::Zeitueberschreitung { minuten } if de => format!(
                "Die KI hat nicht innerhalb von {minuten} Minuten geantwortet. Bitte später erneut versuchen."
            ),
            KiFehler::Zeitueberschreitung { minuten } => format!(
                "The AI did not answer within {minuten} minutes. Please try again later."
            ),
            KiFehler::Antwort(m) if de => {
                format!("Die Antwort des KI-Dienstes ist unbrauchbar: {m}")
            }
            KiFehler::Antwort(m) => format!("The response of the AI service is unusable: {m}"),
            KiFehler::Http {
                status,
                meldung,
                wiederholen_nach,
            } => {
                let zusatz = meldung
                    .as_deref()
                    .map(|m| {
                        if de {
                            format!(" Meldung des Dienstes: {m}")
                        } else {
                            format!(" Message from the service: {m}")
                        }
                    })
                    .unwrap_or_default();
                let status = *status;
                if de {
                    match status {
                        401 => "Der API-Schlüssel wurde abgelehnt (401). Bitte den Schlüssel in den KI-Einstellungen prüfen.".to_string(),
                        403 => format!("Zugriff verweigert (403). Bitte Schlüssel und Berechtigungen prüfen (Foundry-Ressource bzw. Anthropic-Konto).{zusatz}"),
                        404 => format!("Modell oder Endpoint nicht gefunden (404). Bitte in den KI-Einstellungen die Endpoint-URL und den Modell- bzw. Deployment-Namen prüfen.{zusatz}"),
                        408 | 504 => format!("Zeitüberschreitung beim KI-Dienst ({status}). Bitte später erneut versuchen."),
                        413 => "Die Anfrage ist zu groß für den KI-Dienst (413). Bitte einen kleineren Umfang prüfen.".to_string(),
                        429 => match wiederholen_nach {
                            Some(s) => format!("Zu viele Anfragen oder Kontingent erschöpft (429). Bitte später erneut versuchen – frühestens in {s} s."),
                            None => "Zu viele Anfragen oder Kontingent erschöpft (429). Bitte später erneut versuchen.".to_string(),
                        },
                        529 => "Der KI-Dienst ist gerade überlastet (529). Bitte später erneut versuchen.".to_string(),
                        500..=599 => format!("Der KI-Dienst meldet einen Fehler ({status}). Bitte später erneut versuchen.{zusatz}"),
                        400 => format!("Der KI-Dienst hat die Anfrage abgelehnt (400).{zusatz}"),
                        _ => format!("Unerwartete Antwort des KI-Dienstes ({status}).{zusatz}"),
                    }
                } else {
                    match status {
                        401 => "The API key was rejected (401). Please check the key in the AI settings.".to_string(),
                        403 => format!("Access denied (403). Please check the key and permissions (Foundry resource or Anthropic account).{zusatz}"),
                        404 => format!("Model or endpoint not found (404). Please check the endpoint URL and the model or deployment name in the AI settings.{zusatz}"),
                        408 | 504 => format!("The AI service timed out ({status}). Please try again later."),
                        413 => "The request is too large for the AI service (413). Please check a smaller scope.".to_string(),
                        429 => match wiederholen_nach {
                            Some(s) => format!("Too many requests or quota exhausted (429). Please try again later – in {s} s at the earliest."),
                            None => "Too many requests or quota exhausted (429). Please try again later.".to_string(),
                        },
                        529 => "The AI service is overloaded right now (529). Please try again later.".to_string(),
                        500..=599 => format!("The AI service reports an error ({status}). Please try again later.{zusatz}"),
                        400 => format!("The AI service rejected the request (400).{zusatz}"),
                        _ => format!("Unexpected response from the AI service ({status}).{zusatz}"),
                    }
                }
            }
        }
    }
}

impl fmt::Display for KiFehler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.meldung(false))
    }
}

impl std::error::Error for KiFehler {}

/// Basis-URL aus dem eingetragenen Endpoint, z. B.
/// `https://<ressource>.services.ai.azure.com/anthropic` (Foundry) oder
/// `https://api.anthropic.com` (Claude API; leer = dieser Standard). Akzeptiert auch
/// eingefügte Ziel-URIs mit `/v1/messages` am Ende. OpenAI-kompatibel: Basis-URL samt `/v1`
/// (z. B. `http://localhost:11434/v1`), ein angehängtes `/chat/completions` wird abgeschnitten.
/// Nur HTTPS (HTTP nur für localhost/Tests).
pub fn basis_url(anbieter: Anbieter, endpoint: &str) -> Result<String, KiFehler> {
    let mut e = endpoint.trim().trim_end_matches('/').to_string();
    if e.is_empty() {
        match anbieter {
            Anbieter::Claude => e = CLAUDE_API_ENDPOINT.to_string(),
            Anbieter::Foundry => return Err(KiFehler::Einstellung(Text::neu(
                "Kein KI-Endpoint eingetragen. Bitte in den KI-Einstellungen die Foundry-URL angeben (https://<ressource>.services.ai.azure.com/anthropic).",
                "No AI endpoint set. Please enter the Foundry URL in the AI settings (https://<resource>.services.ai.azure.com/anthropic).",
            ))),
            Anbieter::OpenAi => return Err(KiFehler::Einstellung(Text::neu(
                "Keine Basis-URL eingetragen. Bitte in den KI-Einstellungen die Adresse des Dienstes angeben (z. B. http://localhost:11434/v1).",
                "No base URL set. Please enter the address of the service in the AI settings (e.g. http://localhost:11434/v1).",
            ))),
        }
    }
    let beispiel = match anbieter {
        Anbieter::Foundry => "https://<ressource>.services.ai.azure.com/anthropic",
        Anbieter::Claude => CLAUDE_API_ENDPOINT,
        Anbieter::OpenAi => "http://localhost:11434/v1",
    };
    let endungen: &[&str] = match anbieter {
        Anbieter::OpenAi => &["/chat/completions"],
        _ => &["/v1/messages/count_tokens", "/v1/messages", "/v1"],
    };
    for endung in endungen {
        if e.to_ascii_lowercase().ends_with(endung) {
            e.truncate(e.len() - endung.len());
            e = e.trim_end_matches('/').to_string();
        }
    }
    let url = reqwest::Url::parse(&e).map_err(|_| {
        KiFehler::Einstellung(Text::neu(
            format!("Der KI-Endpoint „{e}“ ist keine gültige URL. Erwartet wird z. B. {beispiel}."),
            format!("The AI endpoint “{e}” is not a valid URL. Expected e.g. {beispiel}."),
        ))
    })?;
    let lokal = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    match url.scheme() {
        "https" => {}
        "http" if lokal => {}
        _ => {
            return Err(KiFehler::Einstellung(Text::neu(
                "Der KI-Endpoint muss mit https:// beginnen.",
                "The AI endpoint must start with https://.",
            )))
        }
    }
    if url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() {
        return Err(KiFehler::Einstellung(Text::neu(
            "Der KI-Endpoint darf keine Parameter (?…), Anker (#…) oder Zugangsdaten enthalten.",
            "The AI endpoint must not contain parameters (?…), anchors (#…) or credentials.",
        )));
    }
    Ok(e)
}

/// `POST`-Ziel für eine Nachricht.
pub fn nachrichten_url(anbieter: Anbieter, endpoint: &str) -> Result<String, KiFehler> {
    let basis = basis_url(anbieter, endpoint)?;
    Ok(match anbieter {
        Anbieter::OpenAi => format!("{basis}/chat/completions"),
        _ => format!("{basis}/v1/messages"),
    })
}

/// `POST`-Ziel für die Token-Zählung (OpenAI-kompatible Dienste haben keine; die App schätzt dann).
pub fn tokens_url(anbieter: Anbieter, endpoint: &str) -> Result<String, KiFehler> {
    if anbieter == Anbieter::OpenAi {
        return Err(KiFehler::Einstellung(Text::neu(
            "OpenAI-kompatible Dienste können keine Tokens zählen.",
            "OpenAI-compatible services cannot count tokens.",
        )));
    }
    Ok(format!(
        "{}/v1/messages/count_tokens",
        basis_url(anbieter, endpoint)?
    ))
}

/// Beta-Header für serverseitige Fallbacks: nur bei der Claude API und nur, wenn der Body
/// `fallbacks` enthält (`"default"` bzw. Liste). Foundry kennt keine serverseitigen Fallbacks.
pub fn beta_fuer(anbieter: Anbieter, body: &Value) -> Option<&'static str> {
    if anbieter != Anbieter::Claude {
        return None;
    }
    match body.get("fallbacks")? {
        Value::String(s) if s == "default" => Some(BETA_FALLBACK_STANDARD),
        Value::Array(_) => Some(BETA_FALLBACK_LISTE),
        _ => None,
    }
}

/// Body für `count_tokens`: nur die dort erlaubten Felder.
pub fn token_body(body: &Value) -> Result<Value, KiFehler> {
    let objekt = body.as_object().ok_or_else(|| {
        KiFehler::Einstellung(Text::neu(
            "Der KI-Request-Body muss ein JSON-Objekt sein.",
            "The AI request body must be a JSON object.",
        ))
    })?;
    let gefiltert: Map<String, Value> = objekt
        .iter()
        .filter(|(k, _)| TOKEN_FELDER.contains(&k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    Ok(Value::Object(gefiltert))
}

/// Kopfzeilen: `x-api-key`, `anthropic-version`, `content-type` und bei Bedarf `anthropic-beta`.
/// OpenAI-kompatibel: `content-type` und, falls ein Schlüssel hinterlegt ist, `Authorization: Bearer`.
pub fn kopfzeilen(
    anbieter: Anbieter,
    schluessel: &str,
    body: &Value,
) -> Result<HeaderMap, KiFehler> {
    let schluessel = schluessel.trim();
    if anbieter == Anbieter::OpenAi {
        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        if !schluessel.is_empty() {
            let mut wert = HeaderValue::from_str(&format!("Bearer {schluessel}")).map_err(|_| {
                KiFehler::Einstellung(Text::neu(
                    "Der gespeicherte API-Schlüssel enthält ungültige Zeichen. Bitte neu eintragen.",
                    "The stored API key contains invalid characters. Please enter it again.",
                ))
            })?;
            wert.set_sensitive(true);
            h.insert(AUTHORIZATION, wert);
        }
        return Ok(h);
    }
    if schluessel.is_empty() {
        return Err(KiFehler::Einstellung(Text::neu(
            "Kein API-Schlüssel hinterlegt. Bitte in den KI-Einstellungen eintragen.",
            "No API key stored. Please enter it in the AI settings.",
        )));
    }
    let mut wert = HeaderValue::from_str(schluessel).map_err(|_| {
        KiFehler::Einstellung(Text::neu(
            "Der gespeicherte API-Schlüssel enthält ungültige Zeichen. Bitte neu eintragen.",
            "The stored API key contains invalid characters. Please enter it again.",
        ))
    })?;
    wert.set_sensitive(true);
    let mut h = HeaderMap::new();
    h.insert("x-api-key", wert);
    h.insert(
        "anthropic-version",
        HeaderValue::from_static(ANTHROPIC_VERSION),
    );
    h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(beta) = beta_fuer(anbieter, body) {
        h.insert("anthropic-beta", HeaderValue::from_static(beta));
    }
    Ok(h)
}

/// Fehlermeldung aus einem Fehler-Body (Anthropic: `{error:{message}}`, Azure: `{error:{code,message}}`).
fn meldung_aus(text: &str) -> Option<String> {
    let v: Value = serde_json::from_str(text).ok()?;
    let fehler = v.get("error").unwrap_or(&v);
    let m = fehler
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| fehler.as_str())?
        .trim();
    if m.is_empty() {
        return None;
    }
    let mut kurz: String = m.chars().take(300).collect();
    if m.chars().count() > 300 {
        kurz.push('…');
    }
    Some(kurz)
}

fn wiederholen_nach(h: &HeaderMap) -> Option<u64> {
    h.get(RETRY_AFTER)?.to_str().ok()?.trim().parse().ok()
}

fn netzfehler(e: reqwest::Error, zeitlimit: Duration) -> KiFehler {
    if e.is_timeout() {
        return KiFehler::Zeitueberschreitung {
            minuten: zeitlimit.as_secs() / 60,
        };
    }
    let mut ursache: &dyn std::error::Error = &e;
    while let Some(innen) = ursache.source() {
        ursache = innen;
    }
    KiFehler::Verbindung(ursache.to_string())
}

#[derive(Clone)]
pub struct KiKlient {
    http: reqwest::Client,
    wartezeiten: Vec<Duration>,
}

impl KiKlient {
    pub fn neu() -> Result<Self, KiFehler> {
        // Zeitlimit je Anfrage (Anbieter::zeitlimit)
        let http = reqwest::Client::builder()
            .connect_timeout(VERBINDUNGS_ZEITLIMIT)
            .user_agent(concat!("Plotwerk/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| {
                KiFehler::Einstellung(Text::neu(
                    format!("HTTP-Client nicht verfügbar: {e}"),
                    format!("HTTP client not available: {e}"),
                ))
            })?;
        Ok(Self {
            http,
            wartezeiten: vec![Duration::from_secs(2), Duration::from_secs(8)],
        })
    }

    /// Für Tests: Wartezeiten zwischen den Wiederholungen (Anzahl = Wiederholungen).
    pub fn mit_wartezeiten(mut self, wartezeiten: Vec<Duration>) -> Self {
        self.wartezeiten = wartezeiten;
        self
    }

    async fn einmal(
        &self,
        url: &str,
        kopf: &HeaderMap,
        body: &Value,
        zeitlimit: Duration,
    ) -> Result<Value, KiFehler> {
        let antwort = self
            .http
            .post(url)
            .timeout(zeitlimit)
            .headers(kopf.clone())
            .json(body)
            .send()
            .await
            .map_err(|e| netzfehler(e, zeitlimit))?;
        let status = antwort.status();
        let retry = wiederholen_nach(antwort.headers());
        let text = antwort.text().await.map_err(|e| netzfehler(e, zeitlimit))?;
        if !status.is_success() {
            return Err(KiFehler::Http {
                status: status.as_u16(),
                meldung: if status == StatusCode::UNAUTHORIZED {
                    None
                } else {
                    meldung_aus(&text)
                },
                wiederholen_nach: retry,
            });
        }
        serde_json::from_str(&text).map_err(|_| KiFehler::Antwort("kein gültiges JSON".into()))
    }

    /// Mit höchstens zwei Wiederholungen bei 429/529/5xx (Retry-After wird beachtet).
    async fn post(
        &self,
        url: String,
        kopf: HeaderMap,
        body: &Value,
        zeitlimit: Duration,
    ) -> Result<Value, KiFehler> {
        let mut versuch = 0;
        loop {
            let fehler = match self.einmal(&url, &kopf, body, zeitlimit).await {
                Ok(v) => return Ok(v),
                Err(e) => e,
            };
            let Some(standard) = self.wartezeiten.get(versuch) else {
                return Err(fehler);
            };
            let warten = match &fehler {
                KiFehler::Http {
                    status: 429 | 500 | 502 | 503 | 504 | 529,
                    wiederholen_nach,
                    ..
                } => match wiederholen_nach {
                    Some(s) if *s > MAX_RETRY_AFTER => return Err(fehler),
                    Some(s) => Duration::from_secs(*s),
                    None => *standard,
                },
                _ => return Err(fehler),
            };
            tokio::time::sleep(warten).await;
            versuch += 1;
        }
    }

    /// POST {endpoint}/v1/messages (OpenAI-kompatibel: {endpoint}/chat/completions) – Body
    /// unverändert, Antwort-JSON unverändert.
    pub async fn nachricht(
        &self,
        anbieter: Anbieter,
        endpoint: &str,
        schluessel: &str,
        body: &Value,
    ) -> Result<Value, KiFehler> {
        if !body.is_object() {
            return Err(KiFehler::Einstellung(Text::neu(
                "Der KI-Request-Body muss ein JSON-Objekt sein.",
                "The AI request body must be a JSON object.",
            )));
        }
        let url = nachrichten_url(anbieter, endpoint)?;
        let kopf = kopfzeilen(anbieter, schluessel, body)?;
        self.post(url, kopf, body, anbieter.zeitlimit()).await
    }

    /// POST {endpoint}/v1/messages/count_tokens → `input_tokens`.
    pub async fn tokens_zaehlen(
        &self,
        anbieter: Anbieter,
        endpoint: &str,
        schluessel: &str,
        body: &Value,
    ) -> Result<u64, KiFehler> {
        let url = tokens_url(anbieter, endpoint)?;
        let body = token_body(body)?;
        let kopf = kopfzeilen(anbieter, schluessel, &body)?;
        let antwort = self.post(url, kopf, &body, anbieter.zeitlimit()).await?;
        antwort
            .get("input_tokens")
            .and_then(Value::as_u64)
            .ok_or_else(|| KiFehler::Antwort("input_tokens fehlt".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const F: Anbieter = Anbieter::Foundry;
    const C: Anbieter = Anbieter::Claude;
    const O: Anbieter = Anbieter::OpenAi;

    #[test]
    fn anbieter_aus_text() {
        assert_eq!(Anbieter::aus_text(None).unwrap(), F);
        assert_eq!(Anbieter::aus_text(Some("")).unwrap(), F);
        assert_eq!(Anbieter::aus_text(Some("foundry")).unwrap(), F);
        assert_eq!(Anbieter::aus_text(Some(" claude ")).unwrap(), C);
        assert_eq!(Anbieter::aus_text(Some("openai")).unwrap(), O);
        assert!(Anbieter::aus_text(Some("gemini")).is_err());
        assert_eq!(Anbieter::default(), F);
    }

    #[test]
    fn basis_url_normalisiert() {
        let b = "https://beispiel.services.ai.azure.com/anthropic";
        assert_eq!(basis_url(F, b).unwrap(), b);
        assert_eq!(basis_url(F, &format!(" {b}/ ")).unwrap(), b);
        assert_eq!(basis_url(F, &format!("{b}/v1/messages")).unwrap(), b);
        assert_eq!(
            basis_url(F, &format!("{b}/v1/messages/count_tokens")).unwrap(),
            b
        );
        assert_eq!(basis_url(F, &format!("{b}/v1/")).unwrap(), b);
    }

    #[test]
    fn basis_url_lehnt_ab() {
        assert!(basis_url(F, "").is_err());
        assert!(basis_url(F, "http://example.com/anthropic").is_err());
        assert!(basis_url(F, "ftp://example.com").is_err());
        assert!(basis_url(F, "kein url").is_err());
        assert!(basis_url(F, "https://a.example.com/anthropic?x=1").is_err());
        assert!(basis_url(F, "https://nutzer:pw@a.example.com/anthropic").is_err());
        assert!(basis_url(F, "http://127.0.0.1:9000").is_ok());
        assert!(basis_url(C, "http://api.anthropic.com").is_err());
        let e = basis_url(C, "kein url").unwrap_err().to_string();
        assert!(e.contains(CLAUDE_API_ENDPOINT), "{e}");
    }

    #[test]
    fn urls_je_anbieter() {
        let foundry = "https://beispiel.services.ai.azure.com/anthropic";
        assert_eq!(
            nachrichten_url(F, foundry).unwrap(),
            "https://beispiel.services.ai.azure.com/anthropic/v1/messages"
        );
        assert_eq!(
            tokens_url(F, &format!("{foundry}/")).unwrap(),
            "https://beispiel.services.ai.azure.com/anthropic/v1/messages/count_tokens"
        );
        // Claude API: leer = Standard-Basis-URL, eigene Basis-URL überschreibt
        assert_eq!(
            nachrichten_url(C, "").unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            tokens_url(C, "  ").unwrap(),
            "https://api.anthropic.com/v1/messages/count_tokens"
        );
        assert_eq!(
            nachrichten_url(C, "https://api.anthropic.com/v1/messages").unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            nachrichten_url(C, "https://proxy.example.com/claude/").unwrap(),
            "https://proxy.example.com/claude/v1/messages"
        );
        // Foundry ohne Endpoint: kein Aufruf, verständliche Meldung
        assert!(nachrichten_url(F, "")
            .unwrap_err()
            .to_string()
            .contains("Foundry-URL"));
    }

    #[test]
    fn token_body_filtert() {
        let b = json!({"model":"m","max_tokens":10,"temperature":0,"stream":false,"system":"s","messages":[],"fallbacks":"default"});
        assert_eq!(
            token_body(&b).unwrap(),
            json!({"model":"m","system":"s","messages":[]})
        );
        assert!(token_body(&json!([1])).is_err());
    }

    #[test]
    fn meldungen_deutsch() {
        let f = |s: u16| {
            KiFehler::Http {
                status: s,
                meldung: None,
                wiederholen_nach: None,
            }
            .to_string()
        };
        assert!(f(401).contains("Schlüssel"));
        assert!(f(404).contains("Deployment"));
        assert!(f(404).contains("Modell"));
        assert!(f(404).contains("Endpoint"));
        assert!(f(429).contains("später erneut"));
        assert!(f(529).contains("überlastet"));
        let mit = KiFehler::Http {
            status: 429,
            meldung: None,
            wiederholen_nach: Some(30),
        };
        assert!(mit.to_string().contains("30 s"));
        assert_eq!(mit.wiederholen_nach(), Some(30));
    }

    #[test]
    fn meldungen_englisch() {
        let http = |s: u16, meldung: Option<&str>| {
            KiFehler::Http {
                status: s,
                meldung: meldung.map(str::to_string),
                wiederholen_nach: None,
            }
            .meldung(true)
        };
        assert!(http(401, None).starts_with("The API key was rejected (401)."));
        assert!(http(404, Some("x")).ends_with("Message from the service: x"));
        assert!(http(529, None).contains("overloaded"));
        let ohne = basis_url(F, "").unwrap_err();
        assert!(ohne.meldung(true).starts_with("No AI endpoint set."));
        assert!(ohne
            .to_string()
            .starts_with("Kein KI-Endpoint eingetragen."));
        assert!(Anbieter::aus_text(Some("gemini"))
            .unwrap_err()
            .meldung(true)
            .contains("Unknown AI provider “gemini”"));
        assert!(KiFehler::Zeitueberschreitung { minuten: 30 }
            .meldung(true)
            .contains("did not answer within 30 minutes"));
        assert!(KiFehler::Verbindung("dns".into())
            .meldung(true)
            .starts_with("No connection to the AI endpoint."));
    }

    #[test]
    fn meldung_aus_body() {
        assert_eq!(
            meldung_aus(
                r#"{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens fehlt"}}"#
            ),
            Some("max_tokens fehlt".into())
        );
        assert_eq!(
            meldung_aus(r#"{"error":{"code":"DeploymentNotFound","message":"Deployment x"}}"#),
            Some("Deployment x".into())
        );
        assert_eq!(meldung_aus("<html>"), None);
    }

    #[test]
    fn schluessel_pruefung() {
        let b = json!({});
        assert!(kopfzeilen(F, "", &b).is_err());
        assert!(kopfzeilen(C, "a\nb", &b).is_err());
        let h = kopfzeilen(F, " abc ", &b).unwrap();
        assert_eq!(h["x-api-key"], "abc");
        assert!(h["x-api-key"].is_sensitive());
        assert_eq!(h["anthropic-version"], ANTHROPIC_VERSION);
    }

    #[test]
    fn kopfzeilen_je_anbieter() {
        let ohne = json!({"model":"claude-sonnet-5-5","messages":[]});
        let standard = json!({"model":"claude-sonnet-5-5","messages":[],"fallbacks":"default"});
        let liste = json!({"model":"claude-opus-5-5","fallbacks":[{"model":"claude-opus-5"}]});
        for anbieter in [F, C] {
            let h = kopfzeilen(anbieter, "sk-ant-x", &ohne).unwrap();
            assert_eq!(h["x-api-key"], "sk-ant-x");
            assert_eq!(h["anthropic-version"], "2023-06-01");
            assert_eq!(h[CONTENT_TYPE], "application/json");
            assert!(h.get("anthropic-beta").is_none());
            assert!(h.get("authorization").is_none());
            assert_eq!(h.len(), 3);
        }
        // Claude API: Beta-Header passend zur Form von `fallbacks`
        assert_eq!(
            kopfzeilen(C, "k", &standard).unwrap()["anthropic-beta"],
            BETA_FALLBACK_STANDARD
        );
        assert_eq!(
            kopfzeilen(C, "k", &liste).unwrap()["anthropic-beta"],
            BETA_FALLBACK_LISTE
        );
        assert_eq!(BETA_FALLBACK_STANDARD, "server-side-fallback-2026-07-01");
        // Foundry: nie ein Beta-Header
        assert!(kopfzeilen(F, "k", &standard)
            .unwrap()
            .get("anthropic-beta")
            .is_none());
        assert_eq!(beta_fuer(C, &json!({"fallbacks": "irgendwas"})), None);
    }

    #[test]
    fn openai_urls() {
        assert_eq!(
            nachrichten_url(O, "http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            nachrichten_url(O, " https://openrouter.ai/api/v1/chat/completions/ ").unwrap(),
            "https://openrouter.ai/api/v1/chat/completions"
        );
        // /v1 bleibt Teil der Basis-URL
        assert_eq!(
            basis_url(O, "https://api.openai.com/v1/").unwrap(),
            "https://api.openai.com/v1"
        );
        assert!(basis_url(O, "")
            .unwrap_err()
            .to_string()
            .contains("Basis-URL"));
        // HTTP nur lokal
        assert!(basis_url(O, "http://127.0.0.1:1234/v1").is_ok());
        assert!(basis_url(O, "http://example.com/v1").is_err());
        assert!(tokens_url(O, "http://localhost:11434/v1").is_err());
    }

    #[test]
    fn openai_kopfzeilen() {
        let b = json!({"model":"qwen3:8b","messages":[]});
        // lokal ohne Schlüssel: nur content-type
        let ohne = kopfzeilen(O, "", &b).unwrap();
        assert_eq!(ohne.len(), 1);
        assert_eq!(ohne[CONTENT_TYPE], "application/json");
        // mit Schlüssel: Bearer, kein x-api-key, keine anthropic-*-Kopfzeilen
        let mit = kopfzeilen(O, " sk-or-x ", &json!({"fallbacks":"default"})).unwrap();
        assert_eq!(mit[AUTHORIZATION], "Bearer sk-or-x");
        assert!(mit[AUTHORIZATION].is_sensitive());
        assert!(mit.get("x-api-key").is_none());
        assert!(mit.get("anthropic-version").is_none());
        assert!(mit.get("anthropic-beta").is_none());
        assert!(kopfzeilen(O, "a\nb", &b).is_err());
        assert_eq!(O.zeitlimit(), ZEITLIMIT_OPENAI);
        assert_eq!(C.zeitlimit(), ZEITLIMIT);
    }
}
