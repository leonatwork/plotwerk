//! Natives Menü. Einträge mit der ID "befehl:<name>" gehen als Event "menue-befehl"
//! an die Oberfläche (src/backend/tauri → plotwerk:befehl → befehlAusfuehren).
//! Beschriftungen in der Oberflächensprache (crate::sprache); `sprache_setzen` baut das Menü neu.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::sprache::t;

pub const EREIGNIS: &str = "menue-befehl";
const PRAEFIX: &str = "befehl:";
const BEENDEN: &str = "app:beenden";

/// Bereiche wie in src/app/bereiche.ts (⌘1–⌘7): ID, deutsch, englisch, Taste.
const BEREICHE: [(&str, &str, &str, &str); 7] = [
    ("schreiben", "Schreiben", "Write", "1"),
    ("kapitel", "Kapitel-Überblick", "Chapter Overview", "2"),
    ("akte", "Akte planen", "Plan Acts", "3"),
    ("figuren", "Figuren", "Characters", "4"),
    ("beziehungen", "Beziehungen", "Relationships", "5"),
    ("orte", "Orte", "Places", "6"),
    ("hinweise", "Hinweise", "Notes", "7"),
];

/// Werkzeug-Bereiche wie in src/app/bereiche.ts (Gruppe „Werkzeuge“; Taste leer = ohne Kürzel).
const WERKZEUGE: [(&str, &str, &str, &str); 5] = [
    ("zeitleiste", "Zeitleiste", "Timeline", "8"),
    ("faeden", "Fäden", "Threads", "9"),
    ("recherche", "Recherche", "Research", "0"),
    ("statistik", "Statistik", "Statistics", ""),
    ("fragen", "Fragen an das Buch", "Questions", ""),
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

/// Menü beim Start: zuerst die gespeicherte Sprache laden.
pub fn beim_start(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    if let Some(zustand) = app.try_state::<crate::Zustand>() {
        crate::sprache::laden(app, &zustand);
    }
    erstellen(app)
}

pub fn erstellen<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let info = AboutMetadataBuilder::new()
        .name(Some("Plotwerk"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .comments(Some(t(
            "Romane schreiben und planen",
            "Write and plan novels",
        )))
        .build();
    let app_menue = SubmenuBuilder::new(app, "Plotwerk")
        .about_with_text(t("Über Plotwerk", "About Plotwerk"), Some(info))
        .item(
            &MenuItemBuilder::with_id(
                crate::aktualisierung::MENUE_ID,
                t("Nach Updates suchen …", "Check for Updates…"),
            )
            .build(app)?,
        )
        .separator()
        .item(&befehl(
            app,
            "einstellungen",
            t("Einstellungen …", "Settings…"),
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .services_with_text(t("Dienste", "Services"))
        .separator()
        .hide_with_text(t("Plotwerk ausblenden", "Hide Plotwerk"))
        .hide_others_with_text(t("Andere ausblenden", "Hide Others"))
        .show_all_with_text(t("Alle einblenden", "Show All"))
        .separator()
        .item(
            &MenuItemBuilder::with_id(BEENDEN, t("Plotwerk beenden", "Quit Plotwerk"))
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    let ablage = SubmenuBuilder::new(app, t("Ablage", "File"))
        .item(&befehl(
            app,
            "projekt-oeffnen",
            t("Projekt öffnen …", "Open Project…"),
            Some("CmdOrCtrl+O"),
        )?)
        .separator()
        .item(&befehl(
            app,
            "import",
            t("Word-Datei importieren …", "Import Word File…"),
            None,
        )?)
        .item(&befehl(
            app,
            "export",
            t("Exportieren …", "Export…"),
            Some("CmdOrCtrl+E"),
        )?)
        .separator()
        .item(&befehl(
            app,
            "abgabe",
            t("Für die Abgabe exportieren …", "Export for Submission…"),
            None,
        )?)
        .item(&befehl(
            app,
            "rueckimport",
            t(
                "Lektorat aus Word übernehmen …",
                "Import Editor’s Changes from Word…",
            ),
            None,
        )?)
        .separator()
        .item(&befehl(
            app,
            "recherche-neu",
            t("Neuer Recherche-Eintrag …", "New Research Entry…"),
            None,
        )?)
        .item(&befehl(
            app,
            "faden-neu",
            t("Neuer Faden …", "New Thread…"),
            None,
        )?)
        .separator()
        .item(&befehl(
            app,
            "versionen",
            t("Versionsverlauf …", "Version History…"),
            None,
        )?)
        .item(&befehl(
            app,
            "fassung",
            t("Fassung sichern …", "Save Draft Version…"),
            Some("CmdOrCtrl+Shift+S"),
        )?)
        .item(&befehl(
            app,
            "versionsvergleich",
            t("Fassungen vergleichen …", "Compare Draft Versions…"),
            None,
        )?)
        .separator()
        .close_window_with_text(t("Fenster schließen", "Close Window"))
        .build()?;

    let bearbeiten = SubmenuBuilder::new(app, t("Bearbeiten", "Edit"))
        .undo_with_text(t("Widerrufen", "Undo"))
        .redo_with_text(t("Wiederholen", "Redo"))
        .separator()
        .cut_with_text(t("Ausschneiden", "Cut"))
        .copy_with_text(t("Kopieren", "Copy"))
        .paste_with_text(t("Einsetzen", "Paste"))
        .select_all_with_text(t("Alles auswählen", "Select All"))
        .separator()
        .item(&befehl(
            app,
            "schnellsuche",
            t("Schnellsuche …", "Quick Search…"),
            Some("CmdOrCtrl+K"),
        )?)
        .build()?;

    let mut darstellung = SubmenuBuilder::new(app, t("Darstellung", "View"));
    for (i, (id, de, en, taste)) in BEREICHE.iter().chain(WERKZEUGE.iter()).enumerate() {
        let titel = t(de, en);
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
            "ui-vergroessern",
            t("Vergrößern", "Zoom In"),
            None,
        )?)
        .item(&befehl(
            app,
            "ui-verkleinern",
            t("Verkleinern", "Zoom Out"),
            None,
        )?)
        .item(&befehl(
            app,
            "ui-originalgroesse",
            t("Originalgröße", "Actual Size"),
            None,
        )?)
        .separator()
        .item(&befehl(
            app,
            "typewriter",
            t("Typewriter-Modus", "Typewriter Mode"),
            Some("CmdOrCtrl+Shift+T"),
        )?)
        .item(&befehl(
            app,
            "wiederholungen",
            t("Wiederholungen markieren", "Highlight Repetitions"),
            None,
        )?)
        .item(&befehl(app, "vorlesen", t("Vorlesen", "Read Aloud"), None)?)
        .item(&befehl(
            app,
            "fokus",
            t("Fokus-Modus", "Focus Mode"),
            Some("CmdOrCtrl+Shift+F"),
        )?)
        .fullscreen_with_text(t("Vollbild", "Enter Full Screen"))
        .build()?;

    let pruefen = SubmenuBuilder::new(app, t("Prüfen", "Check"))
        .item(&befehl(
            app,
            "pruefen",
            t("Kapitel prüfen …", "Check Chapter…"),
            None,
        )?)
        .item(&befehl(
            app,
            "buch-pruefen",
            t("Buch prüfen …", "Check Book…"),
            None,
        )?)
        .separator()
        .item(&befehl(
            app,
            "zeit-vorschlaege",
            t("Zeitpunkte vorschlagen …", "Suggest Times…"),
            None,
        )?)
        .item(&befehl(
            app,
            "stimme-pruefen",
            t("Figurenstimme prüfen …", "Check Character Voice…"),
            None,
        )?)
        .item(&befehl(
            app,
            "leser-simulation",
            t("Leser-Simulation …", "Reader Simulation…"),
            None,
        )?)
        .item(&befehl(
            app,
            "marken",
            t("Markennamen …", "Brand Names…"),
            None,
        )?)
        .build()?;

    let fenster = SubmenuBuilder::new(app, t("Fenster", "Window"))
        .minimize_with_text(t("Im Dock ablegen", "Minimize"))
        .maximize_with_text(t("Zoomen", "Zoom"))
        .separator()
        .bring_all_to_front_with_text(t("Alle nach vorne bringen", "Bring All to Front"))
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
