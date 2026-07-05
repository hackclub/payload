//! Append-only file log. GUI-subsystem on Windows and a daemon on Linux, so
//! stdout goes nowhere useful — we log next to the spool. Best-effort.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub fn init(path: PathBuf) {
    let _ = LOG_PATH.set(path);
}

pub fn line(msg: &str) {
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{msg}");
        }
    }
}
