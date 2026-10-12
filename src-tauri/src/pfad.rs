//! Pfadwächter: Projektpfade sind relativ, ohne „..“, und verlassen die Projektwurzel
//! auch über Symlinks nicht.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Wurzel {
    pfad: PathBuf,
}

/// Prüft einen relativen Projektpfad und liefert ihn normalisiert ("a/b/c.md").
/// Gleiche Regeln wie `pruefePfad` in core/projekt/memoryFs.ts, dazu: keine NUL-Bytes,
/// keine Laufwerksbuchstaben, kein „~“ am Anfang.
pub fn normalisieren(pfad: &str) -> Result<String, String> {
    if pfad.contains('\0') {
        return Err(crate::tf!(
            "Ungültiges Zeichen im Pfad: {pfad:?}",
            "Invalid character in path: {pfad:?}"
        ));
    }
    let roh = pfad.replace('\\', "/");
    let ist_laufwerk =
        roh.len() >= 2 && roh.as_bytes()[1] == b':' && roh.as_bytes()[0].is_ascii_alphabetic();
    if roh.starts_with('/') || ist_laufwerk || roh.starts_with('~') {
        return Err(crate::tf!(
            "Absoluter Pfad nicht erlaubt: {pfad}",
            "Absolute path not allowed: {pfad}"
        ));
    }
    let mut teile = Vec::new();
    for teil in roh.split('/') {
        match teil {
            "" | "." => {}
            ".." => {
                return Err(crate::tf!(
                    "„..“ im Pfad nicht erlaubt: {pfad}",
                    "“..” not allowed in path: {pfad}"
                ))
            }
            t => teile.push(t),
        }
    }
    Ok(teile.join("/"))
}

impl Wurzel {
    /// Projektordner (absolut, muss existieren und ein Ordner sein).
    pub fn neu(pfad: &Path) -> Result<Self, String> {
        if !pfad.is_absolute() {
            return Err(crate::tf!(
                "Projektordner muss absolut angegeben werden: {}",
                "The project folder must be an absolute path: {}",
                pfad.display()
            ));
        }
        let kanonisch = pfad.canonicalize().map_err(|e| {
            crate::tf!(
                "Projektordner nicht gefunden: {} ({e})",
                "Project folder not found: {} ({e})",
                pfad.display()
            )
        })?;
        if !kanonisch.is_dir() {
            return Err(crate::tf!(
                "Kein Ordner: {}",
                "Not a folder: {}",
                kanonisch.display()
            ));
        }
        if kanonisch.parent().is_none() {
            return Err(crate::sprache::t(
                "Das Wurzelverzeichnis kann kein Projektordner sein.",
                "The root directory cannot be a project folder.",
            )
            .into());
        }
        Ok(Self { pfad: kanonisch })
    }

    pub fn pfad(&self) -> &Path {
        &self.pfad
    }

