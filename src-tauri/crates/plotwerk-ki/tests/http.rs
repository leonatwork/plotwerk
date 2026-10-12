//! Transport gegen einen lokalen Test-Server (kein echtes Netz).

use plotwerk_ki::{Anbieter, KiFehler, KiKlient, ANTHROPIC_VERSION, BETA_FALLBACK_STANDARD};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const F: Anbieter = Anbieter::Foundry;
const C: Anbieter = Anbieter::Claude;

struct Anfrage {
    zeile: String,
    kopf: Vec<(String, String)>,
    body: Value,
}

impl Anfrage {
    fn kopf(&self, name: &str) -> Option<&str> {
        self.kopf
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

type Antwort = (&'static str, &'static str, &'static str);

/// Startet einen Server, der nacheinander je eine Verbindung mit den `antworten`
/// (Status, zusätzliche Kopfzeilen, Body) beantwortet.
async fn server_folge(antworten: Vec<Antwort>) -> (String, tokio::task::JoinHandle<Vec<Anfrage>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let adresse = format!("http://{}/anthropic", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        let mut anfragen = Vec::new();
        for (status, extra, body) in antworten {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut puffer = Vec::new();
            let mut teil = [0u8; 4096];
            let (kopf_ende, laenge) = loop {
                let n = sock.read(&mut teil).await.unwrap();
                puffer.extend_from_slice(&teil[..n]);
                if let Some(pos) = puffer.windows(4).position(|w| w == b"\r\n\r\n") {
                    let kopf = String::from_utf8_lossy(&puffer[..pos]).to_string();
                    let laenge = kopf
                        .lines()
                        .find_map(|z| {
                            let (k, v) = z.split_once(':')?;
                            k.eq_ignore_ascii_case("content-length")
                                .then(|| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    break (pos + 4, laenge);
                }
            };
            while puffer.len() < kopf_ende + laenge {
                let n = sock.read(&mut teil).await.unwrap();
                puffer.extend_from_slice(&teil[..n]);
            }
            let kopf = String::from_utf8_lossy(&puffer[..kopf_ende - 4]).to_string();
            let mut zeilen = kopf.lines();
            let zeile = zeilen.next().unwrap().to_string();
            let kopf = zeilen
                .filter_map(|z| z.split_once(':'))
                .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
                .collect();
            let erhalten = serde_json::from_slice(&puffer[kopf_ende..kopf_ende + laenge])
                .unwrap_or(Value::Null);
            let antwort = format!(
                "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n{body}",
                body.len()
            );
            sock.write_all(antwort.as_bytes()).await.unwrap();
            sock.shutdown().await.ok();
            anfragen.push(Anfrage {
                zeile,
                kopf,
                body: erhalten,
            });
        }
        anfragen
    });
    (adresse, handle)
}

/// Server für genau eine Anfrage.
async fn server(
    status: &'static str,
    extra: &'static str,
    body: &'static str,
) -> (String, tokio::task::JoinHandle<Anfrage>) {
    let (adresse, folge) = server_folge(vec![(status, extra, body)]).await;
    let handle = tokio::spawn(async move { folge.await.unwrap().pop().unwrap() });
    (adresse, handle)
}

/// Ohne Wiederholungen (für die Fehlerzuordnung).
fn klient() -> KiKlient {
    KiKlient::neu().unwrap().mit_wartezeiten(vec![])
}

#[tokio::test]
async fn nachricht_mit_kopfzeilen() {
    let (endpoint, server) = server(
        "200 OK",
        "",
        r#"{"content":[{"type":"text","text":"{}"}],"usage":{"input_tokens":3,"output_tokens":1}}"#,
    )
    .await;
    let body = json!({"model":"claude-sonnet-5-5","max_tokens":10,"messages":[{"role":"user","content":"Hallo"}]});
    let antwort = KiKlient::neu()
        .unwrap()
        .nachricht(F, &format!("{endpoint}/v1/messages"), "geheim", &body)
        .await
        .unwrap();
    assert_eq!(antwort["usage"]["input_tokens"], 3);
    let anfrage = server.await.unwrap();
    assert_eq!(anfrage.zeile, "POST /anthropic/v1/messages HTTP/1.1");
    assert_eq!(anfrage.kopf("x-api-key"), Some("geheim"));
    assert_eq!(anfrage.kopf("anthropic-version"), Some(ANTHROPIC_VERSION));
    assert_eq!(anfrage.kopf("content-type"), Some("application/json"));
    assert_eq!(anfrage.body, body);
}

#[tokio::test]
async fn tokens_zaehlen_filtert_body() {
    let (endpoint, server) = server("200 OK", "", r#"{"input_tokens":1234}"#).await;
    let body = json!({"model":"m","max_tokens":10,"temperature":0.2,"system":"s","messages":[]});
    let n = KiKlient::neu()
        .unwrap()
        .tokens_zaehlen(F, &endpoint, "k", &body)
        .await
        .unwrap();
    assert_eq!(n, 1234);
    let anfrage = server.await.unwrap();
    assert_eq!(
        anfrage.zeile,
        "POST /anthropic/v1/messages/count_tokens HTTP/1.1"
    );
    assert_eq!(
        anfrage.body,
        json!({"model":"m","system":"s","messages":[]})
    );
}

#[tokio::test]
async fn fehler_401() {
    let (endpoint, server) = server(
        "401 Unauthorized",
        "",
        r#"{"error":{"code":"401","message":"Access denied due to invalid subscription key"}}"#,
    )
    .await;
    let e = klient()
        .nachricht(F, &endpoint, "falsch", &json!({}))
        .await
        .unwrap_err();
    server.await.unwrap();
    assert_eq!(e.status(), Some(401));
    assert!(e.to_string().contains("Schlüssel"), "{e}");
}

#[tokio::test]
async fn fehler_404() {
    let (endpoint, server) = server(
        "404 Not Found",
        "",
        r#"{"error":{"code":"DeploymentNotFound","message":"The API deployment for this resource does not exist."}}"#,
    )
    .await;
    let e = klient()
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    server.await.unwrap();
    assert_eq!(e.status(), Some(404));
    assert!(e.to_string().contains("Deployment"), "{e}");
}

#[tokio::test]
async fn fehler_429_mit_retry_after() {
    let (endpoint, server) = server(
        "429 Too Many Requests",
        "retry-after: 17\r\n",
        r#"{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit"}}"#,
    )
    .await;
    let e = klient()
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    server.await.unwrap();
    assert_eq!(e.wiederholen_nach(), Some(17));
    assert!(e.to_string().contains("später erneut"), "{e}");
}

#[tokio::test]
async fn fehler_400_mit_meldung() {
    let (endpoint, server) = server(
        "400 Bad Request",
        "",
        r#"{"type":"error","error":{"type":"invalid_request_error","message":"messages: field required"}}"#,
    )
    .await;
    let e = klient()
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    server.await.unwrap();
    assert!(e.to_string().contains("messages: field required"), "{e}");
}

#[tokio::test]
async fn ungueltiges_json() {
    let (endpoint, server) = server("200 OK", "", "kein json").await;
    let e = klient()
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    server.await.unwrap();
    assert!(matches!(e, KiFehler::Antwort(_)));
}

#[tokio::test]
async fn keine_verbindung() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let adresse = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let e = klient()
        .nachricht(F, &adresse, "k", &json!({}))
        .await
        .unwrap_err();
    assert!(matches!(e, KiFehler::Verbindung(_)), "{e:?}");
    assert!(e.to_string().contains("Keine Verbindung"));
}

#[tokio::test]
async fn ohne_schluessel_kein_aufruf() {
    let e = klient()
        .nachricht(F, "https://example.invalid/anthropic", "  ", &json!({}))
        .await
        .unwrap_err();
    assert!(matches!(e, KiFehler::Einstellung(_)));
}

#[tokio::test]
async fn wiederholt_bei_429_und_529() {
    let (endpoint, server) = server_folge(vec![
        (
            "429 Too Many Requests",
            "retry-after: 0\r\n",
            r#"{"error":{"message":"langsam"}}"#,
        ),
        (
            "529 Overloaded",
            "",
            r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
        ),
        ("200 OK", "", r#"{"ok":true}"#),
    ])
    .await;
    let antwort = KiKlient::neu()
        .unwrap()
        .mit_wartezeiten(vec![Duration::from_millis(10), Duration::from_millis(10)])
        .nachricht(F, &endpoint, "k", &json!({"model":"m"}))
        .await
        .unwrap();
    assert_eq!(antwort, json!({"ok": true}));
    let anfragen = server.await.unwrap();
    assert_eq!(anfragen.len(), 3);
    assert!(anfragen.iter().all(|a| a.body == json!({"model":"m"})));
}

#[tokio::test]
async fn hoechstens_zwei_wiederholungen() {
    let (endpoint, server) = server_folge(vec![
        ("503 Service Unavailable", "", "{}"),
        ("503 Service Unavailable", "", "{}"),
        ("503 Service Unavailable", "", "{}"),
    ])
    .await;
    let e = KiKlient::neu()
        .unwrap()
        .mit_wartezeiten(vec![Duration::from_millis(5), Duration::from_millis(5)])
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    assert_eq!(e.status(), Some(503));
    assert_eq!(server.await.unwrap().len(), 3);
}

#[tokio::test]
async fn keine_wiederholung_bei_401_oder_langem_retry_after() {
    let (endpoint, server) = server_folge(vec![("401 Unauthorized", "", "{}")]).await;
    let k = KiKlient::neu()
        .unwrap()
        .mit_wartezeiten(vec![Duration::from_millis(5), Duration::from_millis(5)]);
    assert_eq!(
        k.nachricht(F, &endpoint, "k", &json!({}))
            .await
            .unwrap_err()
            .status(),
        Some(401)
    );
    assert_eq!(server.await.unwrap().len(), 1);

    let (endpoint, server) = server_folge(vec![(
        "429 Too Many Requests",
        "retry-after: 600\r\n",
        "{}",
    )])
    .await;
    let e = k
        .nachricht(F, &endpoint, "k", &json!({}))
        .await
        .unwrap_err();
    assert_eq!(e.wiederholen_nach(), Some(600));
    assert_eq!(server.await.unwrap().len(), 1);
}

#[tokio::test]
async fn reihenfolge_der_schluessel_bleibt_erhalten() {
    let (endpoint, server) = server("200 OK", "", r#"{"z":1,"a":2}"#).await;
    let body: Value = serde_json::from_str(r#"{"model":"m","messages":[],"output_config":{"format":{"schema":{"properties":{"zitate":{},"erklaerung":{}}}}}}"#).unwrap();
    let antwort = klient().nachricht(F, &endpoint, "k", &body).await.unwrap();
    assert_eq!(serde_json::to_string(&antwort).unwrap(), r#"{"z":1,"a":2}"#);
    let anfrage = server.await.unwrap();
    assert_eq!(
        serde_json::to_string(&anfrage.body).unwrap(),
        serde_json::to_string(&body).unwrap()
    );
    let props = anfrage.body["output_config"]["format"]["schema"]["properties"]
        .as_object()
        .unwrap();
    assert_eq!(
        props.keys().collect::<Vec<_>>(),
        vec!["zitate", "erklaerung"]
    );
}

#[tokio::test]
async fn claude_api_mit_fallback_header() {
    let (endpoint, server) = server(
        "200 OK",
        "",
        r#"{"model":"claude-sonnet-5-5","stop_reason":"end_turn","content":[{"type":"text","text":"{}"}]}"#,
    )
    .await;
    // Basis-URL ohne /anthropic (wie https://api.anthropic.com)
    let basis = endpoint.trim_end_matches("/anthropic").to_string();
    let body =
        json!({"model":"claude-sonnet-5-5","max_tokens":10,"messages":[],"fallbacks":"default"});
    klient()
        .nachricht(C, &basis, "sk-ant-test", &body)
        .await
        .unwrap();
    let anfrage = server.await.unwrap();
    assert_eq!(anfrage.zeile, "POST /v1/messages HTTP/1.1");
    assert_eq!(anfrage.kopf("x-api-key"), Some("sk-ant-test"));
    assert_eq!(anfrage.kopf("anthropic-version"), Some(ANTHROPIC_VERSION));
    assert_eq!(anfrage.kopf("content-type"), Some("application/json"));
    assert_eq!(anfrage.kopf("anthropic-beta"), Some(BETA_FALLBACK_STANDARD));
    assert_eq!(anfrage.body, body);
}

#[tokio::test]
async fn claude_api_tokens_ohne_fallback() {
    let (endpoint, server) = server("200 OK", "", r#"{"input_tokens":77}"#).await;
    let basis = endpoint.trim_end_matches("/anthropic").to_string();
    let body = json!({"model":"claude-opus-5-5","max_tokens":10,"system":"s","messages":[],"fallbacks":"default"});
    let n = klient()
        .tokens_zaehlen(C, &basis, "k", &body)
        .await
        .unwrap();
    assert_eq!(n, 77);
    let anfrage = server.await.unwrap();
    assert_eq!(anfrage.zeile, "POST /v1/messages/count_tokens HTTP/1.1");
    assert_eq!(anfrage.kopf("anthropic-beta"), None);
    assert_eq!(
        anfrage.body,
        json!({"model":"claude-opus-5-5","system":"s","messages":[]})
    );
}

#[tokio::test]
async fn foundry_ohne_beta_header() {
    let (endpoint, server) = server("200 OK", "", r#"{"ok":true}"#).await;
    klient()
        .nachricht(F, &endpoint, "k", &json!({"model":"claude-sonnet-5-5"}))
        .await
        .unwrap();
    let anfrage = server.await.unwrap();
    assert_eq!(anfrage.zeile, "POST /anthropic/v1/messages HTTP/1.1");
    assert_eq!(anfrage.kopf("anthropic-beta"), None);
}
