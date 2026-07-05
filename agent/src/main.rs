// GUI subsystem on Windows → no console window ever appears.
#![cfg_attr(windows, windows_subsystem = "windows")]

//! Payload companion agent. Runs as the logged-in reviewer inside their VM and
//! drains a local spool of user-session customization tasks (wallpaper,
//! in-session scripts) that Payload dropped in via the Proxmox guest agent.
//! See protocol.rs for the on-disk contract.

mod log;
mod protocol;
mod spool;
mod tasks;

use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

const POLL_INTERVAL: Duration = Duration::from_millis(1000);

fn main() {
    let spool = spool_dir();
    let _ = std::fs::create_dir_all(&spool);

    let log_path = spool.parent().unwrap_or(&spool).join("agent.log");
    log::init(log_path);
    log::line(&format!("payload-agent started, spool={}", spool.display()));

    loop {
        spool::drain(&spool);
        sleep(POLL_INTERVAL);
    }
}

#[cfg(windows)]
fn spool_dir() -> PathBuf {
    let base = std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    base.join("payload").join("spool")
}

#[cfg(unix)]
fn spool_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/home/shipwrights"));
    home.join(".payload").join("spool")
}
