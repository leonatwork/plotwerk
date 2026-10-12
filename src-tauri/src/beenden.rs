//! Geordnetes Beenden: Die Oberfläche bekommt "app-beenden", legt Schnappschüsse an,
//! wartet auf ausstehende Schreibvorgänge und ruft dann app_beenden auf. Spätestens nach
//! 3 Sekunden wird trotzdem beendet.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, RunEvent, Window, WindowEvent};

pub const EREIGNIS: &str = "app-beenden";
pub const FRIST: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    Laeuft,
    Wartet,
    Frei,
}

pub struct Beenden {
    status: Mutex<Status>,
    signal: Condvar,
    /// Nach dem Speichern neu starten statt beenden (Update installiert)
    neustart: AtomicBool,
}

impl Default for Beenden {
    fn default() -> Self {
        Self {
            status: Mutex::new(Status::Laeuft),
            signal: Condvar::new(),
            neustart: AtomicBool::new(false),
        }
    }
}

impl Beenden {
    fn status(&self) -> Status {
        *self.status.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// true, wenn das Beenden jetzt neu angestoßen wurde.
    fn starten(&self) -> bool {
        let mut s = self.status.lock().unwrap_or_else(|e| e.into_inner());
        if *s != Status::Laeuft {
            return false;
        }
        *s = Status::Wartet;
        true
    }

    /// Oberfläche ist fertig (oder Frist abgelaufen).
    pub fn freigeben(&self) {
        *self.status.lock().unwrap_or_else(|e| e.into_inner()) = Status::Frei;
        self.signal.notify_all();
    }

    /// Wartet bis zur Freigabe, höchstens `frist`. true = rechtzeitig freigegeben.
    fn warten(&self, frist: Duration) -> bool {
        let ende = Instant::now() + frist;
        let mut s = self.status.lock().unwrap_or_else(|e| e.into_inner());
        while *s != Status::Frei {
            let rest = ende.saturating_duration_since(Instant::now());
            if rest.is_zero() {
                return false;
            }
            s = self
                .signal
                .wait_timeout(s, rest)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        true
    }
}

/// Beenden anstoßen (Menü „Plotwerk beenden“, Schließen des Hauptfensters, ExitRequested).
pub fn anfordern(app: &AppHandle) {
    let zustand = app.state::<crate::Zustand>();
    if !zustand.beenden.starten() {
        return;
    }
    let _ = app.emit(EREIGNIS, ());
    let app = app.clone();
    std::thread::spawn(move || {
        let zustand = app.state::<crate::Zustand>();
        if !zustand.beenden.warten(FRIST) {
            eprintln!("Plotwerk: Oberfläche hat das Beenden nicht innerhalb von 3 s bestätigt.");
        }
        zustand.beenden.freigeben();
        if zustand.beenden.neustart.load(Ordering::SeqCst) {
            app.restart();
        }
        app.exit(0);
    });
}

/// Wie `anfordern`, danach aber neu starten (nach einem installierten Update).
pub fn neu_starten(app: &AppHandle) {
    app.state::<crate::Zustand>()
        .beenden
        .neustart
        .store(true, Ordering::SeqCst);
    anfordern(app);
}

#[tauri::command]
pub fn app_beenden(zustand: tauri::State<'_, crate::Zustand>) {
    zustand.beenden.freigeben();
}

pub fn fensterereignis(fenster: &Window, ereignis: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = ereignis {
        let app = fenster.app_handle();
        if fenster.label() == "main"
            && app.state::<crate::Zustand>().beenden.status() != Status::Frei
        {
            api.prevent_close();
            anfordern(app);
        }
    }
}

pub fn laufzeitereignis(app: &AppHandle, ereignis: RunEvent) {
    match ereignis {
        RunEvent::ExitRequested { api, .. } => {
            if app.state::<crate::Zustand>().beenden.status() != Status::Frei {
                api.prevent_exit();
                anfordern(app);
            }
        }
        // ein laufendes `say` (Vorlesen-Rückfall) endet mit der App
        RunEvent::Exit => app.state::<crate::vorlesen::Vorleser>().stoppen(),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn freigabe_beendet_warten() {
        let b = Arc::new(Beenden::default());
        assert!(b.starten());
        assert!(!b.starten());
        let b2 = b.clone();
        let t = std::thread::spawn(move || b2.warten(Duration::from_secs(3)));
        std::thread::sleep(Duration::from_millis(50));
        b.freigeben();
        assert!(t.join().unwrap());
        assert_eq!(b.status(), Status::Frei);
    }

    #[test]
    fn frist_laeuft_ab() {
        let b = Beenden::default();
        assert!(b.starten());
        let start = Instant::now();
        assert!(!b.warten(Duration::from_millis(100)));
        assert!(start.elapsed() >= Duration::from_millis(100));
    }
}
