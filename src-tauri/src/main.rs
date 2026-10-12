// Kein Konsolenfenster unter Windows im Release (für macOS ohne Wirkung).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    plotwerk_lib::run()
}
