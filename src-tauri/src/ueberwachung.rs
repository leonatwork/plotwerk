//! Dateiüberwachung des Projektordners: externe Änderungen → Event "datei-geaendert".

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::dateien::ist_hilfsdatei;
use crate::pfad::Wurzel;

pub const EREIGNIS: &str = "datei-geaendert";
/// Eigene Schreibvorgänge innerhalb dieses Zeitfensters lösen kein Ereignis aus.
pub const EIGENE_FRIST: Duration = Duration::from_secs(2);

#[derive(Clone, Serialize)]
pub struct DateiGeaendert {
    pub pfad: String,
}

/// Zuletzt von der App selbst geschriebene Dateien (absoluter Pfad → Zeitpunkt).
#[derive(Clone, Default)]
pub struct EigeneSchreibvorgaenge(Arc<Mutex<HashMap<PathBuf, Instant>>>);

impl EigeneSchreibvorgaenge {
    pub fn merken(&self, pfad: &Path) {
        let mut m = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let jetzt = Instant::now();
        m.retain(|_, t| jetzt.duration_since(*t) < EIGENE_FRIST * 5);
        m.insert(pfad.to_path_buf(), jetzt);
    }

    pub fn ist_eigen(&self, pfad: &Path) -> bool {
        let m = self.0.lock().unwrap_or_else(|e| e.into_inner());
        m.get(pfad).is_some_and(|t| t.elapsed() < EIGENE_FRIST)
    }
}

/// Relativer Pfad, wenn das Ereignis gemeldet werden soll.
pub fn meldepfad(wurzel: &Wurzel, eigene: &EigeneSchreibvorgaenge, pfad: &Path) -> Option<String> {
    let rel = wurzel.relativ(pfad)?;
    let erster = rel.split('/').next().unwrap_or_default();
    if erster == ".versionen" || erster == ".git" {
        return None;
    }
    if rel.split('/').any(ist_hilfsdatei) {
        return None;
    }
    if pfad.is_dir() || eigene.ist_eigen(pfad) {
        return None;
    }
    Some(rel)
}

pub fn starten(
    app: AppHandle,
    wurzel: Wurzel,
    eigene: EigeneSchreibvorgaenge,
) -> notify::Result<RecommendedWatcher> {
    let ordner = wurzel.pfad().to_path_buf();
    let mut waechter = notify::recommended_watcher(move |ergebnis: notify::Result<Event>| {
        let Ok(ereignis) = ergebnis else { return };
        if matches!(ereignis.kind, EventKind::Access(_)) {
            return;
        }
        for pfad in &ereignis.paths {
            if let Some(rel) = meldepfad(&wurzel, &eigene, pfad) {
                let _ = app.emit(EREIGNIS, DateiGeaendert { pfad: rel });
            }
        }
    })?;
    waechter.watch(&ordner, RecursiveMode::Recursive)?;
    Ok(waechter)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filtert_versionen_hilfsdateien_und_eigene() {
        let tmp = tempfile::tempdir().unwrap();
        let w = Wurzel::neu(tmp.path()).unwrap();
        let eigene = EigeneSchreibvorgaenge::default();
        let p = |r: &str| w.pfad().join(r);
        std::fs::create_dir_all(p("manuskript")).unwrap();
        assert_eq!(
            meldepfad(&w, &eigene, &p("manuskript/lotte.md")).as_deref(),
            Some("manuskript/lotte.md")
        );
        assert_eq!(
            meldepfad(&w, &eigene, &p(".versionen/manuskript/lotte.md/x.md")),
            None
        );
        assert_eq!(
            meldepfad(&w, &eigene, &p("manuskript/.lotte.md.plotwerk-1-1.tmp")),
            None
        );
        assert_eq!(meldepfad(&w, &eigene, &p(".DS_Store")), None);
        assert_eq!(meldepfad(&w, &eigene, &p("manuskript")), None);
        assert_eq!(meldepfad(&w, &eigene, Path::new("/etc/hosts")), None);
        eigene.merken(&p("manuskript/lotte.md"));
        assert_eq!(meldepfad(&w, &eigene, &p("manuskript/lotte.md")), None);
        assert_eq!(
            meldepfad(&w, &eigene, &p(".plotwerk/hinweise.json")).as_deref(),
            Some(".plotwerk/hinweise.json")
        );
    }

    #[test]
    fn meldet_externe_aenderung() {
        use std::sync::mpsc;
        let tmp = tempfile::tempdir().unwrap();
        let w = Wurzel::neu(tmp.path()).unwrap();
        let eigene = EigeneSchreibvorgaenge::default();
        let (tx, rx) = mpsc::channel();
        let wurzel = w.clone();
        let e2 = eigene.clone();
        let mut waechter = notify::recommended_watcher(move |r: notify::Result<Event>| {
            if let Ok(ev) = r {
                for p in &ev.paths {
                    if let Some(rel) = meldepfad(&wurzel, &e2, p) {
                        let _ = tx.send(rel);
                    }
                }
            }
        })
        .unwrap();
        waechter.watch(w.pfad(), RecursiveMode::Recursive).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        // eigener Schreibvorgang: wird ignoriert
        let eigen = w.pfad().join("eigen.md");
        eigene.merken(&eigen);
        crate::dateien::schreiben_atomar(&eigen, b"x").unwrap();
        // externer Schreibvorgang: wird gemeldet
        std::fs::write(w.pfad().join("extern.md"), "x").unwrap();
        let mut gemeldet = Vec::new();
        let ende = Instant::now() + Duration::from_secs(5);
        while Instant::now() < ende {
            if let Ok(rel) = rx.recv_timeout(Duration::from_millis(200)) {
                gemeldet.push(rel);
                if gemeldet.iter().any(|r| r == "extern.md") {
                    std::thread::sleep(Duration::from_millis(300));
                    gemeldet.extend(rx.try_iter());
                    break;
                }
            }
        }
        assert!(gemeldet.iter().any(|r| r == "extern.md"), "{gemeldet:?}");
        assert!(!gemeldet.iter().any(|r| r == "eigen.md"), "{gemeldet:?}");
    }
}
