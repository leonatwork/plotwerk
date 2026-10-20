//! Plotwerk – Rust-Kern der Mac-App.

mod aktualisierung;
mod beenden;
mod dateien;
mod einstellungen;
mod extern_dateien;
mod index;
mod ki;
mod menue;
mod pfad;
mod projekt;
mod recherche;
mod schluessel;
mod sicherungen;
mod sprache;
mod ueberwachung;
mod vorlesen;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub struct Zustand {
    projekte: Mutex<projekt::Projekte>,
    eigene: ueberwachung::EigeneSchreibvorgaenge,
    waechter: Mutex<Option<notify::RecommendedWatcher>>,
    /// Serialisiert Lesen/Schreiben von einstellungen.json
    einstellungen: Mutex<()>,
    extern_lesen: Mutex<HashSet<PathBuf>>,
    extern_schreiben: Mutex<HashSet<PathBuf>>,
    archiv_lesen: Mutex<HashSet<PathBuf>>,
    archiv_schreiben: Mutex<()>,
    /// Vom Öffnen-/Neu-Dialog gelieferte Projektordner
    erlaubt: Mutex<HashSet<PathBuf>>,
    ki: OnceLock<plotwerk_ki::KiKlient>,
    beenden: beenden::Beenden,
}

impl Default for Zustand {
    fn default() -> Self {
        Self {
            projekte: Mutex::default(),
            eigene: ueberwachung::EigeneSchreibvorgaenge::default(),
            waechter: Mutex::new(None),
            einstellungen: Mutex::new(()),
            extern_lesen: Mutex::default(),
            extern_schreiben: Mutex::default(),
            archiv_lesen: Mutex::default(),
            archiv_schreiben: Mutex::default(),
            erlaubt: Mutex::default(),
            ki: OnceLock::new(),
            beenden: beenden::Beenden::default(),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(index::DATENBANK, index::migrationen())
                .build(),
        )
        .manage(Zustand::default())
        .manage(vorlesen::Vorleser::default())
        .menu(menue::beim_start)
        .on_menu_event(menue::ereignis)
        .on_window_event(beenden::fensterereignis)
        .setup(|app| {
            aktualisierung::beim_start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projekt::projekt_oeffnen,
            projekt::projekt_letztes,
            projekt::projekt_waehlen,
            projekt::projekt_neu,
            projekt::fs_lesen,
            projekt::fs_schreiben,
            projekt::fs_auflisten,
            projekt::fs_existiert,
            projekt::fs_entfernen,
            projekt::fs_lesen_binaer,
            projekt::fs_schreiben_binaer,
            projekt::einstellung_lesen,
            projekt::einstellung_schreiben,
            extern_dateien::datei_waehlen,
            extern_dateien::datei_lesen_extern,
            extern_dateien::datei_speichern,
            extern_dateien::datei_schreiben_extern,
            sicherungen::archiv_einstellungen,
            sicherungen::archiv_einstellen,
            sicherungen::archiv_ort_waehlen,
            sicherungen::archiv_info,
            sicherungen::archiv_projekt_lesen,
            sicherungen::archiv_schreiben,
            sicherungen::archiv_entfernen,
            sicherungen::archiv_liste,
            sicherungen::archiv_waehlen,
            sicherungen::archiv_lesen,
            sicherungen::archiv_wiederherstellen,
            ki::schluessel_setzen,
            ki::schluessel_vorhanden,
            ki::schluessel_loeschen,
            ki::ki_anfrage,
            ki::ki_tokens,
            recherche::link_oeffnen,
            vorlesen::vorlesen_stimmen,
            vorlesen::vorlesen_sagen,
            vorlesen::vorlesen_stopp,
            beenden::app_beenden,
            sprache::sprache_info,
            sprache::sprache_setzen,
        ])
        .build(tauri::generate_context!())
        .expect("Plotwerk konnte nicht gestartet werden")
        .run(beenden::laufzeitereignis);
}
