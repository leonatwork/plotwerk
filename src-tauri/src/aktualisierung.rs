//! Updates über GitHub Releases (tauri-plugin-updater, Feed `latest.json`, signiert mit
//! ~/.tauri/plotwerk.key). Nie still im Hintergrund installieren: Plotwerk fragt immer und
//! startet danach über das geordnete Beenden neu, damit alle Schreibvorgänge fertig sind.
//!
//! Abgefragt wird nur der Feed; dabei gehen Version und Architektur mit, keine Projektdaten.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::sprache::{aktuell, t, Sprache};

pub const MENUE_ID: &str = "app:aktualisieren";

/// Wartezeit nach dem Start, damit die Prüfung das Öffnen des Projekts nicht bremst.
const START_VERZOEGERUNG: Duration = Duration::from_secs(10);

static LAEUFT: AtomicBool = AtomicBool::new(false);

/// Stille Prüfung beim Start (nur Release-Builds): meldet sich nur, wenn es ein Update gibt.
pub fn beim_start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(START_VERZOEGERUNG);
        tauri::async_runtime::block_on(pruefen(app, false));
    });
}

/// Menü „Nach Updates suchen …“: meldet auch „aktuell“ und Fehler.
pub fn auf_wunsch(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { pruefen(app, true).await });
}

async fn pruefen(app: AppHandle, gefragt: bool) {
    if LAEUFT.swap(true, Ordering::SeqCst) {
        return;
    }
    let ergebnis = pruefen_und_installieren(&app, gefragt).await;
    LAEUFT.store(false, Ordering::SeqCst);
    if let Err(fehler) = ergebnis {
        eprintln!("Plotwerk: Update fehlgeschlagen: {fehler}");
        if gefragt {
            meldung(
                &app,
                MessageDialogKind::Error,
                t("Update nicht möglich", "Update not possible"),
                &match aktuell() {
                    Sprache::De => {
                        format!("Die Suche nach Updates ist fehlgeschlagen.\n\n{fehler}")
                    }
                    Sprache::En => format!("Checking for updates failed.\n\n{fehler}"),
                },
            );
        }
    }
}

async fn pruefen_und_installieren(app: &AppHandle, gefragt: bool) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let Some(update) = update else {
        if gefragt {
            meldung(
                app,
                MessageDialogKind::Info,
                t("Plotwerk ist aktuell", "Plotwerk is up to date"),
                &match aktuell() {
                    Sprache::De => format!(
                        "Du verwendest die neueste Version ({}).",
                        installierte_version(app)
                    ),
                    Sprache::En => format!(
                        "You are using the latest version ({}).",
                        installierte_version(app)
                    ),
                },
            );
        }
        return Ok(());
    };

    let mut text = match aktuell() {
        Sprache::De => format!(
            "Plotwerk {} ist verfügbar (installiert: {}).",
            update.version, update.current_version
        ),
        Sprache::En => format!(
            "Plotwerk {} is available (installed: {}).",
            update.version, update.current_version
        ),
    };
    if let Some(notizen) = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        text.push_str("\n\n");
        text.push_str(notizen);
    }
    text.push_str("\n\n");
    text.push_str(t(
        "Plotwerk speichert alles und startet nach der Installation neu.",
        "Plotwerk saves everything and restarts after the installation.",
    ));

    let app_frage = app.clone();
    let installieren = tauri::async_runtime::spawn_blocking(move || {
        app_frage
            .dialog()
            .message(text)
            .title(t("Update verfügbar", "Update available"))
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                t("Installieren", "Install").into(),
                t("Später", "Later").into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if !installieren {
        return Ok(());
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    crate::beenden::neu_starten(app);
    Ok(())
}

fn installierte_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn meldung(app: &AppHandle, art: MessageDialogKind, titel: &str, text: &str) {
    app.dialog()
        .message(text)
        .title(titel)
        .kind(art)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}
