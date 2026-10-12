//! Natives Menü. Einträge mit der ID "befehl:<name>" gehen als Event "menue-befehl"
//! an die Oberfläche (src/backend/tauri → plotwerk:befehl → befehlAusfuehren).

use tauri::menu::{AboutMetadataBuilder, Menu, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub const EREIGNIS: &str = "menue-befehl";
const PRAEFIX: &str = "befehl:";
const BEENDEN: &str = "app:beenden";

/// Bereiche wie in src/app/bereiche.ts (⌘1–⌘7).
const BEREICHE: [(&str, &str, &str); 7] = [
    ("schreiben", "Schreiben", "1"),
    ("kapitel", "Kapitel-Überblick", "2"),
    ("akte", "Akte planen", "3"),
    ("figuren", "Figuren", "4"),
    ("beziehungen", "Beziehungen", "5"),
    ("orte", "Orte", "6"),
    ("hinweise", "Hinweise", "7"),
];

/// Werkzeug-Bereiche wie in src/app/bereiche.ts (Gruppe „Werkzeuge“; Taste leer = ohne Kürzel).
const WERKZEUGE: [(&str, &str, &str); 5] = [
    ("zeitleiste", "Zeitleiste", "8"),
    ("faeden", "Fäden", "9"),
    ("recherche", "Recherche", "0"),
    ("statistik", "Statistik", ""),
    ("fragen", "Fragen an das Buch", ""),
];

fn befehl<R: Runtime>(
    app: &AppHandle<R>,
    name: &str,
    text: &str,
    kuerzel: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let mut b = MenuItemBuilder::with_id(format!("{PRAEFIX}{name}"), text);
    if let Some(k) = kuerzel {
        b = b.accelerator(k);
    }
    b.build(app)
}

pub fn erstellen<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let info = AboutMetadataBuilder::new()
        .name(Some("Plotwerk"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .comments(Some("Romane schreiben und planen"))
        .build();
    let app_menue = SubmenuBuilder::new(app, "Plotwerk")
        .about_with_text("Über Plotwerk", Some(info))
        .item(
            &MenuItemBuilder::with_id(crate::aktualisierung::MENUE_ID, "Nach Updates suchen …")
                .build(app)?,
        )
        .separator()
        .item(&befehl(
            app,
            "einstellungen",
            "Einstellungen …",
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .services_with_text("Dienste")
        .separator()
        .hide_with_text("Plotwerk ausblenden")
        .hide_others_with_text("Andere ausblenden")
        .show_all_with_text("Alle einblenden")
        .separator()
        .item(
            &MenuItemBuilder::with_id(BEENDEN, "Plotwerk beenden")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    let ablage = SubmenuBuilder::new(app, "Ablage")
        .item(&befehl(
            app,
            "projekt-oeffnen",
            "Projekt öffnen …",
            Some("CmdOrCtrl+O"),
        )?)
        .separator()
        .item(&befehl(app, "import", "Word-Datei importieren …", None)?)
        .item(&befehl(
            app,
            "export",
            "Exportieren …",
            Some("CmdOrCtrl+E"),
        )?)
        .separator()
        .item(&befehl(
            app,
            "abgabe",
            "Für die Abgabe exportieren …",
            None,
        )?)
        .item(&befehl(
            app,
            "rueckimport",
            "Lektorat aus Word übernehmen …",
            None,
        )?)
        .separator()
        .item(&befehl(
            app,
            "recherche-neu",
            "Neuer Recherche-Eintrag …",
            None,
        )?)
        .item(&befehl(app, "faden-neu", "Neuer Faden …", None)?)
        .separator()
        .item(&befehl(app, "versionen", "Versionsverlauf …", None)?)
        .item(&befehl(
            app,
            "fassung",
            "Fassung sichern …",
            Some("CmdOrCtrl+Shift+S"),
        )?)
        .item(&befehl(
            app,
            "versionsvergleich",
            "Fassungen vergleichen …",
            None,
        )?)
        .separator()
        .close_window_with_text("Fenster schließen")
        .build()?;

    let bearbeiten = SubmenuBuilder::new(app, "Bearbeiten")
        .undo_with_text("Widerrufen")
        .redo_with_text("Wiederholen")
        .separator()
        .cut_with_text("Ausschneiden")
        .copy_with_text("Kopieren")
        .paste_with_text("Einsetzen")
        .select_all_with_text("Alles auswählen")
        .separator()
        .item(&befehl(
            app,
            "schnellsuche",
            "Schnellsuche …",
            Some("CmdOrCtrl+K"),
        )?)
        .build()?;

    let mut darstellung = SubmenuBuilder::new(app, "Darstellung");
    for (i, (id, titel, taste)) in BEREICHE.iter().chain(WERKZEUGE.iter()).enumerate() {
        if i == BEREICHE.len() {
            darstellung = darstellung.separator();
        }
        let kuerzel = (!taste.is_empty()).then(|| format!("CmdOrCtrl+{taste}"));
        darstellung = darstellung.item(&befehl(app, id, titel, kuerzel.as_deref())?);
    }
    let darstellung = darstellung
        .separator()
        .item(&befehl(
            app,
            "typewriter",
            "Typewriter-Modus",
            Some("CmdOrCtrl+Shift+T"),
        )?)
        .item(&befehl(
            app,
            "wiederholungen",
            "Wiederholungen markieren",
            None,
        )?)
        .item(&befehl(app, "vorlesen", "Vorlesen", None)?)
        .item(&befehl(
            app,
            "fokus",
            "Fokus-Modus",
            Some("CmdOrCtrl+Shift+F"),
        )?)
        .fullscreen_with_text("Vollbild")
        .build()?;

    let pruefen = SubmenuBuilder::new(app, "Prüfen")
        .item(&befehl(app, "pruefen", "Kapitel prüfen …", None)?)
        .item(&befehl(app, "buch-pruefen", "Buch prüfen …", None)?)
        .separator()
        .item(&befehl(
            app,
            "zeit-vorschlaege",
            "Zeitpunkte vorschlagen …",
            None,
        )?)
        .item(&befehl(
            app,
            "stimme-pruefen",
            "Figurenstimme prüfen …",
            None,
        )?)
        .item(&befehl(
            app,
            "leser-simulation",
            "Leser-Simulation …",
            None,
        )?)
        .item(&befehl(app, "marken", "Markennamen …", None)?)
        .build()?;

    let fenster = SubmenuBuilder::new(app, "Fenster")
        .minimize_with_text("Im Dock ablegen")
        .maximize_with_text("Zoomen")
        .separator()
        .bring_all_to_front_with_text("Alle nach vorne bringen")
        .build()?;

    Menu::with_items(
        app,
        &[
            &app_menue,
            &ablage,
            &bearbeiten,
            &darstellung,
            &pruefen,
            &fenster,
        ],
    )
}

pub fn ereignis(app: &AppHandle, e: MenuEvent) {
    let id = e.id().as_ref();
    if id == BEENDEN {
        crate::beenden::anfordern(app);
    } else if id == crate::aktualisierung::MENUE_ID {
        crate::aktualisierung::auf_wunsch(app);
    } else if let Some(name) = id.strip_prefix(PRAEFIX) {
        let _ = app.emit(EREIGNIS, name.to_string());
    }
}
