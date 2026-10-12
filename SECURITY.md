# Sicherheit

Bitte melde Sicherheitslücken **nicht** als öffentliches Issue, sondern vertraulich über
[„Report a vulnerability“](../../security/advisories/new) (GitHub Security Advisories).

Besonders interessant sind:

- Zugriff auf Dateien außerhalb des geöffneten Projektordners (Pfadwächter im Rust-Kern)
- Wege, auf denen ein API-Schlüssel den Rust-Kern verlässt (WebView, Logs, Projektordner)
- Daten, die entgegen der Allowlist an ein KI-Modell gehen (z. B. private Notizen)
- Manipulierte Updates (Updater-Signatur)

Du bekommst innerhalb einer Woche eine Antwort. Bitte gib uns Zeit für einen Fix, bevor du Details
veröffentlichst.

Unterstützt wird jeweils die neueste Version.