    /// Absoluter Pfad zu einem relativen Projektpfad. `leer_erlaubt` gilt für Ordner
    /// (`''` = Projektwurzel). Existierende Teile des Pfads dürfen über Symlinks nicht
    /// aus der Wurzel herausführen.
    pub fn aufloesen(&self, relativ: &str, leer_erlaubt: bool) -> Result<PathBuf, String> {
        let norm = normalisieren(relativ)?;
        if norm.is_empty() && !leer_erlaubt {
            return Err(crate::sprache::t("Leerer Pfad", "Empty path").into());
        }
        let mut aktuell = self.pfad.clone();
        for teil in norm.split('/').filter(|t| !t.is_empty()) {
            aktuell.push(teil);
            match std::fs::symlink_metadata(&aktuell) {
                Ok(meta) if meta.file_type().is_symlink() => {
                    let ziel = aktuell.canonicalize().map_err(|_| {
                        crate::tf!("Verweis ins Leere: {relativ}", "Broken link: {relativ}")
                    })?;
                    if !ziel.starts_with(&self.pfad) {
                        return Err(crate::tf!(
                            "Pfad verlässt den Projektordner: {relativ}",
                            "Path leaves the project folder: {relativ}"
                        ));
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        Ok(self.pfad.join(norm))
    }

    /// Relativer Projektpfad ("a/b.md") zu einem absoluten Pfad innerhalb der Wurzel.
    pub fn relativ(&self, absolut: &Path) -> Option<String> {
        let rest = absolut.strip_prefix(&self.pfad).ok()?;
        let mut teile = Vec::new();
        for c in rest.components() {
            match c {
                Component::Normal(t) => teile.push(t.to_str()?.to_string()),
                _ => return None,
            }
        }
        if teile.is_empty() {
            None
        } else {
            Some(teile.join("/"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn normalisieren_erlaubt_relative_pfade() {
        assert_eq!(
            normalisieren("manuskript/lotte.md").unwrap(),
            "manuskript/lotte.md"
        );
        assert_eq!(
            normalisieren("./plan//kapitel/x.md").unwrap(),
            "plan/kapitel/x.md"
        );
        assert_eq!(
            normalisieren(".versionen/a/b.md").unwrap(),
            ".versionen/a/b.md"
        );
        assert_eq!(
            normalisieren("manuskript\\lotte.md").unwrap(),
            "manuskript/lotte.md"
        );
        assert_eq!(normalisieren("").unwrap(), "");
        assert_eq!(
            normalisieren("Überraschung ä.md").unwrap(),
            "Überraschung ä.md"
        );
    }

    #[test]
    fn normalisieren_lehnt_ab() {
        for p in [
            "/etc/passwd",
            "../geheim.md",
            "manuskript/../../x",
            "a/..",
            "..\\x",
            "C:\\Windows",
            "c:/x",
            "~/x",
            "a\0b",
        ] {
            assert!(
                normalisieren(p).is_err(),
                "{p} hätte abgelehnt werden müssen"
            );
        }
    }

    #[test]
    fn aufloesen_bleibt_in_der_wurzel() {
        let tmp = tempfile::tempdir().unwrap();
        let w = Wurzel::neu(tmp.path()).unwrap();
        let p = w.aufloesen("manuskript/neu.md", false).unwrap();
        assert!(p.starts_with(w.pfad()));
        assert!(w.aufloesen("", false).is_err());
        assert_eq!(w.aufloesen("", true).unwrap(), w.pfad());
        assert!(w.aufloesen("../x", false).is_err());
        assert!(w.aufloesen("/tmp/x", false).is_err());
    }

    #[test]
    fn symlink_nach_aussen_wird_abgelehnt() {
        let projekt = tempfile::tempdir().unwrap();
        let aussen = tempfile::tempdir().unwrap();
        std::fs::write(aussen.path().join("geheim.txt"), "x").unwrap();
        symlink(aussen.path(), projekt.path().join("ausgang")).unwrap();
        symlink(
            aussen.path().join("geheim.txt"),
            projekt.path().join("datei.md"),
        )
        .unwrap();
        let w = Wurzel::neu(projekt.path()).unwrap();
        assert!(w.aufloesen("ausgang/geheim.txt", false).is_err());
        assert!(w.aufloesen("ausgang/neu/x.md", false).is_err());
        assert!(w.aufloesen("ausgang", true).is_err());
        assert!(w.aufloesen("datei.md", false).is_err());
    }

    #[test]
    fn symlink_innerhalb_ist_erlaubt() {
        let projekt = tempfile::tempdir().unwrap();
        std::fs::create_dir(projekt.path().join("echt")).unwrap();
        symlink(projekt.path().join("echt"), projekt.path().join("alias")).unwrap();
        let w = Wurzel::neu(projekt.path()).unwrap();
        assert!(w.aufloesen("alias/x.md", false).is_ok());
    }

    #[test]
    fn symlink_als_wurzel_wird_aufgeloest() {
        let echt = tempfile::tempdir().unwrap();
        let links = tempfile::tempdir().unwrap();
        let verweis = links.path().join("projekt");
        symlink(echt.path(), &verweis).unwrap();
        let w = Wurzel::neu(&verweis).unwrap();
        assert_eq!(w.pfad(), echt.path().canonicalize().unwrap());
    }

    #[test]
    fn wurzel_muss_ordner_und_absolut_sein() {
        let tmp = tempfile::tempdir().unwrap();
        let datei = tmp.path().join("x.md");
        std::fs::write(&datei, "").unwrap();
        assert!(Wurzel::neu(&datei).is_err());
        assert!(Wurzel::neu(Path::new("relativ")).is_err());
        assert!(Wurzel::neu(Path::new("/")).is_err());
        assert!(Wurzel::neu(&tmp.path().join("fehlt")).is_err());
    }

    #[test]
    fn relativ_zur_wurzel() {
        let tmp = tempfile::tempdir().unwrap();
        let w = Wurzel::neu(tmp.path()).unwrap();
        assert_eq!(
            w.relativ(&w.pfad().join("manuskript").join("a.md"))
                .as_deref(),
            Some("manuskript/a.md")
        );
        assert_eq!(w.relativ(w.pfad()), None);
        assert_eq!(w.relativ(Path::new("/etc/hosts")), None);
    }
}
